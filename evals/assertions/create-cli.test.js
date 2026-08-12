/**
 * Assertions for the `create` command surface (plan §2.2, §7.3, §8.5).
 *
 * Mechanics run everywhere; the intelligent half needs a model, and when there
 * is no route to one, `create` says so and names both ways to fix it. Nothing
 * in this file spawns a process or calls a model — the route is a lookup, so
 * every branch is testable offline.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { findClaudeCli, insideClaudeSession, intelligenceRoute } from '../../lib/claude-cli.js';
import { POPULATED_FIXTURE, readFixture, snapshotContents, diffSnapshots, withTempDir } from './helpers.js';

const run = (line, cwd, extra = {}) =>
  execute(tokenizeLine(line), { cwd, env: {}, yes: true, ...extra });

async function withProject(body) {
  return withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    return body(dir);
  });
}

test('prose mode renders the spec view, the code view and the gap list', async () => {
  await withProject(async (dir) => {
    const { out } = await run('create "button danger with 12px padding-top"', dir);
    assert.ok(out.includes('Draft — Button/Danger'));
    assert.ok(out.includes('Spec view'));
    assert.ok(out.includes('padding-top: 12px'));
    assert.ok(out.includes('Code view (React + CSS)'));
    assert.ok(out.includes('export function ButtonDanger'));
    assert.ok(out.includes('Gaps ('));
    assert.ok(out.includes('Nothing has been written'));
  });
});

test('the gap list leads with a token the system already has', async () => {
  await withProject(async (dir) => {
    const { out } = await run('create "button danger with 12px padding-top"', dir);
    assert.ok(out.includes('Your system already has `rounded-md` (12px) — use it?'));
  });
});

test('`build` behaves exactly like `create`', async () => {
  await withProject(async (dir) => {
    const a = await run('create "button danger with 12px padding-top"', dir);
    const b = await run('build "button danger with 12px padding-top"', dir);
    assert.equal(a.out, b.out);
    assert.equal(a.code, b.code);
  });
});

test('a description with no archetype in it asks, and writes nothing', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await run('create "something nice"', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('could not tell which kind of component'));
    assert.ok(out.includes('Button, Input, Card, Badge, Modal'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});

test('an image path that resolves to nothing says so, and never becomes prose', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await run('create shot.png', dir);
    assert.equal(code, 1);
    assert.ok(out.includes('There is no image at `shot.png`'));
    assert.ok(out.includes('phyllum create "shot.png"'), 'it names the way to mean it as prose');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});

test('bare create opens the picker rather than a mode that is not built', async () => {
  await withProject(async (dir) => {
    const { out } = await run('create', dir);
    assert.ok(out.includes('What would you like to create?'));
    assert.ok(out.includes('Archetypes'));
    assert.ok(out.includes('Found in your codebase'));
    assert.ok(!out.includes('not built yet'));
  });
});

test('a quoted image-looking description is prose, not a file path', async () => {
  await withProject(async (dir) => {
    const { out } = await execute(tokenizeLine('create "button danger shot.png"'), {
      cwd: dir,
      env: {},
    });
    assert.ok(out.includes('Draft — Button/Danger'));
  });
});

test('with no route to a model, create names both ways to get one', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('create "button danger with 12px padding-top"', dir);
    assert.equal(code, 1, 'the intelligent half could not run, and says so');
    assert.ok(out.includes('Install Claude Code'));
    assert.ok(out.includes('run the Phyllum skill from inside a Claude Code session') ||
      out.includes('Run the Phyllum skill from inside a Claude Code session'));
    assert.ok(out.includes('`menu`'), 'mechanics keep working, and it says so');
  });
});

test('inside a Claude Code session the skill takes over, with no shell-out', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('create "button danger with 12px padding-top"', dir, {
      env: { CLAUDECODE: '1' },
    });
    assert.equal(code, 0);
    assert.ok(out.includes('inside a Claude Code session'));
    assert.ok(!out.includes('Install Claude Code'));
  });
});

test('with the claude CLI on PATH, create continues there', async () => {
  await withProject(async (dir) => {
    const bin = path.join(dir, 'fake-bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const { out, code } = await run('create "button danger with 12px padding-top"', dir, {
      env: { PATH: bin },
    });
    assert.equal(code, 0);
    assert.ok(out.includes('`claude` is installed'));
  });
});

test('the route to the intelligence is a lookup, never an invocation', async () => {
  await withTempDir(async (dir) => {
    assert.equal(intelligenceRoute({}), 'none');
    assert.equal(intelligenceRoute({ CLAUDECODE: '1' }), 'session');
    assert.equal(insideClaudeSession({ CLAUDE_CODE_ENTRYPOINT: 'cli' }), true);
    assert.equal(findClaudeCli({ PATH: dir }), null);

    fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    assert.equal(findClaudeCli({ PATH: dir }), path.join(dir, 'claude'));
    assert.equal(intelligenceRoute({ PATH: dir }), 'shell-out');
  });
});

test('create before init still points at init and writes nothing', async () => {
  await withTempDir(async (dir) => {
    const { out, code } = await run('create "button primary"', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('phyllum init'));
    assert.deepEqual([...snapshotContents(dir).keys()], []);
  });
});
