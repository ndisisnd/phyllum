/**
 * Assertions for Build's input resolution (v0.10.0 phase 2).
 *
 * The stage's promise is two sentences long — "Build consumes the
 * recommendations of the latest drift report by default" and "explicit prose
 * overrides that default" — and each sentence fails in its own way.
 *
 * **The default has to find the right report.** Latest means numerically
 * latest, gaps and all, which is the same trap `assess-reports.test.js` guards
 * for the writer: `assess-10.md` is newer than `assess-9.md`, and a project
 * whose `assess-2.md` was deleted still reads `assess-4.md`.
 *
 * **The override has to be absolute.** A run carrying prose must not open a
 * report at all — not to check against, not to enrich with. The test for that
 * is a project holding a perfectly good report whose resolution reports none of
 * it.
 *
 * **The five no's have to stay five.** "Never assessed", "recommends nothing"
 * and "block is broken" are three different pieces of news, and a resolver that
 * returned the same empty list for all of them would let the picker tell a user
 * their codebase is clean when in fact nobody ever looked.
 *
 * **A broken block is surfaced, never swallowed.** `parseRecommendations`
 * throws for exactly this reason, and the one wrong answer available here is
 * proceeding as though a clean report had been read.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  RECOMMENDATIONS_FENCE,
  RECOMMENDATIONS_SCHEMA_VERSION,
  renderAssessReport,
  writeAssessReport,
} from '../../lib/assess-reports.js';
import { scoreAssessment } from '../../lib/assess-score.js';
import {
  BUILD_INPUT_SOURCES,
  buildInputAttribution,
  renderBuildInput,
  resolveBuildInput,
} from '../../lib/build-input.js';
import { withTempDir } from './helpers.js';

const DAY = '2026-08-24';

/** An assessment with findings in two families, shaped as the scan emits. */
function sampleResult() {
  const result = {
    values: {
      uncovered: [
        { severity: 'error', rule: 'raw-colour', value: '#3b82f6', count: 12, files: ['a.css'] },
        { severity: 'warn', rule: 'raw-spacing', value: '13px', count: 1, files: ['d.css'] },
      ],
    },
    naming: { findings: [] },
    props: { findings: [] },
    similarity: { findings: [] },
    hygiene: { findings: [] },
    extras: { findings: [] },
  };
  result.score = scoreAssessment(result);
  return result;
}

const cleanResult = () => {
  const clean = {
    values: { uncovered: [] },
    naming: { findings: [] },
    props: { findings: [] },
    similarity: { findings: [] },
    hygiene: { findings: [] },
    extras: { findings: [] },
  };
  clean.score = scoreAssessment(clean);
  return clean;
};

/** Put a report on disk verbatim, without going through the renderer. */
function seedReport(root, number, text) {
  fs.mkdirSync(path.join(root, '.phyllum'), { recursive: true });
  fs.writeFileSync(path.join(root, '.phyllum', `assess-${number}.md`), text);
}

// ---------------------------------------------------------------------------
// No report at all
// ---------------------------------------------------------------------------

test('a project with no .phyllum directory resolves to no input', async () => {
  await withTempDir(async (dir) => {
    const input = resolveBuildInput(dir);
    assert.equal(input.source, 'none');
    assert.equal(input.reason, 'no-reports');
    assert.equal(input.report, null);
    assert.deepEqual(input.recommendations, []);
    assert.equal(input.error, null);
    // Nothing is said about drift, so the flow above stays byte-identical to
    // the one that shipped before this phase.
    assert.equal(renderBuildInput(input), null);
  });
});

test('an empty .phyllum directory is still no reports, not a broken one', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.phyllum', 'session.json'), '{}\n');
    assert.equal(resolveBuildInput(dir).reason, 'no-reports');
  });
});

// ---------------------------------------------------------------------------
// The latest report wins
// ---------------------------------------------------------------------------

test('the latest report is the input, and latest means numerically latest', async () => {
  await withTempDir(async (dir) => {
    seedReport(dir, 9, renderAssessReport({ number: 9, date: '2026-08-01', result: cleanResult() }));
    seedReport(dir, 10, renderAssessReport({ number: 10, date: DAY, result: sampleResult() }));

    const input = resolveBuildInput(dir);
    assert.equal(input.source, 'report');
    assert.equal(input.reason, null);
    // The lexicographic answer is 9, whose block is empty. The numeric answer
    // is 10, whose block is not.
    assert.equal(input.report.number, 10);
    assert.equal(input.report.date, DAY);
    assert.equal(input.report.path, '.phyllum/assess-10.md');
    assert.equal(input.schemaVersion, RECOMMENDATIONS_SCHEMA_VERSION);
    assert.equal(input.recommendations.length, 2);
    assert.equal(input.recommendations[0].rule, 'raw-colour');
    assert.equal(input.recommendations[0].severity, 'error');
  });
});

test('a gap in the numbering does not change which report is latest', async () => {
  await withTempDir(async (dir) => {
    seedReport(dir, 1, renderAssessReport({ number: 1, date: '2026-08-01', result: sampleResult() }));
    seedReport(dir, 4, renderAssessReport({ number: 4, date: DAY, result: sampleResult() }));
    // 2 and 3 were deleted by hand; 4 is still the newest thing on disk.
    assert.equal(resolveBuildInput(dir).report.number, 4);
  });
});

test('a written report round-trips into an input', async () => {
  await withTempDir(async (dir) => {
    const written = writeAssessReport(dir, sampleResult(), { date: DAY });
    const input = resolveBuildInput(dir);
    assert.equal(input.report.number, written.number);
    assert.equal(input.report.path, written.path);
    assert.equal(input.report.date, written.date);
    assert.equal(input.recommendations.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Prose overrides, absolutely
// ---------------------------------------------------------------------------

test('explicit prose overrides a perfectly good report', async () => {
  await withTempDir(async (dir) => {
    writeAssessReport(dir, sampleResult(), { date: DAY });
    const input = resolveBuildInput(dir, { prose: 'button primary with 12px padding-top' });

    assert.equal(input.source, 'prose');
    assert.equal(input.prose, 'button primary with 12px padding-top');
    assert.equal(input.reason, 'prose');
    // Not a filter over the sentence: none of the report comes along.
    assert.equal(input.report, null);
    assert.deepEqual(input.recommendations, []);
    assert.equal(renderBuildInput(input), null);
  });
});

test('prose overrides even a report that would have thrown', async () => {
  await withTempDir(async (dir) => {
    seedReport(dir, 1, `# Assessment 1\n\n\`\`\`${RECOMMENDATIONS_FENCE}\n{ nope }\n\`\`\`\n`);
    const input = resolveBuildInput(dir, { prose: 'a card' });
    assert.equal(input.source, 'prose');
    assert.equal(input.error, null, 'a broken report cannot break a run that never reads it');
  });
});

test('whitespace is not prose', async () => {
  await withTempDir(async (dir) => {
    writeAssessReport(dir, sampleResult(), { date: DAY });
    assert.equal(resolveBuildInput(dir, { prose: '   ' }).source, 'report');
    assert.equal(resolveBuildInput(dir, { prose: null }).source, 'report');
    assert.equal(resolveBuildInput(dir, {}).source, 'report');
  });
});

// ---------------------------------------------------------------------------
// The five ways there is no report input
// ---------------------------------------------------------------------------

test('an empty recommendations block is a result, not a missing one', async () => {
  await withTempDir(async (dir) => {
    seedReport(dir, 1, renderAssessReport({ number: 1, date: DAY, result: cleanResult() }));
    const input = resolveBuildInput(dir);

    assert.equal(input.source, 'none');
    assert.equal(input.reason, 'empty', 'distinct from no-reports and from no-block');
    assert.equal(input.report.number, 1, 'the report is still named — it exists and was read');
    assert.deepEqual(input.recommendations, []);
    assert.equal(input.schemaVersion, RECOMMENDATIONS_SCHEMA_VERSION);
    assert.match(renderBuildInput(input), /recommends nothing/);
  });
});

test('a report written before the block existed reads as no-block', async () => {
  await withTempDir(async (dir) => {
    seedReport(dir, 2, '# Assessment 2\n\nDate: 2026-07-01\n\n## Summary\n\nNothing machine-readable here.\n');
    const input = resolveBuildInput(dir);

    assert.equal(input.reason, 'no-block');
    assert.equal(input.report.number, 2);
    assert.equal(input.report.date, '2026-07-01');
    assert.equal(input.schemaVersion, null);
    assert.match(renderBuildInput(input), /no recommendations block/);
  });
});

test('an unparseable block surfaces its error and is never swallowed', async () => {
  await withTempDir(async (dir) => {
    seedReport(dir, 3, `# Assessment 3\n\nDate: ${DAY}\n\n\`\`\`${RECOMMENDATIONS_FENCE}\n{ nope }\n\`\`\`\n`);
    const input = resolveBuildInput(dir);

    assert.equal(input.source, 'none');
    assert.equal(input.reason, 'unparseable');
    assert.ok(input.error, 'the SyntaxError message reaches the caller');
    assert.match(input.error, new RegExp(RECOMMENDATIONS_FENCE));
    assert.deepEqual(input.recommendations, [], 'no half-read rows leak through');

    const text = renderBuildInput(input);
    assert.match(text, /could not be read/);
    assert.match(text, new RegExp(`assess-3, ${DAY}`), 'the user is told which report is mangled');
  });
});

test('an unclosed block is unparseable too', async () => {
  await withTempDir(async (dir) => {
    seedReport(dir, 1, `# Assessment 1\n\n\`\`\`${RECOMMENDATIONS_FENCE}\n{"a":1}\n`);
    const input = resolveBuildInput(dir);
    assert.equal(input.reason, 'unparseable');
    assert.match(input.error, /never closed/);
  });
});

test('a report with no date is named without one, never with today’s', async () => {
  await withTempDir(async (dir) => {
    seedReport(dir, 5, `# Assessment 5\n\n\`\`\`${RECOMMENDATIONS_FENCE}\n{"schemaVersion":1,"recommendations":[{"id":"a","family":"lint","rule":"raw-colour","severity":"error","count":1,"action":null,"evidence":[]}]}\n\`\`\`\n`);
    const input = resolveBuildInput(dir);
    assert.equal(input.source, 'report');
    assert.equal(input.report.date, null);
    assert.equal(buildInputAttribution(input), 'assess-5');
  });
});

// ---------------------------------------------------------------------------
// The briefing
// ---------------------------------------------------------------------------

test('the briefing attributes every recommendation to its report', async () => {
  await withTempDir(async (dir) => {
    writeAssessReport(dir, sampleResult(), { date: DAY });
    const input = resolveBuildInput(dir);
    const text = renderBuildInput(input);

    assert.equal(buildInputAttribution(input), `assess-1, ${DAY}`);
    assert.ok(text.includes(`From your latest drift report — assess-1, ${DAY}`));
    for (const row of input.recommendations) {
      assert.ok(text.includes(`\`${row.rule}\``), `${row.rule} is missing from the briefing`);
    }
    assert.match(text, /outranks it/, 'the override rule is stated where the default is shown');
    assert.equal(text, renderBuildInput(resolveBuildInput(dir)), 'two runs, one briefing');
  });
});

test('the source vocabulary is closed', () => {
  assert.deepEqual(BUILD_INPUT_SOURCES, ['prose', 'report', 'none']);
});
