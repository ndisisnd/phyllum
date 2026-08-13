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
    assert.ok(out.includes('phyllum init'));
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
    assert.ok(out.includes('phyllum create  (alias: build)'));
  });
});

test('the session honours quoting, so "help" is prose and help is help', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    const asHelp = await session(dir, ['create help', 'exit']);
    assert.ok(asHelp.includes('phyllum create  (alias: build)'));

    // Quoted, "help" is prose: create tries to read it as a component and,
    // finding no archetype in it, asks which kind rather than guessing.
    const asProse = await session(dir, ['create "help"', 'exit']);
    assert.ok(asProse.includes('could not tell which kind of component'));
    assert.ok(!asProse.includes('phyllum create  (alias: build)'));
  });
});

test('an unknown command in the session points at the menu and keeps going', async () => {
  await withTempDir(async (dir) => {
    const out = await session(dir, ['wibble', 'menu', 'exit']);
    assert.ok(out.includes('no command called "wibble"'));
    assert.ok(out.includes('phyllum system'));
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
    assert.deepEqual(snapshotPaths(dir).sort(), ['.phyllum/session.json', 'DESIGN-SYSTEM.md']);
  });
});

test('the session runs the whole tokenise flow: the sentence, the name, acceptance', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'tokenise-mixed'), dir);
    fs.writeFileSync(
      path.join(dir, 'DESIGN-SYSTEM.md'),
      readFixture(path.join(FIXTURES, 'design-system', 'empty.md')),
    );

    // Two runs, because `tokenise` names one value per run: confirm the name it
    // suggests for the blue, then rename the one it suggests for the white.
    const out = await session(dir, [
      'tokenise "our brand blue #2563EB"',
      'y',
      'y',
      'tokenise "the page background #FFFFFF"',
      'color-page',
      'y',
      'exit',
    ]);

    assert.ok(out.includes('Read from "our brand blue #2563EB"'), 'it says what it read');
    assert.ok(out.includes('Name #2563EB as `color-primary`?'), 'and confirms the name it chose');
    assert.ok(out.includes('Write `color-primary` to DESIGN-SYSTEM.md?'));

    const file = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(file.includes('| color-primary | #2563EB |'));
    assert.ok(file.includes('| color-page | #FFFFFF |'), 'the rename is what got written');
    assert.deepEqual(snapshotPaths(dir).includes('src/styles.css'), true, 'the codebase is still there');
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'styles.css'), 'utf8').includes('#2563EB'), true);
  });
});

test('the session runs the whole assess flow: the map, the review, acceptance', async () => {
  await withTempDir(async (dir) => {
    // A codebase small enough to count the questions: one stylesheet, two raw
    // values, so the review is two names and one acceptance.
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'app.css'),
      '.panel {\n  color: #16A34A;\n  padding: 20px;\n}\n',
    );
    fs.writeFileSync(
      path.join(dir, 'DESIGN-SYSTEM.md'),
      readFixture(path.join(FIXTURES, 'design-system', 'empty.md')),
    );
    const cssBefore = fs.readFileSync(path.join(dir, 'src', 'app.css'), 'utf8');

    const out = await session(dir, ['assess', 'y', 'y', 'y', 'exit']);

    assert.ok(out.includes('phyllum assess — read-only'), 'the promise leads the report');
    assert.ok(out.includes('Step 4 — the map'), 'the table is part of the session, not a separate mode');
    assert.ok(out.includes('used 1×'), 'and the rows carry the evidence');
    assert.ok(out.includes('Name #16A34A as `color-primary`?'), 'the review is `tokenise`s, one value at a time');
    assert.ok(out.includes('Write 2 tokens to DESIGN-SYSTEM.md?'), 'one acceptance gate for the batch');
    assert.ok(out.includes('Wrote 2 tokens to DESIGN-SYSTEM.md'));

    const file = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(file.includes('| color-primary | #16A34A |'));
    assert.ok(file.includes('| space-md | 20px | spacing |'));
    assert.equal(
      fs.readFileSync(path.join(dir, 'src', 'app.css'), 'utf8'),
      cssBefore,
      'the codebase it just read is byte for byte what it was',
    );
  });
});

/** The same two-value codebase the assess flow above counts its questions on. */
/**
 * Three uses of each value, deliberately.
 *
 * The severity engine (v0.2.1 §3.2) calls a value written once or twice a likely
 * exception and `assess update` declines those, so a codebase meant to
 * demonstrate the write path has to show drift rather than a one-off.
 */
const TINY_CSS =
  '.panel {\n  color: #16A34A;\n  padding: 20px;\n}\n' +
  '.card {\n  color: #16A34A;\n  padding: 20px;\n}\n' +
  '.note {\n  color: #16A34A;\n  padding: 20px;\n}\n';

function tinyCodebase(dir) {
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'app.css'), TINY_CSS);
  fs.writeFileSync(
    path.join(dir, 'DESIGN-SYSTEM.md'),
    readFixture(path.join(FIXTURES, 'design-system', 'empty.md')),
  );
}

test('the session runs `assess tokens` as the token review and nothing else', async () => {
  await withTempDir(async (dir) => {
    tinyCodebase(dir);
    const out = await session(dir, ['assess tokens', 'y', 'y', 'y', 'exit']);

    assert.ok(out.includes('Name #16A34A as `color-primary`?'), 'the review is the same one');
    assert.ok(out.includes('Wrote 2 tokens to DESIGN-SYSTEM.md'));
    assert.ok(!out.includes('\nComponents\n'), 'and the component track was never opened');
  });
});

test('the session runs `assess components` as the picker, and a skip ends it', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'repeated-jsx'), dir);
    fs.writeFileSync(
      path.join(dir, 'DESIGN-SYSTEM.md'),
      readFixture(path.join(FIXTURES, 'design-system', 'empty.md')),
    );
    const before = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');

    const out = await session(dir, ['assess components', 'skip', 'exit']);

    assert.ok(out.includes('Record one of these as a component?'), 'the picker is the conversation');
    assert.ok(out.includes('None recorded this run'), 'and a skip stops the loop rather than asking again');
    assert.ok(!out.includes('Name #'), 'the token review was never opened');
    assert.equal(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'), before, 'nothing written');
  });
});

test('the session runs `assess update` without asking the session anything', async () => {
  await withTempDir(async (dir) => {
    tinyCodebase(dir);
    // One line in, one report out: no answers supplied, and none needed.
    const out = await session(dir, ['assess update', 'exit']);

    assert.ok(out.includes('`assess update` answered step 5 for you'));
    assert.ok(out.includes('Wrote 2 tokens to DESIGN-SYSTEM.md'));
    assert.ok(!out.includes('Name #16A34A as'), 'the per-item review was skipped, not answered by the terminal');
    assert.ok(!out.includes('Write 2 tokens to DESIGN-SYSTEM.md?'), 'and so was the gate');

    const file = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(file.includes('| color-primary | #16A34A |'), 'under the name the map proposed');
    assert.ok(file.includes('| space-md | 20px | spacing |'));
    assert.equal(
      fs.readFileSync(path.join(dir, 'src', 'app.css'), 'utf8'),
      TINY_CSS,
      'and the codebase it read is byte for byte what it was',
    );
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
