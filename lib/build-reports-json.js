/**
 * The numbered build reports as JSON — what `GET /build-reports` serves
 * (v0.10.0 phase 5).
 *
 * This is `lib/reports-json.js`'s sibling, not an extension of it. That file's
 * own header says why it stays narrow: "nothing else parses [the prose
 * sections] here, because nothing else parses them and a second opinion about
 * them cannot exist yet." A build report's prose is a different shape — Source
 * and Work rather than Drift and Health score, and a Work section that may
 * split into `## Phase n` headings a drift report never has — so growing one
 * reader to cover both would be the second opinion that header warns against.
 * The two modules share the rules that do generalise (one writer/one reader,
 * read-only, a broken file is a row not an outage) and nothing else.
 *
 * **One writer, one reader.** The report is written by `lib/build-reports.js`,
 * so the numbering, the paths and the machine-readable `phyllum-build-source`
 * block are read back through that module (`listBuildReports`, `readBuildReport`,
 * `parseBuildSource`) rather than re-derived here. Only the prose — the date
 * line, the Source sentence, the Work lines, and the per-phase bullet lines —
 * is parsed in this file.
 *
 * **Reading only.** The GUI is read-only over build reports, exactly as it is
 * over assessment ones: it renders what `create`/`build` left behind and never
 * writes one. This module opens files and returns strings; there is no write
 * path in it, which is what lets the Python server call it freely.
 *
 * **A broken report is a row, not an outage.** A report whose source block is
 * unparseable comes back as `{ number, path, error }` and the rest of the list
 * still renders.
 *
 * **No per-phase approval, ever.** `lib/build-reports.js` states it and this
 * reader repeats it because a GUI reader is exactly the place that temptation
 * would reappear: the `phases` this module hands back are reading structure —
 * what the report split into so a person can read it in order — never an
 * approval or execution unit of their own. Approval is per report; execution
 * outward stays `apply`'s.
 *
 * Run directly, it prints the JSON for a project root:
 *
 *   node lib/build-reports-json.js /path/to/project
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { parseReportDate } from './assess-reports.js';
import { listBuildReports, parseBuildSource, readBuildReport } from './build-reports.js';

/** The heading each report section carries, at the top level the template writes. */
const SECTIONS = ['Source', 'Work'];

/** A report's `## heading` sections, keyed by heading, as arrays of lines. */
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
 * The Work section's phase headings, as `{ phase, title, lines }`.
 *
 * `sectionsOf` already splits every `## Phase n — title` heading into its own
 * key, because the writer puts them at the same level as `## Work`
 * (`lib/build-reports.js`'s `phasedWorkLines` says why — a phase is the
 * reviewable unit, a peer of the section that announced it, not a child of
 * it). This walks the file's own headings in the order they appear rather
 * than trusting the source block's count, so a hand-edited report still
 * renders whatever headings it actually carries.
 */
function phaseSectionsOf(sections) {
  const phases = [];
  for (const heading of Object.keys(sections)) {
    const match = /^Phase\s+(\d+)(?:\s*—\s*(.+))?$/.exec(heading);
    if (!match) continue;
    phases.push({
      phase: Number(match[1]),
      title: match[2] ?? heading,
      lines: proseOf(sections[heading]),
    });
  }
  phases.sort((a, b) => a.phase - b.phase);
  return phases;
}

/** One report's text, as the fields the dashboard's tables are built from. */
export function buildReportJson({ number, path: reportPath, text }) {
  const sections = sectionsOf(text);
  const source = parseBuildSource(text); // may throw SyntaxError — the caller catches it
  const phaseSections = phaseSectionsOf(sections);

  return {
    number,
    path: reportPath,
    date: parseReportDate(text),
    source: source?.source ?? null,
    assessReport: source?.assessReport ?? null,
    prose: source?.prose ?? null,
    schemaVersion: source?.schemaVersion ?? null,
    sourceLines: proseOf(sections.Source ?? []),
    // `null` when the report is flat — the same distinction
    // `lib/build-reports.js` draws between "not phased" and "phased into
    // nothing", kept rather than collapsed into `[]`.
    phases: phaseSections.length > 0 ? phaseSections : null,
    // The Work section's own prose, phase headings excluded — meaningful only
    // when the report is flat; a phased report's readable text lives in
    // `phases` instead.
    work: proseOf(sections.Work ?? []),
    sections: SECTIONS.filter((name) => Array.isArray(sections[name])),
  };
}

/**
 * Every build report in a project, newest first.
 *
 * Descending numeric order, for the same reason `reportsJsonForRoot` gives:
 * the newest report is the one a person opens the view to see, and the
 * numbering itself stays the file's own, gaps included.
 */
export function buildReportsJsonForRoot(root) {
  const reports = [];
  for (const { number, path: reportPath } of listBuildReports(root)) {
    const text = readBuildReport(root, number);
    if (text === null) continue;
    try {
      reports.push(buildReportJson({ number, path: reportPath, text }));
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
  process.stdout.write(`${JSON.stringify(buildReportsJsonForRoot(root))}\n`);
}
