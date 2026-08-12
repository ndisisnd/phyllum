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

    // Quoted, "help" is prose: create tries to read it as a component and,
    // finding no archetype in it, asks which kind rather than guessing.
    const asProse = await session(dir, ['create "help"', 'exit']);
    assert.ok(asProse.includes('could not tell which kind of component'));
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

test('the session runs the whole create loop: questions, answer, acceptance', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));

    // Six gaps for a button (five slots plus two states, one filled by the
    // prose), then the acceptance question. Answering "1" picks the first
    // suggestion; an empty line means skip.
    const out = await session(dir, [
      'create "button danger with 12px padding-top"',
      '1',
      '',
      '',
      '1',
      '1',
      '',
      '',
      'y',
      'exit',
    ]);

    assert.ok(out.includes('What is the background?'), 'the loop asks one question at a time');
    assert.ok(out.includes('1. Your system already has'), 'and offers its suggestions');
    assert.ok(out.includes('Write Button/Danger to DESIGN-SYSTEM.md?'));
    assert.ok(out.includes('Wrote Button/Danger to DESIGN-SYSTEM.md.'));

    const file = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(file.includes('### Button/Danger'));
    assert.ok(file.includes('padding-top: 12px'));
    assert.deepEqual(snapshotPaths(dir).sort(), ['.basal/session.json', 'DESIGN-SYSTEM.md']);
  });
});

test('declining in the session leaves the file untouched', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    const before = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');

    const out = await session(dir, [
      'create "badge new with 999px radius"',
      '',
      '',
      '',
      '',
      'n',
      'exit',
    ]);

    assert.ok(out.includes('nothing was written'));
    assert.equal(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'), before);
  });
});
