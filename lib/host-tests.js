/**
 * The host project's own test suite (v0.2.0 plan §6.5.3, guarantee 4, decided).
 *
 * Per-phase verification is the PRD's acceptance criteria **and** the project's
 * own suite, when one was detected. Detected, not assumed: `harness-detect.js`
 * reads the command out of the project's own manifest, and a project with no
 * suite gets phases whose criteria are the whole bar rather than phases that fail
 * on a command nobody ever wrote.
 *
 * Phyllum's own eval gate (plan §7) governs Phyllum's code. This is the user's
 * gate over the user's code, and Phyllum only reads its exit status.
 */

import { ALLOWED_BINARIES, runCommand, splitCommand } from './run-command.js';

export const DEFAULT_TIMEOUT_MS = 900_000;

/**
 * Run the detected suite in `root`.
 *
 * Returns `{ ran, ok, why, command, output }`. `ran: false` is never a failure —
 * it means there was nothing to run, or nothing Phyllum is allowed to run, and
 * `why` says which. A suite that runs and fails is `ran: true, ok: false`, which
 * is what stops a phase.
 */
export function runHostTests(root, tests, { timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env } = {}) {
  if (!tests?.found) {
    return { ran: false, ok: true, why: 'no test suite was detected in this project', command: null, output: '' };
  }
  const parts = splitCommand(tests.command);
  if (parts === null) {
    return { ran: false, ok: true, why: `\`${tests.command}\` is not a command Phyllum can read`, command: tests.command, output: '' };
  }
  if (!ALLOWED_BINARIES.includes(parts.bin)) {
    return {
      ran: false,
      ok: true,
      why: `\`${parts.bin}\` is not one of the test runners Phyllum will start (${ALLOWED_BINARIES.join(', ')}), so the criteria are the whole bar for this phase`,
      command: tests.command,
      output: '',
    };
  }

  const result = runCommand(parts.bin, parts.args, { cwd: root, env, timeoutMs });
  if (result.missing) {
    return {
      ran: false,
      ok: true,
      why: `\`${parts.bin}\` is not installed here, so the suite could not be run and the criteria are the whole bar for this phase`,
      command: tests.command,
      output: '',
    };
  }
  const output = `${result.stdout}${result.stderr}`.trim();
  return {
    ran: true,
    ok: result.ok,
    why: result.timedOut ? `\`${tests.command}\` did not finish within the timeout` : null,
    command: tests.command,
    output: output.length > 4000 ? `${output.slice(-4000)}` : output,
  };
}
