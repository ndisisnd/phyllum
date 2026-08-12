/**
 * The interactive session (plan §2.2).
 *
 * A bare `basal` opens this loop: it prints the greeting — the menu, preceded
 * by an `init` suggestion when the project has no DESIGN-SYSTEM.md — and then
 * accepts exactly the same commands you would type in the terminal, quoting
 * included. All the reasoning lives in `execute`; this file is only the loop.
 *
 * Every read of a line goes through one primitive, `askLine`. That matters
 * because commands ask questions of their own — `init`'s confirmations, and
 * `create`'s follow-up loop — and a session that read lines two different ways
 * would race with itself over who gets the next one. One queue, one reader.
 */

import readline from 'node:readline';

import { executeLine, renderGreeting } from './execute.js';

const EXIT_WORDS = new Set(['exit', 'quit', ':q']);

export async function runSession(ctx = {}) {
  const root = ctx.cwd ?? process.cwd();
  const input = ctx.input ?? process.stdin;
  const output = ctx.output ?? process.stdout;
  const rl = readline.createInterface({ input, output });

  // Lines are queued as they arrive rather than read on demand, so a line
  // typed (or piped) while Basal is mid-thought is still there when it asks.
  const queue = [];
  let waiting = null;
  let ended = false;

  rl.on('line', (line) => {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(line);
      return;
    }
    queue.push(line);
  });
  rl.once('close', () => {
    ended = true;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(null);
    }
  });

  /** The next typed line, or null when the input has run out. */
  const askLine = (prompt) => {
    if (rl.terminal) {
      rl.setPrompt(prompt);
      rl.prompt();
    } else {
      output.write(prompt);
    }
    if (queue.length > 0) return Promise.resolve(queue.shift());
    if (ended) return Promise.resolve(null);
    return new Promise((resolve) => {
      waiting = resolve;
    });
  };

  // A closed input is a "no", never an accidental yes.
  const confirm = async (question) => {
    const answer = await askLine(`${question} [Y/n] `);
    if (answer === null) return false;
    const trimmed = answer.trim().toLowerCase();
    return trimmed === '' || trimmed === 'y' || trimmed === 'yes';
  };

  // The follow-up loop asks one question at a time, with its suggestions in the
  // order `create` ranked them: existing tokens, then codebase evidence, then a
  // labelled guess. Typing a number picks one, anything else is taken verbatim,
  // and an empty answer means skip — which records a TODO, never a guess.
  const ask = async (question, suggestions = []) => {
    const lines = [`\n${question}`];
    suggestions.forEach((suggestion, index) => lines.push(`  ${index + 1}. ${suggestion.text}`));
    output.write(`${lines.join('\n')}\n`);
    const answer = await askLine('> ');
    return answer === null ? 'skip' : answer;
  };

  output.write(renderGreeting(root));
  output.write('\nType a command, or `exit` to leave.\n\n');

  for (;;) {
    const line = await askLine('basal> ');
    if (line === null) break;

    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (EXIT_WORDS.has(trimmed.toLowerCase())) break;

    try {
      const result = await executeLine(trimmed, { ...ctx, cwd: root, confirm, ask });
      output.write(result.out);
    } catch (error) {
      output.write(`${error.message}\n`);
    }
    output.write('\n');
  }

  rl.close();
  return 0;
}
