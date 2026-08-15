/**
 * The run funnel — the one place Phyllum starts a process (v0.2.0 plan §6.5.2).
 *
 * `apply run` is the first command that has to make things happen outside Node:
 * git has to make a branch and a commit, the host project's test suite has to be
 * run, and — when Phyllum drives execution itself — the `claude` CLI has to be
 * handed a prompt. Those are three different jobs with one risk in common, so
 * they share one door.
 *
 * The rules of the door, all four checked here rather than remembered by callers:
 *
 *   1. **An allowlisted binary, by name.** Nothing else can be started, however
 *      it arrives — a test command read out of somebody's `package.json` is data,
 *      not a licence to run an arbitrary program.
 *   2. **Resolved on PATH first.** A missing binary is a message the caller can
 *      print, not an exception from deep inside a spawn.
 *   3. **An argument array, never a command line.** There is no string for a
 *      shell to reinterpret, because there is no shell.
 *   4. **A timeout.** A wedged child process must not wedge the run.
 *
 * The GUI server and `upgrade`'s package-manager call predate this module and keep
 * their own spawns; everything `apply run` does comes through here.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Every binary `apply run` may ever start, and why each one is here.
 *
 * `git` is the branch and the commits. `claude` is the route to a model when
 * Phyllum drives execution itself. The rest are test-suite runners, one per
 * entry in `harness-detect.js`'s detection table — a project's own suite is part
 * of per-phase verification (plan §6.5.3), and this list is the reason a
 * hand-written `test` script cannot smuggle in something else.
 */
export const ALLOWED_BINARIES = [
  'git',
  'claude',
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'pytest',
  'cargo',
  'go',
  'bundle',
];

export const DEFAULT_TIMEOUT_MS = 600_000;

export class DisallowedBinaryError extends Error {
  constructor(name) {
    super(
      `Phyllum refused to run "${name}". The only binaries \`apply run\` may start are ` +
        `${ALLOWED_BINARIES.join(', ')} — and each one only ever by resolved path, with an argument array.`,
    );
    this.name = 'DisallowedBinaryError';
    this.binary = name;
  }
}

/** The first executable called `name` on PATH, or null. A lookup, not a run. */
export function findOnPath(name, env = process.env) {
  const raw = env.PATH ?? '';
  for (const dir of raw.split(path.delimiter)) {
    if (dir === '') continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

/**
 * Split a recorded command ("npm test", "go test ./...") into a binary and its
 * arguments. Whitespace only — there is no quoting grammar here on purpose,
 * because a command that needs one is a command that needs a shell.
 */
export function splitCommand(command) {
  const words = String(command ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');
  if (words.length === 0) return null;
  return { bin: words[0], args: words.slice(1) };
}

/**
 * Run one command.
 *
 * Returns `{ ok, code, stdout, stderr, missing, timedOut }` and never throws for
 * a failing child — a non-zero exit is an answer, not an accident. The one throw
 * is a binary outside the allowlist, which is a programming error in Phyllum
 * rather than a condition a user can reach.
 */
export function runCommand(name, args = [], options = {}) {
  const { cwd, env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS, input } = options;

  if (!ALLOWED_BINARIES.includes(name)) throw new DisallowedBinaryError(name);
  const argv = args.map(String);

  const bin = findOnPath(name, env);
  if (bin === null) {
    return { ok: false, code: null, stdout: '', stderr: '', missing: true, timedOut: false };
  }

  const result = spawnSync(bin, argv, {
    cwd,
    env,
    timeout: timeoutMs,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    input,
    windowsHide: true,
  });

  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';
  return {
    ok: result.status === 0,
    code: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    missing: false,
    timedOut,
  };
}
