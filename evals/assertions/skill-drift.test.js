/**
 * Assertions for `inspectSkillCopy` (plan v0.7.1 §3, phase 1).
 *
 * `lib/skill-drift.js` is the read-only eye that notices when a project's
 * `.claude/skills/phyllum/` copy has parted company with the install that
 * would write it today. It is deliberately unwired here — nothing in `version`
 * or `upgrade` calls it yet, so these assertions exercise the module on its
 * own, the same way `detect.js` and `design-system.js` get their own files
 * before anything downstream depends on them.
 *
 * Every test works in a throwaway temp directory. `installSkill` is `init`'s
 * own copier, reused here rather than reimplemented, so a fixture copy is
 * always byte-for-byte what a real `init` would have produced before a test
 * goes on to disturb it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { installSkill } from '../../lib/init.js';
import { FINDINGS, inspectSkillCopy } from '../../lib/skill-drift.js';
import { skillFiles } from '../../lib/template.js';
import { SKILL_INSTALL_DIR } from '../../lib/write.js';
import { snapshotPaths, withTempDir } from './helpers.js';

const installedPath = (root, rel) => path.join(root, ...SKILL_INSTALL_DIR.split('/'), ...rel.split('/'));

test('FINDINGS names exactly the three verdicts', () => {
  assert.deepEqual(FINDINGS, ['in-step', 'differs', 'none']);
});

// ---------------------------------------------------------------------------
// in-step
// ---------------------------------------------------------------------------

test('a copy written by installSkill reports in-step', async () => {
  await withTempDir(async (dir) => {
    const files = installSkill(dir);
    const result = inspectSkillCopy(dir);

    assert.equal(result.finding, 'in-step');
    assert.equal(result.dir, SKILL_INSTALL_DIR);
    assert.equal(result.total, files.length);
    assert.equal(result.differing, 0);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.changed, []);
    assert.deepEqual(result.extra, []);
  });
});

// ---------------------------------------------------------------------------
// differs — one file changed
// ---------------------------------------------------------------------------

test('a changed file reports differs, naming that file in changed', async () => {
  await withTempDir(async (dir) => {
    installSkill(dir);
    const target = installedPath(dir, 'SKILL.md');
    fs.writeFileSync(target, `${fs.readFileSync(target, 'utf8')}\nsomething the user added\n`);

    const result = inspectSkillCopy(dir);
    assert.equal(result.finding, 'differs');
    assert.deepEqual(result.changed, ['SKILL.md']);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.extra, []);
    assert.equal(result.differing, 1);
  });
});

// ---------------------------------------------------------------------------
// differs — one file missing
// ---------------------------------------------------------------------------

test('a missing file reports differs, naming that file in missing — not none', async () => {
  await withTempDir(async (dir) => {
    installSkill(dir);
    fs.rmSync(installedPath(dir, 'SKILL.md'));

    const result = inspectSkillCopy(dir);
    assert.equal(result.finding, 'differs');
    assert.deepEqual(result.missing, ['SKILL.md']);
    assert.deepEqual(result.changed, []);
    assert.deepEqual(result.extra, []);
    assert.equal(result.differing, 1);
  });
});

// ---------------------------------------------------------------------------
// differs — one extra file
// ---------------------------------------------------------------------------

test('an extra file not enumerated by the package reports differs, naming it in extra', async () => {
  await withTempDir(async (dir) => {
    installSkill(dir);
    fs.writeFileSync(installedPath(dir, 'refs/leftover-from-an-older-release.md'), 'orphaned guidance\n');

    const result = inspectSkillCopy(dir);
    assert.equal(result.finding, 'differs');
    assert.deepEqual(result.extra, ['refs/leftover-from-an-older-release.md']);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.changed, []);
    assert.equal(result.differing, 1);
  });
});

// ---------------------------------------------------------------------------
// none
// ---------------------------------------------------------------------------

test('no .claude/skills/phyllum/ directory at all reports none, and creates nothing', async () => {
  await withTempDir(async (dir) => {
    const before = snapshotPaths(dir);
    const result = inspectSkillCopy(dir);

    assert.equal(result.finding, 'none');
    assert.equal(result.total, skillFiles().length, 'the count is still reported for none');
    assert.equal(result.differing, 0);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.changed, []);
    assert.deepEqual(result.extra, []);
    assert.deepEqual(snapshotPaths(dir), before, 'inspecting a bare project writes nothing');
  });
});

// ---------------------------------------------------------------------------
// An unreadable file is changed, never thrown
// ---------------------------------------------------------------------------

test('a file that turned into a directory is reported in changed, never thrown', async () => {
  await withTempDir(async (dir) => {
    installSkill(dir);
    const target = installedPath(dir, 'SKILL.md');
    fs.rmSync(target);
    fs.mkdirSync(target);

    const result = inspectSkillCopy(dir);
    assert.equal(result.finding, 'differs');
    assert.ok(result.changed.includes('SKILL.md'), 'unreadable is read as changed, not skipped');
  });
});

// ---------------------------------------------------------------------------
// Never throws
// ---------------------------------------------------------------------------

test('inspectSkillCopy never throws, for any input including a nonexistent root', () => {
  assert.doesNotThrow(() => inspectSkillCopy('/definitely/does/not/exist/anywhere'));
  const result = inspectSkillCopy('/definitely/does/not/exist/anywhere');
  assert.equal(result.finding, 'none');
});

test('inspectSkillCopy defaults to the current working directory', () => {
  assert.doesNotThrow(() => inspectSkillCopy());
});

// ---------------------------------------------------------------------------
// differing is exactly missing + changed + extra
// ---------------------------------------------------------------------------

test('differing equals missing.length + changed.length + extra.length', async () => {
  await withTempDir(async (dir) => {
    installSkill(dir);
    fs.rmSync(installedPath(dir, 'SKILL.md'));
    const changedTarget = installedPath(dir, 'refs/version/version.md');
    fs.writeFileSync(changedTarget, `${fs.readFileSync(changedTarget, 'utf8')}\nedited\n`);
    fs.writeFileSync(installedPath(dir, 'refs/an-orphan.md'), 'orphaned\n');

    const result = inspectSkillCopy(dir);
    assert.equal(result.finding, 'differs');
    assert.equal(result.differing, result.missing.length + result.changed.length + result.extra.length);
    assert.equal(result.differing, 3);
  });
});

// ---------------------------------------------------------------------------
// The three lists are sorted
// ---------------------------------------------------------------------------

test('missing, changed and extra are each reported in sorted order', async () => {
  await withTempDir(async (dir) => {
    installSkill(dir);

    // Delete two files, out of alphabetical order.
    fs.rmSync(installedPath(dir, 'refs/version/version.md'));
    fs.rmSync(installedPath(dir, 'refs/apply/apply.md'));

    // Change two files, out of alphabetical order.
    const changedA = installedPath(dir, 'refs/upgrade/upgrade.md');
    fs.writeFileSync(changedA, `${fs.readFileSync(changedA, 'utf8')}\nedited\n`);
    const changedB = installedPath(dir, 'refs/assess/assess.md');
    fs.writeFileSync(changedB, `${fs.readFileSync(changedB, 'utf8')}\nedited\n`);

    // Two extra files, out of alphabetical order.
    fs.writeFileSync(installedPath(dir, 'refs/zzz-orphan.md'), 'orphaned\n');
    fs.writeFileSync(installedPath(dir, 'refs/aaa-orphan.md'), 'orphaned\n');

    const result = inspectSkillCopy(dir);
    assert.deepEqual(result.missing, [...result.missing].sort());
    assert.deepEqual(result.changed, [...result.changed].sort());
    assert.deepEqual(result.extra, [...result.extra].sort());
    assert.deepEqual(result.missing, ['refs/apply/apply.md', 'refs/version/version.md']);
    assert.deepEqual(result.changed, ['refs/assess/assess.md', 'refs/upgrade/upgrade.md']);
    assert.deepEqual(result.extra, ['refs/aaa-orphan.md', 'refs/zzz-orphan.md']);
  });
});
