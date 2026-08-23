/**
 * `apply` and the other eighteen typography readings (v0.7.3 plan, phase 5 —
 * "The rewriter").
 *
 * Phase 4 taught `assess` to see a `letter-spacing`, a `text-transform` and a
 * `text-decoration-line` in somebody's stylesheet. This file asserts what phase 5
 * is for: that seeing them is turned into a *plan*, and that the plan obeys every
 * rule `apply` already obeys for a colour or a length.
 *
 * Three things are being checked, and they are different in kind.
 *
 * The first is **derivation**. One criterion per raw reading literal the design
 * system can resolve to a token, naming the file, the literal and the token — and
 * nothing at all for a literal no token records, however confidently `assess`
 * proposed a name for it. A proposal is not a token, and `apply` never invents.
 *
 * The second is **execution**. A reading criterion has to survive the round trip
 * through `.phyllum/PRD.md` and come back out readable by `apply run`: the phase
 * grouping, the property read back out of the `check` sentence, the route it is
 * classified onto, and the verification that reads the file rather than trusting
 * an agent's word.
 *
 * The third is **what phase 5 must not have touched**. `alreadyAdopted` is the one
 * predicate behind both the adoption plan and the `applied:` flag, and widening
 * the typography pass must leave it reading a component on exactly the evidence
 * it read one on before — otherwise a plan and a flag could disagree about the
 * same component.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { assess } from '../../lib/assess.js';
import { classifyCriterion, propertiesFrom } from '../../lib/apply-mechanical.js';
import { verifyCriterion } from '../../lib/apply-run.js';
import { adoptionSites, deriveAppliedFlags } from '../../lib/applied.js';
import { parse } from '../../lib/design-system.js';
import { detectHarness, detectTestSuite } from '../../lib/harness-detect.js';
import {
  alreadyAdopted,
  buildPrd,
  componentChanges,
  criterionFields,
  parseCriterionFields,
  parsePrd,
  readComponent,
  renderPrd,
  tokenChanges,
  typographyReadingChanges,
  withVerification,
} from '../../lib/prd.js';
import { withTempDir } from './helpers.js';

// ---------------------------------------------------------------------------
// A project whose stylesheet writes readings, some recorded and some not
// ---------------------------------------------------------------------------

/**
 * `highlight-small` records three optional readings; nothing records a
 * `word-spacing` or a `0.4em` kerning. That split is the whole point of the
 * fixture: the first three are changes, the last two are out of scope.
 */
function designSystem({ block = ['underline: true', 'kerning: 0.02em', 'text-transform: uppercase'] } = {}) {
  const lines = [
    '# Design System',
    '',
    "> Phyllum manages this file. It is the single source of truth for this project's design system.",
    '',
    '- Project: apply-typography-fixture',
    '- Phyllum version: 0.7.3',
    '- Created: 2026-08-24',
    '',
    '## Tokens',
    '',
    '### Colours',
    '',
    '| token | value | notes |',
    '| --- | --- | --- |',
    '| color-primary | #2563EB | main brand blue |',
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
  ];
  if (block.length > 0) {
    lines.push('#### highlight-small', '', '```yaml', ...block, '```', '');
  }
  lines.push(
    '## Components',
    '',
    '_No components yet. Run `phyllum create` to add one._',
    '',
    '## Backlog',
    '',
    '_Nothing outstanding._',
    '',
  );
  return lines.join('\n');
}

const STYLESHEET = [
  '.badge {',
  '  font-size: 12px;',
  '  font-weight: 700;',
  '  line-height: 1.3;',
  '  letter-spacing: 0.02em;',
  '  text-transform: uppercase;',
  '  text-decoration-line: underline;',
  '}',
  '',
  '.legal {',
  '  letter-spacing: 0.4em;',
  '}',
  '',
  // A rule block that states a font size, so `assess` can propose a name for the
  // reading on it — and `apply` still may not use that name for anything.
  '.notice {',
  '  font-size: 18px;',
  '  font-weight: 400;',
  '  line-height: 1.5;',
  '  word-spacing: 3px;',
  '}',
  '',
].join('\n');

async function project(body, { block, stylesheet = STYLESHEET } = {}) {
  return withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'apply-typography-fixture' }));
    fs.writeFileSync(path.join(dir, 'src', 'styles.css'), stylesheet);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), designSystem(block ? { block } : {}));
    const model = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
    const assessment = assess(dir, model);
    return body({ dir, model, assessment });
  });
}

function prdFor({ dir, model, assessment }) {
  return withVerification(
    buildPrd({
      root: dir,
      model,
      assessment,
      harness: detectHarness(dir, { home: '/nonexistent' }),
      tests: detectTestSuite(dir),
      version: '0.7.3',
      today: '2026-08-24',
    }),
  );
}

/** Every derived change that is about one of the eighteen optional readings. */
const readingChanges = (changes) => changes.filter((change) => change.reading);

// ---------------------------------------------------------------------------
// Derivation — one criterion per resolvable reading literal
// ---------------------------------------------------------------------------

test('every raw typography reading a token records gets its own criterion', async () => {
  await project(({ model, assessment }) => {
    const derived = tokenChanges(assessment, model);
    const readings = readingChanges(derived.changes);

    assert.deepEqual(
      readings.map((change) => change.reading).sort(),
      ['kerning', 'text-transform', 'underline'],
    );

    for (const change of readings) {
      assert.equal(change.pass, 'typography');
      assert.equal(change.section, 'typography');
      assert.equal(change.token, 'highlight-small', 'the criterion names the token it resolves to');
      assert.equal(change.file, 'src/styles.css', 'the criterion names the file the literal is in');
      assert.ok(change.literal.length > 0, 'the criterion names the literal as the file writes it');
      assert.equal(change.properties.length, 1, 'a reading sits on exactly one CSS property');
    }

    const kerning = readings.find((change) => change.reading === 'kerning');
    assert.equal(kerning.literal, '0.02em');
    assert.deepEqual(kerning.properties, ['letter-spacing']);
    assert.equal(kerning.tokenValue, '0.02em');
    assert.equal(kerning.exact, true);

    // A bare reading carries no value at all, so the token records the fact and
    // the code writes the keyword. The literal is the keyword, and the match is
    // exact by construction rather than by comparison.
    const underline = readings.find((change) => change.reading === 'underline');
    assert.equal(underline.literal, 'underline');
    assert.deepEqual(underline.properties, ['text-decoration-line']);
    assert.equal(underline.tokenValue, null);
    assert.equal(underline.exact, true);
  });
});

test('the criterion says which of the token’s readings it is about', async () => {
  await project(({ model, assessment }) => {
    const derived = tokenChanges(assessment, model);
    const kerning = readingChanges(derived.changes).find((change) => change.reading === 'kerning');
    // `becomes` keeps the grammar `apply run` parses; the reading is named in
    // the sentence a human verifies against.
    const map = Object.fromEntries(criterionFields(kerning));
    assert.equal(map.becomes, 'token `highlight-small`');
    assert.match(map.check, /every `letter-spacing` value of `0\.02em`/);
    assert.match(map.check, /the `kerning` reading of the `highlight-small` token/);
    assert.equal(map.note, undefined, 'an exact literal carries no near-identical note');
  });
});

test('a reading no token records is out of scope with a reason, never a change', async () => {
  await project(({ model, assessment }) => {
    const derived = tokenChanges(assessment, model);

    for (const change of derived.changes) {
      assert.notEqual(change.literal, '3px', 'nothing records a word-spacing, so nothing is planned for it');
      assert.notEqual(change.literal, '0.4em', 'nothing records this kerning, so nothing is planned for it');
    }

    const wordSpacing = derived.unnamed.find((row) => row.role === 'word-spacing');
    assert.ok(wordSpacing, 'the unapplied literal is listed, never dropped');
    assert.equal(wordSpacing.pass, 'typography');
    assert.deepEqual(wordSpacing.properties, ['word-spacing']);
    assert.deepEqual(wordSpacing.files, ['src/styles.css']);
    assert.match(wordSpacing.reason, /no typography token in DESIGN-SYSTEM\.md records/);
  });
});

test('a name `assess` proposes is a proposal, not a token — `apply` never applies it', async () => {
  await project(({ model, assessment }) => {
    // The `.badge` rule states a font size, so `assess` can say which type
    // decision a reading on it belongs to and proposes a name for it. That is
    // still not a recorded token, and nothing may be rewritten on its strength.
    const proposed = (assessment.values.typography.uncovered ?? []).filter((row) => row.proposal);
    assert.ok(proposed.length > 0, 'the fixture needs at least one proposed reading to make the point');

    const derived = tokenChanges(assessment, model);
    const names = new Set(derived.changes.map((change) => change.token));
    for (const row of proposed) {
      assert.equal(names.has(row.proposal.name), false, `${row.proposal.name} is proposed, not recorded`);
      const listed = derived.unnamed.find((out) => out.role === row.reading);
      assert.ok(listed, 'the proposed reading is listed out of scope instead');
      assert.match(listed.reason, /phyllum assess/);
    }
  });
});

test('the readings pass is read where `assess` keeps it, not out of the shared inventory', async () => {
  await project(({ model, assessment }) => {
    // Phase 4 deliberately kept the readings out of `values.inventory`, because
    // that array is paired positionally with `values.proposals` and a reading has
    // no size to pair with. This asserts phase 5 did not quietly merge it back.
    for (const row of assessment.values.inventory ?? []) {
      assert.equal(row.reading, undefined, 'no reading row may appear in the shared inventory');
    }
    assert.ok(assessment.values.typography.ran, 'the readings pass is its own source');

    const derived = tokenChanges(assessment, model);
    assert.equal(readingChanges(derived.changes).length, 3);

    // And an assessment with no readings pass at all derives nothing rather than
    // throwing — the shape `assess` produced before v0.7.3.
    assert.deepEqual(typographyReadingChanges({ values: {} }, model), { changes: [], unnamed: [] });
    assert.deepEqual(typographyReadingChanges(null, model), { changes: [], unnamed: [] });
  });
});

test('a token with no readings block plans no reading changes at all', async () => {
  await project(
    ({ model, assessment }) => {
      const derived = tokenChanges(assessment, model);
      assert.equal(readingChanges(derived.changes).length, 0);
      // Every sighting is still reported, with its reason — never silently gone.
      const readings = derived.unnamed.filter((row) => row.pass === 'typography' && row.role);
      assert.ok(readings.length >= 3, 'the unrecorded readings are all listed out of scope');
    },
    { block: [] },
  );
});

// ---------------------------------------------------------------------------
// The plan — one phase, one commit, and the format round trip
// ---------------------------------------------------------------------------

test('reading changes land in the Typography phase, beside the size they belong to', async () => {
  await project((context) => {
    const prd = prdFor(context);
    const typography = prd.phases.find((phase) => phase.title === 'Typography tokens');
    assert.ok(typography, 'the readings are grouped with the type phase, not a phase of their own');

    const readings = readingChanges(typography.changes);
    assert.equal(readings.length, 3);
    for (const change of readings) {
      assert.match(change.id, /^AC-\d+\.\d+$/, 'a reading change is a numbered, tickable criterion');
    }
    // One phase per kind is unchanged: no phase was invented for the readings.
    assert.deepEqual(
      prd.phases.map((phase) => phase.title),
      ['Typography tokens'],
    );
  });
});

test('a reading criterion survives the render → parse round trip', async () => {
  await project((context) => {
    const prd = prdFor(context);
    const text = renderPrd(prd);
    const back = parsePrd(text);

    const criteria = back.phases.flatMap((phase) => phase.criteria);
    const kerning = criteria.find((criterion) => criterion.fields.literal === '`0.02em`');

    assert.ok(kerning, 'the reading criterion is parseable back out of the file');
    assert.equal(kerning.fields.file, '`src/styles.css`');
    assert.equal(kerning.fields.becomes, 'token `highlight-small`');
    assert.match(kerning.fields.check, /the `kerning` reading of the `highlight-small` token/);
    assert.equal(kerning.done, false, 'the plan is written with nothing executed');

    // The out-of-scope half is in the file too, with its reason.
    assert.match(text, /word-spacing/);
  });
});

// ---------------------------------------------------------------------------
// `apply run` — the route, the property, and the file-reading verification
// ---------------------------------------------------------------------------

test('a reading criterion routes to the agent, and says why', async () => {
  await project((context) => {
    const prd = prdFor(context);
    const back = parsePrd(renderPrd(prd));
    const criterion = back.phases
      .flatMap((phase) => phase.criteria)
      .find((row) => row.fields.literal === '`0.02em`');

    const route = classifyCriterion(criterion, context.model);
    assert.equal(route.route, 'agent');
    assert.match(route.reason, /typography token/);
    assert.equal(route.plan, undefined, 'nothing is handed to the mechanical layer');
  });
});

test('the property is still readable out of the widened check sentence', async () => {
  await project((context) => {
    const prd = prdFor(context);
    const back = parsePrd(renderPrd(prd));
    const byLiteral = new Map(
      back.phases.flatMap((phase) => phase.criteria).map((row) => [row.fields.literal, row.fields]),
    );

    assert.deepEqual(propertiesFrom(byLiteral.get('`0.02em`').check), ['letter-spacing']);
    assert.deepEqual(propertiesFrom(byLiteral.get('`uppercase`').check), ['text-transform']);
    assert.deepEqual(propertiesFrom(byLiteral.get('`underline`').check), ['text-decoration-line']);
  });
});

test('a reading criterion is verified by reading the file, not by being told', async () => {
  await project((context) => {
    const prd = prdFor(context);
    const back = parsePrd(renderPrd(prd));
    const criterion = back.phases
      .flatMap((phase) => phase.criteria)
      .find((row) => row.fields.literal === '`0.02em`');

    const before = verifyCriterion(context.dir, criterion, context.model);
    assert.equal(before.satisfied, false, 'the raw letter-spacing is still there');
    assert.match(before.why, /0\.02em/);

    // The edit `apply run` would have an agent make: the raw declaration goes,
    // and the rule reads the recorded token instead.
    fs.writeFileSync(
      path.join(context.dir, 'src', 'styles.css'),
      STYLESHEET.replace('  letter-spacing: 0.02em;\n', '')
        .replace('.badge {', '.badge {\n  /* highlight-small */')
        .replace('.badge {', '.badge {'),
    );
    const after = verifyCriterion(context.dir, criterion, context.model);
    assert.equal(after.satisfied, true, 'the criterion passes only once the file says so');

    // And a file that still writes the raw literal cannot pass, whatever else
    // it says about the token.
    fs.writeFileSync(path.join(context.dir, 'src', 'styles.css'), `/* highlight-small */\n${STYLESHEET}`);
    assert.equal(verifyCriterion(context.dir, criterion, context.model).satisfied, false);
  });
});

// ---------------------------------------------------------------------------
// What phase 5 must not have moved: `alreadyAdopted`
// ---------------------------------------------------------------------------

const BUTTON_PRIMARY = [
  '### Button/Primary',
  '',
  '```yaml',
  'name: Button/Primary',
  'archetype: button',
  'properties:',
  '  background: color-primary',
  '  typography: highlight-small',
  '```',
].join('\n');

/** A design system carrying one component, so adoption has something to read. */
function withComponent() {
  return designSystem().replace('_No components yet. Run `phyllum create` to add one._', BUTTON_PRIMARY);
}

test('`alreadyAdopted` still reads identity, and only identity', async () => {
  const recorded = readComponent({
    name: 'Button/Primary',
    blocks: [{ lang: 'yaml', content: 'name: Button/Primary\narchetype: button\n' }],
  });

  assert.equal(recorded.elementName, 'ButtonPrimary');
  assert.equal(recorded.className, 'button-primary');

  // The generated element is enough on its own.
  assert.equal(alreadyAdopted({ element: 'ButtonPrimary', classes: [] }, recorded), true);
  // So is the generated class, case-insensitively.
  assert.equal(alreadyAdopted({ element: 'button', classes: ['Button-Primary'] }, recorded), true);
  // A look-alike is not an identity.
  assert.equal(alreadyAdopted({ element: 'button', classes: ['btn', 'btn--primary'] }, recorded), false);
});

test('the plan and the `applied:` flag read the same evidence, with readings in play', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'apply-typography-adoption' }));
    fs.writeFileSync(path.join(dir, 'src', 'styles.css'), STYLESHEET);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), withComponent());
    fs.writeFileSync(
      path.join(dir, 'src', 'App.jsx'),
      [
        'export function App() {',
        '  return <ButtonPrimary>Save</ButtonPrimary>;',
        '}',
        '',
      ].join('\n'),
    );

    const model = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
    const assessment = assess(dir, model);

    const flags = deriveAppliedFlags(dir, model);
    assert.equal(flags.get('Button/Primary'), true, 'the site already is the component');

    const adoption = componentChanges(dir, model, assessment);
    const planned = adoption.changes.filter((change) => change.component === 'Button/Primary');
    assert.equal(planned.length, 0, 'a site the flag calls adopted is never planned for adoption again');

    // The two answers come from one predicate, so they cannot disagree — and the
    // typography readings derived beside them do not enter this reading at all.
    const sites = adoptionSites([{ element: 'ButtonPrimary', classes: [], files: ['src/App.jsx'] }], readComponent(model.components[0]));
    assert.equal(sites.length, 1);

    const derived = tokenChanges(assessment, model);
    assert.ok(readingChanges(derived.changes).length > 0, 'the readings are still planned alongside');
  });
});
