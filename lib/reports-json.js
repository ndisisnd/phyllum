/**
 * The numbered assessment reports as JSON — what `GET /reports` serves
 * (v0.9.0 phase 5).
 *
 * The dashboard's Reports view shows every `.phyllum/assess-[n].md` as a table,
 * and a table needs *fields*, not a wall of Markdown. This module is the reader
 * that turns one report back into fields, and it is the GUI's alone: nothing in
 * the terminal path imports it.
 *
 * Three rules shape it, and each one is the same rule the `/system` route
 * already lives by.
 *
 * **One writer, one reader.** The report is written by
 * `lib/assess-reports.js`, so the numbering, the paths and the recommendations
 * block are read back through that module rather than re-derived here. Only the
 * prose sections — date, summary, drift table, health score — are parsed in
 * this file, because nothing else parses them and a second opinion about them
 * cannot exist yet.
 *
 * **Reading only.** The GUI is read-only over reports: it renders what `assess`
 * left behind and never writes one. This module opens files and returns
 * strings; there is no write path in it, which is what lets the Python server —
 * the one process outside the Node write funnel — call it freely.
 *
 * **A broken report is a row, not an outage.** `.phyllum/` is a directory a
 * person can edit. A report whose recommendations block is unparseable comes
 * back as `{ number, path, error }` and the rest of the list still renders,
 * because one hand-mangled file must not blank the view that would show it.
 *
 * Run directly, it prints the JSON for a project root:
 *
 *   node lib/reports-json.js /path/to/project
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  listReports,
  parseRecommendations,
  parseReportDate,
  readAssessReport,
} from './assess-reports.js';
import { splitRow } from './md-tables.js';

/** The heading each report section carries, in the order the template writes them. */
const SECTIONS = ['Summary', 'Drift', 'Health score', 'Recommendations'];

/** A report's sections, keyed by heading, as arrays of lines. */
function sectionsOf(text) {
  const out = { preamble: [] };
  let current = 'preamble';
  for (const line of String(text).split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[1];
      out[current] = [];
      continue;
    }
    (out[current] ??= []).push(line);
  }
  return out;
}

/**
 * The `Date:` line, or null. The report carries its own date; nothing infers one.
 *
 * Delegated to the module that writes the line (v0.10.0 phase 2), now that Build
 * reads it too. One writer, one reader — the rule the recommendations block has
 * always been read by.
 */
const dateOf = (lines = []) => parseReportDate(lines.join('\n'));

/** Prose lines, blank ones dropped and the fenced block never included. */
function proseOf(lines = []) {
  const out = [];
  let fenced = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (line.trim() === '') continue;
    out.push(line.trim());
  }
  return out;
}

/**
 * The drift section as a table.
 *
 * The template already writes drift as a Markdown table — one row per family,
 * empty families included — so the page renders the file's own rows rather than
 * a rebuilt shape. A report with no table (an assessment that measured nothing)
 * comes back with no rows and its one prose line in `note`, so the view can say
 * what the file says instead of drawing an empty grid.
 */
function driftOf(lines = []) {
  const rows = [];
  let columns = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;
    const cells = splitRow(trimmed);
    if (columns.length === 0) columns = cells;
    else rows.push(cells);
  }
  const note = rows.length === 0 && columns.length === 0 ? proseOf(lines)[0] ?? null : null;
  return { columns, rows, note };
}

/**
 * The health-score section, read back into fields.
 *
 * The scale's top is read off the line rather than assumed: the report prints
 * "8 of 21" because the scale lives in `refs/assess/`, and a page that carried
 * its own 21 would keep printing the old top after somebody edited that table.
 */
function healthOf(lines = []) {
  const text = lines.join('\n');
  const drift = /Drift score:\s*\*\*(\d+)\s+of\s+(\d+)\*\*\s*—\s*(.+?)\.?\s*$/m.exec(text);
  const verdict = /Verdict:\s*\*\*(.+?)\*\*\s*—\s*(.+?)\s*$/m.exec(text);
  return {
    score: drift ? Number(drift[1]) : null,
    scaleTop: drift ? Number(drift[2]) : null,
    means: drift ? drift[3] : null,
    verdict: verdict ? verdict[1] : null,
    detail: verdict ? verdict[2] : null,
    lines: proseOf(lines),
  };
}

/** One report's text, as the fields the dashboard's tables are built from. */
export function reportJson({ number, path: reportPath, text }) {
  const sections = sectionsOf(text);
  const parsed = parseRecommendations(text);
  return {
    number,
    path: reportPath,
    date: dateOf(sections.preamble),
    summary: proseOf(sections.Summary ?? []),
    drift: driftOf(sections.Drift ?? []),
    health: healthOf(sections['Health score'] ?? []),
    // Null, not `[]`: a report with nothing to recommend and a report written
    // before the block existed are different states, and `assess-reports.js`
    // draws that distinction deliberately. The page keeps it.
    schemaVersion: parsed ? parsed.schemaVersion : null,
    recommendations: parsed ? parsed.recommendations : null,
    sections: SECTIONS.filter((name) => Array.isArray(sections[name])),
  };
}

/**
 * Every report in a project, newest first.
 *
 * Descending numeric order, not ascending: the question the view answers is
 * "what state is the design system in", and the newest report is the answer.
 * Ascending order is still available — it is the same list reversed — and the
 * numbering itself stays the file's, so a gap left by a deleted report shows as
 * a gap rather than being closed up.
 */
export function reportsJsonForRoot(root) {
  const reports = [];
  for (const { number, path: reportPath } of listReports(root)) {
    const text = readAssessReport(root, number);
    if (text === null) continue;
    try {
      reports.push(reportJson({ number, path: reportPath, text }));
    } catch (error) {
      reports.push({ number, path: reportPath, error: error.message });
    }
  }
  reports.sort((a, b) => b.number - a.number);
  return { reports, count: reports.length, root };
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const root = process.argv[2] ?? process.cwd();
  process.stdout.write(`${JSON.stringify(reportsJsonForRoot(root))}\n`);
}
