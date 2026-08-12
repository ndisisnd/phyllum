/**
 * `apply run`, end to end, against real repositories (v0.2.0 plan §6.5.3, §7).
 *
 * The plan asks for exactly this: fixture codebases, and assertions that **branch
 * isolation**, **one commit per phase**, and **every acceptance criterion mapping
 * to a verifiable change** actually hold — not that the code that intends them
 * exists. So every test here makes a git repository in a temp directory, runs the
 * real command through the real dispatcher, and then asks git what happened.
 *
 * Three things make that possible without a model or a network:
 *
 *   - **`PATH: ''`** in the environment, so the route to a model is genuinely
 *     `none`. The honest-degradation path is then the *default* case here rather
 *     than a special one, which is the right way round for a safety test.
 *   - **An injected `runAgent`**, when a test needs the agent path to succeed. It
 *     stands in for the orchestrator and edits the file the way an agent would —
 *     and the run still verifies the result by reading the file, so nothing passes
 *     on the stand-in's word.
 *   - **An injected clock**, for the five-minute status cadence.
 *
 * The fs-diff harness is opened for exactly the source files a run is entitled to
 * write (`openApplyWindow`), and closed afterwards. Outside that window a source
 * write still fails the whole suite, which is what keeps v0.2.0's one deliberate
 * widening visible rather than blanket.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { executeArgv } from '../../lib/execute.js';
import { PRD_FILE } from '../../lib/write.js';
import { branchNameFor } from '../../lib/git.js';
import { PHASE_STOPPED } from '../../lib/prd.js';
import { FIXTURES, copyDir, withTempDir } from './helpers.js';

const TODAY = '2026-08-13';
const BRANCH = branchNameFor(TODAY);
const CODEBASES = path.join(FIXTURES, 'codebases');

/** The environment a run sees: no PATH means no route to a model. */
const NO_MODEL = { PATH: '' };

/** Everything a run needs from the outside, with a fixed date and no model. */
const ctx = (dir, extra = {}) => ({
  cwd: dir,
  today: TODAY,
  home: '/nonexistent',
  env: NO_MODEL,
  ...extra,
});

// ---------------------------------------------------------------------------
// A repository on disk
// ---------------------------------------------------------------------------

function run(dir, args) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

/** A design system with the tokens a fixture uses, and no components. */
function designSystem({ colours, numbers, typography, components = '_No components yet._' } = {}) {
  return [
    '# Design System',
    '',
    "> Phyllum manages this file. It is the single source of truth for this project's design system.",
    '',
    '- Project: e2e',
    '- Phyllum version: 0.2.0',
    '- Created: 2026-08-13',
    '',
    '## Tokens',
    '',
    '### Colours',
    '',
    '| token | value | notes |',
    '| --- | --- | --- |',
    ...colours,
    '',
    '### Numbers',
    '',
    '| token | value | applies to |',
    '| --- | --- | --- |',
    ...numbers,
    '',
    '### Typography',
    '',
    '| token | size | weight | line-height |',
    '| --- | --- | --- | --- |',
    ...typography,
    '',
    '## Components',
    '',
    components,
    '',
    '## Backlog',
    '',
    '_Nothing outstanding._',
    '',
  ].join('\n');
}

/** Tokens that name exactly what MECHANICAL_CSS contains, and nothing else. */
const MECHANICAL_SYSTEM = designSystem({
  colours: ['| color-primary | #2563EB | main brand blue |', '| color-surface | #FFFFFF | page background |'],
  numbers: ['| rounded-md | 12px | corner radius |'],
  typography: ['| body-base | 15px | 400 | 1.5 |'],
});

const MECHANICAL_CSS = [
  '.btn {',
  '  border-radius: 12px;',
  '  padding: 8px;',
  '}',
  '',
  '.btn--primary {',
  '  background: #2563EB;',
  '  color: #FFFFFF;',
  '}',
  '',
].join('\n');

/** The same, plus a typography token the fixture actually uses — an agent job. */
const TYPOGRAPHY_SYSTEM = designSystem({
  colours: ['| color-primary | #2563EB | main brand blue |'],
  numbers: ['| rounded-md | 12px | corner radius |'],
  typography: ['| highlight-small | 14px | 700 | 1.3 |'],
});

const TYPOGRAPHY_CSS = ['.btn {', '  background: #2563EB;', '  font-size: 14px;', '  font-weight: 700;', '}', ''].join('\n');

/**
 * A git repository with a design system, a codebase, and one commit.
 *
 * The `.phyllum/` line is in `.gitignore` from the start, exactly as `init` leaves
 * it, so the plan itself never shows up in a phase's diff.
 */
async function project(body, { files, system, harness = null, windows = [] } = {}) {
  return withTempDir(async (dir) => {
    for (const [rel, contents] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), contents);
    }
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), system);
    fs.writeFileSync(path.join(dir, '.gitignore'), '.phyllum/\n');
    if (harness) fs.writeFileSync(path.join(dir, harness), '# instructions\n');

    run(dir, ['init', '-q', '-b', 'main']);
    run(dir, ['config', 'user.email', 'tests@phyllum.invalid']);
    run(dir, ['config', 'user.name', 'Phyllum Tests']);
    run(dir, ['add', '-A']);
    run(dir, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'initial']);

    globalThis.__phyllumFsHarness?.openApplyWindow(windows);
    try {
      return await body(dir);
    } finally {
      globalThis.__phyllumFsHarness?.closeApplyWindow();
    }
  });
}

const readPrd = (dir) => fs.readFileSync(path.join(dir, PRD_FILE), 'utf8');
const readFile = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const commitsOn = (dir, branch) => run(dir, ['log', '--format=%h %s', branch]).split('\n').filter((line) => line !== '');
const filesInCommit = (dir, ref) => run(dir, ['show', '--name-only', '--format=', ref]).split('\n').filter((line) => line !== '');

// ---------------------------------------------------------------------------
// The whole path: plan, then run
// ---------------------------------------------------------------------------

test('a wholly mechanical plan runs to completion, one commit per phase, on its own branch', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      const before = run(dir, ['rev-parse', 'main']);

      const result = await executeArgv(['apply', 'run'], ctx(dir));
      assert.equal(result.code, 0);

      // Branch isolation: the user's branch is byte for byte where it was.
      assert.equal(run(dir, ['rev-parse', 'main']), before);
      assert.equal(run(dir, ['show', 'main:src/styles.css']), MECHANICAL_CSS.trim());
      assert.equal(run(dir, ['symbolic-ref', '--short', 'HEAD']), BRANCH);

      // One commit per phase, and each one touches only the criteria's file.
      const commits = commitsOn(dir, BRANCH);
      assert.equal(commits.length, 3, `expected initial + two phases, got:\n${commits.join('\n')}`);
      assert.match(commits[0], /phyllum apply: Phase 2 — Number tokens/);
      assert.match(commits[1], /phyllum apply: Phase 1 — Colour tokens/);
      for (const ref of [`${BRANCH}`, `${BRANCH}~1`]) {
        assert.deepEqual(filesInCommit(dir, ref), ['src/styles.css']);
      }

      // Every criterion maps to a verifiable change in the file.
      const css = readFile(dir, 'src/styles.css');
      assert.match(css, /background: var\(--color-primary\);/);
      assert.match(css, /color: var\(--color-surface\);/);
      assert.match(css, /border-radius: var\(--rounded-md\);/);
      assert.match(css, /--color-primary: #2563EB;/, 'and the token it now reads is declared');
      assert.match(css, /padding: 8px;/, 'while a value no token names is left alone');

      // The plan records what happened, and the working tree is clean.
      const prd = readPrd(dir);
      assert.match(prd, /- \[x\] Phase 1 complete/);
      assert.match(prd, /- \[x\] Phase 2 complete/);
      assert.match(prd, /- Commit: [0-9a-f]{7,}/);
      assert.match(prd, /- Status: complete/);
      assert.ok(!/- \[ \] \*\*AC-/.test(prd), 'every criterion is ticked');
      assert.equal(run(dir, ['status', '--porcelain']), '');

      // And the report says who did what.
      assert.match(result.out, /Mechanical, in Node: 3 criteria/);
      assert.match(result.out, /Orchestrated: 0 criteria/);
      assert.match(result.out, /Phase 1 — Colour tokens: complete · commit /);
      assert.match(result.out, /Complete/);
      assert.match(result.out, /Your own branch was not written to/);
    },
    { files: { 'src/styles.css': MECHANICAL_CSS }, system: MECHANICAL_SYSTEM, windows: ['src/styles.css'] },
  );
});

test('a second run on a finished plan does nothing and says so', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      await executeArgv(['apply', 'run'], ctx(dir));
      const commits = commitsOn(dir, BRANCH).length;

      const again = await executeArgv(['apply', 'run'], ctx(dir));
      assert.match(again.out, /already marked complete/);
      assert.equal(commitsOn(dir, BRANCH).length, commits, 'and no empty commit is made');
    },
    { files: { 'src/styles.css': MECHANICAL_CSS }, system: MECHANICAL_SYSTEM, windows: ['src/styles.css'] },
  );
});

// ---------------------------------------------------------------------------
// Honest degradation: no model
// ---------------------------------------------------------------------------

test('with no model reachable, a mixed phase stops and names the model it needed', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      const result = await executeArgv(['apply', 'run'], ctx(dir));

      // Nothing was committed, because the phase is not whole.
      assert.equal(commitsOn(dir, BRANCH).length, 1);

      // The plan records where it stopped, and what is already done.
      const prd = readPrd(dir);
      assert.match(prd, /- Stopped: needs claude-opus-4-8 via the `claude` CLI/);
      assert.ok(!/- \[x\] Phase 1 complete/.test(prd), 'and the phase is not marked complete');
      assert.match(prd, /- \[x\] \*\*AC-1\.1\*\*/, 'the mechanical criterion is ticked');
      assert.match(prd, /- \[ \] \*\*AC-1\.2\*\*/, 'the one that needed a model is not');
      assert.match(prd, /- Status: in progress/);

      // The mechanical work is in the working tree, uncommitted and not lost.
      assert.match(readFile(dir, 'src/styles.css'), /background: var\(--color-primary\)/);
      assert.match(readFile(dir, 'src/styles.css'), /#2564EC/, 'and the drift value is untouched');
      assert.notEqual(run(dir, ['status', '--porcelain']), '');

      // The report degrades honestly, and says how to fix it.
      assert.match(result.out, /AC-1\.2 needs an agent: the literal is only near-identical/);
      assert.match(result.out, /done and ticked, but uncommitted/);
      assert.match(result.out, /Install Claude Code/);
      assert.match(result.out, /picks up from the first un-ticked phase/);
      assert.match(result.out, /Mechanical, in Node: 2 criteria/);
    },
    {
      files: {
        'src/styles.css': fs.readFileSync(path.join(CODEBASES, 'react-css', 'src', 'styles.css'), 'utf8'),
        'src/Button.jsx': fs.readFileSync(path.join(CODEBASES, 'react-css', 'src', 'Button.jsx'), 'utf8'),
        'package.json': '{"name":"e2e","private":true,"dependencies":{"react":"^18.2.0"}}',
      },
      system: fs.readFileSync(path.join(FIXTURES, 'design-system', 'apply-target.md'), 'utf8'),
      windows: ['src/styles.css', 'src/Button.jsx'],
    },
  );
});

// ---------------------------------------------------------------------------
// The agent path, without a model
// ---------------------------------------------------------------------------

/** An orchestrator stand-in: it makes the edit a typography phase would need. */
function typographyAgent(dir) {
  return async ({ files }) => {
    const rel = files[0];
    const target = path.join(dir, rel);
    const before = fs.readFileSync(target, 'utf8');
    const after = before
      .replace('font-size: 14px;', 'font-size: var(--highlight-small-size);')
      .replace(':root {', ':root {\n  --highlight-small-size: 14px;');
    fs.writeFileSync(target, after.includes('--highlight-small-size: 14px') ? after : `:root {\n  --highlight-small-size: 14px;\n}\n\n${after}`);
    return { ok: true, output: 'done' };
  };
}

test('an orchestrated phase is still verified by reading the file', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      const result = await executeArgv(['apply', 'run'], ctx(dir, { runAgent: typographyAgent(dir) }));

      const prd = readPrd(dir);
      assert.match(prd, /- Status: complete/);
      assert.match(result.out, /Orchestrated: 1 criterion/);
      assert.match(result.out, /Complete/);

      // Two phases, two commits — the typography one included.
      const commits = commitsOn(dir, BRANCH);
      assert.equal(commits.length, 3, commits.join('\n'));
      assert.match(commits[0], /Phase 2 — Typography tokens/);
      assert.ok(!readFile(dir, 'src/styles.css').includes('font-size: 14px'));
    },
    { files: { 'src/styles.css': TYPOGRAPHY_CSS }, system: TYPOGRAPHY_SYSTEM, windows: ['src/styles.css'] },
  );
});

test('an agent that reports success without doing the work does not get a tick', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      const lying = async () => ({ ok: true, output: 'all done!' });
      const result = await executeArgv(['apply', 'run'], ctx(dir, { runAgent: lying }));

      // The colour phase is mechanical and lands; the typography phase does not.
      const commits = commitsOn(dir, BRANCH);
      assert.equal(commits.length, 2, commits.join('\n'));
      assert.match(readPrd(dir), /- Stopped: AC-2\.1 is not satisfied — a raw 14px is still on font-size/);
      assert.match(result.out, /stopped: AC-2\.1 is not satisfied/);
      assert.match(result.out, /Nothing was rolled back or thrown away\./);
    },
    { files: { 'src/styles.css': TYPOGRAPHY_CSS }, system: TYPOGRAPHY_SYSTEM, windows: ['src/styles.css'] },
  );
});

test('an edit outside the phase’s criteria stops the phase and is left uncommitted', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      const strays = async ({ files }) => {
        await typographyAgent(dir)({ files });
        fs.writeFileSync(path.join(dir, 'src', 'unrelated.css'), '.x { color: red; }\n');
        return { ok: true, output: 'done, and a bit more' };
      };
      const result = await executeArgv(['apply', 'run'], ctx(dir, { runAgent: strays }));

      assert.match(result.out, /changed 1 file its criteria do not name \(src\/unrelated\.css\)/);
      assert.match(readPrd(dir), /- Stopped: this phase changed 1 file its criteria do not name/);
      // The stray file is still there — nothing is rolled back — but no commit
      // contains it, which is what makes one-phase-one-commit true.
      assert.ok(fs.existsSync(path.join(dir, 'src', 'unrelated.css')));
      for (const commit of commitsOn(dir, BRANCH)) {
        const [ref] = commit.split(' ');
        assert.ok(!filesInCommit(dir, ref).includes('src/unrelated.css'));
      }
    },
    { files: { 'src/styles.css': TYPOGRAPHY_CSS }, system: TYPOGRAPHY_SYSTEM, windows: ['src/styles.css', 'src/unrelated.css'] },
  );
});

// ---------------------------------------------------------------------------
// The host project's own suite, and resuming
// ---------------------------------------------------------------------------

test('a red host suite stops the phase before it commits, and a resume finishes it', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));

      const red = () => ({ ran: true, ok: false, why: null, command: 'npm test', output: '1 failing' });
      const first = await executeArgv(['apply', 'run'], ctx(dir, { runTests: red }));
      assert.equal(commitsOn(dir, BRANCH).length, 1, 'nothing lands while the suite is red');
      assert.match(readPrd(dir), /- Stopped: `npm test` — this project's own test suite — is not green/);
      assert.match(first.out, /is not green/);

      const green = () => ({ ran: true, ok: true, why: null, command: 'npm test', output: '' });
      const second = await executeArgv(['apply', 'run'], ctx(dir, { runTests: green }));
      assert.equal(commitsOn(dir, BRANCH).length, 3, 'and the resume lands both phases');
      const prd = readPrd(dir);
      assert.match(prd, /- Status: complete/);
      // The record itself, not the verification block that quotes its shape.
      const stopRecords = prd.split('\n').filter((line) => PHASE_STOPPED.test(line.trim()));
      assert.deepEqual(stopRecords, [], 'the stop record is cleared once the phase passes');
      assert.match(second.out, /`npm test` ran and was green/);
      assert.match(second.out, /resumed, not recreated/);
    },
    {
      files: { 'src/styles.css': MECHANICAL_CSS, 'package.json': '{"name":"e2e","scripts":{"test":"exit 0"}}' },
      system: MECHANICAL_SYSTEM,
      windows: ['src/styles.css'],
    },
  );
});

// ---------------------------------------------------------------------------
// Git preflight
// ---------------------------------------------------------------------------

test('a dirty working tree is refused before any branch is made', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      fs.writeFileSync(path.join(dir, 'src', 'styles.css'), `${MECHANICAL_CSS}/* mine */\n`);

      const result = await executeArgv(['apply', 'run'], ctx(dir));
      assert.match(result.out, /uncommitted changes/);
      assert.match(result.out, /src\/styles\.css/);
      assert.match(result.out, /Nothing was written and nothing was executed/);
      assert.equal(run(dir, ['symbolic-ref', '--short', 'HEAD']), 'main');
      assert.equal(run(dir, ['branch', '--list', BRANCH]), '', 'and no work branch was created');
      assert.match(readFile(dir, 'src/styles.css'), /\/\* mine \*\//, 'the edit is untouched');
    },
    { files: { 'src/styles.css': MECHANICAL_CSS }, system: MECHANICAL_SYSTEM, windows: ['src/styles.css'] },
  );
});

test('a project that is not a repository is refused with the fix', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'styles.css'), MECHANICAL_CSS);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), MECHANICAL_SYSTEM);
    await executeArgv(['apply'], ctx(dir));

    const result = await executeArgv(['apply', 'run'], ctx(dir));
    assert.match(result.out, /not a git repository/);
    assert.match(result.out, /`git init`/);
    assert.equal(readFile(dir, 'src/styles.css'), MECHANICAL_CSS, 'and not one byte was written');
  });
});

// ---------------------------------------------------------------------------
// The hand-off, and the stale gate
// ---------------------------------------------------------------------------

test('a project with its own harness config gets instructions, not a run', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      const before = readFile(dir, 'src/styles.css');

      const result = await executeArgv(['apply', 'run'], ctx(dir));
      assert.match(result.out, /handing over to your harness/);
      assert.match(result.out, /This project uses Claude Code/);
      assert.match(result.out, /Execute \.phyllum\/PRD\.md phase by phase/);
      assert.equal(readFile(dir, 'src/styles.css'), before, 'nothing was written');
      assert.equal(run(dir, ['symbolic-ref', '--short', 'HEAD']), 'main', 'and no branch was made');
      assert.equal(run(dir, ['branch', '--list', BRANCH]), '');
    },
    {
      files: { 'src/styles.css': MECHANICAL_CSS },
      system: MECHANICAL_SYSTEM,
      harness: 'CLAUDE.md',
      windows: ['src/styles.css'],
    },
  );
});

test('a stale plan needs an explicit continue, and refuses without one', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      // The design system moves after the plan was written: a token disappears,
      // so a criterion in the plan no longer describes anything.
      fs.writeFileSync(
        path.join(dir, 'DESIGN-SYSTEM.md'),
        designSystem({
          colours: ['| color-primary | #2563EB | main brand blue |'],
          numbers: ['| rounded-md | 12px | corner radius |'],
          typography: ['| body-base | 15px | 400 | 1.5 |'],
        }),
      );
      run(dir, ['add', '-A']);
      run(dir, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'drop a token']);

      const refused = await executeArgv(['apply', 'run'], ctx(dir));
      assert.match(refused.out, /the plan no longer matches this codebase/);
      assert.match(refused.out, /`phyllum apply`        refresh the plan/);
      assert.equal(run(dir, ['branch', '--list', BRANCH]), '', 'nothing ran');

      // With a person saying yes, it runs anyway — the gate is a question, not a wall.
      const proceeded = await executeArgv(['apply', 'run'], ctx(dir, { confirm: async () => true }));
      assert.match(proceeded.out, /phyllum apply run/);
      assert.equal(run(dir, ['symbolic-ref', '--short', 'HEAD']), BRANCH);
    },
    { files: { 'src/styles.css': MECHANICAL_CSS }, system: MECHANICAL_SYSTEM, windows: ['src/styles.css'] },
  );
});

// ---------------------------------------------------------------------------
// The five-minute cadence, during a real run
// ---------------------------------------------------------------------------

test('a long run reports every five minutes of wall clock, not once per phase', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));

      // A clock that advances four minutes per read: reports fall due mid-run,
      // and the run never waits a real second for them.
      let at = 0;
      const reports = [];
      const result = await executeArgv(
        ['apply', 'run'],
        ctx(dir, { now: () => (at += 240_000), onReport: (line) => reports.push(line) }),
      );

      assert.ok(reports.length >= 2, `expected several reports, got ${reports.length}`);
      assert.match(reports[0], /phyllum apply run · Phase \d of \d — .+ · \d+\/\d+ criteria · elapsed \d+m\d\ds/);
      assert.deepEqual(reports, result.reports);
      assert.match(result.out, /Status reports: \d+ reports emitted on the 5m00s cadence/);
    },
    { files: { 'src/styles.css': MECHANICAL_CSS }, system: MECHANICAL_SYSTEM, windows: ['src/styles.css'] },
  );
});
