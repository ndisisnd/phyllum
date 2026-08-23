/**
 * Assertions for the typography-reading scan (v0.7.3 plan, phase 4).
 *
 * Phase 3 taught the generator to write CSS from the twenty-one-reading contract
 * table instead of from three fixed row positions. This phase teaches the
 * scanner to read the same table backwards, and the whole point of the phase
 * order is that the two must agree: a reading the generator writes as
 * `letter-spacing` is a reading the scanner must recognise in a `letter-spacing`
 * and nowhere else. The first test in this file is that agreement, checked
 * against the contract itself rather than against a list repeated here.
 *
 * The four promises the phase owns, and where each is proved below:
 *
 *   1. every reading's declaration is scanned for, and what is found is
 *      reported under `raw-typography`;
 *   2. a value the design system already names is coverage, never a proposal
 *      offered a second time;
 *   3. the mapping table and the proposed names carry the new properties;
 *   4. the whole report is still complete with no model attached — the pass is
 *      the scan formatted, and nothing in it asks anybody anything.
 *
 * Like every assertion that runs a scan, the ones that read a fixture project
 * diff the whole directory around the run: a scanner that reads your codebase
 * has to earn that trust before it asks to write a line.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { assess, assessValues } from '../../lib/assess.js';
import { mapRows, meansFor, renderMap, renderReadings } from '../../lib/assess-map.js';
import { findingsOf } from '../../lib/assess-report.js';
import { familyFindings } from '../../lib/assess-score.js';
import {
  READING_CLUSTER,
  assessTypographyReadings,
  clusterReadings,
  coreOf,
  isReadingProperty,
  proposalFor,
  readingSweep,
  readingsInBlock,
  readingsInDeclaration,
  scannedProperties,
  scannedReadings,
} from '../../lib/assess-typography.js';
import { parse } from '../../lib/design-system.js';
import { declarationsFor, readings as contractReadings } from '../../lib/typography.js';
import { lintRuleFor, threshold } from '../../lib/tokenise-spec.js';
import { FIXTURES, copyDir, diffSnapshots, readFixture, snapshotContents, withTempDir } from './helpers.js';

const CODEBASE = path.join(FIXTURES, 'codebases', 'type-readings');

/** The fixture project, parsed, as every check below reads it. */
function fixtureModel() {
  return parse(readFixture(path.join(CODEBASE, 'DESIGN-SYSTEM.md')));
}

/** The reading pass over the fixture project. */
function readingsOfFixture() {
  return assessTypographyReadings(CODEBASE, fixtureModel());
}

// ---------------------------------------------------------------------------
// 1. The scanner and the generator read one contract
// ---------------------------------------------------------------------------

test('every optional reading in the contract is scanned for, and nothing else is', () => {
  const optional = contractReadings().filter(
    (row) => !['size', 'weight', 'line-height'].includes(row.reading),
  );
  assert.deepEqual(
    scannedReadings().map((row) => row.reading),
    optional.map((row) => row.reading),
    'the eighteen optional readings, in the contract table’s own order',
  );
  assert.equal(scannedReadings().length, 18);
});

test('the declaration the generator writes is the declaration the scanner reads', () => {
  for (const row of scannedReadings()) {
    // What phase 3 emits for a token holding exactly this one reading.
    const value = row.kind === 'bare' ? true : row.values[0] ?? '1.5rem';
    const [declaration] = declarationsFor({ [row.reading]: value });
    assert.ok(declaration, `${row.reading} generates a declaration`);

    const read = readingsInDeclaration(declaration.property, declaration.value);
    assert.ok(
      read.some((found) => found.reading === row.reading),
      `${row.reading} is read back out of \`${declaration.property}: ${declaration.value}\``,
    );
  }
});

test('the three core readings are not scanned twice', () => {
  for (const property of ['font-size', 'font-weight', 'line-height']) {
    assert.equal(isReadingProperty(property), false, `${property} belongs to the typography cluster`);
  }
  assert.equal(scannedProperties().includes('letter-spacing'), true);
});

// ---------------------------------------------------------------------------
// 2. Matching one declaration
// ---------------------------------------------------------------------------

test('two readings sharing one declaration are read back as two readings', () => {
  const found = readingsInDeclaration('text-decoration-line', 'underline line-through');
  assert.deepEqual(
    found.map((row) => row.reading),
    ['underline', 'strikethrough'],
    'in the contract table’s order, which is the order the generator merged them in',
  );
});

test('a value naming none of the reading’s words records nothing', () => {
  assert.deepEqual(readingsInDeclaration('font-style', 'normal'), []);
  assert.deepEqual(readingsInDeclaration('text-decoration-line', 'none'), []);
  assert.deepEqual(readingsInDeclaration('font-variant-caps', 'normal'), []);
});

test('a reading whose cell names only a property takes the value verbatim', () => {
  const [found] = readingsInDeclaration('font-family', '"Inter", system-ui, sans-serif');
  assert.equal(found.reading, 'font-family');
  assert.equal(found.value, '"Inter", system-ui, sans-serif', 'commas and quotes survive — never corrected');
});

test('a property no reading owns reads as no reading at all', () => {
  assert.deepEqual(readingsInDeclaration('text-align', 'center'), [], 'a block property is out of the contract');
  assert.deepEqual(readingsInDeclaration('color', '#111827'), []);
});

// ---------------------------------------------------------------------------
// 3. Which type a reading sits on
// ---------------------------------------------------------------------------

test('a block stating its type says which token its readings belong to', () => {
  const block = [
    { property: 'font-size', value: '20px' },
    { property: 'font-weight', value: '600' },
    { property: 'line-height', value: '1.4' },
    { property: 'letter-spacing', value: '0.06em' },
  ];
  assert.deepEqual(coreOf(block), { size: '20px', weight: '600', lineHeight: '1.4' });
  const [sighting] = readingsInBlock(block, 'src/type.css');
  assert.equal(sighting.reading, 'kerning');
  assert.equal(sighting.owner.size, '20px');
});

test('the `font` shorthand names the type as plainly as three declarations do', () => {
  const core = coreOf([{ property: 'font', value: '700 12px/1.3 system-ui' }]);
  assert.deepEqual(core, { size: '12px', weight: '700', lineHeight: '1.3' });
});

test('a block with no size states no type, so its readings have no owner', () => {
  const block = [{ property: 'font-family', value: 'Georgia, serif' }];
  assert.equal(coreOf(block), null);
  assert.equal(readingsInBlock(block, 'src/type.css')[0].owner, null);
});

// ---------------------------------------------------------------------------
// 4. Clustering
// ---------------------------------------------------------------------------

test('one reading value written three times is one row used three times', () => {
  const sightings = [
    { reading: 'kerning', property: 'letter-spacing', kind: 'value', value: '0.06em', file: 'a.css', owner: null },
    { reading: 'kerning', property: 'letter-spacing', kind: 'value', value: '0.06em', file: 'b.css', owner: null },
    { reading: 'kerning', property: 'letter-spacing', kind: 'value', value: '0.06em', file: 'b.css', owner: null },
  ];
  const [cluster] = clusterReadings(sightings);
  assert.equal(clusterReadings(sightings).length, 1);
  assert.equal(cluster.count, 3);
  assert.deepEqual(cluster.files, ['a.css', 'b.css']);
});

test('two readings on one property are two rows, never one', () => {
  const sightings = readingsInBlock(
    [{ property: 'text-decoration-line', value: 'underline line-through' }],
    'a.css',
  );
  assert.equal(clusterReadings(sightings).length, 2, 'underline and strikethrough are two decisions');
});

test('the reading threshold is a row in the contract, and it is exact', () => {
  assert.equal(threshold(READING_CLUSTER), 0, 'a kerning a hair apart is two settings, not one that drifted');
});

test('a value nobody wrote is never the representative', () => {
  const sightings = [
    { reading: 'kerning', property: 'letter-spacing', kind: 'value', value: '0.06em', file: 'a.css', owner: null },
    { reading: 'kerning', property: 'letter-spacing', kind: 'value', value: '16px', file: 'a.css', owner: null },
    { reading: 'kerning', property: 'letter-spacing', kind: 'value', value: '1rem', file: 'a.css', owner: null },
    { reading: 'kerning', property: 'letter-spacing', kind: 'value', value: '1rem', file: 'b.css', owner: null },
  ];
  const clusters = clusterReadings(sightings);
  const merged = clusters.find((cluster) => cluster.merged);
  assert.ok(merged, '16px and 1rem are the same length');
  assert.equal(merged.value, '1rem', 'the most-used member, never an average');
});

// ---------------------------------------------------------------------------
// 5. Coverage and proposals over a real project
// ---------------------------------------------------------------------------

test('every reading’s declaration is found in the codebase', () => {
  const { sightings } = readingSweep(CODEBASE);
  const found = new Set(sightings.map((row) => row.reading));
  for (const reading of ['kerning', 'text-transform', 'underline', 'strikethrough', 'font-family', 'italic-or-oblique', 'slashed-or-lining-zero', 'word-spacing']) {
    assert.ok(found.has(reading), `${reading} was read out of the fixture`);
  }
});

test('a raw value the design system already names is coverage, never a proposal again', () => {
  const result = readingsOfFixture();
  const covered = result.covered.map((row) => [row.reading, row.value, row.token]);
  assert.deepEqual(
    covered.find((row) => row[0] === 'kerning'),
    ['kerning', '0.02em', 'body'],
    'the token that records the reading is named',
  );
  assert.ok(
    covered.some((row) => row[0] === 'text-transform' && row[2] === 'highlight-small'),
    'an enum reading is covered by the token that records it',
  );
  assert.ok(
    covered.some((row) => row[0] === 'underline' && row[2] === 'highlight-small'),
    'a bare reading is covered by any token recording it — there is no other value it could carry',
  );
  for (const row of result.covered) {
    assert.equal(row.severity, null, 'a covered value is evidence, not a finding');
    assert.equal(
      result.proposals.some((proposal) => proposal && proposal.reading === row.reading && proposal.value === row.value),
      false,
      `${row.reading} is not proposed a second time`,
    );
  }
});

test('a raw reading nothing names is a finding in the raw-typography family', () => {
  const result = readingsOfFixture();
  const kerning = result.uncovered.find((row) => row.reading === 'kerning');
  assert.ok(kerning, 'the 0.06em kerning is not named by anything');
  assert.equal(kerning.value, '0.06em');
  assert.equal(kerning.count, 3);
  assert.equal(kerning.severity, 'error', 'written three times is systematic drift');
  for (const row of result.uncovered) {
    assert.equal(row.rule, lintRuleFor({ pass: 'typography' }));
    assert.equal(row.rule, 'raw-typography');
  }
});

test('a reading is proposed onto the token the code itself states', () => {
  const result = readingsOfFixture();
  const kerning = result.uncovered.find((row) => row.reading === 'kerning');
  assert.equal(kerning.proposal.name, 'highlight-large', 'weight picks the role, size picks the band — unchanged');
  assert.equal(kerning.proposal.size, '20px');
  assert.equal(kerning.proposal.weight, '600');
});

test('the proposed name is the one the typography pass proposes for the same rule block', () => {
  const values = assessValues(CODEBASE, fixtureModel());
  const fromCluster = values.proposals.find((proposal) => proposal.pass === 'typography' && proposal.size === '20px');
  const fromReading = values.typography.uncovered.find((row) => row.reading === 'kerning');
  assert.ok(fromCluster && fromReading, 'both passes read the same rule block');
  assert.equal(
    fromReading.proposal.name,
    fromCluster.name,
    'the scanner and the generator agree about which token a reading belongs to',
  );
});

test('two readings on one type share one proposed name', () => {
  const sightings = [
    { reading: 'kerning', property: 'letter-spacing', kind: 'value', value: '0.06em', file: 'a.css', owner: { size: '20px', weight: '600', lineHeight: '1.4' } },
    { reading: 'word-spacing', property: 'word-spacing', kind: 'value', value: '0.1em', file: 'a.css', owner: { size: '20px', weight: '600', lineHeight: '1.4' } },
  ];
  const clusters = clusterReadings(sightings);
  const taken = new Set();
  const named = new Map();
  const names = clusters.map((cluster) => proposalFor(cluster, taken, named).name);
  assert.deepEqual(new Set(names).size, 1, 'one rule block is one token, not two');
});

test('a reading with no type stated around it is asked about, never guessed at', () => {
  const result = readingsOfFixture();
  const face = result.uncovered.find((row) => row.reading === 'font-family');
  assert.ok(face, 'a stray font stack is still a finding');
  assert.equal(face.proposal, null, 'Phyllum will not pick which token it belongs to');
});

// ---------------------------------------------------------------------------
// 6. The mapping table
// ---------------------------------------------------------------------------

test('the mapping table carries the new properties, covered and uncovered alike', () => {
  const result = assess(CODEBASE, fixtureModel());
  const rows = mapRows(result);
  const kerning = rows.find((row) => row.reading === 'kerning' && row.value === '0.06em');
  assert.equal(kerning.bucket, 'proposed');
  assert.equal(kerning.coverage, 'highlight-large (proposed)');

  const named = rows.find((row) => row.reading === 'kerning' && row.value === '0.02em');
  assert.equal(named.bucket, 'named');
  assert.equal(named.coverage, 'body', 'the token that already names it');

  const face = rows.find((row) => row.reading === 'font-family');
  assert.equal(face.coverage, 'ask', 'a question, not a guess');
});

test('the "what it looks like" column names the reading and the declaration', () => {
  assert.equal(meansFor({ reading: 'kerning', property: 'letter-spacing' }), 'kerning on letter-spacing');
  assert.equal(
    meansFor({ reading: 'word-spacing', property: 'word-spacing' }),
    'word-spacing',
    'a reading whose name is its property says it once',
  );
});

test('the map says how many readings were read, so silence is never ambiguous', () => {
  const result = assess(CODEBASE, fixtureModel());
  const line = renderReadings(result);
  assert.match(line, /18 optional typography readings/);
  assert.match(line, /3 already named/);
  assert.ok(renderMap(result, { limit: 40 }).includes(line), 'and it is printed under the table');
});

test('a project writing no readings still says the scan looked', () => {
  const result = assess(path.join(FIXTURES, 'codebases', 'empty-project'), fixtureModel());
  assert.match(renderReadings(result), /no kerning, case, face or decoration is written raw/);
});

// ---------------------------------------------------------------------------
// 7. The findings, the score, and the report with no model
// ---------------------------------------------------------------------------

test('reading findings are counted under raw-typography in the summary', () => {
  const result = assess(CODEBASE, fixtureModel());
  assert.ok(result.summary.byRule['raw-typography'] >= 6, 'the readings join the family they belong to');
  assert.equal(result.summary.typographyReadingsCovered, 3);
  assert.ok(result.summary.typographyReadingsRaw >= 5);
});

test('reading findings reach the lint family, in the report and in the score alike', () => {
  const result = assess(CODEBASE, fixtureModel());
  const inReport = findingsOf(result, 'lint').filter((row) => row.reading);
  const inScore = familyFindings(result).lint.filter((row) => row.reading);
  assert.equal(inReport.length, result.values.typography.uncovered.length);
  assert.equal(inScore.length, inReport.length, 'the report and the score count one set of findings');
});

test('a reading declaration is not also counted as a length with no role', () => {
  const values = assessValues(CODEBASE, fixtureModel());
  for (const row of values.unreadable) {
    for (const property of row.properties) {
      assert.equal(isReadingProperty(property), false, `${property} is read as a reading, so it is not unread`);
    }
  }
});

test('the whole assessment is complete with no model call anywhere in it', async () => {
  await withTempDir(async (dir) => {
    copyDir(CODEBASE, dir);
    const before = snapshotContents(dir);
    const result = assess(dir, fixtureModel());
    // Nothing was asked and nothing was written: the pass is the scan formatted.
    assert.equal(result.readOnly, true);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
    const lines = renderMap(result, { limit: 40 });
    assert.ok(lines.some((line) => line.includes('kerning on letter-spacing')));
    assert.ok(lines.some((line) => line.includes('highlight-large (proposed)')));
  });
});
