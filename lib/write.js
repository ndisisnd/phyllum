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

/**
 * The one-undo-ago copy of the design system (v0.2.1 plan §6.5.2).
 *
 * Every edit to `DESIGN-SYSTEM.md` copies the current file here first, so the
 * state before the most recent edit is always on disk. It is deliberately one
 * file and not a history: a stack of timestamped backups is a directory nobody
 * prunes and nobody reads, and the failure this protects against — an accepted
 * suggestion that turned out to be wrong — is always noticed immediately.
 */
export const BACKUP_FILE = `${DESIGN_SYSTEM_FILE}.bak`;

/** `assess --json`'s default target (§6.5.1); inside `.phyllum/` already. */
export const ASSESS_JSON_FILE = `${STATE_DIR}/assess.json`;

/**
 * The numbered drift reports the Assess stage leaves behind (v0.9.0 phase 1).
 *
 * `.phyllum/assess-1.md`, `.phyllum/assess-2.md`, and so on. Named here rather
 * than only in `lib/assess-reports.js` for the same reason `ASSESS_JSON_FILE`
 * is: this file is the list of things Phyllum may write, and a target that is
 * not on the list is a target nobody can audit. It needs no widening — the
 * whole of `.phyllum/**` is already inside the model — so the stage that writes
 * reports adds no new permission, only a new name for one Phyllum already had.
 */
export const ASSESS_REPORT_PREFIX = `${STATE_DIR}/assess-`;

/** The path of report `n`. The numbering itself lives in assess-reports.js. */
export function assessReportFile(number) {
  return `${ASSESS_REPORT_PREFIX}${number}.md`;
}

export class PermissionError extends Error {
  /**
   * `verb` is 'write' for every writer here and 'remove' for the one remover
   * (v0.7.1 §3). A refusal has to name the act it refused: telling somebody
   * Phyllum "refused to write" a file it was asked to *delete* sends them
   * looking for a write that was never attempted.
   */
  constructor(relPath, reason = null, verb = 'write') {
    super(
      reason
        ? `Phyllum refused to ${verb} "${relPath}". ${reason}`
        : `Phyllum refused to ${verb} "${relPath}". Phyllum only ever writes DESIGN-SYSTEM.md, ` +
            '.phyllum/**, and — during init only — .claude/skills/phyllum/** plus one .gitignore line.',
    );
    this.name = 'PermissionError';
    this.relPath = relPath;
    this.reason = reason;
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

/**
 * A path `assess --json` may write, when the user names one.
 *
 * The third deliberate widening of the permission model, and the smallest.
 * `--json` exists to be read by something else — CI, a script, another tool —
 * so pinning its output inside `.phyllum/` would make the flag useless for the
 * only thing it is for. What keeps the widening honest is that the path is
 * always **typed by the user on the command line**, never derived: Phyllum
 * cannot choose to write a JSON file somewhere, it can only be told to.
 *
 * Four locks on the path itself. It stays inside the project (`relativise`
 * already refused anything above the root), it ends in `.json`, it is not the
 * design system or its backup under another spelling, and it is not inside
 * `.git` or the skill install — the two directories where a stray write would
 * damage something other than the user's own file.
 */
export function isAllowedJsonPath(rel) {
  if (!rel || !rel.toLowerCase().endsWith('.json')) return false;
  if (rel === DESIGN_SYSTEM_FILE || rel === BACKUP_FILE) return false;
  if (rel === '.git' || rel.startsWith('.git/')) return false;
  if (rel === '.claude' || rel.startsWith('.claude/')) return false;
  return true;
}

/**
 * Which of the four locks closed on a `--json` path, in the user's words.
 *
 * A refusal that recites the general permission model is a refusal that names
 * the wrong rule: somebody who typed `--json report.txt` did not break the
 * "Phyllum only writes DESIGN-SYSTEM.md" rule, they broke the one lock that
 * applies to the flag they used. Each lock states itself, and the fix follows
 * from the sentence.
 */
export function jsonRefusalReason(rel, typed) {
  if (rel === null) {
    return `\`--json\` writes inside the project, and "${typed}" resolves outside it.`;
  }
  // The design system is checked before the suffix, though it fails both: a
  // user who typed their own design system as the output path needs to hear
  // that Phyllum will not write it, not that it lacks a file extension.
  if (rel === DESIGN_SYSTEM_FILE || rel === BACKUP_FILE) {
    return `\`--json\` never writes ${rel} — the assessment is read-only about your design system.`;
  }
  if (!rel.toLowerCase().endsWith('.json')) {
    return '`--json` writes a `.json` file, and that path does not end in `.json`.';
  }
  return '`--json` never writes inside `.git/` or `.claude/`, whatever the filename.';
}

/**
 * Is this relative path inside the permission model?
 *
 * `json` is a *different* set of allowed paths, not an extra one bolted onto
 * the general set — and getting that wrong was a live bug until M6. The general
 * rules were checked first, so `DESIGN-SYSTEM.md` matched the very first line
 * and `phyllum assess --json DESIGN-SYSTEM.md` overwrote the user's design
 * system with the assessment of it, took a `.bak` of the file it was about to
 * destroy, and reported success. `isAllowedJsonPath` had refused that path all
 * along; nothing ever asked it.
 *
 * So when the caller is the JSON writer, the JSON rule is the only rule. There
 * is no path that `--json` may write *because* some other command may write it.
 */
export function isAllowedPath(rel, { init = false, json = false } = {}) {
  if (!rel) return false;
  if (json) return isAllowedJsonPath(rel);
  if (rel === DESIGN_SYSTEM_FILE) return true;
  // The backup is not a fifth kind of write; it is the same write's safety
  // net, and it lives beside the only file it copies.
  if (rel === BACKUP_FILE) return true;
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
 * A backup that could not be taken, and therefore an edit that did not happen.
 *
 * The half that failed is carried on the error rather than flattened into one
 * sentence, because the two halves are two different problems with two
 * different fixes. A backup can fail because the *source* could not be read —
 * the design system itself is unreadable, and the edit was never going to work
 * either — or because the *copy* could not be written, which is a read-only
 * directory or a full disk and has nothing to do with the design system at all.
 * Telling a user "Phyllum could not write the backup" when the real problem is
 * that their own file is unreadable sends them to fix the wrong thing.
 */
export class BackupError extends Error {
  constructor(cause, stage = 'write') {
    const why = cause?.code ?? cause?.message ?? 'unknown reason';
    super(
      stage === 'read'
        ? `Phyllum could not read ${DESIGN_SYSTEM_FILE} to back it up (${why}), so it did not edit it ` +
            'either. Nothing was changed.'
        : `Phyllum could not write ${BACKUP_FILE}, so it did not edit ${DESIGN_SYSTEM_FILE} either ` +
            `(${why}). Nothing was changed.`,
    );
    this.name = 'BackupError';
    this.cause = cause;
    /** 'read' — the design system; 'write' — the backup beside it. */
    this.stage = stage;
    this.code = cause?.code ?? null;
  }
}

/**
 * Copy the current design system to `DESIGN-SYSTEM.md.bak` before it is edited
 * (v0.2.1 plan §6.5.2).
 *
 * Three decisions worth stating, because each one is the opposite of what a
 * backup feature usually does.
 *
 * **It lives in the funnel, not in the commands.** `create`, `tokenise`, the
 * review loop and `assess update` all edit the same file, and a future writer
 * will too. A backup each of them remembers to take is a backup one of them
 * eventually forgets; a backup the single write path takes is one none of them
 * can skip, because there is no other way to write that file.
 *
 * **A failed backup aborts the edit.** Not a warning, not a best effort. The
 * whole value of the file is that it exists at the moment somebody wants it, so
 * a write that proceeds without one has quietly removed the safety it claims to
 * provide. A read-only directory or a full disk stops the edit, and the error
 * says both halves: the backup failed, and nothing was changed.
 *
 * **There is nothing to back up on the first write.** A design system being
 * created has no previous state, so no `.bak` is written and none is expected.
 */
/**
 * The stages of taking a backup, in order — the same idea as `WRITE_STAGES`,
 * for the write that happens before them (v0.2.1 M6).
 *
 * The backup needed its own injection points rather than borrowing the edit's,
 * because the two writes fail in opposite directions. An interrupted *edit* must
 * leave the previous design system on disk; an interrupted *backup* must leave
 * the previous design system **unedited**, which is a stronger claim and the
 * only one that makes "a failed backup aborts the edit" testable rather than
 * merely stated.
 */
export const BACKUP_STAGES = [
  'before-backup-read', // nothing has been read yet
  'before-backup-write', // the file is in memory, nothing on disk
  'during-backup-write', // the backup's temp file is half written
  'after-backup-write', // the temp file is complete, the .bak untouched
  'after-backup-rename', // the .bak is in place; the edit has still not happened
];

function backupDesignSystem(root, faultAt = null) {
  if (faultAt !== null && !BACKUP_STAGES.includes(faultAt)) {
    throw new Error(`unknown backup stage "${faultAt}" — one of ${BACKUP_STAGES.join(', ')}`);
  }

  const absRoot = path.resolve(root);
  const source = path.join(absRoot, DESIGN_SYSTEM_FILE);
  if (!fs.existsSync(source)) return null;

  if (faultAt === 'before-backup-read') throw new BackupError(new InjectedFault(faultAt), 'read');

  let contents;
  try {
    contents = fs.readFileSync(source);
  } catch (error) {
    throw new BackupError(error, 'read');
  }

  if (faultAt === 'before-backup-write') throw new BackupError(new InjectedFault(faultAt));

  const abs = path.join(absRoot, BACKUP_FILE);
  tempCounter += 1;
  const temp = `${abs}.phyllum-tmp-${process.pid}-${tempCounter}`;
  try {
    // Atomic, like every other write here: a half-written backup is worse than
    // none, because it looks like one.
    if (faultAt === 'during-backup-write') {
      fs.writeFileSync(temp, contents.subarray(0, Math.floor(contents.length / 2)));
      throw new InjectedFault(faultAt);
    }
    fs.writeFileSync(temp, contents);
    if (faultAt === 'after-backup-write') throw new InjectedFault(faultAt);
    fs.renameSync(temp, abs);
  } catch (error) {
    throw new BackupError(error);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }

  // The last stage is past the rename on purpose. The `.bak` is now correct and
  // the edit still has not started, so this is the one interruption where the
  // user ends up with a backup of a file nothing ever changed — harmless, and
  // worth proving harmless rather than assuming it.
  if (faultAt === 'after-backup-rename') throw new BackupError(new InjectedFault(faultAt));

  return BACKUP_FILE;
}

/**
 * Write a file atomically: temp file beside the target, then rename. A crash
 * mid-write can therefore never leave a half-written DESIGN-SYSTEM.md behind.
 *
 * Since v0.2.1 an edit to `DESIGN-SYSTEM.md` is preceded by a copy of the
 * current file to `DESIGN-SYSTEM.md.bak` — always one undo ago, always taken
 * here rather than by the caller, and a failure to take it aborts the edit.
 *
 * `faultAt` is the fault-injection hook the sweep drives — one of WRITE_STAGES.
 * `faultAfterTempWrite: true` is the older spelling of `faultAt:
 * 'after-temp-write'` and still works.
 */
export function writeGuarded(
  root,
  relPath,
  contents,
  {
    init = false,
    json = false,
    faultAfterTempWrite = false,
    faultAt = null,
    backupFaultAt = null,
    backup = true,
  } = {},
) {
  const rel = relativise(root, relPath);
  if (!isAllowedPath(rel, { init, json })) throw new PermissionError(relPath);

  // Before anything else, and only for the one file that has a previous state
  // worth keeping. The backup is taken ahead of every fault stage on purpose:
  // an interrupted edit is exactly the case the file exists for.
  //
  // `backup: false` is for a caller writing this file more than once in one run
  // — `tokenise`'s proposal queue, which writes once per accepted token. The
  // backup it wants is the file as it stood before the whole run, so it takes it
  // on the first write and declines it on the rest; taking it every time would
  // leave an "undo" that only undoes the last value of a batch (v0.3.0 §3.3).
  if (rel === DESIGN_SYSTEM_FILE && backup) backupDesignSystem(root, backupFaultAt);

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
 * Remove one file from the skill install (v0.7.1 §3 — `upgrade`'s prune).
 *
 * The funnel had no delete until now, and that was not an oversight: for six
 * releases Phyllum only ever added. `upgrade` needs one, because `installSkill`
 * copies over the top and leaves behind every file an older version shipped and
 * this one dropped — Claude then reads that orphan as current guidance, and no
 * number of `upgrade` runs clears it.
 *
 * A delete is the most dangerous thing a tool can do to somebody's project, so
 * this door is narrower than every write door above it, not merely as narrow:
 *
 *   1. **The same gate as the writers.** `isAllowedPath` decides, exactly as it
 *      does for `writeGuarded`, so there is no second permission model to keep
 *      in step with the first. The skill install sits behind `init: true`, which
 *      means "a skill-install context" — `upgrade` already re-syncs under that
 *      flag, because its re-sync calls `installSkill`.
 *   2. **Inside the skill install, and nothing else.** The gate alone would also
 *      admit `DESIGN-SYSTEM.md`, its backup and `.phyllum/**`. Those are files
 *      Phyllum may *write*; none of them is a file Phyllum may delete. Only the
 *      copy `init` made is prunable.
 *   3. **Never the install root.** Removing `.claude/skills/phyllum/` itself is
 *      uninstalling, not pruning, and `upgrade` is not an uninstaller.
 *
 * **Empty directories left behind are removed.** The decision, stated because
 * it could reasonably have gone the other way: when the last file in a
 * subdirectory of the copy goes, the directory goes with it. That directory was
 * created by `installSkill` for a ref folder this version no longer ships, so
 * leaving it behind leaves a piece of an old release's shape in the copy —
 * exactly the stale-structure problem the prune exists to end. Two things keep
 * it safe. It only ever walks *upwards* from a file already inside the install,
 * and it stops at the install root, so nothing outside the copy is reachable.
 * And it uses `rmdir`, which refuses a directory that still has anything in it,
 * so a folder holding a file the user added cannot be swept away by accident.
 *
 * Returns the relative paths actually removed: the file first, then any
 * directories that were emptied by removing it.
 */
export function removeGuarded(root, relPath, { init = false } = {}) {
  const rel = relativise(root, relPath);
  if (!isAllowedPath(rel, { init })) {
    throw new PermissionError(
      relPath,
      `Phyllum only ever removes files inside ${SKILL_INSTALL_DIR}/, and only during a skill install.`,
      'remove',
    );
  }
  if (rel !== SKILL_INSTALL_DIR && !rel.startsWith(`${SKILL_INSTALL_DIR}/`)) {
    throw new PermissionError(
      relPath,
      `Phyllum only ever removes files inside ${SKILL_INSTALL_DIR}/. Every other path in the ` +
        'permission model is one Phyllum may write, never one it may delete.',
      'remove',
    );
  }
  if (rel === SKILL_INSTALL_DIR) {
    throw new PermissionError(
      relPath,
      `Removing ${SKILL_INSTALL_DIR}/ itself is uninstalling the skill, not pruning it, and ` +
        '`upgrade` never does that.',
      'remove',
    );
  }

  const absRoot = path.resolve(root);
  const abs = path.join(absRoot, rel);
  const removed = [rel];
  // Not recursive, deliberately. Everything the prune names is a file (a symlink
  // included, which is unlinked rather than followed); a directory that somehow
  // arrived here would fail rather than take its contents with it.
  fs.rmSync(abs, { force: true });

  // Upwards from the file, stopping at the install root. `rmdirSync` throws
  // ENOTEMPTY the moment a directory still holds something, which is the signal
  // to stop climbing — nothing that still has contents is ever removed.
  const stopAt = path.join(absRoot, ...SKILL_INSTALL_DIR.split('/'));
  let dir = path.dirname(abs);
  while (dir !== stopAt && dir.startsWith(`${stopAt}${path.sep}`)) {
    try {
      fs.rmdirSync(dir);
    } catch {
      break;
    }
    removed.push(path.relative(absRoot, dir).split(path.sep).join('/'));
    dir = path.dirname(dir);
  }
  return removed;
}

/**
 * Append Phyllum's two lines to .gitignore (init only).
 *
 * Two rather than one since v0.2.1, and the second one is `DESIGN-SYSTEM.md.bak`
 * — decided rather than left open (plan §6.5.2). The backup is a local undo
 * buffer: it holds a copy of a file that is already committed, it changes on
 * every edit, and committing it would put a stale duplicate of the design
 * system in every diff and every review. So it is ignored, quietly, through the
 * exact same handling the session directory already had — one question, one
 * append, idempotent on rerun, and skippable like everything else `init` asks.
 *
 * Returns 'added' | 'already-present' | 'created'.
 */
export const GITIGNORE_LINES = [GITIGNORE_LINE, BACKUP_FILE];

export function appendGitignoreLine(root, { faultAfterTempWrite = false, faultAt = null } = {}) {
  const abs = path.join(path.resolve(root), GITIGNORE_FILE);
  const existed = fs.existsSync(abs);
  const current = existed ? fs.readFileSync(abs, 'utf8') : '';
  const lines = current.split('\n').map((line) => line.trim());
  const missing = GITIGNORE_LINES.filter((line) => !lines.includes(line));
  if (missing.length === 0) return 'already-present';

  const prefix = current === '' || current.endsWith('\n') ? current : `${current}\n`;
  writeGuarded(root, GITIGNORE_FILE, `${prefix}${missing.join('\n')}\n`, {
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

/**
 * Write `assess --json`'s output (§6.5.1).
 *
 * The path is the one the user typed, or `.phyllum/assess.json` when they typed
 * none, and it goes through the same funnel as everything else — the widening
 * is in `isAllowedJsonPath`, where it can be read, not in a caller that skips
 * the check.
 */
export function writeAssessJson(root, relPath = ASSESS_JSON_FILE, contents = '') {
  const rel = relativise(root, relPath);
  if (!isAllowedPath(rel, { json: true })) {
    throw new PermissionError(relPath, jsonRefusalReason(rel, relPath));
  }
  return writeGuarded(root, relPath, contents, { json: true });
}

/**
 * Write one numbered drift report — the Assess stage's only write.
 *
 * Spelled out beside `writeAssessJson` so both of `assess`'s outputs are
 * findable in the same place. The path is derived from a number, never taken
 * from a caller's string, so there is no spelling of this call that lands
 * outside `.phyllum/`.
 */
export function writeAssessReportFile(root, number, contents) {
  return writeGuarded(root, assessReportFile(number), contents);
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
