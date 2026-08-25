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
 * What this file covers is a promise rather than a look (v0.7.2): the server
 * lifecycle, the JSON API and the one parse contract, the delivery contract
 * (no webfont, no CDN, no `src=`, no network call anywhere in the page), the
 * escape contracts — only a value the page's own gate recognises is ever
 * inlined into a `style` attribute — the backlog's parse and its refs, and the
 * theme choice as behaviour: the `localStorage` round-trip, the fallback to
 * `system`, and a server that has never heard of a theme. How the page looks
 * is not pinned here; a restyle rewrites no assertion in this file.
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
import { stripTicks, tableAfter } from '../../lib/md-tables.js';
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
// The page itself — the escape gates and no network (v0.3.0 §6.5, §8)
// ---------------------------------------------------------------------------

const GUI_PAGE = path.join(PACKAGE_ROOT, 'gui', 'index.html');
const GUI_REF = path.join(PACKAGE_ROOT, 'skill', 'refs', 'gui', 'cards.md');
const GUI_MAIN_REF = path.join(PACKAGE_ROOT, 'skill', 'refs', 'gui', 'gui.md');
const readPage = () => fs.readFileSync(GUI_PAGE, 'utf8');

/**
 * The page's own swatch rules, lifted out and run.
 *
 * The region between the `phyllum:swatch-contract` markers is written pure on
 * purpose — no DOM, no fetch — so the suite can execute exactly the code the
 * browser executes rather than a restatement of it. That is what stops the ref
 * table, the page and these assertions from drifting apart.
 */
function swatchContract() {
  const text = readPage();
  const start = text.indexOf('// --- phyllum:swatch-contract');
  const end = text.indexOf('// --- end phyllum:swatch-contract');
  assert.ok(start !== -1 && end > start, 'the page marks its swatch-contract region');
  const region = text.slice(start, end);
  assert.ok(!/\b(document|window)\b/.test(region), 'the contract region touches no DOM');
  const factory = new Function(
    `${region}\nreturn { SWATCH, CARD, isColourValue, isGradientValue, isFillValue, luminance, isNearWhite,` +
      ' inkFor, cardHtml, swatchHtml, rampGroups, rampHtml };',
  );
  return factory();
}

test('only a value the gate recognises is ever inlined into a swatch style attribute', () => {
  const contract = swatchContract();

  // A recorded colour is inlined as itself, and nothing else rides along.
  const card = contract.cardHtml('color-primary', '#2563EB');
  assert.ok(card.includes('background:#2563EB'), 'a hex literal is the swatch fill');
  assert.match(
    card,
    /<div class="card__swatch" style="background:[^;"]*"><\/div>/,
    'and the swatch declares nothing beyond that background',
  );

  // Every gradient shape the colours pass reads is a shape the swatch paints.
  for (const shape of [
    'linear-gradient(#fff, #eee)',
    'radial-gradient(circle, #fff 0%, #000 100%)',
    'conic-gradient(from 90deg, red, blue)',
    'repeating-linear-gradient(45deg, #fff 0 10px, #000 10px 20px)',
    'repeating-radial-gradient(#fff, #000 20%)',
    'repeating-conic-gradient(#fff 0deg 10deg, #000 10deg 20deg)',
  ]) {
    assert.ok(contract.isGradientValue(shape), `${shape} fills a swatch`);
    assert.ok(contract.cardHtml('g', shape).includes('background:' + shape));
  }

  // The value comes out of a file a person edits, so it is gated before it is
  // inlined: anything that could end the declaration or open a request is not
  // painted, it is bordered and empty.
  for (const hostile of [
    'linear-gradient(#fff, #eee); position:fixed',
    'linear-gradient(url(http://example.com/x.png))',
    'linear-gradient(#fff) /* x */',
    'var(--brand)',
    'not-a-gradient(#fff)',
  ]) {
    assert.equal(contract.isGradientValue(hostile), false, `${hostile} must not reach a style attribute`);
    const refused = contract.cardHtml('g', hostile);
    assert.ok(refused.includes('background:transparent'), refused);
  }

  // A value that is not a colour at all is never painted either.
  const odd = contract.swatchHtml('color-brand', 'var(--brand)');
  assert.ok(odd.includes('background:transparent'), odd);
});

test('the page fetches nothing from the network — no webfont, no CDN, no external URL', () => {
  const text = readPage();
  assert.equal(text.match(/https?:\/\//g), null, 'no absolute URL appears anywhere in the page');
  assert.equal(text.match(/\/\/[a-z0-9-]+\.[a-z]{2,}/gi), null, 'nor a protocol-relative one');
  assert.ok(!/@import/.test(text), 'no CSS import');
  assert.ok(!/@font-face/.test(text), 'no webfont is declared, let alone downloaded');
  assert.ok(!/<link\b/i.test(text), 'no <link> to a second asset');
  assert.ok(!/<script[^>]+\bsrc=/i.test(text), 'the script is inline — one file, no second request');
  assert.ok(
    !/@carbon\/|carbon-components|@notion|unpkg|jsdelivr|googleapis|vercel\.com/i.test(text),
    'and no design-system package or CDN pulled in — the aesthetic is a direction, not a dependency',
  );
  assert.ok(!/\bsrc\s*=/i.test(text), 'nothing on the page names a second asset to load at all');

  // Everything it does request is its own server, by relative path.
  const requests = [...text.matchAll(/fetch\(\s*'([^']+)'/g)].map((match) => match[1]);
  assert.ok(requests.length > 0, 'the page does talk to its server');
  for (const route of requests) {
    assert.match(
      route,
      /^\/(state|system|reports|build-reports|prompt|upload)$/,
      `${route} must be a same-origin route`,
    );
  }
});

/**
 * The number sections' own contract, lifted and run (v0.5.1, recut v0.6.0).
 *
 * The region between the `phyllum:numbers-contract` markers reads its rows
 * through the page's `cell` helper, escapes with the page's `esc` and heads
 * each section with the page's `heading`, so all three are lifted out of the
 * page too rather than restated here — the suite runs the code the browser
 * runs.
 */
function numbersContract() {
  const text = readPage();
  const start = text.indexOf('// --- phyllum:numbers-contract');
  const end = text.indexOf('// --- end phyllum:numbers-contract');
  assert.ok(start !== -1 && end > start, 'the page marks its numbers-contract region');
  const region = text.slice(start, end);
  assert.ok(!/\b(document|window)\b/.test(region), 'the contract region touches no DOM');

  const esc = text.match(/const esc = \(value\) =>[\s\S]*?;\n/);
  const cell = text.match(/const cell = \(row, name, index\) =>[^\n]*\n/);
  const heading = text.match(/const heading = \(title, count, note\) =>[\s\S]*?;\n/);
  assert.ok(esc && cell && heading, 'the helpers the region leans on are the page\'s own');

  // The shape gates a specimen passes its value through (v0.6.0 §2) are the
  // page's own too — the region never writes a second opinion on what a length
  // is, so they are lifted rather than restated here.
  const isLength = text.match(/const isLength = \(value\) =>[^\n]*\n/);
  const isLengths = text.match(/const isLengths = \(value\) => \{[\s\S]*?\n {6}\};\n/);
  const isShadow = text.match(/const isShadow = \(value\) => \{[\s\S]*?\n {6}\};\n/);
  const isShadowList = text.match(/const isShadowList = \(value\) => \{[\s\S]*?\n {6}\};\n/);
  const splitTopLevel = text.match(/function splitTopLevel\(text\) \{[\s\S]*?\n {6}\}\n/);
  assert.ok(
    isLength && isLengths && isShadow && isShadowList && splitTopLevel,
    'the shape gates a specimen leans on are the page\'s own',
  );

  const factory = new Function(
    `${esc[0]}${cell[0]}${heading[0]}${isLength[0]}${isLengths[0]}${isShadow[0]}${isShadowList[0]}${splitTopLevel[0]}${region}` +
      '\nreturn { NUMBERS, numberGroups, numberGroupHtml, numbersSections, heading, readingNote,' +
      ' specimenKind, specimenHtml };',
  );
  return factory();
}

/** The rows a grouped list is worth testing on — two groups, one repeat, two blanks. */
const numberRows = () => [
  { token: 'rounded-sm', value: '4px', 'applies to': 'corner radius' },
  { token: 'space-md', value: '16px', 'applies to': 'padding' },
  { token: 'rounded-md', value: '12px', 'applies to': 'corner radius' },
  { token: 'hairline', value: '1px', 'applies to': 'Border Width' },
  { token: 'stage', value: '2rem', 'applies to': '' },
  { token: 'nudge', value: '2px' },
];

test('numbers group by their `applies to` reading, in the file\'s own words and file order', () => {
  const contract = numbersContract();
  const rows = numberRows();
  const groups = contract.numberGroups(rows, 'applies to');

  assert.deepEqual(
    groups.map((group) => group.label),
    ['corner radius', 'padding', 'Border Width', contract.NUMBERS.ungrouped],
    'one group per distinct reading, in the order the file first gives it, blanks last',
  );

  // Every label but the trailing one is a cell of the file, character for
  // character: nothing is title-cased, singularised, translated or invented.
  const readings = new Set(rows.map((row) => row['applies to']).filter(Boolean));
  for (const group of groups.slice(0, -1)) {
    assert.ok(readings.has(group.label), `${group.label} is a reading the file itself carries`);
  }
  assert.ok(
    groups.some((group) => group.label === 'Border Width'),
    'an oddly-cased reading keeps its own casing — the dashboard shows the file',
  );

  assert.deepEqual(
    groups[0].rows.map((row) => row.token),
    ['rounded-sm', 'rounded-md'],
    'and inside a group the tokens keep their file order too',
  );
  assert.deepEqual(groups[0].rows.map((row) => row.value), ['4px', '12px']);

  // The two rows that say nothing about what they apply to fall into one
  // trailing group rather than into a guess.
  const trailing = groups.at(-1);
  assert.equal(trailing.applies, '', 'the trailing group stands for an empty cell');
  assert.deepEqual(trailing.rows.map((row) => row.token), ['stage', 'nudge']);

  // Every row lands in exactly one group, and no group is empty.
  assert.equal(groups.reduce((sum, group) => sum + group.rows.length, 0), rows.length);
  assert.ok(groups.every((group) => group.rows.length > 0));

  // With every cell filled there is no trailing group at all.
  const filled = contract.numberGroups(rows.slice(0, 4), 'applies to');
  assert.deepEqual(filled.map((group) => group.label), ['corner radius', 'padding', 'Border Width']);

  // A table with no third column is one ungrouped list, not a crash.
  const columnless = contract.numberGroups(rows, '');
  assert.deepEqual(columnless.map((group) => group.label), [contract.NUMBERS.ungrouped]);
  assert.equal(columnless[0].rows.length, rows.length);
});

test('a number row cannot write markup or an unchecked style into the list', () => {
  const contract = numbersContract();
  const groups = contract.numberGroups(numberRows(), 'applies to');
  const html = groups.map(contract.numberGroupHtml).join('');

  // The inline styles a specimen writes are the token's own property and
  // nothing else — never a size, never a second declaration.
  for (const style of html.match(/style="([^"]*)"/g) ?? []) {
    assert.match(style, /^style="(border-radius|gap|box-shadow):/, `${style} is the token's own property`);
    assert.equal(/width:|height:/.test(style), false, `${style} sizes nothing`);
  }

  // A hand-edited file cannot write markup into the list, heading included.
  const hostile = contract.numberGroupHtml(
    contract.numberGroups([{ token: '<b>x</b>', value: '"4px"', 'applies to': '<i>r</i>' }], 'applies to')[0],
  );
  assert.equal(/<b>|<i>/.test(hostile), false, hostile);
  assert.ok(hostile.includes('&lt;b&gt;x&lt;/b&gt;') && hostile.includes('&quot;4px&quot;'));
  assert.ok(hostile.includes('&lt;i&gt;r&lt;/i&gt;'), 'the label is escaped in the heading too');
});

test('the ungrouped label is the one skill/refs/gui/cards.md records', () => {
  const contract = numbersContract();
  const rows = tableAfter(fs.readFileSync(GUI_REF, 'utf8'), '<!-- phyllum:numbers -->', 'refs/gui/cards.md');
  const recorded = rows.find((row) => row[0] === 'ungrouped label');
  assert.ok(recorded, 'the ref records the label a blank `applies to` cell falls to');
  assert.equal(stripTicks(recorded[1]), contract.NUMBERS.ungrouped);
});

test('a value the page cannot read falls back to the plain line, never to an unchecked style', () => {
  const contract = numbersContract();

  // Every one of these is a value a person could type into DESIGN-SYSTEM.md:
  // an escape out of the attribute, a second declaration, a comment, a fetch.
  const hostile = [
    ['radius', '4px;background:url(http://x/y)'],
    ['radius', '4px" onmouseover="alert(1)'],
    ['radius', 'var(--brand)'],
    ['radius', 'expression(alert(1))'],
    ['spacing', '1rem;color:red'],
    ['spacing', 'calc(100% - 2px)'],
    ['spacing', '/* */16px'],
    ['shadow', '0 1px 2px red;background:url(x)'],
    ['shadow', 'none'],
    ['shadow', '0 1px 2px rgba(0,0,0,0.2), url(x)'],
  ];
  for (const [applies, value] of hostile) {
    const html = contract.numberGroupHtml(
      contract.numberGroups([{ token: 'suspect', value, 'applies to': applies }], 'applies to')[0],
    );
    assert.equal(/style=/.test(html), false, `${value} never reaches a style attribute`);
    assert.equal(/number--specimen|number__specimen/.test(html), false, `${value} draws nothing`);
    assert.ok(html.includes('<li class="number" data-token="suspect">'), html);
    // The value is still shown — the dashboard shows the file — but only ever
    // as escaped text inside the caption, where it can open no attribute and
    // start no tag. Strip the markup and nothing that could be markup is left.
    assert.equal(/[<>"]/.test(html.replace(/<[^>]*>/g, '')), false, html);
  }

  // A bad row does not take its neighbours down with it: the section still
  // draws every value it can read.
  const mixed = contract.numberGroupHtml(
    contract.numberGroups(
      [
        { token: 'good', value: '4px', 'applies to': 'radius' },
        { token: 'bad', value: 'var(--brand)', 'applies to': 'radius' },
      ],
      'applies to',
    )[0],
  );
  assert.equal((mixed.match(/style=/g) ?? []).length, 1, 'the readable row still draws');
  assert.ok(mixed.includes('<li class="number" data-token="bad">'), 'and the unreadable one is a plain line');
});

test('the fixture\'s own Numbers row groups under the reading the file gives it', () => {
  const contract = numbersContract();
  const system = systemJson(readFixture(POPULATED_FIXTURE));
  const groups = contract.numberGroups(system.tokens.numbers, system.columns.numbers[2]);
  assert.deepEqual(groups.map((group) => group.label), ['corner radius']);
  assert.deepEqual(groups[0].rows.map((row) => row.token), ['rounded-md']);
});

test('a typography specimen only ever inlines a shape it recognises', () => {
  const text = readPage();
  // The values come from a user-edited file, so they are gated, not trusted.
  for (const guard of ['safeSize', 'safeWeight', 'safeLeading']) {
    assert.ok(text.includes(guard), `${guard} guards what reaches a style attribute`);
  }
});

// ---------------------------------------------------------------------------
// The Backlog, cut by component (v0.7.0 §3)
// ---------------------------------------------------------------------------

/**
 * The Backlog's own contract, lifted and run — the same trick the swatch and
 * numbers regions above use. The region between the `phyllum:backlog-contract`
 * markers is written pure on purpose, so the suite executes exactly the code
 * the browser executes rather than a restatement of it; `esc` and `heading`
 * are lifted out of the page too, because the region leans on the page's own
 * escaping and the page's own header row rather than a second opinion.
 */
function backlogContract() {
  const text = readPage();
  const start = text.indexOf('// --- phyllum:backlog-contract');
  const end = text.indexOf('// --- end phyllum:backlog-contract');
  assert.ok(start !== -1 && end > start, 'the page marks its backlog-contract region');
  const region = text.slice(start, end);
  assert.ok(!/\b(document|window)\b/.test(region), 'the contract region touches no DOM');

  const esc = text.match(/const esc = \(value\) =>[\s\S]*?;\n/);
  const heading = text.match(/const heading = \(title, count, note\) =>[\s\S]*?;\n/);
  assert.ok(esc && heading, 'the helpers the region leans on are the page\'s own');

  const factory = new Function(
    `${esc[0]}${heading[0]}${region}` +
      '\nreturn { BACKLOG, backlogComponent, backlogGroups, backlogGroupHtml, backlogSections, heading };',
  );
  return factory();
}

/** The names `DESIGN-SYSTEM.md` records in these tests. */
const BACKLOG_NAMES = ['Button/Rail', 'Button/Filter', 'Panel'];

/** A backlog worth grouping — two components, interleaved, plus two strays. */
const backlogLines = () => [
  'TODO: fill contract slot `border-colour` (Panel)',
  'TODO: tokenise `transparent` (Button/Rail background)',
  'TODO: something nobody parsed',
  'TODO: tokenise `0.5rem 0.75rem` (Button/Rail padding)',
  'TODO: fill contract slot `disabled` (Button/Filter)',
  'TODO: tokenise `1px` (Ghost/Thing border-width)',
  'TODO: fill contract slot `border-colour` (Panel)',
];

test('a backlog line groups by the component its last parenthetical names', () => {
  const contract = backlogContract();
  const of = (line) => contract.backlogComponent(line, BACKLOG_NAMES);

  // The two shapes `lib/create.js` writes, both read the same way.
  assert.equal(of('TODO: tokenise `transparent` (Button/Rail background)'), 'Button/Rail');
  assert.equal(of('TODO: fill contract slot `disabled` (Button/Rail)'), 'Button/Rail');
  assert.equal(of('TODO: tokenise `600` (Button/Rail selected font-weight)'), 'Button/Rail');

  // The *last* group wins, so a value carrying brackets of its own is not
  // mistaken for the name.
  assert.equal(of('TODO: tokenise `rgba(0, 0, 0, 0.2)` (Panel)'), 'Panel');
  assert.equal(of('TODO: tokenise `x` (Panel) (Button/Filter)'), 'Button/Filter');

  // A name the file does not record is not a component, however much it looks
  // like one — and a line with no parenthetical at all names nothing.
  assert.equal(of('TODO: tokenise `1px` (Ghost/Thing border-width)'), '');
  assert.equal(of('TODO: something nobody parsed'), '');
  assert.equal(of('TODO: tokenise `1px` ()'), '');
  assert.equal(of(''), '');
  assert.equal(of(undefined), '');

  // With nothing recorded at all, nothing is a component.
  assert.equal(contract.backlogComponent('TODO: x (Panel)', []), '');

  // The match is exact — no lower-casing, no stemming, no prefix-of-a-name.
  assert.equal(of('TODO: x (button/rail background)'), '');
  assert.equal(of('TODO: x (Button)'), '');

  // The longest leading run wins, so a recorded name carrying a space would
  // beat the shorter name sitting inside it.
  const spaced = ['Button', 'Button Rail'];
  assert.equal(contract.backlogComponent('TODO: x (Button Rail background)', spaced), 'Button Rail');
  assert.equal(contract.backlogComponent('TODO: x (Button background)', spaced), 'Button');
});

test('the backlog cuts into one group per component, in first-appearance and file order', () => {
  const contract = backlogContract();
  const groups = contract.backlogGroups(backlogLines(), BACKLOG_NAMES);

  assert.deepEqual(
    groups.map((group) => [group.label, group.lines.length]),
    [['Panel', 2], ['Button/Rail', 2], ['Button/Filter', 1], [contract.BACKLOG.ungrouped, 2]],
    'groups follow the order their first line appears, and `other` trails',
  );
  // Lines keep the file's order inside their group, verbatim.
  assert.deepEqual(groups[1].lines, [
    'TODO: tokenise `transparent` (Button/Rail background)',
    'TODO: tokenise `0.5rem 0.75rem` (Button/Rail padding)',
  ]);
  // Every line lands in exactly one group, and none is lost or invented.
  assert.equal(groups.reduce((total, group) => total + group.lines.length, 0), backlogLines().length);
  // The unparsed group carries no component of its own.
  assert.equal(groups.at(-1).component, '');
  assert.deepEqual(groups.at(-1).lines, [
    'TODO: something nobody parsed',
    'TODO: tokenise `1px` (Ghost/Thing border-width)',
  ]);
  // With nothing unparsed there is no trailing group at all.
  const clean = contract.backlogGroups(['TODO: x (Panel)'], BACKLOG_NAMES);
  assert.deepEqual(clean.map((group) => group.label), ['Panel']);
  // A non-array backlog is not a crash.
  assert.deepEqual(contract.backlogGroups(null, BACKLOG_NAMES), []);
});

test('a hand-edited backlog line cannot write markup into the panel', () => {
  const contract = backlogContract();
  const hostile = contract.backlogSections(
    ['TODO: tokenise `<img src=x onerror="alert(1)">` (Panel)', '<script>alert(2)</script>'],
    ['Panel', '<b>evil</b>'],
  );
  // The angle brackets are what makes markup; the escaped text may still read
  // the words `onerror=`, because that is what the file wrote.
  assert.equal(/<img|<script/.test(hostile), false, hostile);
  assert.ok(hostile.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), hostile);
  assert.ok(hostile.includes('&lt;script&gt;alert(2)&lt;/script&gt;'), hostile);

  // A component name is escaped in the heading and in the attribute alike.
  const named = contract.backlogSections(['TODO: x (<b>evil</b>)'], ['<b>evil</b>']);
  assert.equal(/<b>/.test(named), false, named);
  assert.ok(named.includes('data-component="&lt;b&gt;evil&lt;/b&gt;"'), named);
});

test('the Assess button posts the literal prompt `assess` to /prompt, same shape as the prompt box', () => {
  const text = readPage();

  const handler = text.slice(
    text.indexOf("el('backlog-assess').addEventListener('click',"),
    text.indexOf("const drop = el('drop');"),
  );
  assert.ok(handler, 'the page wires a click handler to the Assess button');
  assert.ok(handler.includes("fetch('/prompt'"), 'it posts to the same relay endpoint the prompt box uses');
  assert.ok(handler.includes("method: 'POST'"));
  assert.ok(
    handler.includes("body: JSON.stringify({ text: 'assess', view: state.view })"),
    'the payload is the same shape as the prompt form\'s — `text` and `view` — with `text` fixed to `assess`',
  );

  // Visible feedback that the prompt is queued: the button disables and its
  // label changes, then both are restored — no DOM is left stuck disabled.
  assert.match(handler, /button\.disabled = true/);
  assert.match(handler, /button\.textContent = 'Queued…'/);
  assert.match(handler, /button\.disabled = false/);
  assert.match(handler, /button\.textContent = label/);

  // It runs nothing itself: the queued prompt reaches the terminal session
  // only through the existing relay, and the page re-polls afterwards rather
  // than rendering a queue entry of its own.
  assert.ok(handler.includes('poll();'), 'the handler re-polls state after enqueuing, like the prompt form does');

  // No error-specific UI is invented: the handler carries no second `fetch`
  // catch block or status message beyond the one the prompt box also omits —
  // a failed request is left to the existing status line, updated by the next
  // scheduled `poll()`.
  assert.equal(/catch\s*\(/.test(handler), false, 'no bespoke error handling is invented for this button');
});

test('the backlog settings are the ones skill/refs/gui/gui.md records', () => {
  const contract = backlogContract();
  const rows = tableAfter(fs.readFileSync(GUI_MAIN_REF, 'utf8'), '<!-- phyllum:backlog -->', 'refs/gui/gui.md');
  const setting = (name) => {
    const row = rows.find((row) => row[0] === name);
    assert.ok(row, `the ref records the \`${name}\` setting`);
    return stripTicks(row[1]);
  };
  assert.equal(setting('ungrouped label'), contract.BACKLOG.ungrouped);
  assert.equal(setting('empty line'), contract.BACKLOG.empty);
  // The label is the same neutral word the number sections already use, so the
  // page says "ungrouped" in one word wherever it has to.
  const numbers = numbersContract();
  assert.equal(contract.BACKLOG.ungrouped, numbers.NUMBERS.ungrouped);
});

test('the fixture\'s own backlog groups under the component it names', () => {
  const contract = backlogContract();
  const system = systemJson(readFixture(POPULATED_FIXTURE));
  const names = system.components.map((component) => component.name);
  const groups = contract.backlogGroups(system.backlog, names);

  assert.ok(system.backlog.length > 0, 'the fixture has a backlog to cut');
  assert.deepEqual(groups.map((group) => group.label), ['Button/Primary']);
  assert.equal(groups[0].lines.length, system.backlog.length, 'every fixture line found its component');
  assert.ok(contract.backlogGroupHtml(groups[0]).includes('data-component="Button/Primary"'));
});

// ---------------------------------------------------------------------------
// The theme choice as behaviour (v0.5.1 §3, §4)
// ---------------------------------------------------------------------------

const GUI_MD = path.join(PACKAGE_ROOT, 'skill', 'refs', 'gui', 'gui.md');

/**
 * The page's own theme rules, lifted out and run — the same trick the swatch
 * contract uses, and for the same reason: the suite executes the code the
 * browser executes rather than a restatement of it. The region is written pure
 * (the store arrives as an argument), so it runs with no DOM at all.
 */
function themeContract() {
  const text = readPage();
  const start = text.indexOf('// --- phyllum:theme-contract');
  const end = text.indexOf('// --- end phyllum:theme-contract');
  assert.ok(start !== -1 && end > start, 'the page marks its theme-contract region');
  const region = text.slice(start, end);
  // Comments are prose — the rule is about the code, which must reach neither
  // the DOM nor a store of its own: the store arrives as an argument.
  const code = region.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\b(document|window|localStorage|fetch)\b/.test(code), 'the contract region touches no DOM and no store');
  return new Function(`${region}\nreturn { THEME, isThemeChoice, readTheme, storeTheme };`)();
}

/** A localStorage stand-in — and one that refuses, the way a locked-down browser does. */
const stubStore = (initial = {}) => {
  const held = { ...initial };
  return {
    getItem: (key) => (key in held ? held[key] : null),
    setItem: (key, value) => {
      held[key] = String(value);
    },
    held,
  };
};

test('the theme choices are the three skill/refs/gui/gui.md records, and system is the default', () => {
  const contract = themeContract();
  const rows = tableAfter(fs.readFileSync(GUI_MD, 'utf8'), '<!-- phyllum:theme -->', 'refs/gui/gui.md');
  const recorded = rows.map((row) => stripTicks(row[0]));

  assert.deepEqual(recorded, ['light', 'dark', 'system'], 'the ref records exactly three choices');
  assert.deepEqual(contract.THEME.choices, recorded, 'and the page offers exactly those');
  assert.equal(contract.THEME.fallback, 'system', 'system is the default');
  assert.equal(contract.THEME.attribute, 'data-theme', 'the choice is an attribute on the root element');

  const defaultRow = rows.find((row) => stripTicks(row[0]) === 'system');
  assert.match(defaultRow[1], /default/i, 'the ref says which one is the default');
  assert.match(defaultRow[1], /prefers-color-scheme/, 'and that it defers to the media query');

  // The page offers every one of them, and no fourth.
  const text = readPage();
  const offered = [...text.matchAll(/data-theme-choice="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(offered, recorded, 'the shell shows one button per recorded choice, in order');
});

test('a stored theme choice round-trips, and an absent one reads as system', () => {
  const contract = themeContract();
  const key = contract.THEME.storageKey;

  for (const choice of contract.THEME.choices) {
    const store = stubStore();
    assert.equal(contract.storeTheme(store, choice), choice, `${choice} is recorded as itself`);
    assert.equal(store.held[key], choice, 'under the key the ref records');
    assert.equal(contract.readTheme(store), choice, `${choice} reads back`);
  }

  // Absent, empty, or a word this page does not know — all `system`, never a
  // broken page and never a theme nobody asked for.
  assert.equal(contract.readTheme(stubStore()), 'system', 'an empty store reads as system');
  assert.equal(contract.readTheme(null), 'system', 'no store at all reads as system');
  assert.equal(contract.readTheme(undefined), 'system');
  for (const junk of ['', 'sepia', 'SYSTEM', '{"theme":"dark"}', 'light dark']) {
    assert.equal(contract.readTheme(stubStore({ [key]: junk })), 'system', `${junk} is not a choice`);
  }
  assert.equal(contract.storeTheme(stubStore(), 'sepia'), 'system', 'and it is not recorded as one either');

  // A browser with storage denied throws on both calls; the page keeps working.
  const denied = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
  };
  assert.equal(contract.readTheme(denied), 'system');
  assert.equal(contract.storeTheme(denied, 'dark'), 'dark', 'the click still takes effect for this page');
});

test('the theme choice is page-local — the server is never told and never asked', () => {
  const text = readPage();
  const requests = [...text.matchAll(/fetch\(\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(
    new Set(requests),
    new Set(['/state', '/system', '/reports', '/build-reports', '/prompt', '/upload']),
    'no theme route exists',
  );

  // Nothing posts the choice anywhere: the only place it is written is the
  // browser's own store, under the page's own key.
  const posts = [...text.matchAll(/JSON\.stringify\(\{([^}]*)\}\)/g)].map((match) => match[1]);
  for (const body of posts) assert.ok(!/theme/i.test(body), `a request body carries the theme: ${body}`);
  assert.equal((text.match(/localStorage/g) ?? []).length >= 1, true, 'the choice lives in localStorage');

  const server = fs.readFileSync(path.join(PACKAGE_ROOT, 'server', 'serve.py'), 'utf8');
  assert.ok(!/theme/i.test(server), 'and the server has never heard of a theme');
});

test('the restyle left the server surface alone', () => {
  const server = fs.readFileSync(path.join(PACKAGE_ROOT, 'server', 'serve.py'), 'utf8');
  const routes = [...server.matchAll(/path == "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(new Set(routes), new Set(['/state', '/system', '/reports', '/build-reports', '/prompt', '/upload']));
  assert.ok(server.includes('def serve_static'), 'plus the static page, served from gui/');
  assert.equal(server.match(/def do_(GET|HEAD|POST)/g).length, 3, 'and no new HTTP verb');
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
