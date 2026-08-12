/**
 * Argument grammar (plan §2.2).
 *
 * The grammar is deliberately tiny:
 *   basal                    -> interactive session
 *   basal <command> [arg]    -> run a command
 *   basal help [<command>]   -> help, general or per-command
 *   basal <command> help     -> the same per-command help, byte for byte
 *
 * `help` is a reserved word in argument position: `basal create help` is help
 * *about* create, never a component called "help". Quoting it ("help") means
 * the literal word. Quoting survives only where Basal sees the raw line — the
 * interactive session — because a shell strips quotes before argv reaches us.
 */

import { resolveCommand, resolveHelpTarget } from './registry.js';

const FLAG_YES = new Set(['--yes', '-y']);

/** Split a raw typed line into tokens, remembering which ones were quoted. */
export function tokenizeLine(line) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i += 1;
    if (i >= line.length) break;
    const quote = line[i];
    let value = '';
    let quoted = false;
    if (quote === '"' || quote === "'") {
      quoted = true;
      i += 1;
      while (i < line.length && line[i] !== quote) {
        value += line[i];
        i += 1;
      }
      i += 1; // consume the closing quote (tolerates an unterminated one)
    } else {
      while (i < line.length && !/\s/.test(line[i])) {
        value += line[i];
        i += 1;
      }
    }
    tokens.push({ value, quoted });
  }
  return tokens;
}

/**
 * Tokens as they arrive from a shell. The shell already removed the quotes, so
 * nothing here can be marked quoted; see the note at the top of the file.
 */
export function tokensFromArgv(argv) {
  return argv.map((value) => ({ value, quoted: false }));
}

/** Pull the confirmation flags out of a token list. */
export function extractFlags(tokens) {
  const rest = [];
  let yes = false;
  for (const token of tokens) {
    if (!token.quoted && FLAG_YES.has(token.value)) {
      yes = true;
      continue;
    }
    rest.push(token);
  }
  return { tokens: rest, yes };
}

const isReservedHelp = (token) => !token.quoted && token.value.toLowerCase() === 'help';

/**
 * Turn tokens into an invocation.
 *
 * kind is one of:
 *   'interactive'   nothing was typed
 *   'help'          general help
 *   'help-command'  per-command help; `command` is set, or `unknownTarget`
 *   'command'       run `command` with `args`
 *   'unknown'       no such command; `word` is what was typed
 */
export function parseInvocation(tokens) {
  if (tokens.length === 0) return { kind: 'interactive' };

  const [first, ...rest] = tokens;

  if (isReservedHelp(first)) {
    if (rest.length === 0) return { kind: 'help' };
    const target = rest[0];
    // `help basal` is legal (the bare entry point is a row in the §2.2 table),
    // so help resolution is wider than dispatch resolution.
    const command = resolveHelpTarget(target.value);
    if (!command) return { kind: 'help-command', unknownTarget: target.value };
    return { kind: 'help-command', command };
  }

  const command = resolveCommand(first.value);
  if (!command) return { kind: 'unknown', word: first.value };

  if (rest.length > 0 && isReservedHelp(rest[0])) {
    return { kind: 'help-command', command };
  }

  return {
    kind: 'command',
    command,
    invokedAs: first.value.toLowerCase(),
    args: rest,
  };
}
