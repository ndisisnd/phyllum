/**
 * Assertions for the scan, the clustering and the rerun diff (plan §4, §8.5).
 *
 * The promise this file exists to prove is the one the plan puts first: the
 * scan is **read-only**. Every check that runs a scan diffs the whole directory
 * around it and demands that nothing at all changed — not one byte, not one new
 * file — because a tool that reads your codebase has to earn that trust before
 * it asks to write a single line.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse } from '../../lib/design-system.js';
import {
  clusterSightings,
  deltaE,
  ladderNames,
  normaliseValue,
  proposeTokens,
  ruleBlocks,
  scanCodebase,
  tailwindDeclarations,
  toPx,
  tokenise,
} from '../../lib/tokenise.js';
import { roleForProperty, sources, threshold } from '../../lib/tokenise-spec.js';
import {
  FIXTURES,
  POPULATED_FIXTURE,
  copyDir,
  diffSnapshots,
  readFixture,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const MIXED = path.join(FIXTURES, 'codebases', 'tokenise-mixed');
const emptySystem = () => parse(readFixture(path.join(FIXTURES, 'design-system', 'empty.md')));

const proposalNamed = (proposals, name) => proposals.find((proposal) => proposal.name === name);
const memberValues = (proposal) => proposal.members.map((member) => member.raw);

/** A copy of the fixture codebase, so a test can add a file to it. */
async function withCodebase(body) {
  return withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    return body(dir);
  });
}

test('the scan writes nothing at all — not one byte of the codebase', async () => {
  await withCodebase(async (dir) => {
    const before = snapshotContents(dir);
    const sightings = scanCodebase(dir);
    assert.ok(sightings.length > 0, 'the scan found something to be read-only about');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('proposing tokens writes nothing either — only acceptance writes', async () => {
  await withCodebase(async (dir) => {
    const before = snapshotContents(dir);
    const { proposals } = tokenise(dir, emptySystem());
    assert.ok(proposals.length > 0);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('there is no write call anywhere in the scanning engine', () => {
  const engine = fs.readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), '../../lib/tokenise.js'),
    'utf8',
  );
  for (const forbidden of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'rmSync']) {
    assert.ok(!engine.includes(forbidden), `lib/tokenise.js must not call ${forbidden}`);
  }
});

test('the three passes each find their own kind of value', () => {
  const sightings = scanCodebase(MIXED);
  const passes = new Set(sightings.map((sighting) => sighting.pass));
  assert.deepEqual([...passes].sort(), ['colours', 'numbers', 'typography']);

  const colour = sightings.find((sighting) => sighting.value === '#2563EB');
  assert.equal(colour.pass, 'colours');
  assert.equal(colour.count, 14, 'the plan’s canonical count');

  const radius = sightings.find(
    (sighting) => sighting.pass === 'numbers' && sighting.role === 'radius' && sighting.value === '12px',
  );
  assert.ok(radius, 'a corner radius is a number with a role, not just a length');

  const type = sightings.find((sighting) => sighting.pass === 'typography' && sighting.size === '12px');
  assert.equal(type.weight, '700');
  assert.equal(type.lineHeight, '1.3');
});

test('the scan reads stylesheets, inline styles and Tailwind arbitrary values', () => {
  const sightings = scanCodebase(MIXED);
  const files = new Set(sightings.flatMap((sighting) => sighting.files));
  assert.ok(files.has('src/styles.css'), 'stylesheets');
  assert.ok(files.has('index.html'), 'inline style attributes');
  assert.ok(files.has('src/Button.jsx'), 'inline style objects and Tailwind arbitrary values');

  assert.deepEqual(tailwindDeclarations('class="rounded-[12px] bg-[#2563EB] text-[12px]"'), [
    { property: 'border-radius', value: '12px' },
    { property: 'background', value: '#2563EB' },
    { property: 'font-size', value: '12px' },
  ]);
  // Tailwind's own named scale is somebody else's token set, not a raw value.
  assert.deepEqual(tailwindDeclarations('class="px-4 text-sm rounded-md"'), []);
});

test('shorthands are split rather than skipped', () => {
  const blocks = ruleBlocks('.a { padding: 12px 16px; border: 1px solid #2563EB; }');
  assert.deepEqual(blocks[0], [
    { property: 'padding', value: '12px 16px' },
    { property: 'border', value: '1px solid #2563EB' },
  ]);

  const sightings = scanCodebase(MIXED);
  const border = sightings.find((s) => s.pass === 'numbers' && s.role === 'border');
  assert.equal(border.value, '1px', 'the length in `border:` is a border width');
  assert.ok(
    sightings.some((s) => s.pass === 'colours' && s.properties.includes('border')),
    'and the colour in the same shorthand is a colour',
  );
});

test('the scan skips the directories the spec table says it skips', async () => {
  await withCodebase(async (dir) => {
    fs.mkdirSync(path.join(dir, 'node_modules', 'thing'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'thing', 'a.css'), '.x { color: #ABCDEF; }');
    assert.ok(sources().skipped.includes('node_modules'));
    const sightings = scanCodebase(dir);
    assert.ok(!sightings.some((sighting) => sighting.value === '#ABCDEF'), 'vendor code is not your design system');
  });
});

test('near-identical values cluster into one proposal, most-used representing it', () => {
  const { proposals } = tokenise(MIXED, emptySystem());
  const blue = proposalNamed(proposals, 'color-primary');
  assert.equal(blue.value, '#2563EB', 'the representative is a value that exists in the code');
  assert.deepEqual(memberValues(blue).sort(), ['#2563EB', '#2564EC']);
  assert.equal(blue.count, 16, '14 + 2 sightings, reviewed as one decision');
  assert.ok(blue.merged);

  const radius = proposalNamed(proposals, 'rounded-md');
  assert.deepEqual(memberValues(radius).sort(), ['11px', '12px']);
  assert.equal(radius.value, '12px');
});

test('values that are genuinely different stay apart', () => {
  const { proposals } = tokenise(MIXED, emptySystem());
  const blue = proposalNamed(proposals, 'color-primary');
  assert.ok(!memberValues(blue).includes('#FFFFFF'));

  // Same number, different role: a 12px radius is not an 8px padding's neighbour.
  const spacing = proposals.filter((proposal) => proposal.role === 'spacing');
  assert.ok(spacing.length >= 2);
  for (const proposal of spacing) assert.ok(!memberValues(proposal).includes('12px'));
});

test('the clustering thresholds come from the table, not from the code', () => {
  assert.equal(threshold('colours'), 3);
  assert.equal(threshold('numbers'), 1);
  assert.ok(deltaE('#2563EB', '#2564EC') < threshold('colours'));
  assert.ok(deltaE('#2563EB', '#FFFFFF') > threshold('colours'));
  assert.equal(toPx('0.75rem'), 12, 'rem is read at 16px — for comparison only');
});

test('proposals are ranked by frequency, most-used first', () => {
  const { proposals } = tokenise(MIXED, emptySystem());
  const counts = proposals.map((proposal) => proposal.count);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  assert.equal(proposals[0].name, 'color-primary', 'the blue the codebase leans on hardest leads');
});

test('names follow the documented scales', () => {
  const { proposals } = tokenise(MIXED, emptySystem());
  assert.ok(proposalNamed(proposals, 'color-primary'), 'the most-used chromatic colour');
  assert.ok(proposalNamed(proposals, 'color-surface'), 'near-white is a surface');
  assert.ok(proposalNamed(proposals, 'color-text'), 'near-black is text');
  assert.ok(proposalNamed(proposals, 'rounded-md'), 'the plan’s own radius example');
  assert.ok(proposalNamed(proposals, 'space-md'), 'the middle of three spacing steps');
  assert.ok(proposalNamed(proposals, 'highlight-small'), 'the plan’s own typography example');
});

test('a lone value on a ladder lands on the centre rung, not the smallest', () => {
  assert.deepEqual(ladderNames('radius', 1), ['rounded-md']);
  assert.deepEqual(ladderNames('radius', 2), ['rounded-sm', 'rounded-md']);
  assert.deepEqual(ladderNames('radius', 3), ['rounded-sm', 'rounded-md', 'rounded-lg']);
  assert.deepEqual(ladderNames('spacing', 3), ['space-sm', 'space-md', 'space-lg']);
  assert.equal(ladderNames('radius', 8).length, 8, 'overflow is numbered rather than dropped');
});

test('a name already taken gets a suffix rather than being reused', () => {
  const { proposals } = tokenise(MIXED, emptySystem());
  const names = proposals.map((proposal) => proposal.name);
  assert.equal(new Set(names).size, names.length, 'no two proposals claim the same name');
});

test('the role table decides which spec key a number token may fill', () => {
  assert.equal(roleForProperty('border-radius'), 'radius');
  assert.equal(roleForProperty('radius'), 'radius', 'Phyllum’s own spec key, same role');
  assert.equal(roleForProperty('padding-top'), 'spacing');
  assert.equal(roleForProperty('font-size'), null, 'type is the typography pass’s business');
});

test('a value the system already names is matched silently, not proposed again', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  const { proposals } = tokenise(MIXED, model);
  const names = proposals.map((proposal) => proposal.name);
  assert.ok(!names.includes('color-primary'), '#2563EB is already color-primary');
  assert.ok(
    !proposals.some((proposal) => memberValues(proposal).includes('#2563EB')),
    'and neither is the near-identical member that clusters with it',
  );
});

test('values are compared normalised, and recorded exactly as written', () => {
  assert.equal(normaliseValue('#ABC'), '#aabbcc');
  assert.equal(normaliseValue('  #2563EB '), '#2563eb');
  assert.equal(normaliseValue('rgb(37, 99, 235)'), 'rgb(37,99,235)');

  const model = parse(readFixture(POPULATED_FIXTURE));
  model.tokens.colours = [['color-brand', '#2563eb', 'lower case on purpose']];
  const { proposals } = tokenise(MIXED, model);
  assert.ok(
    !proposals.some((proposal) => proposal.value === '#2563EB'),
    'case is not a difference in intent',
  );
});

test('clustering is deterministic — the same codebase, the same proposals', () => {
  const once = tokenise(MIXED, emptySystem()).proposals.map((p) => `${p.name}:${p.value}:${p.count}`);
  const twice = tokenise(MIXED, emptySystem()).proposals.map((p) => `${p.name}:${p.value}:${p.count}`);
  assert.deepEqual(twice, once);
});

test('an empty project proposes nothing rather than inventing a starter set', async () => {
  await withTempDir(async (dir) => {
    const { proposals } = tokenise(dir, emptySystem());
    assert.deepEqual(proposals, []);
  });
});

test('clusterSightings groups by intent, and keeps the order it was given', () => {
  const sightings = [
    { pass: 'colours', value: '#2563EB', count: 14, files: ['a.css'], properties: ['color'] },
    { pass: 'colours', value: '#2564EC', count: 2, files: ['b.css'], properties: ['color'] },
    { pass: 'colours', value: '#FFFFFF', count: 9, files: ['a.css'], properties: ['color'] },
  ];
  const clusters = clusterSightings(sightings);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].count, 16, 'the merged blue outranks the white it beats');
  assert.equal(clusters[0].representative.value, '#2563EB');
  assert.deepEqual(clusters[0].files, ['a.css', 'b.css']);
});
