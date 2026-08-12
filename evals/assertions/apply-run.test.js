/**
 * `apply run`'s machinery, unit by unit (v0.2.0 plan §6.5.2, §6.5.3).
 *
 * The end-to-end proof — a real repository, real commits, the whole project
 * directory diffed around the run — lives in `apply-e2e.test.js`. This file
 * checks the parts that have to be right *before* any of that is trustworthy:
 *
 *   - **the config file**, because it decides which models drive somebody's code;
 *   - **the mechanical/agent split**, because the report's honesty depends on it;
 *   - **the substitution engine**, because it is what edits the file;
 *   - **the PRD mark-up**, because a run's memory of itself lives in that file;
 *   - **verification**, because a criterion is done only when the file says so;
 *   - **the five-minute cadence**, on an injected clock rather than a real wait.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_ORCHESTRATOR_MODEL,
  DEFAULT_STATUS_INTERVAL_MS,
  readApplyConfig,
  readPreferences,
} from '../../lib/apply-config.js';
import {
  applyFile,
  classifyCriterion,
  customProperty,
  ensureCustomProperties,
  isStylesheet,
  propertiesFrom,
  rawLiteralRemains,
  readBecomes,
  replaceOnProperties,
  tokenReference,
} from '../../lib/apply-mechanical.js';
import {
  StatusReporter,
  adoptionMarkers,
  filesOfPhase,
  formatElapsed,
  renderHandOff,
  renderNoPrd,
  verifyCriterion,
} from '../../lib/apply-run.js';
import { buildOrchestratorPrompt, noModelReason, orchestrationRoute } from '../../lib/agent-cli.js';
import { detectHarness } from '../../lib/harness-detect.js';
import { runHostTests } from '../../lib/host-tests.js';
import { parse } from '../../lib/design-system.js';
import { CRITERION, PHASE_COMMIT, PHASE_STATUS, PHASE_STOPPED, parsePrd } from '../../lib/prd.js';
import {
  clearStopped,
  markPhaseComplete,
  phaseSection,
  recordCommit,
  recordStopped,
  sectionBody,
  setStatus,
  tickCriteria,
} from '../../lib/prd-marks.js';
import { FIXTURES, readFixture, withTempDir } from './helpers.js';

const DESIGN_SYSTEM = readFixture(path.join(FIXTURES, 'design-system', 'apply-target.md'));
const MODEL = parse(DESIGN_SYSTEM);

/** A criterion in the shape `parsePrd` produces, without needing a whole PRD. */
function criterion(id, fields) {
  return { id, done: false, fields, key: `${fields.file}|${fields.literal ?? fields.pattern}|${fields.becomes}` };
}

const tokenCriterion = (id, { file = '`src/styles.css`', literal, token, properties, note } = {}) =>
  criterion(id, {
    file,
    literal: `\`${literal}\``,
    becomes: `token \`${token}\``,
    check: `in ${file}, every ${properties.map((property) => `\`${property}\``).join(', ')} value of \`${literal}\` reads the \`${token}\` token instead, and no raw \`${literal}\` is left on those properties.`,
    ...(note ? { note } : {}),
  });

// ---------------------------------------------------------------------------
// The config file — which models drive somebody else's codebase
// ---------------------------------------------------------------------------

test('with no config file, the plan’s defaults drive the run', async () => {
  await withTempDir(async (dir) => {
    const config = readApplyConfig(dir);
    assert.equal(config.orchestratorModel, DEFAULT_ORCHESTRATOR_MODEL);
    assert.equal(config.agentModel, DEFAULT_AGENT_MODEL);
    assert.equal(config.statusIntervalMs, DEFAULT_STATUS_INTERVAL_MS);
    assert.equal(config.sources.orchestratorModel, 'default');
    assert.deepEqual(config.ignored, []);
  });
});

test('the defaults are the two models the plan decided on, and they are not hard-coded', () => {
  assert.equal(DEFAULT_ORCHESTRATOR_MODEL, 'claude-fable-5');
  assert.equal(DEFAULT_AGENT_MODEL, 'claude-opus-4-8');
  assert.equal(DEFAULT_STATUS_INTERVAL_MS, 5 * 60 * 1000);
});

test('`.phyllum/config.json` overrides both models and the cadence', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.phyllum', 'config.json'),
      JSON.stringify({
        preferences: { harness: 'cursor' },
        apply: { orchestratorModel: 'claude-opus-5', agentModel: 'claude-sonnet-5', statusIntervalMinutes: 2 },
      }),
    );

    const config = readApplyConfig(dir);
    assert.equal(config.orchestratorModel, 'claude-opus-5');
    assert.equal(config.agentModel, 'claude-sonnet-5');
    assert.equal(config.statusIntervalMs, 120_000);
    assert.equal(config.sources.agentModel, 'config');
    assert.deepEqual(config.ignored, []);

    // The same file carries the harness preference, so there is one settings file.
    assert.equal(readPreferences(dir).harness, 'cursor');
    const harness = detectHarness(dir, { home: '/nonexistent' });
    assert.equal(harness.layer, 'preference');
    assert.equal(harness.id, 'cursor');
  });
});

test('a malformed setting is ignored with a reason, never half-applied', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.phyllum', 'config.json'),
      JSON.stringify({ apply: { orchestratorModel: 42, agentModel: '', statusIntervalMinutes: -3 } }),
    );
    const config = readApplyConfig(dir);
    assert.equal(config.orchestratorModel, DEFAULT_ORCHESTRATOR_MODEL);
    assert.equal(config.agentModel, DEFAULT_AGENT_MODEL);
    assert.equal(config.statusIntervalMs, DEFAULT_STATUS_INTERVAL_MS);
    assert.equal(config.ignored.length, 3);
    assert.ok(config.ignored.every((line) => /ignored|used/.test(line)));
  });
});

test('a corrupt config file is silence, not a crash', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.phyllum', 'config.json'), '{ not json');
    const config = readApplyConfig(dir);
    assert.equal(config.orchestratorModel, DEFAULT_ORCHESTRATOR_MODEL);
    assert.equal(readPreferences(dir), null);
  });
});

test('a session.json preference still works, so nothing recorded by init is lost', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.phyllum', 'session.json'),
      JSON.stringify({ version: 1, preferences: { harness: 'claude-code' } }),
    );
    assert.equal(readPreferences(dir).harness, 'claude-code');
    assert.equal(detectHarness(dir, { home: '/nonexistent' }).id, 'claude-code');
  });
});

// ---------------------------------------------------------------------------
// The split: what Node does, and what needs a model
// ---------------------------------------------------------------------------

test('an exact literal on named properties in a stylesheet is mechanical', () => {
  const entry = classifyCriterion(
    tokenCriterion('AC-1.1', { literal: '#2563EB', token: 'color-primary', properties: ['background'] }),
    MODEL,
  );
  assert.equal(entry.route, 'mechanical');
  assert.deepEqual(entry.plan.properties, ['background']);
  assert.equal(entry.plan.reference, 'var(--color-primary)');
  assert.equal(entry.plan.token.value, '#2563EB');
});

test('the four things that need an agent each say why, per criterion', () => {
  // 1. Near-identical: the rendered value changes, so it is a judgement.
  const drift = classifyCriterion(
    tokenCriterion('AC-1.2', {
      literal: '#2564EC',
      token: 'color-primary',
      properties: ['background'],
      note: '`#2564EC` is near-identical to the token’s `#2563EB`, not equal',
    }),
    MODEL,
  );
  assert.equal(drift.route, 'agent');
  assert.match(drift.reason, /near-identical/);

  // 2. Typography: one token, three facts.
  const type = classifyCriterion(
    tokenCriterion('AC-3.1', { literal: '12px', token: 'highlight-small', properties: ['font-size'] }),
    MODEL,
  );
  assert.equal(type.route, 'agent');
  assert.match(type.reason, /size, weight and line-height/);

  // 3. Component adoption: markup has to be written.
  const adopt = classifyCriterion(
    criterion('AC-4.1', {
      file: '`src/Button.jsx`',
      pattern: '`button.btn.btn--primary`',
      becomes: 'component `Button/Primary`',
      check: 'in `src/Button.jsx`, every `button.btn.btn--primary` site renders the recorded `Button/Primary` (its element `<ButtonPrimary>` or its class `button-primary`), and its styling comes from the component’s recorded properties rather than raw values at the site.',
    }),
    MODEL,
  );
  assert.equal(adopt.route, 'agent');
  assert.match(adopt.reason, /generation, not substitution/);

  // 4. Not a stylesheet: the literal may be in markup, a script or a template.
  const jsx = classifyCriterion(
    tokenCriterion('AC-1.9', {
      file: '`src/Button.jsx`',
      literal: '#2563EB',
      token: 'color-primary',
      properties: ['background'],
    }),
    MODEL,
  );
  assert.equal(jsx.route, 'agent');
  assert.match(jsx.reason, /not a stylesheet/);
});

test('a criterion with no properties is never guessed at', () => {
  const vague = classifyCriterion(
    criterion('AC-1.5', {
      file: '`src/styles.css`',
      literal: '`#2563EB`',
      becomes: 'token `color-primary`',
      check: 'in `src/styles.css`, every affected value of `#2563EB` reads the `color-primary` token instead.',
    }),
    MODEL,
  );
  assert.equal(vague.route, 'agent');
  assert.match(vague.reason, /does not name the properties/);
  assert.deepEqual(propertiesFrom('in `a.css`, every affected value of `#fff` reads the `x` token instead.'), []);
});

test('a token the design system no longer records is never invented', () => {
  const gone = classifyCriterion(
    tokenCriterion('AC-1.6', { literal: '#123456', token: 'color-gone', properties: ['background'] }),
    MODEL,
  );
  assert.equal(gone.route, 'agent');
  assert.match(gone.reason, /no token named color-gone/);
});

test('the grammar helpers read the plan’s own spellings back out', () => {
  assert.deepEqual(readBecomes('token `color-primary`'), { kind: 'token', name: 'color-primary' });
  assert.deepEqual(readBecomes('component `Button/Primary`'), { kind: 'component', name: 'Button/Primary' });
  assert.equal(readBecomes('something else'), null);
  assert.ok(isStylesheet('src/a.scss'));
  assert.ok(!isStylesheet('src/a.tsx'));
  assert.equal(customProperty('color-primary'), '--color-primary');
  assert.equal(tokenReference('color-primary'), 'var(--color-primary)');
});

// ---------------------------------------------------------------------------
// The substitution engine
// ---------------------------------------------------------------------------

const STYLES = [
  '.btn {',
  '  padding: 12px 16px;',
  '  border-radius: 12px;',
  '  font-size: 12px;',
  '}',
  '',
  '.btn--primary {',
  '  background: #2563EB;',
  '  color: #FFFFFF;',
  '}',
  '',
].join('\n');

test('the substitution touches only the properties the criterion names', () => {
  const { text, replaced } = replaceOnProperties(STYLES, {
    literal: '12px',
    properties: ['border-radius'],
    reference: 'var(--rounded-md)',
  });
  assert.equal(replaced, 1);
  assert.match(text, /border-radius: var\(--rounded-md\);/);
  // The same literal on other properties is a different fact, and is left alone.
  assert.match(text, /padding: 12px 16px;/);
  assert.match(text, /font-size: 12px;/);
});

test('a literal inside a longer value is replaced without eating its neighbours', () => {
  const { text, replaced } = replaceOnProperties(STYLES, {
    literal: '12px',
    properties: ['padding'],
    reference: 'var(--space-3)',
  });
  assert.equal(replaced, 1);
  assert.match(text, /padding: var\(--space-3\) 16px;/);
});

test('a hex literal matches however it is cased, and is not matched half-way', () => {
  const source = '.a { background: #2563eb; border: 1px solid #2563EBCC; }';
  const { text, replaced } = replaceOnProperties(source, {
    literal: '#2563EB',
    properties: ['background'],
    reference: 'var(--color-primary)',
  });
  assert.equal(replaced, 1);
  assert.match(text, /background: var\(--color-primary\);/);
  assert.match(text, /#2563EBCC/, 'a longer literal that merely starts the same is untouched');
});

test('the tokens a file now references are declared in that same file', () => {
  const { text, declared } = ensureCustomProperties('.a { color: var(--color-surface); }', [
    { name: 'color-surface', value: '#FFFFFF' },
  ]);
  assert.deepEqual(declared, ['color-surface']);
  assert.match(text, /:root \{/);
  assert.match(text, /--color-surface: #FFFFFF;/);
  assert.match(text, /phyllum: tokens from DESIGN-SYSTEM\.md/);

  // An existing :root gains the line rather than a second block appearing.
  const again = ensureCustomProperties(text, [{ name: 'color-primary', value: '#2563EB' }]);
  assert.equal(again.text.match(/:root \{/g).length, 1);
  assert.match(again.text, /--color-primary: #2563EB;/);

  // And a token already declared is left exactly as the user wrote it.
  const third = ensureCustomProperties(again.text, [{ name: 'color-primary', value: '#000000' }]);
  assert.deepEqual(third.declared, []);
  assert.match(third.text, /--color-primary: #2563EB;/);
});

test('one pass per file: every criterion reports whether it is satisfied', () => {
  const entries = [
    { id: 'AC-1.1', plan: { file: 'src/styles.css', literal: '#2563EB', properties: ['background'], reference: 'var(--color-primary)', token: { name: 'color-primary', value: '#2563EB' } } },
    { id: 'AC-1.3', plan: { file: 'src/styles.css', literal: '#FFFFFF', properties: ['color'], reference: 'var(--color-surface)', token: { name: 'color-surface', value: '#FFFFFF' } } },
  ];
  const applied = applyFile(STYLES, entries);
  assert.deepEqual(applied.results.map((result) => result.satisfied), [true, true]);
  assert.deepEqual(applied.declared.sort(), ['color-primary', 'color-surface']);
  assert.ok(!rawLiteralRemains(applied.text, { literal: '#2563EB', properties: ['background'] }));
  assert.ok(!rawLiteralRemains(applied.text, { literal: '#FFFFFF', properties: ['color'] }));
});

test('a criterion whose literal is not in the file is reported, not assumed done', () => {
  const applied = applyFile('.a { background: #000000; }', [
    { id: 'AC-1.1', plan: { file: 'a.css', literal: '#2563EB', properties: ['background'], reference: 'var(--color-primary)', token: { name: 'color-primary', value: '#2563EB' } } },
  ]);
  assert.equal(applied.results[0].replaced, 0);
  assert.equal(applied.results[0].satisfied, false);
  assert.match(applied.results[0].why, /does not appear/);
});

// ---------------------------------------------------------------------------
// Verification — a tick means the file says so
// ---------------------------------------------------------------------------

test('verification reads the file, and says which of three answers it got', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    const target = path.join(dir, 'src', 'styles.css');

    // Not done yet.
    fs.writeFileSync(target, STYLES);
    const pending = verifyCriterion(
      dir,
      tokenCriterion('AC-1.1', { literal: '#2563EB', token: 'color-primary', properties: ['background'] }),
      MODEL,
    );
    assert.equal(pending.satisfied, false);
    assert.match(pending.why, /raw #2563EB is still on background/);

    // Done.
    fs.writeFileSync(target, STYLES.replace('#2563EB', 'var(--color-primary)'));
    const done = verifyCriterion(
      dir,
      tokenCriterion('AC-1.1', { literal: '#2563EB', token: 'color-primary', properties: ['background'] }),
      MODEL,
    );
    assert.equal(done.satisfied, true);

    // Cannot tell — neither pass nor fail, which is what stops a phase rather
    // than ticking a box on somebody's word.
    const unknowable = verifyCriterion(
      dir,
      criterion('AC-9.1', {
        file: '`src/styles.css`',
        literal: '`#2563EB`',
        becomes: 'token `color-primary`',
        check: 'in `src/styles.css`, every affected value of `#2563EB` reads the `color-primary` token instead.',
      }),
      MODEL,
    );
    assert.equal(unknowable.satisfied, null);
    // Saying "cannot tell" is not enough — the sentence stops a phase, so it has
    // to hand over the check the user is now doing by hand (v0.2.0 M8).
    assert.match(unknowable.why, /without naming the properties/);
    assert.match(unknowable.why, /open `src\/styles\.css`/);
    assert.match(unknowable.why, /#2563EB/, 'the literal to search for');
    assert.match(unknowable.why, /var\(--color-primary\)/, 'and what it should read instead');
  });
});

test('every way verification runs out of grip names the hand-check to do instead', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'styles.css'), STYLES);
    fs.writeFileSync(path.join(dir, 'src', 'Button.jsx'), 'export const Button = () => <button />;\n');

    // Not a stylesheet: the literal may be in markup, a script or a template.
    const markup = verifyCriterion(
      dir,
      criterion('AC-9.1', {
        file: '`src/Button.jsx`',
        literal: '`#2563EB`',
        becomes: 'token `color-primary`',
        check: 'in `src/Button.jsx`, every `background` value of `#2563EB` reads the `color-primary` token instead.',
      }),
      MODEL,
    );
    assert.equal(markup.satisfied, null);
    assert.match(markup.why, /is not a stylesheet/);
    assert.match(markup.why, /markup, a script or a template/);
    assert.match(markup.why, /open `src\/Button\.jsx`/, 'and it says where to look');
    assert.match(markup.why, /var\(--color-primary\)/);

    // No literal at all: there is nothing to search the file for.
    const noLiteral = verifyCriterion(
      dir,
      criterion('AC-9.2', {
        file: '`src/styles.css`',
        literal: '``',
        becomes: 'token `color-primary`',
        check: 'in `src/styles.css`, every `background` value of `` reads the `color-primary` token instead.',
      }),
      MODEL,
    );
    assert.equal(noLiteral.satisfied, null);
    assert.match(noLiteral.why, /names no literal to look for/);
    assert.match(noLiteral.why, /var\(--color-primary\)/);

    // Every sentence is a sentence: no doubled-up "cannot verify by reading the
    // file — cannot check this by reading the file".
    for (const result of [markup, noLiteral]) {
      assert.ok(
        !/cannot check this one by reading the file/.test(result.why),
        'the reason must not repeat the sentence that introduces it',
      );
    }
  });
});

test('an adoption criterion is verified against the element or class its check names', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    const adoption = criterion('AC-4.1', {
      file: '`src/Button.jsx`',
      pattern: '`button.btn.btn--primary`',
      becomes: 'component `Button/Primary`',
      check: 'in `src/Button.jsx`, every `button.btn.btn--primary` site renders the recorded `Button/Primary` (its element `<ButtonPrimary>` or its class `button-primary`), and its styling comes from the component’s recorded properties rather than raw values at the site.',
    });
    assert.deepEqual(adoptionMarkers(adoption.fields.check), {
      element: 'ButtonPrimary',
      className: 'button-primary',
    });

    fs.writeFileSync(path.join(dir, 'src', 'Button.jsx'), 'export const A = () => <button className="btn btn--primary" />;');
    assert.equal(verifyCriterion(dir, adoption, MODEL).satisfied, false);

    fs.writeFileSync(path.join(dir, 'src', 'Button.jsx'), 'export const A = () => <ButtonPrimary />;');
    assert.equal(verifyCriterion(dir, adoption, MODEL).satisfied, true);
  });
});

test('a missing file fails verification rather than passing quietly', async () => {
  await withTempDir(async (dir) => {
    const check = verifyCriterion(
      dir,
      tokenCriterion('AC-1.1', { literal: '#2563EB', token: 'color-primary', properties: ['background'] }),
      MODEL,
    );
    assert.equal(check.satisfied, false);
    assert.match(check.why, /does not exist/);
  });
});

// ---------------------------------------------------------------------------
// The PRD's marks — a run's memory of itself
// ---------------------------------------------------------------------------

const PRD = [
  '# Phyllum apply — PRD',
  '',
  '- Design system: DESIGN-SYSTEM.md',
  '- Status: not started',
  '',
  '## Execution guarantees',
  '',
  '1. **A separate branch, always.**',
  '2. **One phase, one commit.**',
  '',
  '## Phases',
  '',
  '### Phase 1 — Colour tokens',
  '',
  '- [ ] Phase 1 complete',
  '',
  'Colours lead because a named colour is the same colour.',
  '',
  '- [ ] **AC-1.1** · file: `src/styles.css` · literal: `#2563EB` · becomes: token `color-primary` · check: something',
  '- [ ] **AC-1.2** · file: `src/styles.css` · literal: `#FFFFFF` · becomes: token `color-surface` · check: something',
  '',
  '#### Verification — Phase 1',
  '',
  '- Every criterion is ticked.',
  '',
  '### Phase 2 — Number tokens',
  '',
  '- [ ] Phase 2 complete',
  '',
  'Lengths next.',
  '',
  '- [ ] **AC-2.1** · file: `src/styles.css` · literal: `12px` · becomes: token `rounded-md` · check: something',
  '',
  '## Notes',
  '',
  'My own note, which nothing may rewrite.',
  '',
].join('\n');

test('marking the plan up changes marks and nothing else', () => {
  let text = tickCriteria(PRD, ['AC-1.1', 'AC-1.2']);
  text = markPhaseComplete(text, 1);
  text = recordCommit(text, 1, '9f2c1ab');
  text = setStatus(text, 'in progress');

  const parsed = parsePrd(text);
  assert.equal(parsed.header.Status, 'in progress');
  assert.equal(parsed.phases[0].done, true);
  assert.equal(parsed.phases[0].commit, '9f2c1ab');
  assert.deepEqual(parsed.phases[0].criteria.map((entry) => entry.done), [true, true]);

  // Phase 2 is untouched, and so is the user's section.
  assert.equal(parsed.phases[1].done, false);
  assert.equal(parsed.phases[1].criteria[0].done, false);
  assert.equal(parsed.notes, 'My own note, which nothing may rewrite.');
  assert.match(text, /Colours lead because a named colour is the same colour\./);
  assert.equal(text.split('\n').length, PRD.split('\n').length + 1, 'one line added: the commit record');
});

test('a stop record lands on the phase, and is replaced rather than duplicated', () => {
  let text = recordStopped(PRD, 2, 'the suite is not green');
  text = recordStopped(text, 2, 'the suite is still not green');
  const stopped = text.split('\n').filter((line) => PHASE_STOPPED.test(line.trim()));
  assert.equal(stopped.length, 1);
  assert.match(stopped[0], /still not green/);
  assert.equal(parsePrd(text).phases[1].stopped, 'the suite is still not green');

  // Resuming clears it, because a phase that passed did not stop.
  const cleared = clearStopped(text, 2);
  assert.equal(parsePrd(cleared).phases[1].stopped, null);
});

test('a multi-line reason is flattened, so the marker stays one line', () => {
  const text = recordStopped(PRD, 1, 'first line\nsecond line');
  const stopped = text.split('\n').filter((line) => PHASE_STOPPED.test(line.trim()));
  assert.equal(stopped.length, 1);
  assert.match(stopped[0], /first line second line/);
});

test('the markers written are the markers `apply` defined — one definition, not two', () => {
  const text = recordCommit(markPhaseComplete(tickCriteria(PRD, ['AC-1.1']), 1), 1, 'abc1234');
  const lines = text.split('\n').map((line) => line.trim());
  assert.ok(lines.some((line) => PHASE_STATUS.test(line) && /\[x\]/.test(line)));
  assert.ok(lines.some((line) => PHASE_COMMIT.test(line)));
  assert.ok(lines.some((line) => CRITERION.test(line) && /\[x\]/.test(line)));
});

test('a phase’s own section, and the guarantees, come out verbatim for the prompt', () => {
  const section = phaseSection(PRD, 1);
  assert.match(section, /^### Phase 1 — Colour tokens/);
  assert.match(section, /AC-1\.2/);
  assert.ok(!section.includes('Phase 2'), 'and it stops where the next phase starts');
  assert.ok(section.includes('#### Verification — Phase 1'), 'the verification block belongs to the phase');

  const guarantees = sectionBody(PRD, '## Execution guarantees');
  assert.match(guarantees, /A separate branch, always/);
  assert.ok(!guarantees.includes('## Phases'));
});

// ---------------------------------------------------------------------------
// The orchestrator prompt
// ---------------------------------------------------------------------------

test('the orchestrator prompt is the phase verbatim, plus constraints', () => {
  const prompt = buildOrchestratorPrompt({
    phaseSection: phaseSection(PRD, 1),
    guarantees: sectionBody(PRD, '## Execution guarantees'),
    branch: 'phyllum/apply-2026-08-13',
    files: ['src/styles.css'],
    agentModel: DEFAULT_AGENT_MODEL,
    testCommand: '`npm test`',
  });

  assert.ok(prompt.includes(phaseSection(PRD, 1)), 'the phase is copied, not paraphrased');
  assert.ok(prompt.includes('A separate branch, always'), 'and so are the guarantees');
  assert.match(prompt, /Spawn at most one agent, on claude-opus-4-8/);
  assert.match(prompt, /Edit only these files: `src\/styles\.css`/);
  assert.match(prompt, /do not commit — Phyllum makes the commit/);
  assert.match(prompt, /Do not invent a token, a name, or a component spec/);
  assert.match(prompt, /`npm test` must still be green/);
});

test('with no test suite, the prompt says the criteria are the whole bar', () => {
  const prompt = buildOrchestratorPrompt({
    phaseSection: 'x',
    guarantees: 'y',
    branch: 'phyllum/apply-2026-08-13',
    files: [],
    agentModel: DEFAULT_AGENT_MODEL,
    testCommand: null,
  });
  assert.match(prompt, /no host test suite here, so the criteria above are the whole bar/);
});

test('with no route to a model, the stop reason names the model it needed', () => {
  assert.equal(orchestrationRoute({ PATH: '' }), 'none');
  assert.equal(orchestrationRoute({ CLAUDECODE: '1' }), 'session');
  const reason = noModelReason({ orchestratorModel: DEFAULT_ORCHESTRATOR_MODEL, agentModel: DEFAULT_AGENT_MODEL });
  assert.match(reason, /needs claude-opus-4-8 via the `claude` CLI/);
  assert.match(reason, /this phase was not attempted/);
});

// ---------------------------------------------------------------------------
// The host suite, and the five-minute cadence
// ---------------------------------------------------------------------------

test('an undetected suite is not a failure, and an unrunnable one is not either', async () => {
  await withTempDir(async (dir) => {
    const none = runHostTests(dir, { found: false });
    assert.equal(none.ran, false);
    assert.equal(none.ok, true);
    assert.match(none.why, /no test suite was detected/);

    // A command outside the run funnel's allowlist is reported, never run.
    const foreign = runHostTests(dir, { found: true, command: 'make check', evidence: 'a Makefile' });
    assert.equal(foreign.ran, false);
    assert.equal(foreign.ok, true);
    assert.match(foreign.why, /not one of the test runners Phyllum will start/);
  });
});

test('the status cadence is a wall clock, and the clock is injectable', () => {
  // A clock that advances two minutes per read: reports are due every five.
  let ticks = 0;
  const now = () => {
    ticks += 1;
    return ticks * 120_000;
  };
  const emitted = [];
  const reporter = new StatusReporter({
    now,
    emit: (line) => emitted.push(line),
    intervalMs: DEFAULT_STATUS_INTERVAL_MS,
    totalPhases: 3,
  });

  reporter.phase({ number: 2, title: 'Number tokens', criteria: [{ done: false }, { done: false }, { done: true }] });
  for (let i = 0; i < 6; i += 1) reporter.criterion();

  assert.ok(emitted.length >= 2, 'the cadence fires more than once over twelve minutes');
  assert.ok(emitted.length <= 4, 'and not once per checkpoint');
  assert.match(emitted[0], /Phase 2 of 3 — Number tokens/);
  assert.match(emitted[0], /criteria/);
  assert.match(emitted[0], /elapsed \d+m\d\ds/);
  assert.equal(emitted.length, reporter.reports.length);
});

test('a run shorter than the interval emits no interim report at all', () => {
  const emitted = [];
  let at = 0;
  const reporter = new StatusReporter({
    now: () => (at += 1000),
    emit: (line) => emitted.push(line),
    intervalMs: DEFAULT_STATUS_INTERVAL_MS,
    totalPhases: 1,
  });
  reporter.phase({ number: 1, title: 'Colour tokens', criteria: [{ done: false }] });
  reporter.criterion();
  assert.deepEqual(emitted, []);
});

test('elapsed time reads as minutes and seconds', () => {
  assert.equal(formatElapsed(0), '0m00s');
  assert.equal(formatElapsed(65_000), '1m05s');
  assert.equal(formatElapsed(5 * 60 * 1000), '5m00s');
});

// ---------------------------------------------------------------------------
// Refusals and the hand-off, as text
// ---------------------------------------------------------------------------

test('with no plan, `apply run` points at the command that writes one', () => {
  const out = renderNoPrd();
  assert.match(out, /there is no plan for `apply run` to execute/);
  assert.match(out, /`phyllum apply` first/);
});

test('the hand-off names the harness, the file, and what to tell it', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# project instructions\n');
    const harness = detectHarness(dir, { home: '/nonexistent' });
    const out = renderHandOff(harness, {
      models: { orchestratorModel: DEFAULT_ORCHESTRATOR_MODEL, agentModel: DEFAULT_AGENT_MODEL },
      tests: { found: true, command: 'npm test' },
    });
    assert.match(out, /This project uses Claude Code/);
    assert.match(out, /\.phyllum\/PRD\.md/);
    assert.match(out, /Work on a new branch — never the branch I am standing on/);
    assert.match(out, /Land each phase as its own commit/);
    assert.match(out, /`npm test` is green/);
    assert.match(out, /Nothing was executed and nothing was written/);
    assert.match(out, /claude-fable-5 orchestrating claude-opus-4-8/);
  });
});

test('a phase’s file list is exactly what its criteria name', () => {
  const phase = parsePrd(PRD).phases[0];
  assert.deepEqual(filesOfPhase(phase), ['src/styles.css']);
});
