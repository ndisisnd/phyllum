/**
 * `govern log` — the append-only changelog (v0.12.0 phase 2).
 *
 * The mode makes one promise, and it is the promise the acceptance criterion is
 * written in: **it appends, and it never deletes unless it is given permission.**
 * A promise phrased that way is only worth having if it is checked on the bytes
 * rather than on the happy path, so most of this file is about the ways a write
 * could have made the file shorter and does not.
 *
 * Five groups, each one a way the invariant could have been lost quietly:
 *
 *   1. **The vocabulary and the copy come from the reference.** The word lists
 *      and every fixed sentence live in `refs/govern/log.md`, and the parser
 *      that reads the file back is built from the same template that wrote it.
 *   2. **An entry renders deterministically, dated in local time.** The date is
 *      a seam, so a report is byte-stable, and the default reads the reader's
 *      own calendar rather than UTC.
 *   3. **Appending only ever appends.** Existing bytes survive every write, the
 *      order is oldest first, and a re-run of the same entry writes nothing.
 *   4. **Nothing shortens the file without a grant.** Not `appendEntry`, not a
 *      hand-rolled grant object, not a grant that has been closed.
 *   5. **The write lands inside the permission model, and nowhere else.**
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  ChangelogEntryError,
  ChangelogTruncationError,
  appendEntry,
  assertAppendOnly,
  changelogActions,
  changelogHeader,
  changelogKinds,
  closeDeletionGrant,
  copyLine,
  entries,
  fillLine,
  openDeletionGrant,
  parseGovernLogSpec,
  planAppend,
  renderEntry,
  rewriteChangelog,
} from '../../lib/govern-log.js';
import { CHANGELOG_FILE, isAllowedPath } from '../../lib/write.js';
import { snapshotPaths, withTempDir } from './helpers.js';

const TOKEN_ENTRY = {
  kind: 'token',
  name: 'color-brand-primary',
  action: 'added',
  note: 'Recorded #2563EB as the brand blue.',
  by: 'tokenise',
};

const at = (date) => ({ date });

const read = (dir) => fs.readFileSync(path.join(dir, CHANGELOG_FILE), 'utf8');

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

test('the word lists are the reference tree, not a list in the code', () => {
  assert.deepEqual(changelogKinds(), ['token', 'component', 'system']);
  assert.deepEqual(changelogActions(), [
    'added',
    'changed',
    'renamed',
    'deprecated',
    'removed',
  ]);
});

test('every copy line the module prints exists in the reference', () => {
  for (const name of [
    'heading',
    'preamble',
    'entry-heading',
    'by-line',
    'unchanged',
    'unknown-action',
    'unknown-kind',
    'no-name',
    'truncation',
    'no-grant',
    'no-reason',
    'grant-closed',
    'not-written',
  ]) {
    assert.ok(copyLine(name).length > 0, `the copy table has no "${name}" line`);
  }
});

test('a doctored reference is read as text, and a missing table is named', () => {
  assert.throws(() => parseGovernLogSpec('# nothing here'), /changelog-kinds/);
});

test('fillLine leaves a placeholder nobody filled alone', () => {
  assert.equal(fillLine('{a} and {b}', { a: 'one' }), 'one and {b}');
});

// ---------------------------------------------------------------------------
// One entry
// ---------------------------------------------------------------------------

test('an entry renders its heading, its note and who recorded it', () => {
  const block = renderEntry({ ...TOKEN_ENTRY, ...at('2026-08-26') });
  assert.ok(block.includes('## 2026-08-26 — token `color-brand-primary` added'));
  assert.ok(block.includes('Recorded #2563EB as the brand blue.'));
  assert.ok(block.includes('Recorded by `tokenise`.'));
  assert.ok(block.startsWith('\n') && block.endsWith('\n'));
});

test('an entry with no note and no recorder is still a complete entry', () => {
  const block = renderEntry({ kind: 'system', name: 'DESIGN-SYSTEM.md', action: 'added', ...at('2026-08-26') });
  assert.equal(block, '\n## 2026-08-26 — system `DESIGN-SYSTEM.md` added\n');
});

test('the date defaults to the local calendar, never UTC', () => {
  // 2026-08-26T00:30 local. `toISOString()` would say the 25th in +08, which is
  // the bug class v0.9.0 fixed and this mode inherits the fix for.
  const local = new Date(2026, 7, 26, 0, 30, 0);
  const block = renderEntry({ ...TOKEN_ENTRY }, { now: local });
  assert.ok(block.includes('## 2026-08-26 '), `dated wrongly: ${block.split('\n')[1]}`);
});

test('an action or a kind outside the word lists is refused, and names the words', () => {
  assert.throws(
    () => renderEntry({ ...TOKEN_ENTRY, action: 'tweaked' }),
    (error) =>
      error instanceof ChangelogEntryError && /added, changed, renamed/.test(error.message),
  );
  assert.throws(
    () => renderEntry({ ...TOKEN_ENTRY, kind: 'colour' }),
    (error) => error instanceof ChangelogEntryError && /token, component, system/.test(error.message),
  );
});

test('an entry with no subject is refused — there is no "something changed"', () => {
  assert.throws(() => renderEntry({ kind: 'token', action: 'added', name: '  ' }), ChangelogEntryError);
});

test('the file is read back with the template it was written from', () => {
  const text =
    changelogHeader() +
    renderEntry({ ...TOKEN_ENTRY, ...at('2026-08-26') }) +
    renderEntry({ kind: 'component', name: 'Button', action: 'deprecated', ...at('2026-08-27') });
  assert.deepEqual(entries(text), [
    { date: '2026-08-26', kind: 'token', name: 'color-brand-primary', action: 'added' },
    { date: '2026-08-27', kind: 'component', name: 'Button', action: 'deprecated' },
  ]);
  // The preamble is prose, and prose is not an entry.
  assert.equal(entries(changelogHeader()).length, 0);
});

// ---------------------------------------------------------------------------
// Appending
// ---------------------------------------------------------------------------

test('the first append creates the file, header first', async () => {
  await withTempDir(async (dir) => {
    const result = appendEntry(dir, { ...TOKEN_ENTRY, ...at('2026-08-26') });
    assert.equal(result.written, true);
    assert.equal(result.created, true);
    assert.deepEqual(snapshotPaths(dir), [CHANGELOG_FILE]);
    const text = read(dir);
    assert.ok(text.startsWith(changelogHeader()));
    assert.equal(entries(text).length, 1);
  });
});

test('every later append leaves every earlier byte exactly where it was', async () => {
  await withTempDir(async (dir) => {
    appendEntry(dir, { ...TOKEN_ENTRY, ...at('2026-08-26') });
    const first = read(dir);
    appendEntry(dir, { kind: 'component', name: 'Button', action: 'added', ...at('2026-08-27') });
    const second = read(dir);
    appendEntry(dir, { kind: 'component', name: 'Button', action: 'deprecated', ...at('2026-08-28') });
    const third = read(dir);

    assert.ok(second.startsWith(first), 'the second write did not preserve the first');
    assert.ok(third.startsWith(second), 'the third write did not preserve the second');
    assert.ok(third.length > second.length && second.length > first.length);
    // Oldest first: the order entries were appended is the order they read.
    assert.deepEqual(
      entries(third).map((entry) => entry.date),
      ['2026-08-26', '2026-08-27', '2026-08-28'],
    );
  });
});

test('the same entry twice in a row appends nothing and writes nothing', async () => {
  await withTempDir(async (dir) => {
    appendEntry(dir, { ...TOKEN_ENTRY, ...at('2026-08-26') });
    const before = read(dir);
    const again = appendEntry(dir, { ...TOKEN_ENTRY, ...at('2026-08-26') });
    assert.equal(again.written, false);
    assert.equal(again.appends, false);
    assert.match(again.reason, /already the last entry/);
    assert.equal(read(dir), before, 'a rerun changed the file');
  });
});

test('an entry that repeats an older one, but is not the last, is still recorded', async () => {
  await withTempDir(async (dir) => {
    appendEntry(dir, { ...TOKEN_ENTRY, ...at('2026-08-26') });
    appendEntry(dir, { kind: 'component', name: 'Button', action: 'added', ...at('2026-08-26') });
    const result = appendEntry(dir, { ...TOKEN_ENTRY, ...at('2026-08-26') });
    assert.equal(result.written, true);
    assert.equal(entries(read(dir)).length, 3);
  });
});

test('planAppend derives the write and performs none of it', async () => {
  await withTempDir(async (dir) => {
    const plan = planAppend(dir, { ...TOKEN_ENTRY, ...at('2026-08-26') });
    assert.equal(plan.appends, true);
    assert.equal(plan.path, CHANGELOG_FILE);
    assert.ok(plan.after.length > plan.before.length);
    assert.deepEqual(snapshotPaths(dir), [], 'the derivation touched the disk');
  });
});

test('a refused entry never reaches the disk', async () => {
  await withTempDir(async (dir) => {
    assert.throws(() => appendEntry(dir, { ...TOKEN_ENTRY, action: 'tweaked' }), ChangelogEntryError);
    assert.deepEqual(snapshotPaths(dir), [], 'a refusal left a file behind');
  });
});

// ---------------------------------------------------------------------------
// Never shorter
// ---------------------------------------------------------------------------

test('the invariant refuses every write that is not strictly longer', () => {
  const before = 'one\ntwo\nthree\n';
  assert.equal(assertAppendOnly(before, `${before}four\n`), `${before}four\n`);

  for (const after of [
    'one\ntwo\n', // truncated
    '', // emptied
    before, // rewritten identically — longer is the rule, not "not shorter"
    'one\nTWO\nthree\nfour\n', // a byte changed in the middle
    'zero\none\ntwo\nthree\nfour\n', // prepended, which is what newest-first would do
  ]) {
    assert.throws(() => assertAppendOnly(before, after), ChangelogTruncationError);
  }
});

test('the truncation refusal says how many characters were about to go', () => {
  assert.throws(
    () => assertAppendOnly('one\ntwo\n', 'one\n'),
    (error) => error instanceof ChangelogTruncationError && error.removed === 4,
  );
});

test('appendEntry passes through the invariant, whatever it was handed', async () => {
  await withTempDir(async (dir) => {
    appendEntry(dir, { ...TOKEN_ENTRY, ...at('2026-08-26') });
    const before = read(dir);
    // A caller handing in a shorter "existing" text is the shape a rewrite bug
    // takes: the plan is derived from stale bytes and would replace the file.
    assert.throws(
      () => appendEntry(dir, { kind: 'component', name: 'Button', action: 'added' }, { text: 'stale\n' }),
      ChangelogTruncationError,
    );
    assert.equal(read(dir), before, 'the file changed despite the refusal');
  });
});

// ---------------------------------------------------------------------------
// The one door
// ---------------------------------------------------------------------------

test('nothing shortens the changelog without a grant', async () => {
  await withTempDir(async (dir) => {
    appendEntry(dir, { ...TOKEN_ENTRY, ...at('2026-08-26') });
    const before = read(dir);

    // No grant at all.
    assert.throws(() => rewriteChangelog(dir, 'gone\n'), ChangelogTruncationError);
    // A look-alike this module did not mint.
    assert.throws(
      () => rewriteChangelog(dir, 'gone\n', { reason: 'because I said so', closed: { value: false } }),
      ChangelogTruncationError,
    );
    assert.equal(read(dir), before, 'an ungranted call still wrote');
  });
});

test('a grant needs a reason, and the reason is the permission', () => {
  assert.throws(() => openDeletionGrant({}), ChangelogEntryError);
  assert.throws(() => openDeletionGrant({ reason: '   ' }), ChangelogEntryError);
  const grant = openDeletionGrant({ reason: 'the user asked to remove the entry naming their client' });
  assert.equal(grant.closed.value, false);
});

test('a granted removal is the one call that may make the file smaller', async () => {
  await withTempDir(async (dir) => {
    appendEntry(dir, { ...TOKEN_ENTRY, ...at('2026-08-26') });
    appendEntry(dir, { kind: 'component', name: 'Button', action: 'added', ...at('2026-08-27') });
    assert.equal(entries(read(dir)).length, 2);

    const grant = openDeletionGrant({
      reason: 'the user asked, by name, to remove the Button entry',
      removes: ['Button'],
    });
    const kept =
      changelogHeader() + renderEntry({ ...TOKEN_ENTRY, ...at('2026-08-26') });
    rewriteChangelog(dir, kept, grant);
    assert.deepEqual(entries(read(dir)).map((entry) => entry.name), ['color-brand-primary']);

    // And the door shuts behind it.
    closeDeletionGrant(grant);
    assert.throws(() => rewriteChangelog(dir, changelogHeader(), grant), ChangelogTruncationError);
  });
});

// ---------------------------------------------------------------------------
// The permission model
// ---------------------------------------------------------------------------

test('the changelog is inside the permission model, and its near-misses are not', () => {
  assert.ok(isAllowedPath(CHANGELOG_FILE));
  assert.ok(!isAllowedPath('CHANGELOG.md'));
  assert.ok(!isAllowedPath(`docs/${CHANGELOG_FILE}`));
  assert.ok(!isAllowedPath(`${CHANGELOG_FILE}.bak`));
});

test('the changelog write is the only file a log run creates', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), '# Design system\n');
    appendEntry(dir, { ...TOKEN_ENTRY, ...at('2026-08-26') });
    assert.deepEqual(snapshotPaths(dir), ['DESIGN-SYSTEM.md', CHANGELOG_FILE].sort());
    // No `.bak`: the file only ever gets longer, so there is no overwritten
    // state to keep a copy of.
    assert.ok(!fs.existsSync(path.join(dir, `${CHANGELOG_FILE}.bak`)));
    assert.equal(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'), '# Design system\n');
  });
});
