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
    globalThis.__phyllumFsHarness,
    'the assertion suite must run with --import=./evals/harness/fs-harness.js (npm test does)',
  );
  assert.equal(typeof globalThis.__phyllumFsHarness.enumerationLabel, 'function');
});

test('the harness recognises exactly the paths §1 enumerates', () => {
  const { enumerationLabel } = globalThis.__phyllumFsHarness;
  const project = '/tmp/phyllum-test-abc';

  assert.ok(enumerationLabel(`${project}/DESIGN-SYSTEM.md`));
  // v0.2.1 §6.5.2: the pre-edit backup is enumerated deliberately, as a path
  // Phyllum may write — not tolerated as a side effect of writing beside it.
  assert.ok(enumerationLabel(`${project}/DESIGN-SYSTEM.md.bak`));
  assert.ok(enumerationLabel(`${project}/.phyllum/session.json`));
  assert.ok(enumerationLabel(`${project}/.phyllum/uploads/shot.png`));
  assert.ok(enumerationLabel(`${project}/.claude/skills/phyllum/SKILL.md`));
  assert.ok(enumerationLabel(`${project}/.gitignore`));
  // The funnel's own temp file is the enumerated path mid-flight.
  assert.ok(enumerationLabel(`${project}/DESIGN-SYSTEM.md.phyllum-tmp-4242-1`));

  for (const rel of [
    'src/Button.jsx',
    'package.json',
    'README.md',
    '.claude/settings.json',
    '.claude/skills/other/SKILL.md',
    'tailwind.config.js',
    'DESIGN-SYSTEM.md.old',
    'assess.json',
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
    // Some checks need Phyllum's own parser beside the harness; most do not, and
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
          "const sandbox = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'phyllum-test-'));",
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
      "  fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });",
      "  fs.writeFileSync(path.join(dir, '.phyllum', 'session.json'), '{}');",
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
          "const sandbox = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'phyllum-test-'));",
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
          "const sandbox = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'phyllum-test-'));",
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
  rel === 'DESIGN-SYSTEM.md.bak' ||
  rel === '.gitignore' ||
  rel === '.phyllum' ||
  rel.startsWith('.phyllum/') ||
  rel.startsWith('.claude/skills/phyllum/');

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

    assert.deepEqual(removed, [], 'Phyllum never removes a file');
    for (const rel of [...added, ...changed]) {
      assert.ok(ENUMERATED(rel), `${rel} is outside the §1 enumeration`);
    }
    assert.ok(added.includes('DESIGN-SYSTEM.md'), 'the session did write the one file it may');
    assert.ok(added.some((rel) => rel.startsWith('.claude/skills/phyllum/')), 'init installed the skill');

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

// ---------------------------------------------------------------------------
// Every command in the v0.2.0 surface, one at a time (M8)
// ---------------------------------------------------------------------------

/**
 * The write surface, per command, as a claim that can be checked (v0.2.0 M8).
 *
 * The sweep above drives a *session* and asks whether anything outside the
 * enumeration appeared. That answers "did Phyllum escape", which is the safety
 * question, but it does not answer "does each command write what it says it
 * writes" — and v0.2.0 added six commands to the surface without adding a row to
 * that answer. `apply run` in particular writes source files, which is the one
 * deliberate widening in the release, so the release's headline guarantee is only
 * worth stating if it is stated per command.
 *
 * `writes` is the exact expected set. `null` means the command is read-only and
 * the expected set is empty — no exceptions, no "except sometimes".
 */
const WRITE_SURFACE = [
  { line: 'menu', writes: null },
  { line: 'help', writes: null },
  { line: 'help assess', writes: null },
  { line: 'help apply', writes: null },
  { line: 'help version', writes: null },
  { line: 'help update', writes: null },
  { line: 'system', writes: null },
  { line: 'system tokens', writes: null },
  { line: 'system components', writes: null },
  { line: 'version', writes: null },
  // The whole point of `assess`: it reads the codebase and writes nothing until
  // somebody accepts a suggestion. Skipping every question must leave no trace.
  { line: 'assess', writes: null, answers: 'skip' },
  { line: 'assess tokens', writes: null, answers: 'skip' },
  { line: 'assess components', writes: null, answers: 'skip' },
  // An empty design system is not a plan: `apply` says so and writes nothing.
  { line: 'apply', writes: null },
  // With one to apply, `apply` is plan-only by design: one file, inside
  // `.phyllum/**`, and never a byte of source. That is what made it shippable
  // before `apply run` existed, and it is still the boundary.
  { line: 'apply', writes: ['.phyllum/PRD.md'], seed: 'apply-target.md' },
  { line: 'apply --fresh', writes: ['.phyllum/PRD.md'], seed: 'apply-target.md' },
];

test('each command in the v0.2.0 surface writes exactly what it claims, and nothing else', async () => {
  for (const { line, writes, answers, seed } of WRITE_SURFACE) {
    await withTempDir(async (dir) => {
      copyDir(path.join(FIXTURES, 'codebases', 'react-css'), dir);
      await execute(tokenizeLine('init'), { cwd: dir, yes: true, today: '2026-08-12' });
      if (seed) {
        fs.writeFileSync(
          path.join(dir, 'DESIGN-SYSTEM.md'),
          fs.readFileSync(path.join(FIXTURES, 'design-system', seed), 'utf8'),
        );
      }
      const before = snapshotContents(dir);

      await execute(tokenizeLine(line), {
        cwd: dir,
        today: '2026-08-13',
        home: '/nonexistent',
        env: { PATH: '' },
        // No network, no model: `version` degrades to "unable to check" rather
        // than reaching for the registry from inside the suite.
        fetch: null,
        ask: async () => answers ?? 'skip',
        confirm: async () => false,
      });

      const { added, changed, removed } = diffSnapshots(before, snapshotContents(dir));
      assert.deepEqual(removed, [], `\`${line}\` removed a file`);
      const touched = [...added, ...changed].sort();
      assert.deepEqual(touched, [...(writes ?? [])].sort(), `\`${line}\` wrote something it does not claim`);
      // Belt and braces: whatever it wrote is inside the enumeration anyway.
      for (const rel of touched) assert.ok(ENUMERATED(rel), `${rel} is outside the §1 enumeration`);
    });
  }
});

test('the source-write widening belongs to apply run alone', async () => {
  // Every other command in the surface is covered above and writes no source
  // file. This states the complement as a fact about the code rather than as a
  // property of the cases somebody happened to write: `apply run` is the only
  // command that reaches the guarded source funnel at all.
  const funnel = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'write.js'), 'utf8');
  assert.match(funnel, /writeSourceGuarded/, 'the guarded source funnel exists');

  const callers = [];
  const libDir = path.join(PACKAGE_ROOT, 'lib');
  for (const entry of fs.readdirSync(libDir)) {
    if (!entry.endsWith('.js') || entry === 'write.js') continue;
    if (/\bwriteSourceGuarded\b/.test(fs.readFileSync(path.join(libDir, entry), 'utf8'))) callers.push(entry);
  }
  assert.deepEqual(callers, ['apply-run.js'], 'only `apply run` may write source files');
});
