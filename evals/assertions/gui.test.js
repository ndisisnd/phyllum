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
import { parse, render } from '../../lib/design-system.js';
import { addPrimitives, neutralRampRows } from '../../lib/primitives.js';
import { comparatorCell, numberCell, stripTicks, tableAfter } from '../../lib/md-tables.js';
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
// The page itself — swatches, ramps, and no network (v0.3.0 §6.5, §8)
// ---------------------------------------------------------------------------

const GUI_PAGE = path.join(PACKAGE_ROOT, 'gui', 'index.html');
const GUI_REF = path.join(PACKAGE_ROOT, 'skill', 'refs', 'gui', 'cards.md');
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

const articles = (html) => html.match(/<article class="swatch[^"]*"[^>]*>/g) ?? [];
const cards = (html) => html.match(/<article class="card[^"]*"[^>]*>/g) ?? [];

/** The three card nodes, in the order the ref records them. */
const cardNodes = (html) => [...html.matchAll(/class="card__(swatch|name|value)"/g)].map((match) => match[1]);

test('every colour token in a fixture renders as one card — swatch, name, then value', () => {
  const contract = swatchContract();
  const system = systemJson(readFixture(POPULATED_FIXTURE));
  assert.ok(system.tokens.colours.length > 0, 'the fixture has colours to show');

  const html = system.tokens.colours.map((row) => contract.cardHtml(row.token, row.value)).join('');
  const found = cards(html);
  assert.equal(found.length, system.tokens.colours.length, 'one card element per colour token');

  for (const row of system.tokens.colours) {
    const one = contract.cardHtml(row.token, row.value);
    assert.equal(cards(one).length, 1, `${row.token} is exactly one card`);
    assert.ok(one.includes(`data-token="${row.token}"`), `${row.token} has no card element`);
    assert.ok(one.includes(`data-value="${row.value}"`), `${row.token}'s card carries its value`);
    assert.deepEqual(
      cardNodes(one),
      ['swatch', 'name', 'value'],
      `${row.token}'s card holds a swatch, a name node and a value node, in that order`,
    );
    assert.ok(one.includes(`background:${row.value}`), `${row.token}'s swatch is filled with the colour itself`);
    assert.ok(
      new RegExp(`class="card__name">${row.token}<`).test(one),
      `${row.token}'s name is printed beneath the swatch`,
    );
    assert.ok(
      new RegExp(`class="card__value">${row.value}<`).test(one),
      `${row.token}'s value is printed on its own line`,
    );
    // The label is off the fill now, so the swatch carries no text at all.
    assert.match(one, /<div class="card__swatch" style="[^"]*"><\/div>/, 'the swatch itself is empty');
  }
});

test('the cards sit in one grid container that wraps to the viewport', () => {
  const text = readPage();
  assert.match(text, /'<div class="cards">'/, 'the Colours section wraps its cards in a grid container');
  const rule = text.match(/\.cards\s*\{([^}]*)\}/);
  assert.ok(rule, 'the page styles that container');
  assert.match(rule[1], /display:\s*grid/, 'as a grid');
  assert.match(
    rule[1],
    /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(var\(--card-min\),\s*1fr\)\)/,
    'whose columns wrap to the viewport rather than to the token count',
  );
  assert.ok(!/one-token-per-row/.test(rule[1]));
});

test('the card dimensions are the ones skill/refs/gui/cards.md records, in the table, the constant and the CSS', () => {
  const contract = swatchContract();
  const text = readPage();
  const rows = tableAfter(fs.readFileSync(GUI_REF, 'utf8'), '<!-- phyllum:cards -->', 'refs/gui/cards.md');
  const recorded = (name) => stripTicks(rows.find((row) => row[0] === name)[1]);

  const dimensions = [
    ['swatch radius', 'radius', '--card-radius'],
    ['card min width', 'minWidth', '--card-min'],
    ['card max width', 'maxWidth', '--card-max'],
    ['grid gap', 'gap', '--card-gap'],
    ['swatch height', 'swatchHeight', '--card-swatch-height'],
  ];
  for (const [row, key, property] of dimensions) {
    const value = recorded(row);
    assert.equal(contract.CARD[key], value, `CARD.${key} is the "${row}" the ref table records`);
    const declared = text.match(new RegExp(`${property}:\\s*([^;]+);`));
    assert.ok(declared, `the stylesheet declares ${property}`);
    assert.equal(declared[1].trim(), value, `${property} is the same ${row}`);
  }

  // v0.5.1 §3.1 inverts the old rule: rounded corners are the default, and the
  // whole page rounds from the two-step scale rather than from a value typed
  // wherever a corner happened to be needed.
  // Only the stylesheet is read. Since v0.6.0 §2 the page also writes a corner
  // in JS — a radius specimen wears the *token's* value, which is the whole
  // point of drawing it — and that corner is by definition not a step on the
  // page's own scale.
  const stylesheet = text.slice(text.indexOf('<style>'), text.indexOf('</style>'));
  const radii = [...stylesheet.matchAll(/border-radius:\s*([^;]+);/g)].map((match) => match[1].trim());
  assert.ok(radii.length >= 8, `only ${radii.length} rounded corners — the page is meant to round by default`);
  for (const value of radii) {
    // The one exception, and it is a shape rather than a corner: the preview's
    // icon placeholder is a filled dot (v0.5.1 §5.3). A circle is not a step on
    // a radius scale, and rounding it off one would draw a squircle.
    if (value === '50%') continue;
    assert.match(
      value,
      /^var\(--(radius-sm|radius-md|card-radius)\)$/,
      `${value} is a corner typed in place rather than read off the radius scale`,
    );
  }
  const circles = radii.filter((value) => value === '50%');
  assert.equal(circles.length, 1, 'the icon placeholder is the page’s only circle');
  assert.match(
    text.match(/\.preview__icon\s*\{([^}]*)\}/)[1],
    /border-radius:\s*50%/,
    'and the circle belongs to the icon placeholder',
  );
  for (const step of ['--radius-sm', '--radius-md']) {
    const declared = text.match(new RegExp(`${step}:\\s*([^;]+);`));
    assert.ok(declared, `the stylesheet declares ${step}`);
    assert.match(declared[1].trim(), /^\d*\.?\d+rem$/, `${step} is one length, not an expression`);
  }
});

test('a gradient value is painted as the swatch fill, with nothing beyond background', () => {
  const contract = swatchContract();
  const gradient = 'linear-gradient(135deg, #2563EB, #10B981)';
  const card = contract.cardHtml('brand-gradient', gradient);

  assert.equal(cards(card).length, 1, 'a gradient token is an ordinary card');
  assert.deepEqual(cardNodes(card), ['swatch', 'name', 'value']);
  assert.ok(card.includes(`background:${gradient}`), 'the gradient is the swatch background');
  assert.match(
    card,
    /<div class="card__swatch" style="background:[^;"]*"><\/div>/,
    'and the swatch declares nothing beyond that background',
  );
  assert.equal(card.includes('card--bordered'), false, 'a gradient has no single luminance, so it is not near-white');
  assert.ok(card.includes(`class="card__value">${gradient}<`), 'the value is printed verbatim beneath it');

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
    assert.ok(refused.includes('background:transparent') && refused.includes('card--bordered'), refused);
  }
});

test('near-white colours take the bordered variant, and only they do', () => {
  const contract = swatchContract();
  const { nearWhiteLuminance } = contract.SWATCH;

  // The fixture's own pair: white would vanish against the page, blue would not.
  assert.ok(contract.isNearWhite('#FFFFFF'), 'white is near-white');
  assert.equal(contract.isNearWhite('#2563EB'), false, 'a mid blue is not');
  assert.ok(
    contract.cardHtml('color-surface', '#FFFFFF').includes('card--bordered'),
    'the near-white card is bordered',
  );
  assert.equal(
    contract.cardHtml('color-primary', '#2563EB').includes('card--bordered'),
    false,
    'a card that shows up on its own is not bordered',
  );
  assert.ok(
    contract.swatchHtml('color-surface', '#FFFFFF').includes('swatch--bordered'),
    'and the rule still holds for a ramp step',
  );
  assert.equal(
    contract.swatchHtml('color-primary', '#2563EB').includes('swatch--bordered'),
    false,
    'a swatch that shows up on its own is not bordered',
  );

  // The rule is the threshold, not a list of colours: every grey either side of
  // it lands on the right answer.
  for (let level = 0; level <= 255; level += 5) {
    const hex = `#${level.toString(16).padStart(2, '0').repeat(3)}`;
    assert.equal(
      contract.isNearWhite(hex),
      contract.luminance(hex) >= nearWhiteLuminance,
      `${hex} is bordered iff its luminance clears the threshold`,
    );
  }

  // A value that is not a colour still shows up, bordered rather than filled.
  const odd = contract.swatchHtml('color-brand', 'var(--brand)');
  assert.ok(odd.includes('swatch--bordered') && odd.includes('background:transparent'), odd);
  assert.equal(articles(odd).length, 1, 'and it is still one swatch element');
});

test('the swatch thresholds are the ones skill/refs/gui/cards.md records', () => {
  const contract = swatchContract();
  const rows = tableAfter(fs.readFileSync(GUI_REF, 'utf8'), '<!-- phyllum:swatches -->', 'refs/gui/cards.md');
  const rule = (name) => rows.find((row) => row[0] === name);

  const nearWhite = comparatorCell(rule('near-white')[1]);
  assert.equal(nearWhite.operator, '>=');
  assert.equal(nearWhite.bound, contract.SWATCH.nearWhiteLuminance);

  const darkInk = comparatorCell(rule('dark ink')[1]);
  assert.equal(darkInk.operator, '>=');
  assert.equal(darkInk.bound, contract.SWATCH.darkInkLuminance);
  assert.equal(contract.inkFor('#FFFFFF'), contract.SWATCH.darkInk);
  assert.equal(contract.inkFor('#000000'), contract.SWATCH.lightInk);

  assert.equal(numberCell(rule('ramp steps')[1]), contract.SWATCH.rampSteps);
});

test('primitives render as nine-step ramp strips, one per base name', () => {
  const contract = swatchContract();
  const model = parse(readFixture(POPULATED_FIXTURE));
  addPrimitives(model, neutralRampRows());
  const system = systemJson(render(model));
  assert.equal(system.tokens.primitives.length, contract.SWATCH.rampSteps, 'the fixture gained one ramp');

  const groups = contract.rampGroups(system.tokens.primitives);
  assert.equal(groups.length, 1, 'nine steps of one base are one strip, not nine rows');
  assert.equal(groups[0].steps.length, contract.SWATCH.rampSteps);
  assert.deepEqual(
    groups[0].steps.map((step) => step.step),
    ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
    'in file order, the step number read off the glued name',
  );

  assert.equal(groups[0].label, 'neutral', 'the strip is titled by the base, without its separator');

  const strip = contract.rampHtml(groups[0]);
  assert.ok(strip.includes(`data-steps="${contract.SWATCH.rampSteps}"`), strip.slice(0, 120));
  assert.equal(articles(strip).length, contract.SWATCH.rampSteps, 'every step is itself a swatch element');
  assert.ok(strip.includes('swatch--bordered'), 'the near-white end of the ramp is bordered');

  // Two bases stay two strips.
  const two = contract.rampGroups([
    { token: 'neutral100', value: '#FFFFFF' },
    { token: 'brand-blue100', value: '#EFF6FF' },
    { token: 'neutral900', value: '#161616' },
  ]);
  assert.deepEqual(two.map((group) => group.base), ['neutral', 'brand-blue']);
  assert.deepEqual(two.map((group) => group.steps.length), [2, 1]);
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
    assert.match(route, /^\/(state|system|prompt|upload)$/, `${route} must be a same-origin route`);
  }
});

test('the type stack names Geist first and falls back to system sans', () => {
  const text = readPage();
  const sans = text.match(/--sans:\s*([^;]+);/);
  assert.ok(sans, 'the page defines one sans stack');
  const families = sans[1].split(',').map((family) => family.trim().replace(/^'|'$/g, ''));
  assert.equal(families[0], 'Geist', 'Geist is named first, used where it is installed locally');
  assert.ok(families.includes('system-ui'), 'and a system sans carries everyone else');
  assert.ok(families.at(-1).includes('sans-serif'), 'ending in the generic family');

  const mono = text.match(/--mono:\s*([^;]+);/);
  assert.ok(mono[1].startsWith("'Geist Mono'"), mono[1]);
  assert.ok(mono[1].includes('monospace'));
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

test('each number group renders as its own section — no bar, no track', () => {
  const contract = numbersContract();
  const groups = contract.numberGroups(numberRows(), 'applies to');
  const html = groups.map(contract.numberGroupHtml).join('');

  const items = html.match(/<li class="number[^"]*" data-token="[^"]+"/g) ?? [];
  assert.equal(items.length, numberRows().length, 'one line per token, and only one');
  assert.equal((html.match(/<section class="number-group"/g) ?? []).length, groups.length);

  // The heading is the page's own `heading`, so a reading sits at the same
  // tier as Colours and Typography and carries its own count (v0.6.0 §1).
  assert.ok(
    html.includes('<section class="number-group" data-applies="corner radius">' +
      contract.heading('corner radius', 2, contract.readingNote('corner radius')) + '<ul class="number-list">'),
    'the group is its verbatim label, at the shared tier, over its list',
  );
  assert.ok(html.includes('<h3>corner radius <span class="count">2</span></h3>'), html.slice(0, 200));
  // `Border Width` is a reading the specimen table does not recognise, so its
  // token stays exactly the line it has always been.
  assert.ok(
    html.includes('<li class="number" data-token="hairline">' +
      '<span class="number__name">hairline</span><code class="number__value">1px</code></li>'),
    'and a line is the name in the page ink then the value in the mono face',
  );
  assert.ok(html.includes('data-applies=""'), 'the trailing group carries no reading of its own');

  // Nothing here is a picture of a *ratio* any more: no bar element, no track,
  // and no inline width sizing one token against another. The inline styles a
  // specimen writes are the token's own property and nothing else.
  assert.equal(/bar__|class="bar\b|track|fill/.test(html), false, html.slice(0, 160));
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

test('the number sections stand at the top level, with no "Numbers" umbrella', () => {
  const contract = numbersContract();
  const html = contract.numbersSections(numberRows(), 'applies to');

  // Every section is a sibling — nothing wraps them, and nothing heads them.
  assert.ok(html.startsWith('<section class="number-group"'), html.slice(0, 80));
  assert.equal(html.includes('<div class="numbers">'), false, 'no container around the sections');
  assert.equal(/>Numbers</.test(html), false, 'no section is titled "Numbers"');
  assert.equal((html.match(/<section class="number-group"/g) ?? []).length, 4);

  // The headings read in file order, and the blank cells trail behind them.
  assert.deepEqual(
    [...html.matchAll(/<h3>([^<]*) <span class="count">(\d+)<\/span><\/h3>/g)].map((m) => [m[1], m[2]]),
    [['corner radius', '2'], ['padding', '1'], ['Border Width', '1'], [contract.NUMBERS.ungrouped, '2']],
    'one heading per reading, verbatim, in file order, `other` last',
  );

  // An empty table is still one honest section, the way Colours and
  // Typography answer emptiness — a heading and a "(none yet)" line.
  const empty = contract.numbersSections([], 'applies to');
  assert.equal((empty.match(/<section class="number-group"/g) ?? []).length, 1);
  assert.ok(
    empty.includes(contract.heading(contract.NUMBERS.ungrouped, 0, contract.readingNote(''))),
    empty,
  );
  assert.ok(empty.includes('<p class="muted">(none yet)</p>'), empty);
  assert.equal(/>Numbers</.test(empty), false, 'not even when empty is it called "Numbers"');
});

test('the ungrouped label is the one skill/refs/gui/cards.md records', () => {
  const contract = numbersContract();
  const rows = tableAfter(fs.readFileSync(GUI_REF, 'utf8'), '<!-- phyllum:numbers -->', 'refs/gui/cards.md');
  const recorded = rows.find((row) => row[0] === 'ungrouped label');
  assert.ok(recorded, 'the ref records the label a blank `applies to` cell falls to');
  assert.equal(stripTicks(recorded[1]), contract.NUMBERS.ungrouped);
});

// ---------------------------------------------------------------------------
// Specimens: a recognised reading draws its value (v0.6.0 §2)
// ---------------------------------------------------------------------------

/** One row per specimen kind, plus a reading the table does not recognise. */
const specimenRows = () => [
  { token: 'radius-md', value: '0.625rem', 'applies to': 'radius' },
  { token: 'space-lg', value: '1rem', 'applies to': 'spacing' },
  { token: 'shadow-panel', value: '0 1px 2px rgba(28, 27, 25, 0.05), 0 2px 6px rgba(28, 27, 25, 0.04)', 'applies to': 'shadow' },
  { token: 'fade-fast', value: '120ms', 'applies to': 'duration' },
];

test('a recognised reading earns its specimen by the substring rule, and nothing else does', () => {
  const contract = numbersContract();

  // The rule is a lower-cased substring test, so the file's own wording is
  // read without being normalised first.
  for (const [reading, kind] of [
    ['radius', 'radius'],
    ['corner radius', 'radius'],
    ['Border-Radius', 'radius'],
    ['spacing', 'spacing'],
    ['padding', 'spacing'],
    ['gap', 'spacing'],
    ['inner margin', 'spacing'],
    ['shadow', 'shadow'],
    ['Elevation', 'shadow'],
  ]) {
    assert.equal(contract.specimenKind(reading), kind, `${reading} draws a ${kind}`);
  }

  // Anything the words do not match draws nothing at all — including the
  // trailing group, whose reading is empty by definition.
  for (const reading of ['duration', 'z-index', 'opacity', 'breakpoint', '', undefined]) {
    assert.equal(contract.specimenKind(reading), '', `${reading} draws nothing`);
  }
});

test('each specimen draws the token\'s own property, and only that property', () => {
  const contract = numbersContract();
  const html = contract.numbersSections(specimenRows(), 'applies to');

  assert.ok(
    html.includes('<li class="number number--specimen" data-token="radius-md" data-specimen="radius">' +
      '<span class="number__specimen"><span class="specimen-tile" style="border-radius:0.625rem"></span></span>'),
    'a radius is a tile wearing that corner',
  );
  assert.ok(
    html.includes('<span class="specimen-gap" style="gap:1rem">' +
      '<span class="specimen-gap__block"></span><span class="specimen-gap__block"></span></span>'),
    'a spacing is the real gap between two blocks',
  );
  assert.ok(
    html.includes('<span class="specimen-card" style="box-shadow:0 1px 2px rgba(28, 27, 25, 0.05), ' +
      '0 2px 6px rgba(28, 27, 25, 0.04)"></span>'),
    'a shadow is a card carrying it, stacked layers and all',
  );

  // The caption is the line the list has always had, kept verbatim beneath the
  // drawing rather than replaced by it.
  assert.ok(html.includes('<span class="number__name">radius-md</span><code class="number__value">0.625rem</code>'));

  // The unrecognised reading is untouched: no class, no data attribute, no
  // drawing, no style.
  assert.ok(
    html.includes('<li class="number" data-token="fade-fast">' +
      '<span class="number__name">fade-fast</span><code class="number__value">120ms</code></li>'),
    'an unrecognised reading keeps the plain name-and-value line',
  );
  assert.equal((html.match(/style=/g) ?? []).length, 3, 'one style per drawn token, and no more');
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

test('the specimen mapping is the one skill/refs/gui/cards.md records', () => {
  const contract = numbersContract();
  const rows = tableAfter(fs.readFileSync(GUI_REF, 'utf8'), '<!-- phyllum:numbers -->', 'refs/gui/cards.md');
  const recorded = (name) => {
    const row = rows.find((entry) => entry[0] === name);
    assert.ok(row, `the ref records ${name}`);
    return stripTicks(row[1]);
  };

  for (const kind of Object.keys(contract.NUMBERS.specimens)) {
    assert.deepEqual(
      recorded(`${kind} readings`).split(',').map((word) => word.trim()),
      contract.NUMBERS.specimens[kind],
      `the ${kind} keywords in the ref are the page's own`,
    );
  }
  assert.deepEqual(
    rows.filter((row) => row[0].endsWith(' readings')).map((row) => row[0].replace(' readings', '')),
    Object.keys(contract.NUMBERS.specimens),
    'the ref records every kind the page draws, in the page\'s own order — the first match wins',
  );

  // The rule itself is written down, not left as a hidden heuristic, and so is
  // the gate each kind holds its values to.
  assert.equal(recorded('reading match'), 'lower-case substring');
  const page = readPage();
  for (const [kind, gate] of [['radius', 'isLengths'], ['spacing', 'isLength'], ['shadow', 'isShadowList']]) {
    assert.equal(recorded(`${kind} gate`), gate, `the ref names the gate ${kind} uses`);
    assert.ok(page.includes(`const ${gate} = `), `${gate} is a shape gate the page defines once`);
  }
});

test('the specimens are drawn in the page\'s own surfaces, so both themes get them', () => {
  const text = readPage();
  for (const rule of ['.specimen-tile', '.specimen-card', '.specimen-gap', '.specimen-gap__block', '.number__specimen']) {
    assert.ok(text.includes(rule + ' '), `${rule} is styled by the page`);
  }
  // Every colour a specimen wears is a theme variable, so the dark set moves
  // it without a second stylesheet — the same way a swatch or a card works.
  const block = text.slice(text.indexOf('.specimen-tile {'), text.indexOf('.specimens {'));
  for (const colour of block.match(/(background|border|border-color):\s*([^;]+);/g) ?? []) {
    assert.match(colour, /var\(--/, `${colour.trim()} is drawn from the page's own variables`);
  }
  assert.equal(/#[0-9a-f]{3,8}|rgba?\(/i.test(block), false, 'no specimen hard-codes a colour');
});

/**
 * The page's documentation anatomy (v0.6.0 §3).
 *
 * A design-system page is read, not scanned. So each section says in one line
 * what it shows, the content sits in a column narrow enough to track back
 * along, and sections are told apart by the air above them rather than by a
 * rule drawn between them. What is checked here is the contract — the
 * description line, the bounded column, the scale the rhythm is drawn from,
 * the three heading tiers. The taste is not checked; only the anatomy is.
 */
test('every token section carries a heading and a one-line description', () => {
  const contract = numbersContract();
  const html = contract.numbersSections(numberRows(), 'applies to');

  // One description per section, each sitting directly under its own heading.
  const notes = [...html.matchAll(/<\/h3><p class="section__note">([^<]*)<\/p>/g)].map((match) => match[1]);
  assert.equal(notes.length, 4, 'every section describes itself once, right under its heading');
  assert.ok(notes[0].includes('corner radius'), 'a reading describes its section in the file\'s own words');
  assert.equal(notes.at(-1), contract.readingNote(''), 'and the trailing group says it has no reading of its own');
  assert.equal(
    contract.readingNote('corner radius'),
    contract.NUMBERS.note.reading[0] + 'corner radius' + contract.NUMBERS.note.reading[1],
    'the sentence is the reading quoted back — nothing is invented about the tokens under it',
  );

  // A description is escaped like every other thing a hand-edited file supplies.
  const hostile = contract.numbersSections([{ token: 'x', value: '4px', 'applies to': '<i>r</i>' }], 'applies to');
  assert.equal(/<i>/.test(hostile), false, hostile);

  // Colours, primitives and typography carry theirs too, from one place.
  const text = readPage();
  const notesConstant = text.match(/const NOTES = \{[\s\S]*?\};/);
  assert.ok(notesConstant, 'the page states its section descriptions in one place');
  for (const section of ['colours', 'primitives', 'typography']) {
    assert.match(notesConstant[0], new RegExp(`${section}: '`), `${section} says what it shows`);
  }
  assert.ok(text.includes("heading('Colours', rows.length, NOTES.colours)"), 'and the section renders it');
  assert.ok(text.includes("heading('Typography', rows.length, NOTES.typography)"));
});

test('the page reads in a constrained column, spaced and headed from its own scales', () => {
  const text = readPage();
  const stylesheet = text.slice(text.indexOf('<style>'), text.indexOf('</style>'));

  // One reading measure, declared once, carried by the content column.
  const measure = stylesheet.match(/--measure:\s*([^;]+);/);
  assert.ok(measure, 'the stylesheet declares a reading measure');
  assert.match(measure[1].trim(), /^\d+rem$/, 'the measure is one length, not an expression');
  const wide = parseFloat(measure[1]);
  assert.ok(wide >= 60 && wide <= 72, `${wide}rem is outside the readable column width`);
  const main = stylesheet.match(/\n {6}main \{([\s\S]*?)\n {6}\}/);
  assert.ok(main, 'the stylesheet styles the content column');
  assert.match(main[1], /max-width: var\(--measure\)/, 'the column is bounded by the measure');
  assert.match(main[1], /margin: 0 auto/, 'and centred in whatever is left of the window');

  // The rhythm comes off a scale rather than being typed at each site, and the
  // scale is 8-based — every step is a whole number of half-rems.
  const steps = [...stylesheet.matchAll(/--space-(\d): ([\d.]+)rem;/g)].map((m) => [Number(m[1]), parseFloat(m[2])]);
  assert.ok(steps.length >= 4, 'the page declares a spacing scale');
  for (const [step, value] of steps) {
    assert.equal(value, step * 0.5, `--space-${step} is ${step} steps of the 8-based scale`);
  }
  // A section is set apart by the large step; the lines inside one are not.
  assert.match(stylesheet.match(/\.number-group \{([^}]*)\}/)[1], /margin-top: var\(--space-6\)/);
  assert.match(stylesheet, /#tokens-body > h3 \{ margin-top: var\(--space-6\); \}/);
  assert.match(stylesheet.match(/\.number-list \{([^}]*)\}/)[1], /margin-top: var\(--space-1\)/);

  // Three heading tiers and no more: the panel title, the section heading, and
  // the small muted group label. A card title stays under the section tier.
  assert.match(stylesheet.match(/\n {6}h2 \{([\s\S]*?)\n {6}\}/)[1], /font-size: var\(--type-04\)/);
  assert.match(stylesheet.match(/\n {6}h3 \{([\s\S]*?)\n {6}\}/)[1], /font-size: var\(--type-03\)/);
  assert.match(stylesheet.match(/\.card__name \{([\s\S]*?)\n {6}\}/)[1], /font-size: var\(--type-02\)/);
  for (const label of ['.ramp__base', '.section__note']) {
    const rule = stylesheet.match(new RegExp(`\\${label} \\{([\\s\\S]*?)\\n {6}\\}`));
    assert.ok(rule, `${label} is styled by the page`);
    assert.match(rule[1], /color: var\(--muted\)/, `${label} is muted, and only ever from a theme variable`);
  }
  assert.match(stylesheet.match(/\.ramp__base \{([\s\S]*?)\n {6}\}/)[1], /font-size: var\(--type-01\)/);
});

test('the fixture\'s own Numbers row groups under the reading the file gives it', () => {
  const contract = numbersContract();
  const system = systemJson(readFixture(POPULATED_FIXTURE));
  const groups = contract.numberGroups(system.tokens.numbers, system.columns.numbers[2]);
  assert.deepEqual(groups.map((group) => group.label), ['corner radius']);
  assert.deepEqual(groups[0].rows.map((row) => row.token), ['rounded-md']);
  assert.ok(contract.numberGroupHtml(groups[0]).includes('<code class="number__value">12px</code>'));
});

test('numbers show as sectioned lists and typography as live specimens', () => {
  const text = readPage();
  assert.ok(text.includes('function numbersSections'), 'numbers have their own renderer');
  assert.ok(text.includes('numberGroups('), 'and it renders them cut by their reading');
  // The umbrella heading is gone from the renderer, not merely unused.
  assert.equal(/heading\('Numbers'/.test(text), false, 'nothing still heads a section "Numbers"');
  assert.ok(text.includes('function typographySection'), 'typography has its own renderer');
  assert.ok(text.includes('specimen__line'), 'and a specimen line set in the token itself');

  // The measured bar is gone from the page entirely — markup, class and CSS.
  for (const gone of ['bar__fill', 'bar__track', 'bar__head', 'bar__name', 'bar__value', 'bar__note', '.bars']) {
    assert.equal(text.includes(gone), false, `${gone} is no longer anywhere in the page`);
  }
  // A specimen only ever inlines a shape it recognises — the values come from a
  // user-edited file, so they are gated, not trusted.
  for (const guard of ['safeSize', 'safeWeight', 'safeLeading']) {
    assert.ok(text.includes(guard), `${guard} guards what reaches a style attribute`);
  }
});

// ---------------------------------------------------------------------------
// The restyle and the theme toggle (v0.5.1 §3, §4)
// ---------------------------------------------------------------------------

const GUI_MD = path.join(PACKAGE_ROOT, 'skill', 'refs', 'gui', 'gui.md');

/** The custom properties a CSS block declares, as name → value. */
function declarations(block) {
  const found = new Map();
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) found.set(match[1], match[2].trim());
  return found;
}

/** The three palette blocks: the light set, and the dark set's two selectors. */
function palettes() {
  const text = readPage();
  const light = text.match(/:root\s*\{([^}]*)\}/);
  assert.ok(light, 'the page declares a plain :root set');

  const mediaAt = text.indexOf('@media (prefers-color-scheme: dark)');
  assert.notEqual(mediaAt, -1, 'the page still keeps a prefers-color-scheme rule');
  const media = text
    .slice(mediaAt)
    .match(/:root\[data-theme='system'\][^{]*\{([^}]*)\}/);
  assert.ok(media, '`system` is the selector the media query carries');

  const chosen = text.match(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/);
  assert.ok(chosen, '`dark` chosen in the page selects a set of its own');

  return {
    light: declarations(light[1]),
    systemDark: declarations(media[1]),
    chosenDark: declarations(chosen[1]),
  };
}

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

test('both theme variable sets exist, and the root attribute picks between them', () => {
  const { light, systemDark, chosenDark } = palettes();

  for (const name of ['--bg', '--layer', '--layer-accent', '--ink', '--muted', '--line', '--accent']) {
    assert.ok(light.has(name), `the light set is missing ${name}`);
    assert.ok(systemDark.has(name), `the dark set is missing ${name}`);
  }

  // The dark set is one set, whichever way the reader arrived at it: chosen in
  // the page, or asked for by the OS while the choice is `system`.
  assert.deepEqual(
    [...chosenDark.entries()].sort(),
    [...systemDark.entries()].sort(),
    '`dark` chosen and `dark` inherited from the OS must be the same variable set',
  );

  // A dark override only ever redraws a variable the light set already names —
  // a theme is a second reading of one palette, not a second palette.
  for (const name of systemDark.keys()) {
    assert.ok(light.has(name), `${name} is declared in the dark set but nowhere in the light one`);
  }

  // And they really are two themes: the page and its ink both move.
  for (const name of ['--bg', '--ink', '--layer']) {
    assert.notEqual(systemDark.get(name), light.get(name), `${name} reads the same in both themes`);
  }
});

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

test('the stored choice is applied before the body paints, from the page\'s own script', () => {
  const text = readPage();
  const head = text.slice(0, text.indexOf('</head>'));
  assert.ok(head.includes('phyllum:theme-contract'), 'the theme contract is in the head, ahead of the body');
  assert.match(
    head,
    /document\.documentElement\.setAttribute\(\s*THEME\.attribute,/,
    'and the head applies the choice to the root element',
  );
  assert.ok(!/<script[^>]+\bsrc=/i.test(head), 'the no-flash script is the page\'s own, not a fetched one');
  assert.ok(
    text.indexOf('setAttribute(') < text.indexOf('<body>'),
    'the attribute is set before the body element, so no wrong theme is ever painted',
  );
});

test('the theme choice is page-local — the server is never told and never asked', () => {
  const text = readPage();
  const requests = [...text.matchAll(/fetch\(\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(new Set(requests), new Set(['/state', '/system', '/prompt', '/upload']), 'no theme route exists');

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
  assert.deepEqual(new Set(routes), new Set(['/state', '/system', '/prompt', '/upload']));
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
