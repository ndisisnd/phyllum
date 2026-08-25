/**
 * Assertions for the numbered build reports (v0.10.0 phase 3).
 *
 * Mirrors `evals/assertions/assess-reports.test.js` closely, because
 * `lib/build-reports.js` mirrors `lib/assess-reports.js` closely — the same
 * three promises, checked the same way, for the report Build leaves behind
 * instead of the one Assess does.
 *
 * **The numbering is numeric**, and strangers — `assess-*.md` reports
 * included — are ignored. **The report is byte-stable**, because the date is
 * the only clock-derived thing in it. **The source block parses without an
 * LLM**, the same handoff shape `phyllum-recommendations` gives Build, this
 * time for whatever reads a build report back later.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  BUILD_PHASE_MAX_ITEMS,
  BUILD_PHASE_THRESHOLD,
  BUILD_REPORT_PATTERN,
  BUILD_SOURCE_FENCE,
  BUILD_SOURCE_SCHEMA_VERSION,
  latestBuildReportNumber,
  listBuildReportNumbers,
  listBuildReports,
  nextBuildReportNumber,
  parseBuildSource,
  planBuildPhases,
  readBuildReport,
  renderBuildReport,
  writeBuildReport,
} from '../../lib/build-reports.js';
import { BUILD_REPORT_PREFIX, buildReportFile } from '../../lib/write.js';
import { diffSnapshots, snapshotContents, withTempDir } from './helpers.js';

const DAY = '2026-08-24';

const reportInput = { source: 'report', prose: null, report: { number: 3, date: DAY, path: '.phyllum/assess-3.md' }, recommendations: [
  { id: 'lint.raw-colour.3b82f6', family: 'lint', rule: 'raw-colour', severity: 'error', count: 16, action: 'Name it in DESIGN-SYSTEM.md.', evidence: ['#3b82f6'] },
] };
const proseInput = { source: 'prose', prose: 'button primary with 12px padding-top', report: null, recommendations: [] };
const noneInput = { source: 'none', prose: null, report: null, recommendations: [] };

/** Drop `n` empty build report files into a project's state directory. */
function seedReports(root, numbers) {
  fs.mkdirSync(path.join(root, '.phyllum'), { recursive: true });
  for (const n of numbers) {
    fs.writeFileSync(path.join(root, '.phyllum', `build-report-${n}.md`), `# Build report ${n}\n`);
  }
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

test('a project with no build reports starts at 1', async () => {
  await withTempDir(async (dir) => {
    assert.deepEqual(listBuildReportNumbers(dir), []);
    assert.equal(latestBuildReportNumber(dir), null);
    assert.equal(nextBuildReportNumber(dir), 1);
  });
});

test('build report numbers are ordered numerically, not lexicographically', async () => {
  await withTempDir(async (dir) => {
    seedReports(dir, [1, 2, 9, 10, 11]);
    assert.deepEqual(listBuildReportNumbers(dir), [1, 2, 9, 10, 11]);
    assert.equal(latestBuildReportNumber(dir), 11);
    assert.equal(nextBuildReportNumber(dir), 12);
  });
});

test('a gap in the numbering does not get reused', async () => {
  await withTempDir(async (dir) => {
    seedReports(dir, [1, 3, 4]);
    assert.deepEqual(listBuildReportNumbers(dir), [1, 3, 4]);
    assert.equal(nextBuildReportNumber(dir), 5);
  });
});

test('unrelated files, including assess reports, are ignored', async () => {
  await withTempDir(async (dir) => {
    seedReports(dir, [1, 2]);
    const state = path.join(dir, '.phyllum');
    fs.writeFileSync(path.join(state, 'assess.json'), '{}\n');
    fs.writeFileSync(path.join(state, 'session.json'), '{}\n');
    fs.writeFileSync(path.join(state, 'PRD.md'), '# PRD\n');
    // Assess's own numbered reports share the directory but not the pattern.
    fs.writeFileSync(path.join(state, 'assess-1.md'), '# Assessment 1\n');
    fs.writeFileSync(path.join(state, 'assess-9.md'), '# Assessment 9\n');
    fs.writeFileSync(path.join(state, 'build-report.md'), 'no number\n');
    fs.writeFileSync(path.join(state, 'build-report-2.md.bak'), 'not a report\n');
    fs.writeFileSync(path.join(state, 'build-report-007.md'), 'padded\n');
    fs.mkdirSync(path.join(state, 'build-report-99.md'), { recursive: true });

    assert.deepEqual(listBuildReportNumbers(dir), [1, 2]);
    assert.equal(nextBuildReportNumber(dir), 3);
  });
});

test('the build report path is derived from the write funnel', () => {
  assert.equal(buildReportFile(3), '.phyllum/build-report-3.md');
  assert.ok(buildReportFile(3).startsWith(BUILD_REPORT_PREFIX));
  assert.ok(BUILD_REPORT_PATTERN.test('build-report-10.md'));
  assert.ok(!BUILD_REPORT_PATTERN.test('build-report-.md'));
  assert.ok(!BUILD_REPORT_PATTERN.test('assess-10.md'));
});

test('listBuildReports pairs each number with its path', async () => {
  await withTempDir(async (dir) => {
    seedReports(dir, [2, 10]);
    assert.deepEqual(listBuildReports(dir), [
      { number: 2, path: '.phyllum/build-report-2.md' },
      { number: 10, path: '.phyllum/build-report-10.md' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Dating — byte stability
// ---------------------------------------------------------------------------

test('the date is injected, never read from a clock inside the renderer, and renders byte-stably', () => {
  const once = renderBuildReport({ number: 1, date: DAY, input: reportInput });
  const twice = renderBuildReport({ number: 1, date: DAY, input: reportInput });
  assert.equal(once, twice, 'two renders of the same input on the same day are the same bytes');
  assert.ok(once.includes(`Date: ${DAY}`));

  const other = renderBuildReport({ number: 1, date: '2026-09-01', input: reportInput });
  assert.notEqual(once, other, 'a different date must produce a different report');
});

test('a build report refuses to render without its own date', () => {
  assert.throws(() => renderBuildReport({ number: 1, input: reportInput }), TypeError);
  assert.throws(() => renderBuildReport({ number: 1, date: '24/08/2026', input: reportInput }), TypeError);
});

// ---------------------------------------------------------------------------
// Rendering all three sources
// ---------------------------------------------------------------------------

test('a report built from a drift report names it in the Source section and the block', () => {
  const text = renderBuildReport({ number: 4, date: DAY, input: reportInput });
  const headings = text
    .split('\n')
    .filter((line) => line.startsWith('#'))
    .map((line) => line.replace(/^#+\s*/, ''));
  assert.deepEqual(headings, ['Build report 4', 'Source', 'Work']);
  assert.ok(text.includes(`Answers: assess-3 (${DAY})`));
  assert.ok(text.includes('raw-colour'), 'the consumed recommendation is named in the Work section');
  assert.ok(text.endsWith('\n'));

  const source = parseBuildSource(text);
  assert.equal(source.source, 'report');
  assert.equal(source.assessReport, 3);
  assert.equal(source.prose, null);
});

test('a report built from prose quotes the sentence in the Source section and the block', () => {
  const text = renderBuildReport({ number: 1, date: DAY, input: proseInput });
  assert.ok(text.includes(`Answers your description: "${proseInput.prose}"`));
  assert.ok(text.includes(proseInput.prose), 'the Work section names what was built');

  const source = parseBuildSource(text);
  assert.equal(source.source, 'prose');
  assert.equal(source.assessReport, null);
  assert.equal(source.prose, proseInput.prose);
});

test('a report built from neither says so plainly, in prose and in the block', () => {
  const text = renderBuildReport({ number: 1, date: DAY, input: noneInput });
  assert.ok(text.includes('Answers neither a drift report nor a description'));
  assert.ok(text.includes('Nothing to do.'));

  const source = parseBuildSource(text);
  assert.equal(source.source, 'none');
  assert.equal(source.assessReport, null);
  assert.equal(source.prose, null);
});

test('a report from a report input with no recommendations still renders every section', () => {
  const empty = { source: 'report', prose: null, report: { number: 5, date: DAY, path: '.phyllum/assess-5.md' }, recommendations: [] };
  const text = renderBuildReport({ number: 1, date: DAY, input: empty });
  assert.ok(text.includes('Answers: assess-5'));
  assert.ok(text.includes('Nothing to do. The report it answers recommended nothing.'));
});

// ---------------------------------------------------------------------------
// Phasing (v0.10.0 phase 4)
// ---------------------------------------------------------------------------

/** `n` recommendations in one family at one severity, deterministically named. */
function rows(family, severity, n, from = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${family}.rule-${from + i}.evidence`,
    family,
    rule: `rule-${from + i}`,
    severity,
    count: n - i,
    action: null,
    evidence: [],
  }));
}

const fromRows = (recommendations) => ({
  source: 'report',
  prose: null,
  report: { number: 7, date: DAY, path: '.phyllum/assess-7.md' },
  recommendations,
});

test('the threshold is a boundary, not a slope: six items stay flat, seven split', () => {
  assert.equal(BUILD_PHASE_THRESHOLD, 6, 'six families, so six items average one apiece');

  const six = rows('lint', 'error', 6);
  assert.equal(planBuildPhases(six), null, 'at the threshold the Work section stays flat');
  const flat = renderBuildReport({ number: 1, date: DAY, input: fromRows(six) });
  assert.ok(!flat.includes('## Phase 1'), 'a small answer gets no phase headings');
  assert.equal(parseBuildSource(flat).phases, null, 'and no phases in the block');

  const seven = rows('lint', 'error', 7);
  const phases = planBuildPhases(seven);
  assert.equal(phases.length, 2, 'seven items in one group is five plus two');
  const split = renderBuildReport({ number: 1, date: DAY, input: fromRows(seven) });
  assert.ok(split.includes('## Phase 1 — error · lint'));
  assert.ok(split.includes('## Phase 2 — error · lint (continued)'));
});

test('nothing at all, and one item, are never phased', () => {
  assert.equal(planBuildPhases([]), null);
  assert.equal(planBuildPhases(rows('lint', 'error', 1)), null);
  assert.equal(planBuildPhases(), null);
});

test('phases group by severity first, then family, and never exceed the cap', () => {
  const input = fromRows([
    ...rows('lint', 'error', 6),
    ...rows('naming', 'error', 2, 10),
    ...rows('lint', 'warn', 3, 20),
    ...rows('extras', 'note', 1, 30),
  ]);
  const phases = planBuildPhases(input.recommendations);

  assert.deepEqual(
    phases.map((phase) => phase.title),
    [
      'error · lint',
      'error · lint (continued)',
      'error · naming',
      'warn · lint',
      'note · extras',
    ],
    'worst severity first, then the order the families arrived in',
  );
  assert.deepEqual(phases.map((phase) => phase.phase), [1, 2, 3, 4, 5], 'numbered from one, in order');
  for (const phase of phases) {
    assert.ok(phase.items.length <= BUILD_PHASE_MAX_ITEMS, `${phase.title} is over the cap`);
  }
  assert.equal(
    phases.reduce((total, phase) => total + phase.items.length, 0),
    input.recommendations.length,
    'every item lands in exactly one phase',
  );
});

test('a phased split is deterministic, whatever order equal-ranked rows arrive in', () => {
  const input = fromRows([...rows('lint', 'error', 5), ...rows('props', 'warn', 4, 40)]);
  const once = planBuildPhases(input.recommendations);
  const twice = planBuildPhases(input.recommendations);
  assert.deepEqual(once, twice, 'the same rows produce the same phases');
  assert.equal(
    renderBuildReport({ number: 2, date: DAY, input }),
    renderBuildReport({ number: 2, date: DAY, input }),
    'and the same bytes',
  );

  // Severity ordering does not depend on the input being pre-sorted: a warn row
  // read first still lands after every error row.
  const shuffled = fromRows([...rows('props', 'warn', 4, 40), ...rows('lint', 'error', 5)]);
  assert.deepEqual(
    planBuildPhases(shuffled.recommendations).map((phase) => phase.title),
    ['error · lint', 'warn · props'],
  );
});

test('a phased report announces the split and carries it in the block', () => {
  const input = fromRows([...rows('lint', 'error', 5), ...rows('props', 'warn', 4, 40)]);
  const text = renderBuildReport({ number: 3, date: DAY, input });

  assert.ok(text.includes('9 items, split into 2 phases'));
  const headings = text
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3));
  assert.deepEqual(headings, ['Source', 'Work', 'Phase 1 — error · lint', 'Phase 2 — warn · props']);

  const parsed = parseBuildSource(text);
  assert.equal(parsed.schemaVersion, BUILD_SOURCE_SCHEMA_VERSION, 'an added field bumps nothing');
  assert.deepEqual(parsed.phases.map((phase) => phase.phase), [1, 2]);
  assert.deepEqual(parsed.phases[1].items, rows('props', 'warn', 4, 40).map((row) => row.id));
});

test('only a report-sourced run is ever phased', () => {
  assert.equal(parseBuildSource(renderBuildReport({ number: 1, date: DAY, input: proseInput })).phases, null);
  assert.equal(parseBuildSource(renderBuildReport({ number: 1, date: DAY, input: noneInput })).phases, null);
});

// ---------------------------------------------------------------------------
// The source block — schema and round-trip
// ---------------------------------------------------------------------------

test('the source block declares its fence and schema version', () => {
  const text = renderBuildReport({ number: 2, date: DAY, input: reportInput });
  assert.ok(text.includes(`\`\`\`${BUILD_SOURCE_FENCE}`));
  const parsed = parseBuildSource(text);
  assert.equal(parsed.schemaVersion, BUILD_SOURCE_SCHEMA_VERSION);
  for (const field of ['schemaVersion', 'source', 'assessReport', 'prose']) {
    assert.ok(field in parsed, `a source block must carry ${field}`);
  }
});

test('a report with no block reads as null, and a broken block throws', () => {
  assert.equal(parseBuildSource('# Build report 1\n\nNo block here.\n'), null);
  assert.throws(
    () => parseBuildSource(`# B\n\n\`\`\`${BUILD_SOURCE_FENCE}\n{ nope }\n\`\`\`\n`),
    SyntaxError,
  );
  assert.throws(
    () => parseBuildSource(`# B\n\n\`\`\`${BUILD_SOURCE_FENCE}\n{"a":1}\n`),
    SyntaxError,
  );
});

test('parseBuildSource round-trips renderBuildReport for all three sources', () => {
  for (const input of [reportInput, proseInput, noneInput]) {
    const text = renderBuildReport({ number: 1, date: DAY, input });
    const parsed = parseBuildSource(text);
    assert.equal(parsed.source, input.source);
  }
});

// ---------------------------------------------------------------------------
// Writing — through the funnel, and nowhere else
// ---------------------------------------------------------------------------

test('writing a build report lands in .phyllum/ and nowhere else', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), '# Design System\n');

    const before = snapshotContents(dir);
    const written = writeBuildReport(dir, { date: DAY, input: reportInput });
    const after = snapshotContents(dir);
    const diff = diffSnapshots(before, after);

    assert.equal(written.number, 1);
    assert.equal(written.date, DAY);
    assert.equal(written.path, '.phyllum/build-report-1.md');
    assert.deepEqual(diff.added, ['.phyllum/build-report-1.md']);
    assert.deepEqual(diff.changed, []);
    assert.deepEqual(diff.removed, []);
  });
});

test('consecutive writes take consecutive numbers, independent of assess-[n].md', async () => {
  await withTempDir(async (dir) => {
    // Assess's own numbering must never leak into Build's — the two counters
    // are independent files under the same directory.
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.phyllum', 'assess-1.md'), '# Assessment 1\n');
    fs.writeFileSync(path.join(dir, '.phyllum', 'assess-2.md'), '# Assessment 2\n');

    assert.equal(writeBuildReport(dir, { date: DAY, input: reportInput }).number, 1);
    assert.equal(writeBuildReport(dir, { date: DAY, input: proseInput }).number, 2);
    seedReports(dir, [9]);
    assert.equal(writeBuildReport(dir, { date: DAY, input: noneInput }).number, 10);
    assert.deepEqual(listBuildReportNumbers(dir), [1, 2, 9, 10]);
    assert.deepEqual(listBuildReportNumbers(dir).length, 4);
  });
});

test('a written build report round-trips through the reader and the parser', async () => {
  await withTempDir(async (dir) => {
    const written = writeBuildReport(dir, { date: DAY, input: reportInput });
    const text = readBuildReport(dir, written.number);
    assert.equal(text, renderBuildReport({ number: 1, date: DAY, input: reportInput }));
    assert.equal(Buffer.byteLength(text), written.bytes);
    assert.equal(parseBuildSource(text).source, 'report');
    assert.equal(readBuildReport(dir, 99), null);
  });
});
