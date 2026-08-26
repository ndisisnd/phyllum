/**
 * Assertions for `refine ship` (v0.11.0 phase 5).
 *
 * The gate's seventh section, and the one that turns six readings into one
 * answer. Which makes every promise here a promise about *not* softening:
 *
 *   - **The bar is the table.** `phyllum:ship-checks` names the six criteria and
 *     the section each one reads. A criterion dropped from the code while the
 *     reference still listed it would ship a component on five checks and call
 *     it six, so the count, the names and the order are all asserted against the
 *     reference rather than against a list written here.
 *   - **The verdict is a conjunction.** Six pass, or not shippable. Five of six
 *     is not eighty-three per cent and it is not "nearly there"; it is a
 *     component with an open criterion, and the verdict names which one.
 *   - **`unmet` never ships.** "The linter found an error" and "no linter is
 *     configured" are different facts, and the second one is not a pass. The
 *     rule is read from `phyllum:ship-statuses`, where somebody can see it.
 *   - **The docs criterion reads Governance's entry, and reports all three
 *     answers.** No entry is unmet — the one the protocol names when it says a
 *     criterion that passes by absence is a criterion nobody checked. An entry
 *     with a part still `TODO` is a fail naming the part, because a stated gap
 *     is honest and is still a gap. Only a complete five-part entry passes, and
 *     the reading is `lib/govern-docs.js`'s so there is one parser, not two.
 *   - **A deprecated component is never shippable.** Not as a seventh criterion
 *     — the six are still read and still reported — but as the conjunction on
 *     top, and the verdict names the replacement to ship instead.
 *   - **Nothing is written.** Not a report, not `DESIGN-SYSTEM.md`. A stale yes
 *     is worse than no yes, so there is nowhere for one to be recorded.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse } from '../../lib/design-system.js';
import { parseEntry, renderEntry, writeDocs } from '../../lib/govern-docs.js';
import { componentShip, criteria, docsKey, refineShip } from '../../lib/refine-ship.js';
import { setComponentDeprecation } from '../../lib/refine-deprecate.js';
import {
  SHIP_FAIL,
  SHIP_PASS,
  SHIP_UNMET,
  shipCheckFor,
  shipChecks,
  shipStatusShips,
  shipStatuses,
} from '../../lib/refine-spec.js';
import { DESIGN_SYSTEM_FILE } from '../../lib/write.js';
import { diffSnapshots, snapshotContents, withTempDir } from './helpers.js';

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

function designSystem(components) {
  return [
    '# Design System',
    '',
    "> Phyllum manages this file. It is the single source of truth for this project's design system.",
    '',
    '- Project: refine-ship',
    '- Phyllum version: 0.10.0',
    '- Created: 2026-08-25',
    '',
    '## Tokens',
    '',
    '### Colours',
    '',
    '| token | value |',
    '| --- | --- |',
    '| surface-default | #FFFFFF |',
    '| text-strong | #767676 |',
    '| ink-deep | #111827 |',
    '',
    '### Numbers',
    '',
    '| token | value | applies to |',
    '| --- | --- | --- |',
    '| radius-sm | 4px | radius |',
    '',
    '### Typography',
    '',
    '| token | size | weight | line-height |',
    '| --- | --- | --- | --- |',
    '| type-body | 16px | 400 | 1.5 |',
    '',
    '## Components',
    '',
    ...components.flatMap(({ name, spec }) => [`### ${name}`, '', '```yaml', ...spec, '```', '']),
    '## Backlog',
    '',
    '_Nothing outstanding._',
    '',
  ].join('\n');
}

/** A button that clears contrast, focus and ARIA, so only the open criteria are open. */
const BUTTON = [
  'name: Button',
  'archetype: button',
  'properties:',
  '  background: surface-default',
  '  text-colour: text-strong',
  '  border-colour: ink-deep',
  '  radius: radius-sm',
  '  typography: type-body',
  'states:',
  '  focus:',
  '    border-colour: ink-deep',
];

const BUTTON_MARKUP = 'export const Button = () => <button className="button" />;\n';

function project(dir, components = [{ name: 'Button', spec: BUTTON }], files = {}) {
  const text = designSystem(components);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), text);
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'sample', dependencies: { react: '^18.0.0' } }),
  );
  for (const [rel, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), contents);
  }
  return { text, model: parse(text) };
}

/** A five-part entry with nothing left open — what `govern docs` writes when it is told everything. */
const COMPLETE_DOCS = {
  'what-it-is': 'The button this design system records.',
  'how-to-use': 'Set `label`; the slots come from the spec block.',
  'where-to-use': 'Wherever a press commits something.',
  'in-the-codebase': 'src/Button.jsx line 1.',
  'do-not': ['Do not pass a colour at the call site.'],
};

/** No linter configured — the section's own answer, handed in rather than re-run. */
const NO_LINTER = { pass: null, reason: 'no linter is configured in this project' };

const statusOf = (entry, criterion) => entry.criteria.find((row) => row.criterion === criterion).status;

/**
 * Readings that satisfy every criterion, so a case can open exactly one.
 *
 * Building the all-pass case by hand is what makes the conjunction testable:
 * with six greens on the table, one criterion turned red has to be the only
 * thing that moves the verdict.
 */
const allPass = (overrides = {}) => ({
  component: 'Button',
  spec: 'name: Button\n',
  docs: parseEntry(renderEntry('Button', COMPLETE_DOCS)),
  coverage: { ran: true, components: [] },
  coverageEntry: { component: 'Button', checked: true, pass: true, findings: [] },
  a11y: { ran: true, components: [] },
  a11yEntry: { component: 'Button', checked: true, pass: true, findings: [] },
  lint: { pass: true, reason: null },
  tests: {
    component: 'Button',
    clauses: [{ clause: 'renders', stated: true }],
    unstated: [],
    existing: ['src/Button.usage.test.js'],
    proposal: null,
  },
  deprecation: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// The bar is the table
// ---------------------------------------------------------------------------

test('the six criteria are the reference table\'s, in the order it states them', () => {
  assert.deepEqual(criteria(), [
    'contract-present',
    'coverage-clean',
    'a11y-pass',
    'lint-pass',
    'tests-exist',
    'docs-exist',
  ]);
  assert.deepEqual(
    shipChecks().map((row) => row.reads),
    ['contract', 'coverage', 'a11y', 'lint', 'tests', 'docs'],
    'every criterion reads a section that already ran',
  );
  assert.equal(shipCheckFor('nothing-declares-this'), null);
});

test('a component is reported against the table, criterion for criterion', () => {
  const result = componentShip(allPass());
  assert.deepEqual(
    result.criteria.map((row) => row.criterion),
    criteria(),
    'the report is the bar, walked in order — never a subset of it',
  );
  for (const row of result.criteria) {
    assert.equal(row.reads, shipCheckFor(row.criterion).reads);
  }
  assert.equal(docsKey(), 'docs', 'the criterion\'s own word, and not a second spelling of it');
});

test('the three answers, and which of them ships, are the table\'s decision', () => {
  assert.deepEqual(
    shipStatuses().map((row) => row.status),
    [SHIP_PASS, SHIP_FAIL, SHIP_UNMET],
  );
  assert.equal(shipStatusShips(SHIP_PASS), true);
  assert.equal(shipStatusShips(SHIP_FAIL), false);
  assert.equal(shipStatusShips(SHIP_UNMET), false, 'a criterion nobody could check is not a criterion met');
  assert.throws(() => shipStatusShips('probably'), /is not a ship status/);
});

// ---------------------------------------------------------------------------
// The verdict is a conjunction
// ---------------------------------------------------------------------------

test('six passes ship, and there is no number attached to the answer', () => {
  const result = componentShip(allPass());
  assert.equal(result.met, true);
  assert.equal(result.shippable, true);
  assert.deepEqual(result.open, []);
  assert.equal('score' in result, false, 'Phyllum has one scale already, and one is enough');
  assert.equal(result.criteria.every((row) => row.status === SHIP_PASS), true);
});

test('five of six is not eighty-three per cent — it is one open criterion, named', () => {
  const result = componentShip(allPass({ lint: { pass: false, reason: 'eslint reports findings' } }));
  assert.equal(result.met, false);
  assert.equal(result.shippable, false);
  assert.deepEqual(result.open, ['lint-pass'], 'the verdict names which one, not how many');
  assert.equal(statusOf(result, 'lint-pass'), SHIP_FAIL);
  assert.equal(statusOf(result, 'coverage-clean'), SHIP_PASS, 'the other five are still reported');
});

test('unmet never ships, whichever criterion it lands on', () => {
  for (const readings of [
    { lint: NO_LINTER },
    { coverageEntry: { component: 'Button', checked: false, reason: 'this component is not built' } },
    { a11yEntry: { component: 'Button', checked: false, reason: 'it claimed no archetype contract' } },
    { tests: null },
  ]) {
    const result = componentShip(allPass(readings));
    assert.equal(result.shippable, false);
    // A section that did not run takes every criterion reading it, and the
    // tests section is read by two of the six.
    assert.equal(result.open.length, readings.tests === null ? 2 : 1);
    for (const criterion of result.open) {
      assert.equal(statusOf(result, criterion), SHIP_UNMET);
    }
  }
});

test('a section that could not run is unmet with its reason, never a fail', () => {
  const result = componentShip(allPass({ lint: NO_LINTER }));
  const lint = result.criteria.find((row) => row.criterion === 'lint-pass');
  assert.equal(lint.status, SHIP_UNMET);
  assert.equal(lint.reason, NO_LINTER.reason, 'a tool to install is not a bug to fix');
  assert.notEqual(lint.status, SHIP_FAIL);
});

test('every status that is not a pass names what stopped it', () => {
  const result = componentShip(
    allPass({
      lint: NO_LINTER,
      tests: { component: 'Button', clauses: [], unstated: [], existing: [], proposal: null },
      spec: 'name: Button\n',
    }),
  );
  for (const row of result.criteria) {
    if (row.status === SHIP_PASS) assert.equal(row.reason, null);
    else assert.ok(row.reason && row.reason.length > 0, `${row.criterion} gives no reason`);
  }
});

// ---------------------------------------------------------------------------
// What each criterion actually reads
// ---------------------------------------------------------------------------

test('a contract with no derivable clause is an absent contract, whatever the block holds', () => {
  const empty = componentShip(
    allPass({
      tests: {
        component: 'Button',
        clauses: [{ clause: 'renders', stated: false }],
        unstated: [{ clause: 'renders', reason: 'the spec records no archetype' }],
        existing: ['src/Button.usage.test.js'],
        proposal: null,
      },
    }),
  );
  assert.equal(statusOf(empty, 'contract-present'), SHIP_FAIL);
  assert.match(empty.criteria[0].reason, /records no archetype/, 'the clause\'s own reason is the evidence');
});

test('the tests criterion reads what the project carries, not what refine tests rendered', () => {
  const result = componentShip(
    allPass({
      tests: {
        component: 'Button',
        clauses: [{ clause: 'renders', stated: true }],
        unstated: [],
        existing: [],
        proposal: { path: 'src/Button.usage.test.js' },
      },
    }),
  );
  assert.equal(statusOf(result, 'tests-exist'), SHIP_FAIL);
  assert.match(result.criteria[4].reason, /placing it is yours to do/, 'a rendered file is not a placed one');
});

test('the docs criterion is unmet by absence, with govern docs named as the answer', () => {
  const absent = componentShip(allPass({ docs: null }));
  const docs = absent.criteria.find((row) => row.criterion === 'docs-exist');
  assert.equal(docs.status, SHIP_UNMET, 'passing it by absence would be a criterion nobody checked');
  assert.match(docs.reason, /no documentation entry is recorded/);
  assert.match(docs.reason, /govern docs/, 'and the reader is told what will satisfy it');
  assert.equal(
    statusOf(componentShip(allPass()), 'docs-exist'),
    SHIP_PASS,
    'a complete five-part entry is what the criterion is asking for',
  );
});

test('an entry with a part still open fails, and the reason names the part', () => {
  // A stated gap is the honest thing to do with a part nobody has an answer
  // for. It is still a gap, so it is a fail rather than an unmet: somebody did
  // run `govern docs` here, and the criterion is not un-checkable.
  const open = componentShip(
    allPass({
      docs: parseEntry(renderEntry('Button', { ...COMPLETE_DOCS, 'where-to-use': null })),
    }),
  );
  const docs = open.criteria.find((row) => row.criterion === 'docs-exist');
  assert.equal(docs.status, SHIP_FAIL);
  assert.match(docs.reason, /where-to-use/, 'a fail with no named part is a verdict nobody can act on');
  assert.equal(open.shippable, false);
});

test('a criterion nothing is wired to read is unmet, not quietly skipped', () => {
  // The default arm of the switch. It exists so a seventh row added to the
  // reference before its reader is written stops a ship rather than passing.
  const result = componentShip(allPass({ coverage: null, coverageEntry: null }));
  assert.equal(statusOf(result, 'coverage-clean'), SHIP_UNMET);
  assert.match(result.criteria[1].reason, /could not run/);
});

// ---------------------------------------------------------------------------
// A deprecated component is never shippable
// ---------------------------------------------------------------------------

test('a deprecated component is refused on top of the six, which are still reported', () => {
  const result = componentShip(
    allPass({ deprecation: { subject: 'Button', kind: 'component', replacement: 'ButtonNew' } }),
  );
  assert.equal(result.met, true, 'a component on its way out can be perfectly clean');
  assert.deepEqual(result.open, [], 'and hiding that would make the report harder to read, not easier');
  assert.equal(result.shippable, false);
  assert.match(result.blocked, /replaced by `ButtonNew`/, 'the reader is told what to ship instead');
  assert.equal(result.criteria.length, criteria().length, 'the deprecation is not a seventh criterion');
});

test('the deprecation the verdict reads is the record refine deprecate wrote', async () => {
  await withTempDir(async (dir) => {
    const { text } = project(dir, [{ name: 'Button', spec: BUTTON }], { 'src/Button.jsx': BUTTON_MARKUP });
    const marked = setComponentDeprecation(text, 'Button', 'ButtonNew');
    fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), marked);

    const result = refineShip(dir, parse(marked), { lint: NO_LINTER });
    assert.equal(result.components[0].deprecated.replacement, 'ButtonNew');
    assert.deepEqual(result.shippable, [], 'and nothing deprecated appears on the shippable list');
  });
});

// ---------------------------------------------------------------------------
// Over a whole design system
// ---------------------------------------------------------------------------

test('an undocumented component comes back not shippable, and docs-exist is why', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir, [{ name: 'Button', spec: BUTTON }], { 'src/Button.jsx': BUTTON_MARKUP });
    const result = refineShip(dir, model, { lint: NO_LINTER });

    assert.equal(result.ran, true);
    assert.equal(result.pass, false, 'not shippable is a normal outcome for a component nobody documented');
    assert.ok(result.components[0].open.includes('docs-exist'));
    assert.equal(statusOf(result.components[0], 'docs-exist'), SHIP_UNMET);
  });
});

test('the entry the verdict reads is the one govern docs wrote into the file', async () => {
  await withTempDir(async (dir) => {
    const { text } = project(dir, [{ name: 'Button', spec: BUTTON }], { 'src/Button.jsx': BUTTON_MARKUP });
    writeDocs(dir, 'Button', COMPLETE_DOCS, { text });
    const written = fs.readFileSync(path.join(dir, DESIGN_SYSTEM_FILE), 'utf8');

    const result = refineShip(dir, parse(written), { lint: NO_LINTER, text: written });
    assert.equal(
      statusOf(result.components[0], 'docs-exist'),
      SHIP_PASS,
      'one parser writes the entry and reads it, so there is one answer rather than two',
    );
  });
});

test('a design system with nothing recorded has no verdict to give, rather than a clean one', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir, []);
    const result = refineShip(dir, model, { lint: NO_LINTER });
    assert.deepEqual(result.components, []);
    assert.equal(result.pass, null, 'six criteria over nothing is not six passes');
  });
});

test('the sections are handed in and only read — the verdict re-runs none of them', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir, [{ name: 'Button', spec: BUTTON }], { 'src/Button.jsx': BUTTON_MARKUP });
    let asked = 0;
    const lint = { pass: true, reason: null };
    const coverage = {
      ran: true,
      get components() {
        asked += 1;
        return [{ component: 'Button', checked: true, pass: true, findings: [] }];
      },
    };
    const result = refineShip(dir, model, { lint, coverage });

    assert.equal(asked, 1, 'the handed-in section is read once, and never run again');
    assert.equal(result.sections.lint, lint, 'and it is the very object the caller passed');
    assert.equal(result.sections.coverage, coverage);
    assert.equal(statusOf(result.components[0], 'coverage-clean'), SHIP_PASS);
  });
});

// ---------------------------------------------------------------------------
// Read-only
// ---------------------------------------------------------------------------

test('ship writes nothing at all — not a report, not DESIGN-SYSTEM.md', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir, [{ name: 'Button', spec: BUTTON }], { 'src/Button.jsx': BUTTON_MARKUP });
    const before = snapshotContents(dir);
    refineShip(dir, model, { lint: NO_LINTER });
    refineShip(dir, model, { lint: { pass: true, reason: null } });
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
  });
});

test('no write call exists in the module at all', () => {
  const source = fs.readFileSync(new URL('../../lib/refine-ship.js', import.meta.url), 'utf8');
  for (const call of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'writeFile(', 'writeDesignSystem']) {
    assert.equal(source.includes(call), false, `lib/refine-ship.js calls ${call}`);
  }
});
