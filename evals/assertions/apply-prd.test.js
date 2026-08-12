/**
 * `apply`'s plan engine (v0.2.0 plan §6.5.1).
 *
 * Two things are being checked here, and they are different in kind.
 *
 * The first is **derivation**: does the plan contain exactly the changes the
 * design system authorises, one criterion each, and does it say — with a reason —
 * what it is leaving alone? A plan that silently drops a literal is worse than a
 * plan that refuses one, so the exclusions are asserted as hard as the inclusions.
 *
 * The second is **the format itself**. `.phyllum/PRD.md` is a contract between
 * this milestone and the next: M7 parses the markers back out. So the round trip
 * (render -> parse -> the same marks) is asserted directly, the way the
 * DESIGN-SYSTEM.md round trip is — if it holds here it holds in M7.
 *
 * The command surface, the write confinement and the fs-diff proof live in
 * `apply-cli.test.js`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { assess } from '../../lib/assess.js';
import { detectHarness, detectTestSuite } from '../../lib/harness-detect.js';
import { parse } from '../../lib/design-system.js';
import {
  CRITERION,
  PHASE_STATUS,
  buildPhases,
  buildPrd,
  changeResumeKey,
  componentChanges,
  mergePrd,
  parseCriterionFields,
  parsePrd,
  readComponent,
  renderPrd,
  tokenChanges,
  withVerification,
} from '../../lib/prd.js';
import { FIXTURES, copyDir, withTempDir } from './helpers.js';

const CODEBASES = path.join(FIXTURES, 'codebases');

/** A design system with the tokens the react-css fixture actually uses. */
function designSystem({ components = '_No components yet. Run `phyllum create` to add one._' } = {}) {
  return [
    '# Design System',
    '',
    "> Phyllum manages this file. It is the single source of truth for this project's design system.",
    '',
    '- Project: apply-fixture',
    '- Phyllum version: 0.1.0',
    '- Created: 2026-08-12',
    '',
    '## Tokens',
    '',
    '### Colours',
    '',
    '| token | value | notes |',
    '| --- | --- | --- |',
    '| color-primary | #2563EB | main brand blue |',
    '| color-surface | #FFFFFF | page background |',
    '',
    '### Numbers',
    '',
    '| token | value | applies to |',
    '| --- | --- | --- |',
    '| rounded-md | 12px | corner radius |',
    '',
    '### Typography',
    '',
    '| token | size | weight | line-height |',
    '| --- | --- | --- | --- |',
    '| highlight-small | 12px | 700 | 1.3 |',
    '',
    '## Components',
    '',
    components,
    '',
    '## Backlog',
    '',
    '_Nothing outstanding._',
    '',
  ].join('\n');
}

const BUTTON_PRIMARY = [
  '### Button/Primary',
  '',
  '```yaml',
  'name: Button/Primary',
  'archetype: button',
  'properties:',
  '  background: color-primary',
  '  radius: rounded-md',
  '```',
].join('\n');

const BUTTON_WITH_TODO = [
  '### Button/Primary',
  '',
  '```yaml',
  'name: Button/Primary',
  'archetype: button',
  'properties:',
  '  background: color-primary',
  'states:',
  '  disabled: TODO',
  '```',
].join('\n');

/** A project on disk: a fixture codebase plus a design system. */
async function project(body, { fixture = 'react-css', components, extra = {} } = {}) {
  return withTempDir(async (dir) => {
    copyDir(path.join(CODEBASES, fixture), dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), designSystem({ components }));
    for (const [rel, contents] of Object.entries(extra)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), contents);
    }
    const model = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
    const assessment = assess(dir, model);
    return body({ dir, model, assessment });
  });
}

function prdFor({ dir, model, assessment }, { home = '/nonexistent' } = {}) {
  return withVerification(
    buildPrd({
      root: dir,
      model,
      assessment,
      harness: detectHarness(dir, { home }),
      tests: detectTestSuite(dir),
      version: '0.1.0',
      today: '2026-08-13',
    }),
  );
}

// ---------------------------------------------------------------------------
// Harness detection and its precedence
// ---------------------------------------------------------------------------

test('the project’s own agent config outranks everything Phyllum recorded', async () => {
  await withTempDir(async (dir) => {
    // All three layers present at once: the config file has to win.
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# agents\n');
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.phyllum', 'session.json'),
      JSON.stringify({ version: 1, preferences: { harness: 'cursor' } }),
    );
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'CLAUDE.md'), '# memory\n');

    const harness = detectHarness(dir, { home: dir });
    assert.equal(harness.layer, 'config');
    assert.equal(harness.config, 'AGENTS.md');
    assert.ok(harness.found);
  });
});

test('CLAUDE.md, AGENT.md and AGENTS.md are each enough on their own', async () => {
  for (const file of ['CLAUDE.md', 'AGENT.md', 'AGENTS.md']) {
    await withTempDir(async (dir) => {
      fs.writeFileSync(path.join(dir, file), '# config\n');
      const harness = detectHarness(dir, { home: '/nonexistent' });
      assert.ok(harness.found, `${file} should identify a harness`);
      assert.equal(harness.config, file);
      assert.equal(harness.layer, 'config');
    });
  }
});

test('detection is not limited to Claude Code', async () => {
  const others = {
    'GEMINI.md': 'gemini-cli',
    '.cursorrules': 'cursor',
    '.windsurfrules': 'windsurf',
    '.github/copilot-instructions.md': 'copilot',
    '.aider.conf.yml': 'aider',
  };
  for (const [file, id] of Object.entries(others)) {
    await withTempDir(async (dir) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), 'x\n');
      const harness = detectHarness(dir, { home: '/nonexistent' });
      assert.equal(harness.id, id, `${file} should be recognised`);
      assert.equal(harness.layer, 'config');
    });
  }
});

test('with no config file, the .phyllum/ preference is the next layer, then memory', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.phyllum', 'session.json'),
      JSON.stringify({ version: 1, preferences: { harness: 'claude-code' } }),
    );
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'CLAUDE.md'), '# memory\n');

    assert.equal(detectHarness(dir, { home: '/nonexistent' }).layer, 'preference');

    fs.rmSync(path.join(dir, '.phyllum'), { recursive: true, force: true });
    const memory = detectHarness(dir, { home: '/nonexistent' });
    assert.equal(memory.layer, 'memory');
    assert.equal(memory.id, 'claude-code');
  });
});

test('no harness at all is a supported answer, not a failure', async () => {
  await withTempDir(async (dir) => {
    const harness = detectHarness(dir, { home: '/nonexistent' });
    assert.equal(harness.found, false);
    assert.equal(harness.layer, 'none');
    assert.equal(harness.config, null);
  });
});

test('a corrupt .phyllum/session.json is silence, not a crash', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.phyllum', 'session.json'), '{ not json');
    assert.equal(detectHarness(dir, { home: '/nonexistent' }).found, false);
  });
});

// ---------------------------------------------------------------------------
// The host project's test suite
// ---------------------------------------------------------------------------

test('the host test suite is detected, never assumed', async () => {
  await withTempDir(async (dir) => {
    assert.equal(detectTestSuite(dir).found, false);

    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
    const found = detectTestSuite(dir);
    assert.ok(found.found);
    assert.equal(found.command, 'npm test');

    // npm's own placeholder is not a test suite.
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    );
    assert.equal(detectTestSuite(dir).found, false);
  });
});

// ---------------------------------------------------------------------------
// Derivation: one criterion per change
// ---------------------------------------------------------------------------

test('every raw-value→token replacement gets its own criterion, per file and per literal', async () => {
  await project(({ dir, model, assessment }) => {
    const { changes } = tokenChanges(assessment, model);

    // The react-css fixture writes #2563EB and #FFFFFF, both named.
    const primary = changes.find((change) => change.literal === '#2563EB');
    assert.ok(primary, 'the named brand blue must be a change');
    assert.equal(primary.token, 'color-primary');
    assert.equal(primary.file, 'src/styles.css');
    assert.equal(primary.exact, true);

    // Every change names a real file, a real literal and a token that exists.
    const tokenNames = new Set([
      ...model.tokens.colours.map((row) => row[0]),
      ...model.tokens.numbers.map((row) => row[0]),
      ...model.tokens.typography.map((row) => row[0]),
    ]);
    for (const change of changes) {
      assert.ok(fs.existsSync(path.join(dir, change.file)), `${change.file} should exist`);
      assert.ok(tokenNames.has(change.token), `${change.token} is not a recorded token`);
      const contents = fs.readFileSync(path.join(dir, change.file), 'utf8');
      assert.ok(
        contents.toLowerCase().includes(change.literal.toLowerCase()),
        `${change.literal} should actually appear in ${change.file}`,
      );
    }

    // And no two criteria describe the same replacement.
    const keys = changes.map((change) => change.key);
    assert.equal(new Set(keys).size, keys.length, 'criteria must not duplicate');
  });
});

test('a token is never repurposed across roles — 12px padding is not 12px radius', async () => {
  await project(({ model, assessment }) => {
    const { changes, unnamed } = tokenChanges(assessment, model);

    const radius = changes.find(
      (change) => change.literal === '12px' && change.token === 'rounded-md',
    );
    assert.ok(radius, 'the 12px corner radius must map to rounded-md');
    assert.ok(radius.properties.includes('border-radius'));

    // The 12px padding is the same number and a different fact, so it is out of
    // scope — with a reason that names the role rather than staying vague.
    const padding = unnamed.find((row) => row.value === '12px' && row.role === 'spacing');
    assert.ok(padding, 'the 12px spacing must be excluded, not silently mapped');
    assert.match(padding.reason, /never repurposes a token across roles/);

    // And nothing maps a spacing literal onto the radius token.
    assert.ok(
      !changes.some((change) => change.role === 'spacing' && change.token === 'rounded-md'),
      'a spacing literal must never become the radius token',
    );
  });
});

test('a near-identical literal inherits its cluster’s token, and says the value changes', async () => {
  await project(({ model, assessment }) => {
    const { changes } = tokenChanges(assessment, model);
    const drift = changes.find((change) => change.literal === '#2564EC');
    assert.ok(drift, 'drift beside a named colour is the whole point of applying');
    assert.equal(drift.token, 'color-primary');
    assert.equal(drift.exact, false);
  });

  // And the criterion says the rendered value changes, so a reviewer can refuse.
  await project((context) => {
    const text = renderPrd(prdFor(context));
    assert.match(text, /`#2564EC` is near-identical to the token's `#2563EB`, not equal/);
    assert.match(text, /the review can refuse it/);
  });
});

test('a literal no token names is out of scope with a reason, never named here', async () => {
  await project(({ model, assessment }) => {
    const { changes, unnamed } = tokenChanges(assessment, model);
    const sixteen = unnamed.find((row) => row.value === '16px');
    assert.ok(sixteen, '16px is unnamed in this design system');
    assert.match(sixteen.reason, /no token in DESIGN-SYSTEM\.md names this value/);
    assert.ok(
      !changes.some((change) => change.literal === '16px'),
      'an unnamed literal must never become a change',
    );
  });
});

test('every literal the scan found is either a change or a stated exclusion', async () => {
  await project(({ model, assessment }) => {
    const { changes, unnamed } = tokenChanges(assessment, model);
    const accounted = new Set([
      ...changes.map((change) => `${change.pass}|${change.role ?? ''}|${change.literal.toLowerCase()}`),
      ...unnamed.map((row) => `${row.pass}|${row.role ?? ''}|${String(row.value).toLowerCase()}`),
    ]);

    for (const row of assessment.values.inventory) {
      for (const member of row.members) {
        const key = `${row.pass}|${row.role ?? ''}|${String(member.value).toLowerCase()}`;
        assert.ok(accounted.has(key), `${member.value} (${row.pass}) is neither planned nor excluded`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Component adoption
// ---------------------------------------------------------------------------

test('a recorded component claims the ad-hoc markup that matches it', async () => {
  await project(
    ({ dir, model, assessment }) => {
      const result = componentChanges(dir, model, assessment);
      assert.ok(result.ran);
      const adoption = result.changes.find((change) => change.component === 'Button/Primary');
      assert.ok(adoption, 'btn btn--primary should be adopted by Button/Primary');
      assert.equal(adoption.file, 'src/Button.jsx');
      assert.match(adoption.pattern, /btn--primary/);
      assert.equal(adoption.elementName, 'ButtonPrimary');
      assert.equal(adoption.className, 'button-primary');
    },
    { components: BUTTON_PRIMARY },
  );
});

test('a component whose spec still says TODO is excluded with that as the reason', async () => {
  await project(
    ({ dir, model, assessment }) => {
      const result = componentChanges(dir, model, assessment);
      assert.equal(result.changes.length, 0, 'a TODO component is never applied');
      assert.equal(result.excluded.length, 1);
      assert.equal(result.excluded[0].component, 'Button/Primary');
      assert.match(result.excluded[0].reason, /TODO means do not generate/);
      assert.match(result.excluded[0].reason, /disabled/);
    },
    { components: BUTTON_WITH_TODO },
  );
});

test('a TODO is read as "do not generate", whatever shape it takes', () => {
  const inline = readComponent({
    name: 'Button/Primary',
    blocks: [{ lang: 'yaml', content: 'name: Button/Primary\narchetype: button\nproperties:\n  padding-top: 12px # TODO: tokenise\n' }],
  });
  assert.equal(inline.hasTodo, true);

  const slot = readComponent({
    name: 'Button/Primary',
    blocks: [{ lang: 'yaml', content: 'name: Button/Primary\narchetype: button\nstates:\n  disabled: TODO\n' }],
  });
  assert.equal(slot.hasTodo, true);
  assert.deepEqual(slot.todoSlots, ['disabled']);
});

test('adoption is React-only, and says so rather than implying nothing was found', async () => {
  await project(
    ({ dir, model, assessment }) => {
      const result = componentChanges(dir, model, assessment);
      assert.equal(result.ran, false);
      assert.equal(result.changes.length, 0);
      assert.match(result.reason, /React-only/);
    },
    { fixture: 'vue-app', components: BUTTON_PRIMARY },
  );
});

test('a variant claims only its own sites', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '18' } }));
    fs.writeFileSync(
      path.join(dir, 'src', 'Buttons.jsx'),
      [
        'export const A = () => <button className="btn btn--primary">a</button>;',
        'export const B = () => <button className="btn btn--ghost">b</button>;',
      ].join('\n'),
    );
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), designSystem({ components: BUTTON_PRIMARY }));
    const model = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
    const result = componentChanges(dir, model, assess(dir, model));

    assert.equal(result.changes.length, 1, 'only the primary site is claimed');
    assert.match(result.changes[0].pattern, /btn--primary/);
  });
});

// ---------------------------------------------------------------------------
// Phases — one phase, one commit
// ---------------------------------------------------------------------------

test('phases group by kind, tokens before components, one phase per component', () => {
  const phases = buildPhases({
    tokens: [
      { kind: 'token', pass: 'typography', file: 'a.css', literal: '12px', token: 't' },
      { kind: 'token', pass: 'colours', file: 'a.css', literal: '#111111', token: 'c' },
      { kind: 'token', pass: 'numbers', file: 'a.css', literal: '8px', token: 'n' },
    ],
    components: [
      { kind: 'component', file: 'a.jsx', pattern: 'x', component: 'Card/Basic' },
      { kind: 'component', file: 'b.jsx', pattern: 'y', component: 'Button/Primary' },
      { kind: 'component', file: 'c.jsx', pattern: 'z', component: 'Card/Basic' },
    ],
  });

  assert.deepEqual(
    phases.map((phase) => phase.title),
    ['Colour tokens', 'Number tokens', 'Typography tokens', 'Adopt Card/Basic', 'Adopt Button/Primary'],
  );
  // One phase per component, not one per site.
  assert.equal(phases[3].changes.length, 2);
  assert.equal(phases[4].changes.length, 1);
  // Numbering is contiguous, and every phase states why it is one commit.
  phases.forEach((phase, index) => {
    assert.equal(phase.number, index + 1);
    assert.ok(phase.rationale.length > 40, `phase ${phase.number} must justify its grouping`);
  });
});

test('an empty pass produces no phase at all, rather than an empty one', () => {
  const phases = buildPhases({
    tokens: [{ kind: 'token', pass: 'colours', file: 'a.css', literal: '#111111', token: 'c' }],
    components: [],
  });
  assert.equal(phases.length, 1);
  assert.equal(phases[0].title, 'Colour tokens');
});

test('criterion ids are phase-scoped and one-to-one with changes', async () => {
  await project(
    (context) => {
      const prd = prdFor(context);
      const ids = prd.phases.flatMap((phase) => phase.changes.map((change) => change.id));
      assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
      assert.equal(ids.length, prd.header.changes, 'one id per change, no more and no fewer');
      for (const phase of prd.phases) {
        phase.changes.forEach((change, index) => {
          assert.equal(change.id, `AC-${phase.number}.${index + 1}`);
        });
      }
    },
    { components: BUTTON_PRIMARY },
  );
});

// ---------------------------------------------------------------------------
// The file format — the contract M7 parses
// ---------------------------------------------------------------------------

test('the PRD ships every section and header field M7 reads', async () => {
  await project(
    (context) => {
      const text = renderPrd(prdFor(context));
      for (const heading of [
        '# Phyllum apply — PRD',
        '## Goal',
        '## Harness',
        '## Execution guarantees',
        '## Phases',
        '## Out of scope',
        '## Notes',
      ]) {
        assert.ok(text.includes(heading), `the PRD must ship ${heading}`);
      }
      for (const field of [
        '- Design system:',
        '- Harness:',
        '- Harness config:',
        '- Harness evidence:',
        '- Host test suite:',
        '- Generated:',
        '- Phyllum version:',
        '- Changes:',
        '- Phases:',
        '- Status:',
      ]) {
        assert.ok(text.includes(field), `the header must state ${field}`);
      }
      // Nothing has run, and the file says so in its first three lines.
      assert.match(text.split('\n').slice(0, 3).join('\n'), /executed none of it/);
    },
    { components: BUTTON_PRIMARY },
  );
});

test('every criterion is a checkbox carrying file, subject, replacement and check', async () => {
  await project(
    (context) => {
      const prd = prdFor(context);
      const text = renderPrd(prd);
      const lines = text.split('\n').filter((line) => CRITERION.test(line.trim()));
      assert.equal(lines.length, prd.header.changes, 'one criterion line per change');

      for (const line of lines) {
        const match = line.trim().match(CRITERION);
        const fields = parseCriterionFields(match[3]);
        assert.ok(fields.file, `${match[2]} must name a file`);
        assert.ok(fields.literal || fields.pattern, `${match[2]} must name what it replaces`);
        assert.ok(fields.becomes, `${match[2]} must say what it becomes`);
        assert.ok(fields.check, `${match[2]} must say how to check it`);
        assert.match(fields.becomes, /^(token|component) `/, 'becomes distinguishes the two kinds');
        assert.equal(match[1], ' ', 'a fresh PRD ticks nothing');
      }
    },
    { components: BUTTON_PRIMARY },
  );
});

test('every phase ships a status checkbox and a verification block', async () => {
  await project(
    (context) => {
      const prd = prdFor(context);
      const text = renderPrd(prd);
      for (const phase of prd.phases) {
        assert.ok(
          text.includes(`### Phase ${phase.number} — ${phase.title}`),
          `phase ${phase.number} heading`,
        );
        assert.ok(text.includes(`- [ ] Phase ${phase.number} complete`), 'a resume marker M7 can tick');
        assert.ok(text.includes(`#### Verification — Phase ${phase.number}`), 'a verification block');
      }
      const statuses = text.split('\n').filter((line) => PHASE_STATUS.test(line.trim()));
      assert.equal(statuses.length, prd.phases.length);
    },
    { components: BUTTON_PRIMARY },
  );
});

test('verification demands the host project’s own suite when one is detected', async () => {
  await project(
    (context) => {
      const text = renderPrd(prdFor(context));
      assert.match(text, /`npm test` is green/);
      assert.match(text, /- Host test suite: npm test/);
    },
    {
      components: BUTTON_PRIMARY,
      extra: { 'package.json': JSON.stringify({ name: 'host', scripts: { test: 'node --test' } }) },
    },
  );

  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), designSystem());
    fs.writeFileSync(path.join(dir, 'styles.css'), '.a { color: #2563EB; }\n');
    const model = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
    const text = renderPrd(
      prdFor({ dir, model, assessment: assess(dir, model) }),
    );
    assert.match(text, /No test suite was detected/);
    assert.ok(!/is green/.test(text), 'a suite that was not detected is never demanded');
  });
});

test('the PRD restates all five execution guarantees', async () => {
  await project((context) => {
    const text = renderPrd(prdFor(context));
    for (const promise of [
      /separate branch/i,
      /One phase, one commit/i,
      /Per-phase verification/i,
      /every 5 minutes/i,
      /Stop and report on failure/i,
    ]) {
      assert.match(text, promise);
    }
  });
});

test('render -> parse -> the same markers: the round trip M7 depends on', async () => {
  await project(
    (context) => {
      const prd = prdFor(context);
      const parsed = parsePrd(renderPrd(prd));

      assert.equal(parsed.phases.length, prd.phases.length);
      parsed.phases.forEach((phase, index) => {
        assert.equal(phase.number, prd.phases[index].number);
        assert.equal(phase.title, prd.phases[index].title);
        assert.equal(phase.done, false);
        assert.equal(phase.criteria.length, prd.phases[index].changes.length);
        phase.criteria.forEach((criterion, position) => {
          const change = prd.phases[index].changes[position];
          assert.equal(criterion.id, change.id);
          assert.equal(criterion.key, changeResumeKey(change));
        });
      });

      assert.equal(parsed.header.Harness, prd.header.harness);
      assert.equal(parsed.header.Status, 'not started');
      assert.equal(parsed.header.Changes, String(prd.header.changes));
    },
    { components: BUTTON_PRIMARY },
  );
});

test('a tick and a commit record survive being parsed back out', async () => {
  await project((context) => {
    const prd = prdFor(context);
    const text = renderPrd(prd)
      .replace('- [ ] **AC-1.1**', '- [x] **AC-1.1**')
      .replace('- [ ] Phase 1 complete', '- [x] Phase 1 complete\n- Commit: 9f2c1ab\n- Stopped: the suite failed');
    const parsed = parsePrd(text);
    assert.equal(parsed.phases[0].done, true);
    assert.equal(parsed.phases[0].commit, '9f2c1ab');
    assert.equal(parsed.phases[0].stopped, 'the suite failed');
    assert.equal(parsed.phases[0].criteria[0].done, true);
  });
});

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------

test('re-running refreshes the inventory and keeps the ticks', async () => {
  await project((context) => {
    const first = prdFor(context);
    const edited = parsePrd(
      renderPrd(first)
        .replace('- [ ] **AC-1.1**', '- [x] **AC-1.1**')
        .replace(/_Yours\.[^\n]*_/, 'Check the focus ring before shipping.'),
    );

    const { prd, kept } = mergePrd(prdFor(context), edited);
    assert.equal(kept.ticks, 1, 'the tick is carried');
    assert.equal(prd.phases[0].changes[0].done, true);
    assert.equal(prd.notes, 'Check the focus ring before shipping.');
    assert.equal(prd.header.status, 'in progress');
    assert.match(renderPrd(prd), /Check the focus ring before shipping\./);
  });
});

test('ticks are carried by what a criterion is about, not by its id', async () => {
  await project((context) => {
    const prd = prdFor(context);
    const change = prd.phases[0].changes[0];
    const existing = {
      header: {},
      // The same change, under a completely different id and phase number.
      phases: [
        {
          number: 9,
          title: prd.phases[0].title,
          done: false,
          commit: null,
          stopped: null,
          criteria: [{ id: 'AC-9.7', done: true, fields: {}, key: changeResumeKey(change) }],
        },
      ],
      notes: null,
    };
    const merged = mergePrd(prd, existing);
    assert.equal(merged.prd.phases[0].changes[0].done, true, 'the tick follows the change, not the number');
    assert.equal(merged.kept.ticks, 1);
  });
});

test('a tick whose change is gone is dropped, and counted', async () => {
  await project((context) => {
    const prd = prdFor(context);
    const existing = {
      header: {},
      phases: [
        {
          number: 1,
          title: prd.phases[0].title,
          done: true,
          commit: null,
          stopped: null,
          criteria: [{ id: 'AC-1.1', done: true, fields: {}, key: '`gone.css`|`#000000`|token `nope`' }],
        },
      ],
      notes: null,
    };
    const { kept } = mergePrd(prd, existing);
    assert.equal(kept.droppedTicks, 1, 'a plan must not claim credit for work it no longer contains');
  });
});

test('a completed phase marker is kept as written, and reopened only by new work', async () => {
  await project((context) => {
    const prd = prdFor(context);
    const phase = prd.phases[0];

    // Marked complete, every change still known: the marker stands, even though
    // the individual criteria were not ticked one by one.
    const verified = {
      header: {},
      phases: [
        {
          number: 1,
          title: phase.title,
          done: true,
          commit: 'abc1234',
          stopped: null,
          criteria: phase.changes.map((change) => ({
            id: change.id,
            done: false,
            fields: {},
            key: changeResumeKey(change),
          })),
        },
      ],
      notes: null,
    };
    const kept = mergePrd(prd, verified);
    assert.equal(kept.prd.phases[0].done, true, "a user's completed marker is their edit, kept");
    assert.ok(kept.prd.phases[0].extra.includes('- Commit: abc1234'));

    // Marked complete, but a change has appeared since: reopened, and it says why.
    const stale = {
      header: {},
      phases: [
        { number: 1, title: phase.title, done: true, commit: null, stopped: null, criteria: [] },
      ],
      notes: null,
    };
    const reopened = mergePrd(prd, stale);
    assert.equal(reopened.prd.phases[0].done, false);
    assert.equal(reopened.kept.reopenedPhases, 1);
    assert.ok(reopened.prd.phases[0].extra.some((line) => line.startsWith('- Reopened:')));
  });
});

test('status is derived from the phase markers, never asserted', async () => {
  await project((context) => {
    const prd = prdFor(context);
    const allDone = {
      header: {},
      phases: prd.phases.map((phase) => ({
        number: phase.number,
        title: phase.title,
        done: true,
        commit: null,
        stopped: null,
        criteria: phase.changes.map((change) => ({
          id: change.id,
          done: true,
          fields: {},
          key: changeResumeKey(change),
        })),
      })),
      notes: null,
    };
    assert.equal(mergePrd(prd, allDone).prd.header.status, 'complete');
    assert.equal(mergePrd(prd, { header: {}, phases: [], notes: null }).prd.header.status, 'not started');
  });
});

// ---------------------------------------------------------------------------
// Out of scope
// ---------------------------------------------------------------------------

test('the out-of-scope section gives a reason for every kind of exclusion', async () => {
  await project(
    (context) => {
      const text = renderPrd(prdFor(context));
      for (const heading of [
        '### Values no token names yet',
        '### Values seen but not read',
        '### Components with an unfilled spec',
        '### Patterns the design system has never been told about',
        '### Always out of scope',
      ]) {
        assert.ok(text.includes(heading), `out of scope must cover ${heading}`);
      }
      assert.match(text, /Button\/Primary` — its recorded spec still has/);
      assert.match(text, /it never invents a\n  token/);
    },
    { components: BUTTON_WITH_TODO },
  );
});

test('an unrecorded pattern is named as out of scope, pointing at `create`', async () => {
  await project(
    (context) => {
      const prd = prdFor(context);
      assert.ok(prd.outOfScope.unrecordedPatterns.length > 0, 'the chip pattern is unrecorded');
      assert.match(renderPrd(prd), /`phyllum create` records it first/);
    },
    { fixture: 'repeated-jsx' },
  );
});
