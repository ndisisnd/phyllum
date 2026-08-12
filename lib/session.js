/**
 * The interactive session (plan §2.2).
 *
 * A bare `basal` opens this loop: it prints the greeting — the menu, preceded
 * by an `init` suggestion when the project has no DESIGN-SYSTEM.md — and then
 * accepts exactly the same commands you would type in the terminal, quoting
 * included. All the reasoning lives in `execute`; this file is only the loop.
 */

import readline from 'node:readline';

import { executeLine, renderGreeting } from './execute.js';

const EXIT_WORDS = new Set(['exit', 'quit', ':q']);

export async function runSession(ctx = {}) {
  const root = ctx.cwd ?? process.cwd();
  const input = ctx.input ?? process.stdin;
  const output = ctx.output ?? process.stdout;
  const rl = readline.createInterface({ input, output, prompt: 'basal> ' });

  const confirm = (question) =>
    new Promise((resolve) => {
      rl.question(`${question} [Y/n] `, (answer) => {
        const trimmed = answer.trim().toLowerCase();
        resolve(trimmed === '' || trimmed === 'y' || trimmed === 'yes');
      });
    });

  output.write(renderGreeting(root));
  output.write('\nType a command, or `exit` to leave.\n\n');
  rl.prompt();

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === '') {
      rl.prompt();
      continue;
    }
    if (EXIT_WORDS.has(trimmed.toLowerCase())) break;

    try {
      const result = await executeLine(trimmed, { ...ctx, cwd: root, confirm });
      output.write(result.out);
    } catch (error) {
      output.write(`${error.message}\n`);
    }
    output.write('\n');
    rl.prompt();
  }

  rl.close();
  return 0;
}
