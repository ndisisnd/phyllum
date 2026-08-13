/**
 * Assertions for the CLI surface (plan §2.2, §7.3, §8.5):
 * the interactive entry point, pre-init behaviour, alias equivalence, and the
 * registered-but-unbuilt commands.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { execute, renderGreeting } from '../../lib/execute.js';
import { tokenizeLine, tokensFromArgv, extractFlags, parseInvocation } from '../../lib/parse-args.js';
import { DISPATCHABLE } from '../../lib/registry.js';
import { renderMenu } from '../../lib/menu.js';
import {
  POPULATED_FIXTURE,
  PACKAGE_ROOT,
  diffSnapshots,
  readFixture,
  snapshotContents,
  snapshotPaths,
  withTempDir,
} from './helpers.js';

const run = (line, cwd, extra = {}) => execute(tokenizeLine(line), { cwd, yes: true, ...extra });
const execFileAsync = promisify(execFile);

test('a bare invocation opens the interactive session', async () => {
  await withTempDir(async (dir) => {
    const result = await execute([], { cwd: dir });
    assert.equal(result.interactive, true);
    assert.equal(result.code, 0);
  });
});

test('with no DESIGN-SYSTEM.md the session suggests init, then shows the menu', async () => {
  await withTempDir(async (dir) => {
    const greeting = renderGreeting(dir);
    assert.ok(greeting.includes('phyllum init'));
    assert.ok(greeting.includes('no DESIGN-SYSTEM.md yet'));
    assert.ok(greeting.includes('phyllum menu'));
    for (const command of DISPATCHABLE) assert.ok(greeting.includes(command.invocation));
  });
});

test('with a DESIGN-SYSTEM.md the session opens straight on the menu', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    assert.equal(renderGreeting(dir), renderMenu());
  });
});

test('the greeting writes nothing', async () => {
  await withTempDir(async (dir) => {
    const before = snapshotContents(dir);
    renderGreeting(dir);
    await execute([], { cwd: dir });
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('before init, the state-dependent commands point at init and create nothing', async () => {
  for (const command of ['system', 'create', 'build', 'assess', 'tokenise', 'tokenize', 'gui', 'dashboard']) {
    await withTempDir(async (dir) => {
      const { out, code } = await run(command, dir);
      assert.equal(code, 0, `${command} should exit cleanly before init`);
      assert.ok(out.includes('phyllum init'), `${command} should point at init`);
      assert.ok(out.includes('no DESIGN-SYSTEM.md here yet'), `${command} should say why`);
      assert.deepEqual(snapshotPaths(dir), [], `${command} created a file before init`);
    });
  }
});

test('menu and help work before init, without creating anything', async () => {
  await withTempDir(async (dir) => {
    for (const line of ['menu', 'help', 'help create']) {
      const { code } = await run(line, dir);
      assert.equal(code, 0);
    }
    assert.deepEqual(snapshotPaths(dir), []);
  });
});

test('registered but unbuilt commands say which milestone they land in', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    // Read from the registry, not a copy of it: a command that lands stops
    // being listed here the moment it flips to built, and never before.
    const unbuilt = DISPATCHABLE.filter((command) => !command.built);
    assert.deepEqual(
      unbuilt.map((command) => command.name),
      [],
      'gui and kill are built as of M4 — every dispatchable command now runs',
    );
    for (const command of unbuilt) {
      const { out, code } = await run(command.name, dir);
      assert.equal(code, 0);
      assert.ok(out.includes('not built yet'), `${command.name} should say it is not built`);
      assert.ok(out.includes(command.milestone), `${command.name} should name ${command.milestone}`);
    }
  });
});

test('every alias pair behaves identically', async () => {
  const pairs = DISPATCHABLE.flatMap((command) =>
    command.aliases.map((alias) => [command.name, alias]),
  );
  assert.deepEqual(pairs, [
    ['create', 'build'],
    ['tokenise', 'tokenize'],
    ['gui', 'dashboard'],
  ]);

  for (const [canonical, alias] of pairs) {
    // Before init.
    await withTempDir(async (dir) => {
      const a = await run(canonical, dir);
      const b = await run(alias, dir);
      assert.deepEqual(b, a, `${alias} differed from ${canonical} before init`);
    });
    // After init.
    await withTempDir(async (dir) => {
      fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
      // `gui` starts a process, so its pair is proved against a real running
      // server in gui.test.js rather than by running it twice here.
      if (canonical !== 'gui') {
        const a = await run(canonical, dir);
        const b = await run(alias, dir);
        assert.deepEqual(b, a, `${alias} differed from ${canonical}`);
      }
      const c = await run(`help ${canonical}`, dir);
      const d = await run(`help ${alias}`, dir);
      assert.deepEqual(d, c);
    });
  }
});

test('the scope word is only meaningful on system and gui', () => {
  const invocation = parseInvocation(tokenizeLine('create tokens'));
  assert.equal(invocation.kind, 'command');
  assert.equal(invocation.command.name, 'create');
  assert.deepEqual(invocation.args, [{ value: 'tokens', quoted: false }]);
});

test('the confirmation flag is stripped before the grammar sees it', () => {
  const { tokens, yes } = extractFlags(tokensFromArgv(['init', '--yes']));
  assert.equal(yes, true);
  assert.deepEqual(tokens, [{ value: 'init', quoted: false }]);
  assert.equal(parseInvocation(tokens).command.name, 'init');
});

test('the tokenizer keeps quoted arguments whole', () => {
  assert.deepEqual(tokenizeLine('create "button primary with 12px padding-top"'), [
    { value: 'create', quoted: false },
    { value: 'button primary with 12px padding-top', quoted: true },
  ]);
  assert.deepEqual(tokenizeLine('  system   tokens '), [
    { value: 'system', quoted: false },
    { value: 'tokens', quoted: false },
  ]);
  assert.deepEqual(tokenizeLine(''), []);
});

test('the installed binary runs and prints the menu', async () => {
  const bin = path.join(PACKAGE_ROOT, 'bin', 'phyllum.js');
  const { stdout } = await execFileAsync(process.execPath, [bin, 'menu'], { cwd: PACKAGE_ROOT });
  assert.equal(stdout, renderMenu());
});

test('the binary detached from a terminal prints the greeting instead of hanging', async () => {
  await withTempDir(async (dir) => {
    const bin = path.join(PACKAGE_ROOT, 'bin', 'phyllum.js');
    const { stdout } = await execFileAsync(process.execPath, [bin], { cwd: dir });
    assert.equal(stdout, renderGreeting(dir));
    assert.deepEqual(snapshotPaths(dir), []);
  });
});
