/**
 * Dispatch (plan §2.2, §7.3).
 *
 * `execute` takes tokens and returns text plus an exit code — it never prints.
 * Keeping I/O at the edges is what lets the assertion suite compare command
 * output byte for byte without spawning a process for every check.
 */

import fs from 'node:fs';
import path from 'node:path';

import { extractFlags, parseInvocation, tokenizeLine, tokensFromArgv } from './parse-args.js';
import { renderMenu } from './menu.js';
import {
  renderCommandHelp,
  renderHelp,
  renderUnknownCommand,
  renderUnknownHelpTarget,
} from './help.js';
import { isScope, renderInvalidScope, renderSystem } from './system.js';
import { runInit } from './init.js';
import { runCreate } from './create-command.js';
import { runTokenise } from './tokenise-command.js';
import { DESIGN_SYSTEM_FILE } from './write.js';

/** Commands that need a design system to exist before they mean anything. */
const NEEDS_DESIGN_SYSTEM = new Set(['system', 'create', 'tokenise', 'gui']);

/** Commands that take a scope word (plan §6). */
const TAKES_SCOPE = new Set(['system', 'gui']);

export function designSystemPath(root) {
  return path.join(root, DESIGN_SYSTEM_FILE);
}

export function hasDesignSystem(root) {
  return fs.existsSync(designSystemPath(root));
}

function preInitNotice(commandName) {
  return (
    `There is no ${DESIGN_SYSTEM_FILE} here yet, so there is nothing for \`${commandName}\` to work with.\n` +
    'Run `basal init` to scaffold one — Basal never creates files implicitly.\n'
  );
}

function milestoneStub(command) {
  return (
    `\`${command.name}\` is registered but not built yet — it is coming in a later milestone (${command.milestone}).\n` +
    `Run \`basal help ${command.name}\` to see what it will do, or \`basal menu\` for what works today.\n`
  );
}

/** The greeting a bare `basal` opens with. */
export function renderGreeting(root) {
  if (!hasDesignSystem(root)) {
    return (
      `Basal — design system companion\n\n` +
      `This project has no ${DESIGN_SYSTEM_FILE} yet. \`basal init\` sets one up and walks you through the rest.\n\n` +
      `${renderMenu().trimEnd()}\n`
    );
  }
  return renderMenu();
}

/**
 * Run one invocation.
 *
 * ctx: { cwd, yes, confirm, today }
 * returns: { out, code, interactive? }
 */
export async function execute(tokens, ctx = {}) {
  const root = ctx.cwd ?? process.cwd();
  const flags = extractFlags(tokens);
  const invocation = parseInvocation(flags.tokens);
  const yes = ctx.yes ?? flags.yes;

  switch (invocation.kind) {
    case 'interactive':
      return { out: renderGreeting(root), code: 0, interactive: true };

    case 'help':
      return { out: renderHelp(), code: 0 };

    case 'help-command':
      if (invocation.command) return { out: renderCommandHelp(invocation.command), code: 0 };
      return { out: renderUnknownHelpTarget(invocation.unknownTarget), code: 0 };

    case 'unknown':
      return { out: renderUnknownCommand(invocation.word), code: 0 };

    case 'command':
      return runCommand(invocation, { ...ctx, cwd: root, yes });

    default:
      return { out: renderUnknownCommand(String(invocation.kind)), code: 0 };
  }
}

async function runCommand(invocation, ctx) {
  const { command, args } = invocation;
  const root = ctx.cwd;

  // Scope words are only meaningful on `system` and `gui`, and are validated
  // there before anything touches the filesystem.
  let scope = 'all';
  if (TAKES_SCOPE.has(command.name) && args.length > 0) {
    const word = args[0].value;
    if (!isScope(word)) {
      return { out: renderInvalidScope(word, invocation.invokedAs), code: 0 };
    }
    scope = word.toLowerCase();
  }

  if (NEEDS_DESIGN_SYSTEM.has(command.name) && !hasDesignSystem(root)) {
    return { out: preInitNotice(command.name), code: 0 };
  }

  switch (command.name) {
    case 'menu':
      return { out: renderMenu(), code: 0 };

    case 'help':
      return { out: renderHelp(), code: 0 };

    case 'system': {
      const text = fs.readFileSync(designSystemPath(root), 'utf8');
      return { out: renderSystem(text, scope), code: 0 };
    }

    case 'create': {
      const result = await runCreate(args, {
        cwd: root,
        env: ctx.env,
        confirm: ctx.confirm,
        ask: ctx.ask,
        today: ctx.today,
      });
      return { out: result.out, code: result.code };
    }

    case 'tokenise': {
      const result = await runTokenise(args, {
        cwd: root,
        env: ctx.env,
        confirm: ctx.confirm,
        ask: ctx.ask,
        today: ctx.today,
      });
      return { out: result.out, code: result.code };
    }

    case 'init': {
      const result = await runInit(root, {
        yes: ctx.yes ?? true,
        confirm: ctx.confirm,
        today: ctx.today,
      });
      return { out: result.out, code: result.code, actions: result.actions };
    }

    default:
      // Registered, documented, not built: the milestone it lands in, and no
      // pretending in the meantime.
      return { out: milestoneStub(command), code: 0 };
  }
}

/** Convenience for the terminal: run from process.argv. */
export function executeArgv(argv, ctx = {}) {
  return execute(tokensFromArgv(argv), ctx);
}

/** Convenience for the interactive session: run from a typed line. */
export function executeLine(line, ctx = {}) {
  return execute(tokenizeLine(line), ctx);
}
