/**
 * The write funnel (plan §1, §7.1).
 *
 * Every filesystem write the CLI performs goes through this file, and this
 * file refuses any target outside the permission model:
 *
 *   DESIGN-SYSTEM.md            always — the one file in your codebase
 *   .phyllum/**                   always — Phyllum's own session state
 *   .claude/skills/phyllum/**     init only — the skill install
 *   .gitignore                  init only, and only to append one `.phyllum/` line
 *
 * Nothing else, ever. The assertion suite greps the rest of bin/ and lib/ for
 * direct fs write calls, so this rule cannot be quietly worked around.
 */

import fs from 'node:fs';
import path from 'node:path';

export const DESIGN_SYSTEM_FILE = 'DESIGN-SYSTEM.md';
export const STATE_DIR = '.phyllum';
/**
 * `apply`'s plan (v0.2.0 plan §6.5.1). It lives inside `.phyllum/`, which is
 * already gitignored and already inside the permission model — so Phyllum's
 * first write-to-code command still adds no new write target. The PRD is a plan
 * about the codebase, never a change to it.
 */
export const PRD_FILE = `${STATE_DIR}/PRD.md`;
export const SKILL_INSTALL_DIR = '.claude/skills/phyllum';
export const GITIGNORE_FILE = '.gitignore';
export const GITIGNORE_LINE = '.phyllum/';

export class PermissionError extends Error {
  constructor(relPath) {
    super(
      `Phyllum refused to write "${relPath}". Phyllum only ever writes DESIGN-SYSTEM.md, ` +
        '.phyllum/**, and — during init only — .claude/skills/phyllum/** plus one .gitignore line.',
    );
    this.name = 'PermissionError';
    this.relPath = relPath;
  }
}

/** Normalise a path to a posix-style path relative to the project root. */
function relativise(root, target) {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, target);
  const rel = path.relative(absRoot, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/** Is this relative path inside the permission model? */
export function isAllowedPath(rel, { init = false } = {}) {
  if (!rel) return false;
  if (rel === DESIGN_SYSTEM_FILE) return true;
  if (rel === STATE_DIR || rel.startsWith(`${STATE_DIR}/`)) return true;
  if (init && (rel === SKILL_INSTALL_DIR || rel.startsWith(`${SKILL_INSTALL_DIR}/`))) return true;
  if (init && rel === GITIGNORE_FILE) return true;
  return false;
}

let tempCounter = 0;

/** The name of a temp file belonging to `abs`, and the pattern that finds one. */
const tempPattern = /\.phyllum-tmp-\d+-\d+$/;

/**
 * The stages of an atomic write, in order. Each one is an injection point for
 * the fault sweep (plan §8.5, "atomic writes"): interrupting any of them must
 * leave the previous DESIGN-SYSTEM.md intact and parseable.
 */
export const WRITE_STAGES = [
  'before-temp-write', // nothing has touched the disk yet
  'during-temp-write', // the temp file is half written
  'after-temp-write', // the temp file is complete, the target untouched
  'before-rename', // the swap is about to happen
  'after-rename', // the swap happened; the new file is the live one
];

export class InjectedFault extends Error {
  constructor(stage) {
    super(`injected write fault at stage "${stage}"`);
    this.name = 'InjectedFault';
    this.stage = stage;
  }
}

/**
 * Remove temp files left beside `abs` by a process that died mid-write. A hard
 * crash (SIGKILL) skips the `finally` below, so without this a killed run would
 * leave litter in the user's project forever. Only this module's own temp
 * pattern is ever removed, and only beside a path already inside the model.
 */
function sweepStaleTemps(abs) {
  const dir = path.dirname(abs);
  const base = `${path.basename(abs)}.phyllum-tmp-`;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const swept = [];
  for (const entry of entries) {
    if (!entry.startsWith(base) || !tempPattern.test(entry)) continue;
    fs.rmSync(path.join(dir, entry), { force: true });
    swept.push(entry);
  }
  return swept;
}

/**
 * Write a file atomically: temp file beside the target, then rename. A crash
 * mid-write can therefore never leave a half-written DESIGN-SYSTEM.md behind.
 *
 * `faultAt` is the fault-injection hook the sweep drives — one of WRITE_STAGES.
 * `faultAfterTempWrite: true` is the older spelling of `faultAt:
 * 'after-temp-write'` and still works.
 */
export function writeGuarded(
  root,
  relPath,
  contents,
  { init = false, faultAfterTempWrite = false, faultAt = null } = {},
) {
  const rel = relativise(root, relPath);
  if (!isAllowedPath(rel, { init })) throw new PermissionError(relPath);

  const stage = faultAt ?? (faultAfterTempWrite ? 'after-temp-write' : null);
  if (stage !== null && !WRITE_STAGES.includes(stage)) {
    throw new Error(`unknown write stage "${stage}" — one of ${WRITE_STAGES.join(', ')}`);
  }

  const abs = path.join(path.resolve(root), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  sweepStaleTemps(abs);

  if (stage === 'before-temp-write') throw new InjectedFault(stage);

  tempCounter += 1;
  const temp = `${abs}.phyllum-tmp-${process.pid}-${tempCounter}`;
  try {
    if (stage === 'during-temp-write') {
      const text = String(contents);
      fs.writeFileSync(temp, text.slice(0, Math.floor(text.length / 2)));
      throw new InjectedFault(stage);
    }
    fs.writeFileSync(temp, contents);
    if (stage === 'after-temp-write' || stage === 'before-rename') throw new InjectedFault(stage);
    fs.renameSync(temp, abs);
    if (stage === 'after-rename') throw new InjectedFault(stage);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
  return rel;
}

/** Create a directory inside the permission model. */
export function mkdirGuarded(root, relPath, { init = false } = {}) {
  const rel = relativise(root, relPath);
  if (!isAllowedPath(rel, { init })) throw new PermissionError(relPath);
  fs.mkdirSync(path.join(path.resolve(root), rel), { recursive: true });
  return rel;
}

/**
 * Append the single `.phyllum/` line to .gitignore (init only).
 * Returns 'added' | 'already-present' | 'created'.
 */
export function appendGitignoreLine(root, { faultAfterTempWrite = false, faultAt = null } = {}) {
  const abs = path.join(path.resolve(root), GITIGNORE_FILE);
  const existed = fs.existsSync(abs);
  const current = existed ? fs.readFileSync(abs, 'utf8') : '';
  const lines = current.split('\n').map((line) => line.trim());
  if (lines.includes(GITIGNORE_LINE)) return 'already-present';

  const prefix = current === '' || current.endsWith('\n') ? current : `${current}\n`;
  writeGuarded(root, GITIGNORE_FILE, `${prefix}${GITIGNORE_LINE}\n`, {
    init: true,
    faultAfterTempWrite,
    faultAt,
  });
  return existed ? 'added' : 'created';
}

/** Write DESIGN-SYSTEM.md — the common case, spelled out for readability. */
export function writeDesignSystem(root, contents, options = {}) {
  return writeGuarded(root, DESIGN_SYSTEM_FILE, contents, options);
}

/** Write `apply`'s PRD — the only write `apply` performs. */
export function writePrd(root, contents, options = {}) {
  return writeGuarded(root, PRD_FILE, contents, options);
}

// ---------------------------------------------------------------------------
// Source files — the one deliberate widening, and its four locks (v0.2.0 §6.5)
// ---------------------------------------------------------------------------

/**
 * `apply run` writes source files. That is the scope change v0.2.0 makes, and
 * this is the only door it opens.
 *
 * The widening is not "Phyllum may now write source". It is: **a single running
 * phase of `apply run` may write the specific files that phase's acceptance
 * criteria name, on a Phyllum work branch, and nowhere else.** Four locks, all
 * checked on every write rather than trusted to the caller:
 *
 *   1. **A grant.** There is no path-only spelling of this call. A caller must
 *      hold a grant object minted by `openSourceGrant`, and the funnel checks the
 *      object it was handed is one of those — a look-alike is refused.
 *   2. **A Phyllum work branch.** The grant carries a `head()` reader, and the
 *      funnel calls it at write time. If the repository is no longer standing on
 *      the `phyllum/apply-*` branch the grant was opened for — because the branch
 *      changed underneath, or because a caller lied when opening it — the write
 *      is refused. The user's own branch cannot be written to by construction.
 *   3. **A file the phase named.** The grant carries the phase's file set,
 *      derived from its criteria. A path outside it is refused even on the right
 *      branch, so a phase cannot widen itself mid-flight.
 *   4. **Inside the project, and never Phyllum's or git's own state.** No escape
 *      above the root, nothing under `.git/`, and nothing under `.phyllum/` —
 *      state has its own funnel above and is not source.
 *
 * The grant is closed when the phase ends, so the door is shut between phases as
 * well as between runs.
 */
export const APPLY_BRANCH_PREFIX = 'phyllum/apply-';

/** Grants minted here, so a hand-rolled object cannot be passed off as one. */
const grants = new WeakSet();

export class SourceWriteError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'SourceWriteError';
    Object.assign(this, detail);
  }
}

/**
 * Open the door for one phase.
 *
 * `branch` is the work branch, `phase` the phase number it belongs to, `files`
 * the exact relative paths that phase's criteria name, and `head` a function
 * returning the branch the repository is standing on right now (git lives in
 * `lib/git.js`; this module never runs a process).
 */
export function openSourceGrant({ branch, phase, files = [], head }) {
  if (typeof branch !== 'string' || !branch.startsWith(APPLY_BRANCH_PREFIX)) {
    throw new SourceWriteError(
      `Phyllum refused to open a source-write grant for "${branch}". Source writes happen only on a ` +
        `\`${APPLY_BRANCH_PREFIX}*\` branch — never on the branch you are standing on.`,
      { branch },
    );
  }
  if (typeof head !== 'function') {
    throw new SourceWriteError(
      'Phyllum refused to open a source-write grant with no way to re-check the current branch.',
    );
  }
  const grant = Object.freeze({
    branch,
    phase: Number(phase),
    files: new Set([...files].map((file) => String(file).split(path.sep).join('/'))),
    head,
    closed: { value: false },
  });
  grants.add(grant);
  return grant;
}

/** Shut the door. A closed grant refuses every further write. */
export function closeSourceGrant(grant) {
  if (grants.has(grant)) grant.closed.value = true;
  return grant;
}

export function grantAllows(grant, rel) {
  return grants.has(grant) && grant.closed.value === false && grant.files.has(rel);
}

/** Paths that are never source, whatever a criterion says. */
function isNeverSource(rel) {
  if (rel === STATE_DIR || rel.startsWith(`${STATE_DIR}/`)) return true;
  if (rel === '.git' || rel.startsWith('.git/')) return true;
  return false;
}

/**
 * Write one source file, under a grant. Atomic, like every other write here.
 *
 * Refusals are `SourceWriteError` and say which lock closed, because "Phyllum
 * refused to write your file" is only trustworthy if it says why.
 */
export function writeSourceGuarded(root, relPath, contents, grant) {
  if (!grants.has(grant)) {
    throw new SourceWriteError(
      `Phyllum refused to write "${relPath}". A source write needs a grant from an \`apply run\` phase, ` +
        'and nothing else in Phyllum can open one.',
      { relPath },
    );
  }
  if (grant.closed.value) {
    throw new SourceWriteError(
      `Phyllum refused to write "${relPath}". Phase ${grant.phase}'s grant is closed — a phase cannot ` +
        'write after it has finished.',
      { relPath, phase: grant.phase },
    );
  }

  const onBranch = grant.head();
  if (onBranch !== grant.branch) {
    throw new SourceWriteError(
      `Phyllum refused to write "${relPath}". The grant was opened for \`${grant.branch}\` but the ` +
        `repository is on \`${onBranch ?? 'no branch'}\` — source writes never happen off the work branch.`,
      { relPath, expected: grant.branch, actual: onBranch },
    );
  }

  const rel = relativise(root, relPath);
  if (rel === null) {
    throw new SourceWriteError(
      `Phyllum refused to write "${relPath}". It resolves outside the project.`,
      { relPath },
    );
  }
  if (isNeverSource(rel)) {
    throw new SourceWriteError(
      `Phyllum refused to write "${rel}". Phyllum's own state and git's own directory are not source files.`,
      { relPath: rel },
    );
  }
  if (!grant.files.has(rel)) {
    throw new SourceWriteError(
      `Phyllum refused to write "${rel}". Phase ${grant.phase} may only write the files its acceptance ` +
        `criteria name: ${[...grant.files].join(', ') || 'none'}.`,
      { relPath: rel, phase: grant.phase },
    );
  }

  const abs = path.join(path.resolve(root), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  sweepStaleTemps(abs);
  tempCounter += 1;
  const temp = `${abs}.phyllum-tmp-${process.pid}-${tempCounter}`;
  try {
    fs.writeFileSync(temp, contents);
    fs.renameSync(temp, abs);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
  return rel;
}
