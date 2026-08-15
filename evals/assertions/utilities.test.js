/**
 * Assertions for the three utilities (v0.2.1 plan §6.5, §9).
 *
 * None of them changes what the assessment finds. They change how its results
 * move, how safely the one file Phyllum writes is edited, and what the read verb
 * is called — which makes all three pure assertion territory, with nothing for a
 * model to judge. The plan names four properties, and each has a section here:
 *
 *   1. `--json` output parses, and byte-matches across two identical runs.
 *   2. Every write path leaves a `.bak` whose content equals the pre-edit file.
 *   3. A failed backup provably aborts the edit.
 *   4. `display` and `system` output is byte-for-byte identical, per scope.
 *
 * The third is the one worth being strict about. A backup that is *usually*
 * taken is not a safety net, it is a story about one — so the failure is
 * injected rather than reasoned about, and the design system is compared byte
 * for byte afterwards.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { assess } from '../../lib/assess.js';
import { runAssess, extractJsonFlag } from '../../lib/assess-command.js';
import {
  DEFAULT_JSON_PATH,
  SCHEMA_VERSION,
  assessmentJson,
  serialiseAssessment,
} from '../../lib/assess-json.js';
import { emptyModel, parse } from '../../lib/design-system.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { DISPATCHABLE, SCOPES, resolveCommand } from '../../lib/registry.js';
import {
  BACKUP_FILE,
  BackupError,
  DESIGN_SYSTEM_FILE,
  PermissionError,
  isAllowedJsonPath,
  isAllowedPath,
  writeDesignSystem,
  writeGuarded,
} from '../../lib/write.js';
import {
  FIXTURES,
  POPULATED_FIXTURE,
  copyDir,
  diffSnapshots,
  readFixture,
  snapshotContents,
  snapshotPaths,
  withTempDir,
} from './helpers.js';

const codebase = (name) => path.join(FIXTURES, 'codebases', name);
const DRIFT = codebase('dark-drift');

const read = (dir, rel = DESIGN_SYSTEM_FILE) => fs.readFileSync(path.join(dir, rel), 'utf8');

/** A copy of the drifted fixture, design system and all, to run commands in. */
async function withDrift(body) {
  return withTempDir(async (dir) => {
    copyDir(DRIFT, dir);
    return body(dir);
  });
}

/** A project with a design system and nothing else. */
async function withSystem(body, fixture = POPULATED_FIXTURE) {
  return withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), readFixture(fixture));
    return body(dir);
  });
}

// ---------------------------------------------------------------------------
// `assess --json` (§6.5.1)
// ---------------------------------------------------------------------------

test('the flag is pulled out of the arguments, in both spellings', () => {
  const tokens = (line) => tokenizeLine(line);
  assert.deepEqual(extractJsonFlag(tokens('--json')), { args: [], json: true, path: null });
  assert.deepEqual(extractJsonFlag(tokens('--json out/a.json')), {
    args: [],
    json: true,
    path: 'out/a.json',
  });
  assert.deepEqual(extractJsonFlag(tokens('--json=out/a.json')), {
    args: [],
    json: true,
    path: 'out/a.json',
  });
  const scoped = extractJsonFlag(tokens('--json tokens'));
  assert.equal(scoped.path, null, 'a scope word after the flag is a mode, never a filename');
  assert.deepEqual(scoped.args.map((token) => token.value), ['tokens']);
  assert.equal(extractJsonFlag(tokens('tokens')).json, false);
  assert.equal(extractJsonFlag(tokens('"--json"')).json, false, 'a quoted flag is the literal word');
});

test('`--json` writes the assessment to .phyllum/assess.json by default', async () => {
  await withDrift(async (dir) => {
    const { out, code } = await execute(tokenizeLine('assess --json'), { cwd: dir, env: {} });
    assert.equal(code, 0);
    const file = path.join(dir, DEFAULT_JSON_PATH);
    assert.ok(fs.existsSync(file), 'the default path is inside .phyllum/');
    assert.ok(out.includes(DEFAULT_JSON_PATH), 'and the terminal says where it went');
    assert.ok(out.includes('Drift score'), 'with the headline it came for');
  });
});

test('the file parses, and holds the object the report renders from', async () => {
  await withDrift(async (dir) => {
    await execute(tokenizeLine('assess --json'), { cwd: dir, env: {} });
    const parsed = JSON.parse(read(dir, DEFAULT_JSON_PATH));
    assert.equal(parsed.schemaVersion, SCHEMA_VERSION, 'the version is the first thing readable');
    assert.equal(parsed.readOnly, true);
    assert.equal(parsed.mode, 'assess');
    for (const key of ['detection', 'summary', 'score', 'values', 'hygiene', 'similarity', 'naming', 'props', 'extras']) {
      assert.ok(parsed[key], `${key} is in the file`);
    }
    const live = assess(dir, parse(read(dir)));
    assert.equal(parsed.score.score, live.score.score, 'the same score the report prints');
    assert.equal(parsed.score.verdict, live.score.verdict);
    assert.equal(parsed.values.uncovered.length, live.values.uncovered.length);
  });
});

test('two identical runs write byte-identical files', async () => {
  await withDrift(async (dir) => {
    await execute(tokenizeLine('assess --json'), { cwd: dir, env: {} });
    const first = fs.readFileSync(path.join(dir, DEFAULT_JSON_PATH));
    await execute(tokenizeLine('assess --json'), { cwd: dir, env: {} });
    const second = fs.readFileSync(path.join(dir, DEFAULT_JSON_PATH));
    assert.ok(first.equals(second), 'a diff between two runs is a diff of the codebase');
  });
});

test('nothing machine-specific or clock-dependent is in the file', async () => {
  await withDrift(async (dir) => {
    await execute(tokenizeLine('assess --json'), { cwd: dir, env: {} });
    const text = read(dir, DEFAULT_JSON_PATH);
    assert.ok(!text.includes(dir), 'no absolute path — the same project from two checkouts diffs clean');
    assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(text), 'no timestamp');
    assert.ok(!/"root"/.test(text));
    assert.ok(!/"sightings"/.test(text), 'and not the raw readings already summarised above');
  });
});

test('`--json` writes one file and never enters the review loop', async () => {
  await withDrift(async (dir) => {
    const before = snapshotContents(dir);
    const { code } = await execute(tokenizeLine('assess --json'), {
      cwd: dir,
      env: { CLAUDECODE: '1' },
      ask: async () => {
        throw new Error('--json asked a question');
      },
      confirm: async () => {
        throw new Error('--json asked for consent');
      },
    });
    assert.equal(code, 0);
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.added, [DEFAULT_JSON_PATH], 'one file, and it is the one asked for');
    assert.deepEqual(diff.changed, [], 'DESIGN-SYSTEM.md is not touched');
    assert.deepEqual(diff.removed, []);
  });
});

test('every mode can be written to a file, and says which mode it was', async () => {
  await withDrift(async (dir) => {
    for (const mode of ['tokens', 'components']) {
      await execute(tokenizeLine(`assess --json ${mode}`), { cwd: dir, env: {} });
      assert.equal(JSON.parse(read(dir, DEFAULT_JSON_PATH)).mode, mode);
    }
  });
});

test('a path of your own is written, once the harness is told to expect it', async () => {
  await withDrift(async (dir) => {
    const { openJsonWindow, closeJsonWindow } = globalThis.__phyllumFsHarness;
    // Named the way an `apply run` window is: the path the run is entitled to
    // write, relative to the project.
    openJsonWindow(['reports/assess.json']);
    try {
      const { out, code } = await execute(tokenizeLine('assess --json reports/assess.json'), {
        cwd: dir,
        env: {},
      });
      assert.equal(code, 0);
      assert.ok(out.includes('reports/assess.json'));
      assert.ok(fs.existsSync(path.join(dir, 'reports', 'assess.json')));
    } finally {
      closeJsonWindow();
    }
  });
});

test('the JSON path is checked, not trusted', () => {
  assert.ok(isAllowedJsonPath('out/report.json'));
  assert.ok(isAllowedJsonPath('.phyllum/assess.json'));
  assert.ok(!isAllowedJsonPath('report.txt'), 'it has to be a JSON file');
  assert.ok(!isAllowedJsonPath('DESIGN-SYSTEM.md'), 'and never the design system');
  assert.ok(!isAllowedJsonPath('DESIGN-SYSTEM.md.bak'), 'nor its backup');
  assert.ok(!isAllowedJsonPath('.git/config.json'), 'nor anything inside .git');
  assert.ok(!isAllowedJsonPath('.claude/settings.json'), 'nor the harness’s own settings');
  // And the widening is opt-in: the same path is refused by the ordinary funnel.
  assert.equal(isAllowedPath('out/report.json'), false);
  assert.equal(isAllowedPath('out/report.json', { json: true }), true);
});

test('a refused path stops the run and writes nothing anywhere', async () => {
  await withDrift(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await execute(tokenizeLine('assess --json ../escape.json'), {
      cwd: dir,
      env: {},
    });
    assert.equal(code, 1);
    assert.ok(out.includes('could not write'));
    assert.ok(out.includes('writes one file or none'), 'and it does not quietly pick somewhere else');
    // Since M6 the refusal names the lock that closed rather than reciting the
    // general permission model, which is a rule this user did not break.
    assert.ok(out.includes('resolves outside it'), 'and says which lock closed');
    assert.ok(!out.includes('during init only'), 'not the rule that has nothing to do with --json');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('`assess update --json` is refused, with both halves of the reason', async () => {
  await withDrift(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await execute(tokenizeLine('assess update --json'), { cwd: dir, env: {} });
    assert.equal(code, 1, 'a run that did not do what was asked must not report success');
    assert.ok(out.includes('opposite things'));
    assert.ok(out.includes('`update` accepts'), 'what update does');
    assert.ok(out.includes('`--json` reports'), 'and what --json does');
    assert.ok(out.includes('Run them separately'), 'and how to get both');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('the serialiser is a pure function of the assessment', () => {
  const result = assess(DRIFT, parse(fs.readFileSync(path.join(DRIFT, DESIGN_SYSTEM_FILE), 'utf8')));
  assert.equal(serialiseAssessment(result), serialiseAssessment(result));
  assert.ok(serialiseAssessment(result).endsWith('\n'), 'one trailing newline, as every file here has');
  assert.equal(assessmentJson(result).schemaVersion, SCHEMA_VERSION);
});

// ---------------------------------------------------------------------------
// `DESIGN-SYSTEM.md.bak` (§6.5.2)
// ---------------------------------------------------------------------------

test('a first write has nothing to back up, and takes no backup', async () => {
  await withTempDir(async (dir) => {
    writeDesignSystem(dir, readFixture(POPULATED_FIXTURE));
    assert.deepEqual(snapshotPaths(dir), [DESIGN_SYSTEM_FILE], 'no .bak of a file that did not exist');
  });
});

test('every write path leaves a .bak equal to the file before the edit', async () => {
  // Three of the four writers, each in a project where it has something to
  // write: `assess update` needs a codebase that has drifted, the other two
  // need only the file itself.
  const paths = [
    ['tokenise', 'tokenise "our brand green #16A34A"', withSystem],
    ['create', 'create "button danger with 12px padding-top"', withSystem],
    ['assess update', 'assess update', withDrift],
  ];
  for (const [label, line, inProject] of paths) {
    await inProject(async (dir) => {
      const before = read(dir);
      await execute(tokenizeLine(line), {
        cwd: dir,
        env: {},
        ask: async () => 'y',
        confirm: async () => true,
      });
      assert.notEqual(read(dir), before, `${label} did edit the design system`);
      assert.equal(read(dir, BACKUP_FILE), before, `${label} left the pre-edit file in the backup`);
    });
  }
});

test('the backup is one undo ago, not a history', async () => {
  await withSystem(async (dir) => {
    const first = read(dir);
    writeDesignSystem(dir, `${first}\n<!-- second -->\n`);
    const second = read(dir);
    writeDesignSystem(dir, `${second}\n<!-- third -->\n`);

    assert.equal(read(dir, BACKUP_FILE), second, 'the backup holds the state before the last edit');
    assert.notEqual(read(dir, BACKUP_FILE), first, 'and not the one before that');
    assert.deepEqual(snapshotPaths(dir).sort(), [DESIGN_SYSTEM_FILE, BACKUP_FILE].sort(), 'one file, not a pile');
  });
});

test('a failed backup aborts the edit, and says both halves', async () => {
  await withSystem(async (dir) => {
    const original = read(dir);
    const backup = path.join(dir, BACKUP_FILE);
    // A directory where the backup has to go: the copy cannot be written, and
    // nothing about the design system may change because of it.
    fs.mkdirSync(backup);
    try {
      assert.throws(
        () => writeDesignSystem(dir, '# Something else entirely\n'),
        (error) => {
          assert.ok(error instanceof BackupError);
          assert.ok(error.message.includes(BACKUP_FILE), 'it names the file it could not write');
          assert.ok(error.message.includes('Nothing was changed'), 'and says the edit did not happen');
          return true;
        },
      );
      assert.equal(read(dir), original, 'the design system is byte-identical');
    } finally {
      fs.rmSync(backup, { recursive: true, force: true });
    }
  });
});

test('the backup is taken by the funnel, so no writer can skip it', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'lib', 'write.js'), 'utf8');
  // One definition and one call site, whatever arguments the call carries — M6
  // gave the backup its own fault stages, so the call is no longer bare.
  const takenIn = source.split(/backupDesignSystem\(/).length - 1;
  assert.equal(takenIn, 2, 'one definition, one call — and the call is inside writeGuarded');
  // The `backup` flag is not an escape hatch from the funnel — it is how a
  // caller that writes this file several times in one run (tokenise's queue)
  // says "one backup for the run", and the backup is still taken here.
  assert.match(
    source,
    /if \(rel === DESIGN_SYSTEM_FILE && backup\) backupDesignSystem\(/,
    'in writeGuarded',
  );
  for (const file of ['create.js', 'tokenise.js', 'assess-command.js', 'init.js']) {
    const text = fs.readFileSync(path.join(process.cwd(), 'lib', file), 'utf8');
    assert.ok(!text.includes('.bak'), `${file} does not take a backup of its own`);
  }
});

test('Phyllum’s own state is not backed up — only the file you edit', async () => {
  await withTempDir(async (dir) => {
    writeGuarded(dir, '.phyllum/session.json', '{"version":1}\n');
    writeGuarded(dir, '.phyllum/session.json', '{"version":2}\n');
    assert.deepEqual(snapshotPaths(dir), ['.phyllum/session.json'], 'no .bak of a scratch file');
  });
});

test('the backup is a path the permission model names, not one it tolerates', () => {
  assert.equal(isAllowedPath(BACKUP_FILE), true);
  assert.throws(() => writeGuarded('/tmp/phyllum-nope', 'DESIGN-SYSTEM.md.old', 'x'), PermissionError);
});

// ---------------------------------------------------------------------------
// `display` (§6.5.3)
// ---------------------------------------------------------------------------

test('display is the command and system is its permanent alias', () => {
  const display = resolveCommand('display');
  assert.equal(display.name, 'display');
  assert.deepEqual(display.aliases, ['system']);
  assert.equal(resolveCommand('system'), display, 'one command, two words');
  assert.ok(display.built);
  assert.equal(display.invocation, 'phyllum display', 'and the menu leads with the verb');
});

test('display and system are byte-for-byte identical, at every scope', async () => {
  await withSystem(async (dir) => {
    for (const scope of ['', ...SCOPES]) {
      const a = await execute(tokenizeLine(`display ${scope}`.trim()), { cwd: dir });
      const b = await execute(tokenizeLine(`system ${scope}`.trim()), { cwd: dir });
      assert.equal(b.out, a.out, `"${scope || 'all'}" differed between the two words`);
      assert.equal(b.code, a.code);
    }
  });
});

test('bare display is display all, and both are the whole system', async () => {
  await withSystem(async (dir) => {
    const bare = await execute(tokenizeLine('display'), { cwd: dir });
    const all = await execute(tokenizeLine('display all'), { cwd: dir });
    assert.equal(bare.out, all.out);
    assert.ok(bare.out.includes('Tokens'));
    assert.ok(bare.out.includes('Components'));
    assert.ok(bare.out.includes('Backlog'));
  });
});

test('an unrecognised scope names the word you typed, whichever verb you used', async () => {
  await withSystem(async (dir) => {
    const viaDisplay = await execute(tokenizeLine('display bogus'), { cwd: dir });
    const viaSystem = await execute(tokenizeLine('system bogus'), { cwd: dir });
    assert.ok(viaDisplay.out.includes('`phyllum display`'));
    assert.ok(viaSystem.out.includes('`phyllum system`'));
    for (const scope of SCOPES) assert.ok(viaDisplay.out.includes(scope), 'and lists the valid ones');
  });
});

test('display writes nothing, before or after init', async () => {
  await withTempDir(async (dir) => {
    copyDir(codebase('react-css'), dir);
    const before = snapshotContents(dir);
    const missing = await execute(tokenizeLine('display'), { cwd: dir });
    assert.ok(missing.out.includes('phyllum init'), 'before init it points at init');

    fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), readFixture(POPULATED_FIXTURE));
    await execute(tokenizeLine('display tokens'), { cwd: dir });
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.changed, [], 'a formatted read changes nothing');
    assert.deepEqual(diff.added, [DESIGN_SYSTEM_FILE], 'only the file the test itself wrote');
  });
});

test('help for display and help for system are the same page', async () => {
  const a = await execute(tokenizeLine('help display'), {});
  const b = await execute(tokenizeLine('help system'), {});
  const c = await execute(tokenizeLine('display help'), {});
  assert.equal(b.out, a.out);
  assert.equal(c.out, a.out);
  assert.ok(a.out.includes('alias: system'), 'and it says the old word still works');
});

test('the command table has no orphan: `system` resolves nowhere else', () => {
  const names = DISPATCHABLE.map((command) => command.name);
  assert.ok(names.includes('display'));
  assert.ok(!names.includes('system'), 'system is an alias row, not a second command');
});
