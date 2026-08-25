/**
 * Assertions for `refine deprecate` (v0.11.0 phase 5).
 *
 * The one mode of Refine that changes what `DESIGN-SYSTEM.md` records, which
 * makes it the one mode where "what was written" is as much of the contract as
 * "what was derived". Six promises, and each one is a way the mode could have
 * quietly become something else:
 *
 *   - **The replacement is mandatory.** Four refusals, each for its own reason,
 *     and every one of them lands before a single byte is derived. A
 *     deprecation with no successor is a message that something is bad and
 *     nothing about what to do instead.
 *   - **The record goes where the file already keeps that kind of fact.** A
 *     component's two lines sit in its own spec block beside `applied:`; a
 *     token's sits in the Backlog as one fixed line, because the token tables'
 *     columns are contract and may not grow to carry a state.
 *   - **The Backlog line is read back out of the sentence that wrote it.** The
 *     one copy table in Phyllum read in both directions, so a line edited in
 *     the reference stays a line the reader recognises.
 *   - **The usage list has no second detector.** A component's usages are the
 *     `applied:` walk's own sites, so the deprecation, the flag and `delete`'s
 *     refusal can never disagree about what "this component is here" means.
 *   - **Re-deprecating is a no-op.** The existing record is read back, and a run
 *     that would change no byte writes nothing — no file, no `.bak`.
 *   - **The derivation writes nothing.** The whole directory is diffed around
 *     every `planDeprecation` call, and the write is a separate call through the
 *     one funnel.
 *
 * The two homes and every fixed line are read from `refs/refine/deprecate.md`
 * rather than restated here, so an edit to the reference moves this suite with
 * it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse } from '../../lib/design-system.js';
import {
  BACKLOG_LINE,
  BOUNDED_CAVEAT,
  COMPONENT,
  TOKEN,
  backlogPattern,
  componentDeprecations,
  componentKeys,
  componentUsages,
  deprecationOf,
  planDeprecation,
  recordedTokenNames,
  renderProposal,
  renderUsages,
  setComponentDeprecation,
  setTokenDeprecation,
  subjectKind,
  tokenDeprecations,
  tokenFileUsages,
  tokenSpecUsages,
  writeDeprecation,
} from '../../lib/refine-deprecate.js';
import { deprecateCopy, deprecateRecordFor, deprecateRecords } from '../../lib/refine-spec.js';
import { BACKUP_FILE, DESIGN_SYSTEM_FILE } from '../../lib/write.js';
import { diffSnapshots, snapshotContents, withTempDir } from './helpers.js';

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

/** Two radii, so a token has somewhere real to be deprecated *to*. */
const NUMBERS = [
  ['radius-sm', '4px', 'radius'],
  ['radius-lg', '12px', 'radius'],
];

/** A design system carrying those tokens, whatever components a case needs. */
function designSystem(components, backlog = ['_Nothing outstanding._']) {
  return [
    '# Design System',
    '',
    "> Phyllum manages this file. It is the single source of truth for this project's design system.",
    '',
    '- Project: refine-deprecate',
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
    '',
    '### Numbers',
    '',
    '| token | value | applies to |',
    '| --- | --- | --- |',
    ...NUMBERS.map((row) => `| ${row.join(' | ')} |`),
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
    ...backlog,
    '',
  ].join('\n');
}

/** A button spec, with whatever radius the case wants it to name. */
const buttonSpec = (name, radius = 'radius-sm') => [
  `name: ${name}`,
  'archetype: button',
  'properties:',
  '  background: surface-default',
  '  text-colour: text-strong',
  `  radius: ${radius}`,
  '  typography: type-body',
];

const BUTTON_MARKUP = [
  'export function Button({ children }) {',
  '  return <button className="button">{children}</button>;',
  '}',
  '',
].join('\n');

const COMPONENTS = [
  { name: 'Button', spec: buttonSpec('Button') },
  { name: 'ButtonNew', spec: buttonSpec('ButtonNew', 'radius-lg') },
];

/** A project with a design system and, optionally, some source files. */
function project(dir, { components = COMPONENTS, backlog, files = {} } = {}) {
  const text = designSystem(components, backlog);
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

// ---------------------------------------------------------------------------
// The replacement is mandatory
// ---------------------------------------------------------------------------

test('a deprecation with no replacement is refused, because the successor is the record', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const plan = planDeprecation(dir, model, text, 'Button', '');

    assert.equal(plan.ok, false);
    assert.equal(plan.refusal.line, 'no-replacement');
    assert.equal(plan.refusal.text, deprecateCopy('no-replacement', { name: 'Button' }));
    assert.match(plan.refusal.text, /successor undecided/, 'the refusal says the state does not exist');
    assert.equal(plan.replacement, null);
    assert.equal(plan.usages, null, 'a refusal is decided before anything is derived');
    assert.equal(plan.after, text, 'and it leaves the file it was handed');
  });
});

test('a subject the design system does not record is refused, never guessed at', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const plan = planDeprecation(dir, model, text, 'Buttonn', 'ButtonNew');

    assert.equal(plan.ok, false);
    assert.equal(plan.refusal.line, 'unknown-subject');
    assert.equal(plan.kind, null, 'a name with no kind is a name with no home to write to');
    assert.match(plan.refusal.text, /never guesses/, 'a near miss is a miss, here as everywhere');
  });
});

test('a replacement the design system does not record is refused — it would be a dead end', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const plan = planDeprecation(dir, model, text, 'Button', 'ButtonNewer');

    assert.equal(plan.ok, false);
    assert.equal(plan.refusal.line, 'unknown-replacement');
    assert.equal(
      plan.refusal.text,
      deprecateCopy('unknown-replacement', { name: 'Button', replacement: 'ButtonNewer' }),
    );
    assert.match(plan.refusal.text, /dead end/);
  });
});

test('a thing cannot be its own successor, in any casing of its name', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    assert.equal(planDeprecation(dir, model, text, 'Button', 'Button').refusal.line, 'self-replacement');
    assert.equal(
      planDeprecation(dir, model, text, 'Button', 'button').refusal.line,
      'self-replacement',
      'a case change is not a different component',
    );
  });
});

test('a name is a component, a token, or nothing at all — and there is no fourth answer', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    assert.equal(subjectKind(model, 'Button'), COMPONENT);
    assert.equal(subjectKind(model, 'radius-sm'), TOKEN);
    assert.equal(subjectKind(model, 'surface-default'), TOKEN, 'a colour is a token like any other');
    assert.equal(subjectKind(model, 'nothing-here'), null);
    assert.equal(recordedTokenNames(model).has('type-body'), true, 'typography rows are tokens too');
  });
});

// ---------------------------------------------------------------------------
// Where the record goes
// ---------------------------------------------------------------------------

test('the two homes are the reference table\'s, and there is no third', () => {
  assert.deepEqual(
    deprecateRecords().map((row) => row.subject),
    [COMPONENT, TOKEN],
  );
  assert.equal(deprecateRecordFor(COMPONENT).home, 'spec-block');
  assert.equal(deprecateRecordFor(TOKEN).home, 'backlog');
  assert.deepEqual(deprecateRecordFor(TOKEN).keys, [BACKLOG_LINE]);
  assert.deepEqual(componentKeys(), { flag: 'deprecated', replacement: 'replaced-by' });
});

test('a component records its state in its own spec block, beside the applied: line', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const plan = planDeprecation(dir, model, text, 'Button', 'ButtonNew');

    assert.equal(plan.ok, true);
    assert.equal(plan.home, 'spec-block');
    assert.equal(plan.changed, true);
    const block = plan.after.slice(plan.after.indexOf('### Button\n'), plan.after.indexOf('### ButtonNew'));
    assert.match(block, /archetype: button\ndeprecated: true\nreplaced-by: ButtonNew\nproperties:/);
    assert.equal(
      plan.after.replace('deprecated: true\n', '').replace('replaced-by: ButtonNew\n', ''),
      text,
      'two lines, and every other byte is the file the user had',
    );
  });
});

test('the write is surgical: a second component keeps its block untouched', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const after = planDeprecation(dir, model, text, 'Button', 'ButtonNew').after;
    const other = after.slice(after.indexOf('### ButtonNew'));
    assert.equal(other.includes('deprecated:'), false, 'the successor is not marked as the dying one');
    assert.equal(componentDeprecations(after).size, 1);
  });
});

test('a token records its state as the one fixed Backlog line, and the columns do not grow', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const plan = planDeprecation(dir, model, text, 'radius-sm', 'radius-lg');

    assert.equal(plan.ok, true);
    assert.equal(plan.home, 'backlog');
    const expected = `- ${deprecateCopy(BACKLOG_LINE, { name: 'radius-sm', replacement: 'radius-lg' })}`;
    assert.ok(plan.after.includes(expected), 'the line is the table\'s sentence, spelled once');
    const written = plan.after.split('\n').find((line) => line.startsWith('- Deprecated:'));
    assert.equal(written.includes('``'), false, 'the table already carries the backticks around both names');
    assert.equal(
      plan.after.includes('| radius-sm | 4px | radius |'),
      true,
      'the token table row is the row it was — a column is contract, not a place to put a state',
    );
    assert.equal(plan.after.includes('_Nothing outstanding._'), false, 'the empty note goes when work arrives');
  });
});

test('the Backlog reader round-trips exactly the line the writer wrote', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const after = setTokenDeprecation(text, 'radius-sm', 'radius-lg');
    const found = tokenDeprecations(after);

    assert.deepEqual(
      [...found.values()].map(({ subject, kind, replacement }) => ({ subject, kind, replacement })),
      [{ subject: 'radius-sm', kind: TOKEN, replacement: 'radius-lg' }],
    );
    // The parser is built from the copy line rather than spelled a second time,
    // so the sentence and its reader cannot drift apart.
    assert.match('Deprecated: `a` — replaced by `b`. Move the usages, then remove it.', backlogPattern());
    assert.equal(backlogPattern().test('- Deprecated: something else entirely'), false);
    assert.equal(deprecationOf(after, 'radius-sm').kind, TOKEN, 'either home answers the one lookup');
  });
});

test('a Backlog that already holds work gains a line rather than replacing one', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir, { backlog: ['- TODO: tokenise `18px` (Button padding-top)'] });
    const after = planDeprecation(dir, model, text, 'radius-sm', 'radius-lg').after;
    assert.ok(after.includes('- TODO: tokenise `18px` (Button padding-top)'), 'the existing item stayed');
    assert.equal(tokenDeprecations(after).size, 1);
  });
});

test('half a component record is no record at all', async () => {
  await withTempDir(async (dir) => {
    const { text } = project(dir);
    // The flag with no successor is the "deprecated, undecided" state the mode
    // refuses to create, so reading one back as a deprecation would let in
    // through the file what the refusal keeps out at the door.
    const flagOnly = text.replace('archetype: button\n', 'archetype: button\ndeprecated: true\n');
    assert.equal(componentDeprecations(flagOnly).size, 0);
    const named = text.replace('archetype: button\n', 'archetype: button\nreplaced-by: ButtonNew\n');
    assert.equal(componentDeprecations(named).size, 0, 'and a successor with no flag is not one either');
  });
});

// ---------------------------------------------------------------------------
// The usage list
// ---------------------------------------------------------------------------

test('a component\'s usages are the applied: walk\'s own sites, not a second detector', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir, { files: { 'src/Button.jsx': BUTTON_MARKUP } });
    const plan = planDeprecation(dir, model, text, 'Button', 'ButtonNew');

    assert.equal(plan.usages.kind, COMPONENT);
    assert.equal(plan.usages.count, 1);
    assert.deepEqual(plan.usages.sites[0].files, ['src/Button.jsx']);
    assert.deepEqual(
      componentUsages(dir, model, 'Button'),
      plan.usages.sites,
      'one predicate decides what "this component is here" means, everywhere',
    );
    assert.deepEqual(componentUsages(dir, model, 'ButtonNew'), [], 'and the successor is not built yet');
  });
});

test('a token\'s usages are the specs that bind it and the files that write it', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir, {
      files: { 'src/Button.jsx': 'const style = { borderRadius: "var(--radius-sm)" };\n' },
    });
    const plan = planDeprecation(dir, model, text, 'radius-sm', 'radius-lg');

    assert.equal(plan.usages.kind, TOKEN);
    assert.deepEqual(tokenSpecUsages(model, 'radius-sm'), [{ component: 'Button', slots: ['radius'] }]);
    assert.deepEqual(tokenFileUsages(dir, 'radius-sm'), [{ file: 'src/Button.jsx', lines: [1] }]);
    assert.equal(plan.usages.count, 2, 'a spec slot and a source line are both somebody still on it');
  });
});

test('the token scan matches a whole name, so space-4 is not reported for space-40', async () => {
  await withTempDir(async (dir) => {
    project(dir, { files: { 'src/near.css': '.a { border-radius: var(--radius-small); }\n' } });
    assert.deepEqual(
      tokenFileUsages(dir, 'radius-sm'),
      [],
      'an over-match would inflate a list somebody is meant to act on',
    );
  });
});

test('an empty usage list carries the sentence that bounds it, every time', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const plan = planDeprecation(dir, model, text, 'Button', 'ButtonNew');

    assert.equal(plan.usages.count, 0);
    assert.equal(plan.usages.caveat, BOUNDED_CAVEAT);
    assert.match(renderUsages(plan).join('\n'), /none seen in what was read/);
    assert.match(renderProposal(plan), /nothing else in the file is touched/);
    assert.match(renderProposal(plan), /`deprecated: true`/, 'the proposal names exactly what changes');
  });
});

// ---------------------------------------------------------------------------
// Re-deprecating changes nothing
// ---------------------------------------------------------------------------

test('an already-deprecated subject is read back rather than refused', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const once = planDeprecation(dir, model, text, 'Button', 'ButtonNew');
    const twice = planDeprecation(dir, model, once.after, 'Button', 'ButtonNew');

    assert.equal(twice.ok, true, 'the existing record is a fact, not a fault');
    assert.deepEqual(twice.already, { subject: 'Button', kind: COMPONENT, replacement: 'ButtonNew' });
    assert.equal(twice.changed, false);
    assert.equal(twice.after, once.after, 'a run that would change nothing changes nothing');
    assert.match(renderProposal(twice), /already recorded as deprecated/);
  });
});

test('a re-run over a token rewrites its line in place, and only when the successor moved', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const once = setTokenDeprecation(text, 'radius-sm', 'radius-lg');
    assert.equal(setTokenDeprecation(once, 'radius-sm', 'radius-lg'), once, 'one line, never two');

    const moved = setTokenDeprecation(once, 'radius-sm', 'radius-md');
    assert.equal(tokenDeprecations(moved).get('radius-sm').replacement, 'radius-md');
    assert.equal(tokenDeprecations(moved).size, 1, 'the line was replaced where it already sat');
  });
});

// ---------------------------------------------------------------------------
// The write, and everything before it
// ---------------------------------------------------------------------------

test('the derivation writes nothing — not one file, not one byte', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir, { files: { 'src/Button.jsx': BUTTON_MARKUP } });
    const before = snapshotContents(dir);

    planDeprecation(dir, model, text, 'Button', 'ButtonNew');
    planDeprecation(dir, model, text, 'radius-sm', 'radius-lg');
    planDeprecation(dir, model, text, 'Button', '');

    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
  });
});

test('the write goes through the one funnel, and the .bak is made first', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const before = snapshotContents(dir);
    const plan = planDeprecation(dir, model, text, 'Button', 'ButtonNew');

    assert.deepEqual(writeDeprecation(dir, plan), { written: true, reason: null });
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff, { added: [BACKUP_FILE], changed: [DESIGN_SYSTEM_FILE], removed: [] });
    assert.equal(
      fs.readFileSync(path.join(dir, BACKUP_FILE), 'utf8'),
      text,
      'the backup is the file as it stood before the write',
    );
    assert.equal(
      componentDeprecations(fs.readFileSync(path.join(dir, DESIGN_SYSTEM_FILE), 'utf8')).get('Button')
        .replacement,
      'ButtonNew',
      'and the record survives the round trip to disk',
    );
  });
});

test('a run that would change no byte writes nothing at all — no file, no .bak', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const plan = planDeprecation(dir, model, text, 'Button', 'ButtonNew');
    writeDeprecation(dir, plan);

    const settled = snapshotContents(dir);
    const again = planDeprecation(dir, model, plan.after, 'Button', 'ButtonNew');
    const result = writeDeprecation(dir, again);

    assert.equal(result.written, false);
    assert.match(result.reason, /already exactly this/);
    assert.deepEqual(diffSnapshots(settled, snapshotContents(dir)), { added: [], changed: [], removed: [] });
  });
});

test('a refused plan has nothing to write, and says so rather than writing the file back', async () => {
  await withTempDir(async (dir) => {
    const { text, model } = project(dir);
    const before = snapshotContents(dir);
    const result = writeDeprecation(dir, planDeprecation(dir, model, text, 'Button', ''));

    assert.equal(result.written, false);
    assert.equal(result.reason, deprecateCopy('no-replacement', { name: 'Button' }));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
  });
});

test('this mode has no path to a removal at all', () => {
  const source = fs.readFileSync(new URL('../../lib/refine-deprecate.js', import.meta.url), 'utf8');
  for (const call of ['rmSync', 'unlinkSync', 'applyDelete', 'writeFileSync']) {
    assert.equal(source.includes(call), false, `lib/refine-deprecate.js reaches for ${call}`);
  }
  assert.ok(source.includes('writeDesignSystem'), 'the one write is the funnel, named in the open');
});

test('a spec block nobody named is not touched by the setter', async () => {
  await withTempDir(async (dir) => {
    const { text } = project(dir);
    assert.equal(setComponentDeprecation(text, 'Nowhere', 'ButtonNew'), text);
    assert.equal(setTokenDeprecation(text.replace('## Backlog', '## Nothing'), 'radius-sm', 'radius-lg'),
      text.replace('## Backlog', '## Nothing'),
      'and a file with no Backlog gains no line invented for it');
  });
});
