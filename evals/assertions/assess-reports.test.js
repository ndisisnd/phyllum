/**
 * Assertions for the numbered drift reports (v0.9.0 phase 1).
 *
 * Three separate promises are checked here, because they fail in three
 * different ways.
 *
 * **The numbering is numeric.** The bug this guards is the one every
 * directory-listing implementation has: `assess-10.md` sorting before
 * `assess-9.md` and the eleventh report overwriting the ninth. Gaps and
 * strangers in `.phyllum/` are checked in the same breath, since both are
 * states a real project reaches by hand.
 *
 * **The report is byte-stable.** The date is the only thing in a report that
 * could come from a clock, so the same assessment rendered twice with the same
 * date must be the same bytes — the property that makes two reports diffable
 * against each other.
 *
 * **The recommendations block parses without an LLM.** This is the handoff to
 * Build in v0.10.0, so the check is deliberately made the way Build will make
 * it: find the fence, parse the body, read the fields by name.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  ASSESS_REPORT_PATTERN,
  RECOMMENDATIONS_FENCE,
  RECOMMENDATIONS_SCHEMA_VERSION,
  latestReportNumber,
  listReportNumbers,
  listReports,
  nextReportNumber,
  parseRecommendations,
  readAssessReport,
  recommendationsFrom,
  renderAssessReport,
  reportDate,
  reportPathFor,
  writeAssessReport,
} from '../../lib/assess-reports.js';
import { scoreAssessment } from '../../lib/assess-score.js';
import { ASSESS_REPORT_PREFIX, assessReportFile } from '../../lib/write.js';
import { diffSnapshots, snapshotContents, withTempDir } from './helpers.js';

const DAY = '2026-08-24';

/** An assessment with findings in three families, shaped as the scan emits. */
function sampleResult() {
  const result = {
    values: {
      uncovered: [
        { severity: 'error', rule: 'raw-colour', value: '#3b82f6', count: 12, files: ['a.css', 'b.css'] },
        { severity: 'error', rule: 'raw-colour', value: '#3B82F6', count: 4, files: ['c.css'] },
        { severity: 'warn', rule: 'raw-spacing', value: '13px', count: 1, files: ['d.css'] },
      ],
    },
    naming: {
      findings: [
        { severity: 'warn', rule: 'naming-drift', value: 'primaryColor', evidence: ['primary-color'] },
      ],
    },
    props: { findings: [] },
    similarity: { findings: [] },
    hygiene: { findings: [] },
    extras: { findings: [] },
  };
  result.score = scoreAssessment(result);
  return result;
}

/** Drop `n` empty report files into a project's state directory. */
function seedReports(root, numbers) {
  fs.mkdirSync(path.join(root, '.phyllum'), { recursive: true });
  for (const n of numbers) {
    fs.writeFileSync(path.join(root, '.phyllum', `assess-${n}.md`), `# Assessment ${n}\n`);
  }
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

test('a project with no reports starts at 1', async () => {
  await withTempDir(async (dir) => {
    assert.deepEqual(listReportNumbers(dir), []);
    assert.equal(latestReportNumber(dir), null);
    assert.equal(nextReportNumber(dir), 1);
  });
});

test('report numbers are ordered numerically, not lexicographically', async () => {
  await withTempDir(async (dir) => {
    seedReports(dir, [1, 2, 9, 10, 11]);
    assert.deepEqual(listReportNumbers(dir), [1, 2, 9, 10, 11]);
    // The lexicographic answer here is 10, and the next report would overwrite
    // an existing file. The numeric answer is 12.
    assert.equal(latestReportNumber(dir), 11);
    assert.equal(nextReportNumber(dir), 12);
  });
});

test('a gap in the numbering does not get reused', async () => {
  await withTempDir(async (dir) => {
    seedReports(dir, [1, 3, 4]);
    assert.deepEqual(listReportNumbers(dir), [1, 3, 4]);
    assert.equal(nextReportNumber(dir), 5);
  });
});

test('unrelated files in .phyllum/ are ignored', async () => {
  await withTempDir(async (dir) => {
    seedReports(dir, [1, 2]);
    const state = path.join(dir, '.phyllum');
    fs.writeFileSync(path.join(state, 'assess.json'), '{}\n');
    fs.writeFileSync(path.join(state, 'session.json'), '{}\n');
    fs.writeFileSync(path.join(state, 'PRD.md'), '# PRD\n');
    fs.writeFileSync(path.join(state, 'assess-report.md'), 'no number\n');
    fs.writeFileSync(path.join(state, 'assess-2.md.bak'), 'not a report\n');
    fs.writeFileSync(path.join(state, 'assess-007.md'), 'padded\n');
    fs.writeFileSync(path.join(state, 'build-report-9.md'), 'another stage\n');
    fs.mkdirSync(path.join(state, 'assess-99.md'), { recursive: true });

    assert.deepEqual(listReportNumbers(dir), [1, 2]);
    assert.equal(nextReportNumber(dir), 3);
  });
});

test('the report path is derived from the write funnel', () => {
  assert.equal(reportPathFor(3), '.phyllum/assess-3.md');
  assert.equal(reportPathFor(3), assessReportFile(3));
  assert.ok(assessReportFile(3).startsWith(ASSESS_REPORT_PREFIX));
  assert.ok(ASSESS_REPORT_PATTERN.test('assess-10.md'));
  assert.ok(!ASSESS_REPORT_PATTERN.test('assess-.md'));
  assert.throws(() => reportPathFor(0), RangeError);
  assert.throws(() => reportPathFor('two'), RangeError);
});

test('listReports pairs each number with its path', async () => {
  await withTempDir(async (dir) => {
    seedReports(dir, [2, 10]);
    assert.deepEqual(listReports(dir), [
      { number: 2, path: '.phyllum/assess-2.md' },
      { number: 10, path: '.phyllum/assess-10.md' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Dating
// ---------------------------------------------------------------------------

test('the date is injectable and renders byte-stably', () => {
  // Built from local parts, so the assertion says the same thing in every zone
  // the suite might run in.
  assert.equal(reportDate(new Date(2026, 7, 24, 23, 59, 59)), '2026-08-24');
  assert.equal(reportDate(new Date(2026, 0, 1, 0, 0, 0)), '2026-01-01', 'month and day are padded');

  const result = sampleResult();
  const once = renderAssessReport({ number: 1, date: DAY, result });
  const twice = renderAssessReport({ number: 1, date: DAY, result });
  assert.equal(once, twice);
  assert.ok(once.includes(`Date: ${DAY}`));

  const other = renderAssessReport({ number: 1, date: '2026-09-01', result });
  assert.notEqual(once, other, 'a different date must produce a different report');
});

test('the date is the reader’s own, not UTC’s', () => {
  // 04:00 in +08 is still yesterday in UTC. `toISOString()` would date the
  // report a day behind the calendar of the person reading it, which is a day
  // they would then have to second-guess. The clock is read locally instead.
  const early = new Date(2026, 7, 24, 4, 0, 0);
  assert.equal(reportDate(early), '2026-08-24');
  assert.equal(
    reportDate(early),
    `${early.getFullYear()}-${String(early.getMonth() + 1).padStart(2, '0')}-${String(early.getDate()).padStart(2, '0')}`,
    'the report agrees with the local calendar in whatever zone it runs',
  );
});

test('a report refuses to render without its own date', () => {
  const result = sampleResult();
  assert.throws(() => renderAssessReport({ number: 1, result }), TypeError);
  assert.throws(() => renderAssessReport({ number: 1, date: '24/08/2026', result }), TypeError);
});

// ---------------------------------------------------------------------------
// The template
// ---------------------------------------------------------------------------

test('the template carries date, summary, drift, health score and recommendations, in order', () => {
  const text = renderAssessReport({ number: 4, date: DAY, result: sampleResult() });
  const headings = text
    .split('\n')
    .filter((line) => line.startsWith('#'))
    .map((line) => line.replace(/^#+\s*/, ''));
  assert.deepEqual(headings, [
    'Assessment 4',
    'Summary',
    'Drift',
    'Health score',
    'Recommendations',
  ]);
  assert.ok(text.indexOf(`Date: ${DAY}`) < text.indexOf('## Summary'));
  assert.ok(text.endsWith('\n'));
});

test('the template stays lightweight', () => {
  const text = renderAssessReport({ number: 1, date: DAY, result: sampleResult() });
  const prose = text.split('\n').slice(0, text.split('\n').indexOf('```phyllum-recommendations'));
  assert.ok(prose.length < 40, `the readable half of a report is ${prose.length} lines`);
});

test('a clean assessment still renders every section', () => {
  const clean = { values: { uncovered: [] }, naming: { findings: [] }, props: { findings: [] }, similarity: { findings: [] }, hygiene: { findings: [] }, extras: { findings: [] } };
  clean.score = scoreAssessment(clean);
  const text = renderAssessReport({ number: 1, date: DAY, result: clean });
  assert.ok(text.includes('## Recommendations'));
  assert.ok(text.includes('Nothing to do.'));
  assert.deepEqual(parseRecommendations(text).recommendations, []);
});

// ---------------------------------------------------------------------------
// The recommendations block
// ---------------------------------------------------------------------------

test('recommendations are one row per rule, ordered deterministically', () => {
  const rows = recommendationsFrom(sampleResult());
  assert.equal(rows.length, 3, 'three rules produced findings');
  assert.equal(rows[0].family, 'lint');
  assert.equal(rows[0].rule, 'raw-colour');
  assert.equal(rows[0].severity, 'error', 'the worst severity in the group wins');
  assert.equal(rows[0].count, 2);
  assert.ok(rows[0].action, 'a known rule carries its action from refs/assess/');
  assert.equal(rows[1].severity, 'warn');
  assert.equal(rows[2].severity, 'warn');
  assert.deepEqual(rows, recommendationsFrom(sampleResult()), 'two runs, one order');
});

test('the recommendations block parses without an LLM', () => {
  const text = renderAssessReport({ number: 2, date: DAY, result: sampleResult() });
  assert.ok(text.includes(`\`\`\`${RECOMMENDATIONS_FENCE}`), 'the fence declares its format');

  const parsed = parseRecommendations(text);
  assert.equal(parsed.schemaVersion, RECOMMENDATIONS_SCHEMA_VERSION);
  assert.equal(parsed.recommendations.length, 3);
  for (const row of parsed.recommendations) {
    for (const field of ['id', 'family', 'rule', 'severity', 'count', 'action', 'evidence']) {
      assert.ok(field in row, `a recommendation must carry ${field}`);
    }
    assert.equal(typeof row.id, 'string');
    assert.equal(typeof row.count, 'number');
    assert.ok(Array.isArray(row.evidence));
  }
});

test('the block and the prose above it list the same recommendations', () => {
  const text = renderAssessReport({ number: 2, date: DAY, result: sampleResult() });
  const { recommendations } = parseRecommendations(text);
  const prose = text.slice(text.indexOf('## Recommendations'), text.indexOf('```'));
  for (const row of recommendations) {
    assert.ok(prose.includes(`\`${row.rule}\``), `${row.rule} is missing from the readable list`);
  }
});

test('a report with no block reads as null, and a broken block throws', () => {
  assert.equal(parseRecommendations('# Assessment 1\n\nNo block here.\n'), null);
  assert.throws(
    () => parseRecommendations(`# A\n\n\`\`\`${RECOMMENDATIONS_FENCE}\n{ nope }\n\`\`\`\n`),
    SyntaxError,
  );
  assert.throws(
    () => parseRecommendations(`# A\n\n\`\`\`${RECOMMENDATIONS_FENCE}\n{"a":1}\n`),
    SyntaxError,
  );
});

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

test('writing a report lands in .phyllum/ and nowhere else', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), '# Design System\n');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'app.css'), '.a { color: #3b82f6; }\n');

    const before = snapshotContents(dir);
    const written = writeAssessReport(dir, sampleResult(), { date: DAY });
    const after = snapshotContents(dir);
    const diff = diffSnapshots(before, after);

    assert.equal(written.number, 1);
    assert.equal(written.date, DAY);
    assert.equal(written.path, '.phyllum/assess-1.md');
    assert.deepEqual(diff.added, ['.phyllum/assess-1.md']);
    assert.deepEqual(diff.changed, []);
    assert.deepEqual(diff.removed, []);
  });
});

test('consecutive writes take consecutive numbers', async () => {
  await withTempDir(async (dir) => {
    const result = sampleResult();
    assert.equal(writeAssessReport(dir, result, { date: DAY }).number, 1);
    assert.equal(writeAssessReport(dir, result, { date: DAY }).number, 2);
    seedReports(dir, [9]);
    assert.equal(writeAssessReport(dir, result, { date: DAY }).number, 10);
    assert.deepEqual(listReportNumbers(dir), [1, 2, 9, 10]);
  });
});

test('a written report round-trips through the reader and the parser', async () => {
  await withTempDir(async (dir) => {
    const written = writeAssessReport(dir, sampleResult(), { date: DAY });
    const text = readAssessReport(dir, written.number);
    assert.equal(text, renderAssessReport({ number: 1, date: DAY, result: sampleResult() }));
    assert.equal(Buffer.byteLength(text), written.bytes);
    assert.equal(parseRecommendations(text).recommendations.length, 3);
    assert.equal(readAssessReport(dir, 99), null);
  });
});
