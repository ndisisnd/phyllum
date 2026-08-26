/**
 * `govern init` — the enforcement plumbing (v0.12.0 phase 5).
 *
 * Governance is the stage that says what the rules are. `govern log` records
 * what changed and `govern docs` records what a component is, and both write
 * inside the design system. This mode writes **outside** it, into the two places
 * a project runs checks from: the pre-commit hook and the CI workflow.
 *
 * The reference is `refs/govern/init.md`; where that file and this one disagree,
 * that one wins and this one is wrong. What is worth stating here is the five
 * decisions the code is shaped around, because each one is enforced below rather
 * than promised in a comment.
 *
 *   1. **Nothing installs without a stated choice.** There is no default and no
 *      "both, since you did not say". `normaliseChoice` refuses an empty choice
 *      and refuses a word that is not a piece, so a run that installs anything
 *      installs exactly what somebody named.
 *   2. **The files are the table.** `phyllum:init-files` holds both generated
 *      files line by line, with the indent each line carries. This module joins
 *      rows; it composes no shell and no YAML of its own, so what the plumbing
 *      runs is edited in the reference rather than buried in a renderer.
 *   3. **What they run already exists.** `phyllum assess drift` and `phyllum
 *      assess score` are shipped, read-only and exit zero by construction. A
 *      generated file naming a check the CLI does not have would be the
 *      never-invent rule broken in somebody else's repository.
 *   4. **An occupied path is a question.** A hook or a workflow Phyllum did not
 *      write is left where it is and reported, and replacing it takes an
 *      explicit `replace`. A tool that overwrites somebody's pre-commit hook has
 *      destroyed work it was never asked about.
 *   5. **The two paths are named in the funnel, by name.** `lib/write.js` admits
 *      them under the init flag and by equality, and `writeEnforcementFile` is
 *      the only door. This module never reaches `writeGuarded` itself.
 *
 * `planInit` derives and reaches no writer; `writeEnforcement` is the write, and
 * the acceptance in between is the skill's.
 */

import fs from 'node:fs';
import path from 'node:path';

import { isNone, numberCell, stripTicks, tableAfter as readTable } from './md-tables.js';
import { readRef, refFileOf } from './refs.js';
import { ENFORCEMENT_FILES, HOOK_FILE, writeEnforcementFile } from './write.js';

/** The stage folder these tables live in. */
export const GOVERN_REF = 'govern';

export const MARKERS = {
  pieces: '<!-- phyllum:init-pieces -->',
  files: '<!-- phyllum:init-files -->',
  copy: '<!-- phyllum:init-copy -->',
};

const tableAfter = (text, marker) => readTable(text, marker, refFileOf(marker, GOVERN_REF));

/**
 * The three tables, read out of text rather than off disk.
 *
 * Split out for the reason `parseGovernLogSpec` and `parseGovernDocsSpec` are:
 * the malformed-input sweep exercises the reader against doctored text, and
 * doctoring text is not the same as writing inside the package.
 */
export function parseGovernInitSpec(text) {
  const pieces = tableAfter(text, MARKERS.pieces).map(([piece, file, runs, blocks, why]) => ({
    piece: stripTicks(piece),
    path: stripTicks(file),
    runs: String(runs ?? '').trim(),
    // Read rather than assumed. Both pieces report today, and a row that ever
    // said otherwise would be a row this module has to notice rather than one it
    // can render past.
    blocks: String(blocks ?? '').trim().toLowerCase() === 'yes',
    why: String(why ?? '').trim(),
  }));

  const files = tableAfter(text, MARKERS.files).map(([piece, indent, line]) => ({
    piece: stripTicks(piece),
    indent: indentCell(indent, stripTicks(piece)),
    // The em dash is the table's spelling of a blank line. Everything else is
    // taken as it stands — no tick stripping, because a backtick inside a shell
    // comment is a character in that comment.
    line: isNone(String(line ?? '').trim()) ? '' : String(line ?? '').trim(),
  }));

  const copy = Object.fromEntries(
    tableAfter(text, MARKERS.copy).map(([line, printed]) => [
      stripTicks(line),
      String(printed ?? '').trim(),
    ]),
  );

  return { pieces, files, copy };
}

/** An `Indent` cell is a whole number of spaces, zero included. */
function indentCell(cell, piece) {
  const indent = numberCell(cell ?? '');
  if (!Number.isInteger(indent) || indent < 0) {
    throw new Error(
      `${refFileOf(MARKERS.files, GOVERN_REF)}: "${cell}" is not an indent for "${piece}" — an Indent cell is a whole number of spaces`,
    );
  }
  return indent;
}

let specCache = null;

/** The tables, read once. The reference tree is Phyllum's own and does not change. */
export function governInitSpec() {
  if (!specCache) specCache = parseGovernInitSpec(readRef(GOVERN_REF));
  return specCache;
}

/** Forget the tables — the hostile-input sweeps rebuild them against doctored text. */
export function reloadGovernInitSpec() {
  specCache = null;
}

/** The pieces the mode installs, in table order. */
export const initPieces = () => governInitSpec().pieces;

/** The piece names, in table order — the closed list a choice is checked against. */
export const pieceNames = () => initPieces().map((row) => row.piece);

/** One piece's row by name, or null — a piece nothing declares is one nothing installs. */
export const initPieceFor = (piece) =>
  initPieces().find((row) => row.piece === String(piece ?? '').trim().toLowerCase()) ?? null;

/** One fixed line, by its name in the copy table. */
export function copyLine(name) {
  const line = governInitSpec().copy[name];
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

/** The word that means "every piece", straight from the copy table. */
export const bothWord = () => copyLine('both');

// ---------------------------------------------------------------------------
// The failures
// ---------------------------------------------------------------------------

/** A choice that names no piece, or names something that is not one. */
export class InitChoiceError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'InitChoiceError';
    Object.assign(this, detail);
  }
}

/**
 * A path that already holds something Phyllum did not write.
 *
 * Deliberately not a `PermissionError`: the funnel would have allowed the path.
 * What is refused is writing over work somebody else did, and the refusal names
 * the file so the answer is "look at it" rather than "try again".
 */
export class InitConflictError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'InitConflictError';
    Object.assign(this, detail);
  }
}

// ---------------------------------------------------------------------------
// The choice
// ---------------------------------------------------------------------------

/**
 * The pieces a choice names, in table order.
 *
 * A string, a list of strings, or the word both. An empty choice is refused
 * rather than resolved to a default, because the default a setup step picks for
 * itself is the file the user finds later and did not ask for.
 */
export function normaliseChoice(choice) {
  const declared = pieceNames();
  const asked = (Array.isArray(choice) ? choice : [choice])
    .flatMap((item) => String(item ?? '').split(','))
    .map((item) => stripTicks(item).toLowerCase())
    .filter((item) => item !== '');

  if (asked.length === 0) {
    throw new InitChoiceError(fillLine(copyLine('no-choice'), { pieces: declared.join(' or ') }));
  }

  const wanted = new Set();
  for (const item of asked) {
    if (item === bothWord()) {
      for (const piece of declared) wanted.add(piece);
      continue;
    }
    if (!declared.includes(item)) {
      throw new InitChoiceError(
        fillLine(copyLine('unknown-piece'), { piece: item, pieces: declared.join(', ') }),
        { piece: item },
      );
    }
    wanted.add(item);
  }

  // Table order, never the order the caller happened to type: the plan reads the
  // same way whichever way it was asked for.
  return declared.filter((piece) => wanted.has(piece));
}

// ---------------------------------------------------------------------------
// The files
// ---------------------------------------------------------------------------

/**
 * One piece's file as text, rendered from the table.
 *
 * A blank line is emitted as an empty line rather than as its indent, so no
 * generated file carries trailing whitespace on a line that holds nothing.
 */
export function renderPiece(piece) {
  const row = initPieceFor(piece);
  if (!row) {
    throw new InitChoiceError(
      fillLine(copyLine('unknown-piece'), { piece: String(piece ?? ''), pieces: pieceNames().join(', ') }),
      { piece: String(piece ?? '') },
    );
  }
  const lines = governInitSpec()
    .files.filter((entry) => entry.piece === row.piece)
    .map((entry) => (entry.line === '' ? '' : `${' '.repeat(entry.indent)}${entry.line}`));
  if (lines.length === 0) {
    throw new Error(`${refFileOf(MARKERS.files, GOVERN_REF)} declares no lines for "${row.piece}"`);
  }
  return `${lines.join('\n')}\n`;
}

/** What is at one piece's path today, or null when nothing is. */
export function readAt(root, rel) {
  try {
    return fs.readFileSync(path.join(path.resolve(root), ...rel.split('/')), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Does this project have somewhere to put a pre-commit hook?
 *
 * `.git/hooks/` exists in every repository git makes, so its absence means this
 * is not one. `govern init` reports that and installs nothing rather than
 * creating the directory: a tool that makes a `.git/` is a tool that has
 * initialised a repository nobody asked for.
 */
export function hasHooksDir(root) {
  try {
    return fs.statSync(path.join(path.resolve(root), '.git', 'hooks')).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The derivation, and the write
// ---------------------------------------------------------------------------

/**
 * What `govern init` *would* write, having written nothing.
 *
 * Holds no writer and reaches none, exactly as `planAppend` and `planDocs` do:
 * the proposal is what the skill shows before it asks, and the acceptance is
 * what turns it into a call to `writeEnforcement`.
 *
 * Every chosen piece comes back with a state, and there are four:
 *
 *   - `writes: true` — the path is empty and the piece is installed.
 *   - `writes: false, unchanged: true` — the path already holds exactly this,
 *     so a second run changes nothing rather than rewriting identical bytes.
 *   - `writes: false, conflict: true` — the path holds something else, and
 *     nothing happens until the user says to replace it.
 *   - `writes: false, blocked: true` — there is nowhere to put it. Today that
 *     is the hook in a directory that is not a repository.
 */
export function planInit(root, choice, options = {}) {
  const chosen = normaliseChoice(choice);
  const replace = replacementSet(options.replace);

  const pieces = chosen.map((piece) => {
    const row = initPieceFor(piece);
    const contents = renderPiece(piece);
    const base = { piece, path: row.path, runs: row.runs, contents };

    if (row.path === HOOK_FILE && !hasHooksDir(root)) {
      return { ...base, writes: false, unchanged: false, conflict: false, blocked: true, reason: copyLine('not-a-repo') };
    }

    const current = readAt(root, row.path);
    if (current === contents) {
      return {
        ...base,
        writes: false,
        unchanged: true,
        conflict: false,
        blocked: false,
        reason: fillLine(copyLine('unchanged'), { path: row.path }),
      };
    }
    if (current !== null && !replace.has(piece)) {
      return {
        ...base,
        writes: false,
        unchanged: false,
        conflict: true,
        blocked: false,
        reason: fillLine(copyLine('conflict'), { path: row.path }),
      };
    }
    return {
      ...base,
      writes: true,
      unchanged: false,
      conflict: false,
      blocked: false,
      replaces: current !== null,
      reason: null,
    };
  });

  return { chosen, pieces, writes: pieces.some((piece) => piece.writes) };
}

/** Which pieces the caller has been told, by a person, that it may replace. */
function replacementSet(replace) {
  if (replace === true) return new Set(pieceNames());
  if (!replace) return new Set();
  return new Set(normaliseChoice(replace));
}

/**
 * Install the pieces the user asked for.
 *
 * The plan is derived, and only then does the funnel see the text. A piece that
 * would change nothing writes nothing at all, and a piece whose path is occupied
 * refuses out loud rather than deciding for anybody — `replace` is what a stated
 * permission looks like, and it names the pieces rather than being a blanket
 * yes.
 */
export function writeEnforcement(root, choice, options = {}) {
  const plan = planInit(root, choice, options);

  const conflicted = plan.pieces.filter((piece) => piece.conflict);
  if (conflicted.length > 0) {
    throw new InitConflictError(
      conflicted
        .map((piece) => fillLine(copyLine('no-replacement'), { path: piece.path }))
        .join(' '),
      { paths: conflicted.map((piece) => piece.path) },
    );
  }

  const written = [];
  for (const piece of plan.pieces) {
    if (!piece.writes) continue;
    writeEnforcementFile(root, piece.path, piece.contents);
    written.push(piece.path);
  }
  return { ...plan, written };
}

/** The two paths the mode may ever touch, straight from the funnel's own list. */
export const enforcementPaths = () => [...ENFORCEMENT_FILES];
