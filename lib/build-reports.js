/**
 * Numbered, dated build reports — `.phyllum/build-report-[n].md` (v0.10.0 phase 3).
 *
 * Assess leaves a numbered report behind (`lib/assess-reports.js`); Build now
 * does the same. This module is the mechanics of that file — how it is
 * numbered, how it is dated, what it says, and how a later phase reads it
 * back. It mirrors `lib/assess-reports.js` deliberately: the two files answer
 * the same shape of question for two different stages, and a reader who knows
 * one already knows most of the other.
 *
 * ## Numbering
 *
 * Reports are `build-report-1.md`, `build-report-2.md`, … and — exactly as
 * `assess-reports.js` states for its own numbering — the ordering is
 * **numeric, never lexicographic**, gaps are survivable (the next number is
 * one past the highest that *exists*, not one past how many are on disk), and
 * strangers are ignored (anything that is not exactly
 * `build-report-<digits>.md` contributes nothing to the count, `assess-*.md`
 * included).
 *
 * ## Dating
 *
 * `reportDate` is imported from `lib/assess-reports.js` rather than
 * reimplemented — one clock-reading function, one place it can drift from
 * "local time, not UTC" if it ever needs to. The seam is the same: a default
 * parameter, so a caller that wants byte-stable output passes a fixed day and
 * a caller that does not care pays nothing for the default.
 *
 * ## What a build report answers — the source block
 *
 * `refs/build/build.md` §3 requires every build report to be mapped back to
 * what it answered: the drift report it was built from, or the prose input it
 * was built from when there was no report. `lib/build-input.js`'s result
 * already carries that fact — `source`, `report`, `prose` — so this module
 * never re-derives it; `renderBuildReport` just prints what it is handed.
 *
 * As with the recommendations block, the mapping is written twice: once as a
 * sentence a person reads (the **Source** section), once as a fenced
 * `phyllum-build-source` block a program parses. Both come from the same
 * `input`, so they cannot disagree.
 *
 *     ```phyllum-build-source
 *     {
 *       "schemaVersion": 1,
 *       "source": "report",
 *       "assessReport": 3,
 *       "prose": null
 *     }
 *     ```
 *
 * `source` is one of `'report' | 'prose' | 'none'` — the same three answers
 * `resolveBuildInput` returns, with `'report'` and `'prose'` spelled out
 * rather than merged, because a reader of the block should not have to cross
 * back to `build-input.js` to know which field to trust. `assessReport` is the
 * report's number when `source` is `'report'`, and `prose` is the sentence
 * when `source` is `'prose'` — the other is always `null`, never both, never
 * neither when a real input exists. `'none'` means the run was accepted with
 * nothing to answer — a bare `create` with no drift report on disk yet — and
 * both fields are `null`.
 *
 * ## Writing
 *
 * Through the write funnel, like every other write in the CLI.
 * `BUILD_REPORT_PREFIX` lives in `lib/write.js`, beside `ASSESS_REPORT_PREFIX`,
 * for the same reason that file gives: the funnel is the list of things
 * Phyllum may write, and a name not on that list is a name nobody can audit.
 * `.phyllum/**` already covers it, so this stage adds no new permission either.
 *
 * ## Wiring (phase 3, and what phase 4 changes)
 *
 * `lib/create-command.js` calls `writeBuildReport` right after a component
 * draft is accepted — see the comment at that call site for the one thing
 * phase 4 will move: the report will be written *before* the acceptance gate
 * rather than after it, with the user's approval sitting between the two, so
 * that the report is the thing being approved rather than a receipt for a
 * write that already happened. Nothing here needs to change for that move;
 * only where it is called from does.
 */

import fs from 'node:fs';
import path from 'node:path';

import { reportDate } from './assess-reports.js';
import { BUILD_REPORT_PREFIX, STATE_DIR, buildReportFile, writeBuildReportFile } from './write.js';

/** Where numbered build reports live — inside the session directory, with assess's. */
export const BUILD_REPORT_DIR = STATE_DIR;

/** The only filename shape this module recognises, and the one it writes. */
export const BUILD_REPORT_PATTERN = /^build-report-(\d+)\.md$/;

/** The fence's info string — how a consumer finds the source block. */
export const BUILD_SOURCE_FENCE = 'phyllum-build-source';

/**
 * The shape of the source block. Bump on a field that changes meaning or
 * disappears; never on one that is merely added — the same rule
 * `RECOMMENDATIONS_SCHEMA_VERSION` states in `assess-reports.js`.
 */
export const BUILD_SOURCE_SCHEMA_VERSION = 1;

/** The three answers a build report's Source section can give, and no fourth. */
export const BUILD_SOURCES = ['report', 'prose', 'none'];

/** The report file's name for a given number. */
export function buildReportFileName(number) {
  return `build-report-${asReportNumber(number)}.md`;
}

/**
 * The report's path, relative to the project root, posix-style.
 *
 * Built by the write funnel rather than here, for the same reason
 * `reportPathFor` in `assess-reports.js` is: the name this module writes and
 * the name the permission model knows are one string, not two that agree
 * today.
 */
export function buildReportPathFor(number) {
  return buildReportFile(asReportNumber(number));
}

/** A report number, or a thrown error — never a silently coerced `NaN`. */
function asReportNumber(number) {
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`a report number is a whole number from 1 upwards, not "${number}"`);
  }
  return n;
}

/**
 * Every build report number already on disk, ascending and numeric.
 *
 * A missing `.phyllum/` is an empty list rather than an error, exactly as
 * `listReportNumbers` in `assess-reports.js` treats it: the first build report
 * in a project is written before the directory necessarily exists.
 */
export function listBuildReportNumbers(root) {
  const dir = path.join(path.resolve(root), ...BUILD_REPORT_DIR.split('/'));
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const numbers = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = BUILD_REPORT_PATTERN.exec(entry.name);
    if (!match) continue;
    // A leading zero would make `build-report-01.md` and `build-report-1.md`
    // the same number under two names, and only one of them is a name this
    // module writes. The other is a stranger, and strangers are ignored.
    if (match[1].length > 1 && match[1].startsWith('0')) continue;
    numbers.push(Number(match[1]));
  }
  return numbers.sort((a, b) => a - b);
}

/** Every build report on disk as `{ number, path }`, in numeric order. */
export function listBuildReports(root) {
  return listBuildReportNumbers(root).map((number) => ({ number, path: buildReportPathFor(number) }));
}

/**
 * The number the next build report takes: one past the highest that exists —
 * not one past the count, for the reason `nextReportNumber` gives in
 * `assess-reports.js`.
 */
export function nextBuildReportNumber(root) {
  const numbers = listBuildReportNumbers(root);
  return numbers.length === 0 ? 1 : numbers[numbers.length - 1] + 1;
}

/** The most recent build report, or null when there is none. */
export function latestBuildReportNumber(root) {
  const numbers = listBuildReportNumbers(root);
  return numbers.length === 0 ? null : numbers[numbers.length - 1];
}

// ---------------------------------------------------------------------------
// The source block
// ---------------------------------------------------------------------------

/**
 * The `input` a Build run resolved (`lib/build-input.js`'s return shape),
 * folded down to the three fields the block carries. `input` is optional so a
 * report can still be rendered for a run that resolved nothing at all.
 */
function sourceFieldsFrom(input = {}) {
  if (input.source === 'report' && input.report) {
    return { source: 'report', assessReport: input.report.number, prose: null };
  }
  if (input.source === 'prose' && typeof input.prose === 'string' && input.prose !== '') {
    return { source: 'prose', assessReport: null, prose: input.prose };
  }
  return { source: 'none', assessReport: null, prose: null };
}

/** The fenced block, as lines. The only machine-readable part of the report. */
export function renderBuildSourceBlock(input = {}) {
  const payload = { schemaVersion: BUILD_SOURCE_SCHEMA_VERSION, ...sourceFieldsFrom(input) };
  const fence = '```';
  return [`${fence}${BUILD_SOURCE_FENCE}`, ...JSON.stringify(payload, null, 2).split('\n'), fence];
}

/**
 * Read the source block back out of a report.
 *
 * Same null-vs-throw semantics as `parseRecommendations`: `null` when the
 * report carries no block at all, a thrown `SyntaxError` when the block is
 * present but unparseable. Silently returning nothing on a broken block would
 * let a caller treat an unreadable mapping as "this report answers nothing",
 * which is a different and false claim.
 */
export function parseBuildSource(text = '') {
  const fence = '```';
  const opener = `${fence}${BUILD_SOURCE_FENCE}`;
  const lines = String(text).split('\n');
  const start = lines.findIndex((line) => line.trim() === opener);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() === fence);
  if (end === -1) {
    throw new SyntaxError(`the ${BUILD_SOURCE_FENCE} block in this report is never closed.`);
  }
  const body = rest.slice(0, end).join('\n');
  let payload;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new SyntaxError(
      `the ${BUILD_SOURCE_FENCE} block in this report is not valid JSON (${error.message}).`,
    );
  }
  return {
    schemaVersion: payload.schemaVersion ?? null,
    source: BUILD_SOURCES.includes(payload.source) ? payload.source : null,
    assessReport: payload.assessReport ?? null,
    prose: payload.prose ?? null,
  };
}

// ---------------------------------------------------------------------------
// The template
// ---------------------------------------------------------------------------

/** The Source section — the sentence a person reads, above the block. */
function sourceLines(input = {}) {
  const fields = sourceFieldsFrom(input);
  if (fields.source === 'report') {
    const date = input.report?.date;
    return [`Answers: assess-${fields.assessReport}${date ? ` (${date})` : ''}`];
  }
  if (fields.source === 'prose') {
    return [`Answers your description: "${fields.prose}"`];
  }
  return ['Answers neither a drift report nor a description — nothing was on record to build from.'];
}

/** One recommendation as the line a person reads, in the report's own wording. */
function workLineFor(row) {
  const count = `${row.count ?? 0} finding${row.count === 1 ? '' : 's'}`;
  const line = `- **${row.severity}** · \`${row.rule}\` (${row.family}) — ${count}`;
  return row.action ? `${line} → ${row.action}` : line;
}

/**
 * The Work section — the recommendations consumed, or the prose-derived
 * intent, or a plain statement that there was neither.
 */
function workLines(input = {}) {
  const fields = sourceFieldsFrom(input);
  if (fields.source === 'report') {
    const rows = input.recommendations ?? [];
    if (rows.length === 0) return ['Nothing to do. The report it answers recommended nothing.'];
    return rows.map(workLineFor);
  }
  if (fields.source === 'prose') {
    return [`- Build ${fields.prose}`];
  }
  return ['Nothing to do. There was no drift report and no description to build from.'];
}

/**
 * The whole build report.
 *
 * Sections in the order `refs/build/report.md` names: heading, date, Source,
 * Work, then the machine-readable block. Lightweight, like `assess-[n].md`: a
 * working document a person reads once, not a dossier.
 *
 * `date` is required rather than defaulted here, for the same reason
 * `renderAssessReport` requires it: defaulting it would put a clock read
 * inside render code, and the determinism rule forbids that. `writeBuildReport`
 * below is where the default lives.
 */
export function renderBuildReport({ number, date, input = {} } = {}) {
  const n = asReportNumber(number);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError(`a report needs its own date as YYYY-MM-DD, not "${date}"`);
  }

  const lines = [
    `# Build report ${n}`,
    '',
    `Date: ${date}`,
    '',
    '## Source',
    '',
    ...sourceLines(input),
    '',
    '## Work',
    '',
    ...workLines(input),
    '',
    ...renderBuildSourceBlock(input),
  ];

  return `${lines.join('\n')}\n`;
}

/**
 * Write the next build report — or a numbered one, when the caller already
 * resolved the number.
 *
 * The clock's default lives here and nowhere deeper, so a caller that wants
 * fixed bytes passes `date` and gets them. The write goes through the funnel,
 * which is what keeps `.phyllum/build-report-[n].md` a legitimate target
 * rather than a raw `fs` call in a command module.
 */
export function writeBuildReport(root, { number = null, date = null, now = new Date(), input = {} } = {}) {
  const n = number === null ? nextBuildReportNumber(root) : asReportNumber(number);
  const on = date ?? reportDate(now);
  const contents = renderBuildReport({ number: n, date: on, input });
  const written = writeBuildReportFile(root, n, contents);
  return { number: n, date: on, path: written, bytes: Buffer.byteLength(contents) };
}

/** Read one build report back, or null when it is not there. */
export function readBuildReport(root, number) {
  const abs = path.join(path.resolve(root), ...buildReportPathFor(number).split('/'));
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

export { BUILD_REPORT_PREFIX };
