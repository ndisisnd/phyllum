/**
 * Assertions for the dashboard's Build view (v0.10.0 §5).
 *
 * Mirrors `evals/assertions/gui-reports.test.js` deliberately — the two views
 * answer the same shape of question ("show me the numbered reports a stage
 * left behind") for two different stages — but the risks are not identical,
 * because a build report is not an assessment report:
 *
 *   1. **The reader.** `lib/build-reports-json.js` has to read a build report
 *      back into the fields the tables are built from: the number, the date,
 *      what it answers (a drift report, a description, or neither), and its
 *      Work — flat or split into ordered phases.
 *   2. **Source mapping.** All three answers `lib/build-reports.js`'s source
 *      block can carry — `report`, `prose`, `none` — have to come through, not
 *      just the common one.
 *   3. **Phased vs. flat.** A report under the phase threshold stays one flat
 *      list; a report over it renders as ordered phase containers. The view
 *      never offers a way to approve, accept or run a single phase — approval
 *      is per report, and stays the terminal's (`refs/build/build.md` §3).
 *   4. **The empty case, and the broken one.** No build reports yet is a
 *      plain line, not an empty grid; one hand-mangled report is a row
 *      carrying its own error, not a blank list.
 *
 * The page's own rules are lifted out of its `phyllum:build-reports-contract`
 * region and run here, exactly the way `phyllum:reports-contract` already is,
 * so the assertions execute the code the browser executes.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { writeBuildReport } from '../../lib/build-reports.js';
import { buildReportsJsonForRoot } from '../../lib/build-reports-json.js';
import { findPython, runGui, runKill } from '../../lib/gui-command.js';
import { stripTicks, tableAfter } from '../../lib/md-tables.js';
import { PACKAGE_ROOT, withTempDir } from './helpers.js';

const GUI_PAGE = path.join(PACKAGE_ROOT, 'gui', 'index.html');
const GUI_REF = path.join(PACKAGE_ROOT, 'skill', 'refs', 'gui', 'gui.md');
const readPage = () => fs.readFileSync(GUI_PAGE, 'utf8');

/** The page's build-reports rules, lifted out and run — no DOM, no network. */
function buildReportsContract() {
  const text = readPage();
  const start = text.indexOf('// --- phyllum:build-reports-contract');
  const end = text.indexOf('// --- end phyllum:build-reports-contract');
  assert.ok(start !== -1 && end > start, 'the page marks its build-reports-contract region');
  const region = text.slice(start, end);
  assert.ok(!/\b(document|window)\b|fetch\s*\(/.test(region), 'the region touches no DOM and no network');

  const esc = text.match(/const esc = \(value\) =>[\s\S]*?;\n/);
  assert.ok(esc, "the escaper the region leans on is the page's own");

  return new Function(
    `${esc[0]}${region}\nreturn { BUILD_REPORTS, buildReportList, buildReportSummaryRow,` +
      ' buildReportsTableHtml, buildSourceHtml, buildWorkHtml, buildReportDetailHtml, buildPromptFor };',
  )();
}

/** Recommendations big enough to force a phase split (the threshold is 6). */
const manyRows = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `lint.rule-${i}`,
    family: 'lint',
    rule: `rule-${i}`,
    severity: i < 2 ? 'error' : 'warn',
    count: i + 1,
    action: 'fix it',
  }));

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

test('every numbered build report is read back into fields, newest first, gaps included', async () => {
  await withTempDir(async (dir) => {
    // 2 is missing on purpose: a deleted report is a gap, shown as a gap.
    writeBuildReport(dir, {
      number: 1,
      date: '2026-08-20',
      input: { source: 'prose', prose: 'a button with 12px padding' },
    });
    writeBuildReport(dir, {
      number: 3,
      date: '2026-08-22',
      input: { source: 'report', report: { number: 5, date: '2026-08-21' }, recommendations: manyRows(8) },
    });
    writeBuildReport(dir, { number: 4, date: '2026-08-23', input: {} });

    const payload = buildReportsJsonForRoot(dir);
    assert.equal(payload.count, 3);
    assert.deepEqual(payload.reports.map((report) => report.number), [4, 3, 1], 'newest first');

    const prose = payload.reports.find((report) => report.number === 1);
    assert.equal(prose.path, '.phyllum/build-report-1.md');
    assert.equal(prose.date, '2026-08-20');
    assert.equal(prose.source, 'prose');
    assert.equal(prose.assessReport, null);
    assert.equal(prose.prose, 'a button with 12px padding');
    assert.equal(prose.phases, null, 'a prose report never phases');

    const none = payload.reports.find((report) => report.number === 4);
    assert.equal(none.source, 'none');
    assert.equal(none.assessReport, null);
    assert.equal(none.prose, null);

    const phased = payload.reports.find((report) => report.number === 3);
    assert.equal(phased.source, 'report');
    assert.equal(phased.assessReport, 5);
    assert.ok(Array.isArray(phased.phases) && phased.phases.length > 1, 'over the threshold, it splits');
    assert.ok(
      phased.phases.every((phase) => Array.isArray(phase.lines) && phase.lines.length > 0),
      'each phase carries the readable lines the report file itself wrote',
    );
  });
});

test('a project with no build reports says so, rather than failing', async () => {
  await withTempDir(async (dir) => {
    assert.deepEqual(buildReportsJsonForRoot(dir), { reports: [], count: 0, root: dir });

    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.phyllum', 'session.json'), '{}');
    fs.writeFileSync(path.join(dir, '.phyllum', 'assess-1.md'), '# not a build report');
    assert.equal(buildReportsJsonForRoot(dir).count, 0, 'an assess report is not counted as a build report');
  });
});

test('one unreadable build report is a row, never a blank list', async () => {
  await withTempDir(async (dir) => {
    writeBuildReport(dir, { number: 1, date: '2026-08-20', input: { source: 'prose', prose: 'a button' } });
    writeBuildReport(dir, { number: 2, date: '2026-08-21', input: {} });

    const broken = path.join(dir, '.phyllum', 'build-report-1.md');
    fs.writeFileSync(broken, fs.readFileSync(broken, 'utf8').replace('"schemaVersion": 1', '"schemaVersion": oops'));

    const payload = buildReportsJsonForRoot(dir);
    assert.equal(payload.count, 2, 'the good report still lists');
    const bad = payload.reports.find((report) => report.number === 1);
    assert.ok(bad.error, 'and the bad one carries its own error');
    assert.equal(payload.reports.find((report) => report.number === 2).source, 'none');
  });
});

test('the reader only reads — there is no write path in it', () => {
  const source = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'build-reports-json.js'), 'utf8');
  assert.ok(!/writeFileSync|mkdirSync|appendFile|rmSync|unlinkSync/.test(source), 'nothing here writes');
  assert.ok(!/writeBuildReport|renderBuildReport/.test(source), 'and it never renders a new report');
});

// ---------------------------------------------------------------------------
// The rendering
// ---------------------------------------------------------------------------

const bodyRows = (html) => (html.match(/<tr[ >]/g) ?? []).length - (html.includes('<thead') ? 1 : 0);

test('the build report list renders as one table, in the order it was handed', () => {
  const contract = buildReportsContract();
  const payload = {
    reports: [
      { number: 4, date: '2026-08-23', source: 'none' },
      { number: 3, date: '2026-08-22', source: 'report', assessReport: 5, phases: [{ phase: 1 }, { phase: 2 }] },
      { number: 1, date: '2026-08-20', source: 'prose', prose: 'a button' },
    ],
  };
  const html = contract.buildReportsTableHtml(payload, 3);
  assert.equal(bodyRows(html), 3, 'one row per build report');
  assert.deepEqual(
    [...html.matchAll(/data-build-report="(\d+)"/g)].map((m) => m[1]),
    ['4', '3', '1'],
    'newest first, the order it was handed',
  );
  assert.ok(html.includes('aria-selected="true"'), 'the open report reads as the open one');
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  for (const column of contract.BUILD_REPORTS.columns) assert.ok(html.includes('>' + column + '<'), column);
  assert.ok(html.includes('assess-5'), 'a report-sourced build names the report it answers');
  assert.ok(html.includes('description'), 'and a prose-sourced one says so, in its own word');
  assert.ok(html.includes('2 phases'), 'a phased report says how many');
});

test('no build reports is a plain line, not an empty table', () => {
  const contract = buildReportsContract();
  for (const payload of [null, undefined, {}, { reports: [] }, { reports: null }]) {
    const html = contract.buildReportsTableHtml(payload, null);
    assert.ok(!/<table/.test(html), 'an empty grid would say the view is broken');
    assert.ok(html.includes('No build reports yet'));
  }
  assert.ok(contract.buildReportDetailHtml(null).includes('No build reports yet'));
});

test('a flat report renders its Work as prose; a phased one as ordered containers', () => {
  const contract = buildReportsContract();
  const flat = contract.buildReportDetailHtml({
    number: 1,
    date: '2026-08-20',
    source: 'prose',
    prose: 'a button',
    sourceLines: ['Answers your description: "a button"'],
    phases: null,
    work: ['- Build a button'],
  });
  assert.ok(flat.includes('Answers your description'));
  assert.ok(flat.includes('Build a button'));
  assert.ok(!flat.includes('Phase 1'), 'a flat report never invents phases');

  const phased = contract.buildReportDetailHtml({
    number: 2,
    source: 'report',
    assessReport: 5,
    sourceLines: ['Answers: assess-5'],
    phases: [
      { phase: 1, title: 'error · lint', lines: ['- **error** · `r0` (lint) — 1 finding'] },
      { phase: 2, title: 'warn · lint', lines: ['- **warn** · `r1` (lint) — 2 findings'] },
    ],
    work: ['ignored when phased'],
  });
  assert.ok(phased.includes('Phase 1 — error · lint'));
  assert.ok(phased.includes('Phase 2 — warn · lint'));
  assert.ok(!phased.includes('ignored when phased'), 'phased Work reads from phases, not the flat prose');
});

test('no control renders a per-phase approval — approval is per report', () => {
  const contract = buildReportsContract();
  const html = contract.buildReportDetailHtml({
    number: 2,
    source: 'report',
    assessReport: 5,
    sourceLines: ['Answers: assess-5'],
    phases: [{ phase: 1, title: 'error · lint', lines: ['- one'] }],
    work: [],
  });
  assert.ok(!/<button|<input|<form/i.test(html), 'a phase is read, never approved, from this view — no control on it');
});

test('an unreadable build report says so', () => {
  const contract = buildReportsContract();
  const html = contract.buildReportDetailHtml({ number: 2, error: 'the block is not valid JSON' });
  assert.ok(html.includes(contract.BUILD_REPORTS.unread) && html.includes('not valid JSON'));
});

test('a hostile payload renders rather than throwing', () => {
  const contract = buildReportsContract();
  const hostile = [null, undefined, 42, 'nope', { reports: 'nope' }, { reports: [null, 7] }];
  for (const payload of hostile) {
    assert.doesNotThrow(() => contract.buildReportsTableHtml(payload, null), String(payload));
  }
  for (const report of [null, undefined, {}, { number: 1 }, { number: 1, phases: null, work: null }]) {
    assert.doesNotThrow(() => contract.buildReportDetailHtml(report), String(report));
  }
});

test('a build report escapes like every other string a hand-edited file supplies', () => {
  const contract = buildReportsContract();
  const html = contract.buildReportDetailHtml({
    number: 1,
    source: 'prose',
    sourceLines: ['<script>alert(1)</script>'],
    phases: null,
    work: ['<b>bold</b>'],
  });
  assert.ok(!html.includes('<script>') && !html.includes('<b>bold</b>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

// ---------------------------------------------------------------------------
// The build entry point — the relay, not a second `create`
// ---------------------------------------------------------------------------

test('the composed prompt mirrors the terminal invocation, bare or with prose', () => {
  const contract = buildReportsContract();
  assert.equal(contract.buildPromptFor(''), 'create');
  assert.equal(contract.buildPromptFor('   '), 'create');
  assert.equal(contract.buildPromptFor(undefined), 'create');
  assert.equal(contract.buildPromptFor('a button primary'), 'create "a button primary"');
  assert.equal(contract.buildPromptFor('  a button primary  '), 'create "a button primary"');
});

test('the view is wired through the one route the dashboard already uses', () => {
  const page = readPage();
  assert.ok(page.includes("fetch('/build-reports')"), 'the page reads build reports over its own server');
  assert.ok(page.includes('data-view="build-reports"'), 'and the Build stage carries the button that opens them');
  assert.ok(page.includes('id="view-build-reports"'), 'the view is a view like the others');
  assert.ok(page.includes('id="build-form"'), 'and the build entry point is a form on the page');

  const server = fs.readFileSync(path.join(PACKAGE_ROOT, 'server', 'serve.py'), 'utf8');
  assert.ok(server.includes('def build_reports_json'), 'the server has a reader for them');
  assert.ok(server.includes('BUILD_REPORTS_JSON_SCRIPT'), 'and it is the Node one, not a second parser in Python');
  assert.ok(!/build-reports-json[\s\S]{0,400}open\(/.test(server), 'the server never opens a build report itself');
});

test('the build entry point is the prompt relay, and nothing runs itself from the page', () => {
  const page = readPage();
  // Every POST the page makes, and where it makes it: still the two relays —
  // adding a third view never adds a third endpoint.
  const posts = [...page.matchAll(/fetch\('([^']+)',\s*\{\s*\n?\s*method: 'POST'/g)].map((m) => m[1]);
  assert.deepEqual(new Set(posts), new Set(['/prompt', '/upload']), 'the build form posts to /prompt, like everything else');
  assert.ok(!/\/build-reports[^']*',\s*\{\s*method: 'POST'/.test(page), 'and /build-reports is read with GET alone');
  assert.ok(!/\bexeca?\(|child_process|spawn\(/.test(page), 'nothing on the page runs a command itself');
});

// Without a `python3` there is no server to ask, so the one live test skips
// with a plain message rather than failing, the same way the Reports view's does.
const skip = findPython() ? false : 'python3 is not on PATH — the GUI server needs it';

test('the running server serves the build reports the reader read', { skip }, async () => {
  await withTempDir(async (dir) => {
    writeBuildReport(dir, { number: 1, date: '2026-08-20', input: { source: 'prose', prose: 'a button' } });
    writeBuildReport(dir, { number: 2, date: '2026-08-21', input: {} });
    const started = await runGui({ cwd: dir, scope: 'all' });
    try {
      assert.equal(started.code, 0, started.out);
      const response = await fetch(`http://127.0.0.1:${started.record.port}/build-reports`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(payload.reports.map((report) => report.number), [2, 1], 'newest first over HTTP too');
      assert.deepEqual(payload, buildReportsJsonForRoot(dir), 'the route serves the reader, not a second opinion');

      const page = await (await fetch(`http://127.0.0.1:${started.record.port}/`)).text();
      assert.ok(page.includes('id="view-build-reports"'), 'the dashboard ships the Build view');
    } finally {
      await runKill({ cwd: dir });
    }
  });
});

test('the build-reports ref and the page cannot drift apart', () => {
  const contract = buildReportsContract();
  const ref = fs.readFileSync(GUI_REF, 'utf8');
  const rows = tableAfter(ref, 'phyllum:build-reports', 'refs/gui/gui.md');
  const recorded = new Map(rows.map((row) => [stripTicks(row[0]), stripTicks(row[1])]));

  const expected = {
    empty: contract.BUILD_REPORTS.empty,
    'list columns': contract.BUILD_REPORTS.columns.join(', '),
    'unstated field': contract.BUILD_REPORTS.unstated,
    'flat report': contract.BUILD_REPORTS.flat,
    'unreadable report': contract.BUILD_REPORTS.unread,
  };
  for (const [setting, value] of Object.entries(expected)) {
    assert.ok(recorded.has(setting), `the ref records the ${setting} setting`);
    assert.equal(recorded.get(setting), stripTicks(value), `${setting} differs between the ref and the page`);
  }
  assert.equal(recorded.get('order'), 'newest first', 'the ordering is written down, not left to the reader');
  assert.equal(recorded.get('per-phase approval'), 'none', 'and so is the no-per-phase-approval boundary');
});
