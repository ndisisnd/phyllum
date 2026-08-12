/**
 * Assertions for the interactive session (plan §2.2, §8.5).
 *
 * The session is driven through in-memory streams rather than a real terminal,
 * so the loop is exercised without a TTY and without spawning anything.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { runSession } from '../../lib/session.js';
import { renderMenu } from '../../lib/menu.js';
import { POPULATED_FIXTURE, readFixture, snapshotPaths, withTempDir } from './helpers.js';

async function session(dir, lines) {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => {
    text += chunk.toString();
  });
  const done = runSession({ cwd: dir, input, output });
  for (const line of lines) input.write(`${line}\n`);
  input.end();
  await done;
  return text;
}

test('the session opens on the init suggestion when there is no design system', async () => {
  await withTempDir(async (dir) => {
    const out = await session(dir, ['exit']);
    assert.ok(out.includes('no DESIGN-SYSTEM.md yet'));
    assert.ok(out.includes('basal init'));
    assert.ok(out.includes('Type a command, or `exit` to leave.'));
    assert.deepEqual(snapshotPaths(dir), []);
  });
});

test('the session runs the same commands as the terminal', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    const out = await session(dir, ['menu', 'system tokens', 'help create', 'exit']);
    assert.ok(out.includes(renderMenu().trimEnd()));
    assert.ok(out.includes('color-primary'));
    assert.ok(out.includes('basal create  (alias: build)'));
  });
});

test('the session honours quoting, so "help" is prose and help is help', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    const asHelp = await session(dir, ['create help', 'exit']);
    assert.ok(asHelp.includes('basal create  (alias: build)'));

    const asProse = await session(dir, ['create "help"', 'exit']);
    assert.ok(asProse.includes('not built yet'));
    assert.ok(!asProse.includes('basal create  (alias: build)'));
  });
});

test('an unknown command in the session points at the menu and keeps going', async () => {
  await withTempDir(async (dir) => {
    const out = await session(dir, ['wibble', 'menu', 'exit']);
    assert.ok(out.includes('no command called "wibble"'));
    assert.ok(out.includes('basal system'));
  });
});
