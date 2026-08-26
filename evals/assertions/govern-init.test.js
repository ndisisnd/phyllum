/**
 * `govern init` — the enforcement plumbing (v0.12.0 phase 5).
 *
 * The mode makes one promise, and it is the promise the acceptance criterion is
 * written in: **the user names the pieces — the pre-commit hook, the CI
 * workflow, or both — and exactly those pieces are installed.** A promise phrased
 * that way is only worth having if the choice is checked rather than described,
 * so most of this file is about the ways a run could have installed something
 * nobody asked for and does not.
 *
 * Five groups, each one a way the mode could have gone wrong quietly:
 *
 *   1. **The pieces and the generated files come from the reference.** Both
 *      files are rendered from `phyllum:init-files`, line by line, and what they
 *      run is a command the CLI ships today.
 *   2. **Nothing installs without a stated choice.** No default, no "both since
 *      you did not say", and no word outside the closed list.
 *   3. **The plan writes nothing, and the run installs only what was chosen.**
 *   4. **An occupied path is a question, not a merge.** Somebody else's hook
 *      survives a run, and a re-run of Phyllum's own writes nothing.
 *   5. **The write lands inside the permission model, on two names and no more.**
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { DISPATCHABLE } from '../../lib/registry.js';
import {
  InitChoiceError,
  InitConflictError,
  copyLine,
  enforcementPaths,
  fillLine,
  hasHooksDir,
  initPieceFor,
  initPieces,
  normaliseChoice,
  parseGovernInitSpec,
  pieceNames,
  planInit,
  renderPiece,
  writeEnforcement,
} from '../../lib/govern-init.js';
import { ENFORCEMENT_FILES, HOOK_FILE, WORKFLOW_FILE, isAllowedPath } from '../../lib/write.js';
import { snapshotPaths, withTempDir } from './helpers.js';

/** A project with a repository in it — the hook needs somewhere to go. */
function withRepo(body) {
  return withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true });
    await body(dir);
  });
}

// ---------------------------------------------------------------------------
// 1. The reference is the source
// ---------------------------------------------------------------------------

test('the pieces are the table, and each one names a path the funnel admits', () => {
  assert.deepEqual(pieceNames(), ['hook', 'workflow']);
  assert.deepEqual(
    initPieces().map((row) => row.path),
    ENFORCEMENT_FILES,
    'the reference and the funnel must name the same two files',
  );
  assert.deepEqual(enforcementPaths(), [HOOK_FILE, WORKFLOW_FILE]);
  // Neither piece blocks, and the reference is where that is stated.
  for (const row of initPieces()) assert.equal(row.blocks, false, `${row.piece} must not block`);
});

test('what the generated files run is a command the CLI actually ships', () => {
  // The never-invent rule with a shell prompt attached: a hook naming a
  // subcommand that does not exist is a broken file in somebody's repository.
  assert.ok(
    DISPATCHABLE.some((command) => command.name === 'assess'),
    'assess is the command both pieces run, and it is dispatchable today',
  );
  const hook = renderPiece('hook');
  const workflow = renderPiece('workflow');
  assert.match(hook, /^phyllum assess drift$/m);
  assert.match(workflow, /npx --yes phyllum assess score$/m);
  assert.match(workflow, /npx --yes phyllum assess drift$/m);
});

test('the hook is a shell script that exits zero whatever it reads', () => {
  const hook = renderPiece('hook');
  assert.ok(hook.startsWith('#!/bin/sh\n'), 'a hook without a shebang is a hook git cannot run');
  assert.ok(hook.endsWith('exit 0\n'), 'the last line decides the hook’s status, and it is zero');
  // The missing-tool guard steps aside rather than standing between somebody and
  // their own commit.
  assert.match(hook, /command -v phyllum/);
  assert.ok(!/exit 1/.test(hook), 'nothing in the hook can fail a commit');
});

test('the workflow is indented from the table, not from a renderer', () => {
  const workflow = renderPiece('workflow');
  const lines = workflow.split('\n');
  assert.ok(lines.includes('jobs:'));
  assert.ok(lines.includes('  design-system:'));
  assert.ok(lines.includes('    runs-on: ubuntu-latest'));
  assert.ok(lines.includes('      - uses: actions/checkout@v4'));
  assert.ok(lines.includes('        with:'));
  assert.ok(lines.includes("          node-version: '20'"));
  // A blank line is blank: no generated file carries an indent on a line that
  // holds nothing.
  for (const line of lines) assert.ok(line.trim() !== '' || line === '', `"${line}" is whitespace`);
  assert.ok(!/[ \t]+$/m.test(workflow), 'no trailing whitespace on any line');
});

test('both files render the same bytes twice — the table is the whole input', () => {
  assert.equal(renderPiece('hook'), renderPiece('hook'));
  assert.equal(renderPiece('workflow'), renderPiece('workflow'));
  assert.ok(renderPiece('hook').endsWith('\n'));
  assert.ok(renderPiece('workflow').endsWith('\n'));
});

test('a doctored reference is refused rather than half-read', () => {
  const good = `${'<!-- phyllum:init-pieces -->'}
| Piece | Path | Runs | Blocks | Why |
|---|---|---|---|---|
| \`hook\` | \`.git/hooks/pre-commit\` | drift | no | because |

${'<!-- phyllum:init-files -->'}
| Piece | Indent | Line |
|---|---|---|
| \`hook\` | 0 | echo hi |

${'<!-- phyllum:init-copy -->'}
| Line | Text |
|---|---|
| \`both\` | both |
`;
  assert.equal(parseGovernInitSpec(good).files[0].indent, 0);
  const bad = good.replace('| `hook` | 0 | echo hi |', '| `hook` | soon | echo hi |');
  assert.throws(() => parseGovernInitSpec(bad), /is not an indent/);
  assert.throws(
    () => parseGovernInitSpec(good.replace('<!-- phyllum:init-copy -->', '')),
    /missing the <!-- phyllum:init-copy --> table marker/,
  );
});

// ---------------------------------------------------------------------------
// 2. The choice
// ---------------------------------------------------------------------------

test('a choice names pieces, and an empty one is refused rather than defaulted', () => {
  assert.deepEqual(normaliseChoice('hook'), ['hook']);
  assert.deepEqual(normaliseChoice('workflow'), ['workflow']);
  assert.deepEqual(normaliseChoice('both'), ['hook', 'workflow']);
  assert.deepEqual(normaliseChoice(['workflow', 'hook']), ['hook', 'workflow'], 'table order, always');
  assert.deepEqual(normaliseChoice('hook,workflow'), ['hook', 'workflow']);
  assert.deepEqual(normaliseChoice('HOOK'), ['hook']);

  for (const nothing of [undefined, null, '', '   ', [], ['']]) {
    assert.throws(() => normaliseChoice(nothing), InitChoiceError);
  }
  assert.throws(() => normaliseChoice('everything'), /is not a piece/);
  assert.throws(() => normaliseChoice(['hook', 'husky']), /is not a piece/);
});

test('a run with no choice installs nothing at all', async () => {
  await withRepo(async (dir) => {
    assert.throws(() => writeEnforcement(dir), InitChoiceError);
    assert.throws(() => planInit(dir, ''), InitChoiceError);
    assert.deepEqual(snapshotPaths(dir), [], 'not one file, not one directory');
  });
});

test('an unknown piece is refused by name, with the pieces listed', () => {
  const error = (() => {
    try {
      normaliseChoice('husky');
      return null;
    } catch (thrown) {
      return thrown;
    }
  })();
  assert.ok(error instanceof InitChoiceError);
  assert.equal(error.piece, 'husky');
  assert.equal(error.message, fillLine(copyLine('unknown-piece'), { piece: 'husky', pieces: 'hook, workflow' }));
});

// ---------------------------------------------------------------------------
// 3. The plan, and the run
// ---------------------------------------------------------------------------

test('the plan derives the whole run and writes nothing', async () => {
  await withRepo(async (dir) => {
    const plan = planInit(dir, 'both');
    assert.deepEqual(plan.chosen, ['hook', 'workflow']);
    assert.equal(plan.writes, true);
    assert.deepEqual(plan.pieces.map((piece) => piece.path), ENFORCEMENT_FILES);
    for (const piece of plan.pieces) {
      assert.equal(piece.writes, true);
      assert.equal(piece.reason, null);
      assert.equal(piece.contents, renderPiece(piece.piece));
    }
    assert.deepEqual(snapshotPaths(dir), [], 'a plan is a proposal, not a write');
  });
});

test('the chosen piece is installed, and the one not chosen is not', async () => {
  await withRepo(async (dir) => {
    const result = writeEnforcement(dir, 'workflow');
    assert.deepEqual(result.written, [WORKFLOW_FILE]);
    assert.deepEqual(snapshotPaths(dir), [WORKFLOW_FILE]);
    assert.equal(fs.readFileSync(path.join(dir, WORKFLOW_FILE), 'utf8'), renderPiece('workflow'));
  });
});

test('both pieces land where the reference says, and nowhere else', async () => {
  await withRepo(async (dir) => {
    const result = writeEnforcement(dir, 'both');
    assert.deepEqual(result.written, ENFORCEMENT_FILES);
    assert.deepEqual(snapshotPaths(dir).sort(), [...ENFORCEMENT_FILES].sort());
    assert.equal(fs.readFileSync(path.join(dir, HOOK_FILE), 'utf8'), renderPiece('hook'));
  });
});

test('the hook is written executable — one git will actually run', async () => {
  await withRepo(async (dir) => {
    writeEnforcement(dir, 'hook');
    const mode = fs.statSync(path.join(dir, HOOK_FILE)).mode;
    assert.ok(mode & 0o100, 'a hook without the execute bit is one git silently ignores');
    // The workflow is read by a service, not executed, and is left alone.
    writeEnforcement(dir, 'workflow');
    assert.ok(!(fs.statSync(path.join(dir, WORKFLOW_FILE)).mode & 0o100));
  });
});

test('a project that is not a repository gets the workflow and a stated reason', async () => {
  await withTempDir(async (dir) => {
    assert.equal(hasHooksDir(dir), false);
    const plan = planInit(dir, 'both');
    const hook = plan.pieces.find((piece) => piece.piece === 'hook');
    assert.equal(hook.writes, false);
    assert.equal(hook.blocked, true);
    assert.equal(hook.reason, copyLine('not-a-repo'));

    const result = writeEnforcement(dir, 'both');
    assert.deepEqual(result.written, [WORKFLOW_FILE], 'the half that could be installed was');
    assert.deepEqual(snapshotPaths(dir), [WORKFLOW_FILE]);
    assert.ok(!fs.existsSync(path.join(dir, '.git')), 'and no repository was created on the way');
  });
});

// ---------------------------------------------------------------------------
// 4. Rerunnability, and somebody else's file
// ---------------------------------------------------------------------------

test('a second run writes nothing and says so', async () => {
  await withRepo(async (dir) => {
    writeEnforcement(dir, 'both');
    const before = fs.statSync(path.join(dir, HOOK_FILE)).mtimeMs;

    const again = writeEnforcement(dir, 'both');
    assert.deepEqual(again.written, []);
    assert.equal(again.writes, false);
    for (const piece of again.pieces) {
      assert.equal(piece.unchanged, true);
      assert.equal(piece.reason, fillLine(copyLine('unchanged'), { path: piece.path }));
    }
    assert.equal(fs.statSync(path.join(dir, HOOK_FILE)).mtimeMs, before, 'identical bytes are not rewritten');
  });
});

test("a hook Phyllum did not write survives the run, and the run says why", async () => {
  await withRepo(async (dir) => {
    const theirs = '#!/bin/sh\nnpm run lint\n';
    fs.writeFileSync(path.join(dir, HOOK_FILE), theirs);

    const plan = planInit(dir, 'hook');
    const piece = plan.pieces[0];
    assert.equal(piece.writes, false);
    assert.equal(piece.conflict, true);
    assert.equal(piece.reason, fillLine(copyLine('conflict'), { path: HOOK_FILE }));

    assert.throws(() => writeEnforcement(dir, 'hook'), InitConflictError);
    assert.equal(fs.readFileSync(path.join(dir, HOOK_FILE), 'utf8'), theirs, 'untouched');
  });
});

test('a conflict blocks its own piece and no other', async () => {
  await withRepo(async (dir) => {
    fs.writeFileSync(path.join(dir, HOOK_FILE), '#!/bin/sh\nexit 0\n');
    // The whole run refuses rather than installing half of what was asked for:
    // the user is answering a question about the hook before anything happens.
    assert.throws(() => writeEnforcement(dir, 'both'), InitConflictError);
    assert.deepEqual(snapshotPaths(dir), [HOOK_FILE]);

    // With the replacement stated, by piece, the run goes through.
    const result = writeEnforcement(dir, 'both', { replace: 'hook' });
    assert.deepEqual(result.written, ENFORCEMENT_FILES);
    assert.equal(fs.readFileSync(path.join(dir, HOOK_FILE), 'utf8'), renderPiece('hook'));
  });
});

test('replacement is stated per piece — naming one does not unlock the other', async () => {
  await withRepo(async (dir) => {
    fs.writeFileSync(path.join(dir, HOOK_FILE), 'theirs\n');
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(dir, WORKFLOW_FILE), 'theirs\n');

    assert.throws(() => writeEnforcement(dir, 'both', { replace: 'hook' }), InitConflictError);
    assert.equal(fs.readFileSync(path.join(dir, WORKFLOW_FILE), 'utf8'), 'theirs\n');
    assert.equal(fs.readFileSync(path.join(dir, HOOK_FILE), 'utf8'), 'theirs\n', 'nothing at all was written');
  });
});

// ---------------------------------------------------------------------------
// 5. The permission model
// ---------------------------------------------------------------------------

test('the two names are init-only, and matched by name rather than by directory', () => {
  for (const rel of ENFORCEMENT_FILES) {
    assert.ok(isAllowedPath(rel, { init: true }), `${rel} is what the mode installs`);
    assert.ok(!isAllowedPath(rel), `${rel} is not writable outside a setup step`);
  }
  for (const near of [
    '.git/hooks/pre-push',
    '.git/hooks/pre-commit.sample',
    '.git/config',
    '.git/HEAD',
    '.github/workflows/ci.yml',
    '.github/workflows/phyllum.yaml',
    '.github/dependabot.yml',
    'hooks/pre-commit',
  ]) {
    assert.ok(!isAllowedPath(near, { init: true }), `${near} must never be writable`);
  }
});

test('the mode never reaches the general funnel itself', () => {
  const source = fs.readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'lib', 'govern-init.js'),
    'utf8',
  );
  for (const raw of ['writeFileSync', 'appendFileSync', 'renameSync', 'rmSync', 'chmodSync', 'mkdirSync']) {
    assert.ok(!source.includes(raw), `govern-init.js must not call ${raw} — the funnel is the only way in`);
  }
  const calls = [...new Set(source.match(/write[A-Z][A-Za-z]*\(/g) ?? [])]
    .filter((call) => call !== 'writeEnforcement(')
    .sort();
  assert.deepEqual(calls, ['writeEnforcementFile('], 'one writer, and it is the narrow one');
});
