/**
 * Assertions for the typography reading contract and the file shape that
 * carries it (v0.7.3 plan §"The contract", §"The file shape", phase 1).
 *
 * v0.7.3 widens a typography token from three readings to twenty-one. Phase 1
 * settles only the *shape*: the contract table, the fenced block beneath the
 * Typography table, the three conflict rules, and the promise that a file
 * written before this release is untouched by all of it. Nothing here reads
 * prose, generates CSS, scans a codebase or draws a specimen — those are later
 * phases, and they all depend on these promises holding first.
 *
 * The through-line is the same one the rest of this suite keeps: a claim about
 * bytes is asserted as bytes. "Round-trips" means `render(parse(x)) === x`
 * character for character, not "looks right".
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  TYPOGRAPHY_BLOCK_LANG,
  TOKEN_SECTIONS,
  emptyModel,
  orderedTypographyBlocks,
  parse,
  render,
} from '../../lib/design-system.js';
import {
  CONFLICT_KINDS,
  CORE_READINGS,
  KINDS,
  MARKERS,
  TYPOGRAPHY_FILE,
  TYPOGRAPHY_REF,
  TypographyError,
  conflictNotices,
  conflicts,
  declarationTextFor,
  declarationsFor,
  isReading,
  optionalReadings,
  parseTypographyContract,
  readBlock,
  readTypography,
  readingFor,
  readingNames,
  readingsOf,
  readings,
  renderBlock,
} from '../../lib/typography.js';
import { typographyFailureNotice } from '../../lib/execute.js';
import { instantiateTemplate } from '../../lib/template.js';
import { FIXTURES, TYPOGRAPHY_FIXTURE, readFixture } from './helpers.js';

const contractText = () => fs.readFileSync(TYPOGRAPHY_FILE, 'utf8');

/** Every design system written before v0.7.3, and canonical as written. */
const PRE_RELEASE = [
  'apply-target.md',
  'buttons-with-focus-ring.md',
  'buttons-without-focus-ring.md',
  'empty.md',
  'legacy-notes.md',
  'populated.md',
];

// ---------------------------------------------------------------------------
// The contract table
// ---------------------------------------------------------------------------

test('the twenty-one readings are a table in the reference tree, not a constant in code', () => {
  // The claim is not "there are twenty-one readings somewhere". It is that the
  // *file* is where they are: delete the table and the reader has nothing.
  const text = contractText();
  assert.ok(text.includes(MARKERS.readings), 'the contract file lost its readings table');
  assert.ok(text.includes(MARKERS.conflicts), 'the contract file lost its conflicts table');

  const rows = readings();
  assert.equal(rows.length, 21);
  assert.deepEqual(
    parseTypographyContract(text).readings.map((row) => row.reading),
    rows.map((row) => row.reading),
    'the shipped file and the cached contract disagree',
  );

  // Every reading name appears in the file itself, so nothing is synthesised.
  for (const row of rows) assert.ok(text.includes(`| ${row.reading} |`), `${row.reading} is not a table row`);
});

test('the readings are the plan\'s twenty-one, in the plan\'s order, with the plan\'s CSS', () => {
  assert.deepEqual(readingNames(), [
    'size',
    'weight',
    'line-height',
    'kerning',
    'underline',
    'strikethrough',
    'superscript',
    'subscript',
    'word-spacing',
    'text-indent',
    'measure',
    'text-transform',
    'font-variant',
    'small-caps',
    'slashed-or-lining-zero',
    'font-family',
    'font-stretch',
    'italic-or-oblique',
    'font-feature-settings',
    'font-optical-sizing',
    'text-rendering',
  ]);

  const property = (name) => readingFor(name).property;
  assert.equal(property('size'), 'font-size');
  assert.equal(property('kerning'), 'letter-spacing');
  assert.equal(property('measure'), 'max-width');
  assert.equal(property('underline'), 'text-decoration-line');
  assert.equal(property('strikethrough'), 'text-decoration-line');
  assert.equal(property('superscript'), 'font-variant-position');
  assert.equal(property('subscript'), 'font-variant-position');
  assert.equal(property('small-caps'), 'font-variant-caps');
  assert.equal(property('slashed-or-lining-zero'), 'font-variant-numeric');
  assert.equal(property('italic-or-oblique'), 'font-style');

  // The bare readings carry their whole declaration; the others carry a property.
  assert.deepEqual(readingFor('underline').values, ['underline']);
  assert.deepEqual(readingFor('strikethrough').values, ['line-through']);
  assert.deepEqual(readingFor('superscript').values, ['super']);
  assert.deepEqual(readingFor('subscript').values, ['sub']);
  assert.deepEqual(readingFor('small-caps').values, ['small-caps']);
  assert.deepEqual(readingFor('slashed-or-lining-zero').values, ['slashed-zero', 'lining-nums']);
  assert.deepEqual(readingFor('italic-or-oblique').values, ['italic', 'oblique']);
  // A value or open enum reading names a property and no value at all.
  assert.deepEqual(readingFor('size').values, []);
  assert.deepEqual(readingFor('text-transform').values, []);
});

test('five readings are bare, five are enums, eleven take a value', () => {
  const count = (kind) => readings().filter((row) => row.kind === kind).length;
  assert.equal(count('bare'), 5);
  assert.equal(count('enum'), 5);
  assert.equal(count('value'), 11);
  for (const row of readings()) assert.ok(KINDS.includes(row.kind));
});

test('the three mandatory readings are the Typography table\'s own columns', () => {
  // Not a second list. The four-column table declares them once, and the
  // contract reader derives "mandatory" from it — so the two cannot drift.
  const columns = TOKEN_SECTIONS.find((s) => s.key === 'typography').columns;
  assert.deepEqual(columns, ['token', 'size', 'weight', 'line-height']);
  assert.deepEqual(CORE_READINGS, ['size', 'weight', 'line-height']);
  for (const name of CORE_READINGS) assert.equal(readingFor(name).core, true);
  assert.equal(optionalReadings().length, 18);
  for (const row of optionalReadings()) assert.equal(row.core, false);
});

test('a reading outside the table is refused with a reason naming its file and its table', () => {
  assert.equal(isReading('text-align'), false);
  const { readings: read, notices } = readBlock('text-align: center', 'body-primary');
  assert.deepEqual(read, {}, 'a reading outside the table is never recorded');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, 'unknown-reading');
  assert.ok(notices[0].message.includes('`text-align`'));
  assert.ok(notices[0].message.includes(TYPOGRAPHY_REF), 'the refusal does not name the file');
  assert.ok(notices[0].message.includes(MARKERS.readings), 'the refusal does not name the table');
});

test('a damaged contract table fails the way every other shipped table fails', () => {
  const text = contractText();

  const noTable = text.replace(MARKERS.readings, '<!-- phyllum:gone -->');
  assert.throws(() => parseTypographyContract(noTable), (error) => {
    assert.ok(error instanceof TypographyError);
    assert.ok(error.message.includes(TYPOGRAPHY_REF), 'the failure does not name the file');
    assert.ok(error.message.includes(MARKERS.readings), 'the failure does not name the table');
    return true;
  });

  const badKind = text.replace('| kerning | value |', '| kerning | guess |');
  assert.throws(() => parseTypographyContract(badKind), TypographyError);

  const badConflict = text.replace(
    '| position | contradiction |',
    '| position | whatever |',
  );
  assert.throws(() => parseTypographyContract(badConflict), TypographyError);

  // And the answer a user reads names the file and the one command that fixes it.
  const notice = typographyFailureNotice('display', new TypographyError('the table is unreadable'));
  assert.ok(notice.includes('the table is unreadable'));
  assert.ok(notice.includes(TYPOGRAPHY_FILE));
  assert.ok(notice.includes('phyllum upgrade'));
  assert.ok(notice.endsWith('\n'));
});

// ---------------------------------------------------------------------------
// The three conflict rules
// ---------------------------------------------------------------------------

test('the conflict rules are the plan\'s three, and every reading they name exists', () => {
  const rules = conflicts();
  assert.deepEqual(rules.map((rule) => rule.kind), ['shared', 'contradiction', 'overlap']);
  for (const rule of rules) {
    assert.ok(CONFLICT_KINDS.includes(rule.kind));
    for (const name of rule.readings) assert.ok(isReading(name), `${name} is not a reading`);
  }
  assert.deepEqual(rules[0].readings, ['underline', 'strikethrough']);
  assert.deepEqual(rules[1].readings, ['superscript', 'subscript']);
  assert.deepEqual(rules[2].readings, ['font-variant', 'small-caps', 'slashed-or-lining-zero']);
});

test('underline with strikethrough is one declaration carrying both keywords, in that order', () => {
  assert.deepEqual(declarationTextFor({ underline: true, strikethrough: true }), [
    'text-decoration-line: underline line-through',
  ]);
  // The order is the table's, not the caller's: recording them the other way
  // round writes the same declaration.
  assert.deepEqual(declarationTextFor({ strikethrough: true, underline: true }), [
    'text-decoration-line: underline line-through',
  ]);
  // One alone is still one declaration, unmerged.
  assert.deepEqual(declarationTextFor({ underline: true }), ['text-decoration-line: underline']);
  assert.deepEqual(declarationTextFor({ strikethrough: true }), ['text-decoration-line: line-through']);
  // And a merge is never two declarations of one property, which would be a
  // silent overwrite rather than two decisions.
  const merged = declarationsFor({ underline: true, strikethrough: true });
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].readings, ['underline', 'strikethrough']);
});

test('superscript with subscript is reported as a conflict; neither is dropped', () => {
  const held = { superscript: true, subscript: true };
  const notices = conflictNotices(held, 'legal-fine');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, 'conflict');
  assert.equal(notices[0].token, 'legal-fine');
  assert.ok(notices[0].message.includes('`superscript`'));
  assert.ok(notices[0].message.includes('`subscript`'));
  assert.ok(notices[0].message.includes('font-variant-position'));
  assert.ok(/neither wins/i.test(notices[0].message), 'the notice must not resolve the conflict');

  // Neither reading is dropped: both are still held, and both still reach CSS.
  assert.deepEqual(readBlock('superscript: true\nsubscript: true').readings, held);
  assert.equal(declarationsFor(held).length, 2);

  // One alone is not a conflict.
  assert.deepEqual(conflictNotices({ superscript: true }), []);
});

test('font-variant alongside a longhand is reported as a shorthand overlap', () => {
  for (const longhand of ['small-caps', 'slashed-or-lining-zero']) {
    const held = { 'font-variant': 'small-caps', [longhand]: longhand === 'small-caps' ? true : 'slashed-zero' };
    const notices = conflictNotices(held, 'label-caps');
    assert.equal(notices.length, 1, `${longhand} did not raise an overlap`);
    assert.equal(notices[0].kind, 'overlap');
    assert.ok(notices[0].message.includes('`font-variant`'));
    assert.ok(notices[0].message.includes(`\`${longhand}\``));
    assert.ok(/shorthand/i.test(notices[0].message));
    // Nothing is dropped: both readings still generate their declaration.
    assert.equal(declarationsFor(held).length, 2);
  }
  // A longhand on its own is no overlap at all — the shorthand has to be there.
  assert.deepEqual(conflictNotices({ 'small-caps': true }), []);
  assert.deepEqual(conflictNotices({ 'font-variant': 'small-caps' }), []);
});

test('a declaration is emitted per recorded reading, in the table\'s row order', () => {
  const held = {
    'text-rendering': 'optimizeLegibility',
    size: '12px',
    kerning: '0.02em',
    'line-height': '1.3',
    weight: '700',
  };
  assert.deepEqual(declarationTextFor(held), [
    'font-size: 12px',
    'font-weight: 700',
    'line-height: 1.3',
    'letter-spacing: 0.02em',
    'text-rendering: optimizeLegibility',
  ]);
  // A reading the table does not hold reaches no declaration.
  assert.deepEqual(declarationTextFor({ 'text-align': 'center' }), []);
});

test('never-correct: a value carrying commas, quotes or brackets reaches CSS exactly as given', () => {
  const stack = '"Inter", system-ui, sans-serif';
  const features = '"ss01" 1, "cv02" 2';
  const clamp = 'clamp(1rem, 2.5vw + 0.5rem, 1.5rem)';
  assert.deepEqual(declarationTextFor({ 'font-family': stack, 'font-feature-settings': features, size: clamp }), [
    `font-size: ${clamp}`,
    `font-family: ${stack}`,
    `font-feature-settings: ${features}`,
  ]);
});

// ---------------------------------------------------------------------------
// The block
// ---------------------------------------------------------------------------

test('a bare reading has one spelling, and anything else is reported rather than resolved', () => {
  assert.deepEqual(readBlock('underline: true').readings, { underline: true });

  const off = readBlock('underline: false', 'body-primary');
  assert.deepEqual(off.readings, {}, 'a bare reading is never resolved out of an unreadable value');
  assert.equal(off.notices[0].kind, 'unreadable-value');
  assert.ok(off.notices[0].message.includes('underline: true'));
});

test('never-invent: an empty value records nothing, and absence is not a default', () => {
  const empty = readBlock('kerning:', 'body-primary');
  assert.deepEqual(empty.readings, {});
  assert.equal(empty.notices[0].kind, 'unreadable-value');
  assert.ok(/not decided/.test(empty.notices[0].message));

  // A token with no block at all holds nothing — not a default, not an inherit.
  const model = parse(readFixture(TYPOGRAPHY_FIXTURE));
  assert.deepEqual(readingsOf(model, 'legal-fine'), {});
  for (const row of optionalReadings()) {
    assert.equal(Object.hasOwn(readingsOf(model, 'legal-fine'), row.reading), false);
  }
});

test('a line that is not a reading is left where it was written and reported', () => {
  const { readings: read, notices } = readBlock('this is a sentence, not a reading', 'body-primary');
  assert.deepEqual(read, {});
  assert.equal(notices[0].kind, 'unreadable-line');
  assert.ok(/left exactly as written/.test(notices[0].message));
});

test('a reading recorded twice in one block yields neither, and says why', () => {
  const { readings: read, notices } = readBlock('kerning: 0.02em\nkerning: 0.04em', 'body-primary');
  assert.deepEqual(read, {}, 'a duplicated reading is never resolved by taking the first');
  assert.equal(notices[0].kind, 'duplicate-reading');
  assert.ok(/does not identify one reading/.test(notices[0].message));
});

test('renderBlock writes the contract\'s order, and never writes a core reading', () => {
  const body = renderBlock({
    'text-rendering': 'optimizeLegibility',
    underline: true,
    size: '12px',
    kerning: '0.02em',
  });
  assert.equal(body, ['kerning: 0.02em', 'underline: true', 'text-rendering: optimizeLegibility'].join('\n'));
  assert.equal(body.includes('size'), false, 'the four-column table records size, not the block');
});

// ---------------------------------------------------------------------------
// The file shape
// ---------------------------------------------------------------------------

test('the fixture round-trips byte-identical, blocks and all', () => {
  const text = readFixture(TYPOGRAPHY_FIXTURE);
  const once = parse(text);
  const rendered = render(once);
  assert.equal(rendered, text, 'the fixture is canonical, so rendering must reproduce it byte for byte');
  const twice = parse(rendered);
  assert.deepEqual(twice, once);
  assert.equal(render(twice), rendered);
});

test('a value carrying commas, quotes or brackets survives the round trip byte-identical', () => {
  const model = emptyModel({ project: 'p', version: 'v', created: 'd' });
  model.tokens.typography.push(['body-primary', '16px', '400', '1.5']);
  const body = [
    'font-family: "Inter", ui-sans-serif, [fallback], sans-serif',
    "font-feature-settings: 'ss01' 1, 'cv02' 2",
    'measure: clamp(45ch, 50%, 75ch)',
  ].join('\n');
  model.typographyBlocks.push({ token: 'body-primary', lang: TYPOGRAPHY_BLOCK_LANG, content: body });

  const text = render(model);
  const back = parse(text);
  assert.equal(back.typographyBlocks[0].content, body, 'the block text changed in the round trip');
  assert.equal(render(back), text);
  assert.deepEqual(readingsOf(back, 'body-primary'), {
    measure: 'clamp(45ch, 50%, 75ch)',
    'font-family': '"Inter", ui-sans-serif, [fallback], sans-serif',
    'font-feature-settings': "'ss01' 1, 'cv02' 2",
  });
});

test('blocks sit directly beneath the Typography table, one per token, in row order', () => {
  const text = readFixture(TYPOGRAPHY_FIXTURE);
  const lines = text.split('\n');
  const table = lines.findIndex((line) => line.startsWith('| token | size |'));
  const components = lines.indexOf('## Components');
  const headings = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => entry.line.startsWith('#### '));

  assert.ok(headings.length > 0);
  for (const entry of headings) {
    assert.ok(entry.index > table && entry.index < components, `${entry.line} is not beneath the table`);
  }
  assert.deepEqual(
    headings.map((entry) => entry.line),
    ['#### highlight-small', '#### body-primary', '#### label-caps', '#### label-caps', '#### body-principal'],
  );

  // And the order is the table's own, with the row-less block last.
  const model = parse(text);
  assert.deepEqual(
    orderedTypographyBlocks(model).map((block) => block.token),
    model.typographyBlocks.map((block) => block.token),
  );
});

test('a block written out of the table\'s order is written back in it', () => {
  const model = emptyModel({ project: 'p', version: 'v', created: 'd' });
  model.tokens.typography.push(['a-first', '12px', '400', '1.2'], ['b-second', '16px', '400', '1.5']);
  model.typographyBlocks.push(
    { token: 'z-unknown', lang: 'yaml', content: 'underline: true' },
    { token: 'b-second', lang: 'yaml', content: 'small-caps: true' },
    { token: 'a-first', lang: 'yaml', content: 'kerning: 0.02em' },
  );
  const order = parse(render(model)).typographyBlocks.map((block) => block.token);
  assert.deepEqual(order, ['a-first', 'b-second', 'z-unknown']);
});

test('a token with no optional readings gets no block at all', () => {
  const model = emptyModel({ project: 'p', version: 'v', created: 'd' });
  model.tokens.typography.push(['highlight-small', '12px', '700', '1.3']);
  const text = render(model);
  assert.equal(text.includes('####'), false, 'an empty block is not the same as no block');
  assert.deepEqual(parse(text).typographyBlocks, []);
  // The four columns are untouched by any of this.
  assert.ok(text.includes('| token | size | weight | line-height |'));
  assert.ok(text.includes('| highlight-small | 12px | 700 | 1.3 |'));
});

test('a block naming a token the table does not hold is preserved byte-identical and reported', () => {
  const text = readFixture(TYPOGRAPHY_FIXTURE);
  const model = parse(text);
  const orphan = model.typographyBlocks.find((block) => block.token === 'body-principal');
  assert.ok(orphan, 'the fixture should carry a block with no table row');
  assert.equal(orphan.content, 'measure: 68ch');

  const { readings: read, notices } = readTypography(model);
  assert.equal(Object.hasOwn(read, 'body-principal'), false, 'an orphan block is not read');
  const notice = notices.find((entry) => entry.kind === 'unknown-token');
  assert.equal(notice.token, 'body-principal');
  assert.ok(/prunes nothing/.test(notice.message));

  // Preserved means the bytes come back. Re-rendering keeps the block whole.
  const rendered = render(model);
  assert.equal(rendered, text);
  assert.ok(rendered.includes('#### body-principal'));
});

test('two blocks under one token name yield no reading at all, and say why', () => {
  const text = readFixture(TYPOGRAPHY_FIXTURE);
  const model = parse(text);
  assert.equal(model.typographyBlocks.filter((block) => block.token === 'label-caps').length, 2);

  const { readings: read, notices } = readTypography(model);
  assert.equal(Object.hasOwn(read, 'label-caps'), false);
  assert.deepEqual(readingsOf(model, 'label-caps'), {});
  const notice = notices.find((entry) => entry.kind === 'ambiguous-token');
  assert.equal(notice.token, 'label-caps');
  assert.ok(/does not identify one block/.test(notice.message));
  // Neither block is dropped — the same never-prune rule.
  assert.equal(render(model), text);
});

test('reading the fixture gives exactly what its blocks record, and nothing else', () => {
  const model = parse(readFixture(TYPOGRAPHY_FIXTURE));
  const { readings: read, notices } = readTypography(model);
  assert.deepEqual(read, {
    'highlight-small': {
      kerning: '0.02em',
      underline: true,
      strikethrough: true,
      'text-transform': 'uppercase',
    },
    'body-primary': {
      measure: '68ch',
      'font-family': '"Inter", system-ui, sans-serif',
      'font-feature-settings': '"ss01" 1, "cv02" 2',
      'text-rendering': 'optimizeLegibility',
    },
  });
  assert.deepEqual(notices.map((entry) => entry.kind).sort(), [
    'ambiguous-token',
    'unknown-reading',
    'unknown-token',
  ]);
  // The one merge rule, end to end from the file.
  assert.deepEqual(declarationTextFor(read['highlight-small']), [
    'letter-spacing: 0.02em',
    'text-decoration-line: underline line-through',
    'text-transform: uppercase',
  ]);
});

test('a `#### token` heading with no block under it is preserved rather than dropped', () => {
  const model = emptyModel({ project: 'p', version: 'v', created: 'd' });
  model.tokens.typography.push(['highlight-small', '12px', '700', '1.3']);
  const text = render(model).replace(
    '## Components',
    ['#### highlight-small', '', '## Components'].join('\n'),
  );
  const back = parse(text);
  assert.deepEqual(back.typographyBlocks, [{ token: 'highlight-small', lang: '', content: null }]);
  assert.equal(render(back), text);
  assert.deepEqual(readingsOf(back, 'highlight-small'), {});
});

test('a heading inside a readings block is not mistaken for a section', () => {
  const model = emptyModel({ project: 'p', version: 'v', created: 'd' });
  model.tokens.typography.push(['highlight-small', '12px', '700', '1.3']);
  model.typographyBlocks.push({
    token: 'highlight-small',
    lang: 'yaml',
    content: ['## Components', '### Colours', '#### highlight-small'].join('\n'),
  });
  const text = render(model);
  const back = parse(text);
  assert.equal(back.typographyBlocks.length, 1);
  assert.equal(back.tokens.colours.length, 0);
  assert.equal(back.components.length, 0);
  assert.equal(render(back), text);
});

// ---------------------------------------------------------------------------
// Back-compatibility
// ---------------------------------------------------------------------------

test('a DESIGN-SYSTEM.md written before this release parses and renders byte-identical', () => {
  for (const name of PRE_RELEASE) {
    const text = readFixture(path.join(FIXTURES, 'design-system', name));
    const model = parse(text);
    assert.deepEqual(model.typographyBlocks, [], `${name} gained a block from nowhere`);
    assert.equal(render(model), text, `${name} did not render byte-identical`);
  }
});

test('a pre-release file reads as holding no optional reading, and no notice', () => {
  for (const name of PRE_RELEASE) {
    const model = parse(readFixture(path.join(FIXTURES, 'design-system', name)));
    const result = readTypography(model);
    assert.deepEqual(result.readings, {}, `${name} read a reading it does not carry`);
    assert.deepEqual(result.notices, [], `${name} raised a notice about nothing`);
    for (const row of model.tokens.typography) {
      assert.deepEqual(readingsOf(model, row[0]), {});
    }
  }
});

test('the shipped template is untouched by the block: no heading, no fence, no change', () => {
  const text = instantiateTemplate({ project: 'p', version: 'v', created: 'd' });
  assert.equal(text.includes('####'), false);
  const model = parse(text);
  assert.deepEqual(model.typographyBlocks, []);
  assert.equal(render(model), text);
});

test('the Typography table keeps its four columns', () => {
  const section = TOKEN_SECTIONS.find((s) => s.key === 'typography');
  assert.deepEqual(section.columns, ['token', 'size', 'weight', 'line-height']);
  const text = readFixture(TYPOGRAPHY_FIXTURE);
  assert.ok(text.includes('| token | size | weight | line-height |'));
  const model = parse(text);
  for (const row of model.tokens.typography) assert.equal(row.length, 4);
  // And a row's meaning is unchanged: the three core readings are its cells.
  assert.deepEqual(model.tokens.typography[0], ['highlight-small', '12px', '700', '1.3']);
});
