/**
 * The filesystem-diff harness (plan §8.5, "cross-cutting invariants").
 *
 * The promise Basal makes is small enough to check mechanically: the only paths
 * it may ever create or modify in a user's project are `DESIGN-SYSTEM.md`,
 * `.basal/**`, and — during `init` only — `.claude/skills/basal/**` plus one
 * line in `.gitignore`. This file turns that promise into something the whole
 * assertion suite runs under, rather than something individual tests remember
 * to check.
 *
 * It is loaded with `node --test --import=./evals/harness/fs-harness.js`, which
 * Node passes down to every test child process, so it is not optional and not
 * per-file. Two guards run at once:
 *
 *   1. **Write interception.** Every filesystem-mutating call in `node:fs` and
 *      `node:fs/promises` is wrapped. Calls made from `lib/` or `bin/` (Basal's
 *      own code) must land on an enumerated path inside a sandbox; calls made
 *      from `evals/` are the test's own scaffolding and are only checked for
 *      staying out of the repository.
 *   2. **Repository snapshot.** The repo tree is recorded when the process
 *      starts and compared when it exits. The repository is never a test
 *      subject: a single added, changed or removed file fails the run.
 *
 * A violation prints a diagnostic and sets a non-zero exit code, so the test
 * child fails and the whole `npm test` run fails with it — the plan's "any
 * other path appearing in the diff fails the entire run".
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HARNESS_FILE = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = path.resolve(path.dirname(HARNESS_FILE), '..', '..');
const BASAL_DIRS = [path.join(PACKAGE_ROOT, 'lib'), path.join(PACKAGE_ROOT, 'bin')];
const TEST_DIRS = [path.join(PACKAGE_ROOT, 'evals')];
const TMP_ROOT = fs.realpathSync(os.tmpdir());

/** Paths Basal is allowed to write, as suffix rules on an absolute path. */
const ALLOWED = [
  { label: 'DESIGN-SYSTEM.md', test: (rel) => rel === 'DESIGN-SYSTEM.md' },
  { label: '.basal/**', test: (rel) => rel === '.basal' || rel.startsWith('.basal/') },
  {
    label: '.claude/skills/basal/** (init only)',
    test: (rel) => rel === '.claude/skills/basal' || rel.startsWith('.claude/skills/basal/'),
  },
  { label: '.gitignore (init only)', test: (rel) => rel === '.gitignore' },
];

/** The funnel's temp file sits beside its target and is renamed onto it. */
const TEMP_SUFFIX = /\.basal-tmp-[0-9]+-[0-9]+$/;

const violations = [];

function record(kind, detail) {
  violations.push(`${kind}: ${detail}`);
}

// ---------------------------------------------------------------------------
// Who is calling?
// ---------------------------------------------------------------------------

/**
 * 'basal' when the nearest project frame is in lib/ or bin/, 'test' when it is
 * in evals/, 'foreign' for anything else (node internals only, in practice).
 */
function callerKind() {
  const original = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, frames) => frames;
  const error = new Error();
  Error.captureStackTrace(error, callerKind);
  const frames = error.stack ?? [];
  Error.prepareStackTrace = original;

  for (const frame of frames) {
    const file = typeof frame.getFileName === 'function' ? frame.getFileName() : null;
    if (!file || file.startsWith('node:')) continue;
    const abs = file.startsWith('file:') ? fileURLToPath(file) : file;
    if (abs === HARNESS_FILE) continue;
    if (BASAL_DIRS.some((dir) => abs.startsWith(`${dir}${path.sep}`))) return 'basal';
    if (TEST_DIRS.some((dir) => abs.startsWith(`${dir}${path.sep}`))) return 'test';
    if (abs.startsWith(`${PACKAGE_ROOT}${path.sep}`)) return 'test';
    return 'foreign';
  }
  return 'foreign';
}

// ---------------------------------------------------------------------------
// Is this path inside the permission model?
// ---------------------------------------------------------------------------

function resolveTarget(target) {
  if (typeof target === 'string') return path.resolve(target);
  if (target instanceof URL) return path.resolve(fileURLToPath(target));
  if (Buffer.isBuffer(target)) return path.resolve(target.toString('utf8'));
  return null; // a file descriptor: already-open handles are checked at open time
}

function insideRepo(abs) {
  return abs === PACKAGE_ROOT || abs.startsWith(`${PACKAGE_ROOT}${path.sep}`);
}

/**
 * Match the tail of a path against the enumeration. The project root inside a
 * sandbox is not knowable from here (a test may nest one), so the rule is:
 * *some* ancestor directory must see this path as an enumerated one.
 */
function enumerationLabel(abs) {
  const bare = TEMP_SUFFIX.test(abs) ? abs.replace(TEMP_SUFFIX, '') : abs;
  const parts = bare.split(path.sep).filter(Boolean);
  for (let start = 0; start < parts.length; start += 1) {
    const rel = parts.slice(start).join('/');
    const match = ALLOWED.find((rule) => rule.test(rel));
    if (match) return match.label;
  }
  return null;
}

/**
 * Directories Basal creates on the way to an enumerated path: the sandbox root
 * itself (`fs.mkdirSync(dirname(DESIGN-SYSTEM.md))`) and the `.claude/skills`
 * spine above the skill install.
 */
function isEnumerationParent(abs) {
  const parts = abs.split(path.sep).filter(Boolean);
  const tail2 = parts.slice(-2).join('/');
  return tail2 === '.claude/skills' || parts.at(-1) === '.claude';
}

function checkBasalWrite(api, abs) {
  if (insideRepo(abs)) {
    record('repo write', `${api} wrote inside the repository: ${path.relative(PACKAGE_ROOT, abs)}`);
    return;
  }
  if (!abs.startsWith(`${TMP_ROOT}${path.sep}`) && !abs.startsWith('/private/var/folders/')) {
    record('outside sandbox', `${api} wrote outside the temp sandbox: ${abs}`);
    return;
  }
  if (enumerationLabel(abs)) return;
  if (isEnumerationParent(abs)) return;
  // A directory that *is* a sandbox root (the parent of DESIGN-SYSTEM.md) is
  // created by the funnel with `recursive: true`; it is the sandbox itself.
  if (path.basename(abs).startsWith('basal-test-')) return;
  record(
    'outside the permission model',
    `${api} touched ${abs} — the enumeration is DESIGN-SYSTEM.md, .basal/**, ` +
      '.claude/skills/basal/** and .gitignore',
  );
}

function checkTestWrite(api, abs) {
  if (insideRepo(abs)) {
    record('repo write', `${api} (test scaffolding) wrote inside the repository: ${path.relative(PACKAGE_ROOT, abs)}`);
  }
}

function checkPath(api, target) {
  const abs = resolveTarget(target);
  if (abs === null) return;
  const kind = callerKind();
  if (kind === 'basal') checkBasalWrite(api, abs);
  else if (kind === 'test') checkTestWrite(api, abs);
  return kind;
}

// ---------------------------------------------------------------------------
// Template integrity, checked on every design system the suite ever writes
// ---------------------------------------------------------------------------

/**
 * Plan §8.5 asks that `DESIGN-SYSTEM.md` still validates against the §7.1.1
 * section contract — the four-backtick fencing rule included — after any suite
 * run. Rather than checking the file at the end of a run (by which time every
 * sandbox is gone), this checks every design system Basal lands on disk, the
 * moment it lands. The validator is Basal's own, imported lazily so the harness
 * costs nothing until the first write.
 */
// Basal's own validator, or nothing: the harness is copied on its own into a
// miniature package by its self-test, and must still run there.
const validateStructure = await import(path.join(PACKAGE_ROOT, 'lib', 'design-system.js')).then(
  (module) => module.validateStructure,
  () => null,
);

function checkDesignSystemIntegrity(api, abs) {
  if (!validateStructure) return;
  if (path.basename(abs) !== 'DESIGN-SYSTEM.md') return;
  let contents;
  try {
    contents = fs.readFileSync(abs, 'utf8');
  } catch {
    return; // the write did not land, or the sandbox is already gone
  }
  const result = validateStructure(contents);
  if (result.valid) return;
  const why = [
    ...(result.missing ?? []).map((heading) => `missing ${heading}`),
    ...(result.fencing?.problems ?? []).map((problem) => `fencing: ${problem}`),
  ];
  record('template integrity', `${api} left a DESIGN-SYSTEM.md that does not validate (${why.join('; ')}): ${abs}`);
}

// ---------------------------------------------------------------------------
// The wrappers
// ---------------------------------------------------------------------------

/** name -> which argument positions are paths being written. */
const WRITE_APIS = {
  writeFile: [0],
  writeFileSync: [0],
  appendFile: [0],
  appendFileSync: [0],
  mkdir: [0],
  mkdirSync: [0],
  mkdtemp: [0],
  mkdtempSync: [0],
  rm: [0],
  rmSync: [0],
  rmdir: [0],
  rmdirSync: [0],
  unlink: [0],
  unlinkSync: [0],
  rename: [0, 1],
  renameSync: [0, 1],
  copyFile: [1],
  copyFileSync: [1],
  cp: [1],
  cpSync: [1],
  createWriteStream: [0],
  truncate: [0],
  truncateSync: [0],
  symlink: [1],
  symlinkSync: [1],
  link: [1],
  linkSync: [1],
  chmod: [0],
  chmodSync: [0],
  utimes: [0],
  utimesSync: [0],
};

/** `open`/`openSync` only mutate when the flag says so. */
const WRITING_FLAG = /[waxr]\+|^[wax]/;

function wrap(target, name, positions, label) {
  const original = target[name];
  if (typeof original !== 'function') return;
  const lands = /Sync$/.test(name) && /^(?:writeFile|appendFile|rename|copyFile|cp)/.test(name);
  const wrapped = function harnessed(...args) {
    const kinds = [];
    for (const index of positions) {
      if (args.length > index) kinds.push([args[index], checkPath(`${label}.${name}`, args[index])]);
    }
    const result = original.apply(this, args);
    // A design system that just landed on disk has to be one the parser can
    // read back — the template contract, checked where it is written.
    if (lands) {
      for (const [target, kind] of kinds) {
        if (kind !== 'basal') continue;
        const abs = resolveTarget(target);
        if (abs) checkDesignSystemIntegrity(`${label}.${name}`, abs);
      }
    }
    return result;
  };
  Object.defineProperty(wrapped, 'name', { value: name });
  target[name] = wrapped;
}

function wrapOpen(target, name, label) {
  const original = target[name];
  if (typeof original !== 'function') return;
  target[name] = function harnessedOpen(...args) {
    const flags = args[1];
    const flagText = typeof flags === 'string' ? flags : '';
    if (WRITING_FLAG.test(flagText) || typeof flags === 'number') {
      checkPath(`${label}.${name}`, args[0]);
    }
    return original.apply(this, args);
  };
}

for (const [name, positions] of Object.entries(WRITE_APIS)) {
  wrap(fs, name, positions, 'fs');
  if (fs.promises && name in fs.promises) wrap(fs.promises, name, positions, 'fs/promises');
}
wrapOpen(fs, 'open', 'fs');
wrapOpen(fs, 'openSync', 'fs');
wrapOpen(fs.promises, 'open', 'fs/promises');

// ---------------------------------------------------------------------------
// The repository snapshot
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(['.git', 'node_modules', '.serena', '.claude']);

export function snapshotRepo(root = PACKAGE_ROOT) {
  const out = new Map();
  const walk = (dir, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else {
        const stat = fs.statSync(abs, { throwIfNoEntry: false });
        if (stat) out.set(rel, `${stat.size}:${Math.round(stat.mtimeMs)}`);
      }
    }
  };
  walk(root, '');
  return out;
}

const repoBefore = snapshotRepo();

export function repoDiff() {
  const after = snapshotRepo();
  const added = [];
  const changed = [];
  const removed = [];
  for (const [rel, stamp] of after) {
    if (!repoBefore.has(rel)) added.push(rel);
    else if (repoBefore.get(rel) !== stamp) changed.push(rel);
  }
  for (const rel of repoBefore.keys()) if (!after.has(rel)) removed.push(rel);
  return { added: added.sort(), changed: changed.sort(), removed: removed.sort() };
}

process.on('exit', () => {
  const { added, changed, removed } = repoDiff();
  for (const rel of added) record('repo diff', `${rel} was created in the repository`);
  for (const rel of changed) record('repo diff', `${rel} was modified in the repository`);
  for (const rel of removed) record('repo diff', `${rel} was removed from the repository`);

  if (violations.length === 0) return;
  const unique = [...new Set(violations)];
  process.stderr.write(
    `\nfilesystem-diff harness: ${unique.length} violation(s) of the permission model\n` +
      `${unique.map((line) => `  ${line}`).join('\n')}\n`,
  );
  process.exitCode = 1;
});

/** Exposed so a test can assert the harness itself notices a bad write. */
export function harnessViolations() {
  return [...violations];
}

export function clearHarnessViolations() {
  violations.length = 0;
}

globalThis.__basalFsHarness = {
  violations: harnessViolations,
  clear: clearHarnessViolations,
  enumerationLabel,
  snapshotRepo,
  repoDiff,
};
