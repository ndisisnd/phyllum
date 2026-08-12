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
import {
  FIXTURES,
  POPULATED_FIXTURE,
  copyDir,
  readFixture,
  snapshotPaths,
  withTempDir,
} from './helpers.js';

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

test('the session runs the whole tokenise review: proposals, answers, acceptance', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'tokenise-mixed'), dir);
    fs.writeFileSync(
      path.join(dir, 'DESIGN-SYSTEM.md'),
      readFixture(path.join(FIXTURES, 'design-system', 'empty.md')),
    );

    // The review comes most-used first: the brand blue, then the radius, then
    // the white. Confirm the first, skip the second, rename the third, skip the
    // rest — then accept the write.
    // One answer per proposal — the fixture has thirteen — then the acceptance.
    const answers = ['y', 'skip', 'color-page', ...Array.from({ length: 10 }, () => 'skip')];
    const out = await session(dir, ['tokenise', ...answers, 'y', 'exit']);

    assert.ok(out.includes('read-only'), 'the session says the scan wrote nothing');
    assert.ok(
      out.includes('13 values worth naming'),
      'one answer per proposal above — if the fixture changes, so does this line',
    );
    assert.ok(out.includes('Name #2563EB as `color-primary`?'), 'one proposal at a time');
    assert.ok(out.includes('merging #2564EC ×2'), 'and it shows what it is merging');
    assert.ok(out.includes('Write 2 tokens to DESIGN-SYSTEM.md?'));

    const file = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(file.includes('| color-primary | #2563EB |'));
    assert.ok(file.includes('| color-page | #FFFFFF |'), 'the rename is what got written');
    assert.deepEqual(snapshotPaths(dir).includes('src/styles.css'), true, 'the codebase is still there');
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'styles.css'), 'utf8').includes('#2563EB'), true);
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
