#!/usr/bin/env node
/**
 * The `basal` entry point (plan §7.2).
 *
 * Argument parsing, one call into `execute`, one write to stdout. When nothing
 * is typed and a terminal is attached, the interactive session takes over
 * instead; without a terminal (CI, pipes, the assertion suite) the same bare
 * invocation prints the greeting and exits, so Basal never hangs on a prompt.
 */

import process from 'node:process';

import { executeArgv } from '../lib/execute.js';
import { runSession } from '../lib/session.js';

const argv = process.argv.slice(2);
const attachedToTerminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const assumeYes =
  !attachedToTerminal || argv.includes('--yes') || argv.includes('-y') || process.env.BASAL_YES === '1';

async function main() {
  if (argv.length === 0 && attachedToTerminal) {
    return runSession({ cwd: process.cwd() });
  }

  const result = await executeArgv(argv, { cwd: process.cwd(), yes: assumeYes });
  process.stdout.write(result.out);
  return result.code ?? 0;
}

main().then(
  (code) => {
    process.exitCode = code ?? 0;
  },
  (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  },
);
