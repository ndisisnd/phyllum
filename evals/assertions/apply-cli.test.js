/**
 * The `apply` command surface (v0.2.0 plan §6.5.1).
 *
 * `apply` is the command that will one day rewrite somebody's source code, so
 * the single most important assertion in this file is a negative one: **running
 * it changes nothing but `.phyllum/PRD.md`.** That is proved the strongest way
 * available here — the whole project directory is snapshotted byte for byte
 * before and after, and any other path in the diff fails the run.
 *
 * The rest is the grammar and the refusals: `run` reserved as a scope word and
 * honestly reported as unbuilt, `--fresh` as the one destructive thing `apply`
 * can do to its own file, and an empty design system answered with the command
 * that fills it rather than an empty plan.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { executeArgv, executeLine } from '../../lib/execute.js';
import { RUN_MILESTONE } from '../../lib/apply-command.js';
import { DISPATCHABLE, resolveCommand } from '../../lib/registry.js';
import { PRD_FILE, isAllowedPath, writePrd } from '../../lib/write.js';
import { renderMenu } from '../../lib/menu.js';
import { renderCommandHelp } from '../../lib/help.js';
import {
  FIXTURES,
  copyDir,
  diffSnapshots,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const CODEBASES = path.join(FIXTURES, 'codebases');
const POPULATED = path.join(FIXTURES, 'design-system', 'populated.md');
const EMPTY = path.join(FIXTURES, 'design-system', 'empty.md');

const ctx = (dir, extra = {}) => ({
  cwd: dir,
  today: '2026-08-13',
  // The user-level memory layer is pinned away from the real home directory:
  // a test must never depend on what is in the machine's `~`.
  home: '/nonexistent-home',
  ...extra,
});

/** A project: a fixture codebase plus a design system, optionally a harness. */
async function project(body, { fixture = 'react-css', designSystem = POPULATED, files = {} } = {}) {
  return withTempDir(async (dir) => {
    copyDir(path.join(CODEBASES, fixture), dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), fs.readFileSync(designSystem, 'utf8'));
    for (const [rel, contents] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), contents);
    }
    return body(dir);
  });
}

const readPrd = (dir) => fs.readFileSync(path.join(dir, PRD_FILE), 'utf8');

// ---------------------------------------------------------------------------
// Registered and reachable
// ---------------------------------------------------------------------------

test('`apply` is a real command, in the menu and in help', () => {
  const command = resolveCommand('apply');
  assert.ok(command, '`apply` must resolve');
  assert.equal(command.built, true);
  assert.equal(command.milestone, 'v0.2.0 M6');
  assert.ok(DISPATCHABLE.includes(command));

  assert.match(renderMenu(), /phyllum apply/);
  const help = renderCommandHelp(command);
  assert.match(help, /--fresh/);
  assert.match(help, /apply run/);
  assert.match(help, /\.phyllum\/PRD\.md/);
  assert.ok(!/Status: not built yet/.test(help), '`apply` itself is built');
});

test('`phyllum apply help` and `phyllum help apply` are the same page', async () => {
  const a = await executeArgv(['apply', 'help'], {});
  const b = await executeArgv(['help', 'apply'], {});
  assert.equal(a.out, b.out);
});

test('`apply` needs a design system before it means anything', async () => {
  await withTempDir(async (dir) => {
    const result = await executeArgv(['apply'], ctx(dir));
    assert.match(result.out, /no DESIGN-SYSTEM\.md/);
    assert.match(result.out, /phyllum init/);
    assert.deepEqual([...snapshotContents(dir).keys()], []);
  });
});

// ---------------------------------------------------------------------------
// The one write, and nothing else
// ---------------------------------------------------------------------------

test('apply writes .phyllum/PRD.md and leaves every other byte alone', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const result = await executeArgv(['apply'], ctx(dir));
    const after = snapshotContents(dir);
    const diff = diffSnapshots(before, after);

    assert.equal(result.code, 0);
    assert.equal(result.written, true);
    assert.deepEqual(diff.added, [PRD_FILE], 'the PRD is the only new file');
    assert.deepEqual(diff.changed, [], 'not one existing file may change');
    assert.deepEqual(diff.removed, [], 'nothing may be removed');
  });
});

test('running it twice converges — the same inputs give the same plan, byte for byte', async () => {
  await project(async (dir) => {
    await executeArgv(['apply'], ctx(dir));
    const before = snapshotContents(dir);
    await executeArgv(['apply'], ctx(dir));

    // Rerunnability is a Phyllum principle, and for a plan it is a strong one:
    // nothing about the second run may differ, including the plan itself.
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('the PRD path needs no new permission — it was already inside `.phyllum/**`', () => {
  assert.ok(isAllowedPath(PRD_FILE), 'the plan lives inside the existing write model');
  assert.equal(PRD_FILE, '.phyllum/PRD.md');
  // And the codebase is still closed, `apply` or no `apply`.
  for (const rel of ['src/Button.jsx', 'src/styles.css', 'package.json', 'PRD.md']) {
    assert.ok(!isAllowedPath(rel, { init: true }), `${rel} must never be writable`);
  }
});

test('apply is mechanical: no ask, no confirm, no network, no model', async () => {
  await project(async (dir) => {
    // Nothing is attached — no ask, no confirm, no fetch. It must still work in
    // full, because a plan the user cannot read before approving is no gate.
    const result = await executeArgv(['apply'], {
      cwd: dir,
      today: '2026-08-13',
      home: '/nonexistent-home',
      fetch: () => {
        throw new Error('`apply` must not touch the network');
      },
      ask: () => {
        throw new Error('`apply` must not ask questions');
      },
      confirm: () => {
        throw new Error('`apply` must not ask for confirmation');
      },
    });
    assert.equal(result.code, 0);
    assert.ok(fs.existsSync(path.join(dir, PRD_FILE)));
  });
});

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

test('the report says who will execute it, what changes, what does not, and that nothing ran', async () => {
  await project(
    async (dir) => {
      const result = await executeArgv(['apply'], ctx(dir));
      assert.match(result.out, /Step 1 — who will execute it/);
      assert.match(result.out, /Harness: Claude Code/);
      assert.match(result.out, /Step 2 — what will change/);
      assert.match(result.out, /Step 3 — what will not change/);
      assert.match(result.out, /Step 4 — verification, per phase/);
      assert.match(result.out, /Nothing in your codebase was changed/);
      assert.match(result.out, new RegExp(`not built yet \\(${RUN_MILESTONE.replace('.', '\\.')}\\)`));
    },
    { files: { 'CLAUDE.md': '# project instructions\n' } },
  );
});

test('with no harness, the report says so and takes the simple shape', async () => {
  await project(async (dir) => {
    const result = await executeArgv(['apply'], ctx(dir));
    assert.match(result.out, /No agent harness detected/);
    assert.match(result.out, /the simple shape/);
    assert.match(readPrd(dir), /- Harness: none detected/);
    assert.match(readPrd(dir), /this is the \*\*simple PRD\*\*/);
  });
});

test('the harness named in the report is the one named in the PRD header', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      const prd = readPrd(dir);
      assert.match(prd, /- Harness: an AGENTS\.md harness/);
      assert.match(prd, /- Harness config: AGENTS\.md/);
    },
    { files: { 'AGENTS.md': '# agents\n' } },
  );
});

// ---------------------------------------------------------------------------
// Resume and --fresh
// ---------------------------------------------------------------------------

test('re-running resumes: ticks, completed phases and notes survive', async () => {
  await project(async (dir) => {
    await executeArgv(['apply'], ctx(dir));
    const edited = readPrd(dir)
      .replace('- [ ] **AC-1.1**', '- [x] **AC-1.1**')
      .replace('- [ ] Phase 1 complete', '- [x] Phase 1 complete')
      .replace(/_Yours\.[^\n]*_/, 'Ask design about the secondary blue.');
    fs.writeFileSync(path.join(dir, PRD_FILE), edited);

    const result = await executeArgv(['apply'], ctx(dir));
    const after = readPrd(dir);

    assert.match(result.out, /Step 5 — resumed, not restarted/);
    assert.match(result.out, /Kept: 1 ticked criterion/);
    assert.match(after, /- \[x\] \*\*AC-1\.1\*\*/, 'the tick survives');
    assert.match(after, /- \[x\] Phase 1 complete/, 'the phase marker survives');
    assert.match(after, /Ask design about the secondary blue\./, 'the notes survive verbatim');
    assert.match(after, /- Status: in progress/);
  });
});

test('`--fresh` regenerates from scratch, and says what it threw away', async () => {
  await project(async (dir) => {
    await executeArgv(['apply'], ctx(dir));
    fs.writeFileSync(
      path.join(dir, PRD_FILE),
      readPrd(dir)
        .replace('- [ ] **AC-1.1**', '- [x] **AC-1.1**')
        .replace(/_Yours\.[^\n]*_/, 'A note I will lose.'),
    );

    const result = await executeArgv(['apply', '--fresh'], ctx(dir));
    const after = readPrd(dir);

    assert.match(result.out, /Step 5 — regenerated from scratch/);
    assert.match(result.out, /ticks, completed phases and/);
    assert.ok(!/- \[x\]/.test(after), 'nothing is ticked in a fresh plan');
    assert.ok(!after.includes('A note I will lose.'), 'and the notes are gone');
    assert.match(after, /- Status: not started/);
  });
});

test('`--fresh` on a first run is not reported as discarding anything', async () => {
  await project(async (dir) => {
    const result = await executeArgv(['apply', '--fresh'], ctx(dir));
    assert.ok(!/regenerated from scratch/.test(result.out), 'there was nothing to discard');
    assert.ok(fs.existsSync(path.join(dir, PRD_FILE)));
  });
});

test('an unreadable plan is regenerated rather than crashing', async () => {
  await project(async (dir) => {
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(path.join(dir, PRD_FILE), 'this is not a PRD at all');
    const result = await executeArgv(['apply'], ctx(dir));
    assert.equal(result.code, 0);
    assert.match(readPrd(dir), /# Phyllum apply — PRD/);
  });
});

test('an interrupted refresh leaves the previous plan — and its ticks — intact', async () => {
  await project(async (dir) => {
    await executeArgv(['apply'], ctx(dir));
    const marked = readPrd(dir).replace('- [ ] **AC-1.1**', '- [x] **AC-1.1**');
    fs.writeFileSync(path.join(dir, PRD_FILE), marked);

    // The plan goes through the same atomic funnel as DESIGN-SYSTEM.md, so a run
    // that dies mid-write cannot leave a half-written plan — which matters more
    // here than anywhere, because a corrupt plan would lose the user's progress.
    assert.throws(
      () => writePrd(dir, 'CORRUPT', { faultAt: 'after-temp-write' }),
      /injected write fault/,
    );
    assert.equal(readPrd(dir), marked, 'the plan on disk is untouched');
    assert.match(readPrd(dir), /- \[x\] \*\*AC-1\.1\*\*/);
    assert.deepEqual(
      [...snapshotContents(dir).keys()].filter((rel) => rel.includes('phyllum-tmp')),
      [],
      'and no temp file is left beside it',
    );
  });
});

// ---------------------------------------------------------------------------
// The grammar
// ---------------------------------------------------------------------------

test('`run` is a reserved scope word, registered and honestly unbuilt', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const result = await executeArgv(['apply', 'run'], ctx(dir));
    assert.match(result.out, /registered but not built yet/);
    assert.match(result.out, new RegExp(RUN_MILESTONE.replace(/\./g, '\\.')));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('a word that is not a scope prints the valid ones rather than erroring', async () => {
  await project(async (dir) => {
    const result = await executeArgv(['apply', 'tokens'], ctx(dir));
    assert.equal(result.code, 0);
    assert.match(result.out, /is not something `apply` takes/);
    assert.match(result.out, /`run`/);
    assert.ok(!fs.existsSync(path.join(dir, PRD_FILE)), 'and nothing is written');
  });
});

test('`apply` works from the interactive session too, quoting included', async () => {
  await project(async (dir) => {
    const result = await executeLine('apply --fresh', ctx(dir));
    assert.equal(result.code, 0);
    assert.ok(fs.existsSync(path.join(dir, PRD_FILE)));
  });
});

// ---------------------------------------------------------------------------
// The refusals
// ---------------------------------------------------------------------------

test('an empty design system is answered with the command that fills it', async () => {
  await project(
    async (dir) => {
      const before = snapshotContents(dir);
      const result = await executeArgv(['apply'], ctx(dir));

      assert.equal(result.code, 0);
      assert.match(result.out, /nothing for `apply` to apply/);
      assert.match(result.out, /phyllum assess/);
      assert.match(result.out, /phyllum create/);
      assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
        added: [],
        changed: [],
        removed: [],
      });
    },
    { designSystem: EMPTY },
  );
});

test('nothing to apply writes no PRD at all, and says why', async () => {
  await project(
    async (dir) => {
      const before = snapshotContents(dir);
      const result = await executeArgv(['apply'], ctx(dir));

      assert.equal(result.code, 0);
      assert.equal(result.written, false);
      assert.match(result.out, /nothing to apply/);
      assert.match(result.out, /no PRD\n?was written|no PRD was written/);
      assert.ok(!fs.existsSync(path.join(dir, PRD_FILE)), 'an empty plan is worse than no plan');
      assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
        added: [],
        changed: [],
        removed: [],
      });
    },
    { fixture: 'unknown-lang' },
  );
});

test('a project that only Phyllum has written to is left exactly as it was', async () => {
  // The polyglot fixture has no React and no matching tokens: `apply` must not
  // invent a reason to touch a Go or Kotlin file.
  await project(
    async (dir) => {
      const before = snapshotContents(dir);
      await executeArgv(['apply'], ctx(dir));
      const diff = diffSnapshots(before, snapshotContents(dir));
      assert.deepEqual(diff.changed, []);
      assert.deepEqual(diff.removed, []);
      for (const added of diff.added) {
        assert.equal(added, PRD_FILE, `${added} should never have been written`);
      }
    },
    { fixture: 'polyglot-theme' },
  );
});
