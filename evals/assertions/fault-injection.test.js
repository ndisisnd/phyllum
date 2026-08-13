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
  BACKUP_FILE,
  BACKUP_STAGES,
  BackupError,
  GITIGNORE_LINE,
  InjectedFault,
  WRITE_STAGES,
  appendGitignoreLine,
  writeAssessJson,
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
      assert.deepEqual(
        snapshotPaths(dir),
        ['DESIGN-SYSTEM.md', 'DESIGN-SYSTEM.md.bak'],
        'no temp file is left behind — only the design system and the backup taken before the edit',
      );
      // The interrupted edit is exactly the case the backup exists for, so it
      // has to hold the state the interruption preserved rather than a stale one.
      assert.equal(read(dir, 'DESIGN-SYSTEM.md.bak'), original, 'and the backup is that same file');
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
    assert.deepEqual(snapshotPaths(dir), ['DESIGN-SYSTEM.md', 'DESIGN-SYSTEM.md.bak']);
    assert.equal(read(dir, 'DESIGN-SYSTEM.md.bak'), original, 'and one undo ago is the file before it');
  });
});

test('the same sweep holds for Phyllum-owned state, not just the design system', async () => {
  for (const stage of BEFORE_SWAP) {
    await withTempDir(async (dir) => {
      writeGuarded(dir, '.phyllum/session.json', '{"version":1}\n');
      assert.throws(
        () => writeGuarded(dir, '.phyllum/session.json', 'CORRUPT', { faultAt: stage }),
        InjectedFault,
      );
      assert.equal(read(dir, '.phyllum/session.json'), '{"version":1}\n');
      assert.deepEqual(snapshotPaths(dir), ['.phyllum/session.json']);
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
// The backup path (v0.2.1 §6.5.2) — the write that happens before the write
// ---------------------------------------------------------------------------

/**
 * v0.2.1 added a second write in front of every design-system edit, and a
 * second write is a second thing that can be interrupted. The sweep above
 * proves an interrupted *edit* leaves the previous file intact; this one proves
 * the stronger claim the backup exists to make — an interrupted *backup* leaves
 * the file **unedited**, because a run that pressed on without its safety net
 * would have quietly removed the safety it advertises.
 */

test('the backup sweep covers every stage the backup path has', () => {
  assert.deepEqual(BACKUP_STAGES, [
    'before-backup-read',
    'before-backup-write',
    'during-backup-write',
    'after-backup-write',
    'after-backup-rename',
  ]);
});

for (const stage of BACKUP_STAGES) {
  test(`an interruption at "${stage}" aborts the edit entirely`, async () => {
    await withTempDir(async (dir) => {
      const original = readFixture(POPULATED_FIXTURE);
      writeDesignSystem(dir, original);
      fs.rmSync(path.join(dir, BACKUP_FILE), { force: true });

      assert.throws(
        () => writeDesignSystem(dir, 'CORRUPT — the edit that must not happen', { backupFaultAt: stage }),
        (error) => error instanceof BackupError,
        'a failed backup is a BackupError, not a half-done edit',
      );

      assert.equal(read(dir), original, 'the design system is byte-identical — the edit never ran');
      assert.ok(validateStructure(read(dir)).valid);
      assert.ok(
        !snapshotPaths(dir).some((rel) => rel.includes('.phyllum-tmp-')),
        'and no temp file is left beside either file',
      );
      // Only the last stage gets as far as putting a `.bak` in place, and even
      // there the edit is still refused — the file it backs up is unchanged.
      if (stage === 'after-backup-rename') {
        assert.equal(read(dir, BACKUP_FILE), original, 'the backup taken is of the unedited file');
      } else {
        assert.ok(!fs.existsSync(path.join(dir, BACKUP_FILE)), 'no half-written backup is left behind');
      }
    });
  });
}

test('a backup interrupted half-written never replaces a good one', async () => {
  await withTempDir(async (dir) => {
    const original = readFixture(POPULATED_FIXTURE);
    writeDesignSystem(dir, original);
    const edited = original.replace('# Design System', '# Design System\n');
    writeDesignSystem(dir, edited);
    assert.equal(read(dir, BACKUP_FILE), original, 'one undo ago');

    assert.throws(
      () => writeDesignSystem(dir, 'CORRUPT', { backupFaultAt: 'during-backup-write' }),
      BackupError,
    );

    assert.equal(read(dir), edited, 'the design system is untouched');
    assert.equal(read(dir, BACKUP_FILE), original, 'and the good backup is still the good backup');
  });
});

test('a .bak that cannot be written aborts the edit and says which half failed', async () => {
  await withTempDir(async (dir) => {
    const original = readFixture(POPULATED_FIXTURE);
    writeDesignSystem(dir, original);
    fs.rmSync(path.join(dir, BACKUP_FILE), { force: true });
    // The most ordinary way this happens: something is already sitting there.
    fs.mkdirSync(path.join(dir, BACKUP_FILE));

    assert.throws(
      () => writeDesignSystem(dir, 'CORRUPT'),
      (error) =>
        error instanceof BackupError &&
        error.stage === 'write' &&
        error.code === 'EISDIR' &&
        /could not write DESIGN-SYSTEM\.md\.bak/.test(error.message) &&
        /Nothing was changed/.test(error.message),
    );
    assert.equal(read(dir), original);
  });
});

test('an unreadable design system fails as a read, not as a failed backup', async (t) => {
  if (process.getuid && process.getuid() === 0) {
    return t.skip('running as root: a mode-000 file is still readable');
  }
  await withTempDir(async (dir) => {
    const original = readFixture(POPULATED_FIXTURE);
    writeDesignSystem(dir, original);
    const file = path.join(dir, 'DESIGN-SYSTEM.md');
    fs.chmodSync(file, 0o000);
    try {
      assert.throws(
        () => writeDesignSystem(dir, 'CORRUPT'),
        (error) =>
          error instanceof BackupError &&
          error.stage === 'read' &&
          // The fix a user needs is "your file is unreadable", not "the backup
          // failed" — the same problem named at the end a person can act on.
          /could not read DESIGN-SYSTEM\.md to back it up/.test(error.message),
      );
    } finally {
      fs.chmodSync(file, 0o600);
    }
    assert.equal(read(dir), original);
  });
});

test('an unknown backup stage is refused rather than quietly ignored', async () => {
  await withTempDir(async (dir) => {
    writeDesignSystem(dir, readFixture(POPULATED_FIXTURE));
    assert.throws(
      () => writeDesignSystem(dir, 'x', { backupFaultAt: 'whenever' }),
      /unknown backup stage/,
    );
  });
});

// ---------------------------------------------------------------------------
// `assess --json` (v0.2.1 §6.5.1) — the other new write
// ---------------------------------------------------------------------------

/**
 * The JSON file is the machine-readable end of the pipeline, and a machine is
 * exactly the reader that cannot tell a truncated file from a short one. So the
 * bar is not "the write is usually fine": an interrupted `--json` run must leave
 * **no file at all** where there was none, and the **previous** file untouched
 * where there was one. Never half of the new one.
 */

for (const stage of BEFORE_SWAP) {
  test(`a --json write interrupted at "${stage}" leaves no partial file`, async () => {
    await withTempDir(async (dir) => {
      assert.throws(
        () => writeGuarded(dir, '.phyllum/assess.json', '{"schemaVersion":1}\n', { json: true, faultAt: stage }),
        InjectedFault,
      );
      assert.ok(
        !fs.existsSync(path.join(dir, '.phyllum', 'assess.json')),
        'nothing is where the assessment would have gone',
      );
      assert.ok(
        !snapshotPaths(dir).some((rel) => rel.includes('.phyllum-tmp-')),
        'and no temp file is left behind',
      );
    });
  });

  test(`a --json write interrupted at "${stage}" leaves the previous file whole`, async () => {
    await withTempDir(async (dir) => {
      const first = '{\n  "schemaVersion": 1,\n  "score": 3\n}\n';
      writeAssessJson(dir, '.phyllum/assess.json', first);

      assert.throws(
        () => writeGuarded(dir, '.phyllum/assess.json', '{"score":21}', { json: true, faultAt: stage }),
        InjectedFault,
      );

      const after = read(dir, '.phyllum/assess.json');
      assert.equal(after, first, 'the last good assessment is byte-identical');
      assert.deepEqual(JSON.parse(after).score, 3, 'and still parses — the point of the file');
    });
  });
}

test('a --json write that reaches the rename has committed a whole file', async () => {
  await withTempDir(async (dir) => {
    const first = '{"schemaVersion":1}\n';
    writeAssessJson(dir, '.phyllum/assess.json', first);
    const next = '{"schemaVersion":1,"score":8}\n';

    assert.throws(
      () => writeGuarded(dir, '.phyllum/assess.json', next, { json: true, faultAt: 'after-rename' }),
      InjectedFault,
    );

    const after = read(dir, '.phyllum/assess.json');
    assert.ok(after === next || after === first, 'one version or the other, never a mixture');
    assert.doesNotThrow(() => JSON.parse(after));
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
    `fs.writeFileSync(${JSON.stringify(path.join(dir, 'DESIGN-SYSTEM.md'))} + '.phyllum-tmp-' + process.pid + '-1', 'half a file');`,
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

    const litter = snapshotPaths(dir).filter((rel) => rel.includes('.phyllum-tmp-'));
    assert.equal(litter.length, 1, 'a killed process does leave litter — that is the point');

    writeDesignSystem(dir, `${original}\n`);
    assert.deepEqual(
      snapshotPaths(dir),
      ['DESIGN-SYSTEM.md', 'DESIGN-SYSTEM.md.bak'],
      'and the next write clears it',
    );
    assert.ok(validateStructure(read(dir)).valid);
  });
});

/** The same hard kill, aimed at the assessment file instead. */
async function killedMidJsonWrite(dir) {
  const target = path.join(dir, '.phyllum', 'assess.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const script = [
    `import fs from 'node:fs';`,
    `fs.writeFileSync(${JSON.stringify(target)} + '.phyllum-tmp-' + process.pid + '-1', '{"schemaVersion":1,"sco');`,
    `process.kill(process.pid, 'SIGKILL');`,
  ].join('\n');
  const file = path.join(dir, 'crash.mjs');
  fs.writeFileSync(file, script);
  await run(process.execPath, [file], { cwd: dir }).catch(() => null);
  fs.rmSync(file);
}

test('a process killed mid --json write leaves no assessment file to misread', async () => {
  await withTempDir(async (dir) => {
    await killedMidJsonWrite(dir);
    assert.ok(
      !fs.existsSync(path.join(dir, '.phyllum', 'assess.json')),
      'a consumer finds nothing rather than truncated JSON, which is the honest outcome',
    );
  });
});

test('the next --json run sweeps up what a killed one left behind', async () => {
  await withTempDir(async (dir) => {
    const good = '{"schemaVersion":1}\n';
    writeAssessJson(dir, '.phyllum/assess.json', good);
    await killedMidJsonWrite(dir);

    const litter = snapshotPaths(dir).filter((rel) => rel.includes('.phyllum-tmp-'));
    assert.equal(litter.length, 1, 'a killed process does leave litter — that is the point');
    assert.equal(read(dir, '.phyllum/assess.json'), good, 'the last good file survived it');

    writeAssessJson(dir, '.phyllum/assess.json', good);
    assert.deepEqual(snapshotPaths(dir), ['.phyllum/assess.json'], 'and the next write clears it');
    assert.doesNotThrow(() => JSON.parse(read(dir, '.phyllum/assess.json')));
  });
});
