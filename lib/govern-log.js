/**
 * `govern log` — the append-only changelog (v0.12.0 phase 2).
 *
 * Governance is the stage that says what the rules are, and this is the mode
 * that keeps the record of what the design system actually did. It writes one
 * file, `DESIGN-SYSTEM-CHANGELOG.md`, and it writes it one entry at a time.
 *
 * The reference is `refs/govern/log.md`; where that file and this one disagree,
 * that one wins and this one is wrong. What is worth stating here is the four
 * decisions the code is shaped around, because each one is enforced below
 * rather than promised in a comment.
 *
 *   1. **The file may only grow, and the check is on the bytes.** Every write
 *      this module performs must begin with the exact contents already on disk
 *      and be longer than them. Not "the writer appends" — the writer is
 *      *checked*, at the last moment before the funnel, against what is there.
 *      That turns "never deletes" from a property of the happy path into a
 *      property of every path, including the ones a future bug takes.
 *   2. **Deletion is a grant, not an argument.** There is exactly one call that
 *      may shorten the file, it refuses to run without a grant object minted
 *      from a reason a person gave, and nothing in this module opens one for
 *      itself. This is the shape `lib/write.js` already uses for the source
 *      writes an `apply run` phase performs, for the same reason: a
 *      permission spelled as a boolean is a permission somebody passes by
 *      accident.
 *   3. **Oldest first, newest at the bottom.** A newest-first changelog rewrites
 *      every byte below the top entry on every run, which is the one thing rule
 *      1 forbids. Reading order lost the argument to never losing a line.
 *   4. **The vocabulary and the copy come from the reference.** The actions, the
 *      kinds and every fixed sentence live in tables in `refs/govern/log.md`,
 *      and two of those sentences are read *back* — the file is parsed with the
 *      same templates it was written from, so a line edited in the reference
 *      stays a line the reader recognises.
 *
 * Nothing here decides that a change happened. The change is stated by whatever
 * made it — `tokenise`, `create`, `update`, `delete`, `refine deprecate` — and
 * this module writes it down. `planAppend` derives and reaches no writer;
 * `appendEntry` is the write, and the acceptance in between is the skill's.
 */

import fs from 'node:fs';
import path from 'node:path';

import { reportDate } from './assess-reports.js';
import { stripTicks, tableAfter as readTable } from './md-tables.js';
import { readRef, refFileOf } from './refs.js';
import { CHANGELOG_FILE, writeChangelogFile } from './write.js';

/** The stage folder these tables live in. */
export const GOVERN_REF = 'govern';

export const MARKERS = {
  kinds: '<!-- phyllum:changelog-kinds -->',
  actions: '<!-- phyllum:changelog-actions -->',
  copy: '<!-- phyllum:changelog-copy -->',
};

const tableAfter = (text, marker) => readTable(text, marker, refFileOf(marker, GOVERN_REF));

/**
 * The three tables, read out of text rather than off disk.
 *
 * Split out for the reason `parseRefineSpec` is: the malformed-input sweep
 * exercises the reader against doctored text, and doctoring text is not the
 * same as writing inside the package.
 */
export function parseGovernLogSpec(text) {
  const kinds = tableAfter(text, MARKERS.kinds).map(([kind, names]) => ({
    kind: stripTicks(kind),
    names: String(names ?? '').trim(),
  }));

  const actions = tableAfter(text, MARKERS.actions).map(([action, records]) => ({
    action: stripTicks(action),
    records: String(records ?? '').trim(),
  }));

  const copy = Object.fromEntries(
    tableAfter(text, MARKERS.copy).map(([line, printed]) => [
      stripTicks(line),
      String(printed ?? '').trim(),
    ]),
  );

  return { kinds, actions, copy };
}

let specCache = null;

/** The tables, read once. The reference tree is Phyllum's own and does not change. */
export function governLogSpec() {
  if (!specCache) specCache = parseGovernLogSpec(readRef(GOVERN_REF));
  return specCache;
}

/** Forget the tables — the hostile-input sweeps rebuild them against doctored text. */
export function reloadGovernLogSpec() {
  specCache = null;
}

/** The subject kinds an entry may name, in table order. */
export const changelogKinds = () => governLogSpec().kinds.map((row) => row.kind);

/** The actions an entry may record, in table order. */
export const changelogActions = () => governLogSpec().actions.map((row) => row.action);

/** One fixed line, by its name in the copy table. */
export function copyLine(name) {
  const line = governLogSpec().copy[name];
  if (line === undefined) {
    throw new Error(`${refFileOf(MARKERS.copy, GOVERN_REF)} has no "${name}" line`);
  }
  return line;
}

/** Fill `{placeholders}` in a copy line. An unfilled placeholder is left as it is. */
export function fillLine(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}

// ---------------------------------------------------------------------------
// The failures
// ---------------------------------------------------------------------------

/**
 * An entry that could not be built — an unknown action, an unknown kind, no
 * subject. Raised before anything is rendered, so a refused entry never reaches
 * a file at all.
 */
export class ChangelogEntryError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'ChangelogEntryError';
    Object.assign(this, detail);
  }
}

/**
 * A write that would have made the file shorter.
 *
 * This is the invariant failing closed, and it is deliberately not a
 * `PermissionError`: the funnel would have allowed the path. What is refused is
 * the *shape* of the write, and the message says how many characters already on
 * disk the caller was about to take away.
 */
export class ChangelogTruncationError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'ChangelogTruncationError';
    Object.assign(this, detail);
  }
}

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

/** Where the changelog lives, absolute. */
export const changelogPath = (root) => path.join(path.resolve(root), CHANGELOG_FILE);

/** The changelog as text, or null when the project has none yet. */
export function readChangelog(root) {
  try {
    return fs.readFileSync(changelogPath(root), 'utf8');
  } catch {
    return null;
  }
}

/**
 * The two lines a new changelog opens with.
 *
 * Written once, when the file does not exist, and never touched again — it is
 * the first thing every later append has to reproduce byte for byte, so a
 * heading that re-rendered differently would fail the invariant rather than
 * quietly reformat somebody's file.
 */
export function changelogHeader() {
  return `${copyLine('heading')}\n\n${copyLine('preamble')}\n`;
}

// ---------------------------------------------------------------------------
// One entry
// ---------------------------------------------------------------------------

/**
 * An entry, checked against the two closed word lists.
 *
 * The lists are closed for the reason every closed vocabulary in Phyllum is: an
 * entry is read back later by something that has to know what it is looking at,
 * and a free-text verb turns the file into prose nobody can count.
 */
export function normaliseEntry(entry = {}, { now = new Date() } = {}) {
  const kind = String(entry.kind ?? '').trim().toLowerCase();
  const action = String(entry.action ?? '').trim().toLowerCase();
  const name = stripTicks(String(entry.name ?? '')).trim();

  const kinds = changelogKinds();
  if (!kinds.includes(kind)) {
    throw new ChangelogEntryError(
      fillLine(copyLine('unknown-kind'), { kind: entry.kind ?? '', kinds: kinds.join(', ') }),
      { kind: entry.kind ?? null },
    );
  }

  const actions = changelogActions();
  if (!actions.includes(action)) {
    throw new ChangelogEntryError(
      fillLine(copyLine('unknown-action'), {
        action: entry.action ?? '',
        actions: actions.join(', '),
      }),
      { action: entry.action ?? null },
    );
  }

  if (name === '') throw new ChangelogEntryError(copyLine('no-name'), { name: entry.name ?? null });

  return {
    // Local, never UTC — `reportDate` carries that reason, and importing it
    // rather than respelling it imports the reason with it.
    date: String(entry.date ?? '').trim() || reportDate(now),
    kind,
    name,
    action,
    note: String(entry.note ?? '').trim() || null,
    by: entry.by ? stripTicks(String(entry.by)).trim() : null,
  };
}

/**
 * One entry as the block that is appended, leading blank line included.
 *
 * The block starts with a newline rather than ending with two, so the file is
 * always the header followed by n blocks and never grows a trailing blank that
 * the next append would have to reason about.
 */
export function renderEntry(entry, options = {}) {
  const record = normaliseEntry(entry, options);
  const heading = fillLine(copyLine('entry-heading'), record);
  const body = [];
  if (record.note) body.push(record.note);
  if (record.by) body.push(fillLine(copyLine('by-line'), record));
  return `\n${heading}\n${body.map((part) => `\n${part}\n`).join('')}`;
}

/** The heading template as a pattern, so the file is read with what wrote it. */
function headingPattern() {
  const template = copyLine('entry-heading');
  const groups = {
    '{date}': '(\\d{4}-\\d{2}-\\d{2})',
    '{kind}': '([a-z][a-z-]*)',
    '{name}': '([^`]+)',
    '{action}': '([a-z][a-z-]*)',
  };
  const source = template
    .split(/(\{date\}|\{kind\}|\{name\}|\{action\})/)
    .map((part) =>
      Object.hasOwn(groups, part) ? groups[part] : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^${source}$`);
}

/**
 * The entries a changelog holds, in file order.
 *
 * Parsed with the same template they were written from, so the reader cannot
 * drift from the writer. A heading the pattern does not recognise is not an
 * entry — the file's own preamble is prose, and prose is not an entry either.
 */
export function entries(text) {
  const pattern = headingPattern();
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const match = line.match(pattern);
    if (!match) continue;
    out.push({ date: match[1], kind: match[2], name: match[3], action: match[4] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

/** How many leading characters two strings share. */
function commonPrefix(before, after) {
  const limit = Math.min(before.length, after.length);
  let index = 0;
  while (index < limit && before[index] === after[index]) index += 1;
  return index;
}

/**
 * The one check every ordinary write passes through.
 *
 * `after` must start with `before` and be longer. Anything else — a rewrite, a
 * reformat, a truncation, a file rendered from scratch — is refused here, and
 * the refusal says how many characters already on disk were about to go.
 */
export function assertAppendOnly(before, after) {
  const existing = String(before ?? '');
  const next = String(after ?? '');
  if (next.startsWith(existing) && next.length > existing.length) return next;
  const removed = existing.length - commonPrefix(existing, next);
  throw new ChangelogTruncationError(
    fillLine(copyLine('truncation'), { removed: Math.max(removed, 0) }),
    { removed: Math.max(removed, 0), before: existing.length, after: next.length },
  );
}

// ---------------------------------------------------------------------------
// The derivation, and the write
// ---------------------------------------------------------------------------

/**
 * What `govern log` *would* write, having written nothing.
 *
 * Holds no writer and reaches none, exactly as `planDeprecation` does: the
 * proposal is what the skill shows before it asks, and the acceptance is what
 * turns it into a call to `appendEntry`.
 *
 * `appends: false` is the rerunnable case. An entry identical to the one
 * already at the end of the file is the same run run twice, and it changes
 * nothing rather than writing a duplicate.
 */
export function planAppend(root, entry, options = {}) {
  const record = normaliseEntry(entry, options);
  const before = options.text ?? readChangelog(root) ?? '';
  const block = renderEntry(record, options);
  const base = before === '' ? changelogHeader() : before;
  const after = `${base}${block}`;

  if (before !== '' && before.endsWith(block)) {
    return {
      path: CHANGELOG_FILE,
      entry: record,
      block,
      before,
      after: before,
      appends: false,
      created: false,
      reason: fillLine(copyLine('unchanged'), record),
    };
  }

  return {
    path: CHANGELOG_FILE,
    entry: record,
    block,
    before,
    after,
    appends: true,
    created: before === '',
    reason: null,
  };
}

/**
 * Append one entry. The only write this module performs without a grant, and
 * the only one that can be reached by an ordinary call.
 *
 * The plan is derived, the invariant is checked against the bytes on disk, and
 * only then does the funnel see the text. A run that would change nothing
 * writes nothing at all — no file, and no empty file either.
 */
export function appendEntry(root, entry, options = {}) {
  const plan = planAppend(root, entry, options);
  if (!plan.appends) return { ...plan, written: false };
  // Against the disk, never against the plan. `options.text` is a seam the
  // suite and the skill use to derive a proposal, and a plan derived from stale
  // or hand-supplied bytes is exactly the shape a rewrite bug takes: the text
  // it produces would be perfectly append-only with respect to a file nobody
  // has. What must survive is what is actually there.
  assertAppendOnly(readChangelog(root) ?? '', plan.after);
  writeChangelogFile(root, plan.after);
  return { ...plan, written: true };
}

// ---------------------------------------------------------------------------
// The one door that may shorten the file
// ---------------------------------------------------------------------------

/** Grants minted here, so a hand-rolled object cannot be passed off as one. */
const grants = new WeakSet();

/**
 * Open the door for one removal the user asked for by name.
 *
 * `reason` is the permission, in the user's words, and a grant without one is
 * refused at the point it is opened rather than at the point it is used. There
 * is no other way to obtain one: nothing in Phyllum calls this on its own
 * judgement, and "the file has grown long" is not a reason — length is what a
 * history looks like.
 */
export function openDeletionGrant({ reason, removes = [] } = {}) {
  const stated = String(reason ?? '').trim();
  if (stated === '') throw new ChangelogEntryError(copyLine('no-reason'));
  const grant = Object.freeze({
    reason: stated,
    removes: [...removes].map((item) => String(item)),
    closed: { value: false },
  });
  grants.add(grant);
  return grant;
}

/** Shut the door. A closed grant refuses every further write. */
export function closeDeletionGrant(grant) {
  if (grants.has(grant)) grant.closed.value = true;
  return grant;
}

/** Is this a live grant this module minted? */
export const grantIsOpen = (grant) => grants.has(grant) && grant.closed.value === false;

/**
 * Write the changelog as given, shortening included — under a grant.
 *
 * The one call in Phyllum that may make this file smaller. It is spelled
 * separately from `appendEntry` on purpose: a caller cannot reach it by passing
 * a different argument to the ordinary write, only by holding something a
 * person's permission produced.
 */
export function rewriteChangelog(root, contents, grant) {
  if (!grants.has(grant)) throw new ChangelogTruncationError(copyLine('no-grant'));
  if (grant.closed.value) throw new ChangelogTruncationError(copyLine('grant-closed'));
  return writeChangelogFile(root, String(contents));
}
