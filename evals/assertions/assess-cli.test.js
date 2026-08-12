/**
 * Assertions for the `phyllum assess` command surface (v0.2.0 plan §5.1, §7).
 *
 * The engine's checks live in `assess-scan.test.js`. What is checked here is
 * everything the engine cannot see: that the command is registered and reachable,
 * that running it changes nothing on disk, that it says what it read rather than
 * implying it, that it needs no model to run, and that the reserved scope words
 * after `assess` are its own grammar rather than arguments it silently ignores.
 *
 * One promise runs through all of it. `assess` is the first Phyllum command whose
 * whole job is to read somebody else's code, so the trust it has to earn is
 * specific: reading a codebase must leave the codebase exactly as it was. Every
 * check that runs the command diffs the whole directory around it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ASSESS_SCOPES, isAssessScope } from '../../lib/assess-command.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { resolveCommand } from '../../lib/registry.js';
import {
  FIXTURES,
  PACKAGE_ROOT,
  POPULATED_FIXTURE,
  copyDir,
  diffSnapshots,
  readFixture,
  snapshotContents,
  snapshotPaths,
  withTempDir,
} from './helpers.js';

const MIXED = path.join(FIXTURES, 'codebases', 'tokenise-mixed');
const EMPTY_FIXTURE = path.join(FIXTURES, 'design-system', 'empty.md');

const run = (line, cwd, extra = {}) =>
  execute(tokenizeLine(line), { cwd, env: {}, yes: true, ...extra });

/** A project with a design system and a codebase full of raw values. */
async function withProject(body, fixture = EMPTY_FIXTURE, codebase = MIXED) {
  return withTempDir(async (dir) => {
    copyDir(codebase, dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(fixture));
    return body(dir);
  });
}

// ---------------------------------------------------------------------------
// Registered, reachable, and pointed at its own contract
// ---------------------------------------------------------------------------

test('assess is registered as built, with no alias, and points at its reference file', () => {
  const command = resolveCommand('assess');
  assert.ok(command, 'assess is a word Phyllum answers to');
  assert.equal(command.built, true);
  assert.deepEqual(command.aliases, [], 'one name, because there is no second spelling of it');

  const skill = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('refs/assess.md'), 'SKILL.md routes assess to its own reference file');
  assert.ok(skill.includes('| `assess` |'), 'and lists it in the command table');
});

test('help for assess is the same page whichever word order you use', async () => {
  await withProject(async (dir) => {
    const a = await run('help assess', dir);
    const b = await run('assess help', dir);
    assert.equal(b.out, a.out);
    assert.ok(!a.out.includes('not built yet'), 'it is built, and must not say otherwise');
    assert.ok(a.out.includes('read-only') || a.out.includes('read your codebase'));
  });
});

test('assess before init points at init and creates nothing', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    const before = snapshotPaths(dir);
    const { out, code } = await run('assess', dir);
    assert.equal(code, 0, 'a missing design system is a message, not a failure');
    assert.ok(out.includes('phyllum init'));
    assert.ok(out.includes('no DESIGN-SYSTEM.md here yet'));
    assert.deepEqual(snapshotPaths(dir), before, 'and nothing was created on the way');
  });
});

// ---------------------------------------------------------------------------
// Read-only, and needs nothing installed
// ---------------------------------------------------------------------------

test('running assess leaves the codebase byte for byte as it was', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { code } = await run('assess', dir);
    assert.equal(code, 0);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('assess needs no model and no network — the scan is arithmetic', async () => {
  await withProject(async (dir) => {
    // No `claude` on PATH, no session, no `ask`, no `confirm`: `tokenise` would
    // stop here and name both routes to a model. A scan has nothing to ask.
    const { out, code } = await run('assess', dir, { env: {} });
    assert.equal(code, 0);
    assert.ok(!out.includes('Install Claude Code'));
    assert.ok(!out.includes('inside a Claude Code session'));
  });
});

test('the report says what it read and what it never wrote', async () => {
  await withProject(async (dir) => {
    fs.writeFileSync(
      path.join(dir, 'theme.json'),
      JSON.stringify({ colors: { brand: '#7C3AED' } }, null, 2),
    );
    const { out } = await run('assess', dir);

    assert.ok(out.includes('read-only'), 'the promise leads the report');
    assert.ok(/Read \d+ files/.test(out), 'and it counts the files rather than implying them');
    assert.ok(out.includes('neither a stylesheet nor markup'), 'including the ones in other languages');
    assert.ok(out.includes('Nothing was written'));
    assert.ok(out.includes('only `apply` ever writes it'), 'and names the command that does write code');
  });
});

test('the inventory leads with the value the codebase leans on hardest', async () => {
  await withProject(async (dir) => {
    const { out } = await run('assess', dir);
    const listed = out
      .split('\n')
      .filter((line) => /used \d+×/.test(line))
      .map((line) => Number(line.match(/used (\d+)×/)[1]));
    assert.ok(listed.length > 0, 'the report shows the values it found');
    assert.deepEqual(listed, [...listed].sort((a, b) => b - a), 'most-used first');
    assert.ok(out.includes('#2563EB'), 'the brand blue this fixture leans on hardest is in there');
  });
});

test('a value the design system already names is reported as coverage, not as a suggestion', async () => {
  await withProject(async (dir) => {
    const { out } = await run('assess', dir, {});
    assert.ok(out.includes('already named by your design system'));
    assert.ok(out.includes('color-primary'), 'and the token that covers it is named');
  }, POPULATED_FIXTURE);
});

test('an empty project is told it is empty rather than shown an invented list', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(EMPTY_FIXTURE));
    const { out, code } = await run('assess', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('No colours, numbers or typography written out as raw values.'));
    assert.ok(!/used \d+×/.test(out), 'nothing is listed, because nothing was found');
  });
});

test('an unsupported stack is told the component pass did not run', async () => {
  await withProject(
    async (dir) => {
      const { out } = await run('assess', dir);
      assert.ok(out.includes('Not run —'), 'the skip is stated, not left as an empty list');
      assert.ok(out.includes('React-only in v0.2.0'));
      assert.ok(out.includes('values pass above ran in full'));
      assert.ok(/used \d+×/.test(out), 'and the values pass really did run');
    },
    EMPTY_FIXTURE,
    path.join(FIXTURES, 'codebases', 'vue-app'),
  );
});

test('a React codebase is shown the patterns it repeats', async () => {
  await withProject(
    async (dir) => {
      const { out } = await run('assess', dir);
      assert.ok(out.includes('your design system has never been told about'));
      assert.ok(out.includes('used'), 'with a count, because repetition is the evidence');
    },
    EMPTY_FIXTURE,
    path.join(FIXTURES, 'codebases', 'repeated-jsx'),
  );
});

// ---------------------------------------------------------------------------
// The argument grammar
// ---------------------------------------------------------------------------

test('the three words after assess are reserved, and named where the code can read them', () => {
  assert.deepEqual(ASSESS_SCOPES, ['tokens', 'components', 'update']);
  for (const scope of ASSESS_SCOPES) assert.ok(isAssessScope(scope));
  assert.ok(isAssessScope('TOKENS'), 'matching is case-insensitive, like every other word');
  assert.ok(!isAssessScope('all'), '`all` is `system` and `gui`’s word, not this one');
});

test('a reserved scope word says what it will do and which milestone it lands in', async () => {
  await withProject(async (dir) => {
    for (const scope of ASSESS_SCOPES) {
      const before = snapshotContents(dir);
      const { out, code } = await run(`assess ${scope}`, dir);
      assert.equal(code, 0);
      assert.ok(out.includes(`\`assess ${scope}\``), `${scope} is echoed back as a mode`);
      assert.ok(out.includes('chained mode'));
      assert.ok(out.includes('M5'), 'and the report says when it arrives');
      assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, [], 'and writes nothing');
    }
  });
});

test('a word that is not a scope gets the valid ones rather than an error', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('assess everything', dir);
    assert.equal(code, 0, 'a wrong word is not a crash');
    assert.ok(out.includes('`everything`'));
    for (const scope of ASSESS_SCOPES) assert.ok(out.includes(`\`${scope}\``), `${scope} is offered`);
    assert.ok(out.includes('nothing at all for the full assessment'));
  });
});

// ---------------------------------------------------------------------------
// The map and the suggestions (v0.2.0 plan §5.1 steps 4–5)
// ---------------------------------------------------------------------------

test('the report walks the whole pipeline, in the order it runs', async () => {
  await withProject(async (dir) => {
    const { out } = await run('assess', dir, {});
    const steps = ['Step 2 — the scan', 'Step 3 — what your codebase uses', 'Step 4 — the map', 'Step 5 — suggestions'];
    let at = -1;
    for (const step of steps) {
      const index = out.indexOf(step);
      assert.ok(index > at, `${step} is missing, or out of order`);
      at = index;
    }
  }, POPULATED_FIXTURE);
});

test('the map is a table with a coverage column, not a list of loose values', async () => {
  await withProject(async (dir) => {
    const { out } = await run('assess', dir, {});
    const header = out.split('\n').find((line) => line.includes('what it looks like'));
    assert.ok(header, 'the table names its columns');
    for (const column of ['value', 'used', 'where', 'coverage']) {
      assert.ok(header.includes(column), `the ${column} column is part of the contract`);
    }
    assert.ok(out.includes('color-primary'), 'a covered value shows the token that covers it');
    assert.ok(/\(proposed\)/.test(out), 'and an uncovered one shows the name Phyllum would give it');
    assert.ok(out.includes('Four buckets:'), 'the buckets add up in one line');
  }, POPULATED_FIXTURE);
});

test('a value seen but not read is a question on the page, never a silent drop', async () => {
  await withProject(async (dir) => {
    fs.writeFileSync(path.join(dir, 'tokens.go'), 'package ui\n\nconst AccentTint = "#7C3AED"\n');
    const { out } = await run('assess', dir, {});
    assert.ok(out.includes('#7C3AED'), 'the value is in the report');
    assert.ok(out.includes('role unknown'), 'and it says what it could not work out');
    assert.ok(out.includes('seen but not read'), 'the bucket is named in the totals');
  }, POPULATED_FIXTURE);
});

test('the suggestions are named without a model, and the review is only offered', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await run('assess', dir, { env: {} });

    assert.equal(code, 0, 'a full report is not a failure, whatever is installed');
    assert.ok(/\d+ tokens? Phyllum would propose/.test(out), 'the mechanical half names its proposals');
    assert.ok(out.includes('`phyllum create` opens the same picker'), 'and points at the way in for components');
    assert.ok(!out.includes('Install Claude Code'), 'the assessment needed no model, so it pitches none');
    assert.ok(!out.includes('inside a Claude Code session'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    }, 'and a report with nobody to ask writes nothing');
  }, POPULATED_FIXTURE, path.join(FIXTURES, 'codebases', 'repeated-jsx'));
});

test('assess appears in the menu and in the greeting, exactly once', async () => {
  await withProject(async (dir) => {
    const { out } = await run('menu', dir);
    const lines = out.split('\n').filter((line) => line.includes('phyllum assess'));
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes('Read the codebase'));
  });
});
