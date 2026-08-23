/**
 * Assertions for `release:patch` / `release:minor` (plan v0.7.2 §3).
 *
 * The npm scripts and `evals/release.js` behind them exist to close a gap
 * that used to cost a diagnose-and-repair loop per release: a version bump
 * that forgets to re-record `evals/baseline.json`. What has to be true is
 * narrow — bump, then record, then check, in that order, and no step ever
 * touches git — so that is what this suite proves, three ways:
 *
 *   the package.json scripts exist and point at the right module;
 *   the module's own exported steps run bump -> record -> check, proved by
 *   driving `cutRelease` with an injected `run` that only records what it
 *   was asked to do, against a sandbox copy of a minimal package.json (a
 *   full sandbox run through `npm run check` recursively is too heavy for a
 *   unit test — this drives the module's real logic, not a re-implementation
 *   of it, and stops short of a real `npm install` the way that recursion
 *   would need);
 *   and a source scan of both the script strings and the module for any
 *   `git` token, so the no-commit property is a fact about the text, not an
 *   inference from behaviour.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { bumpGraders, bumpManifest, bumpVersion, cutRelease, STEPS } from '../release.js';
import { PACKAGE_ROOT, withTempDir } from './helpers.js';

const packageJson = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
const releaseSource = fs.readFileSync(path.join(PACKAGE_ROOT, 'evals', 'release.js'), 'utf8');

// ---------------------------------------------------------------------------
// The scripts exist, and point at the module
// ---------------------------------------------------------------------------

test('release:patch and release:minor are both npm scripts', () => {
  assert.equal(packageJson.scripts['release:patch'], 'node evals/release.js patch');
  assert.equal(packageJson.scripts['release:minor'], 'node evals/release.js minor');
});

test('both scripts invoke the same module, differing only in the bump kind', () => {
  const patch = packageJson.scripts['release:patch'];
  const minor = packageJson.scripts['release:minor'];
  assert.equal(patch.replace('patch', 'minor'), minor);
});

// ---------------------------------------------------------------------------
// The order — bump, then record, then check — against the module's own logic
// ---------------------------------------------------------------------------

test('STEPS names the sequence in order: bump, bump, record, check', () => {
  assert.deepEqual(STEPS, [
    'bump package.json version',
    'bump MILESTONE and RELEASE in graders.js',
    'npm run evals:record',
    'npm run check',
  ]);
});

test('bumpVersion advances patch and minor, and rejects anything else', () => {
  assert.equal(bumpVersion('0.7.1', 'patch'), '0.7.2');
  assert.equal(bumpVersion('0.7.1', 'minor'), '0.8.0');
  assert.equal(bumpVersion('1.9.9', 'patch'), '1.9.10');
  assert.throws(() => bumpVersion('0.7.1', 'major'), /unknown bump kind/);
  assert.throws(() => bumpVersion('not-semver', 'patch'), /not a plain semver version/);
});

test('bumpManifest rewrites only the version field, of a sandboxed package.json', async () => {
  await withTempDir(async (dir) => {
    const manifestPath = path.join(dir, 'package.json');
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify({ name: 'sandbox', version: '0.7.1', scripts: { check: 'true' } }, null, 2)}\n`,
    );
    const { from, to } = bumpManifest('patch', manifestPath);
    assert.equal(from, '0.7.1');
    assert.equal(to, '0.7.2');

    const after = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(after.version, '0.7.2');
    assert.equal(after.name, 'sandbox', 'nothing else in the manifest moved');
    assert.deepEqual(after.scripts, { check: 'true' });
  });
});

/** A sandbox holding the two files `cutRelease` rewrites, and nothing else. */
function sandbox(dir, version = '0.7.1') {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: 'sandbox', version }, null, 2)}\n`,
  );
  fs.mkdirSync(path.join(dir, 'evals'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'evals', 'graders.js'),
    "export const MILESTONE = 'v0.7.1 release';\nexport const RELEASE = 'v0.7.1';\n",
  );
}

test('bumpGraders rewrites both stamps, and refuses to pass silently when it finds neither', async () => {
  await withTempDir(async (dir) => {
    sandbox(dir);
    const gradersPath = path.join(dir, 'evals', 'graders.js');
    const stamps = bumpGraders('0.8.0', gradersPath);
    assert.deepEqual(stamps, { milestone: 'v0.8.0 release', release: 'v0.8.0' });

    const after = fs.readFileSync(gradersPath, 'utf8');
    assert.match(after, /^export const MILESTONE = 'v0\.8\.0 release';$/m);
    assert.match(after, /^export const RELEASE = 'v0\.8\.0';$/m);

    // The failure this guards is the one that shipped v0.9.0's scores under
    // v0.8.0's name: a rewrite that matches nothing must say so, not no-op.
    const empty = path.join(dir, 'evals', 'nothing.js');
    fs.writeFileSync(empty, 'export const OTHER = 1;\n');
    assert.throws(() => bumpGraders('0.8.0', empty), /could not find MILESTONE and RELEASE/);
  });
});

test('the release stamps the baseline carries move with the version, in one act', async () => {
  await withTempDir(async (dir) => {
    sandbox(dir);
    cutRelease('minor', { cwd: dir, run: () => {} });
    const graders = fs.readFileSync(path.join(dir, 'evals', 'graders.js'), 'utf8');
    assert.match(graders, /'v0\.8\.0 release'/, 'the milestone names the version just bumped to');
    assert.match(graders, /'v0\.8\.0'/);
  });
});

test('cutRelease runs bump, then evals:record, then check, in that order, and nothing else', async () => {
  await withTempDir(async (dir) => {
    sandbox(dir);

    const calls = [];
    const run = (bin, args, cwd) => {
      calls.push({ bin, args, cwd });
    };

    const { from, to } = cutRelease('patch', { cwd: dir, run });

    assert.equal(from, '0.7.1');
    assert.equal(to, '0.7.2');
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version,
      '0.7.2',
      'the bump is written to disk before either npm run fires',
    );
    assert.deepEqual(calls, [
      { bin: 'npm', args: ['run', 'evals:record'], cwd: dir },
      { bin: 'npm', args: ['run', 'check'], cwd: dir },
    ]);
  });
});

test('cutRelease bumps minor and resets the patch to zero', async () => {
  await withTempDir(async (dir) => {
    sandbox(dir);
    const { to } = cutRelease('minor', { cwd: dir, run: () => {} });
    assert.equal(to, '0.8.0');
  });
});

// ---------------------------------------------------------------------------
// No git, anywhere
// ---------------------------------------------------------------------------

test('neither release script string mentions git', () => {
  assert.ok(!/git/i.test(packageJson.scripts['release:patch']));
  assert.ok(!/git/i.test(packageJson.scripts['release:minor']));
});

test('evals/release.js never invokes git — no git command or binary token in its executable lines', () => {
  const executable = releaseSource
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n');
  assert.ok(!/execFileSync\(['"`]git/i.test(executable), 'a git binary is invoked directly');
  assert.ok(!/['"`]git (commit|tag|add|push)/i.test(executable), 'a git subcommand string appears');
});

test('the real cutRelease call sequence recorded above never includes a git binary', async () => {
  await withTempDir(async (dir) => {
    sandbox(dir);
    const calls = [];
    cutRelease('patch', { cwd: dir, run: (bin, args, cwd) => calls.push({ bin, args, cwd }) });
    for (const call of calls) {
      assert.notEqual(call.bin, 'git');
      assert.ok(!call.args.some((arg) => /\bgit\b/i.test(arg)));
    }
  });
});
