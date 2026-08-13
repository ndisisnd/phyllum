#!/usr/bin/env node
/**
 * The `phyllum` entry point (plan §7.2).
 *
 * Argument parsing, one call into `execute`, one write to stdout. When nothing
 * is typed and a terminal is attached, the interactive session takes over
 * instead; without a terminal (CI, pipes, the assertion suite) the same bare
 * invocation prints the greeting and exits, so Phyllum never hangs on a prompt.
 */

import readline from 'node:readline';
import process from 'node:process';

import { executeArgv } from '../lib/execute.js';
import { runSession } from '../lib/session.js';

const argv = process.argv.slice(2);
const attachedToTerminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const assumeYes =
  !attachedToTerminal || argv.includes('--yes') || argv.includes('-y') || process.env.PHYLLUM_YES === '1';

async function main() {
  if (argv.length === 0 && attachedToTerminal) {
    return runSession({ cwd: process.cwd() });
  }

  const result = await executeArgv(argv, {
    cwd: process.cwd(),
    yes: assumeYes,
    // `apply run` emits a status report every five minutes. It goes to stderr so
    // the report on stdout stays a clean, pipeable document.
    onReport: (line) => process.stderr.write(`${line}\n`),
    // A safety gate is only ever answered by a person. Without a terminal there
    // is nobody to ask, so there is no `confirm` and the gate refuses — `--yes`
    // deliberately does not stand in for one.
    confirm: attachedToTerminal ? askTerminal : undefined,
  });
  process.stdout.write(result.out);
  return result.code ?? 0;
}

/** One yes/no question on the terminal. A closed input is a "no". */
function askTerminal(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      const trimmed = String(answer ?? '').trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
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
