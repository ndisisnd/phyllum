/**
 * The `apply` command surface (v0.2.0 plan §6.5.1).
 *
 * `apply run` rewrites somebody's source code, so the single most important
 * assertion in this file is a negative one about its other half: **`phyllum
 * apply` changes nothing but `.phyllum/PRD.md`.** That is proved the strongest
 * way available here — the whole project directory is snapshotted byte for byte
 * before and after, and any other path in the diff fails the run.
 *
 * The rest is the grammar and the refusals: `run` as the scope word (and, with no
 * plan written, a refusal that changes nothing), `--fresh` as the one destructive
 * thing `apply` can do to its own file, and an empty design system answered with
 * the command that fills it rather than an empty plan. `apply run`'s own machinery
 * is asserted in `apply-run.test.js` and `apply-e2e.test.js`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { executeArgv, executeLine } from '../../lib/execute.js';
import { DISPATCHABLE, resolveCommand } from '../../lib/registry.js';
import { PRD_FILE, isAllowedPath, writePrd } from '../../lib/write.js';
import { renderMenu } from '../../lib/menu.js';
import { renderCommandHelp } from '../../lib/help.js';
import {
  FIXTURES,
  PACKAGE_ROOT,
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
  assert.equal(command.milestone, 'v0.2.0 M7');
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
      assert.match(result.out, /`phyllum apply run` executes it/);
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

test('`run` is `apply`\'s scope word, and with no plan it changes nothing', async () => {
  await project(async (dir) => {
    // No `phyllum apply` has run here, so there is no PRD — and without a plan
    // there is no consent, so `apply run` refuses and points at the command that
    // writes one. The whole project directory is diffed around it.
    const before = snapshotContents(dir);
    const result = await executeArgv(['apply', 'run'], ctx(dir));
    assert.equal(result.code, 0);
    assert.match(result.out, /there is no plan for `apply run` to execute/);
    assert.match(result.out, /Run `phyllum apply` first/);
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

// ---------------------------------------------------------------------------
// `update` — the alias (v0.3.0 §6, M6)
// ---------------------------------------------------------------------------

/**
 * The rename's whole promise in one word: *identical*.
 *
 * `update` used to move the install and now means "update my codebase from the
 * design system", which is `apply`. The switch is silent — no redirect notice,
 * no acknowledgement gate — so nothing at all in the output tells the two words
 * apart, and these checks are what make that a fact rather than an intention.
 */
test('`update` resolves to `apply` — one entry, one handler, one page', async () => {
  const command = resolveCommand('update');
  assert.equal(command, resolveCommand('apply'), 'the same registry object, not a copy of it');
  assert.equal(command.name, 'apply', 'help and menu lead with `apply`');
  assert.ok(command.aliases.includes('update'), 'and list `update` as its alias');

  // `upgrade` is where the old behaviour went, and it is its own top-level entry.
  const upgrade = resolveCommand('upgrade');
  assert.ok(upgrade, '`upgrade` must resolve');
  assert.equal(upgrade.name, 'upgrade');
  assert.notEqual(upgrade, command, 'the two are separate commands, not aliases of each other');

  const a = await executeArgv(['help', 'apply'], {});
  const b = await executeArgv(['help', 'update'], {});
  assert.equal(b.out, a.out, 'one command, one help page');
});

test('`update` and `apply` write byte-identical plans', async () => {
  let viaApply = null;
  await project(async (dir) => {
    await executeArgv(['apply'], ctx(dir));
    viaApply = readPrd(dir);
  });

  await project(async (dir) => {
    const before = snapshotContents(dir);
    const result = await executeArgv(['update'], ctx(dir));
    const diff = diffSnapshots(before, snapshotContents(dir));

    assert.equal(result.code, 0);
    assert.equal(result.written, true);
    assert.deepEqual(diff.added, [PRD_FILE], '`update` writes the plan and nothing else');
    assert.deepEqual(diff.changed, []);
    assert.deepEqual(diff.removed, []);
    assert.equal(readPrd(dir), viaApply, 'the same plan, byte for byte');
  });
});

test('`update` says nothing about having been redirected', async () => {
  await project(async (dir) => {
    const viaUpdate = await executeArgv(['update'], ctx(dir));
    assert.ok(!/upgrade/i.test(viaUpdate.out), 'the silent switch prints no notice');
    assert.ok(!/\balias\b|renamed|now means|used to/i.test(viaUpdate.out), 'and no acknowledgement gate');
  });

  // And the output is the same output, not merely a quiet one. The plan names
  // the file it wrote, and each run gets its own sandbox, so the one thing that
  // legitimately differs — the project directory — is normalised away.
  const anonymise = (text, dir) => text.split(path.basename(dir)).join('<project>');
  let viaApply = null;
  await project(async (dir) => {
    viaApply = anonymise((await executeArgv(['apply'], ctx(dir))).out, dir);
  });
  await project(async (dir) => {
    assert.equal(anonymise((await executeArgv(['update'], ctx(dir))).out, dir), viaApply);
  });
});

test('`update run` chains to `apply run`, refusal and all', async () => {
  // With no plan written, `apply run` refuses and changes nothing. The alias
  // reaches the same refusal, which is what proves the scope word chains rather
  // than being re-parsed somewhere else.
  let viaApply = null;
  await project(async (dir) => {
    viaApply = await executeArgv(['apply', 'run'], ctx(dir));
  });
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const viaUpdate = await executeArgv(['update', 'run'], ctx(dir));
    assert.equal(viaUpdate.out, viaApply.out);
    assert.equal(viaUpdate.code, viaApply.code);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('`phyllum update` installs nothing and starts no process', async () => {
  // The old `update` was the one command that ran a package manager. The new one
  // must not be able to: the module that spawns one is not even on its path.
  const apply = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'apply-command.js'), 'utf8');
  assert.ok(!/upgrade-command/.test(apply), '`apply` does not reach the upgrade path');
  assert.ok(!/child_process/.test(apply), 'and starts no process of its own');

  await project(async (dir) => {
    const before = snapshotContents(dir);
    await executeArgv(['update'], ctx(dir));
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.added, [PRD_FILE]);
  });
});
