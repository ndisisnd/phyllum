/**
 * Cross-cutting invariants (plan §1, §7.1, §8.5).
 *
 * The permission model is the promise Phyllum makes to earn trust, so it is
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
  assert.ok(isAllowedPath('.phyllum/session.json'));
  assert.ok(isAllowedPath('.claude/skills/phyllum/SKILL.md', { init: true }));
  assert.ok(isAllowedPath('.gitignore', { init: true }));

  // The init-only exceptions are closed outside init.
  assert.ok(!isAllowedPath('.claude/skills/phyllum/SKILL.md'));
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

/** Every source file of the CLI, funnel included, as `path -> contents`. */
function cliSources({ includeFunnel = false } = {}) {
  const out = new Map();
  for (const dir of ['bin', 'lib']) {
    for (const rel of snapshotPaths(path.join(PACKAGE_ROOT, dir))) {
      const file = `${dir}/${rel}`;
      if (!includeFunnel && file === 'lib/write.js') continue; // the funnel itself
      out.set(file, fs.readFileSync(path.join(PACKAGE_ROOT, file), 'utf8'));
    }
  }
  return out;
}

function scan(patterns, { includeFunnel = false } = {}) {
  const offenders = [];
  for (const [file, source] of cliSources({ includeFunnel })) {
    source.split('\n').forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      for (const { label, pattern } of patterns) {
        if (pattern.test(code)) offenders.push(`${file}:${index + 1}: ${label}: ${line.trim()}`);
      }
    });
  }
  return offenders;
}

const MUTATORS =
  'write|writeFile|writeFileSync|writev|writevSync|appendFile|appendFileSync|mkdir|mkdirSync|' +
  'mkdtemp|mkdtempSync|rename|renameSync|rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync|' +
  'copyFile|copyFileSync|cp|cpSync|createWriteStream|truncate|truncateSync|ftruncate|ftruncateSync|' +
  'symlink|symlinkSync|link|linkSync|chmod|chmodSync|chown|chownSync|utimes|utimesSync';

const FS_WRITE_PATTERNS = [
  {
    label: 'direct fs write',
    // `fs.writeFileSync(...)`, `fsp.rename(...)`, `fs.promises.mkdir(...)`,
    // and the destructured spellings of all three.
    pattern: new RegExp(
      `\\b(?:fs|fsp|fsPromises|promises)\\s*\\.\\s*(?:promises\\s*\\.\\s*)?(?:${MUTATORS})\\s*\\(`,
    ),
    sample: "  fs.promises.appendFile(file, 'x');",
  },
  {
    label: 'fs handle write',
    pattern: /\b(?:handle|fh|fileHandle)\s*\.\s*(?:write|writeFile|appendFile|truncate)\s*\(/,
    sample: '  await handle.writeFile(contents);',
  },
  {
    label: 'write-mode open',
    pattern: /\bopen(?:Sync)?\s*\(\s*[^)]*['"][waxr]\+?['"]/,
    sample: "  const fd = fs.openSync(target, 'a');",
  },
  {
    label: 'write stream',
    pattern: /\bnew\s+fs\.WriteStream\b|\bcreateWriteStream\s*\(/,
    sample: '  const stream = createWriteStream(target);',
  },
];

const CHILD_PROCESS_PATTERNS = [
  // A shell is the classic way to write a file without calling fs at all.
  {
    label: 'shell redirection',
    pattern: /(?:exec|execSync|spawnSync|spawn)\s*\([^)]*[^>]>>?\s*["'`$]/,
    sample: '  execSync(`echo hi > ${target}`);',
  },
  { label: 'shell: true', pattern: /shell\s*:\s*true/, sample: '  spawnSync(cmd, { shell: true });' },
  {
    label: 'exec with a command string',
    pattern: /\b(?:exec|execSync)\s*\(\s*[`'"]/,
    sample: '  exec("cp a b");',
  },
  {
    label: 'a shell binary as the command',
    pattern: /spawn(?:Sync)?\s*\(\s*['"](?:sh|bash|zsh|cmd)['"]/,
    sample: '  spawn("bash", ["-c", script]);',
  },
  {
    label: 'writing via a redirecting tool',
    pattern: /['"](?:tee|dd)\b/,
    sample: '  spawnSync("tee", [target]);',
  },
];

test('the static audit is not vacuous: every pattern catches its own bad line', () => {
  for (const { label, pattern, sample } of [...FS_WRITE_PATTERNS, ...CHILD_PROCESS_PATTERNS]) {
    assert.ok(pattern.test(sample), `the "${label}" pattern does not match ${sample}`);
  }
  // ...and none of them fires on ordinary reading code.
  for (const innocent of [
    "  const text = fs.readFileSync(file, 'utf8');",
    '  if (!fs.existsSync(file)) return null;',
    "  const entries = fs.readdirSync(dir, { withFileTypes: true });",
    "  const child = spawn(python, [SERVER_SCRIPT, '--root', root], { cwd: root });",
  ]) {
    for (const { label, pattern } of [...FS_WRITE_PATTERNS, ...CHILD_PROCESS_PATTERNS]) {
      assert.ok(!pattern.test(innocent), `the "${label}" pattern falsely flags ${innocent}`);
    }
  }
});

test('no filesystem write in bin/ or lib/ bypasses the funnel', () => {
  const offenders = scan(FS_WRITE_PATTERNS);
  assert.deepEqual(offenders, [], `filesystem writes outside lib/write.js:\n${offenders.join('\n')}`);
});

test('only the funnel may reach for the promise-flavoured fs at all', () => {
  const offenders = [];
  for (const [file, source] of cliSources()) {
    if (/from\s+['"]node:fs\/promises['"]/.test(source)) offenders.push(`${file} imports node:fs/promises`);
    if (/require\(\s*['"](?:node:)?fs\/promises['"]\s*\)/.test(source)) offenders.push(`${file} requires fs/promises`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('no child process is used to write around the funnel', () => {
  const offenders = scan(CHILD_PROCESS_PATTERNS, { includeFunnel: true });
  assert.deepEqual(offenders, [], `child-process writes:\n${offenders.join('\n')}`);
});

test('the GUI server is spawned with arguments, not a shell', () => {
  const gui = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'gui-command.js'), 'utf8');
  assert.match(gui, /spawn\(\s*\n?\s*python/, 'the server is spawned by path, with an argument array');
  assert.ok(!/shell/.test(gui.replace(/\/\*[\s\S]*?\*\//g, '')), 'and never through a shell');
});

/**
 * Two processes, and only two.
 *
 * `gui` starts the dashboard server; `update` (v0.2.0 §4) runs the user's
 * package manager, because updating an install is not something a program can do
 * by writing files. The allowlist is widened deliberately and by exactly one
 * entry — every other module still may not reach for a process at all, and both
 * spawners are checked below for spawning by resolved path with an argument
 * array rather than through a shell.
 */
const SPAWNERS = ['lib/gui-command.js', 'lib/update-command.js'];

test('exactly two modules may start a process, and no others', () => {
  const spawners = [];
  for (const [file, source] of cliSources({ includeFunnel: true })) {
    if (/from\s+['"]node:child_process['"]/.test(source)) spawners.push(file);
  }
  assert.deepEqual(spawners, SPAWNERS, 'only the GUI server and the package-manager update start a process');
});

test('the package manager is spawned by resolved path, with an argument array', () => {
  const update = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'update-command.js'), 'utf8');
  const code = update.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // The command and its arguments stay separate — no interpolated command line
  // can be handed to a process, with or without a shell.
  assert.match(code, /spawn\(bin,\s*args,/, 'spawn takes the binary and an argument array');
  assert.ok(!/shell/.test(code), 'and never through a shell');
  assert.ok(!/spawn\(\s*[`'"]/.test(code), 'never a literal command string');

  // The binary is looked up on PATH before it is run, so a missing manager is a
  // message rather than an exception.
  assert.match(code, /findOnPath\(/, 'the manager is resolved on PATH first');

  // Only the two supported managers are ever run, and only with the arguments
  // install-method.js decided on.
  const method = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'install-method.js'), 'utf8');
  assert.match(method, /SUPPORTED_MANAGERS = \['npm', 'pnpm'\]/, 'v0.2.0 drives npm and pnpm only');
});

/**
 * `assess` is the first command whose whole job is to read somebody else's code
 * (v0.2.0 §5.1), so the trust it has to earn is stated structurally: not one
 * module on its path may reach the write funnel, whatever it is handed. The
 * constant naming DESIGN-SYSTEM.md is fine to import — writing to it is not.
 */
test('nothing on the assess path can reach the write funnel', () => {
  const offenders = [];
  for (const rel of ['lib/assess.js', 'lib/assess-command.js', 'lib/scan-text.js']) {
    const source = fs.readFileSync(path.join(PACKAGE_ROOT, rel), 'utf8');
    for (const writer of ['writeGuarded', 'mkdirGuarded', 'writeDesignSystem', 'appendGitignoreLine', 'writeState']) {
      if (source.includes(writer)) offenders.push(`${rel} names ${writer}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test("the Python server's write confinement is structural, not conventional", () => {
  const source = fs.readFileSync(path.join(PACKAGE_ROOT, 'server', 'serve.py'), 'utf8');
  const lines = source.split('\n');

  // Exactly one function opens a file for writing, and it is the guarded one.
  const writeOpens = lines
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => /\bopen\s*\([^)]*["'](?:[wax]b?\+?|\+?r\+b?)["']/.test(line));
  assert.equal(writeOpens.length, 1, `expected one write-mode open, found:\n${writeOpens.map((o) => `${o.number}: ${o.line}`).join('\n')}`);

  const guardStart = lines.findIndex((line) => line.startsWith('def _write_under_state_dir'));
  assert.ok(guardStart >= 0, 'the guarded writer must exist');
  assert.ok(writeOpens[0].number > guardStart, 'and the only write-mode open must be inside it');

  // The guard is a realpath containment check, so `..` cannot walk out of it.
  assert.match(source, /os\.path\.realpath/);
  assert.match(source, /startswith\(state_dir \+ os\.sep\)/);

  // Nothing else in the server may move, copy or delete a file.
  for (const forbidden of ['shutil', 'os.remove(', 'os.unlink(', 'os.rmdir(', 'os.rename(']) {
    assert.ok(!source.includes(forbidden), `the server must not use ${forbidden}`);
  }
  // The one os.replace it does use is the atomic rename inside the guard.
  const replaces = lines.filter((line) => line.includes('os.replace('));
  assert.equal(replaces.length, 1, 'one atomic rename, inside the guarded writer');

  // And it never names the design system as a write target: DESIGN-SYSTEM.md is
  // the Node funnel's business alone.
  assert.ok(!/DESIGN-SYSTEM\.md["']\s*,\s*["']w/.test(source));
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
    assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), '.phyllum/\n');
    assert.equal(appendGitignoreLine(dir), 'already-present');
    assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), '.phyllum/\n');
  });
});

test('the .gitignore append tolerates a file with no trailing newline', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'dist');
    assert.equal(appendGitignoreLine(dir), 'added');
    assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), 'dist\n.phyllum/\n');
  });
});
