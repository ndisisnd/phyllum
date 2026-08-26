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
  APPLY_BRANCH_PREFIX,
  ENFORCEMENT_FILES,
  PermissionError,
  SourceWriteError,
  appendGitignoreLine,
  closeSourceGrant,
  isAllowedPath,
  mkdirGuarded,
  openSourceGrant,
  writeDesignSystem,
  writeEnforcementFile,
  writeGuarded,
  writeSourceGuarded,
} from '../../lib/write.js';
import { ALLOWED_BINARIES, runCommand } from '../../lib/run-command.js';
import {
  ALLOWED_SUBCOMMANDS,
  BRANCH_PREFIX,
  GitUsageError,
  branchNameFor,
  git,
  isApplyBranch,
} from '../../lib/git.js';
import { parse, validateStructure } from '../../lib/design-system.js';
import { PACKAGE_ROOT, POPULATED_FIXTURE, readFixture, snapshotPaths, withTempDir } from './helpers.js';

test('the permission model allows exactly the enumerated targets', () => {
  assert.ok(isAllowedPath('DESIGN-SYSTEM.md'));
  assert.ok(isAllowedPath('DESIGN-SYSTEM.md.bak'));
  // v0.12.0 phase 2: the changelog is a second name on a closed list, not a
  // widening. `lib/govern-log.js` is the only module that reaches it, and it may
  // only ever make it longer — that half is asserted in govern-log.test.js.
  assert.ok(isAllowedPath('DESIGN-SYSTEM-CHANGELOG.md'));
  assert.ok(isAllowedPath('.phyllum/session.json'));
  assert.ok(isAllowedPath('.claude/skills/phyllum/SKILL.md', { init: true }));
  assert.ok(isAllowedPath('.gitignore', { init: true }));
  // v0.12.0 phase 5: `govern init`'s two files. Named in full rather than as the
  // directories they sit in — `.git/hooks/**` and `.github/**` would have been a
  // widening, and the near misses two lines below are why.
  assert.ok(isAllowedPath('.git/hooks/pre-commit', { init: true }));
  assert.ok(isAllowedPath('.github/workflows/phyllum.yml', { init: true }));

  // The init-only exceptions are closed outside init.
  assert.ok(!isAllowedPath('.claude/skills/phyllum/SKILL.md'));
  assert.ok(!isAllowedPath('.gitignore'));
  assert.ok(!isAllowedPath('.git/hooks/pre-commit'));
  assert.ok(!isAllowedPath('.github/workflows/phyllum.yml'));

  // Everything else, always.
  for (const rel of [
    'src/Button.jsx',
    'package.json',
    'README.md',
    // The project's own changelog is not Phyllum's, and a name one word away
    // from a target on the list is exactly the mistake the list exists to stop.
    'CHANGELOG.md',
    'docs/DESIGN-SYSTEM-CHANGELOG.md',
    '.claude/settings.json',
    '.claude/skills/other/SKILL.md',
    'tailwind.config.js',
    // The near misses around `govern init`'s two names. Every one of these is a
    // file somebody's repository plausibly has, and not one of them is on the
    // list — which is the whole difference between two filenames and a directory.
    '.git/hooks/pre-push',
    '.git/hooks/post-commit',
    '.git/hooks/pre-commit.sample',
    '.git/config',
    '.git/HEAD',
    '.github/workflows/ci.yml',
    '.github/workflows/phyllum.yaml',
    '.github/dependabot.yml',
    'hooks/pre-commit',
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

/**
 * `govern init`'s door, which is narrower than the flag that opens it
 * (v0.12.0 phase 5).
 *
 * The init flag admits the skill install, the `.gitignore` line and these two
 * files. `writeEnforcementFile` admits the two files and nothing else, so a
 * caller holding the narrow writer cannot reach the wide allowance — the same
 * shape `writeChangelogFile` has, one release earlier.
 */
test('the enforcement writer takes the two names it is for, and no other path', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true });
    assert.equal(writeEnforcementFile(dir, '.git/hooks/pre-commit', '#!/bin/sh\n'), '.git/hooks/pre-commit');
    assert.equal(
      writeEnforcementFile(dir, '.github/workflows/phyllum.yml', 'name: x\n'),
      '.github/workflows/phyllum.yml',
    );
    // The hook is executable and the workflow is not: one is run by git, the
    // other is read by a service.
    assert.ok(fs.statSync(path.join(dir, '.git', 'hooks', 'pre-commit')).mode & 0o100);

    for (const wrong of [
      '.git/hooks/pre-push',
      '.git/config',
      '.github/workflows/ci.yml',
      '.claude/skills/phyllum/SKILL.md',
      'DESIGN-SYSTEM.md',
      '../outside/pre-commit',
    ]) {
      assert.throws(() => writeEnforcementFile(dir, wrong, 'nope'), PermissionError, wrong);
    }
    // And no ordinary write reaches either name, flag or no flag.
    for (const target of ENFORCEMENT_FILES) {
      assert.throws(() => writeGuarded(dir, target, 'nope'), PermissionError);
    }
    assert.deepEqual(snapshotPaths(dir), ['.git/hooks/pre-commit', '.github/workflows/phyllum.yml']);
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
 * Three processes, and only three.
 *
 * `gui` starts the dashboard server; `upgrade` (v0.2.0 §4, renamed v0.3.0 §6) runs the user's package
 * manager, because updating an install is not something a program can do by
 * writing files; and `run-command.js` (v0.2.0 §6.5) is the run funnel `apply run`
 * uses — git for the branch and the commits, the host project's own test suite,
 * and the `claude` CLI when Phyllum orchestrates a phase itself.
 *
 * The allowlist is widened deliberately, by exactly one entry, and the funnel it
 * adds is narrower than a general spawn: an allowlisted binary, resolved on PATH,
 * with an argument array and a timeout. `lib/git.js`, `lib/host-tests.js` and
 * `lib/agent-cli.js` all go through it rather than reaching for a process
 * themselves, which is why they are absent from this list.
 */
const SPAWNERS = ['lib/gui-command.js', 'lib/run-command.js', 'lib/upgrade-command.js'];

test('exactly three modules may start a process, and no others', () => {
  const spawners = [];
  for (const [file, source] of cliSources({ includeFunnel: true })) {
    if (/from\s+['"]node:child_process['"]/.test(source)) spawners.push(file);
  }
  assert.deepEqual(spawners, SPAWNERS, 'only the GUI server, the run funnel and the package-manager upgrade start a process');
});

/**
 * The run funnel's own four rules, checked structurally (v0.2.0 §6.5).
 *
 * A test command comes out of somebody else's `package.json`, so "run whatever it
 * says" would be a remote-execution hole in a design-system tool. The funnel
 * refuses anything outside a named allowlist, resolves it on PATH first, passes
 * arguments as an array, and always sets a timeout.
 */
test('the run funnel starts only allowlisted binaries, by resolved path', () => {
  const source = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'run-command.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  assert.match(code, /spawnSync\(bin,\s*argv,/, 'the binary and its arguments stay separate');
  assert.ok(!/shell/.test(code), 'and never through a shell');
  assert.ok(!/spawnSync\(\s*[`'"]/.test(code), 'never a literal command string');
  assert.match(code, /findOnPath\(name, env\)/, 'the binary is resolved on PATH before it is run');
  assert.match(code, /if \(!ALLOWED_BINARIES\.includes\(name\)\) throw new DisallowedBinaryError/, 'the allowlist is a hard gate');
  assert.match(code, /timeout: timeoutMs/, 'every child process has a timeout');

  // The allowlist itself: git, the model route, and the test runners named in
  // harness-detect.js. Nothing that writes files on its own behalf.
  assert.deepEqual(ALLOWED_BINARIES, ['git', 'claude', 'npm', 'pnpm', 'yarn', 'bun', 'pytest', 'cargo', 'go', 'bundle']);
  assert.throws(() => runCommand('curl', ['http://example.com']), /refused to run "curl"/);
});

/**
 * Git can destroy work, so Phyllum's git module cannot.
 *
 * The plan's failure rule is stop-and-report, keep the branch (§6.5.3): nothing
 * is ever rolled back. That is only a promise if the code physically cannot roll
 * anything back, so the subcommand allowlist excludes every destructive verb and
 * the module is checked for not naming them at all.
 */
test('the git module cannot discard work, whatever it is asked to do', () => {
  const source = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'git.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // As a git argument, not as a word: `out.push(...)` is not `git push`.
  for (const destructive of ['reset', 'revert', 'clean', 'stash', 'rebase', 'push', 'restore']) {
    assert.ok(
      !new RegExp(`['"]${destructive}['"]`).test(code),
      `lib/git.js must not pass \`${destructive}\` to git`,
    );
  }
  for (const forced of ['--force', '--hard', '-f ']) {
    assert.ok(!code.includes(forced), `lib/git.js must not name ${forced}`);
  }
  for (const verb of ['reset', 'revert', 'clean', 'stash', 'rebase', 'push', 'restore']) {
    assert.ok(!ALLOWED_SUBCOMMANDS.includes(verb), `\`git ${verb}\` must not be in the allowlist`);
    assert.throws(() => git('/nonexistent', [verb]), GitUsageError);
  }
  // The work branch's name is a prefix, and the funnel keys on the same one.
  assert.equal(BRANCH_PREFIX, APPLY_BRANCH_PREFIX);
  assert.ok(isApplyBranch(branchNameFor('2026-08-13')));
  assert.ok(!isApplyBranch('main'));
});

/**
 * The deliberate scope change of v0.2.0, pinned (§6.5, §9).
 *
 * v0.1.0's promise was that Phyllum never writes source. v0.2.0 keeps every word
 * of it except one exception, and this is that exception stated as tightly as it
 * can be: a **grant**, minted only by an `apply run` phase, that names one work
 * branch and one file list. Four refusals are asserted here rather than described:
 * no grant, the wrong branch, a file outside the phase, and a grant that has been
 * closed. Everything else in the permission model is unchanged.
 */
test('a source write needs a grant, an apply branch, and a file the phase named', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    // The fs-diff harness enforces the v0.1.0 enumeration on every write Phyllum
    // makes. A source write is the one exception v0.2.0 adds, so the test opens a
    // window naming exactly the file this phase is entitled to — outside a window
    // the harness still fails the run, which is what keeps the widening visible.
    globalThis.__phyllumFsHarness?.openApplyWindow(['src/styles.css']);

    const branch = branchNameFor('2026-08-13');
    let head = branch;
    const grant = openSourceGrant({ branch, phase: 1, files: ['src/styles.css'], head: () => head });

    // The happy path: the named file, on the named branch, under the grant.
    assert.equal(writeSourceGuarded(dir, 'src/styles.css', '.a{}', grant), 'src/styles.css');
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'styles.css'), 'utf8'), '.a{}');

    // 1. No grant at all — there is no path-only spelling of this call.
    for (const bogus of [undefined, null, {}, { branch, phase: 1, files: new Set(['src/styles.css']) }]) {
      assert.throws(() => writeSourceGuarded(dir, 'src/styles.css', 'x', bogus), SourceWriteError);
    }

    // 2. A file the phase's criteria do not name.
    assert.throws(() => writeSourceGuarded(dir, 'src/other.css', 'x', grant), /may only write the files/);
    assert.throws(() => writeSourceGuarded(dir, '../escape.css', 'x', grant), SourceWriteError);
    assert.throws(() => writeSourceGuarded(dir, '.phyllum/PRD.md', 'x', grant), SourceWriteError);

    // 3. Off the work branch — checked at write time, not just at grant time.
    head = 'main';
    assert.throws(() => writeSourceGuarded(dir, 'src/styles.css', 'x', grant), /never happen off the work branch/);
    head = branch;

    // 4. After the phase ends.
    closeSourceGrant(grant);
    assert.throws(() => writeSourceGuarded(dir, 'src/styles.css', 'x', grant), /grant is closed/);

    // And a grant cannot be opened for the user's own branch in the first place.
    for (const wrong of ['main', 'feature/x', 'phyllum-apply-2026-08-13', '']) {
      assert.throws(() => openSourceGrant({ branch: wrong, phase: 1, files: [], head: () => wrong }), SourceWriteError);
    }
    // Nor without a way to re-check where HEAD actually is.
    assert.throws(() => openSourceGrant({ branch: branchNameFor('2026-08-13'), phase: 1, files: [] }), SourceWriteError);

    assert.deepEqual(snapshotPaths(dir), ['src/styles.css']);
    globalThis.__phyllumFsHarness?.closeApplyWindow();
  });
});

/**
 * Nothing else in the codebase can reach the source funnel.
 *
 * The grant is the gate, and `apply run` is the only thing that may open one. If
 * a second module could, the promise would become a convention — so this is a
 * grep, and it fails the suite the moment anything else names the funnel.
 */
test('only the apply run module may open a source-write grant', () => {
  const allowed = new Set(['lib/apply-run.js']);
  const offenders = [];
  for (const [file, source] of cliSources()) {
    if (allowed.has(file)) continue;
    for (const name of ['openSourceGrant', 'writeSourceGuarded', 'closeSourceGrant']) {
      if (source.includes(name)) offenders.push(`${file} names ${name}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));

  // And the run module writes source only through the funnel, never directly.
  const run = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'apply-run.js'), 'utf8');
  for (const raw of ['writeFileSync', 'appendFileSync', 'renameSync', 'rmSync', 'createWriteStream', 'mkdirSync']) {
    assert.ok(!run.includes(raw), `apply-run.js must not call ${raw} — the funnel is the only way in`);
  }
  const calls = [...new Set(run.match(/write[A-Z][A-Za-z]*\(/g) ?? [])].sort();
  assert.deepEqual(calls, ['writePrd(', 'writeSourceGuarded('], 'the plan and the phase\'s own files, nothing else');
});

test('the package manager is spawned by resolved path, with an argument array', () => {
  const upgrade = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'upgrade-command.js'), 'utf8');
  const code = upgrade.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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

/**
 * `apply` plans a change to source code (v0.2.0 §6.5.1), which makes it the
 * command with the most to prove. It proves it by the shape of the code: the
 * derivation module cannot write at all, and the command module's writes are
 * exactly two, both named, both through the funnel.
 *
 * The second one is v0.5.0 §3.2's amendment — the `applied:` lines — and the
 * claim moves rather than disappearing. `apply` still opens **no new write
 * target**: `DESIGN-SYSTEM.md` was always the one file Phyllum may write, and
 * `.phyllum/PRD.md` was always inside the state exception. What is new is which
 * command writes the design system, and the one module allowed to is
 * `lib/applied.js`, whose only write is that file and whose only edit is that
 * line — asserted byte for byte in `applied.test.js`.
 */
test('the apply path can plan a codebase change without being able to make one', () => {
  const derivation = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'prd.js'), 'utf8');
  for (const writer of [
    'writeGuarded',
    'mkdirGuarded',
    'writeDesignSystem',
    'writePrd',
    'appendGitignoreLine',
    'writeState',
  ]) {
    assert.ok(!derivation.includes(writer), `lib/prd.js must not name ${writer} — it derives, it does not write`);
  }

  const command = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'apply-command.js'), 'utf8');
  for (const raw of ['writeFileSync', 'appendFileSync', 'renameSync', 'rmSync', 'createWriteStream', 'mkdirSync']) {
    assert.ok(!command.includes(raw), `apply-command.js must not call ${raw} — the funnel is the only way in`);
  }
  // Exactly two writes: the plan, and the flags — in that order, because the
  // plan is the artefact the user consents to.
  const calls = command.match(/write[A-Z][A-Za-z]*\(/g) ?? [];
  assert.deepEqual(
    [...new Set(calls)],
    ['writePrd(', 'writeAppliedFlags('],
    '`apply` writes the plan and the `applied:` lines, and nothing else',
  );
  assert.ok(
    !command.includes('writeDesignSystem'),
    '`apply` does not reach the design-system writer itself — the flag module owns that call',
  );

  // And the flag module is as narrow as the amendment says: one write, one file,
  // and no way to render the file afresh over somebody's own text.
  const applied = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'applied.js'), 'utf8');
  for (const raw of ['writeFileSync', 'appendFileSync', 'renameSync', 'rmSync', 'createWriteStream']) {
    assert.ok(!applied.includes(raw), `applied.js must not call ${raw} — the funnel is the only way in`);
  }
  const flagCalls = applied.match(/write[A-Z][A-Za-z]*\(/g) ?? [];
  assert.deepEqual(
    [...new Set(flagCalls)].filter((call) => call !== 'writeAppliedFlags('),
    ['writeDesignSystem('],
    'the flag module writes the design system, through the funnel, and nothing else',
  );
  assert.ok(
    !/\brender\(/.test(applied),
    'and it edits lines rather than re-rendering the file — a re-render would rewrite prose nobody asked it to touch',
  );

  // And the plan's path is the existing exception, not a new one.
  assert.ok(isAllowedPath('.phyllum/PRD.md'));
  assert.ok(!isAllowedPath('PRD.md', { init: true }), 'a PRD in the project root is never writable');
});

/**
 * An accepted suggestion does write — that is the point of step 5 — so the
 * structural claim moves rather than disappearing: the write lives in one module,
 * behind the acceptance gate, and it goes through the funnel like every other
 * write in Phyllum. No raw filesystem call, and no path but DESIGN-SYSTEM.md.
 */
test('the suggestion tracks write only through the funnel, and only after acceptance', () => {
  const source = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'assess-suggest.js'), 'utf8');

  for (const raw of ['writeFileSync', 'appendFileSync', 'renameSync', 'rmSync', 'createWriteStream']) {
    assert.ok(!source.includes(raw), `assess-suggest.js must not call ${raw} — the funnel is the only way in`);
  }
  assert.match(source, /writeDesignSystem\(root, render\(model\)\)/, 'the one write is the design system file');
  assert.match(
    source,
    /typeof ctx\.confirm !== 'function'/,
    'and it is unreachable without an acceptance gate to answer it',
  );
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

    // No temp file left lying around next to it — the backup taken before the
    // edit is the only other thing on disk.
    assert.deepEqual(snapshotPaths(dir), ['DESIGN-SYSTEM.md', 'DESIGN-SYSTEM.md.bak']);
  });
});

test('an interrupted first write leaves no file at all', async () => {
  await withTempDir(async (dir) => {
    assert.throws(() => writeDesignSystem(dir, 'half', { faultAfterTempWrite: true }));
    assert.deepEqual(snapshotPaths(dir), []);
  });
});

test('the .gitignore append adds Phyllum’s two lines and is idempotent', async () => {
  await withTempDir(async (dir) => {
    // Two lines since v0.2.1: the session directory, and the design system’s
    // pre-edit backup — a local undo buffer nobody should commit (§6.5.2).
    assert.equal(appendGitignoreLine(dir), 'created');
    assert.equal(
      fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'),
      '.phyllum/\nDESIGN-SYSTEM.md.bak\n',
    );
    assert.equal(appendGitignoreLine(dir), 'already-present');
    assert.equal(
      fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'),
      '.phyllum/\nDESIGN-SYSTEM.md.bak\n',
    );
  });
});

test('a .gitignore that already ignores one line gains only the other', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, '.gitignore'), '.phyllum/\n');
    assert.equal(appendGitignoreLine(dir), 'added');
    assert.equal(
      fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'),
      '.phyllum/\nDESIGN-SYSTEM.md.bak\n',
      'the line already there is never written twice',
    );
  });
});

test('the .gitignore append tolerates a file with no trailing newline', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'dist');
    assert.equal(appendGitignoreLine(dir), 'added');
    assert.equal(
      fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'),
      'dist\n.phyllum/\nDESIGN-SYSTEM.md.bak\n',
    );
  });
});
