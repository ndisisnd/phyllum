/**
 * Assertions for `refine lint` (v0.11.0 phase 2).
 *
 * The one gate section that delegates, which makes its risks different from
 * every other section's. Nothing here checks a lint rule — the project's own
 * linter owns those. What is checked is the three promises the delegation rests
 * on, plus the one thing a delegating section can get wrong quietly:
 *
 *   1. **Report mode, or not at all.** Every argument list is built from the
 *      `phyllum:refine-linters` table and refused if a fix flag appears in it.
 *      The refusal is asserted directly, because it is the only thing standing
 *      between a read-only gate and a linter rewriting the project.
 *   2. **An absent linter is not a failing linter**, and is not silence either.
 *      A project with nothing configured reads `pass: null` with a reason.
 *   3. **A run that could not happen says why.** A missing runner and a timeout
 *      are reported as themselves, never as a pass and never as a lint failure.
 *   4. **Nothing is written**, by this module or by anything it starts.
 *
 * No real linter is spawned anywhere in this file. The runner is injected, so
 * every case is a fact about the arguments Phyllum builds and the answers it
 * reads — which is what determinism means for a section whose work is somebody
 * else's process.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ALLOWED_BINARIES } from '../../lib/run-command.js';
import { linters } from '../../lib/refine-spec.js';
import {
  DEFAULT_RUNNER,
  FIX_FLAGS,
  FixModeError,
  RUNNERS,
  detectLinters,
  extensionsFor,
  lintArgv,
  packageRunner,
  refineLint,
  summarise,
} from '../../lib/refine-lint.js';
import { diffSnapshots, snapshotContents, withTempDir } from './helpers.js';

/** A runner that records what it was asked to start, and answers as told. */
function recorder(answer = { ok: true, code: 0, stdout: '', stderr: '', missing: false, timedOut: false }) {
  const calls = [];
  const run = (bin, args, options) => {
    calls.push({ bin, args, options });
    return typeof answer === 'function' ? answer(bin, args) : answer;
  };
  return { run, calls };
}

/** A project with the files a case needs, and nothing else. */
function project(dir, files = {}) {
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return dir;
}

const named = (result, id) => result.linters.find((row) => row.linter === id);

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

test('a config file, a manifest key and an installed package each configure a linter', async () => {
  await withTempDir(async (dir) => {
    project(dir, {
      'eslint.config.js': 'export default [];\n',
      '.stylelintrc.json': '{}\n',
      'package.json': JSON.stringify({ name: 'x', devDependencies: { prettier: '^3.0.0' } }),
    });
    const found = detectLinters(dir).filter((row) => row.configured);
    assert.deepEqual(found.map((row) => row.id), ['eslint', 'stylelint', 'prettier']);
    assert.equal(found[0].evidence, 'eslint.config.js');
    assert.equal(found[2].evidence, 'prettier in package.json');
  });
});

test('a manifest key is evidence on its own — a config file need not sit beside it', async () => {
  await withTempDir(async (dir) => {
    project(dir, { 'package.json': JSON.stringify({ name: 'x', eslintConfig: { root: true } }) });
    const eslint = detectLinters(dir).find((row) => row.id === 'eslint');
    assert.equal(eslint.configured, true);
    assert.match(eslint.evidence, /eslintConfig/);
  });
});

test('a manifest that will not parse is silence, not evidence', async () => {
  await withTempDir(async (dir) => {
    project(dir, { 'package.json': '{ not json' });
    assert.deepEqual(detectLinters(dir).filter((row) => row.configured), []);
  });
});

test('the package runner is the one the lockfile names', async () => {
  await withTempDir(async (dir) => {
    assert.equal(packageRunner(dir).bin, 'npm', 'npm is the default, and it ships with Node');
    project(dir, { 'pnpm-lock.yaml': 'lockfileVersion: 9\n' });
    assert.equal(packageRunner(dir).bin, 'pnpm');
  });
});

test('every runner is a binary the run funnel already allows', () => {
  for (const runner of [...RUNNERS, DEFAULT_RUNNER]) {
    assert.ok(ALLOWED_BINARIES.includes(runner.bin), `${runner.bin} is not on the allowlist`);
  }
});

// ---------------------------------------------------------------------------
// Report mode, or not at all
// ---------------------------------------------------------------------------

test('no linter in the table is run with a flag that would rewrite anything', () => {
  for (const linter of linters()) {
    const argv = lintArgv(DEFAULT_RUNNER, linter);
    for (const word of argv) {
      assert.ok(!FIX_FLAGS.includes(word), `${linter.id} would be started with ${word}`);
    }
  }
});

test('an argument list carrying a fix flag is refused before anything is spawned', () => {
  for (const flag of ['--fix', '--write']) {
    assert.throws(
      () => lintArgv(DEFAULT_RUNNER, { name: 'eslint', command: ['eslint', '.', flag] }),
      (error) => error instanceof FixModeError && error.flag === flag,
      `${flag} was not refused`,
    );
  }
  assert.throws(
    () => lintArgv(DEFAULT_RUNNER, { name: 'eslint', command: ['eslint', '--fix-type=layout', '.'] }),
    FixModeError,
    'a flag with its value attached is the same flag',
  );
});

test('the command that runs is the one the reference wrote down', async () => {
  await withTempDir(async (dir) => {
    project(dir, { 'eslint.config.js': 'export default [];\n' });
    const { run, calls } = recorder();
    refineLint(dir, { run, runner: DEFAULT_RUNNER });
    assert.equal(calls.length, 1, 'only the configured linter is started');
    assert.deepEqual(calls[0].args, ['exec', '--', 'eslint', '.']);
    assert.equal(calls[0].bin, 'npm');
    assert.equal(calls[0].options.cwd, fs.realpathSync(dir));
  });
});

// ---------------------------------------------------------------------------
// The four answers
// ---------------------------------------------------------------------------

test('a clean run passes, and carries the summary it printed', async () => {
  await withTempDir(async (dir) => {
    project(dir, { 'eslint.config.js': 'export default [];\n' });
    const { run } = recorder({ ok: true, code: 0, stdout: 'all good\n', stderr: '', missing: false, timedOut: false });
    const result = refineLint(dir, { run, runner: DEFAULT_RUNNER });
    assert.equal(result.pass, true);
    assert.deepEqual(result.findings, []);
    assert.equal(named(result, 'eslint').summary, 'all good');
  });
});

test('a non-zero exit fails the section, with the tail of what the linter said', async () => {
  await withTempDir(async (dir) => {
    project(dir, { 'eslint.config.js': 'export default [];\n' });
    const { run } = recorder({
      ok: false,
      code: 1,
      stdout: 'src/Button.jsx\n  3:1  error  Unexpected var\n\n1 problem\n',
      stderr: '',
      missing: false,
      timedOut: false,
    });
    const result = refineLint(dir, { run, runner: DEFAULT_RUNNER });
    assert.equal(result.pass, false);
    assert.deepEqual(result.findings.map((row) => row.rule), ['lint-error']);
    assert.equal(result.findings[0].severity, 'error');
    assert.ok(result.findings[0].evidence.includes('1 problem'));
  });
});

test('a linter that could not be started is reported as that — never as a pass', async () => {
  await withTempDir(async (dir) => {
    project(dir, { 'eslint.config.js': 'export default [];\n' });
    const missing = recorder({ ok: false, code: null, stdout: '', stderr: '', missing: true, timedOut: false });
    const result = refineLint(dir, { run: missing.run, runner: DEFAULT_RUNNER });
    const eslint = named(result, 'eslint');
    assert.equal(eslint.ran, false);
    assert.equal(eslint.ok, null);
    assert.match(eslint.reason, /not on PATH/);
    assert.equal(result.pass, false, 'a section that could not run is not a section that passed');
    assert.deepEqual(result.couldNotRun.map((row) => row.linter), ['eslint']);
    assert.deepEqual(result.findings, [], 'and it is not reported as a lint failure either');
  });
});

test('a run that timed out says so', async () => {
  await withTempDir(async (dir) => {
    project(dir, { 'eslint.config.js': 'export default [];\n' });
    const { run } = recorder({ ok: false, code: null, stdout: '', stderr: '', missing: false, timedOut: true });
    const eslint = named(refineLint(dir, { run, runner: DEFAULT_RUNNER }), 'eslint');
    assert.equal(eslint.ran, false);
    assert.match(eslint.reason, /time limit/);
  });
});

test('a project with no linter has no lint check to fail, and is not silent about it', async () => {
  await withTempDir(async (dir) => {
    project(dir, { 'package.json': JSON.stringify({ name: 'x' }) });
    const { run, calls } = recorder();
    const result = refineLint(dir, { run, runner: DEFAULT_RUNNER });
    assert.equal(calls.length, 0, 'nothing is started');
    assert.equal(result.pass, null, 'not a pass');
    assert.match(result.reason, /no linter is configured/);
    for (const row of result.linters) assert.equal(row.reason, 'not configured');
  });
});

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

test('a subject’s files are handed to the linters that read them, and to no others', async () => {
  await withTempDir(async (dir) => {
    project(dir, { 'eslint.config.js': 'export default [];\n', '.stylelintrc.json': '{}\n' });
    const { run, calls } = recorder();
    const result = refineLint(dir, {
      run,
      runner: DEFAULT_RUNNER,
      files: ['src/Button.jsx', 'src/button.css'],
    });
    assert.deepEqual(calls[0].args, ['exec', '--', 'eslint', 'src/Button.jsx', 'src/button.css']);
    assert.deepEqual(calls[1].args, ['exec', '--', 'stylelint', 'src/button.css'], 'the glob names its extensions');
    assert.equal(result.pass, true);
  });
});

test('a linter with nothing left to read is not applicable, which is neither pass nor absent', async () => {
  await withTempDir(async (dir) => {
    project(dir, { '.stylelintrc.json': '{}\n' });
    const { run, calls } = recorder();
    const result = refineLint(dir, { run, runner: DEFAULT_RUNNER, files: ['src/Button.jsx'] });
    assert.equal(calls.length, 0);
    const stylelint = named(result, 'stylelint');
    assert.equal(stylelint.configured, true);
    assert.equal(stylelint.ran, false);
    assert.match(stylelint.reason, /nothing in this subject/);
  });
});

test('the extensions a linter reads come from its own command', () => {
  const stylelint = linters().find((row) => row.id === 'stylelint');
  assert.deepEqual(extensionsFor(stylelint), ['.css', '.scss', '.sass', '.less']);
  assert.deepEqual(extensionsFor(linters().find((row) => row.id === 'eslint')), [], 'no glob claims no extensions');
});

test('a summary is the tail of the output, not the whole of it', () => {
  const stdout = Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n');
  const summary = summarise({ stdout, stderr: '' }, 3);
  assert.deepEqual(summary.split('\n'), ['line 37', 'line 38', 'line 39']);
});

// ---------------------------------------------------------------------------
// Read-only
// ---------------------------------------------------------------------------

test('the lint section writes nothing — not one file, not one byte', async () => {
  await withTempDir(async (dir) => {
    project(dir, {
      'eslint.config.js': 'export default [];\n',
      '.prettierrc': '{}\n',
      'package.json': JSON.stringify({ name: 'x' }),
    });
    const before = snapshotContents(dir);
    const { run } = recorder({ ok: false, code: 1, stdout: 'nope', stderr: '', missing: false, timedOut: false });
    refineLint(dir, { run, runner: DEFAULT_RUNNER });
    detectLinters(dir);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
  });
});
