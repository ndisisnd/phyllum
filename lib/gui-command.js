/**
 * `basal gui` (alias `dashboard`) and `basal kill` — the server lifecycle
 * (plan §5, §8 milestone 4).
 *
 * The CLI owns mechanics here and nothing else: find a Python, pick a free
 * port, start `server/serve.py`, wait until it actually answers, and record the
 * PID and port in `.basal/session.json`. The dashboard itself is a viewer and a
 * prompt relay — no model is ever called from this file, or from the server.
 *
 * Two promises shape the code:
 *
 *   Rerunnable. A second `gui` while one is running reprints the URL instead of
 *   starting a second process, and `kill` with nothing running (or a stale PID
 *   left by a crash) reports that cleanly and clears the record rather than
 *   erroring.
 *
 *   Localhost only. The server is started with an explicit `--host 127.0.0.1`
 *   and refuses any other host, so the dashboard is never reachable from
 *   another machine.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

import { PACKAGE_ROOT } from './template.js';
import { readState, writeState } from './state.js';
import { SCOPES } from './registry.js';

export const HOST = '127.0.0.1';
export const SERVER_SCRIPT = path.join(PACKAGE_ROOT, 'server', 'serve.py');
const PYTHON_CANDIDATES = ['python3', 'python'];

/** The `python3` binary on PATH, or null. A lookup, not an invocation. */
export function findPython(env = process.env) {
  const raw = env.PATH ?? '';
  for (const name of PYTHON_CANDIDATES) {
    for (const dir of raw.split(path.delimiter)) {
      if (dir === '') continue;
      const candidate = path.join(dir, name);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

/** Is this PID a live process? EPERM counts as alive: it exists, just not ours. */
export function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** The recorded server, or null. */
export function guiRecord(root) {
  const record = readState(root).gui;
  if (!record || typeof record !== 'object') return null;
  return record;
}

/** A port nobody is listening on right now, from the OS's ephemeral range. */
export function freePort(host = HOST) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen({ host, port: 0 }, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** One GET against the local server; resolves false rather than throwing. */
function ping(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const request = http.get({ host: HOST, port, path: '/state', timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait until the server answers, or give up. */
async function waitUntilServing(port, { timeoutMs = 10000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await ping(port)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(intervalMs);
  }
}

export function renderNoPythonNotice() {
  return (
    '`gui` needs Python 3 to run its server, and there is no `python3` on your PATH.\n' +
    'Basal ships the server as one stdlib-only file (server/serve.py) — install Python 3, or use\n' +
    '`basal system` in the terminal, which shows the same design system with no server at all.\n'
  );
}

function renderRunning(record, { alreadyRunning }) {
  const lines = [];
  lines.push(
    alreadyRunning
      ? `The dashboard is already running — reusing it rather than starting a second server.`
      : `Dashboard up — localhost only, no external access.`,
  );
  lines.push(`  ${record.url}`);
  lines.push(`  opening filter: ${record.scope}   pid: ${record.pid}   port: ${record.port}`);
  lines.push('It is a viewer and a prompt relay: all reasoning stays in your Claude Code session.');
  lines.push('Stop it with `basal kill`.');
  return `${lines.join('\n')}\n`;
}

/**
 * Run `basal gui`.
 *
 * ctx: { cwd, env, scope, timeoutMs }
 */
export async function runGui(ctx = {}) {
  const root = ctx.cwd ?? process.cwd();
  const scope = SCOPES.includes(ctx.scope) ? ctx.scope : 'all';

  // Already running? Reprint the URL. The scope word is the opening filter, so
  // a new one is recorded for the page to pick up on its next poll — still one
  // server, one record, one process.
  const existing = guiRecord(root);
  if (existing && processAlive(existing.pid) && (await ping(existing.port))) {
    const record = { ...existing, scope };
    if (existing.scope !== scope) writeState(root, { gui: record });
    return { out: renderRunning(record, { alreadyRunning: true }), code: 0, record };
  }
  if (existing) writeState(root, { gui: null });

  const python = findPython(ctx.env ?? process.env);
  if (!python) return { out: renderNoPythonNotice(), code: 1 };

  const port = ctx.port ?? (await freePort());
  const child = spawn(
    python,
    [
      SERVER_SCRIPT,
      '--root',
      path.resolve(root),
      '--host',
      HOST,
      '--port',
      String(port),
      '--scope',
      scope,
      // The server never parses DESIGN-SYSTEM.md itself; it calls this exact
      // Node back for `GET /system`, so both sides share one parser.
      '--node',
      process.execPath,
    ],
    { cwd: path.resolve(root), detached: true, stdio: 'ignore' },
  );
  child.unref();

  const serving = await waitUntilServing(port, { timeoutMs: ctx.timeoutMs ?? 10000 });
  if (!serving) {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      // it never came up; nothing to stop
    }
    return {
      out:
        `The server did not come up on port ${port} within the time allowed, so nothing was recorded.\n` +
        `Try again, or run it by hand to see why: ${python} ${SERVER_SCRIPT} --root . --port ${port}\n`,
      code: 1,
    };
  }

  const record = {
    pid: child.pid,
    port,
    host: HOST,
    url: `http://localhost:${port}`,
    scope,
    startedAt: new Date().toISOString(),
  };
  writeState(root, { gui: record });
  return { out: renderRunning(record, { alreadyRunning: false }), code: 0, record };
}

/**
 * Run `basal kill`. Never an error path: nothing running, a stale PID from a
 * crash, and a live server all end the same way — no record, exit 0.
 */
export async function runKill(ctx = {}) {
  const root = ctx.cwd ?? process.cwd();
  const record = guiRecord(root);

  if (!record || !Number.isInteger(record.pid)) {
    if (record) writeState(root, { gui: null });
    return {
      out: 'No dashboard is running, so there was nothing to stop.\n',
      code: 0,
      stopped: false,
    };
  }

  if (!processAlive(record.pid)) {
    writeState(root, { gui: null });
    return {
      out:
        `The recorded dashboard (pid ${record.pid}, port ${record.port}) is not running any more — ` +
        'a stale record from a crash or a reboot.\nCleared it; nothing else to do.\n',
      code: 0,
      stopped: false,
      stale: true,
    };
  }

  try {
    process.kill(record.pid, 'SIGTERM');
  } catch {
    // It died between the check and the signal; the record still goes.
  }

  // Give it a moment to fall over, then stop waiting either way — the record is
  // cleared regardless, so `kill` is never a command you have to run twice.
  const deadline = Date.now() + (ctx.timeoutMs ?? 3000);
  while (processAlive(record.pid) && Date.now() < deadline) await sleep(25);

  writeState(root, { gui: null });
  return {
    out: `Stopped the dashboard (pid ${record.pid}, port ${record.port}) and cleared its record.\n`,
    code: 0,
    stopped: true,
  };
}
