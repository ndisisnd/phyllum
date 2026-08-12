/**
 * Cross-cutting invariants (plan §1, §7.1, §8.5).
 *
 * The permission model is the promise Basal makes to earn trust, so it is
 * checked two ways: dynamically, by trying to write forbidden paths, and
 * statically, by grepping the CLI for filesystem writes that bypass the funnel.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  PermissionError,
  appendGitignoreLine,
  isAllowedPath,
  mkdirGuarded,
  writeDesignSystem,
  writeGuarded,
} from '../../lib/write.js';
import { parse, validateStructure } from '../../lib/design-system.js';
import { PACKAGE_ROOT, POPULATED_FIXTURE, readFixture, snapshotPaths, withTempDir } from './helpers.js';

test('the permission model allows exactly the four enumerated targets', () => {
  assert.ok(isAllowedPath('DESIGN-SYSTEM.md'));
  assert.ok(isAllowedPath('.basal/session.json'));
  assert.ok(isAllowedPath('.claude/skills/basal/SKILL.md', { init: true }));
  assert.ok(isAllowedPath('.gitignore', { init: true }));

  // The init-only exceptions are closed outside init.
  assert.ok(!isAllowedPath('.claude/skills/basal/SKILL.md'));
  assert.ok(!isAllowedPath('.gitignore'));

  // Everything else, always.
  for (const rel of [
    'src/Button.jsx',
    'package.json',
    'README.md',
    '.claude/settings.json',
    '.claude/skills/other/SKILL.md',
    'tailwind.config.js',
  ]) {
    assert.ok(!isAllowedPath(rel, { init: true }), `${rel} should never be writable`);
  }
});

test('the funnel refuses a write outside the model, including escapes', async () => {
  await withTempDir(async (dir) => {
    for (const target of ['src/Button.jsx', '../outside.md', 'package.json']) {
      assert.throws(() => writeGuarded(dir, target, 'nope'), PermissionError);
    }
    assert.throws(() => mkdirGuarded(dir, 'src'), PermissionError);
    assert.deepEqual(snapshotPaths(dir), []);
  });
});

test('no filesystem write in bin/ or lib/ bypasses the funnel', () => {
  const forbidden =
    /\b(?:fs|fsp|fsPromises)\s*\.\s*(?:write|writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rename|renameSync|rm|rmSync|unlink|unlinkSync|copyFile|copyFileSync|cp|cpSync|createWriteStream)\b/;
  const offenders = [];
  for (const dir of ['bin', 'lib']) {
    for (const rel of snapshotPaths(path.join(PACKAGE_ROOT, dir))) {
      const file = `${dir}/${rel}`;
      if (file === 'lib/write.js') continue; // the funnel itself
      const source = fs.readFileSync(path.join(PACKAGE_ROOT, file), 'utf8');
      source.split('\n').forEach((line, index) => {
        if (forbidden.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
      });
    }
  }
  assert.deepEqual(offenders, [], `filesystem writes outside lib/write.js:\n${offenders.join('\n')}`);
});

test('writes are atomic: an interrupted write leaves the previous file intact', async () => {
  await withTempDir(async (dir) => {
    const original = readFixture(POPULATED_FIXTURE);
    writeDesignSystem(dir, original);

    assert.throws(
      () => writeDesignSystem(dir, 'CORRUPT', { faultAfterTempWrite: true }),
      /injected write fault/,
    );

    const after = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.equal(after, original);
    assert.ok(validateStructure(after).valid);
    assert.equal(parse(after).components.length, 2);

    // No temp file left lying around next to it.
    assert.deepEqual(snapshotPaths(dir), ['DESIGN-SYSTEM.md']);
  });
});

test('an interrupted first write leaves no file at all', async () => {
  await withTempDir(async (dir) => {
    assert.throws(() => writeDesignSystem(dir, 'half', { faultAfterTempWrite: true }));
    assert.deepEqual(snapshotPaths(dir), []);
  });
});

test('the .gitignore append adds one line and is idempotent', async () => {
  await withTempDir(async (dir) => {
    assert.equal(appendGitignoreLine(dir), 'created');
    assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), '.basal/\n');
    assert.equal(appendGitignoreLine(dir), 'already-present');
    assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), '.basal/\n');
  });
});

test('the .gitignore append tolerates a file with no trailing newline', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'dist');
    assert.equal(appendGitignoreLine(dir), 'added');
    assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), 'dist\n.basal/\n');
  });
});
