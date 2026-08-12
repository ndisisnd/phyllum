/**
 * Assertions for the `tokenise` command surface (plan §2.2, §6.5, §7.3, §8.5).
 *
 * Three things are checked here that the engine tests cannot see: that the spec
 * tables in `skill/refs/tokenise.md` really are what drives the code, that the
 * alias `tokenize` is the same subskill rather than a second one, and that
 * `init`'s step 4 seeds the system by *offering* a pass — read-only, and never
 * writing on the user's behalf.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { resolveCommand } from '../../lib/registry.js';
import { parse } from '../../lib/design-system.js';
import {
  actionForAnswer,
  colourNames,
  ladders,
  passes,
  reloadSpec,
  roles,
  sectionFor,
  sources,
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
const run = (line, cwd, extra = {}) =>
  execute(tokenizeLine(line), { cwd, env: {}, yes: true, ...extra });

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

test('the spec tables in refs/tokenise.md cover the plan §4 passes', () => {
  reloadSpec();
  assert.deepEqual(
    passes().map((pass) => pass.pass),
    ['colours', 'numbers', 'typography'],
  );
  assert.equal(sectionFor('colours'), 'colours');
  assert.equal(sectionFor('numbers'), 'numbers');
  assert.equal(sectionFor('typography'), 'typography');

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
    assert.ok(ladder.centre >= 0 && ladder.centre < ladder.rungs.length, `${name}'s centre is off its ladder`);
  }
});

test('the colour naming table is ordered role-first, then by rank', () => {
  const rows = colourNames();
  const firstRanked = rows.findIndex((row) => row.rank !== null);
  assert.ok(firstRanked > 0, 'the role rows come first, so a surface is never "primary"');
  const ranks = rows.slice(firstRanked).map((row) => row.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'ranks ascend');
  assert.ok(rows.some((row) => row.name.includes('{n}')), 'and the tail is numbered rather than unnamed');
});

test('the scan reads the extensions the sources table lists, and no others', () => {
  const { extensions, stylesheets, markup, skipped } = sources();
  assert.deepEqual(extensions, [...stylesheets, ...markup]);
  for (const extension of extensions) assert.match(extension, /^\.[a-z]+$/);
  assert.ok(skipped.includes('node_modules'));
  assert.ok(skipped.includes('.phyllum'), 'Phyllum never reads its own state as evidence');
});

test('the review answers come from the review table', () => {
  assert.equal(actionForAnswer('yes').action, 'confirm');
  assert.equal(actionForAnswer('NO').action, 'skip');
  assert.equal(actionForAnswer('merge color-primary').target, 'color-primary');
  assert.equal(actionForAnswer('brand-blue').action, 'rename');
});

// ---------------------------------------------------------------------------
// The command surface
// ---------------------------------------------------------------------------

test('tokenise is registered as built, and points at its own reference file', () => {
  const command = resolveCommand('tokenise');
  assert.equal(command.built, true);
  assert.equal(command.milestone, 'M3');
  assert.deepEqual(command.aliases, ['tokenize']);

  const skill = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('refs/tokenise.md'));
});

test('tokenise reports what it found, without writing', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out } = await run('tokenise', dir);
    assert.ok(out.includes('read-only'));
    assert.ok(out.includes('most-used first'));
    assert.ok(out.includes('Nothing has been written'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});

test('`tokenize` is the same subskill, on a real flow', async () => {
  await withProject(async (dir) => {
    const a = await run('tokenise', dir);
    const b = await run('tokenize', dir);
    assert.equal(b.out, a.out, 'the alias produces identical output');
    assert.equal(b.code, a.code);

    const help = await run('help tokenise', dir);
    const helpAlias = await run('help tokenize', dir);
    assert.equal(helpAlias.out, help.out);
  });
});

test('`tokenize` writes the same file as `tokenise` would', async () => {
  const accept = { ask: async () => 'y', confirm: async () => true };
  let canonical;
  await withProject(async (dir) => {
    await run('tokenise', dir, accept);
    canonical = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
  });
  await withProject(async (dir) => {
    await run('tokenize', dir, accept);
    assert.equal(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'), canonical);
  });
});

test('with no route to a model, tokenise names both ways to get one', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('tokenise', dir);
    assert.equal(code, 1);
    assert.ok(out.includes('Install Claude Code'));
    assert.ok(out.includes('what a designer would call them'), 'it says what it needs a model for');
  });
});

test('inside a Claude Code session the skill takes over the review', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('tokenise', dir, { env: { CLAUDECODE: '1' } });
    assert.equal(code, 0);
    assert.ok(out.includes('inside a Claude Code session'));
    assert.ok(out.includes('walks the proposals'));
  });
});

test('tokenise before init points at init and creates nothing', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    const before = snapshotPaths(dir);
    const { out, code } = await run('tokenise', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('phyllum init'));
    assert.deepEqual(snapshotPaths(dir), before);
  });
});

test('a fully named system says so plainly instead of proposing nothing in silence', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    const { out, code } = await run('tokenise', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('nothing new to name'));
    assert.ok(out.includes('read-only'));
  });
});

// ---------------------------------------------------------------------------
// init step 4 — seeding, offered and read-only
// ---------------------------------------------------------------------------

test('init offers a first tokenise pass and reports what it found', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    const { out, actions } = await execute(tokenizeLine('init'), { cwd: dir, yes: true, today: '2026-08-12' });

    assert.ok(out.includes('Step 4 — seed the system'));
    assert.ok(out.includes('read-only'));
    assert.ok(out.includes('color-primary'), 'the most-used value leads the preview');
    assert.ok(out.includes('Run `phyllum tokenise` to review them'));
    assert.ok(actions.some((action) => action.startsWith('tokenise-seed-')));
  });
});

test('the seeded pass names nothing on the user’s behalf', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    await execute(tokenizeLine('init'), { cwd: dir, yes: true, today: '2026-08-12' });

    const model = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
    assert.deepEqual(model.tokens.colours, [], 'a walkthrough that assumed yes must not name tokens');
    assert.deepEqual(model.tokens.numbers, []);
    assert.deepEqual(model.tokens.typography, []);
  });
});

test('declining the seed skips it, and says how to run it later', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    const { out, actions } = await execute(tokenizeLine('init'), {
      cwd: dir,
      yes: false,
      confirm: async (question) => !question.includes('tokenise'),
      today: '2026-08-12',
    });
    assert.ok(actions.includes('tokenise-seed-skipped'));
    assert.ok(out.includes('`phyllum tokenise` runs the same pass whenever you want it'));
  });
});

test('init on a project with no styles says so rather than showing an empty list', async () => {
  await withTempDir(async (dir) => {
    const { out } = await execute(tokenizeLine('init'), { cwd: dir, yes: true, today: '2026-08-12' });
    assert.ok(out.includes('no colours, numbers or typography to name yet'));
  });
});
