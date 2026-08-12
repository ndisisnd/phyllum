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
