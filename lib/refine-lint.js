/**
 * `refine lint` — what the project's own linters say (v0.11.0 §2).
 *
 * The gate's fifth section, and the only one that delegates. Phyllum has no
 * lint rules of its own here and wants none: a project that installed ESLint
 * has already written down what it considers wrong, and a second opinion from a
 * design system companion would be a second answer to a settled question.
 *
 * Three rules hold this module to the stage's read-only posture, and each is
 * enforced here rather than remembered by a caller:
 *
 *   1. **Report mode, or not at all.** The check command is a column in the
 *      `phyllum:refine-linters` table, and the argument list this module builds
 *      is refused before it is spawned if a fix flag appears anywhere in it. A
 *      tool that would repair what it found cannot be run by a gate that has to
 *      report what the grade was for.
 *   2. **The project's own `lint` script is not what runs.** A
 *      `"lint": "eslint . --fix"` is an ordinary script, and running it would
 *      rewrite the code being graded. Linters are detected from configuration
 *      and installed packages instead.
 *   3. **An absent linter is not a failing linter.** A project that lints
 *      nothing has no lint check to fail. It is reported as not configured,
 *      which is neither a pass nor silence — the one answer a gate may not give.
 *
 * Everything that starts a process goes through `lib/run-command.js`, under its
 * allowlist: the package runner is on that list and a linter binary is not,
 * which is also why a locally installed linter is reached through `npm exec`
 * and its lockfile-chosen equivalents.
 */

import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_TIMEOUT_MS, runCommand } from './run-command.js';
import { linters } from './refine-spec.js';

/**
 * Flags that make a linter write. None is ever emitted; the guard exists so a
 * reference edited to add one is refused rather than obeyed.
 */
export const FIX_FLAGS = ['--fix', '--fix-type', '--fix-dry-run', '--write', '-w', '--apply', '--apply-unsafe', '--unsafe'];

/** Raised when an argument list would have let a linter rewrite the project. */
export class FixModeError extends Error {
  constructor(flag, linter) {
    super(
      `Phyllum refused to run ${linter} with "${flag}". \`refine lint\` reports and never rewrites, ` +
        'so a linter is run in check mode or not at all.',
    );
    this.name = 'FixModeError';
    this.flag = flag;
    this.linter = linter;
  }
}

/** The lockfile that picks the package runner, in the order they are checked. */
export const RUNNERS = [
  { lockfile: 'pnpm-lock.yaml', bin: 'pnpm', args: ['exec'] },
  { lockfile: 'yarn.lock', bin: 'yarn', args: ['exec'] },
  { lockfile: 'bun.lockb', bin: 'bun', args: ['x'] },
  { lockfile: 'bun.lock', bin: 'bun', args: ['x'] },
  { lockfile: 'package-lock.json', bin: 'npm', args: ['exec', '--'] },
];

/** The default when no lockfile says otherwise: npm, which ships with Node. */
export const DEFAULT_RUNNER = { lockfile: null, bin: 'npm', args: ['exec', '--'] };

/** Which package runner this project reaches its own tools through. */
export function packageRunner(root) {
  const resolved = path.resolve(root);
  for (const runner of RUNNERS) {
    if (exists(path.join(resolved, runner.lockfile))) return runner;
  }
  return DEFAULT_RUNNER;
}

const exists = (file) => {
  try {
    return fs.existsSync(file);
  } catch {
    return false; // an unreadable path is silence, not evidence
  }
};

/** The project manifest, or null. A manifest that will not parse is not evidence. */
export function readManifest(root) {
  const file = path.join(path.resolve(root), 'package.json');
  if (!exists(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Is this linter configured here, and what said so?
 *
 * Any one of three signals is enough. A flat config file with the package not
 * yet installed is still a statement about what this project lints with, and so
 * is a manifest key with no file beside it.
 */
export function detectLinter(root, linter, manifest = null) {
  const resolved = path.resolve(root);
  const config = linter.configs.find((file) => exists(path.join(resolved, file)));
  if (config) return { configured: true, evidence: config };

  const pkg = manifest ?? readManifest(root);
  if (pkg && linter.manifestKey && pkg[linter.manifestKey] !== undefined) {
    return { configured: true, evidence: `the \`${linter.manifestKey}\` key in package.json` };
  }
  const deps = { ...(pkg?.devDependencies ?? {}), ...(pkg?.dependencies ?? {}) };
  if (pkg && linter.package && deps[linter.package] !== undefined) {
    return { configured: true, evidence: `${linter.package} in package.json` };
  }
  return { configured: false, evidence: null };
}

/** Every linter this project is configured with, in table order. */
export function detectLinters(root) {
  const manifest = readManifest(root);
  return linters().map((linter) => ({ ...linter, ...detectLinter(root, linter, manifest) }));
}

/**
 * The argument list one linter is started with, fix flags refused.
 *
 * `files` narrows the run to a subject's own files. A file list that survives
 * nothing — a stylesheet linter pointed at a component's `.tsx` — comes back
 * null, which the caller reports as "not applicable to this subject" rather
 * than as a pass.
 */
export function lintArgv(runner, linter, files = null) {
  const [bin, ...flags] = linter.command;
  const narrowed = files === null ? null : files.filter((file) => reads(linter, file));
  if (narrowed !== null && narrowed.length === 0) return null;
  const targets = narrowed === null ? flags.slice() : [...flags.filter(isFlag), ...narrowed];
  const argv = [...runner.args, bin, ...targets];
  for (const word of argv) {
    const flag = FIX_FLAGS.find((fix) => word === fix || word.startsWith(`${fix}=`));
    if (flag) throw new FixModeError(flag, linter.name);
  }
  return argv;
}

const isFlag = (word) => word.startsWith('-');

/**
 * The extensions a linter reads, taken from the glob in its own check command.
 *
 * Stylelint's command carries a glob naming css, scss, sass and less, so the
 * filter is read from the table rather than declared a second time in code. A
 * command with no glob — `eslint .` — claims no extensions and is handed
 * whatever the subject has.
 */
export function extensionsFor(linter) {
  const out = new Set();
  for (const word of linter.command) {
    for (const group of word.matchAll(/\.\{([^}]*)\}/g)) {
      for (const part of group[1].split(',')) out.add(`.${part.trim()}`);
    }
    const single = word.match(/\*(\.[A-Za-z0-9]+)$/);
    if (single) out.add(single[1]);
  }
  return [...out];
}

/** Is this a file the linter's own command says it reads? */
function reads(linter, file) {
  const extensions = extensionsFor(linter);
  if (extensions.length === 0) return true;
  return extensions.some((extension) => String(file).toLowerCase().endsWith(extension));
}

/** The tail of what a run printed — the part that says what happened. */
export function summarise(result, lines = 12) {
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  return text.slice(-lines).join('\n');
}

/**
 * Run one configured linter and read its exit code.
 *
 * A non-zero exit is an answer rather than an accident, exactly as
 * `runCommand` treats it. The three ways a run can fail to happen — the runner
 * is not on PATH, the run timed out, the subject has nothing this linter reads —
 * are reported as themselves, because a section that could not run says so.
 */
export function runLinter(root, linter, { runner, files = null, run = runCommand, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const argv = lintArgv(runner, linter, files);
  if (argv === null) {
    return {
      linter: linter.id,
      name: linter.name,
      configured: true,
      evidence: linter.evidence ?? null,
      ran: false,
      ok: null,
      reason: 'nothing in this subject is a file this linter reads',
      command: null,
      summary: '',
    };
  }

  const command = `${runner.bin} ${argv.join(' ')}`;
  const result = run(runner.bin, argv, { cwd: path.resolve(root), timeoutMs });

  if (result.missing) {
    return {
      linter: linter.id,
      name: linter.name,
      configured: true,
      evidence: linter.evidence ?? null,
      ran: false,
      ok: null,
      reason: `\`${runner.bin}\` is not on PATH, so the linter could not be started`,
      command,
      summary: '',
    };
  }
  if (result.timedOut) {
    return {
      linter: linter.id,
      name: linter.name,
      configured: true,
      evidence: linter.evidence ?? null,
      ran: false,
      ok: null,
      reason: 'the linter did not finish inside the time limit',
      command,
      summary: summarise(result),
    };
  }

  return {
    linter: linter.id,
    name: linter.name,
    configured: true,
    evidence: linter.evidence ?? null,
    ran: true,
    ok: result.ok === true,
    code: result.code ?? null,
    reason: null,
    command,
    summary: summarise(result),
  };
}

/**
 * The lint section: every linter this project is configured with, run in check
 * mode, plus the ones it is not configured with said plainly.
 *
 * `pass` is `null` rather than `true` when no linter is configured at all. The
 * distinction is the whole point of the section: "everything passed" and "there
 * was nothing to ask" are different sentences, and the ship criterion that
 * reads this must not be able to confuse them.
 */
export function refineLint(root, options = {}) {
  const { files = null, run = runCommand, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const runner = options.runner ?? packageRunner(root);
  const detected = detectLinters(root);

  const results = detected.map((linter) => {
    if (!linter.configured) {
      return {
        linter: linter.id,
        name: linter.name,
        configured: false,
        evidence: null,
        ran: false,
        ok: null,
        reason: 'not configured',
        command: null,
        summary: '',
      };
    }
    return runLinter(root, linter, { runner, files, run, timeoutMs });
  });

  const configured = results.filter((row) => row.configured);
  const couldNotRun = configured.filter((row) => !row.ran);

  return {
    runner: runner.bin,
    linters: results,
    configured: configured.map((row) => row.linter),
    couldNotRun,
    findings: configured
      .filter((row) => row.ran && row.ok === false)
      .map((row) => ({
        rule: 'lint-error',
        severity: 'error',
        value: row.name,
        detail: `${row.name} reports findings against this subject`,
        evidence: row.summary === '' ? [row.command] : row.summary.split('\n'),
      })),
    reason: configured.length === 0 ? 'no linter is configured in this project' : null,
    pass:
      configured.length === 0
        ? null
        : configured.every((row) => row.ran && row.ok === true),
  };
}
