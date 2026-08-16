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
const GUI_REF = path.join(PACKAGE_ROOT, 'skill', 'refs', 'gui.md');
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

test('the card dimensions are the ones skill/refs/gui.md records, in the table, the constant and the CSS', () => {
  const contract = swatchContract();
  const text = readPage();
  const rows = tableAfter(fs.readFileSync(GUI_REF, 'utf8'), '<!-- phyllum:cards -->', 'refs/gui.md');
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

  // The rounded corner is the one departure: it is the swatch's, and no other
  // element takes a radius of its own.
  const radii = [...text.matchAll(/border-radius:\s*([^;]+);/g)]
    .map((match) => match[1].trim())
    .filter((value) => value !== '0');
  assert.deepEqual(radii, ['var(--card-radius)'], 'the card swatch is the only rounded element on the page');
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

test('the swatch thresholds are the ones skill/refs/gui.md records', () => {
  const contract = swatchContract();
  const rows = tableAfter(fs.readFileSync(GUI_REF, 'utf8'), '<!-- phyllum:swatches -->', 'refs/gui.md');
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
  assert.ok(!/@carbon\/|carbon-components|unpkg|jsdelivr/i.test(text), 'and no Carbon package pulled in');

  // Everything it does request is its own server, by relative path.
  const requests = [...text.matchAll(/fetch\(\s*'([^']+)'/g)].map((match) => match[1]);
  assert.ok(requests.length > 0, 'the page does talk to its server');
  for (const route of requests) {
    assert.match(route, /^\/(state|system|prompt|upload)$/, `${route} must be a same-origin route`);
  }
});

test('the type stack names IBM Plex first and falls back to system sans', () => {
  const text = readPage();
  const sans = text.match(/--sans:\s*([^;]+);/);
  assert.ok(sans, 'the page defines one sans stack');
  const families = sans[1].split(',').map((family) => family.trim().replace(/^'|'$/g, ''));
  assert.equal(families[0], 'IBM Plex Sans', 'Plex is named first, used where it is installed locally');
  assert.ok(families.includes('system-ui'), 'and a system sans carries everyone else');
  assert.ok(families.at(-1).includes('sans-serif'), 'ending in the generic family');

  const mono = text.match(/--mono:\s*([^;]+);/);
  assert.ok(mono[1].startsWith("'IBM Plex Mono'"), mono[1]);
  assert.ok(mono[1].includes('monospace'));
});

test('numbers show as measured bars and typography as live specimens', () => {
  const text = readPage();
  assert.ok(text.includes('function numbersSection'), 'numbers have their own renderer');
  assert.ok(text.includes('bar__fill'), 'and a measured fill');
  assert.ok(text.includes('function typographySection'), 'typography has its own renderer');
  assert.ok(text.includes('specimen__line'), 'and a specimen line set in the token itself');
  // A specimen only ever inlines a shape it recognises — the values come from a
  // user-edited file, so they are gated, not trusted.
  for (const guard of ['safeSize', 'safeWeight', 'safeLeading']) {
    assert.ok(text.includes(guard), `${guard} guards what reaches a style attribute`);
  }
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
