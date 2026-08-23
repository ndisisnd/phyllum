/**
 * Numbered, dated drift reports — `.phyllum/assess-[n].md` (v0.9.0 phase 1).
 *
 * The terminal report in `lib/assess-report.js` is something a person reads
 * once and loses when the scrollback rolls. Assess is a *stage* now, and a
 * stage leaves something behind: an ordered, dated file that says what the
 * design system looked like on the day it was scanned. This module is the
 * mechanics of that file — how it is numbered, how it is dated, what it says,
 * and how the next stage reads it back.
 *
 * Note the two names. `assess-report.js` renders sections of the *terminal*
 * report; `assess-reports.js` — plural — is about the *files* under
 * `.phyllum/`. They are different jobs and the plural is the file one.
 *
 * ## Numbering
 *
 * Reports are `assess-1.md`, `assess-2.md`, … and the ordering is **numeric,
 * never lexicographic**. `assess-10.md` follows `assess-9.md`, which a sorted
 * directory listing would deny. Two more properties fall out of reading the
 * numbers rather than counting the files:
 *
 *   - **Gaps are survivable.** A user who deletes `assess-2.md` still gets
 *     `assess-4.md` next, because the next number is one past the highest that
 *     exists, not one past how many exist. Reusing a deleted number would make
 *     two different scans share one name in somebody's notes.
 *   - **Strangers are ignored.** `.phyllum/` already holds `session.json`,
 *     `assess.json` and `PRD.md`, and it will hold more. Anything that is not
 *     exactly `assess-<digits>.md` contributes nothing to the count.
 *
 * ## Dating
 *
 * Every report carries its own date, and the date is **injected, never read
 * from the clock inside the renderer**. The repository's determinism stance is
 * that the same inputs produce the same bytes — that is what makes
 * `assess --json` diffable and `evals/baseline.json` stable — and a `new Date()`
 * buried in render code is exactly the thing that breaks it. So the seam is a
 * default parameter, the same shape `lib/state.js` and `lib/prd.js` already
 * use: callers get today for free, tests pass a fixed day and get fixed bytes.
 *
 * ## The recommendations block — the handoff to Build (v0.10.0)
 *
 * The last section of the report is written twice on purpose, exactly as the
 * terminal report's findings table is: once as prose a person acts on, once as
 * a fenced block a program parses. Both are rendered from the same array, so
 * they cannot disagree.
 *
 * The block is a fenced code block whose info string declares the format:
 *
 *     ```phyllum-recommendations
 *     {
 *       "schemaVersion": 1,
 *       "recommendations": [
 *         {
 *           "id": "lint.uncovered-value.3b82f6",
 *           "family": "lint",
 *           "rule": "uncovered-value",
 *           "severity": "error",
 *           "count": 12,
 *           "action": "Name it in DESIGN-SYSTEM.md.",
 *           "evidence": ["#3b82f6", "#3B82F6"]
 *         }
 *       ]
 *     }
 *     ```
 *
 * Four decisions worth stating, because each could have gone the other way.
 *
 * **JSON inside the fence, not a delimited table.** A pipe- or tab-separated
 * table reads better in a diff, and it breaks the first time a finding's value
 * contains the delimiter — and findings are raw CSS values, selectors and
 * component names, which is precisely the population that contains punctuation.
 * JSON has one escaping rule, `JSON.parse` already implements it, and Build
 * needs no parser of its own.
 *
 * **A declared info string.** `phyllum-recommendations` rather than plain
 * `json`, so a consumer finds *this* block rather than the first JSON block
 * somebody happened to paste into the file.
 *
 * **A schema version inside the block.** The report as a whole is a document
 * and will be reworded; the block is a contract and must not change shape
 * silently. `RECOMMENDATIONS_SCHEMA_VERSION` is bumped when a field changes
 * meaning or disappears — never when one is merely added, by the same rule
 * `lib/assess-json.js` states for its own schema.
 *
 * **One recommendation per rule, not per finding.** A recommendation is a piece
 * of work, and the unit of work is a rule: "name the twelve raw blues", not
 * twelve identical instructions. The suggested action already comes from a
 * per-rule table in `refs/assess/`, so grouping by rule is also the only
 * grouping where the action is guaranteed to be the same sentence for every row
 * underneath it. The count and a short evidence sample keep the size of the job
 * visible without turning a working document into a dossier.
 *
 * ## Writing
 *
 * The write goes through `lib/write.js` like every other write in the CLI.
 * `ASSESS_REPORT_DIR` is `.phyllum/`, which is already inside the permission
 * model, so this stage adds no new write target — `assess` stays strictly
 * read-only over the user's codebase.
 */

import fs from 'node:fs';
import path from 'node:path';

import { ERROR, WARN } from './assess.js';
import { FAMILIES, findingsOf } from './assess-report.js';
import { actionFor, scoreScale } from './tokenise-spec.js';
import { STATE_DIR, assessReportFile, writeAssessReportFile } from './write.js';

/** Where numbered reports live — inside the session directory, with the rest. */
export const ASSESS_REPORT_DIR = STATE_DIR;

/** The only filename shape this module recognises, and the one it writes. */
export const ASSESS_REPORT_PATTERN = /^assess-(\d+)\.md$/;

/** The fence's info string — how a consumer finds the block. */
export const RECOMMENDATIONS_FENCE = 'phyllum-recommendations';

/**
 * The shape of the recommendations block. Bump on a field that changes meaning
 * or disappears; never on one that is merely added.
 */
export const RECOMMENDATIONS_SCHEMA_VERSION = 1;

/** How many finding values one recommendation quotes as evidence. */
const EVIDENCE_SAMPLE = 3;

/** The report file's name for a given number. */
export function reportFileName(number) {
  return `assess-${asReportNumber(number)}.md`;
}

/**
 * The report's path, relative to the project root, posix-style.
 *
 * Built by the write funnel rather than here, so the name this module writes
 * and the name the permission model knows are one string, not two that agree
 * today.
 */
export function reportPathFor(number) {
  return assessReportFile(asReportNumber(number));
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
 * Every report number already on disk, ascending and numeric.
 *
 * A missing `.phyllum/` is an empty list rather than an error: the first
 * `assess` in a project runs before the directory exists, and "no reports yet"
 * is the true answer to the question being asked.
 */
export function listReportNumbers(root) {
  const dir = path.join(path.resolve(root), ...ASSESS_REPORT_DIR.split('/'));
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const numbers = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = ASSESS_REPORT_PATTERN.exec(entry.name);
    if (!match) continue;
    // A leading zero would make `assess-01.md` and `assess-1.md` the same
    // number under two names, and only one of them is a name this module
    // writes. The other is a stranger, and strangers are ignored.
    if (match[1].length > 1 && match[1].startsWith('0')) continue;
    numbers.push(Number(match[1]));
  }
  return numbers.sort((a, b) => a - b);
}

/** Every report on disk as `{ number, path }`, in numeric order. */
export function listReports(root) {
  return listReportNumbers(root).map((number) => ({ number, path: reportPathFor(number) }));
}

/**
 * The number the next report takes: one past the highest that exists.
 *
 * Not one past the *count*. A project whose `assess-2.md` was deleted has two
 * files and a highest number of 3, and the next report is 4 — because 3 already
 * named a scan somebody may have quoted, and a second scan under that name
 * would make the quote wrong.
 */
export function nextReportNumber(root) {
  const numbers = listReportNumbers(root);
  return numbers.length === 0 ? 1 : numbers[numbers.length - 1] + 1;
}

/** The most recent report, or null when there is none. */
export function latestReportNumber(root) {
  const numbers = listReportNumbers(root);
  return numbers.length === 0 ? null : numbers[numbers.length - 1];
}

/**
 * Today, as `YYYY-MM-DD` — the injection seam.
 *
 * The clock is a parameter with a default, so nothing downstream of here ever
 * has to reach for it. A test that wants byte-stable output passes a date; a
 * command that does not care passes nothing.
 *
 * The date is read in **local** time, not UTC. `toISOString()` would be the
 * shorter spelling, but it dates the report in a timezone the reader does not
 * live in: run this at 04:00 in +08 and the file says yesterday. A report is a
 * working document somebody reads beside their own calendar, and one dated a
 * day off is one they have to second-guess. Byte-stability across runs is what
 * determinism asks for here, and the parameter above already supplies it — the
 * suite passes a fixed date, so nothing rests on which zone the default reads.
 */
export function reportDate(now = new Date()) {
  const at = new Date(now);
  const year = String(at.getFullYear()).padStart(4, '0');
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

/** A stable, filename-safe fragment of a finding's value, for the row's id. */
function slugFor(value) {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'unnamed' : slug.slice(0, 40);
}

/** The worse of two severities, with `error` worst. */
function worseSeverity(a, b) {
  if (a === ERROR || b === ERROR) return ERROR;
  if (a === WARN || b === WARN) return WARN;
  return a ?? b ?? 'note';
}

/**
 * The assessment's findings, folded into one recommendation per rule.
 *
 * Deterministic twice over: the findings arrive already sorted by
 * `findingsOf`, and the result is sorted again by severity, then size, then id
 * — so two runs over one codebase emit the same rows in the same order, and the
 * report diffs as cleanly as `assess.json` does.
 *
 * A rule with no action row in `refs/assess/` still produces a recommendation,
 * with `action: null`. The alternative is inventing advice, which the terminal
 * report already refuses to do for the same reason: a report that always has a
 * suggestion is a report that will eventually give a wrong one.
 */
export function recommendationsFrom(result = {}) {
  const groups = new Map();
  for (const [family] of FAMILIES) {
    for (const row of findingsOf(result, family)) {
      const rule = row.rule ?? 'unread';
      const key = `${family}.${rule}`;
      const group = groups.get(key) ?? {
        family,
        rule,
        severity: null,
        count: 0,
        evidence: [],
      };
      group.severity = worseSeverity(group.severity, row.severity);
      group.count += 1;
      if (group.evidence.length < EVIDENCE_SAMPLE) group.evidence.push(String(row.value ?? ''));
      groups.set(key, group);
    }
  }

  const rows = [...groups.values()].map((group) => ({
    id: `${group.family}.${group.rule}.${slugFor(group.evidence[0])}`,
    family: group.family,
    rule: group.rule,
    severity: group.severity ?? 'note',
    count: group.count,
    action: actionFor(group.rule),
    evidence: group.evidence,
  }));

  const rank = (severity) => (severity === ERROR ? 0 : severity === WARN ? 1 : 2);
  return rows.sort(
    (a, b) =>
      rank(a.severity) - rank(b.severity) ||
      b.count - a.count ||
      a.id.localeCompare(b.id),
  );
}

/** The fenced block, as lines. The only machine-readable part of the report. */
export function renderRecommendationsBlock(recommendations = []) {
  const payload = {
    schemaVersion: RECOMMENDATIONS_SCHEMA_VERSION,
    recommendations: recommendations.map((row) => ({
      id: row.id,
      family: row.family,
      rule: row.rule,
      severity: row.severity,
      count: row.count,
      action: row.action ?? null,
      evidence: row.evidence ?? [],
    })),
  };
  const fence = '```';
  return [
    `${fence}${RECOMMENDATIONS_FENCE}`,
    ...JSON.stringify(payload, null, 2).split('\n'),
    fence,
  ];
}

/**
 * Read the recommendations back out of a report — what Build calls.
 *
 * Returns `null` when the report carries no block, rather than an empty list: a
 * report with nothing to recommend and a report written by a version that had
 * no block yet are different states, and only one of them means "there is
 * nothing to build".
 *
 * A block that is present but unparseable throws. Silently returning nothing
 * would let Build proceed as though a clean assessment had been read, which is
 * the one wrong answer here.
 */
export function parseRecommendations(text = '') {
  const fence = '```';
  const opener = `${fence}${RECOMMENDATIONS_FENCE}`;
  const lines = String(text).split('\n');
  const start = lines.findIndex((line) => line.trim() === opener);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() === fence);
  if (end === -1) {
    throw new SyntaxError(`the ${RECOMMENDATIONS_FENCE} block in this report is never closed.`);
  }
  const body = rest.slice(0, end).join('\n');
  let payload;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new SyntaxError(
      `the ${RECOMMENDATIONS_FENCE} block in this report is not valid JSON (${error.message}).`,
    );
  }
  return {
    schemaVersion: payload.schemaVersion ?? null,
    recommendations: Array.isArray(payload.recommendations) ? payload.recommendations : [],
  };
}

// ---------------------------------------------------------------------------
// The template
// ---------------------------------------------------------------------------

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

/** The summary section — what this scan found, in two sentences at most. */
function summaryLines(result = {}) {
  const score = result.score ?? {};
  if (!result.score) return ['This report carries no assessment.'];
  if (score.clean) return ['Nothing was found in any family. The codebase matches what you recorded.'];
  return [
    `${plural(score.total ?? 0, 'finding')} across ${plural(familiesWithFindings(score).length, 'family', 'families')} — ` +
      `${plural(score.errors ?? 0, 'error')} and ${plural(score.warnings ?? 0, 'warning')}.`,
  ];
}

function familiesWithFindings(score = {}) {
  return FAMILIES.map(([family]) => family).filter((family) => (score.families?.[family]?.total ?? 0) > 0);
}

/**
 * The drift section — one row per family, including the empty ones.
 *
 * A family with nothing in it is printed as a family with nothing in it, the
 * same decision the terminal report makes: the difference between a check that
 * passed and a check that never ran is the whole value of printing it.
 */
function driftLines(result = {}) {
  const score = result.score;
  if (!score) return ['No drift was measured.'];
  const out = ['| Family | Errors | Warnings | What it covers |', '|---|---|---|---|'];
  for (const [family, blurb] of FAMILIES) {
    const summary = score.families?.[family];
    if (!summary) continue;
    out.push(
      `| ${family} | ${summary.bySeverity?.[ERROR] ?? 0} | ${summary.bySeverity?.[WARN] ?? 0} | ${blurb} |`,
    );
  }
  return out;
}

/**
 * The health-score section — the number, the verdict, and the scale.
 *
 * The top of the scale is read from the same table the score itself came from,
 * never written down here. "8" means nothing without "of 21", and a hardcoded
 * 21 would keep printing after somebody edited the scale in `refs/assess/`.
 */
function healthLines(result = {}) {
  const score = result.score;
  if (!score) return ['No score was computed.'];
  const scale = scoreScale();
  const scaleTop = scale[scale.length - 1];
  return [
    `Drift score: **${score.score} of ${scaleTop}** — ${score.means ?? 'unstated'}.`,
    '',
    `Verdict: **${score.verdict}** — ${plural(score.errors ?? 0, 'error')}, ${plural(score.warnings ?? 0, 'warning')}, drift mass ${score.mass ?? 0}.`,
  ];
}

/** One recommendation as the line a person reads. */
function recommendationLine(row) {
  const evidence = (row.evidence ?? []).slice(0, EVIDENCE_SAMPLE).join(', ');
  const parts = [`**${row.severity}** · \`${row.rule}\` (${row.family}) — ${plural(row.count, 'finding')}`];
  if (evidence) parts.push(evidence);
  const line = `- ${parts.join(' · ')}`;
  return row.action ? `${line} → ${row.action}` : line;
}

/**
 * The whole report.
 *
 * Sections in the order the acceptance criteria name them: date, summary,
 * drift, health score, recommendations. Lightweight on purpose — a report is a
 * working document, not a dossier, so every section is a handful of lines and
 * the detail stays in `assess.json` for anything that wants all of it.
 *
 * `date` is required rather than defaulted here. Defaulting it would put a
 * clock read inside render code, which is the exact thing the determinism rule
 * forbids; `writeAssessReport` below is where the default lives.
 */
export function renderAssessReport({ number, date, result = {}, recommendations = null } = {}) {
  const n = asReportNumber(number);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError(`a report needs its own date as YYYY-MM-DD, not "${date}"`);
  }
  const rows = recommendations ?? recommendationsFrom(result);

  const lines = [
    `# Assessment ${n}`,
    '',
    `Date: ${date}`,
    '',
    '## Summary',
    '',
    ...summaryLines(result),
    '',
    '## Drift',
    '',
    ...driftLines(result),
    '',
    '## Health score',
    '',
    ...healthLines(result),
    '',
    '## Recommendations',
    '',
  ];

  if (rows.length === 0) {
    lines.push('Nothing to do. No family reported a finding.');
  } else {
    for (const row of rows) lines.push(recommendationLine(row));
  }
  lines.push('', ...renderRecommendationsBlock(rows));

  return `${lines.join('\n')}\n`;
}

/**
 * Write the next report — or a numbered one, when the caller already resolved
 * the number.
 *
 * The clock's default lives here and nowhere deeper, so a caller that wants
 * fixed bytes passes `date` and gets them. The write goes through the funnel,
 * which is what keeps `.phyllum/assess-[n].md` a legitimate target rather than
 * a raw `fs` call in a command module.
 */
export function writeAssessReport(
  root,
  result = {},
  { number = null, date = null, now = new Date(), recommendations = null } = {},
) {
  const n = number === null ? nextReportNumber(root) : asReportNumber(number);
  const on = date ?? reportDate(now);
  const contents = renderAssessReport({ number: n, date: on, result, recommendations });
  const written = writeAssessReportFile(root, n, contents);
  return { number: n, date: on, path: written, bytes: Buffer.byteLength(contents) };
}

/** Read one report back, or null when it is not there. */
export function readAssessReport(root, number) {
  const abs = path.join(path.resolve(root), ...reportPathFor(number).split('/'));
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}
