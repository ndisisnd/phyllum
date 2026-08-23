/**
 * Assertions for the dashboard's Reports view (v0.9.0 §5).
 *
 * The view has one job: show every numbered report `assess` has written as a
 * table a person can scan, rather than as the Markdown they would otherwise
 * open by hand. So the risks it carries are risks about *honesty*, and this
 * file is those risks, in four groups:
 *
 *   1. **The reader.** `lib/reports-json.js` has to read a report the template
 *      wrote and hand back the fields the tables are built from — the date the
 *      report carries, the drift table the file already holds, the score and
 *      the verdict, and the recommendations out of the machine-readable block.
 *      Newest first, and the file's own numbering, gaps included.
 *   2. **The empty case.** A project that has never run `assess` is not a
 *      broken project. No reports means one plain line, not an empty grid and
 *      not a stack trace.
 *   3. **The rendering.** The recommendations block renders as rows; a report
 *      with no block, a report with an empty block and a report that could not
 *      be read are three different states and read as three different things.
 *   4. **Read-only.** The GUI renders `.phyllum/assess-[n].md` and never
 *      writes one: no write path in the reader, no POST in the view.
 *
 * The page's own rules are lifted out of its `phyllum:reports-contract` region
 * and run here, the way every other page contract in this suite is, so the
 * assertions execute the code the browser executes rather than a restatement
 * of it. Nothing about how the view *looks* is pinned (v0.7.2): a restyle
 * rewrites no assertion in this file.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { writeAssessReport } from '../../lib/assess-reports.js';
import { findPython, runGui, runKill } from '../../lib/gui-command.js';
import { stripTicks, tableAfter } from '../../lib/md-tables.js';
import { reportsJsonForRoot } from '../../lib/reports-json.js';
import { PACKAGE_ROOT, withTempDir } from './helpers.js';

const GUI_PAGE = path.join(PACKAGE_ROOT, 'gui', 'index.html');
const GUI_REF = path.join(PACKAGE_ROOT, 'skill', 'refs', 'gui', 'gui.md');
const readPage = () => fs.readFileSync(GUI_PAGE, 'utf8');

/** The page's reports rules, lifted out and run — no DOM, no network. */
function reportsContract() {
  const text = readPage();
  const start = text.indexOf('// --- phyllum:reports-contract');
  const end = text.indexOf('// --- end phyllum:reports-contract');
  assert.ok(start !== -1 && end > start, 'the page marks its reports-contract region');
  const region = text.slice(start, end);
  assert.ok(!/\b(document|window)\b|fetch\s*\(/.test(region), 'the region touches no DOM and no network');

  const esc = text.match(/const esc = \(value\) =>[\s\S]*?;\n/);
  assert.ok(esc, "the escaper the region leans on is the page's own");

  return new Function(
    `${esc[0]}${region}\nreturn { REPORTS, reportList, reportSummaryRow, reportsTableHtml,` +
      ' driftTableHtml, recommendationsTableHtml, reportDetailHtml };',
  )();
}

/** One recommendation, in the shape the block records. */
const RECOMMENDATION = {
  id: 'lint.uncovered-value.3b82f6',
  family: 'lint',
  rule: 'uncovered-value',
  severity: 'error',
  count: 12,
  action: 'Name it in DESIGN-SYSTEM.md.',
  evidence: ['#3b82f6', '#3B82F6'],
};

/** An assessment result thin enough to write a report from, and no thinner. */
const resultWith = ({ score = 8, verdict = 'drifting' } = {}) => ({
  score: {
    score,
    verdict,
    means: 'some drift, none of it structural',
    total: 3,
    errors: 1,
    warnings: 2,
    mass: 5,
    clean: false,
    families: {
      lint: { total: 3, bySeverity: { error: 1, warn: 2 } },
      hygiene: { total: 0, bySeverity: {} },
    },
  },
});

/** A project with the given reports already written. */
function withReports(dir, numbers) {
  for (const number of numbers) {
    writeAssessReport(dir, resultWith({ score: number + 4 }), {
      number,
      date: `2026-08-${String(number + 9).padStart(2, '0')}`,
      recommendations: [RECOMMENDATION],
    });
  }
}

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

test('every numbered report is read back into fields, newest first', async () => {
  await withTempDir(async (dir) => {
    // 2 is missing on purpose: a deleted report is a gap in the numbering, and
    // the view shows the gap rather than closing it up.
    withReports(dir, [1, 3, 4]);

    const payload = reportsJsonForRoot(dir);
    assert.equal(payload.count, 3);
    assert.deepEqual(payload.reports.map((report) => report.number), [4, 3, 1], 'newest first');

    const newest = payload.reports[0];
    assert.equal(newest.path, '.phyllum/assess-4.md', 'each report says where it lives');
    assert.equal(newest.date, '2026-08-13', 'the report carries its own date');
    assert.equal(newest.health.score, 8);
    assert.ok(newest.health.scaleTop > 0, 'and the top of the scale it was scored against');
    assert.equal(newest.health.verdict, 'drifting');
    assert.ok(newest.summary.length > 0, 'the summary comes through as prose lines');

    // The drift table is the file's own: one row per family the score covers,
    // the empty ones included.
    assert.deepEqual(newest.drift.columns, ['Family', 'Errors', 'Warnings', 'What it covers']);
    assert.deepEqual(newest.drift.rows.map((row) => row[0]), ['lint', 'hygiene']);
    assert.deepEqual(newest.drift.rows[0].slice(0, 3), ['lint', '1', '2']);

    // And the recommendations arrive from the machine-readable block, not from
    // the prose written beside it.
    assert.equal(newest.schemaVersion, 1);
    assert.equal(newest.recommendations.length, 1);
    assert.deepEqual(newest.recommendations[0], RECOMMENDATION);
  });
});

test('a project with no reports says so, rather than failing', async () => {
  await withTempDir(async (dir) => {
    assert.deepEqual(reportsJsonForRoot(dir), { reports: [], count: 0, root: dir });

    // A `.phyllum/` that exists but holds no report reads the same way, and the
    // files that are not reports are ignored rather than counted.
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.phyllum', 'session.json'), '{}');
    fs.writeFileSync(path.join(dir, '.phyllum', 'assess-note.md'), '# not a report');
    assert.equal(reportsJsonForRoot(dir).count, 0);
  });
});

test('one unreadable report is a row, never a blank list', async () => {
  await withTempDir(async (dir) => {
    withReports(dir, [1, 2]);
    // A hand-mangled block: present, and not JSON.
    const broken = path.join(dir, '.phyllum', 'assess-1.md');
    fs.writeFileSync(
      broken,
      fs.readFileSync(broken, 'utf8').replace('"schemaVersion": 1', '"schemaVersion": oops'),
    );

    const payload = reportsJsonForRoot(dir);
    assert.equal(payload.count, 2, 'the good report still lists');
    const bad = payload.reports.find((report) => report.number === 1);
    assert.ok(bad.error, 'and the bad one carries its own error');
    assert.equal(payload.reports.find((report) => report.number === 2).recommendations.length, 1);
  });
});

test('the reader only reads — there is no write path in it', () => {
  const source = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'reports-json.js'), 'utf8');
  assert.ok(!/writeFileSync|mkdirSync|appendFile|rmSync|unlinkSync/.test(source), 'nothing here writes');
  assert.ok(!/writeAssessReport|renderAssessReport/.test(source), 'and it never renders a new report');
});

// ---------------------------------------------------------------------------
// The rendering
// ---------------------------------------------------------------------------

/** How many `<tr>` a fragment holds, head row excluded. */
const bodyRows = (html) => (html.match(/<tr[ >]/g) ?? []).length - (html.includes('<thead') ? 1 : 0);

test('the report list renders as one table, in the order it was handed', () => {
  const contract = reportsContract();
  const payload = {
    reports: [
      { number: 4, date: '2026-08-13', health: { score: 8, scaleTop: 21, verdict: 'drifting' }, recommendations: [RECOMMENDATION] },
      { number: 3, date: '2026-08-12', health: { score: 3, scaleTop: 21, verdict: 'clean' }, recommendations: [] },
      { number: 1, date: '2026-08-10', health: { score: 12, scaleTop: 21, verdict: 'adrift' }, recommendations: [RECOMMENDATION, RECOMMENDATION] },
    ],
  };
  const html = contract.reportsTableHtml(payload, 4);
  assert.equal(bodyRows(html), 3, 'one row per report');
  assert.deepEqual(
    [...html.matchAll(/data-report="(\d+)"/g)].map((match) => match[1]),
    ['4', '3', '1'],
    'the page keeps the order it was given, newest first, gaps and all',
  );
  assert.ok(html.includes('aria-selected="true"'), 'the open report reads as the open one');
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1, 'and only one row does');
  for (const column of contract.REPORTS.columns) assert.ok(html.includes('>' + column + '<'), column);
  assert.ok(html.includes('8 of 21'), 'the score is shown against the scale it was scored on');
  assert.ok(html.includes('drifting'), 'and the verdict in the file\'s own word');
});

test('no reports is a plain line, not an empty table', () => {
  const contract = reportsContract();
  for (const payload of [null, undefined, {}, { reports: [] }, { reports: null }]) {
    const html = contract.reportsTableHtml(payload, null);
    assert.ok(!/<table/.test(html), 'an empty grid would say the view is broken');
    assert.ok(html.includes('No assessments yet'), 'it says there are none yet, plainly');
  }
  // And the detail panel answers the same way rather than throwing on nothing.
  assert.ok(contract.reportDetailHtml(null).includes('No assessments yet'));
});

test('the recommendations block renders as rows', () => {
  const contract = reportsContract();
  const html = contract.recommendationsTableHtml({
    number: 4,
    recommendations: [RECOMMENDATION, { ...RECOMMENDATION, severity: 'warn', rule: 'near-duplicate', count: 2, action: null }],
  });
  assert.equal(bodyRows(html), 2, 'one row per recommendation');
  for (const column of contract.REPORTS.recommendationColumns) {
    assert.ok(html.includes('>' + column + '<'), `the ${column} column is a column`);
  }
  assert.ok(html.includes('uncovered-value') && html.includes('near-duplicate'), 'both rules appear');
  assert.ok(html.includes('Name it in DESIGN-SYSTEM.md.'), 'the action is a cell');
  assert.ok(html.includes('#3b82f6, #3B82F6'), 'the evidence is a cell');
  assert.ok(html.includes(contract.REPORTS.unstated), 'a rule with no action says nothing rather than inventing one');
});

test('three empty states, told apart', () => {
  const contract = reportsContract();
  // No block at all — a report written before the block existed, or edited.
  assert.ok(contract.recommendationsTableHtml({ recommendations: null }).includes(contract.REPORTS.noBlock));
  // A block that parsed and holds nothing — there is simply nothing to do.
  const nothing = contract.recommendationsTableHtml({ recommendations: [] });
  assert.ok(nothing.includes(contract.REPORTS.none) && !/<table/.test(nothing));
  // A report that could not be read at all.
  const unread = contract.reportDetailHtml({ number: 2, error: 'the block is not valid JSON' });
  assert.ok(unread.includes(contract.REPORTS.unread) && unread.includes('not valid JSON'));
});

test('the drift section renders the report file\'s own table', () => {
  const contract = reportsContract();
  const html = contract.driftTableHtml({
    drift: {
      columns: ['Family', 'Errors', 'Warnings', 'What it covers'],
      rows: [['lint', '1', '2', 'raw values your design system does not name'], ['hygiene', '0', '0', 'what collides']],
      note: null,
    },
  });
  assert.equal(bodyRows(html), 2, 'the empty family is a row too — a check that passed is not a check that never ran');
  assert.ok(html.includes('raw values your design system does not name'));

  // A report that measured no drift says so in its own words rather than
  // drawing an empty grid.
  const none = contract.driftTableHtml({ drift: { columns: [], rows: [], note: 'No drift was measured.' } });
  assert.ok(!/<table/.test(none) && none.includes('No drift was measured.'));
});

test('a hostile payload renders rather than throwing', () => {
  const contract = reportsContract();
  const hostile = [null, undefined, 42, 'nope', { reports: 'nope' }, { reports: [null, 7] }];
  for (const payload of hostile) {
    assert.doesNotThrow(() => contract.reportsTableHtml(payload, null), String(payload));
  }
  for (const report of [null, undefined, {}, { number: 1 }, { number: 1, drift: null, health: null }]) {
    assert.doesNotThrow(() => contract.reportDetailHtml(report), String(report));
  }
});

test('a report escapes like every other string a hand-edited file supplies', () => {
  const contract = reportsContract();
  const html = contract.recommendationsTableHtml({
    recommendations: [{ ...RECOMMENDATION, action: '<script>alert(1)</script>', evidence: ['<b>'] }],
  });
  assert.ok(!html.includes('<script>'), 'no report can put a tag on the page');
  assert.ok(html.includes('&lt;script&gt;'), 'it is shown as the text it is');
});

// ---------------------------------------------------------------------------
// The wiring, and what did not change
// ---------------------------------------------------------------------------

test('the view is wired through the one route the dashboard already uses', () => {
  const page = readPage();
  assert.ok(page.includes("fetch('/reports')"), 'the page reads the reports over its own server');
  assert.ok(page.includes('data-view="reports"'), 'and the Assess stage carries the button that opens them');
  assert.ok(page.includes('id="view-reports"'), 'the view is a view like the other three');

  const server = fs.readFileSync(path.join(PACKAGE_ROOT, 'server', 'serve.py'), 'utf8');
  assert.ok(server.includes('def reports_json'), 'the server has a reader for them');
  assert.ok(server.includes('REPORTS_JSON_SCRIPT'), 'and it is the Node one, not a second parser in Python');
  assert.ok(!/reports-json[\s\S]{0,400}open\(/.test(server), 'the server never opens a report itself');
});

test('the GUI is read-only over reports', () => {
  const page = readPage();
  // Every POST the page makes, and where it makes it: still the two relays.
  const posts = [...page.matchAll(/fetch\('([^']+)',\s*\{\s*\n?\s*method: 'POST'/g)].map((m) => m[1]);
  assert.deepEqual(new Set(posts), new Set(['/prompt', '/upload']), 'no report is ever posted anywhere');
  assert.ok(!/\/reports[^']*',\s*\{\s*method: 'POST'/.test(page), 'and /reports is read with GET alone');
});

// Without a `python3` there is no server to ask, so the one live test skips
// with a plain message rather than failing — the GUI is the one part of
// Phyllum that needs something beyond Node, and saying so is the honest answer.
const skip = findPython() ? false : 'python3 is not on PATH — the GUI server needs it';

test('the running server serves the reports the reader read', { skip }, async () => {
  await withTempDir(async (dir) => {
    withReports(dir, [1, 2]);
    const started = await runGui({ cwd: dir, scope: 'all' });
    try {
      assert.equal(started.code, 0, started.out);
      const response = await fetch(`http://127.0.0.1:${started.record.port}/reports`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(payload.reports.map((report) => report.number), [2, 1], 'newest first over HTTP too');
      assert.equal(payload.reports[0].recommendations.length, 1);
      assert.deepEqual(payload, reportsJsonForRoot(dir), 'the route serves the reader, not a second opinion');

      // And the page the same server hands over carries the view that reads it.
      const page = await (await fetch(`http://127.0.0.1:${started.record.port}/`)).text();
      assert.ok(page.includes('id="view-reports"'), 'the dashboard ships the Reports view');
    } finally {
      await runKill({ cwd: dir });
    }
  });
});

test('the reports ref and the page cannot drift apart', () => {
  const contract = reportsContract();
  const ref = fs.readFileSync(GUI_REF, 'utf8');
  const rows = tableAfter(ref, 'phyllum:reports', 'refs/gui/gui.md');
  const recorded = new Map(rows.map((row) => [stripTicks(row[0]), stripTicks(row[1])]));

  const expected = {
    empty: contract.REPORTS.empty,
    'list columns': contract.REPORTS.columns.join(', '),
    'recommendation columns': contract.REPORTS.recommendationColumns.join(', '),
    'unstated field': contract.REPORTS.unstated,
    'no block': contract.REPORTS.noBlock,
    'nothing to recommend': contract.REPORTS.none,
    'unreadable report': contract.REPORTS.unread,
  };
  for (const [setting, value] of Object.entries(expected)) {
    assert.ok(recorded.has(setting), `the ref records the ${setting} setting`);
    assert.equal(recorded.get(setting), stripTicks(value), `${setting} differs between the ref and the page`);
  }
  assert.equal(recorded.get('order'), 'newest first', 'the ordering is written down, not left to the reader');
  assert.equal(recorded.get('writes'), 'none', 'and so is the read-only promise');
});
