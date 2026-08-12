/**
 * Assertions for `gui` / `dashboard` and `kill` (plan §5, §8.5).
 *
 * These start a real server on an ephemeral port inside a temp directory and
 * talk HTTP to it, because the things worth checking — that it binds loopback
 * only, that a second `gui` reuses the first, that a prompt typed in the page
 * lands in the same session file the terminal reads — are only true of a
 * running process. Every test tears its server down in a `finally`, so a
 * failure never leaves one behind.
 *
 * Without a `python3` on PATH the whole file skips with a plain message rather
 * than failing: the GUI is the one part of Phyllum that needs something beyond
 * Node, and saying so is more honest than a red suite.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { findPython, guiRecord, processAlive, runGui, runKill } from '../../lib/gui-command.js';
import { readState } from '../../lib/state.js';
import { systemJson } from '../../lib/system-json.js';
import { parse } from '../../lib/design-system.js';
import {
  PACKAGE_ROOT,
  POPULATED_FIXTURE,
  readFixture,
  snapshotContents,
  diffSnapshots,
  snapshotPaths,
  withTempDir,
} from './helpers.js';

const execFileAsync = promisify(execFile);
const python = findPython();
const skip = python ? false : 'python3 is not on PATH — the GUI server needs it';

const run = (line, dir) => execute(tokenizeLine(line), { cwd: dir, yes: true });

function project(dir) {
  fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
  return dir;
}

/** Start a server, hand the record to `body`, and always stop it again. */
async function withServer(dir, scope, body) {
  const started = await runGui({ cwd: dir, scope });
  try {
    assert.equal(started.code, 0, started.out);
    return await body(started.record, started);
  } finally {
    await runKill({ cwd: dir });
  }
}

const url = (record, route) => `http://127.0.0.1:${record.port}${route}`;
const getJson = async (record, route) => (await fetch(url(record, route))).json();

/** The machine's own non-loopback address, when it has one. */
function externalAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test('gui starts a server, records its PID and port, and answers on localhost', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    await withServer(dir, 'all', async (record) => {
      assert.ok(Number.isInteger(record.pid) && record.pid > 0);
      assert.ok(Number.isInteger(record.port) && record.port > 0);
      assert.equal(record.host, '127.0.0.1');
      assert.equal(record.url, `http://localhost:${record.port}`);
      assert.ok(processAlive(record.pid), 'the recorded PID should be a live process');

      const recorded = guiRecord(dir);
      assert.deepEqual(recorded, record, '.phyllum/session.json holds the same record');

      const response = await fetch(url(record, '/'));
      assert.equal(response.status, 200);
      const page = await response.text();
      assert.ok(page.includes('Phyllum'), 'the dashboard page is served');
      for (const view of ['Library', 'Workbench', 'Token view']) {
        assert.ok(page.includes(view), `the page ships the ${view} view`);
      }
    });
  });
});

test('the server refuses the external interface, not merely ignores it', { skip }, async (t) => {
  const address = externalAddress();
  if (!address) {
    t.skip('this machine has no non-loopback IPv4 interface to try');
    return;
  }
  await withTempDir(async (dir) => {
    project(dir);
    await withServer(dir, 'all', async (record) => {
      const refused = await new Promise((resolve) => {
        const socket = net.connect({ host: address, port: record.port, timeout: 2000 });
        socket.on('connect', () => {
          socket.destroy();
          resolve(false);
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('error', () => resolve(true));
      });
      assert.ok(refused, `the server answered on ${address} — it must bind loopback only`);
    });
  });
});

test('the server refuses to start on a non-loopback host at all', { skip }, async () => {
  const script = path.join(PACKAGE_ROOT, 'server', 'serve.py');
  await assert.rejects(
    () => execFileAsync(python, [script, '--host', '0.0.0.0', '--port', '0']),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /localhost only/);
      return true;
    },
  );
});

test('a second gui reprints the URL instead of starting a second process', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    await withServer(dir, 'all', async (record) => {
      const again = await runGui({ cwd: dir, scope: 'all' });
      assert.equal(again.code, 0);
      assert.ok(again.out.includes('already running'), again.out);
      assert.equal(again.record.pid, record.pid, 'same process');
      assert.equal(again.record.port, record.port, 'same port');
      assert.deepEqual(guiRecord(dir), record, 'and the record is unchanged');
    });
  });
});

test('kill stops the server and clears the record', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    const started = await runGui({ cwd: dir, scope: 'all' });
    const { record } = started;

    const stopped = await runKill({ cwd: dir });
    assert.equal(stopped.code, 0);
    assert.equal(stopped.stopped, true);
    assert.ok(stopped.out.includes('Stopped the dashboard'), stopped.out);
    assert.equal(guiRecord(dir), null, 'the record is cleared');
    assert.equal(processAlive(record.pid), false, 'and the process is gone');

    await assert.rejects(() => fetch(url(record, '/state')), 'nothing answers on the port any more');
  });
});

test('kill with nothing running reports cleanly rather than erroring', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    const result = await runKill({ cwd: dir });
    assert.equal(result.code, 0);
    assert.equal(result.stopped, false);
    assert.ok(result.out.includes('nothing to stop'), result.out);
  });
});

test('kill with a stale PID clears the record and says so', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    // A PID that is certainly not a running Phyllum server: one that has already
    // exited. Node reports it dead, which is exactly the crash case.
    const child = execFile(process.execPath, ['-e', '0']);
    const dead = child.pid;
    await new Promise((resolve) => child.on('exit', resolve));
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.phyllum', 'session.json'),
      JSON.stringify({ version: 1, gui: { pid: dead, port: 65000, url: 'http://localhost:65000' } }),
    );

    const result = await runKill({ cwd: dir });
    assert.equal(result.code, 0);
    assert.equal(result.stale, true);
    assert.ok(result.out.includes('not running any more'), result.out);
    assert.equal(guiRecord(dir), null, 'the stale record is cleared');
  });
});

test('gui on a stale record starts a fresh server rather than trusting it', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.phyllum', 'session.json'),
      JSON.stringify({ version: 1, gui: { pid: 2, port: 65001, url: 'http://localhost:65001' } }),
    );
    await withServer(dir, 'all', async (record) => {
      assert.notEqual(record.pid, 2);
      assert.notEqual(record.port, 65001);
      assert.ok(await fetch(url(record, '/state')).then((r) => r.ok));
    });
  });
});

// ---------------------------------------------------------------------------
// The JSON API
// ---------------------------------------------------------------------------

test('GET /system matches the reference parse of DESIGN-SYSTEM.md', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    await withServer(dir, 'all', async (record) => {
      const served = await getJson(record, '/system');
      const reference = systemJson(readFixture(POPULATED_FIXTURE));
      assert.deepEqual(served, JSON.parse(JSON.stringify(reference)));
      assert.equal(served.counts.components, 2);
      assert.ok(served.tokens.colours.some((row) => row.token === 'color-primary'));
    });
  });
});

test('the parse contract is one parser, not two', async () => {
  // The server's `GET /system` is literally this script's output. Checking the
  // command line the Python calls is checking the contract itself.
  const text = readFixture(POPULATED_FIXTURE);
  const reference = systemJson(text);
  const model = parse(text);
  assert.equal(reference.counts.components, model.components.length);
  assert.equal(reference.counts.colours, model.tokens.colours.length);
  assert.equal(reference.tokens.colours[0].token, model.tokens.colours[0][0]);
  assert.deepEqual(reference.backlog, model.backlog);

  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), text);
    const script = path.join(PACKAGE_ROOT, 'lib', 'system-json.js');
    const { stdout } = await execFileAsync(process.execPath, [script, dir]);
    assert.deepEqual(JSON.parse(stdout), JSON.parse(JSON.stringify(reference)));
    assert.deepEqual(snapshotPaths(dir), ['DESIGN-SYSTEM.md'], 'reading writes nothing');
  });
});

test('the parse contract reports a missing design system rather than inventing one', async () => {
  await withTempDir(async (dir) => {
    const script = path.join(PACKAGE_ROOT, 'lib', 'system-json.js');
    await assert.rejects(
      () => execFileAsync(process.execPath, [script, dir]),
      (error) => {
        assert.equal(JSON.parse(error.stdout).error, 'no-design-system');
        return true;
      },
    );
  });
});

test('GET /state carries the session state, the draft and the opening filter', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    // A draft written by the terminal is what the workbench view reads.
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.phyllum', 'session.json'),
      JSON.stringify({ version: 1, draft: { name: 'Button/Danger', status: 'review' } }),
    );

    await withServer(dir, 'components', async (record) => {
      const state = await getJson(record, '/state');
      assert.equal(state.scope, 'components');
      assert.equal(state.draft.name, 'Button/Danger');
      assert.equal(state.designSystem, true);
      assert.equal(state.gui.port, record.port);
      assert.deepEqual(state.queue, []);
    });
  });
});

test('POST /prompt round-trips into the session state the CLI reads', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    await withServer(dir, 'all', async (record) => {
      const response = await fetch(url(record, '/prompt'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'make the radius 8px', view: 'workbench' }),
      });
      assert.equal(response.status, 201);
      const { queued } = await response.json();
      assert.equal(queued.kind, 'prompt');

      // The CLI's own reader, not a second parse of the file.
      const queue = readState(dir).queue;
      assert.equal(queue.length, 1);
      assert.equal(queue[0].text, 'make the radius 8px');
      assert.equal(queue[0].source, 'gui');
      assert.equal(queue[0].status, 'pending');

      // And it is the same file the page reads back.
      const state = await getJson(record, '/state');
      assert.equal(state.queue[0].id, queued.id);

      // An empty prompt is refused rather than queued.
      const empty = await fetch(url(record, '/prompt'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '   ' }),
      });
      assert.equal(empty.status, 400);
      assert.equal(readState(dir).queue.length, 1);
    });
  });
});

test('a prompt never clobbers the rest of the session state', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    await withServer(dir, 'all', async (record) => {
      await fetch(url(record, '/prompt'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'first' }),
      });
      const state = readState(dir);
      assert.equal(state.gui.port, record.port, 'the server record survives a prompt');
      assert.equal(state.version, 1);
    });
  });
});

test('POST /upload lands in .phyllum/ and enqueues an image-mode create', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    await withServer(dir, 'all', async (record) => {
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
      const response = await fetch(url(record, '/upload'), {
        method: 'POST',
        headers: { 'X-Phyllum-Filename': 'Button Shot.PNG', 'Content-Type': 'application/octet-stream' },
        body: bytes,
      });
      assert.equal(response.status, 201);
      const { queued } = await response.json();

      assert.ok(queued.file.startsWith('.phyllum/uploads/'), queued.file);
      assert.ok(queued.file.endsWith('.png'), 'the extension is kept, lower-cased');
      assert.equal(queued.kind, 'create-image');
      assert.equal(queued.bytes, bytes.length);

      const landed = path.join(dir, queued.file);
      assert.ok(fs.existsSync(landed), 'the file is on disk');
      assert.deepEqual(fs.readFileSync(landed), bytes, 'byte for byte');

      const queue = readState(dir).queue;
      assert.equal(queue.length, 1);
      assert.equal(queue[0].file, queued.file);
    });
  });
});

test('an upload filename cannot escape .phyllum/uploads/', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    await withServer(dir, 'all', async (record) => {
      const response = await fetch(url(record, '/upload'), {
        method: 'POST',
        headers: { 'X-Phyllum-Filename': '../../DESIGN-SYSTEM.md' },
        body: Buffer.from('nope'),
      });
      const { queued } = await response.json();
      assert.ok(queued.file.startsWith('.phyllum/uploads/'), queued.file);
      assert.equal(
        fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'),
        readFixture(POPULATED_FIXTURE),
        'the design system is untouched',
      );
    });
  });
});

test('the server writes only inside .phyllum/', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    const before = snapshotContents(dir);
    await withServer(dir, 'all', async (record) => {
      await fetch(url(record, '/prompt'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'anything' }),
      });
      await fetch(url(record, '/upload'), {
        method: 'POST',
        headers: { 'X-Phyllum-Filename': 'shot.png' },
        body: Buffer.from([1, 2, 3]),
      });
    });
    const diff = diffSnapshots(before, snapshotContents(dir));
    for (const rel of [...diff.added, ...diff.changed]) {
      assert.ok(rel.startsWith('.phyllum/'), `the server wrote outside .phyllum/: ${rel}`);
    }
    assert.deepEqual(diff.removed, []);
    assert.ok(snapshotPaths(dir).includes('DESIGN-SYSTEM.md'));
  });
});

test('the server refuses a write outside .phyllum/ at the source', { skip }, async () => {
  const probe = [
    'import sys, os',
    `sys.path.insert(0, ${JSON.stringify(path.join(PACKAGE_ROOT, 'server'))})`,
    'import serve',
    'try:',
    '    serve._write_under_state_dir(os.getcwd(), "../escaped.md", b"x")',
    '    print("WROTE")',
    'except PermissionError as error:',
    '    print("REFUSED")',
  ].join('\n');
  await withTempDir(async (dir) => {
    // -B: importing the server must not leave a __pycache__ in the package.
    const { stdout } = await execFileAsync(python, ['-B', '-c', probe], { cwd: dir });
    assert.equal(stdout.trim(), 'REFUSED');
  });
});

test('a request with a foreign Host header is refused', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    await withServer(dir, 'all', async (record) => {
      // `fetch` will not let a page forge Host, so this goes through node:http:
      // the case it guards against is a DNS rebind, which is not a browser fetch.
      const status = await new Promise((resolve, reject) => {
        const request = http.get(
          { host: '127.0.0.1', port: record.port, path: '/state', headers: { Host: 'phyllum.example.com' } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.on('error', reject);
      });
      assert.equal(status, 403);
    });
  });
});

// ---------------------------------------------------------------------------
// Scope words and the alias (plan §6, §8.5)
// ---------------------------------------------------------------------------

test('the dashboard scope word is the opening filter, visible in GET /state', { skip }, async () => {
  await withTempDir(async (dir) => {
    project(dir);
    const started = await run('gui tokens', dir);
    try {
      assert.equal(started.code, 0);
      const record = guiRecord(dir);
      assert.equal(record.scope, 'tokens');
      assert.equal((await getJson(record, '/state')).scope, 'tokens');

      // The alias is the same subskill: it reuses the running server and only
      // changes the filter the page opens on.
      const asAlias = await run('dashboard components', dir);
      assert.equal(asAlias.code, 0);
      assert.ok(asAlias.out.includes('already running'), asAlias.out);
      assert.equal(guiRecord(dir).pid, record.pid, 'still one server');
      assert.equal((await getJson(record, '/state')).scope, 'components');

      const bare = await run('dashboard', dir);
      assert.equal(bare.code, 0);
      assert.equal((await getJson(record, '/state')).scope, 'all', 'bare dashboard means all');

      const explicit = await run('gui all', dir);
      assert.equal(explicit.code, 0);
      assert.equal((await getJson(record, '/state')).scope, 'all');
    } finally {
      await runKill({ cwd: dir });
    }
  });
});

test('an unrecognised dashboard scope prints the valid ones and starts nothing', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    const { out, code } = await run('dashboard sideways', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('is not a scope Phyllum knows'), out);
    assert.ok(out.includes('tokens, components, all'));
    assert.ok(out.includes('phyllum dashboard'), 'named as the user typed it');
    assert.equal(guiRecord(dir), null, 'nothing was started');
    assert.deepEqual(snapshotPaths(dir), ['DESIGN-SYSTEM.md']);
  });
});

test('gui and dashboard are one command, before init as well', async () => {
  await withTempDir(async (dir) => {
    const a = await run('gui', dir);
    const b = await run('dashboard', dir);
    assert.deepEqual(b, a);
    assert.ok(a.out.includes('phyllum init'));
    assert.deepEqual(snapshotPaths(dir), [], 'nothing is created before init');
  });
});

test('without a python3 on PATH, gui says so instead of half-starting', async () => {
  await withTempDir(async (dir) => {
    project(dir);
    const result = await runGui({ cwd: dir, env: { PATH: '' } });
    assert.equal(result.code, 1);
    assert.ok(result.out.includes('Python 3'), result.out);
    assert.ok(result.out.includes('phyllum system'), 'and points at the terminal listing');
    assert.equal(guiRecord(dir), null);
  });
});
