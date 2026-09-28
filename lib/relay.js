/**
 * The prompt relay's far end — how a prompt the dashboard queued reaches the
 * Claude Code session.
 *
 * The dashboard has always been "a viewer and a prompt relay": `POST /prompt`
 * appends `{ kind: 'prompt', text }` to `.phyllum/session.json`. Until this
 * module nothing ever read those entries back, so the Backlog's Assess button
 * queued `assess` and the request sat there for good. This file is the reader.
 *
 * The session is reached two ways, because Claude Code offers no event for "a
 * file changed" and each way covers the other's gap:
 *
 *   **The hooks.** A `UserPromptSubmit` hook hands pending prompts over as
 *   context the next time the user types anything, and a `Stop` hook hands them
 *   over when Claude finishes a reply. Reliable, and survives a restarted
 *   session — but neither fires while the terminal sits idle.
 *
 *   **The watcher.** `node lib/relay.js wait <root>`, run in the background by
 *   the session that started the dashboard, polls the queue and exits the
 *   moment a prompt arrives. A background command exiting wakes Claude, so a
 *   click is picked up within a second or two even when nobody is typing. It
 *   exits on its own once the dashboard stops.
 *
 * Whichever end reads a prompt first removes it, so a prompt is never handed
 * over twice. Identical prompts collapse into one: three clicks on Assess are
 * one assessment, not three.
 *
 * The hooks live in `.claude/settings.local.json` — Claude Code's personal,
 * uncommitted settings — because the command names this package's absolute
 * path, which is true on this machine and nowhere else. `init`, `upgrade` and
 * the first dashboard prompt install them; see `installRelayHook`.
 *
 * Run directly:
 *
 *   node lib/relay.js prompt           the UserPromptSubmit hook (reads stdin)
 *   node lib/relay.js stop             the Stop hook (reads stdin)
 *   node lib/relay.js wait <root>      the background watcher
 *   node lib/relay.js install <root>   install the hooks; prints JSON
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readState, writeState } from './state.js';
import { CLAUDE_SETTINGS_FILE, writeGuarded } from './write.js';

export const RELAY_SCRIPT = fileURLToPath(import.meta.url);

/** The shell comment that marks a hook command as this relay's, whatever path it names. */
export const RELAY_MARKER = '# phyllum-relay';

/** The two Claude Code events the relay hooks, and the argument each one runs with. */
export const RELAY_EVENTS = { UserPromptSubmit: 'prompt', Stop: 'stop' };

const WAIT_INTERVAL_MS = 1000;

/** The hook command for one event, naming this copy of the package. */
export function hookCommand(mode) {
  return `node "${RELAY_SCRIPT}" ${mode} ${RELAY_MARKER}`;
}

/**
 * Take every pending dashboard prompt off the queue, oldest first.
 *
 * Only `kind: 'prompt'` entries: an image upload is `create`'s to drain, and
 * stays where it is. Duplicates collapse onto the first one, in queue order.
 */
export function takeQueuedPrompts(root) {
  const { queue: raw } = readState(root);
  const queue = Array.isArray(raw) ? raw : [];
  const taken = [];
  const kept = [];
  for (const entry of queue) {
    if (entry && entry.kind === 'prompt' && entry.status === 'pending' && typeof entry.text === 'string') {
      taken.push(entry);
    } else {
      kept.push(entry);
    }
  }
  if (taken.length === 0) return [];
  writeState(root, { queue: kept });

  const seen = new Set();
  return taken.filter((entry) => {
    const key = entry.text.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** What the session is told, in the words it will act on. */
export function renderRelay(prompts) {
  const one = prompts.length === 1;
  const lines = [
    `The Phyllum dashboard queued ${one ? 'a prompt' : `${prompts.length} prompts`} for this session. ` +
      `Run ${one ? 'it' : 'each one, in order,'} as if the user had typed it here:`,
    ...prompts.map((entry) => `- ${entry.text.trim()}`),
  ];
  return lines.join('\n');
}

/** The settings file's parsed contents, `{}` when absent, or null when unreadable. */
function readSettings(root) {
  const file = path.join(path.resolve(root), CLAUDE_SETTINGS_FILE);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const isRelayGroup = (group) =>
  Array.isArray(group?.hooks) && group.hooks.some((hook) => String(hook?.command ?? '').includes(RELAY_MARKER));

/** Are both hooks installed, naming this copy of the package? */
export function relayHookInstalled(root) {
  const settings = readSettings(root);
  if (!settings) return false;
  return Object.entries(RELAY_EVENTS).every(([event, mode]) =>
    (settings.hooks?.[event] ?? []).some(
      (group) => isRelayGroup(group) && group.hooks.some((hook) => hook.command === hookCommand(mode)),
    ),
  );
}

/**
 * Install the relay's two hooks into `.claude/settings.local.json`.
 *
 * A merge, never a rewrite: every other setting and every other hook stays
 * exactly as it was. A relay entry naming an older copy of the package is
 * replaced rather than left beside the new one, so the hook never runs twice.
 * A file that is not valid JSON is left untouched — a person's settings are not
 * Phyllum's to repair.
 *
 * Returns `{ status, path }`: `installed`, `already`, or `unreadable`.
 */
export function installRelayHook(root) {
  if (relayHookInstalled(root)) return { status: 'already', path: CLAUDE_SETTINGS_FILE };
  const settings = readSettings(root);
  if (!settings) return { status: 'unreadable', path: CLAUDE_SETTINGS_FILE };

  const hooks = settings.hooks && typeof settings.hooks === 'object' ? { ...settings.hooks } : {};
  for (const [event, mode] of Object.entries(RELAY_EVENTS)) {
    const groups = Array.isArray(hooks[event]) ? hooks[event].filter((group) => !isRelayGroup(group)) : [];
    groups.push({ hooks: [{ type: 'command', command: hookCommand(mode), timeout: 10 }] });
    hooks[event] = groups;
  }
  writeGuarded(root, CLAUDE_SETTINGS_FILE, `${JSON.stringify({ ...settings, hooks }, null, 2)}\n`, {
    init: true,
  });
  return { status: 'installed', path: CLAUDE_SETTINGS_FILE };
}

/** One line for `init` and `upgrade` to report the install with. */
export function renderRelayHookLine({ status, path: file }) {
  if (status === 'installed') return `  Added the dashboard's prompt relay hooks to ${file}.`;
  if (status === 'already') return `  The dashboard's prompt relay hooks are already in ${file}.`;
  return `  Left ${file} alone — it is not valid JSON, so the dashboard's prompt relay hooks are not installed.`;
}

/** Is the dashboard this project recorded still running? */
function dashboardRunning(root) {
  const pid = readState(root).gui?.pid;
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for the next dashboard prompt. Resolves with the prompts taken, or with
 * null once the dashboard has stopped — a watcher never outlives the page.
 */
export async function waitForPrompts(root, { intervalMs = WAIT_INTERVAL_MS, running = dashboardRunning } = {}) {
  for (;;) {
    const prompts = takeQueuedPrompts(root);
    if (prompts.length > 0) return prompts;
    if (!running(root)) return null;
    await sleep(intervalMs);
  }
}

/** The hook's stdin, parsed; `{}` when there is none or it is not JSON. */
function readHookInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

/**
 * One hook run. Never fails the user's prompt or Claude's stop: a hook that
 * cannot read the queue says nothing and exits 0.
 */
export function runHook(mode, input = {}, env = process.env) {
  const root = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  let prompts;
  try {
    prompts = takeQueuedPrompts(root);
  } catch {
    return '';
  }
  if (prompts.length === 0) return '';
  if (mode === 'stop') return JSON.stringify({ decision: 'block', reason: renderRelay(prompts) });
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: renderRelay(prompts) },
  });
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const [mode, rootArg] = process.argv.slice(2);
  const root = rootArg ?? process.cwd();
  if (mode === 'prompt' || mode === 'stop') {
    const out = runHook(mode, readHookInput());
    if (out) process.stdout.write(`${out}\n`);
  } else if (mode === 'install') {
    let result;
    try {
      result = installRelayHook(root);
    } catch (error) {
      result = { status: 'refused', path: CLAUDE_SETTINGS_FILE, message: error.message };
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (mode === 'wait') {
    const prompts = await waitForPrompts(root);
    process.stdout.write(
      prompts
        ? `${renderRelay(prompts)}\n\nAfter running ${prompts.length === 1 ? 'it' : 'them'}, start this watcher again in the background.\n`
        : 'The dashboard stopped, so the relay watcher stopped too.\n',
    );
  } else {
    process.stderr.write('usage: node lib/relay.js prompt|stop|wait <root>|install <root>\n');
    process.exitCode = 2;
  }
}
