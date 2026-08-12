/**
 * The filesystem-diff harness, checked two ways (plan §8.5, §1).
 *
 * The harness itself (`evals/harness/fs-harness.js`) watches every run of the
 * suite. This file makes sure it is actually watching — a bare `node --test`
 * without the preload fails right here — that it classifies paths the way the
 * permission model says, and that it genuinely bites: a run that writes outside
 * the enumeration, or into the repository, is failed by it.
 *
 * On top of the harness there is a whole-project sweep: a real fixture codebase
 * driven through `init`, `create`, `tokenise` and `system`, with the entire tree
 * diffed before and after. Nothing outside the §1 enumeration may appear, and
 * no file of the user's codebase may change.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { runCreate } from '../../lib/create-command.js';
import { runTokenise } from '../../lib/tokenise-command.js';
import { validateStructure } from '../../lib/design-system.js';
import {
  FIXTURES,
  PACKAGE_ROOT,
  copyDir,
  diffSnapshots,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const run = promisify(execFile);
const HARNESS = path.join(PACKAGE_ROOT, 'evals', 'harness', 'fs-harness.js');

test('the suite runs under the filesystem-diff harness, not beside it', () => {
  assert.ok(
    globalThis.__basalFsHarness,
    'the assertion suite must run with --import=./evals/harness/fs-harness.js (npm test does)',
  );
  assert.equal(typeof globalThis.__basalFsHarness.enumerationLabel, 'function');
});

test('the harness recognises exactly the paths §1 enumerates', () => {
  const { enumerationLabel } = globalThis.__basalFsHarness;
  const project = '/tmp/basal-test-abc';

  assert.ok(enumerationLabel(`${project}/DESIGN-SYSTEM.md`));
  assert.ok(enumerationLabel(`${project}/.basal/session.json`));
  assert.ok(enumerationLabel(`${project}/.basal/uploads/shot.png`));
  assert.ok(enumerationLabel(`${project}/.claude/skills/basal/SKILL.md`));
  assert.ok(enumerationLabel(`${project}/.gitignore`));
  // The funnel's own temp file is the enumerated path mid-flight.
  assert.ok(enumerationLabel(`${project}/DESIGN-SYSTEM.md.basal-tmp-4242-1`));

  for (const rel of [
    'src/Button.jsx',
    'package.json',
    'README.md',
    '.claude/settings.json',
    '.claude/skills/other/SKILL.md',
    'tailwind.config.js',
    'DESIGN-SYSTEM.md.bak',
  ]) {
    assert.equal(enumerationLabel(`${project}/${rel}`), null, `${rel} is not enumerated`);
  }
});

/**
 * A miniature package with the harness in it, so the guard can be caught in the
 * act without asking the real suite to misbehave.
 */
async function withFakePackage(offenderSource, body, { withLib = false } = {}) {
  return withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'evals', 'harness'), { recursive: true });
    fs.copyFileSync(HARNESS, path.join(dir, 'evals', 'harness', 'fs-harness.js'));
    // Some checks need Basal's own parser beside the harness; most do not, and
    // the harness has to work either way.
    if (withLib) copyDir(path.join(PACKAGE_ROOT, 'lib'), path.join(dir, 'lib'));
    fs.writeFileSync(path.join(dir, 'lib', 'offender.js'), offenderSource);
    return body(dir);
  });
}

test('a write outside the enumeration fails the run it happened in', async () => {
  await withFakePackage(
    [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      'export function misbehave(dir) {',
      "  fs.writeFileSync(path.join(dir, 'src-Button.jsx'), 'rewritten by hand');",
      '}',
    ].join('\n'),
    async (dir) => {
      fs.writeFileSync(
        path.join(dir, 'run.mjs'),
        [
          "import fs from 'node:fs';",
          "import os from 'node:os';",
          "import path from 'node:path';",
          "import { misbehave } from './lib/offender.js';",
          "const sandbox = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'basal-test-'));",
          'misbehave(sandbox);',
          'fs.rmSync(sandbox, { recursive: true, force: true });',
        ].join('\n'),
      );

      const failure = await run(process.execPath, ['--import=./evals/harness/fs-harness.js', 'run.mjs'], {
        cwd: dir,
      }).then(
        () => null,
        (error) => error,
      );

      assert.ok(failure, 'the harness must fail a run that writes outside the enumeration');
      assert.equal(failure.code, 1);
      assert.match(failure.stderr, /outside the permission model/);
      assert.match(failure.stderr, /src-Button\.jsx/);
    },
  );
});

test('a write into the repository itself fails the run', async () => {
  await withFakePackage(
    [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      'export function misbehave(root) {',
      "  fs.writeFileSync(path.join(root, 'scribble.txt'), 'the repo is never a test subject');",
      '}',
    ].join('\n'),
    async (dir) => {
      fs.writeFileSync(
        path.join(dir, 'run.mjs'),
        ["import { misbehave } from './lib/offender.js';", 'misbehave(process.cwd());'].join('\n'),
      );

      const failure = await run(process.execPath, ['--import=./evals/harness/fs-harness.js', 'run.mjs'], {
        cwd: dir,
      }).then(
        () => null,
        (error) => error,
      );

      assert.ok(failure, 'the harness must fail a run that writes into the package');
      assert.match(failure.stderr, /repo (write|diff)/);
      assert.match(failure.stderr, /scribble\.txt/);
    },
  );
});

test('an allowed write passes the harness cleanly', async () => {
  await withFakePackage(
    [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      'export function behave(dir) {',
      "  fs.mkdirSync(path.join(dir, '.basal'), { recursive: true });",
      "  fs.writeFileSync(path.join(dir, '.basal', 'session.json'), '{}');",
      "  fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), '# Design System\\n');",
      '}',
    ].join('\n'),
    async (dir) => {
      fs.writeFileSync(
        path.join(dir, 'run.mjs'),
        [
          "import fs from 'node:fs';",
          "import os from 'node:os';",
          "import path from 'node:path';",
          "import { behave } from './lib/offender.js';",
          "const sandbox = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'basal-test-'));",
          'behave(sandbox);',
          'fs.rmSync(sandbox, { recursive: true, force: true });',
        ].join('\n'),
      );

      const { stderr } = await run(
        process.execPath,
        ['--import=./evals/harness/fs-harness.js', 'run.mjs'],
        { cwd: dir },
      );
      assert.equal(stderr.trim(), '');
    },
  );
});

test('a design system that stops validating fails the run that wrote it', async () => {
  await withFakePackage(
    [
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      'export function misbehave(dir) {',
      // An enumerated path, so the permission guard is happy — and a file the
      // §7.1.1 contract would not recognise, which is the point.
      "  fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), '# Notes\\n\\nno sections here\\n');",
      '}',
    ].join('\n'),
    async (dir) => {
      fs.writeFileSync(
        path.join(dir, 'run.mjs'),
        [
          "import fs from 'node:fs';",
          "import os from 'node:os';",
          "import path from 'node:path';",
          "import { misbehave } from './lib/offender.js';",
          "const sandbox = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'basal-test-'));",
          'misbehave(sandbox);',
          'fs.rmSync(sandbox, { recursive: true, force: true });',
        ].join('\n'),
      );

      const failure = await run(process.execPath, ['--import=./evals/harness/fs-harness.js', 'run.mjs'], {
        cwd: dir,
      }).then(
        () => null,
        (error) => error,
      );

      assert.ok(failure, 'the harness must fail a run that leaves an invalid design system');
      assert.match(failure.stderr, /template integrity/);
    },
    { withLib: true },
  );
});

// ---------------------------------------------------------------------------
// The whole-project sweep
// ---------------------------------------------------------------------------

const ENUMERATED = (rel) =>
  rel === 'DESIGN-SYSTEM.md' ||
  rel === '.gitignore' ||
  rel === '.basal' ||
  rel.startsWith('.basal/') ||
  rel.startsWith('.claude/skills/basal/');

test('a full session over a real codebase touches only the enumerated paths', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'tokenise-mixed'), dir);
    const before = snapshotContents(dir);

    await execute(tokenizeLine('init'), { cwd: dir, yes: true, today: '2026-08-12' });
    await runCreate([{ value: 'button danger with 12px padding-top', quoted: true }], {
      cwd: dir,
      env: {},
      ask: async () => 'skip',
      confirm: async () => true,
    });
    await runTokenise([], { cwd: dir, env: {}, ask: async () => 'y', confirm: async () => true });
    await execute(tokenizeLine('system'), { cwd: dir });
    await execute(tokenizeLine('menu'), { cwd: dir });
    await execute(tokenizeLine('help create'), { cwd: dir });

    const after = snapshotContents(dir);
    const { added, changed, removed } = diffSnapshots(before, after);

    assert.deepEqual(removed, [], 'Basal never removes a file');
    for (const rel of [...added, ...changed]) {
      assert.ok(ENUMERATED(rel), `${rel} is outside the §1 enumeration`);
    }
    assert.ok(added.includes('DESIGN-SYSTEM.md'), 'the session did write the one file it may');
    assert.ok(added.some((rel) => rel.startsWith('.claude/skills/basal/')), 'init installed the skill');

    // Every file of the user's codebase is byte-identical afterwards.
    for (const [rel, contents] of before) {
      assert.equal(after.get(rel), contents, `${rel} was modified`);
    }

    // And what was written is still the file the template contract describes.
    assert.ok(validateStructure(after.get('DESIGN-SYSTEM.md')).valid);
  });
});

test('a read-only command over a real codebase changes nothing at all', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'react-css'), dir);
    await execute(tokenizeLine('init'), { cwd: dir, yes: true, today: '2026-08-12' });
    const before = snapshotContents(dir);

    for (const line of ['system', 'system tokens', 'system components', 'menu', 'help', 'help tokenise']) {
      await execute(tokenizeLine(line), { cwd: dir });
    }

    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});
