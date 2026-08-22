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
import { runUpdate } from './update-command.js';
import { runDelete } from './delete-command.js';
import { runGui, runKill } from './gui-command.js';
import { runVersion } from './version-command.js';
import { runUpgrade } from './upgrade-command.js';
import { BACKUP_FILE, BackupError, DESIGN_SYSTEM_FILE, PermissionError } from './write.js';
import { NomenclatureError } from './nomenclature.js';
import { RefsError } from './refs.js';

/** Commands that need a design system to exist before they mean anything. */
const NEEDS_DESIGN_SYSTEM = new Set([
  'display',
  'create',
  'tokenise',
  'assess',
  'apply',
  'update',
  'delete',
  'gui',
]);

/** Commands that take a scope word (plan §6). */
const TAKES_SCOPE = new Set(['display', 'gui']);

export function designSystemPath(root) {
  return path.join(root, DESIGN_SYSTEM_FILE);
}

export function hasDesignSystem(root) {
  return fs.existsSync(designSystemPath(root));
}

/**
 * The reason `DESIGN-SYSTEM.md` cannot be read, or `null` when it can be.
 *
 * The read is the check: asking the filesystem about modes and types and then
 * reading anyway is two answers that can disagree, and only one of them is the
 * one that matters.
 */
export function designSystemReadError(root) {
  try {
    fs.readFileSync(designSystemPath(root), 'utf8');
    return null;
  } catch (error) {
    return error?.code ?? 'unreadable';
  }
}

function unreadableNotice(commandName, code) {
  const why =
    code === 'EISDIR'
      ? `${DESIGN_SYSTEM_FILE} is a directory here, not a file.`
      : code === 'EACCES' || code === 'EPERM'
        ? `${DESIGN_SYSTEM_FILE} exists but this user cannot read it (${code}).`
        : `${DESIGN_SYSTEM_FILE} exists but could not be read (${code}).`;
  return (
    `${why}\n` +
    `\`${commandName}\` reads that file before it does anything, so it stopped here rather than part-way through.\n` +
    'Nothing was written. Fix the file or its permissions, then run the command again.\n'
  );
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

/** Where curious users go to learn more; shown once, under the first greeting. */
const PROJECT_URL = 'https://github.com/ndisisnd/phyllum';

/** The greeting a bare `phyllum` opens with. */
export function renderGreeting(root) {
  if (!hasDesignSystem(root)) {
    return (
      `Phyllum — build, lint, and maintain design systems\n\n` +
      `This project has no ${DESIGN_SYSTEM_FILE} yet. Two ways to start:\n` +
      `  \`phyllum init\`   — create a design system from scratch and walk through the rest.\n` +
      `  \`phyllum assess\` — read your existing codebase and turn it into components.\n\n` +
      `${renderMenu({ header: false }).trimEnd()}\n\n` +
      `More at ${PROJECT_URL}\n`
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
      return guardWrites(invocation, () => runCommand(invocation, { ...ctx, cwd: root, yes }));

    default:
      return { out: renderUnknownCommand(String(invocation.kind)), code: 0 };
  }
}

/**
 * What the terminal says when the backup could not be taken (v0.2.1 §6.5.2).
 *
 * The funnel's rule is that a failed backup aborts the edit, and it enforces
 * that by throwing — correctly, because a writer that could carry on past this
 * is a writer that can forget to stop. But an exception is not an answer to a
 * command. Before this, `assess update` on a project whose `.bak` was a
 * directory ended as an uncaught throw: no exit code from `executeArgv`, no
 * output, and one bare sentence on stderr from `bin/phyllum.js`.
 *
 * So the throw is caught once, here, at the boundary between "the write funnel"
 * and "a command that answers". One catch rather than one per writer, for the
 * same reason the backup itself lives in the funnel: a rule every caller has to
 * remember is a rule one caller eventually forgets.
 */
function backupFailureNotice(commandName, error) {
  const fix =
    error.stage === 'read'
      ? `Fix ${DESIGN_SYSTEM_FILE} or its permissions, then run \`${commandName}\` again.`
      : `Free up ${BACKUP_FILE} — remove whatever is sitting there, or make the directory writable — ` +
        `then run \`${commandName}\` again.`;
  return (
    `${error.message}\n` +
    `Phyllum keeps one undo of ${DESIGN_SYSTEM_FILE} in ${BACKUP_FILE}, and it will not edit the file ` +
    'without one.\n' +
    `${fix}\n`
  );
}

/** What the terminal says when a write was refused by the permission model. */
function refusedWriteNotice(commandName, error) {
  return (
    `${error.message}\n` +
    `\`${commandName}\` stopped there rather than writing somewhere it should not. Nothing was written.\n`
  );
}

/**
 * What the terminal says when a shipped vocabulary table cannot be read
 * (v0.3.0 M7).
 *
 * `refs/nomenclature.md` is data Phyllum ships, so a table that will not parse
 * is not a sentence the user got wrong — it is an installed skill copy that has
 * been hand-edited or has drifted from the CLI. Before this, the detail arrived
 * alone: "the 100 step has no lightness" names no file, no cause and no fix. It
 * now arrives with all three, the same shape as the backup notice above.
 */
export function nomenclatureFailureNotice(commandName, error) {
  return (
    `${error.message}\n` +
    `Phyllum's naming vocabulary and its ramp constants are shipped tables in ${error.file}, ` +
    `and \`${commandName}\` will not guess at a table it cannot read.\n` +
    'Restore that file — `phyllum upgrade` re-syncs the installed skill copy — then run it again.\n'
  );
}

/**
 * The shipped reference tree, unreadable (v0.4.1 M3).
 *
 * Every protocol's contract is a folder under `skill/refs/` since v0.4.1, and a
 * folder that is missing, is not a folder, or cannot be read means the installed
 * copy is not the copy that shipped. Same failure as a damaged
 * `nomenclature.md`, so it gets the same sentence and the same fix.
 */
export function refsFailureNotice(commandName, error) {
  return (
    `${error.message}\n` +
    `Every command's contract is shipped as reference files under \`skill/refs/\`, ` +
    `and \`${commandName}\` will not guess at a contract it cannot read.\n` +
    'Restore that tree — `phyllum upgrade` re-syncs the installed skill copy — then run it again.\n'
  );
}

/**
 * Run a command, turning the funnel's refusals and the shipped tables' one
 * failure into answers.
 *
 * Only these four are caught, and deliberately. They are decisions Phyllum
 * itself made — "the backup failed", "that path is not ours to write", "the
 * shipped table is unreadable", "the shipped reference tree is unreadable" —
 * and a decision deserves a sentence, not a stack. Anything else thrown is a
 * bug, and a bug swallowed here is a bug nobody ever fixes.
 */
async function guardWrites(invocation, body) {
  const name = invocation.invokedAs ?? invocation.command?.name ?? 'phyllum';
  try {
    return await body();
  } catch (error) {
    if (error instanceof BackupError) {
      return { out: backupFailureNotice(name, error), code: 1 };
    }
    if (error instanceof PermissionError) {
      return { out: refusedWriteNotice(name, error), code: 1 };
    }
    if (error instanceof NomenclatureError) {
      return { out: nomenclatureFailureNotice(name, error), code: 1 };
    }
    if (error instanceof RefsError) {
      return { out: refsFailureNotice(name, error), code: 1 };
    }
    throw error;
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

  if (NEEDS_DESIGN_SYSTEM.has(command.name)) {
    if (!hasDesignSystem(root)) return { out: preInitNotice(command.name), code: 0 };
    // Existing and readable are two different questions (v0.2.0 M8). Every command
    // in this set reads the file as its first act, so a file that is there but
    // cannot be opened — a directory of that name, stripped permissions, a dead
    // symlink — would otherwise surface as a raw EACCES or EISDIR from whichever
    // module happened to read it first. One gate, because they all share the need.
    const unreadable = designSystemReadError(root);
    if (unreadable) return { out: unreadableNotice(command.name, unreadable), code: 1 };
  }

  switch (command.name) {
    case 'menu':
      return { out: renderMenu(), code: 0 };

    case 'help':
      return { out: renderHelp(), code: 0 };

    // `display` and `system` are one command and one rendering (§6.5.3). The
    // switch is on the canonical name, so the alias cannot ever reach a
    // different branch — which is what makes "byte for byte identical" a fact
    // about the dispatch rather than a promise two code paths keep.
    case 'display': {
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

    // `apply` plans; `apply run` executes. Planning is mechanical from end to end
    // and asks nothing, because the PRD *is* the consent gate. Running is the one
    // path that writes source, so it takes more: `confirm` for the stale-plan
    // gate, an injectable clock and report sink for the five-minute status
    // cadence, and injectable agent/test runners so every branch of the run is
    // reachable without a model. `run` is `apply`'s own scope word, validated
    // inside it, the way `assess`'s are. `update` held this branch for one
    // release as an alias; from v0.4.0 §6.1 it has its own, and `apply` is
    // reachable under its own name only.
    case 'apply': {
      const result = await runApply(args, {
        cwd: root,
        env: ctx.env,
        today: ctx.today,
        home: ctx.home,
        scanOptions: ctx.scanOptions,
        confirm: ctx.confirm,
        now: ctx.now,
        onReport: ctx.onReport,
        runAgent: ctx.runAgent,
        runTests: ctx.runTests,
        timeoutMs: ctx.timeoutMs,
      });
      return {
        out: result.out,
        code: result.code,
        prd: result.prd,
        written: result.written,
        outcome: result.outcome,
        reports: result.reports,
        // The `applied` readings this run derived (v0.5.0 §3.2), so a caller can
        // see what was written without re-parsing the file.
        applied: result.applied,
        flagsWritten: result.flagsWritten,
      };
    }

    // `update` edits the recorded design system — the one command that changes
    // what is already there. It is a conversation from end to end, so it takes
    // the same `ask`/`confirm` pair `tokenise` and `create` do, and without them
    // it prints its grammar rather than pretending to have asked. It holds no
    // path but DESIGN-SYSTEM.md: `apply`'s PRD and the codebase are not its to
    // touch, and the dispatch is where that is visible (v0.4.0 §6.5).
    case 'update': {
      const result = await runUpdate(args, {
        cwd: root,
        env: ctx.env,
        confirm: ctx.confirm,
        ask: ctx.ask,
        today: ctx.today,
      });
      return { out: result.out, code: result.code };
    }

    // `delete` removes one recorded component — the one destructive verb, and
    // the one command that takes two answers before it writes. The acceptance
    // gate is `confirm`, as everywhere else; the second confirmation is `ask`,
    // because it wants a *name* rather than a yes, and `--yes` deliberately
    // reaches neither of them (v0.5.0 §4.3). Like `update` it holds no path but
    // DESIGN-SYSTEM.md, and the dispatch is where that is visible.
    case 'delete': {
      const result = await runDelete(args, {
        cwd: root,
        env: ctx.env,
        confirm: ctx.confirm,
        ask: ctx.ask,
        today: ctx.today,
        signatures: ctx.signatures,
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

    case 'gui': {
      const result = await runGui({ cwd: root, env: ctx.env, scope, timeoutMs: ctx.timeoutMs });
      return { out: result.out, code: result.code };
    }

    case 'kill': {
      const result = await runKill({ cwd: root, timeoutMs: ctx.timeoutMs });
      return { out: result.out, code: result.code };
    }

    // Self-maintenance (plan v0.2.0 §3, §4; `update` renamed to `upgrade` in
    // v0.3.0 §6). Neither command needs a design system, and neither is a
    // state-dependent command: they are about the install, not about the project.
    case 'version': {
      const result = await runVersion({
        // The skill row reports on the project you are standing in, and only
        // that one (plan v0.5.2 §3.3), mirroring what `upgrade` re-syncs.
        cwd: root,
        fetch: ctx.fetch,
        timeoutMs: ctx.timeoutMs,
        registryBase: ctx.registryBase,
        skipRegistry: ctx.skipRegistry,
      });
      return { out: result.out, code: result.code, status: result.status };
    }

    case 'upgrade': {
      const result = await runUpgrade({
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
