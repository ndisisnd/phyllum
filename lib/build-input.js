/**
 * What the Build stage reads when nobody told it what to build (v0.10.0 phase 2).
 *
 * Assess ends by saying what should be built. Build begins by reading it. This
 * module is the seam between those two sentences: given a project root, it
 * answers "what is Build's input right now?" and it answers it from the disk
 * alone — the latest `.phyllum/assess-[n].md`, its recommendations block, and
 * nothing else. No model, no network, no guess.
 *
 * ## The override rule, stated once
 *
 * **A sentence the user typed is a decision, and a decision is never overridden
 * by a file.** `phyllum create "button primary with 12px padding-top"` means
 * exactly what it says, whatever the last drift report recommends. So prose is
 * checked first here and short-circuits everything below it.
 *
 * The corollary is the part that is easy to get wrong: the drift report is the
 * input **when there is no other input**, not a filter laid on top of one. There
 * is no mode in which a report narrows, reorders or vetoes what a typed
 * description asks for. Either the user said something, or the report did.
 * `skill/refs/build/input.md` is the same rule written for the conversation
 * side, and `skill/refs/build/build.md` §2 is the stage frame it comes from.
 *
 * That leaves exactly one place for the default to land: the flow that has no
 * input at all, which is bare `phyllum create` — the picker. Image mode is not
 * a candidate either, for the same reason prose is not: an image is an input.
 *
 * ## Why this is not one boolean
 *
 * "Is there a report to read" has five different no's, and a caller that
 * collapses them lies to somebody:
 *
 *   no-reports   `.phyllum/` holds no `assess-[n].md` at all. The project has
 *                never been assessed, and the honest thing is to say nothing
 *                about drift rather than imply a clean bill of health.
 *   unreadable   the file is listed but cannot be read back. Rare, and a
 *                different sentence from "there is no report".
 *   no-block     a report exists and carries no `phyllum-recommendations`
 *                block. It was written by a version that had none, so its
 *                silence is an absence of data, not a finding.
 *   empty        a report exists, its block parsed, and it recommends nothing.
 *                *This is a result.* The last assessment found nothing to do.
 *   unparseable  the block is there and is broken.
 *
 * The last one is the reason `parseRecommendations` throws rather than returning
 * null, and this module catches that throw rather than swallowing it: the
 * message is carried out on `error` so the user is told which report is
 * mangled and why. Proceeding as though a clean report had been read is the one
 * wrong answer available here — it would let Build claim a drift report backed
 * work that no drift report backed.
 *
 * ## Determinism
 *
 * Everything in this file is a directory listing, a file read and a JSON parse,
 * in that order, and the rendering below is a pure function of the result. Two
 * runs over one `.phyllum/` produce the same bytes, which is the same stance
 * `lib/candidates.js` takes over the markup scan the picker's other rows come
 * from. The stage is allowed a model later; resolving its input is not the part
 * that needs one.
 */

import {
  latestReportNumber,
  parseRecommendations,
  parseReportDate,
  readAssessReport,
  reportPathFor,
} from './assess-reports.js';

/** Where an input came from. Three answers, and no fourth. */
export const BUILD_INPUT_SOURCES = ['prose', 'report', 'none'];

/**
 * Why there is no report-borne input, when there is none.
 *
 * `null` on a resolution that *did* find one. Every other value is one of the
 * five no's in the header, kept apart because they are five different things to
 * tell a person.
 */
export const NO_INPUT_REASONS = ['prose', 'no-reports', 'unreadable', 'no-block', 'empty', 'unparseable'];

/** The shape every branch below returns, so no caller has to test for absence. */
function noInput(reason, { report = null, error = null, prose = null } = {}) {
  return {
    source: prose === null ? 'none' : 'prose',
    prose,
    report,
    recommendations: [],
    schemaVersion: null,
    reason,
    error,
  };
}

/**
 * Resolve the Build stage's input for one project root.
 *
 * `prose` is whatever the user typed, or null when they typed nothing. Passing
 * it is how a caller declares that an override exists — this function never
 * reaches into `args` itself, because three commands enter the stage by three
 * different grammars and only they know which of their arguments is a sentence.
 *
 * Returns, always:
 *
 *   source           'prose' | 'report' | 'none'
 *   prose            the overriding sentence, or null
 *   report           { number, date, path } for the latest report on disk, or
 *                    null — present even when its block was empty or broken, so
 *                    a caller can name the report it could not use
 *   recommendations  the rows Build would work from; `[]` unless source is
 *                    'report'
 *   schemaVersion    the block's declared version, or null
 *   reason           null when a report was read, otherwise one of
 *                    NO_INPUT_REASONS
 *   error            the parse failure's message, or null
 */
export function resolveBuildInput(root, { prose = null } = {}) {
  // The override, first and unconditionally. Nothing below this line runs when
  // the user has said what they want — not even the directory listing, because
  // a report that is never consulted cannot influence anything by accident.
  const said = typeof prose === 'string' ? prose.trim() : '';
  if (said !== '') return noInput('prose', { prose: said });

  const number = latestReportNumber(root);
  if (number === null) return noInput('no-reports');

  const text = readAssessReport(root, number);
  const report = { number, date: text === null ? null : parseReportDate(text), path: reportPathFor(number) };
  if (text === null) return noInput('unreadable', { report });

  let parsed;
  try {
    parsed = parseRecommendations(text);
  } catch (error) {
    // Surfaced, never swallowed. The caller prints this and falls back to the
    // flow it would have run with no report at all.
    return noInput('unparseable', { report, error: error.message });
  }

  if (parsed === null) return noInput('no-block', { report });
  if (parsed.recommendations.length === 0) {
    return { ...noInput('empty', { report }), schemaVersion: parsed.schemaVersion };
  }

  return {
    source: 'report',
    prose: null,
    report,
    recommendations: parsed.recommendations,
    schemaVersion: parsed.schemaVersion,
    reason: null,
    error: null,
  };
}

/**
 * How a report is named in the user's own terms — "assess-3, 2026-08-24".
 *
 * The date is included when the report carries one, and left out when it does
 * not, rather than filled in from today's clock. A report dated by the reader's
 * calendar instead of its own would be a report about a day it does not
 * describe.
 */
export function buildInputAttribution(input) {
  if (!input?.report) return null;
  const { number, date } = input.report;
  return date ? `assess-${number}, ${date}` : `assess-${number}`;
}

/** One recommendation as the line a person reads, in the report's own wording. */
function recommendationLine(row) {
  const count = `${row.count ?? 0} finding${row.count === 1 ? '' : 's'}`;
  const line = `  - **${row.severity}** · \`${row.rule}\` (${row.family}) — ${count}`;
  return row.action ? `${line} → ${row.action}` : line;
}

/**
 * The briefing that goes above the picker, or null when there is nothing to say.
 *
 * Null on purpose in the two cases where today's behaviour must be exactly
 * today's behaviour: a project that has never been assessed, and a run whose
 * input the user typed. Adding a line to either would change a flow this phase
 * promised not to touch.
 *
 * The other three cases each get their own sentence, because "your last
 * assessment found nothing to do" and "your last report is from a version that
 * wrote no block" are opposite pieces of news and a shared phrasing would make
 * one of them wrong.
 */
export function renderBuildInput(input) {
  if (!input || input.source === 'prose' || input.reason === 'no-reports') return null;
  const where = buildInputAttribution(input);

  if (input.reason === 'unparseable') {
    return [
      `Your latest drift report (${where}) could not be read: ${input.error}`,
      'Nothing from it is used, and the list below is exactly what it would have been',
      'without a report. Re-run `phyllum assess` to write a fresh one.',
    ].join('\n');
  }
  if (input.reason === 'unreadable') {
    return `Your latest drift report (${where}) is listed in .phyllum/ but could not be opened, so none of it is used.`;
  }
  if (input.reason === 'no-block') {
    return `Your latest drift report (${where}) carries no recommendations block, so there is nothing in it for Build to read. Re-run \`phyllum assess\` to write one that has.`;
  }
  if (input.reason === 'empty') {
    return `Your latest drift report (${where}) recommends nothing — the last assessment found no drift to answer. The list below is the whole offer.`;
  }

  return [
    `From your latest drift report — ${where}`,
    '',
    ...input.recommendations.map(recommendationLine),
    '',
    'That is what Build reads when you give it nothing else. Describing a component',
    'instead outranks it: `phyllum create "button primary"` builds what the sentence says.',
  ].join('\n');
}
