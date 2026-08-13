/**
 * Assertions for the `tokenise` command surface (v0.2.0 plan §6, §7).
 *
 * Three things are checked here that the reader tests cannot see: that the spec
 * tables in `skill/refs/tokenise.md` really are what drives the code, that the
 * alias `tokenize` is the same subskill rather than a second one, and — the
 * v0.2.0 rework's headline promise — that `tokenise` no longer reads the
 * codebase at all. A sentence is the whole input; scanning belongs to `assess`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { resolveCommand } from '../../lib/registry.js';
import {
  actionForAnswer,
  colourNames,
  hintFor,
  ladders,
  passes,
  proseHints,
  proseWeights,
  reloadSpec,
  roles,
  sectionFor,
  sources,
  weightForWord,
} from '../../lib/tokenise-spec.js';
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

const accept = { ask: async () => 'y', confirm: async () => true };

/** A project with a design system — and a codebase, which `tokenise` must ignore. */
async function withProject(body, fixture = POPULATED_FIXTURE) {
  return withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(fixture));
    return body(dir);
  });
}

// ---------------------------------------------------------------------------
// The spec file is the contract
// ---------------------------------------------------------------------------

test('the spec tables in refs/tokenise.md cover every pass', () => {
  reloadSpec();
  assert.deepEqual(
    passes().map((pass) => pass.pass),
    ['colours', 'numbers', 'typography', 'shadows', 'borders'],
  );
  assert.equal(sectionFor('colours'), 'colours');
  assert.equal(sectionFor('numbers'), 'numbers');
  assert.equal(sectionFor('typography'), 'typography');
  // The two compound passes write into Numbers rather than into a section of
  // their own: a shadow and a border width are lengths with a job, and a fourth
  // token section would change every DESIGN-SYSTEM.md for no gain.
  assert.equal(sectionFor('shadows'), 'numbers');
  assert.equal(sectionFor('borders'), 'numbers');

  assert.deepEqual(
    roles().map((role) => role.role),
    ['radius', 'spacing', 'border'],
    'the plan names spacing, corner radius and borders',
  );
  for (const role of roles()) {
    assert.ok(role.appliesTo.length > 0, `${role.role} needs an applies-to label`);
    assert.ok(ladders()[role.ladder], `${role.role} points at a ladder that exists`);
  }
});

test('every ladder names its own centre rung', () => {
  for (const [name, ladder] of Object.entries(ladders())) {
    assert.ok(ladder.rungs.length > 0, `${name} has no rungs`);
    assert.ok(
      ladder.centre >= 0 && ladder.centre < ladder.rungs.length,
      `${name}'s centre is off its ladder`,
    );
  }
});

test('the colour naming table is ordered role-first, then by rank', () => {
  const rows = colourNames();
  const firstRanked = rows.findIndex((row) => row.rank !== null);
  assert.ok(firstRanked > 0, 'the role rows come first, so a surface is never "primary"');
  const ranks = rows.slice(firstRanked).map((row) => row.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'ranks ascend');
  assert.ok(
    rows.some((row) => row.name.includes('{n}')),
    'and the tail is numbered rather than unnamed',
  );
});

test('the prose vocabulary is a table, not a list buried in the code', () => {
  const hints = proseHints();
  assert.ok(hints.size > 0);
  // Every role a number can have is reachable from a word someone would type.
  for (const role of ['radius', 'spacing', 'border']) {
    assert.ok([...hints.values()].includes(role), `no prose word means ${role}`);
  }
  assert.ok([...hints.values()].includes('typography'), 'and one moves a length into type');
  assert.ok([...hints.values()].includes('name'), 'and one introduces the user’s own name');

  assert.equal(hintFor('CORNER'), 'radius', 'matching is case-insensitive');
  assert.equal(hintFor('padding'), 'spacing');
  assert.equal(hintFor('nothing-like-this'), null);
});

test('the weight words are a table too, and cover the CSS scale', () => {
  const weights = new Set(proseWeights().values());
  for (const step of [300, 400, 700]) {
    assert.ok(weights.has(step), `no word spells weight ${step}`);
  }
  assert.equal(weightForWord('Bold'), 700);
  assert.equal(weightForWord('semibold'), 600);
  assert.equal(weightForWord('blue'), null, 'a colour word is not a weight');
});

test('the review answers come from the review table', () => {
  assert.equal(actionForAnswer('yes').action, 'confirm');
  assert.equal(actionForAnswer('NO').action, 'skip');
  assert.equal(actionForAnswer('merge color-primary').target, 'color-primary');
  assert.equal(actionForAnswer('brand-blue').action, 'rename');
});

test('the scanning tables have left this file for refs/assess.md', () => {
  // M2 left the scanning contract here on purpose, so that moving a contract and
  // changing a command were two steps rather than one. M3 is the second step: the
  // tables move with the behaviour, and `tokenise.md` keeps only what a *name* is
  // made of. Neither file may hold both halves.
  const ref = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'refs', 'tokenise.md'), 'utf8');
  const assessRef = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'refs', 'assess.md'), 'utf8');

  for (const marker of ['phyllum:sources', 'phyllum:tailwind', 'phyllum:clustering']) {
    assert.ok(assessRef.includes(marker), `refs/assess.md should now carry ${marker}`);
    assert.ok(!ref.includes(marker), `refs/tokenise.md should no longer carry ${marker}`);
  }
  for (const marker of ['phyllum:passes', 'phyllum:roles', 'phyllum:colour-names', 'phyllum:ladders']) {
    assert.ok(ref.includes(marker), `the naming scales stay in refs/tokenise.md: ${marker}`);
    assert.ok(!assessRef.includes(marker), `refs/assess.md should not restate ${marker}`);
  }

  // And the tables still drive the code from their new home.
  const { extensions, stylesheets, markup, skipped } = sources();
  assert.deepEqual(extensions, [...stylesheets, ...markup]);
  assert.ok(skipped.includes('node_modules'));

  assert.match(ref, /refs\/assess\.md/, 'tokenise.md points at where the contract went');
  assert.match(ref, /does not read your codebase|does \*\*not\*\* read the codebase/i);
});

// ---------------------------------------------------------------------------
// The command surface
// ---------------------------------------------------------------------------

test('tokenise is registered as built, and points at its own reference file', () => {
  const command = resolveCommand('tokenise');
  assert.equal(command.built, true);
  assert.deepEqual(command.aliases, ['tokenize']);

  const skill = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('refs/tokenise.md'));
});

test('tokenise takes a sentence, and says what it read before writing', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('tokenise "our brand blue #1D4ED8"', dir, accept);
    assert.equal(code, 0);
    assert.ok(out.includes('Read from "our brand blue #1D4ED8"'));
    assert.ok(out.includes('#1D4ED8'));
    assert.ok(out.includes('Wrote'));
  });
});

test('tokenise never reads the codebase — not one file', async () => {
  await withProject(async (dir) => {
    // A codebase full of raw values, and a sentence about none of them.
    const { out } = await run('tokenise "our brand green #16A34A"', dir, accept);
    assert.ok(!out.includes('src/styles.css'), 'no file from the codebase is mentioned');
    assert.ok(!out.includes('read-only'), 'there is no scan to be read-only about');
    assert.ok(out.includes('`tokenise` reads the sentence, `assess` reads the code'));

    const model = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(model.includes('#16A34A'), 'the sentence’s value was written');
    assert.ok(!model.includes('#2564EC'), 'and nothing the codebase happens to contain was');
  }, EMPTY_FIXTURE);
});

test('bare tokenise explains the sentence form and hands scanning to assess', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out } = await run('tokenise', dir);
    assert.ok(out.includes('names one value at a time, from a sentence'));
    assert.ok(out.includes('`assess` does that'), 'it names the command that reads code');
    assert.ok(out.includes('Nothing has been written'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});

test('bare tokenise with a terminal asks what to name rather than scanning', async () => {
  await withProject(async (dir) => {
    const asked = [];
    const { out } = await run('tokenise', dir, {
      ask: async (question) => {
        asked.push(question);
        return asked.length === 1 ? 'our brand teal #0D9488' : 'y';
      },
      confirm: async () => true,
    });
    assert.match(asked[0], /What should I name\?/);
    assert.ok(out.includes('#0D9488'));
    assert.ok(out.includes('Wrote'));
  }, EMPTY_FIXTURE);
});

test('`tokenize` is the same subskill, on a real flow', async () => {
  await withProject(async (dir) => {
    const a = await run('tokenise "our brand blue #1D4ED8"', dir);
    const b = await run('tokenize "our brand blue #1D4ED8"', dir);
    assert.equal(b.out, a.out, 'the alias produces identical output');
    assert.equal(b.code, a.code);

    const help = await run('help tokenise', dir);
    const helpAlias = await run('help tokenize', dir);
    assert.equal(helpAlias.out, help.out);
  });
});

test('`tokenize` writes the same file as `tokenise` would', async () => {
  let canonical;
  await withProject(async (dir) => {
    await run('tokenise "16px spacing"', dir, accept);
    canonical = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
  }, EMPTY_FIXTURE);
  await withProject(async (dir) => {
    await run('tokenize "16px spacing"', dir, accept);
    assert.equal(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'), canonical);
  }, EMPTY_FIXTURE);
});

test('with no route to a model, tokenise names both ways to get one', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('tokenise "our brand blue #1D4ED8"', dir);
    assert.equal(code, 1);
    assert.ok(out.includes('Install Claude Code'));
    assert.ok(out.includes('what a designer would call them'), 'it says what it needs a model for');
  });
});

test('inside a Claude Code session the skill takes over the conversation', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('tokenise "our brand blue #1D4ED8"', dir, {
      env: { CLAUDECODE: '1' },
    });
    assert.equal(code, 0);
    assert.ok(out.includes('inside a Claude Code session'));
  });
});

test('tokenise before init points at init and creates nothing', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    const before = snapshotPaths(dir);
    const { out, code } = await run('tokenise "our brand blue #2563EB"', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('phyllum init'));
    assert.deepEqual(snapshotPaths(dir), before);
  });
});

test('a value the system already names is said plainly, and nothing is written', async () => {
  await withProject(async (dir) => {
    const before = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    const { out, code } = await run('tokenise "our brand blue #2563EB"', dir, accept);
    assert.equal(code, 0);
    assert.ok(out.includes('is already `color-primary`'));
    assert.ok(out.includes('never renames a token you already have'));
    assert.equal(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'), before);
  });
});
