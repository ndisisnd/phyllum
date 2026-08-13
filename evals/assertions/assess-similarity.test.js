/**
 * Assertions for the similarity pass — clones, duplicates, overlaps (v0.2.1 §4).
 *
 * This is the first check in `assess` that reads two things against each other,
 * and the first whose answer is a number. Both facts decide what is worth
 * asserting here.
 *
 *   - **The number has to be trustworthy.** A score is in [0, 1], it is built
 *     from weights that live in `refs/assess.md` rather than in the code, and
 *     the same two things score the same on every run. A similarity report is
 *     only usable if `0.813` means one thing, so determinism is asserted
 *     directly rather than assumed from the absence of a model call.
 *   - **The bands are the finding.** 0.79 and 0.81 are not a near miss of each
 *     other: one is a merge suggestion and one is a note. So the boundaries are
 *     asserted from both sides.
 *   - **Quiet is a result.** Most of what a quadratic comparison could say is
 *     noise, so the cases that matter most are the ones asserting an absence —
 *     two unrelated elements, a bundle repeated twice, a project with nothing
 *     alike in it, a block that holds no property Phyllum recognises, and a
 *     stack whose markup was never read.
 *   - **Bounded, and it says so.** The comparison is capped, the caps are read
 *     from the table, and a project past the cap is told what was compared
 *     rather than quietly given a shorter answer.
 *
 * And the promise the whole command rests on: a merge is a suggestion. Nothing
 * in this pass renames, rewrites or removes anything, and the read-only proof
 * runs around the pass that reads the most files.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { assess } from '../../lib/assess.js';
import {
  assessSimilarity,
  blockName,
  blocksIn,
  classWords,
  componentClones,
  fingerprint,
  jaccard,
  signatureScore,
  similarityCaps,
  styleBlocks,
  styleDuplicates,
  utilityOverlaps,
} from '../../lib/assess-similarity.js';
import { renderSimilarity } from '../../lib/assess-command.js';
import { emptyModel } from '../../lib/design-system.js';
import {
  bandFor,
  bandGraded,
  similarityLimit,
  similarityRules,
  similaritySeverityFor,
  similarityWeight,
} from '../../lib/tokenise-spec.js';
import {
  FIXTURES,
  PACKAGE_ROOT,
  copyDir,
  diffSnapshots,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const codebase = (name) => path.join(FIXTURES, 'codebases', name);

const CLONES = codebase('clone-pairs');
const CLEAN = codebase('react-css');
const VUE = codebase('vue-app');

const scan = (root, model = emptyModel()) => assess(root, model).similarity;

/** A signature as `scanMarkup` returns one, for the cases a fixture cannot make. */
const signature = (element, classes, count = 1, files = ['src/App.jsx']) => ({
  signature: [element, ...classes].join('.'),
  element,
  classes,
  count,
  files,
});

const pairOf = (rows, a, b) =>
  rows.find((row) => [...row.pair].sort().join('|') === [a, b].sort().join('|'));

// ---------------------------------------------------------------------------
// The score, and where it comes from (§4.1)
// ---------------------------------------------------------------------------

test('every weight, band and cap is read from the table, not restated in code', () => {
  const spec = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'refs', 'assess.md'), 'utf8');
  for (const marker of [
    '<!-- phyllum:similarity-rules -->',
    '<!-- phyllum:similarity-weights -->',
    '<!-- phyllum:similarity-bands -->',
    '<!-- phyllum:similarity-limits -->',
  ]) {
    assert.ok(spec.includes(marker), `${marker} is missing, so the pass has no contract`);
  }
  const source = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'assess-similarity.js'), 'utf8');
  assert.ok(
    !/[^.\w](0\.8|0\.75|0\.5|0\.25)[^\w]/.test(source.replace(/^\s*\*.*$/gm, '')),
    'a weight or a band is written into the code, where a table cannot reach it',
  );
});

test('the parts of a score sum to one, so a score can never leave [0, 1]', () => {
  const total = similarityWeight('class words') + similarityWeight('element');
  assert.equal(total, 1, 'class words and element are the whole of a signature score');
  assert.equal(similarityWeight('declarations'), 1, 'a block score is its declaration overlap');
});

test('the bands are read from both sides of every boundary', () => {
  assert.equal(bandFor(1).band, 'clone');
  assert.equal(bandFor(0.8).band, 'clone', '0.8 is inside the clone band, as the table says');
  assert.equal(bandFor(0.799).band, 'similar');
  assert.equal(bandFor(0.5).band, 'similar');
  assert.equal(bandFor(0.499), null, 'below the lower band there is no finding at all');
  assert.equal(bandFor(0), null);
});

test('a clone is an error and a pattern similarity is a warning', () => {
  assert.equal(bandFor(0.9).severity, 'error');
  assert.equal(bandFor(0.6).severity, 'warn');
  assert.equal(similaritySeverityFor('component-clone', 0.9), 'error');
  assert.equal(similaritySeverityFor('component-clone', 0.6), 'warn');
  assert.equal(
    similaritySeverityFor('utility-overlap', 1),
    'warn',
    'a repeated bundle is a component waiting to be extracted, whatever it scores',
  );
});

test('only the families the table grades by band carry one', () => {
  assert.equal(bandGraded('component-clone'), true);
  assert.equal(bandGraded('style-duplicate'), true);
  assert.equal(bandGraded('utility-overlap'), false);
  const overlap = scan(CLONES).overlaps[0];
  assert.ok(overlap, 'the fixture has a bundle');
  assert.equal(overlap.band, null, 'a bundle scoring 1 against itself has decided nothing');
});

test('jaccard is overlap as a fraction of everything, not a count of matches', () => {
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['a', 'b'])), 1);
  assert.equal(jaccard(new Set(['a']), new Set(['b'])), 0);
  assert.equal(jaccard(new Set(), new Set()), 0, 'two empty class lists share nothing');
  assert.equal(jaccard(new Set(['a', 'b', 'c']), new Set(['a', 'b', 'c', 'd'])), 0.75);
});

test('class words are compared, so two spellings of one pattern still meet', () => {
  assert.deepEqual([...classWords(['btn--primary'])], ['btn', 'primary']);
  const score = signatureScore(
    signature('div', ['btn--primary']),
    signature('div', ['btnPrimary']),
  );
  assert.equal(score, 1, 'one pattern spelled two ways is one pattern');
});

test('the same signature scores 1 and two unrelated ones score 0', () => {
  const card = signature('div', ['card']);
  assert.equal(signatureScore(card, card), 1);
  assert.equal(signatureScore(signature('div', ['card']), signature('span', ['legend'])), 0);
});

test('the tag is a bonus and not a gate', () => {
  const score = signatureScore(
    signature('div', ['panel', 'panel--muted']),
    signature('section', ['panel', 'panel--muted']),
  );
  assert.equal(score, similarityWeight('class words'), 'identical classes, nothing for the tag');
  assert.equal(bandFor(score).band, 'similar', 'so it can never reach the clone band alone');
});

test('a tag name that is a component is compared by its words', () => {
  const score = signatureScore(signature('Card', []), signature('PrimaryCard', []));
  assert.ok(score > 0, '`Card` and `PrimaryCard` are near, not unrelated');
  assert.ok(score < similarityWeight('element'), 'and near is not the same as identical');
});

// ---------------------------------------------------------------------------
// Component clones (§4.1)
// ---------------------------------------------------------------------------

test('one class apart, on the same tag, is a clone with a survivor', () => {
  const { clones } = scan(CLONES);
  const finding = pairOf(
    clones,
    'div.card.card--elevated.card--padded',
    'div.card.card--elevated.card--padded.card--wide',
  );
  assert.ok(finding, 'the clone pair is reported');
  assert.equal(finding.band, 'clone');
  assert.equal(finding.severity, 'error');
  assert.equal(
    finding.survivor,
    'div.card.card--elevated.card--padded',
    'the survivor is the one the codebase writes more often',
  );
  assert.ok(finding.detail.includes('fold'), 'and the suggestion says which way the merge goes');
});

test('a survivor is decided by use, and by name only when use ties', () => {
  const byUse = componentClones([
    signature('div', ['card', 'a', 'b'], 2, ['src/A.jsx']),
    signature('div', ['card', 'a', 'b', 'c'], 9, ['src/B.jsx']),
  ]);
  assert.equal(byUse.rows[0].survivor, 'div.card.a.b.c', 'nine beats two');

  const byName = componentClones([
    signature('div', ['card', 'a', 'b'], 3, ['src/A.jsx']),
    signature('div', ['card', 'a', 'b', 'c'], 3, ['src/B.jsx']),
  ]);
  assert.equal(
    byName.rows[0].survivor,
    'div.card.a.b',
    'a tie is broken by name, so two runs cannot pick differently',
  );
});

test('a pattern similarity is reported and never given a survivor', () => {
  const finding = pairOf(scan(CLONES).clones, 'div.panel.panel--muted', 'section.panel.panel--muted');
  assert.ok(finding);
  assert.equal(finding.band, 'similar');
  assert.equal(finding.severity, 'warn');
  assert.equal(finding.survivor, null, 'nothing is proposed for a pair this loose');
});

test('two elements with nothing in common are not a finding', () => {
  const { clones } = scan(CLONES);
  assert.equal(pairOf(clones, 'div.footer', 'span.label'), undefined);
  for (const row of clones) assert.ok(row.score >= 0.5, 'nothing below the lower band is reported');
});

test('a bare element is never compared, because it has nothing to be similar with', () => {
  const { rows, compared } = componentClones([
    signature('div', [], 40),
    signature('span', [], 30),
  ]);
  assert.deepEqual(rows, []);
  assert.equal(compared, 0, 'two classless tags are not two candidates for comparison');
});

test('clones are sorted by score, then by name, so the report is byte-stable', () => {
  const { clones } = scan(CLONES);
  const sorted = [...clones].sort((a, b) => b.score - a.score || a.value.localeCompare(b.value));
  assert.deepEqual(clones, sorted);
});

// ---------------------------------------------------------------------------
// Utility overlaps (§4.3)
// ---------------------------------------------------------------------------

test('a long class list repeated across elements is a bundle nobody extracted', () => {
  const finding = scan(CLONES).overlaps.find(
    (row) => row.value === 'flex gap-2 items-center rounded-lg',
  );
  assert.ok(finding, 'the bundle is reported');
  assert.equal(finding.severity, 'warn');
  assert.equal(finding.count, 3);
  assert.ok(finding.detail.includes('never extracted'), 'and the finding says what to do with it');
});

test('both thresholds have to be met before a class list is a bundle', () => {
  const caps = similarityCaps();
  const short = signature('div', ['flex', 'gap-2'], caps.bundleUses + 5);
  const rare = signature(
    'div',
    ['flex', 'gap-2', 'items-center'],
    caps.bundleClasses > 0 ? caps.bundleUses - 1 : 0,
  );
  assert.deepEqual(utilityOverlaps([short], emptyModel()), [], 'too short to be a component');
  assert.deepEqual(utilityOverlaps([rare], emptyModel()), [], 'not repeated often enough yet');
});

test('a bundle the design system already registers is not a bundle to extract', () => {
  const bundle = signature('div', ['flex', 'gap-2', 'items-center'], 9);
  assert.equal(utilityOverlaps([bundle], emptyModel()).length, 1);
  const model = { ...emptyModel(), components: [{ name: 'Flex', variants: [] }] };
  assert.deepEqual(
    utilityOverlaps([bundle], model),
    [],
    'a pattern the system already names is not a pattern it is missing',
  );
});

// ---------------------------------------------------------------------------
// Style duplicates (§4.2)
// ---------------------------------------------------------------------------

test('two names for one rule are one finding, with the shared declarations listed', () => {
  const finding = pairOf(scan(CLONES).duplicates, '.card', '.panel');
  assert.ok(finding);
  assert.equal(finding.score, 1);
  assert.equal(finding.band, 'clone');
  assert.equal(finding.severity, 'error');
  assert.deepEqual(finding.shared, [
    'background: #ffffff',
    'border-radius: 12px',
    'padding: 16px',
  ]);
  assert.deepEqual(finding.files, ['src/styles.css', 'src/styles.css']);
});

test('a styled-components template is a named block, in a plain .js file', () => {
  const blocks = styleBlocks(CLONES, { maxFiles: 2000, maxDepth: 12 });
  const styled = blocks.filter((block) => block.kind === 'styled').map((block) => block.name);
  assert.deepEqual(styled, ['PrimaryBox', 'SecondaryBox']);
  assert.ok(
    blocks.every((block) => !block.file.startsWith('/')),
    'blocks are recorded by their path inside the project',
  );
  const finding = pairOf(scan(CLONES).duplicates, 'PrimaryBox', 'SecondaryBox');
  assert.ok(finding, 'and CSS-in-JS duplicates are found the same way CSS ones are');
  assert.equal(finding.band, 'clone');
});

test('half the same is a similarity, and nothing is suggested for it', () => {
  const finding = pairOf(scan(CLONES).duplicates, '.chip', '.tag');
  assert.ok(finding);
  assert.equal(finding.band, 'similar');
  assert.equal(finding.severity, 'warn');
});

test('a block nothing matches is paired with nothing', () => {
  const { duplicates } = scan(CLONES);
  assert.ok(!duplicates.some((row) => row.pair.includes('.footer')));
});

test('a block is only compared when Phyllum recognises what is in it', () => {
  assert.equal(fingerprint('padding: 16px;'), null, 'one declaration is not a block');
  assert.equal(
    fingerprint('timeout: 30\nretries: 4'),
    null,
    'a config object is not a style block, however many pairs it has',
  );
  const real = fingerprint('padding: 16px;\nborder-radius: 12px;');
  assert.deepEqual([...real].sort(), ['border-radius: 12px', 'padding: 16px']);
});

test('a name is read off whatever opened the block', () => {
  assert.equal(blockName('.card '), '.card');
  assert.equal(blockName('const cardStyle = '), 'cardStyle');
  assert.equal(blockName('export const cardStyle = '), 'cardStyle');
  assert.equal(blockName('   '), '', 'an anonymous block is never reported');
  const anonymous = blocksIn('{ padding: 16px; border-radius: 12px; }', 'src/a.css');
  assert.deepEqual(anonymous, [], 'and a block with no name cannot be a finding');
});

test('one rule read twice out of one file is not a duplicate somebody wrote', () => {
  const block = { name: '.card', kind: 'block', file: 'src/a.css', pairs: new Set(['padding: 16px', 'color: #fff']) };
  assert.deepEqual(styleDuplicates([block, { ...block }]), []);
  const elsewhere = { ...block, file: 'src/b.css' };
  assert.equal(styleDuplicates([block, elsewhere]).length, 1, 'the same name in two files is');
});

// ---------------------------------------------------------------------------
// Bounded, honest, and read-only (§4.4)
// ---------------------------------------------------------------------------

test('the comparison stops at the cap, and says what it compared', async () => {
  const caps = similarityCaps();
  const signatures = [];
  for (let i = 0; i < caps.signatures + 12; i += 1) {
    signatures.push(signature('div', ['card', `card--${i}`], caps.signatures + 12 - i));
  }
  const { compared, total, capped } = componentClones(signatures);
  assert.equal(compared, caps.signatures, 'the cap is the number of patterns compared');
  assert.equal(total, signatures.length, 'and the report still knows how many there were');
  assert.equal(capped, true);

  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' } }));
    const rows = [];
    for (let i = 0; i < 60; i += 1) rows.push(`<div className="card card--${i}">x</div>`);
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), rows.join('\n'));
    const similarity = scan(dir);
    assert.equal(similarity.compared.signatures, caps.signatures);
    assert.equal(similarity.compared.signaturesCapped, true);
    assert.ok(
      renderSimilarity({ similarity }).join('\n').includes(`capped at ${caps.signatures} patterns`),
      'a report that truncates in silence cannot be read',
    );
  });
});

test('a stack whose markup was not read is told so, and its stylesheets still are', () => {
  const similarity = scan(VUE);
  assert.equal(similarity.markupChecked, false);
  assert.deepEqual(similarity.clones, []);
  assert.deepEqual(similarity.overlaps, []);
  assert.ok(similarity.markupReason, 'the question is answered as not asked, with a reason');
  assert.ok(similarity.compared.blocks > 0, 'style blocks read on any stack, so they were read');
});

test('an ordinary project is told nothing in it is alike', () => {
  const similarity = scan(CLEAN);
  assert.deepEqual(similarity.findings, []);
  const report = renderSimilarity({ similarity }).join('\n');
  assert.ok(report.includes('No two patterns'), 'silence is printed as a result, not omitted');
  assert.ok(report.includes('No two named style blocks'));
});

test('the same codebase scores the same on every run', () => {
  const first = scan(CLONES);
  const second = scan(CLONES);
  assert.deepEqual(second, first, 'a similarity score is deterministic or it is decoration');
  assert.equal(
    JSON.stringify(assessSimilarity(CLONES, emptyModel(), { ran: true })),
    JSON.stringify(assessSimilarity(CLONES, emptyModel(), { ran: true })),
    'and byte-stable, ordering included',
  );
});

test('similarity hangs off the assessment, counted by the same summariser', () => {
  const result = assess(CLONES, emptyModel());
  const { similarity, summary } = result;
  assert.equal(summary.clones, similarity.clones.length);
  assert.equal(summary.styleDuplicates, similarity.duplicates.length);
  assert.equal(summary.utilityOverlaps, similarity.overlaps.length);
  assert.equal(summary.similarityFindings, similarity.findings.length);
  assert.equal(similarity.summary.total, similarity.findings.length);
  assert.equal(
    similarity.summary.bySeverity.error + similarity.summary.bySeverity.warn,
    similarity.findings.length,
    'every finding has one of the two severities the rest of the report uses',
  );
  for (const finding of similarity.findings) {
    assert.ok(similarityRules().includes(finding.rule), `${finding.rule} is not a documented family`);
    assert.ok(finding.score >= 0 && finding.score <= 1, 'a score outside [0, 1] is not a score');
    assert.ok(finding.evidence.length > 0, 'a finding without evidence is an assertion');
  }
  assert.equal(
    summary.errors,
    result.values.findings.bySeverity.error,
    'the headline error count is still the value findings alone',
  );
  assert.equal(
    summary.warnings,
    result.values.findings.bySeverity.warn,
    'two components being one component is not more drift — it is fewer components',
  );
});

test('the report prints the score, the band and the promise', () => {
  const report = renderSimilarity(assess(CLONES, emptyModel())).join('\n');
  assert.ok(report.includes('0.813 clone'), 'the number a reader could argue with is printed');
  assert.ok(report.includes('0.75 similar'));
  assert.ok(report.includes('A merge is a suggestion here and nowhere else'));
  assert.ok(!/renamed|rewrote|merged into/.test(report), 'nothing here claims to have changed code');
});

test('scanning a codebase full of clones still writes nothing', async () => {
  await withTempDir(async (dir) => {
    copyDir(CLONES, dir);
    const before = snapshotContents(dir);
    const similarity = assess(dir, emptyModel()).similarity;
    assert.ok(similarity.findings.length > 0, 'there was something to find');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('the similarity module contains no write call', () => {
  const source = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'assess-similarity.js'), 'utf8');
  for (const call of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'renameSync']) {
    assert.ok(!source.includes(call), `${call} has no business on the scan path`);
  }
});

test('the caps a report states are the caps the table declares', () => {
  const caps = similarityCaps();
  assert.equal(caps.signatures, similarityLimit('signatures'));
  assert.equal(caps.blocks, similarityLimit('blocks'));
  assert.equal(caps.pairs, similarityLimit('pairs'));
  assert.ok(caps.pairs > 0 && caps.blocks > 0 && caps.signatures > 0);
});
