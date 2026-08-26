/**
 * `govern docs` — the five-part documentation template (v0.12.0 phase 4).
 *
 * The mode makes one promise, and it is the promise the acceptance criterion is
 * written in: **every entry has the same five parts, in the same order, and no
 * more than three "do not do" examples.** A promise phrased that way is only
 * worth having if the shape is checked rather than described, so most of this
 * file is about the ways an entry could have drifted from the template and does
 * not.
 *
 * Five groups, each one a way the template could have been lost quietly:
 *
 *   1. **The template and the copy come from the reference.** The parts, their
 *      order and the ceiling live in `refs/govern/docs.md`, and the parser that
 *      reads an entry back is built from the same lines that wrote it.
 *   2. **An entry renders deterministically, five parts every time.** A part
 *      nobody answered is `TODO` rather than absent, and an empty one is refused.
 *   3. **The cap is enforced, not trimmed.** A fourth "do not do" example is a
 *      refusal the writer is told about.
 *   4. **The entry lands in the component's own block, and nowhere else.** It
 *      survives the file's own parse-and-render round trip, it leaves the spec
 *      block alone, and a re-run replaces rather than appends.
 *   5. **The write lands inside the permission model, and creates no new file.**
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse, render } from '../../lib/design-system.js';
import { specOf } from '../../lib/prd.js';
import {
  DOCS_LANG,
  DocsEntryError,
  componentIn,
  copyLine,
  docsEntryIn,
  docsEntryOf,
  docsPartFor,
  docsPartNames,
  docsSources,
  fillLine,
  parseEntry,
  parseGovernDocsSpec,
  planDocs,
  renderEntry,
  writeDocs,
} from '../../lib/govern-docs.js';
import { DESIGN_SYSTEM_FILE, isAllowedPath } from '../../lib/write.js';
import { snapshotPaths, withTempDir } from './helpers.js';

const PARTS = {
  'what-it-is': 'The button this design system records.',
  'how-to-use': 'Set `label`; every other slot comes from the spec block.',
  'where-to-use': 'Wherever a press commits something.',
  'in-the-codebase': 'src/Button.jsx line 1:\n\n```jsx\n<Button label="Save" />\n```',
  'do-not': ['Do not pass a colour at the call site.'],
};

const DESIGN_SYSTEM = [
  '# Design System',
  '',
  "> Phyllum manages this file. It is the single source of truth for this project's design system.",
  '',
  '- Project: govern-docs',
  '- Phyllum version: 0.12.0',
  '- Created: 2026-08-26',
  '',
  '## Tokens',
  '',
  '### Colours',
  '',
  '| token | value |',
  '| --- | --- |',
  '| surface-default | #FFFFFF |',
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
  '### Button',
  '',
  '```yaml',
  'name: Button',
  'archetype: button',
  'properties:',
  '  background: surface-default',
  '```',
  '',
  '```jsx',
  'export const Button = () => <button className="button" />;',
  '```',
  '',
  '## Backlog',
  '',
  '_Nothing outstanding._',
  '',
].join('\n');

/** A project with one recorded component and no documentation entry yet. */
function project(dir) {
  fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), DESIGN_SYSTEM);
  return DESIGN_SYSTEM;
}

const read = (dir) => fs.readFileSync(path.join(dir, DESIGN_SYSTEM_FILE), 'utf8');

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

test('the template is the reference tree, not a list in the code', () => {
  assert.deepEqual(docsPartNames(), [
    'what-it-is',
    'how-to-use',
    'where-to-use',
    'in-the-codebase',
    'do-not',
  ]);
  assert.equal(docsPartNames().length, 5, 'five parts, and the acceptance criterion says five');
});

test('the ceiling on "do not do" is a number in the table, and it is three', () => {
  assert.equal(docsPartFor('do-not').most, 3);
  for (const part of docsPartNames().filter((name) => name !== 'do-not')) {
    assert.equal(docsPartFor(part).most, 1, `${part} holds one body, not a list`);
  }
  assert.equal(docsPartFor('nothing-declares-this'), null);
});

test('every part says where its content comes from, and what to do when it is silent', () => {
  const sources = docsSources();
  assert.deepEqual(
    sources.map((row) => row.part),
    docsPartNames(),
    'a part with no source row is a part somebody would have to invent',
  );
  for (const row of sources) {
    assert.ok(row.from.length > 0 && row.whenSilent.length > 0, `${row.part} leaves a column empty`);
  }
});

test('every copy line the module prints exists in the reference', () => {
  for (const name of [
    'title',
    'part-heading',
    'item',
    'todo',
    'unknown-part',
    'empty-part',
    'over-cap',
    'unrecorded',
    'unchanged',
    'incomplete',
    'not-written',
  ]) {
    assert.ok(copyLine(name).length > 0, `the copy table has no "${name}" line`);
  }
});

test('a doctored reference is read as text, and a missing table is named', () => {
  assert.throws(() => parseGovernDocsSpec('# nothing here'), /docs-parts/);
});

test('a Most cell that is not a whole number is refused rather than defaulted', () => {
  const doctored = [
    '<!-- phyllum:docs-parts -->',
    '| Part | Heading | Answers | Most |',
    '| --- | --- | --- | --- |',
    '| `what-it-is` | What it is | what it is | some |',
    '',
    '<!-- phyllum:docs-sources -->',
    '| Part | From | Silent |',
    '| --- | --- | --- |',
    '| `what-it-is` | the archetype | ask |',
    '',
    '<!-- phyllum:docs-copy -->',
    '| Line | Text |',
    '| --- | --- |',
    '| `title` | # {name} |',
  ].join('\n');
  assert.throws(() => parseGovernDocsSpec(doctored), /is not a ceiling/);
});

test('fillLine leaves a placeholder nobody filled alone', () => {
  assert.equal(fillLine('{a} and {b}', { a: 'one' }), 'one and {b}');
});

// ---------------------------------------------------------------------------
// One entry
// ---------------------------------------------------------------------------

test('an entry carries all five parts, under the headings the table names', () => {
  const text = renderEntry('Button', PARTS);
  assert.ok(text.startsWith(fillLine(copyLine('title'), { name: 'Button' })));
  for (const row of docsPartNames().map(docsPartFor)) {
    assert.ok(
      text.includes(fillLine(copyLine('part-heading'), { heading: row.heading })),
      `the entry has no "${row.heading}" heading`,
    );
  }
});

test('the parts run in the template order, in every entry, whatever order they arrived in', () => {
  const forwards = parseEntry(renderEntry('Button', PARTS));
  const backwards = parseEntry(
    renderEntry(
      'Button',
      Object.fromEntries(Object.entries(PARTS).reverse()),
    ),
  );
  assert.deepEqual(forwards.order, docsPartNames());
  assert.deepEqual(backwards.order, docsPartNames(), 'the table decides the order, not the caller');
  assert.equal(forwards.ordered, true);
});

test('a part nobody answered is TODO, never dropped', () => {
  const entry = parseEntry(renderEntry('Button', { ...PARTS, 'where-to-use': null }));
  assert.deepEqual(entry.missing, [], 'the template is fixed, so the part is there');
  assert.deepEqual(entry.todo, ['where-to-use'], 'and the gap is stated where a reader sees it');
  assert.equal(entry.complete, false);
});

test('an entry given nothing at all is five TODOs, and is not complete', () => {
  const entry = parseEntry(renderEntry('Button', {}));
  assert.deepEqual(entry.todo, docsPartNames());
  assert.equal(entry.complete, false, 'a stated gap is honest, and it is still a gap');
});

test('a part stated as empty is refused — an empty part is not a stated gap', () => {
  assert.throws(
    () => renderEntry('Button', { ...PARTS, 'how-to-use': '   ' }),
    (error) => error instanceof DocsEntryError && /empty/.test(error.message),
  );
  assert.throws(() => renderEntry('Button', { ...PARTS, 'do-not': [] }), DocsEntryError);
});

test('a part nothing declares is refused, and the refusal names the five', () => {
  assert.throws(
    () => renderEntry('Button', { ...PARTS, 'when-to-avoid': 'never' }),
    (error) =>
      error instanceof DocsEntryError && /what-it-is, how-to-use, where-to-use/.test(error.message),
  );
});

test('a fourth "do not do" example is refused, not trimmed away', () => {
  const four = ['one.', 'two.', 'three.', 'four.'];
  assert.throws(
    () => renderEntry('Button', { ...PARTS, 'do-not': four }),
    (error) => error instanceof DocsEntryError && error.count === 4 && error.most === 3,
  );
  // Three is the ceiling and one is complete: a cap is not a quota.
  assert.equal(parseEntry(renderEntry('Button', { ...PARTS, 'do-not': four.slice(0, 3) })).complete, true);
  assert.equal(parseEntry(renderEntry('Button', PARTS)).complete, true);
});

test('an entry is read back with the template it was written from', () => {
  const entry = parseEntry(renderEntry('Button', PARTS));
  assert.equal(entry.name, 'Button');
  assert.equal(entry.complete, true);
  assert.deepEqual(entry.overCap, []);
  const codebase = entry.parts.find((row) => row.part === 'in-the-codebase');
  assert.ok(
    codebase.items[0].includes('<Button label="Save" />'),
    'a code example survives the round trip, blank lines and fences included',
  );
});

test('text that is not an entry reads as no entry, not as an incomplete one', () => {
  // The difference matters: `refine ship` answers `unmet` for one and `fail`
  // for the other, and a code sample must never be graded as half an entry.
  assert.equal(parseEntry('export const Button = () => <button />;'), null);
  assert.equal(parseEntry(''), null);
  assert.equal(parseEntry('## What it is\n\nA button.\n'), null, 'no title line, no entry');
});

test('a hand-written entry with a part missing altogether is read as missing', () => {
  const partial = [
    fillLine(copyLine('title'), { name: 'Button' }),
    '',
    fillLine(copyLine('part-heading'), { heading: docsPartFor('what-it-is').heading }),
    '',
    'A button.',
    '',
  ].join('\n');
  const entry = parseEntry(partial);
  assert.equal(entry.name, 'Button');
  assert.deepEqual(entry.missing, ['how-to-use', 'where-to-use', 'in-the-codebase', 'do-not']);
  assert.equal(entry.complete, false);
});

test('a hand-written entry that broke the ceiling is reported, not silently accepted', () => {
  const overflowing = [
    renderEntry('Button', PARTS).replace(/\n$/, ''),
    fillLine(copyLine('item'), { item: 'two.' }),
    fillLine(copyLine('item'), { item: 'three.' }),
    fillLine(copyLine('item'), { item: 'four.' }),
    '',
  ].join('\n');
  const entry = parseEntry(overflowing);
  assert.deepEqual(entry.overCap, ['do-not']);
  assert.equal(entry.complete, false);
});

// ---------------------------------------------------------------------------
// Where it lands
// ---------------------------------------------------------------------------

test('the entry lands in the component\'s own block, beside the spec block', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    const result = writeDocs(dir, 'Button', PARTS);
    assert.equal(result.written, true);
    assert.equal(result.replaced, false);
    assert.equal(result.path, DESIGN_SYSTEM_FILE);

    const model = parse(read(dir));
    assert.deepEqual(
      model.components[0].blocks.map((block) => block.lang),
      ['yaml', 'jsx', DOCS_LANG],
      'the contract first, then what it renders as, then the documentation',
    );
    assert.equal(docsEntryOf(model.components[0]).complete, true);
  });
});

test('the spec block is left exactly as it was — prose is not vocabulary', async () => {
  await withTempDir(async (dir) => {
    const before = specOf(parse(project(dir)).components[0]);
    writeDocs(dir, 'Button', PARTS);
    assert.equal(specOf(parse(read(dir)).components[0]), before, 'a slot reader must see no new slots');
  });
});

test('the entry survives the file\'s own parse-and-render round trip', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    writeDocs(dir, 'Button', PARTS);
    const written = read(dir);
    // Loose prose under the heading would be dropped here; a fenced block is
    // not, and that is the reason the entry is a block.
    const rerendered = render(parse(written));
    assert.equal(docsEntryIn(rerendered, 'Button').complete, true);
  });
});

test('a re-run replaces the entry rather than appending a second one', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    writeDocs(dir, 'Button', PARTS);
    const revised = writeDocs(dir, 'Button', {
      ...PARTS,
      'where-to-use': 'Wherever a press commits something, and nowhere a link would do.',
    });
    assert.equal(revised.written, true);
    assert.equal(revised.replaced, true, 'documentation is a state, and two states are one contradiction');

    const blocks = parse(read(dir)).components[0].blocks.filter((block) => block.lang === DOCS_LANG);
    assert.equal(blocks.length, 1);
    assert.match(blocks[0].content, /nowhere a link would do/);
  });
});

test('the same entry twice in a row writes nothing at all', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    writeDocs(dir, 'Button', PARTS);
    const before = read(dir);
    const again = writeDocs(dir, 'Button', PARTS);
    assert.equal(again.written, false);
    assert.equal(again.writes, false);
    assert.match(again.reason, /already what `govern docs` would write/);
    assert.equal(read(dir), before, 'a rerun changed the file');
  });
});

test('planDocs derives the write and performs none of it', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    const plan = planDocs(dir, 'Button', PARTS);
    assert.equal(plan.writes, true);
    assert.equal(plan.path, DESIGN_SYSTEM_FILE);
    assert.ok(plan.after.length > plan.before.length);
    assert.equal(read(dir), DESIGN_SYSTEM, 'the derivation touched the file');
    assert.deepEqual(snapshotPaths(dir), [DESIGN_SYSTEM_FILE], 'and left nothing else behind');
  });
});

test('a component the design system does not record is refused, not documented', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    assert.throws(
      () => writeDocs(dir, 'Card', PARTS),
      (error) => error instanceof DocsEntryError && /records no component/.test(error.message),
    );
    assert.equal(read(dir), DESIGN_SYSTEM, 'a refusal wrote anyway');
    assert.equal(componentIn(DESIGN_SYSTEM, 'Card'), null);
  });
});

test('a refused entry never reaches the file', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    assert.throws(
      () => writeDocs(dir, 'Button', { ...PARTS, 'do-not': ['a.', 'b.', 'c.', 'd.'] }),
      DocsEntryError,
    );
    assert.equal(read(dir), DESIGN_SYSTEM);
  });
});

test('a markdown block that is not an entry is left alone rather than overwritten', async () => {
  await withTempDir(async (dir) => {
    const hand = DESIGN_SYSTEM.replace(
      '## Backlog',
      ['```markdown', 'A note somebody left here.', '```', '', '## Backlog'].join('\n'),
    );
    fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), hand);
    writeDocs(dir, 'Button', PARTS);
    const after = read(dir);
    assert.match(after, /A note somebody left here\./, 'somebody else\'s prose is not this mode\'s to replace');
    assert.equal(docsEntryIn(after, 'Button').complete, true);
  });
});

// ---------------------------------------------------------------------------
// The permission model
// ---------------------------------------------------------------------------

test('the entry goes into the one write target, and adds no new name to the list', () => {
  assert.ok(isAllowedPath(DESIGN_SYSTEM_FILE));
  assert.ok(!isAllowedPath('DESIGN-SYSTEM-DOCS.md'));
  assert.ok(!isAllowedPath('docs/Button.md'));
  assert.ok(!isAllowedPath('DOCS.md'));
});

test('a docs run writes the design system and its backup, and no third file', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    writeDocs(dir, 'Button', PARTS);
    assert.deepEqual(
      snapshotPaths(dir),
      [DESIGN_SYSTEM_FILE, `${DESIGN_SYSTEM_FILE}.bak`].sort(),
      'the funnel\'s own pre-edit copy, and nothing this mode invented',
    );
  });
});
