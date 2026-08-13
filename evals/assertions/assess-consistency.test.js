/**
 * Assertions for the consistency checks — naming and props (v0.2.1 §5).
 *
 * §5 is two readings that share a question and share nothing else, so this file
 * is organised the way the code is: names first, then attributes, then the two
 * promises that cover both.
 *
 * What is worth asserting here is decided by one fact — **this is the first
 * family allowed to say `error` about somebody's markup.** Every check before
 * it reports a value that could be a token, a project that has two frameworks,
 * two components that look alike. None of those says anybody did anything
 * wrong. `prop-synonym` does. So the assertions lean on the negative cases and
 * on the honesty rules harder than any previous family's do:
 *
 *   - **Quiet on ordinary code.** Two normal React fixtures must produce nothing
 *     at all. A consistency check that fires on every codebase is a consistency
 *     check nobody keeps.
 *   - **The vote is counted, not assumed.** A convention has to be earned by
 *     evidence and by a majority, a BEM name has to count as the kebab it is a
 *     spelling of, and a codebase that has not chosen a style has to be told so.
 *   - **What cannot be read is never compared.** An expression is counted and
 *     excluded; a spread is noted and never treated as an absence.
 *   - **The tables decide.** Every convention, severity, synonym, kind and cap
 *     is a row in `refs/assess.md`, and no number or word among them is written
 *     into the code where a table cannot reach it.
 *
 * And the promise the whole command rests on, asserted here for the fourth
 * time: a rename is a suggestion. Nothing in either module writes anything.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { assess } from '../../lib/assess.js';
import {
  NAMING_CAVEAT,
  assessNaming,
  baseFirst,
  collectNames,
  conventionOf,
  conventionStrays,
  dominantConvention,
  namingDrift,
  spellIn,
  wordFrequency,
} from '../../lib/assess-naming.js';
import {
  PROP_CAVEAT,
  assessProps,
  bypassFindings,
  conflictFindings,
  kindOf,
  readAttributes,
  readBraced,
  scanUsages,
  synonymFindings,
  usagesIn,
  variantsByComponent,
} from '../../lib/assess-props.js';
import { renderConsistency } from '../../lib/assess-command.js';
import { emptyModel, parse } from '../../lib/design-system.js';
import { summariseFindings } from '../../lib/assess.js';
import {
  consistencyLimit,
  conventionVotes,
  namingConventions,
  namingRules,
  namingSeverityFor,
  propKindComparable,
  propKinds,
  propMeaningFor,
  propRules,
  propSeverityFor,
  propsWatchedBy,
} from '../../lib/tokenise-spec.js';
import {
  FIXTURES,
  PACKAGE_ROOT,
  copyDir,
  diffSnapshots,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const codebase = (name) => path.join(FIXTURES, 'codebases', name);

const MIXED = codebase('mixed-naming');
const CLEAN = codebase('react-css');
const ORDINARY = codebase('repeated-jsx');
const VUE = codebase('vue-app');

const systemIn = (root) => parse(fs.readFileSync(path.join(root, 'DESIGN-SYSTEM.md'), 'utf8'));

const scan = (root, model = emptyModel()) => assess(root, model);
const mixed = () => scan(MIXED, systemIn(MIXED));

/** A signature as `scanMarkup` returns one, for the cases a fixture cannot make. */
const signature = (element, classes, count = 1, files = ['src/App.jsx']) => ({
  signature: [element, ...classes].join('.'),
  element,
  classes,
  count,
  files,
});

const groupOf = (rows, forms) =>
  rows.find((row) => [...row.forms].sort().join('|') === [...forms].sort().join('|'));

// ---------------------------------------------------------------------------
// The tables, and the fact that they are the contract (§5.1, §5.2)
// ---------------------------------------------------------------------------

test('every convention, severity, synonym, kind and cap is read from the table', () => {
  const spec = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'refs', 'assess.md'), 'utf8');
  for (const marker of [
    '<!-- phyllum:naming-conventions -->',
    '<!-- phyllum:naming-rules -->',
    '<!-- phyllum:prop-rules -->',
    '<!-- phyllum:prop-synonyms -->',
    '<!-- phyllum:prop-kinds -->',
    '<!-- phyllum:consistency-limits -->',
  ]) {
    assert.ok(spec.includes(marker), `${marker} is missing, so the pass has no contract`);
  }

  const naming = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'assess-naming.js'), 'utf8');
  const props = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'assess-props.js'), 'utf8');
  const uncommented = (source) => source.replace(/^\s*\*.*$/gm, '').replace(/^\s*\/\/.*$/gm, '');

  assert.ok(
    !/[^.\w](300|60|200|0\.6)[^\w]/.test(uncommented(naming) + uncommented(props)),
    'a cap or a majority share is written into the code, where a table cannot reach it',
  );
  for (const spelling of ['onPress', 'onTap', 'isDisabled', 'appearance']) {
    assert.ok(
      !uncommented(props).includes(spelling),
      `${spelling} is written into the code, so widening the synonym table would not widen the check`,
    );
  }
  for (const watched of propsWatchedBy('prop-style-bypass')) {
    assert.ok(
      !new RegExp(`['"\`]${watched}['"\`]`).test(uncommented(props)),
      `${watched} is a literal in the code as well as a row in the table`,
    );
  }
});

test('every convention the table names has a shape, and every shape a row', () => {
  const conventions = namingConventions();
  const examples = {
    bem: 'card__title--large',
    upper: 'BUTTON_SMALL',
    pascal: 'ButtonSmall',
    camel: 'buttonSmall',
    snake: 'button_small',
    kebab: 'button-small',
    lower: 'button',
  };
  assert.deepEqual(
    [...conventions].sort(),
    Object.keys(examples).sort(),
    'the table and the reader disagree about which conventions exist',
  );
  for (const [convention, example] of Object.entries(examples)) {
    assert.equal(conventionOf(example), convention, `${example} is not read as ${convention}`);
  }
});

test('the two naming families are warnings and the prop contradictions are errors', () => {
  assert.deepEqual(namingRules(), ['naming-drift', 'naming-convention']);
  for (const rule of namingRules()) {
    assert.equal(namingSeverityFor(rule), 'warn', `${rule} is not a warning`);
  }
  assert.deepEqual(propRules(), ['prop-synonym', 'prop-type-conflict', 'prop-style-bypass']);
  assert.equal(propSeverityFor('prop-synonym'), 'error');
  assert.equal(propSeverityFor('prop-type-conflict'), 'error');
  // The one that is an escape rather than a contradiction. Somebody stepping
  // around the system on purpose is not somebody whose code is wrong.
  assert.equal(propSeverityFor('prop-style-bypass'), 'warn');
});

test('a one-word name votes for nothing and a BEM name votes as kebab', () => {
  assert.equal(conventionVotes('lower'), null, 'a bare word is evidence of no convention');
  assert.equal(
    conventionVotes('bem'),
    'kebab',
    'BEM is kebab with two more separators, not a rival to it',
  );
  assert.equal(conventionVotes('kebab'), 'kebab');
  assert.equal(conventionVotes('pascal'), 'pascal');
});

test('an expression is the one kind the table refuses to compare', () => {
  assert.ok(propKinds().includes('expression'));
  assert.equal(propKindComparable('expression'), false);
  for (const kind of propKinds().filter((row) => row !== 'expression')) {
    assert.equal(propKindComparable(kind), true, `${kind} should be comparable`);
  }
});

// ---------------------------------------------------------------------------
// Naming — the words, the spelling, the base (§5.1)
// ---------------------------------------------------------------------------

test('a name Phyllum cannot classify is in no convention, rather than the wrong one', () => {
  assert.equal(conventionOf('Button/Primary'), null);
  assert.equal(conventionOf('text-[12px]'), null);
  assert.equal(conventionOf(''), null);
  assert.equal(conventionOf(null), null);
});

test('the same words spell out differently in every convention', () => {
  const words = ['button', 'small'];
  assert.equal(spellIn(words, 'pascal'), 'ButtonSmall');
  assert.equal(spellIn(words, 'camel'), 'buttonSmall');
  assert.equal(spellIn(words, 'kebab'), 'button-small');
  assert.equal(spellIn(words, 'snake'), 'button_small');
  assert.equal(spellIn(words, 'upper'), 'BUTTON_SMALL');
  assert.equal(spellIn(words, 'bem'), 'button--small');
  assert.equal(spellIn([], 'kebab'), '');
});

test('the base is the reused word, and never a variant word', () => {
  const frequency = new Map([['button', 5], ['card', 2], ['small', 3]]);
  // `small` is written more often than `card`, and is still not a base: a
  // qualifier is the part that changes and a base is the part that does not.
  assert.deepEqual(baseFirst(['small', 'card'], frequency), ['card', 'small']);
  assert.deepEqual(baseFirst(['small', 'button'], frequency), ['button', 'small']);
  // Two non-variant words: the one the codebase reuses most wins.
  assert.deepEqual(baseFirst(['card', 'button'], frequency), ['button', 'card']);
  // All variants, so there is no non-variant base to prefer and the ordinary
  // rule applies to the whole set: the word the codebase reuses most goes first.
  assert.deepEqual(baseFirst(['ghost', 'small'], frequency), ['small', 'ghost']);
  // With nothing to separate them, the order the name was written in stands
  // rather than being reshuffled on a coin toss.
  assert.deepEqual(baseFirst(['ghost', 'solid'], frequency), ['ghost', 'solid']);
  assert.deepEqual(baseFirst(['button'], frequency), ['button']);
});

test('a registered component absorbs every spelling of itself, so it never drifts from itself', () => {
  const model = emptyModel();
  model.components = [{ name: 'Button/Primary', blocks: [] }];
  // `classNameFor('Button/Primary')` is `button-primary` — a codebase doing
  // exactly what Phyllum asked for must not be reported for it.
  const names = collectNames([signature('button', ['button-primary'], 3)], model);
  assert.deepEqual(
    names.map((row) => `${row.kind}:${row.surface}`),
    ['component:ButtonPrimary'],
  );
  assert.equal(names[0].count, 3, 'the usages are attributed to the component, not dropped');
});

test('classes and components are separate populations', () => {
  // A `Card` rendering a `card` is one concept spelled two ways on purpose, and
  // a check that reports it is a check nobody keeps switched on.
  const names = collectNames([signature('Card', ['card'], 4)], null);
  const drift = namingDrift(names, {}, wordFrequency(names));
  assert.deepEqual(drift, []);
});

test('drift is the same word set spelled twice — in a different order, or a different case', () => {
  const { naming } = mixed();
  const order = groupOf(naming.drift, ['btn--primary', 'primary-btn']);
  assert.ok(order, 'one concept in two word orders was not reported');
  assert.equal(order.drift, 'order');
  assert.equal(order.suggested, 'btn-primary');
  assert.equal(order.severity, 'warn');

  const casing = groupOf(naming.drift, ['panel-header', 'panelHeader']);
  assert.ok(casing, 'one concept in two cases was not reported');
  assert.equal(casing.drift, 'case');
  assert.equal(casing.suggested, 'panel-header');

  const components = groupOf(naming.drift, ['ButtonSmall', 'SmallButton']);
  assert.ok(components, 'a component spelled two ways was not reported');
  assert.equal(components.kind, 'component');
  assert.equal(components.suggested, 'ButtonSmall', 'the base comes first, in Pascal');
});

test('`btn` and `Button` are two concepts, and the report says why', () => {
  const names = collectNames(
    [signature('button', ['btn'], 4), signature('Button', [], 4)],
    null,
  );
  const drift = namingDrift(names, {}, wordFrequency(names));
  assert.deepEqual(drift, [], 'resolving abbreviations means a dictionary, and a dictionary guesses');
  assert.match(NAMING_CAVEAT, /abbreviations/);
});

// ---------------------------------------------------------------------------
// Naming — the vote (§5.1)
// ---------------------------------------------------------------------------

test('a convention has to be earned by evidence before it is called dominant', () => {
  const minimum = consistencyLimit('convention evidence');
  const few = Array.from({ length: minimum - 1 }, (_, i) => ({
    surface: `card-${i}`,
    kind: 'class',
    words: ['card', String(i)],
    count: 1,
    files: [],
  }));
  const thin = dominantConvention(few);
  assert.equal(thin.decided, false);
  assert.match(thin.reason, /are needed before one is called dominant/);

  const enough = [...few, { surface: 'card-x', kind: 'class', words: ['card', 'x'], count: 1, files: [] }];
  assert.equal(dominantConvention(enough).decided, true);
  assert.equal(dominantConvention(enough).convention, 'kebab');
});

test('a codebase split between two styles has not chosen one, and is told so', () => {
  const names = [
    ...['a-one', 'a-two', 'a-three'].map((surface) => ({ surface, kind: 'class', words: ['a'], count: 1, files: [] })),
    ...['bOne', 'bTwo', 'bThree'].map((surface) => ({ surface, kind: 'class', words: ['b'], count: 1, files: [] })),
  ];
  const split = dominantConvention(names);
  assert.equal(split.decided, false, 'a leader by nothing is not a house style');
  assert.match(split.reason, /majority/);
  assert.equal(split.share, 0.5);
});

test('nothing read means nothing dominant, said plainly rather than guessed', () => {
  const nothing = dominantConvention([]);
  assert.equal(nothing.decided, false);
  assert.equal(nothing.voters, 0);
  assert.match(nothing.reason, /nothing to be dominant/);
});

test('a BEM modifier is evidence for the house style, not a stray from it', () => {
  const { naming } = mixed();
  assert.equal(naming.conventions.class.convention, 'kebab');
  assert.equal(
    naming.findings.some((row) => row.value === 'btn--ghost'),
    false,
    'a BEM codebase must not report half of its own names as strays from itself',
  );
});

test('a stray names its own convention, the dominant one, and the predictable form', () => {
  const { naming } = mixed();
  const stray = naming.strays.find((row) => row.value === 'cardBody');
  assert.ok(stray, 'the one camel name with no kebab twin was not reported');
  assert.equal(stray.convention, 'camel');
  assert.equal(stray.dominant, 'kebab');
  assert.equal(stray.suggested, 'card-body');
  assert.equal(stray.severity, 'warn');
});

test('a name already reported as drift is not reported again as a stray', () => {
  const { naming } = mixed();
  const drifted = new Set(naming.drift.flatMap((row) => row.forms));
  for (const stray of naming.strays) {
    assert.ok(!drifted.has(stray.value), `${stray.value} is reported twice for one problem`);
  }
  // And the guard is the reason, not a coincidence of this fixture.
  const names = collectNames(
    [signature('div', ['panel-header'], 2), signature('div', ['panelHeader'], 1)],
    null,
  );
  const conventions = { class: { decided: true, convention: 'kebab' } };
  const frequency = wordFrequency(names);
  const withoutGuard = conventionStrays(names, conventions, frequency);
  assert.ok(withoutGuard.some((row) => row.value === 'panelHeader'));
  const withGuard = conventionStrays(names, conventions, frequency, new Set(['class|panelHeader']));
  assert.deepEqual(withGuard, []);
});

test('the naming pass is bounded, and sorted before it is capped', () => {
  const signatures = [];
  for (let i = 0; i < consistencyLimit('names') + 20; i += 1) {
    signatures.push(signature('div', [`card-${i}`], i + 1));
  }
  const result = assessNaming(
    MIXED,
    null,
    { ran: true },
    { maxFiles: 0 },
  );
  assert.ok(result.caps.names > 0, 'the report does not state the cap it ran under');

  const names = collectNames(signatures, null);
  assert.equal(names[0].surface, `card-${signatures.length - 1}`, 'the most-used name comes first');
});

// ---------------------------------------------------------------------------
// Props — the reader (§5.2)
// ---------------------------------------------------------------------------

test('a nested brace is read whole, because half an object is not an object', () => {
  const { value, next } = readBraced("{{ background: '#2563EB' }}", 0);
  assert.equal(value, "{{ background: '#2563EB' }}");
  assert.equal(next, value.length);
  // A brace inside a string is text, not structure.
  assert.equal(readBraced("{'}'}", 0).value, "{'}'}");
  // And an unbalanced brace takes what is there rather than running away.
  assert.equal(readBraced('{oops', 0).value, '{oops');
});

test('every shape a value comes in is recognised, and only one of them is unread', () => {
  assert.equal(kindOf(null), 'boolean');
  assert.equal(kindOf('{true}'), 'boolean');
  assert.equal(kindOf('"lg"'), 'string');
  assert.equal(kindOf("{'lg'}"), 'string');
  assert.equal(kindOf('{`lg`}'), 'string');
  assert.equal(kindOf('{3}'), 'number');
  assert.equal(kindOf('{-1.5}'), 'number');
  assert.equal(kindOf('{{ padding: 4 }}'), 'object');
  assert.equal(kindOf("{['a']}"), 'array');
  assert.equal(kindOf('{handleClick}'), 'expression');
  assert.equal(kindOf('{size + 1}'), 'expression');
  // An interpolated template is a value Phyllum cannot know, so it is not a
  // string it can compare — the honest answer is that it was not read.
  assert.equal(kindOf('{`size-${n}`}'), 'expression');
});

test('the attribute scan reads names, values and spreads out of one tag', () => {
  const attributes = readAttributes(' size="lg" disabled onClick={save} {...rest} style={{ a: 1 }}');
  assert.deepEqual(
    attributes.map((row) => [row.name, row.kind, row.spread]),
    [
      ['size', 'string', false],
      ['disabled', 'boolean', false],
      ['onClick', 'expression', false],
      [null, 'expression', true],
      ['style', 'object', false],
    ],
  );
});

test('a lowercase tag is markup, and has no contract to contradict', () => {
  const usages = usagesIn('<div style={{ a: 1 }} /><Button style={{ a: 1 }} />', 'src/App.jsx');
  assert.deepEqual(usages.map((row) => row.component), ['Button']);
});

// ---------------------------------------------------------------------------
// Props — the three readings (§5.2)
// ---------------------------------------------------------------------------

test('two names for one prop is an error, because a component has one API', () => {
  const { props } = mixed();
  const synonym = props.synonyms.find((row) => row.component === 'Button');
  assert.ok(synonym, 'onClick beside onPress was not reported');
  assert.equal(synonym.meaning, propMeaningFor('onClick'));
  assert.deepEqual([...synonym.spellings].sort(), ['onClick', 'onPress']);
  assert.equal(synonym.severity, 'error');
  assert.equal(synonym.keep, 'onClick', 'the more-used spelling is the one to keep');
});

test('a prop nobody listed as a synonym is never one', () => {
  const component = {
    component: 'Button',
    usages: [
      { file: 'a.jsx', attributes: [{ name: 'href', kind: 'string', raw: '"/x"' }] },
      { file: 'b.jsx', attributes: [{ name: 'to', kind: 'string', raw: '"/y"' }] },
    ],
  };
  assert.deepEqual(synonymFindings(component), [], 'a generous synonym table cries wolf');
});

test('one prop given two shapes is an error, and one shape twice is nothing', () => {
  const { props } = mixed();
  const conflict = props.conflicts.find((row) => row.component === 'Panel' && row.prop === 'size');
  assert.ok(conflict, '`size="lg"` beside `size={3}` was not reported');
  assert.deepEqual([...conflict.kinds].sort(), ['number', 'string']);
  assert.equal(conflict.severity, 'error');

  assert.equal(
    props.conflicts.some((row) => row.component === 'Card'),
    false,
    '`size="sm"` and `size="lg"` is a prop being used correctly',
  );
});

test('a value the scan cannot read is counted and never compared', () => {
  const component = {
    component: 'Panel',
    usages: [
      { file: 'a.jsx', attributes: [{ name: 'size', kind: 'string', raw: '"lg"' }] },
      { file: 'b.jsx', attributes: [{ name: 'size', kind: 'expression', raw: '{size}' }] },
    ],
  };
  const { rows, unread } = conflictFindings(component);
  assert.deepEqual(rows, [], 'a conflict with something Phyllum did not read is a guess');
  assert.equal(unread, 1, 'and the thing it did not read is still counted');

  const { props } = mixed();
  assert.ok(props.compared.unread > 0);
  assert.ok(props.compared.spreads > 0, 'a spread is noted, so the report can say what it means');
});

test('a bypass needs a variant to bypass', () => {
  const model = emptyModel();
  model.components = [{ name: 'Button/Primary', blocks: [] }];
  const component = {
    component: 'Button',
    usages: [{ file: 'a.jsx', attributes: [{ name: 'style', kind: 'object', raw: '{{ a: 1 }}' }] }],
  };
  assert.deepEqual(
    bypassFindings(component, variantsByComponent(model)),
    [],
    'telling somebody to use a variant that does not exist is worse than saying nothing',
  );

  model.components.push({ name: 'Button/Ghost', blocks: [] });
  const found = bypassFindings(component, variantsByComponent(model));
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'warn');
  assert.deepEqual(found[0].variants, ['Ghost', 'Primary']);
});

test('the bypass reads the props the table watches, and no others', () => {
  const watched = propsWatchedBy('prop-style-bypass');
  assert.ok(watched.includes('style') && watched.length > 1, 'the table names what is watched');
  const { props } = mixed();
  const bypass = props.bypasses.find((row) => row.component === 'Button');
  assert.ok(bypass, 'an inline style on a component with variants was not reported');
  assert.ok(watched.includes(bypass.prop.toLowerCase()));
});

// ---------------------------------------------------------------------------
// Quiet is a result (§5.1, §5.2)
// ---------------------------------------------------------------------------

test('ordinary React projects report nothing at all', () => {
  for (const root of [CLEAN, ORDINARY]) {
    const result = scan(root);
    assert.deepEqual(
      result.naming.findings.map((row) => row.value),
      [],
      `${path.basename(root)} was told its names are inconsistent`,
    );
    assert.deepEqual(result.props.findings.map((row) => row.value), []);
  }
});

test('a stack with no component pass is told the question was not asked', () => {
  const result = scan(VUE);
  assert.equal(result.props.checked, false);
  assert.deepEqual(result.props.findings, []);
  assert.ok(result.props.reason, 'a pass that skips a question has to say why');
  assert.equal(result.naming.markupChecked, false);
  assert.ok(result.naming.markupReason);

  const report = renderConsistency(result).join('\n');
  assert.match(report, /Props were not compared/);
  assert.ok(!/no mismatches/i.test(report), 'never answer a question that was not asked');
});

test('the same codebase reads the same way on every run', () => {
  const once = JSON.stringify({ naming: mixed().naming, props: mixed().props });
  const twice = JSON.stringify({ naming: mixed().naming, props: mixed().props });
  assert.equal(once, twice, 'a suggestion nobody can reproduce is a suggestion nobody can act on');
});

// ---------------------------------------------------------------------------
// How it is counted, and how it is read (§5)
// ---------------------------------------------------------------------------

test('consistency is counted beside the other findings and never folded into them', () => {
  const result = mixed();
  assert.deepEqual(result.naming.summary, summariseFindings(result.naming.findings));
  assert.deepEqual(result.props.summary, summariseFindings(result.props.findings));
  // Naming is all warnings; the prop contradictions are where the errors are.
  assert.equal(result.naming.summary.bySeverity.error, 0);
  assert.ok(result.props.summary.bySeverity.error > 0);
  // And none of it leaks into the value drift count, which answers its own
  // question and would stop meaning anything if it answered this one too.
  assert.deepEqual(
    result.values.findings.byRule.naming ?? null,
    null,
    'a naming stray is not a raw value',
  );
  assert.equal(result.summary.namingFindings, result.naming.findings.length);
  assert.equal(result.summary.propFindings, result.props.findings.length);
});

test('the report states the convention before it names a stray, and the caps before it stops', () => {
  const report = renderConsistency(mixed()).join('\n');
  const conventionLine = report.indexOf('class names are mostly kebab');
  const strayLine = report.indexOf('cardBody');
  assert.ok(conventionLine > -1, 'a report that will not say what it measured against invites argument');
  assert.ok(conventionLine < strayLine, 'the majority convention is stated first');
  assert.match(report, new RegExp(`capped at ${consistencyLimit('components')} components`));
  assert.match(report, /could not be read/);
  assert.match(report, /A rename is a suggestion here/);
});

// ---------------------------------------------------------------------------
// Read-only, in the code and not only in the promise (§5, §11)
// ---------------------------------------------------------------------------

test('a consistency pass over a real project changes nothing in it', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    const before = snapshotContents(dir);
    const result = assess(dir, systemIn(dir));
    assert.ok(
      result.naming.findings.length > 0 && result.props.findings.length > 0,
      'there was something to find',
    );
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('neither consistency module contains a write call', () => {
  for (const file of ['assess-naming.js', 'assess-props.js']) {
    const source = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', file), 'utf8');
    for (const call of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'renameSync']) {
      assert.ok(!source.includes(call), `${call} has no business on the scan path (${file})`);
    }
  }
  assert.match(PROP_CAVEAT, /never counted as a conflict/);
});

test('the prop pass is bounded, and says what it read', () => {
  const caps = { components: consistencyLimit('components'), usages: consistencyLimit('usages') };
  assert.ok(caps.components > 0 && caps.usages > 0);
  const result = assessProps(MIXED, systemIn(MIXED), { ran: true });
  assert.deepEqual(result.caps, caps);
  assert.ok(result.compared.components > 0 && result.compared.usages > 0);
  assert.equal(result.compared.componentsCapped, false);
  assert.equal(scanUsages(MIXED)[0].count >= 1, true, 'components come back most-used first');
});
