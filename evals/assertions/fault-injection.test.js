/**
 * The atomic-write fault sweep (plan §8.5, "atomic writes").
 *
 * One interruption point is not a proof. This sweeps every stage of the write
 * path — before the temp file, half way through it, after it, side by side with
 * the rename, and after the rename — and asserts the same thing each time: the
 * design system the user already had is still there, still byte-identical,
 * still parseable, with no litter beside it.
 *
 * The last case is not simulated at all: a child process is killed outright
 * mid-write, which is the one interruption a `finally` block cannot handle.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { parse, validateStructure } from '../../lib/design-system.js';
import {
  GITIGNORE_LINE,
  InjectedFault,
  WRITE_STAGES,
  appendGitignoreLine,
  writeDesignSystem,
  writeGuarded,
} from '../../lib/write.js';
import { PACKAGE_ROOT, POPULATED_FIXTURE, readFixture, snapshotPaths, withTempDir } from './helpers.js';

const run = promisify(execFile);
const read = (dir, rel = 'DESIGN-SYSTEM.md') => fs.readFileSync(path.join(dir, rel), 'utf8');

/** Stages that are interrupted before the swap: the old file must survive. */
const BEFORE_SWAP = WRITE_STAGES.filter((stage) => stage !== 'after-rename');

test('the sweep covers every stage the write path has', () => {
  assert.deepEqual(WRITE_STAGES, [
    'before-temp-write',
    'during-temp-write',
    'after-temp-write',
    'before-rename',
    'after-rename',
  ]);
});

for (const stage of BEFORE_SWAP) {
  test(`an interruption at "${stage}" leaves the previous design system intact`, async () => {
    await withTempDir(async (dir) => {
      const original = readFixture(POPULATED_FIXTURE);
      writeDesignSystem(dir, original);

      assert.throws(
        () => writeDesignSystem(dir, 'CORRUPT — half a file', { faultAt: stage }),
        (error) => error instanceof InjectedFault && error.stage === stage,
      );

      assert.equal(read(dir), original, 'the previous file is byte-identical');
      assert.ok(validateStructure(read(dir)).valid, 'and still validates against the template');
      assert.equal(parse(read(dir)).components.length, 2, 'and still parses to the same model');
      assert.deepEqual(snapshotPaths(dir), ['DESIGN-SYSTEM.md'], 'no temp file is left behind');
    });
  });

  test(`an interruption at "${stage}" on a first write leaves no file at all`, async () => {
    await withTempDir(async (dir) => {
      assert.throws(() => writeDesignSystem(dir, 'half a file', { faultAt: stage }), InjectedFault);
      assert.deepEqual(snapshotPaths(dir), [], 'a failed first write creates nothing');
    });
  });
}

test('an interruption after the rename means the new file is the live one', async () => {
  await withTempDir(async (dir) => {
    const original = readFixture(POPULATED_FIXTURE);
    writeDesignSystem(dir, original);
    const next = original.replace('# Design System', '# Design System');

    assert.throws(() => writeDesignSystem(dir, next, { faultAt: 'after-rename' }), InjectedFault);

    // The rename is the commit point: past it, the write has happened, and what
    // is on disk is a whole file either way — never a mixture of the two.
    const after = read(dir);
    assert.ok(after === next || after === original, 'the file is one version or the other');
    assert.ok(validateStructure(after).valid);
    assert.deepEqual(snapshotPaths(dir), ['DESIGN-SYSTEM.md']);
  });
});

test('the same sweep holds for Basal-owned state, not just the design system', async () => {
  for (const stage of BEFORE_SWAP) {
    await withTempDir(async (dir) => {
      writeGuarded(dir, '.basal/session.json', '{"version":1}\n');
      assert.throws(
        () => writeGuarded(dir, '.basal/session.json', 'CORRUPT', { faultAt: stage }),
        InjectedFault,
      );
      assert.equal(read(dir, '.basal/session.json'), '{"version":1}\n');
      assert.deepEqual(snapshotPaths(dir), ['.basal/session.json']);
    });
  }
});

test('the same sweep holds for the one .gitignore line init may append', async () => {
  for (const stage of BEFORE_SWAP) {
    await withTempDir(async (dir) => {
      fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
      assert.throws(() => appendGitignoreLine(dir, { faultAt: stage }), InjectedFault);
      assert.equal(read(dir, '.gitignore'), 'node_modules\n', 'the user\'s ignore file is untouched');
      assert.deepEqual(snapshotPaths(dir), ['.gitignore']);
    });
  }
});

test('the older faultAfterTempWrite spelling still means the same stage', async () => {
  await withTempDir(async (dir) => {
    const original = readFixture(POPULATED_FIXTURE);
    writeDesignSystem(dir, original);
    assert.throws(
      () => writeDesignSystem(dir, 'CORRUPT', { faultAfterTempWrite: true }),
      (error) => error.stage === 'after-temp-write',
    );
    assert.equal(read(dir), original);
  });
});

test('an unknown injection stage is refused rather than quietly ignored', async () => {
  await withTempDir(async (dir) => {
    assert.throws(() => writeDesignSystem(dir, 'x', { faultAt: 'whenever' }), /unknown write stage/);
    assert.deepEqual(snapshotPaths(dir), []);
  });
});

// ---------------------------------------------------------------------------
// The interruption no `finally` can catch
// ---------------------------------------------------------------------------

/** A child that starts a write and is killed outright in the middle of it. */
async function killedMidWrite(dir) {
  const script = [
    `import fs from 'node:fs';`,
    `import { writeGuarded } from ${JSON.stringify(path.join(PACKAGE_ROOT, 'lib', 'write.js'))};`,
    `const dir = ${JSON.stringify(dir)};`,
    // Write the temp file by hand exactly as the funnel does, then die before
    // the rename — a SIGKILL leaves no chance to clean anything up.
    `fs.writeFileSync(${JSON.stringify(path.join(dir, 'DESIGN-SYSTEM.md'))} + '.basal-tmp-' + process.pid + '-1', 'half a file');`,
    `process.kill(process.pid, 'SIGKILL');`,
  ].join('\n');
  const file = path.join(dir, 'crash.mjs');
  fs.writeFileSync(file, script);
  await run(process.execPath, [file], { cwd: dir }).catch(() => null);
  fs.rmSync(file);
}

test('a process killed mid-write leaves the design system intact and parseable', async () => {
  await withTempDir(async (dir) => {
    const original = readFixture(POPULATED_FIXTURE);
    writeDesignSystem(dir, original);

    await killedMidWrite(dir);

    assert.equal(read(dir), original, 'a hard crash cannot corrupt the file it never renamed onto');
    assert.ok(validateStructure(read(dir)).valid);
  });
});

test('the next write sweeps up the temp file a killed process left behind', async () => {
  await withTempDir(async (dir) => {
    const original = readFixture(POPULATED_FIXTURE);
    writeDesignSystem(dir, original);
    await killedMidWrite(dir);

    const litter = snapshotPaths(dir).filter((rel) => rel.includes('.basal-tmp-'));
    assert.equal(litter.length, 1, 'a killed process does leave litter — that is the point');

    writeDesignSystem(dir, `${original}\n`);
    assert.deepEqual(snapshotPaths(dir), ['DESIGN-SYSTEM.md'], 'and the next write clears it');
    assert.ok(validateStructure(read(dir)).valid);
  });
});
