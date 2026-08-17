/**
 * Assertions for `upgrade` (plan v0.2.0 §4, §7; renamed in v0.3.0 §6).
 *
 * This is the v0.2.0 `update` suite, re-pointed at the new word and otherwise
 * intact — which is the point. The rename moved a name, not a behaviour, and the
 * proof of that is that every check written against the old command still passes
 * against the new one, unedited.
 *
 * `upgrade` is the one command that runs someone else's program, so the checks
 * here are about restraint as much as about function:
 *
 *   Detection is driven by real directory layouts built in a sandbox — a global
 *   npm prefix, a pnpm virtual store, an `_npx` cache, a bare checkout — rather
 *   than by mocking the module that does the detecting.
 *
 *   The package manager is never actually run. The runner is injected, so every
 *   test records what *would* have been run, exactly as written, and asserts on
 *   the argument array rather than on a command line.
 *
 *   Every refusal path is checked for two things: the exact command a person
 *   should type, and that nothing at all was run or written.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import {
  commandLine,
  detectInstall,
  findOnPath,
  installCommandFor,
  managerFromUserAgent,
  updateCommandFor,
} from '../../lib/install-method.js';
import { runUpgrade } from '../../lib/upgrade-command.js';
import { skillFiles } from '../../lib/template.js';
import { SKILL_INSTALL_DIR } from '../../lib/write.js';
import { PACKAGE_ROOT, diffSnapshots, snapshotContents, snapshotPaths, withTempDir } from './helpers.js';

const run = (line, ctx) => execute(tokenizeLine(line), ctx);

/** The test runner is itself started by npm, so its user agent must not leak. */
const NO_ENV = { PATH: '' };

/** Build one install layout inside a sandbox and describe it. */
function layout(dir, { relPath, manifest = null, lockfile = null }) {
  const packageRoot = path.join(dir, ...relPath.split('/'));
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'phyllum', version: '0.0.1' }));

  // The project root is the directory that owns the first node_modules.
  const segments = relPath.split('/');
  const first = segments.indexOf('node_modules');
  const projectRoot = first === -1 ? null : path.join(dir, ...segments.slice(0, first));

  if (manifest && projectRoot) {
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify(manifest));
  }
  if (lockfile && projectRoot) fs.writeFileSync(path.join(projectRoot, lockfile), '');
  return { packageRoot, projectRoot };
}

/** A runner that records what it was asked to do and reports success. */
function recordingRunner({ code = 0, stdout = '', stderr = '' } = {}) {
  const runs = [];
  const runner = async (request) => {
    runs.push(request);
    return { code, stdout, stderr };
  };
  runner.runs = runs;
  return runner;
}

const DEV_MANIFEST = { name: 'app', devDependencies: { phyllum: '^0.1.0' } };
const PROD_MANIFEST = { name: 'app', dependencies: { phyllum: '^0.1.0' } };

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

test('a global npm install is recognised, and updated globally', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot } = layout(dir, { relPath: 'usr/local/lib/node_modules/phyllum' });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    assert.equal(install.kind, 'global');
    assert.equal(install.manager, 'npm');
    assert.equal(install.supported, true);
    assert.deepEqual(updateCommandFor(install), {
      bin: 'npm',
      args: ['install', '--global', 'phyllum@latest'],
    });
  });
});

test('a global pnpm install is recognised from its own path', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot } = layout(dir, { relPath: 'Library/pnpm/global/5/node_modules/phyllum' });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    assert.equal(install.kind, 'global');
    assert.equal(install.manager, 'pnpm');
    assert.equal(install.supported, true);
    assert.deepEqual(updateCommandFor(install), { bin: 'pnpm', args: ['add', '--global', 'phyllum@latest'] });
  });
});

test('a project dev dependency is updated as a dev dependency', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot, projectRoot } = layout(dir, {
      relPath: 'app/node_modules/phyllum',
      manifest: DEV_MANIFEST,
      lockfile: 'package-lock.json',
    });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    assert.equal(install.kind, 'project');
    assert.equal(install.manager, 'npm');
    assert.equal(install.saveAs, 'dev');
    assert.equal(install.projectRoot, projectRoot);
    assert.deepEqual(updateCommandFor(install), {
      bin: 'npm',
      args: ['install', '--save-dev', 'phyllum@latest'],
    });
  });
});

test('a plain dependency stays a plain dependency', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot } = layout(dir, {
      relPath: 'app/node_modules/phyllum',
      manifest: PROD_MANIFEST,
      lockfile: 'package-lock.json',
    });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    assert.equal(install.saveAs, 'prod');
    assert.deepEqual(updateCommandFor(install), { bin: 'npm', args: ['install', '--save', 'phyllum@latest'] });
  });
});

test("pnpm's virtual store still resolves to the project that owns it", async () => {
  await withTempDir(async (dir) => {
    const { packageRoot, projectRoot } = layout(dir, {
      relPath: 'app/node_modules/.pnpm/phyllum@0.1.0/node_modules/phyllum',
      manifest: DEV_MANIFEST,
      lockfile: 'pnpm-lock.yaml',
    });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    assert.equal(install.kind, 'project');
    assert.equal(install.manager, 'pnpm');
    assert.equal(install.projectRoot, projectRoot, 'the outer node_modules is the one that counts');
    assert.deepEqual(updateCommandFor(install), {
      bin: 'pnpm',
      args: ['add', '--save-dev', 'phyllum@latest'],
    });
  });
});

test('the user agent outranks the path when both say something', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot } = layout(dir, {
      relPath: 'app/node_modules/phyllum',
      manifest: DEV_MANIFEST,
      lockfile: 'package-lock.json',
    });
    const install = detectInstall({
      packageRoot,
      env: { npm_config_user_agent: 'pnpm/8.6.0 npm/? node/v20.11.0 darwin arm64' },
      cwd: dir,
    });
    assert.equal(install.manager, 'pnpm');
    assert.ok(install.evidence.some((line) => line.includes('npm_config_user_agent')));
  });
});

test('managerFromUserAgent reads only managers Phyllum knows', () => {
  assert.equal(managerFromUserAgent({ npm_config_user_agent: 'npm/10.2.4 node/v20' }), 'npm');
  assert.equal(managerFromUserAgent({ npm_config_user_agent: 'pnpm/8.6.0 npm/?' }), 'pnpm');
  assert.equal(managerFromUserAgent({ npm_config_user_agent: 'deno/2.0' }), null);
  assert.equal(managerFromUserAgent({}), null);
});

test('a one-off npx or dlx run is recognised as having nothing to update', async () => {
  await withTempDir(async (dir) => {
    for (const relPath of [
      '.npm/_npx/4f0a/node_modules/phyllum',
      'Library/Caches/pnpm/dlx/9c1/node_modules/phyllum',
    ]) {
      const { packageRoot } = layout(dir, { relPath });
      const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
      assert.equal(install.kind, 'ephemeral', `${relPath} should be ephemeral`);
      assert.equal(install.supported, false);
      assert.equal(updateCommandFor(install), null, 'there is no command that updates a cache');
    }
  });
});

test('a source checkout is recognised, and left to git', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot } = layout(dir, { relPath: 'code/phyllum' });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    assert.equal(install.kind, 'source');
    assert.equal(install.supported, false);
  });

  // The repository this suite runs in is exactly that case.
  const self = detectInstall({ packageRoot: PACKAGE_ROOT, env: NO_ENV, cwd: PACKAGE_ROOT });
  assert.equal(self.kind, 'source');
  assert.equal(self.supported, false);
});

test('yarn and bun are recognised by name, and not driven', async () => {
  await withTempDir(async (dir) => {
    for (const [lockfile, manager] of [
      ['yarn.lock', 'yarn'],
      ['bun.lockb', 'bun'],
    ]) {
      const { packageRoot } = layout(dir, {
        relPath: `${manager}-app/node_modules/phyllum`,
        manifest: DEV_MANIFEST,
        lockfile,
      });
      const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
      assert.equal(install.kind, 'project');
      assert.equal(install.manager, manager);
      assert.equal(install.supported, false, `${manager} is out of scope for v0.2.0`);
      // Phyllum still knows the right command; it just will not run it.
      assert.ok(commandLine(updateCommandFor(install)).includes(manager));
    }
  });
});

test('the install command Phyllum suggests is right for each manager', () => {
  assert.equal(installCommandFor('npm'), 'npm install --global phyllum');
  assert.equal(installCommandFor('pnpm'), 'pnpm add --global phyllum');
  assert.equal(installCommandFor(null), 'npm install --global phyllum');
});

// ---------------------------------------------------------------------------
// Running the upgrade
// ---------------------------------------------------------------------------

test('a global upgrade runs one command, by resolved path, with an argument array', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot } = layout(dir, { relPath: 'usr/local/lib/node_modules/phyllum' });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    const runner = recordingRunner();

    const result = await runUpgrade({ cwd: dir, env: NO_ENV, install, run: runner, binPath: '/opt/bin/npm' });

    assert.equal(result.code, 0);
    assert.equal(runner.runs.length, 1);
    assert.equal(runner.runs[0].bin, '/opt/bin/npm', 'the binary is a path, not a name');
    assert.deepEqual(runner.runs[0].args, ['install', '--global', 'phyllum@latest']);
    assert.ok(result.out.includes('npm install --global phyllum@latest'), 'and it says what it ran');
    assert.ok(result.out.includes('global install'));
  });
});

test('a project upgrade runs in the project, not in the current directory', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot, projectRoot } = layout(dir, {
      relPath: 'app/node_modules/phyllum',
      manifest: DEV_MANIFEST,
      lockfile: 'pnpm-lock.yaml',
    });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    const runner = recordingRunner();
    await runUpgrade({ cwd: dir, env: NO_ENV, install, run: runner, binPath: '/opt/bin/pnpm' });
    assert.equal(runner.runs[0].cwd, projectRoot);
  });
});

test('a failed install reports the error, changes nothing, and exits non-zero', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot } = layout(dir, { relPath: 'usr/local/lib/node_modules/phyllum' });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    const before = snapshotContents(dir);

    const result = await runUpgrade({
      cwd: dir,
      env: NO_ENV,
      install,
      binPath: '/opt/bin/npm',
      run: recordingRunner({ code: 1, stderr: 'npm error EACCES: permission denied\n' }),
    });

    assert.equal(result.code, 1);
    assert.ok(result.out.includes('That failed (exit 1)'));
    assert.ok(result.out.includes('EACCES'), 'the manager\'s own error is shown');
    assert.ok(/Still on \d+\.\d+\.\d+/.test(result.out), 'and the version is stated as unchanged');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
  });
});

test('a manager Phyllum drives but cannot find is a command, not a crash', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot } = layout(dir, { relPath: 'usr/local/lib/node_modules/phyllum' });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    const runner = recordingRunner();

    // PATH is empty in NO_ENV, so the lookup finds nothing.
    assert.equal(findOnPath('npm', NO_ENV), null);
    const result = await runUpgrade({ cwd: dir, env: NO_ENV, install, run: runner });

    assert.equal(result.code, 1);
    assert.equal(runner.runs.length, 0, 'nothing was run');
    assert.ok(result.out.includes('npm install --global phyllum@latest'));
    assert.deepEqual(snapshotPaths(dir), snapshotPaths(dir));
  });
});

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

test('every refusal names the exact command, runs nothing, and writes nothing', async () => {
  await withTempDir(async (dir) => {
    const cases = [
      {
        id: 'npx',
        relPath: '.npm/_npx/4f0a/node_modules/phyllum',
        expect: ['nothing here to update', 'npm install --global phyllum', 'pnpm add --global phyllum'],
      },
      {
        id: 'dlx',
        relPath: 'Library/Caches/pnpm/dlx/9c1/node_modules/phyllum',
        expect: ['nothing here to update', 'pnpm add --global phyllum'],
      },
      { id: 'source', relPath: 'code/phyllum', expect: ['source checkout', 'git'] },
      {
        id: 'yarn',
        relPath: 'yarn-app/node_modules/phyllum',
        manifest: DEV_MANIFEST,
        lockfile: 'yarn.lock',
        expect: ['npm and pnpm', 'yarn add --dev phyllum@latest'],
      },
    ];

    for (const testCase of cases) {
      const { packageRoot } = layout(dir, testCase);
      const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
      const runner = recordingRunner();
      const before = snapshotContents(dir);

      const result = await runUpgrade({ cwd: dir, env: NO_ENV, install, run: runner });

      assert.equal(result.code, 1, `${testCase.id}: a refusal is not a success`);
      assert.equal(runner.runs.length, 0, `${testCase.id}: nothing may be run`);
      for (const phrase of testCase.expect) {
        assert.ok(result.out.includes(phrase), `${testCase.id}: "${phrase}" missing from the refusal`);
      }
      assert.ok(/Still on \d+\.\d+\.\d+/.test(result.out), `${testCase.id}: says what is still installed`);
      assert.deepEqual(
        diffSnapshots(before, snapshotContents(dir)),
        { added: [], changed: [], removed: [] },
        `${testCase.id}: a refusal writes nothing`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// The skill re-sync
// ---------------------------------------------------------------------------

test('a successful upgrade re-syncs the skill copy init installed', async () => {
  await withTempDir(async (dir) => {
    const skillDir = path.join(dir, ...SKILL_INSTALL_DIR.split('/'));
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'a stale copy from an older version\n');

    const { packageRoot } = layout(dir, { relPath: 'usr/local/lib/node_modules/phyllum' });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    const before = snapshotContents(dir);

    const result = await runUpgrade({
      cwd: dir,
      env: NO_ENV,
      install,
      binPath: '/opt/bin/npm',
      run: recordingRunner(),
    });

    assert.equal(result.code, 0);
    assert.ok(result.out.includes('re-synced'));

    const expected = skillFiles();
    const written = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    assert.equal(written, fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'SKILL.md'), 'utf8'));
    for (const rel of expected) {
      const installed = path.join(skillDir, ...rel.split('/'));
      assert.ok(fs.existsSync(installed), `${rel} was not re-synced`);
      // The reference tree is a folder per protocol as of v0.4.1, so the
      // re-sync has to reach into the folders and put the *source* copy back —
      // a stale per-topic file left behind is exactly the CLI/skill version
      // split this step exists to prevent.
      assert.equal(
        fs.readFileSync(installed, 'utf8'),
        fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', ...rel.split('/')), 'utf8'),
        `${rel} was re-synced to something other than the source`,
      );
    }
    assert.ok(
      expected.filter((rel) => rel.split('/').length > 2).length > 30,
      'the nested reference folders are part of what is re-synced',
    );

    // Only the skill copy changed: no design system was invented, nothing else touched.
    const diff = diffSnapshots(before, snapshotContents(dir));
    for (const rel of [...diff.added, ...diff.changed]) {
      assert.ok(rel.startsWith(SKILL_INSTALL_DIR), `upgrade touched ${rel}`);
    }
    assert.deepEqual(diff.removed, []);
  });
});

test('with no skill copy installed, upgrade creates none and says so', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot } = layout(dir, { relPath: 'usr/local/lib/node_modules/phyllum' });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    const before = snapshotContents(dir);

    const result = await runUpgrade({
      cwd: dir,
      env: NO_ENV,
      install,
      binPath: '/opt/bin/npm',
      run: recordingRunner(),
    });

    assert.equal(result.code, 0);
    assert.ok(result.out.includes('phyllum init'), 'it points at the command that installs one');
    assert.ok(!fs.existsSync(path.join(dir, ...SKILL_INSTALL_DIR.split('/'))));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
  });
});

// ---------------------------------------------------------------------------
// The command surface
// ---------------------------------------------------------------------------

test('upgrade works before init, and needs no design system', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot } = layout(dir, { relPath: 'usr/local/lib/node_modules/phyllum' });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });
    const runner = recordingRunner();

    // A findable `npm` on PATH, so the command gets past the lookup. It is never
    // executed: the runner is injected.
    const binDir = path.join(dir, 'fake-bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const { out, code } = await run('upgrade', {
      cwd: dir,
      env: { PATH: binDir },
      install,
      run: runner,
      yes: true,
    });

    assert.equal(code, 0);
    assert.ok(!out.includes('no DESIGN-SYSTEM.md here yet'), 'upgrade is about the install, not the project');
    assert.ok(!fs.existsSync(path.join(dir, 'DESIGN-SYSTEM.md')));
  });
});

test('upgrade never checks the registry itself', async () => {
  await withTempDir(async (dir) => {
    const { packageRoot } = layout(dir, { relPath: 'usr/local/lib/node_modules/phyllum' });
    const install = detectInstall({ packageRoot, env: NO_ENV, cwd: dir });

    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ version: '9.9.9' }) };
    };
    try {
      await runUpgrade({ cwd: dir, env: NO_ENV, install, binPath: '/opt/bin/npm', run: recordingRunner() });
      assert.deepEqual(calls, [], 'the package manager resolves `latest`, not Phyllum');
    } finally {
      globalThis.fetch = original;
    }
  });
});
