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
import { runAssess } from './assess-command.js';
import { runApply } from './apply-command.js';
import { runGui, runKill } from './gui-command.js';
import { runVersion } from './version-command.js';
import { runUpdate } from './update-command.js';
import { DESIGN_SYSTEM_FILE } from './write.js';

/** Commands that need a design system to exist before they mean anything. */
const NEEDS_DESIGN_SYSTEM = new Set(['system', 'create', 'tokenise', 'assess', 'apply', 'gui']);

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
    'Run `phyllum init` to scaffold one — Phyllum never creates files implicitly.\n'
  );
}

function milestoneStub(command) {
  return (
    `\`${command.name}\` is registered but not built yet — it is coming in a later milestone (${command.milestone}).\n` +
    `Run \`phyllum help ${command.name}\` to see what it will do, or \`phyllum menu\` for what works today.\n`
  );
}

/** The greeting a bare `phyllum` opens with. */
export function renderGreeting(root) {
  if (!hasDesignSystem(root)) {
    return (
      `Phyllum — design system companion\n\n` +
      `This project has no ${DESIGN_SYSTEM_FILE} yet. \`phyllum init\` sets one up and walks you through the rest.\n\n` +
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
        // Image mode's eyes (plan §7.3). Supplied when the skill runs inside a
        // Claude Code session; absent in a plain terminal, where `create` hands
        // the trace request over rather than pretending to measure anything.
        trace: ctx.trace,
        today: ctx.today,
      });
      return { out: result.out, code: result.code };
    }

    // The scan and the map are mechanical: no model, no conversation, nothing
    // written. The suggestion tracks are the conversation, so they get the same
    // ask/confirm pair `create` and `tokenise` do — and without one they are
    // previewed rather than pretended at. The scope words after `assess` are its
    // own grammar, validated inside it.
    case 'assess': {
      const result = await runAssess(args, {
        cwd: root,
        env: ctx.env,
        confirm: ctx.confirm,
        ask: ctx.ask,
        today: ctx.today,
        scanOptions: ctx.scanOptions,
      });
      return { out: result.out, code: result.code, assessment: result.assessment };
    }

    // `apply` is mechanical from end to end: it reads the design system, reads
    // the codebase through `assess`, and writes one plan to `.phyllum/PRD.md`.
    // There is no ask/confirm pair in the ctx because there is no question — the
    // PRD *is* the consent gate, and the codebase is not touched until
    // `apply run` (v0.2.0 M7) executes it. `run` is `apply`'s own scope word,
    // validated inside it, the way `assess`'s are.
    case 'apply': {
      const result = await runApply(args, {
        cwd: root,
        env: ctx.env,
        today: ctx.today,
        home: ctx.home,
        scanOptions: ctx.scanOptions,
      });
      return { out: result.out, code: result.code, prd: result.prd, written: result.written };
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

    case 'gui': {
      const result = await runGui({ cwd: root, env: ctx.env, scope, timeoutMs: ctx.timeoutMs });
      return { out: result.out, code: result.code };
    }

    case 'kill': {
      const result = await runKill({ cwd: root, timeoutMs: ctx.timeoutMs });
      return { out: result.out, code: result.code };
    }

    // Self-maintenance (plan v0.2.0 §3, §4). Neither command needs a design
    // system, and neither is a state-dependent command: they are about the
    // install, not about the project.
    case 'version': {
      const result = await runVersion({
        fetch: ctx.fetch,
        timeoutMs: ctx.timeoutMs,
        registryBase: ctx.registryBase,
        skipRegistry: ctx.skipRegistry,
      });
      return { out: result.out, code: result.code, status: result.status };
    }

    case 'update': {
      const result = await runUpdate({
        cwd: root,
        env: ctx.env,
        install: ctx.install,
        run: ctx.run,
        timeoutMs: ctx.timeoutMs,
      });
      return { out: result.out, code: result.code, install: result.install, ran: result.ran };
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
