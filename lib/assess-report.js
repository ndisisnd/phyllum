/**
 * The report's last two sections: every finding in one shape, and the headline
 * (v0.2.1 plan §7).
 *
 * By the time a reader reaches this point the assessment has told them six
 * things in six vocabularies — values, hygiene, similarity, naming, props and
 * the smaller checks — each written the way that family is best understood. All
 * of that is worth keeping, and none of it answers the question somebody opens
 * a report with: *what do I actually do, and how bad is this?*
 *
 * So the report ends by saying everything twice on purpose. First as one table
 * with one row shape — **severity · finding · evidence · suggested action** —
 * because a reader triaging work needs the findings side by side rather than
 * spread across six sections with six different phrasings. Then as one score
 * and one verdict, because a number is the only part of a report that survives
 * being pasted into a message.
 *
 * The suggested action is the column that makes the table worth printing. Every
 * other column restates something a section above already said; this one is the
 * first time the report says what to do about it, and it comes from a table in
 * `refs/assess/` so it can be argued with and edited without touching code.
 *
 * Nothing is computed here. The counts come from the score object, which
 * counted them with the same summariser every family used, so a total in this
 * section cannot disagree with the section it summarises.
 */

import { actionFor, scoreScale } from './tokenise-spec.js';

/** How many rows one family shows before the report says "and more". */
const PREVIEW = 6;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The families in reading order, and the one-line reason each exists.
 *
 * Ordered by how much a finding in it costs, which is the same order the score
 * weights them in: things that contradict each other first, untidiness after.
 */
export const FAMILIES = [
  ['lint', 'raw values your design system does not name'],
  ['similarity', 'things that are nearly the same thing'],
  ['props', 'components called two different ways'],
  ['naming', 'one concept spelled more than one way'],
  ['hygiene', 'what collides, and what nothing uses'],
  ['extras', 'the smaller checks — colours, dark mode, scales, layers'],
];

/**
 * One finding's evidence, whichever shape it arrived in.
 *
 * A value finding carries a count and a file list because that is what makes a
 * raw value a finding; every other family carries an `evidence` list because
 * what makes *those* findings is naming the two things involved. Rather than
 * make six families agree on one field, the report reads both — the row shape
 * is the report's contract, not the modules'.
 */
export function evidenceFor(row = {}) {
  if (typeof row.count === 'number' && Array.isArray(row.files)) {
    const first = row.files[0] ?? 'unknown';
    const rest = row.files.length > 1 ? ` +${row.files.length - 1} more` : '';
    return `${row.count}× in ${first}${rest}`;
  }
  const evidence = row.evidence ?? [];
  if (evidence.length === 0) return row.detail ?? '';
  return evidence.slice(0, 2).join('; ') + (evidence.length > 2 ? `; +${evidence.length - 2} more` : '');
}

/**
 * One row: severity, what was found, what proves it, what to do about it.
 *
 * A rule with no action row prints without one rather than with an invented
 * one. A report that always has advice is a report that will eventually give
 * the wrong advice, and "no suggestion" is a truthful thing for a tool to say.
 */
export function findingRow(row = {}) {
  const severity = String(row.severity ?? 'note').padEnd(5);
  const rule = row.rule ?? 'unread';
  const action = actionFor(rule);
  const parts = [`${severity} ${row.value}`, evidenceFor(row)].filter(Boolean);
  return `  ${parts.join(' · ')}${action ? ` → ${action}` : ''}`;
}

/**
 * Every finding, grouped by family, in one row shape (§7).
 *
 * A family with nothing in it is printed as a family with nothing in it. That
 * is the difference between a check that passed and a check that never ran, and
 * it is the same reason every other section here prints its silence.
 */
export function renderFindings(result = {}) {
  const score = result.score;
  if (!score) return [];

  const out = ['  The findings — severity · finding · evidence · what to do'];
  for (const [family, blurb] of FAMILIES) {
    const summary = score.families?.[family];
    if (!summary) continue;
    const errors = summary.bySeverity?.error ?? 0;
    const warnings = summary.bySeverity?.warn ?? 0;
    if (summary.total === 0) {
      out.push(`  ${family} — nothing found (${blurb})`);
      continue;
    }
    out.push(
      `  ${family} — ${plural(errors, 'error')}, ${plural(warnings, 'warning')} (${blurb})`,
    );
    const rows = findingsOf(result, family);
    for (const row of rows.slice(0, PREVIEW)) out.push(findingRow(row));
    if (rows.length > PREVIEW) out.push(`    …and ${rows.length - PREVIEW} more.`);
  }
  return out;
}

/**
 * The rows behind one family's counts, most serious first.
 *
 * Sorted rather than printed in discovery order, because the preview cap makes
 * order load-bearing: the six rows a reader sees should be the six that matter,
 * not the six that happened to be scanned first.
 */
/**
 * The spec rows the reader could not read, said out loud (v0.2.1 M6).
 *
 * Empty on every shipped copy of `refs/assess/`, and that is the intended
 * state — this prints only when somebody's own edit to the contract has a row
 * in it that no longer parses. It reads after the score rather than before the
 * findings because it is not a finding about the codebase; it is a note about
 * the rules the codebase was judged by, and the reader needs to know the
 * judgement was made with one rule missing.
 */
export function renderSpecNotices(notices = [], { ran = 'the assessment above' } = {}) {
  if (notices.length === 0) return [];
  // Which file to fix is read off the notices rather than assumed. Until v0.4.0
  // every tolerant table lived in the `assess` reference and naming it here was
  // safe; now `tokenise` and `update` have tolerant tables too, and a closing
  // line naming the wrong file is worse than none. Since v0.4.1 each reference
  // is a folder, so the path a notice carries has a directory in it.
  const files = [...new Set(notices.map((notice) => notice.match(/^refs\/[\w./-]+\.md/)?.[0]))].filter(
    Boolean,
  );
  const where = files.length > 0 ? files.map((file) => `\`${file}\``).join(' and ') : 'the reference file';
  return [
    `  ${notices.length === 1 ? 'One rule was' : `${notices.length} rules were`} skipped — ` +
      `${ran} ran without them.`,
    ...notices.map((notice) => `    ${notice}`),
    `    Fix the row in ${where}, or leave it out on purpose; either way the rest still ran.`,
  ];
}

export function findingsOf(result = {}, family) {
  const values = result.values ?? {};
  const rows =
    family === 'lint'
      ? [...(values.uncovered ?? []), ...(values.unreadable ?? [])]
      : (result[family]?.findings ?? []);
  return [...rows].sort(
    (a, b) =>
      Number(b.severity === 'error') - Number(a.severity === 'error') ||
      (b.count ?? 0) - (a.count ?? 0) ||
      String(a.value).localeCompare(String(b.value)),
  );
}

/**
 * The smaller checks, as the report reads them (§8).
 *
 * Two of the six can decline to run, and the declining is the part worth
 * printing: a project with no dark theme is told the check did not apply, never
 * that its dark coverage is fine. The rest print their findings, and their
 * silence when they have none.
 */
export function renderExtras(result = {}) {
  const { extras } = result;
  if (!extras) return [];

  const out = ['  The smaller checks — colours, dark mode, scales, layers'];

  if (extras.colours.length === 0) {
    out.push('  No two colours here are close enough to be one colour written twice.');
  }
  for (const row of extras.colours.slice(0, PREVIEW)) {
    out.push(`  ${row.value} — ${row.detail}.`);
  }
  if (extras.colours.length > PREVIEW) {
    out.push(`    …and ${extras.colours.length - PREVIEW} more.`);
  }

  if (!extras.dark.checked) {
    out.push(`  Dark mode was not checked — ${extras.dark.reason}.`);
  } else if (!extras.dark.tokensChecked) {
    out.push(`  Your tokens were not checked for dark values — ${extras.dark.tokensReason}.`);
  }
  if (extras.dark.checked && extras.dark.rows.length === 0) {
    out.push('  Every colour the light theme names is restated in a dark scope.');
  } else if (extras.dark.checked) {
    out.push(
      `  ${plural(extras.dark.rows.length, 'colour')} with no dark counterpart — seen in ${extras.dark.evidence.join(', ')}:`,
    );
    for (const row of extras.dark.rows.slice(0, PREVIEW)) {
      out.push(`  ${row.value} — ${row.detail}.`);
    }
    if (extras.dark.rows.length > PREVIEW) {
      out.push(`    …and ${extras.dark.rows.length - PREVIEW} more.`);
    }
  }

  for (const row of extras.aliases) out.push(`  ${row.value} — ${row.detail}.`);

  if (!extras.spacing.checked) {
    out.push(`  Spacing was not measured against a scale — ${extras.spacing.reason}.`);
  }
  for (const row of extras.spacing.rows.slice(0, PREVIEW)) {
    out.push(`  ${row.value} — ${row.detail}.`);
  }
  if (extras.spacing.rows.length > PREVIEW) {
    out.push(`    …and ${extras.spacing.rows.length - PREVIEW} more.`);
  }

  for (const row of extras.zIndex) out.push(`  ${row.value} — ${row.detail}.`);
  for (const row of extras.breakpoints.slice(0, PREVIEW)) {
    out.push(`  ${row.value} — ${row.detail}.`);
  }
  if (extras.breakpoints.length > PREVIEW) {
    out.push(`    …and ${extras.breakpoints.length - PREVIEW} more.`);
  }

  out.push(
    `  Read ${plural(extras.swept.files, 'file')} for the literals no property table names — z-index and media-query widths.`,
  );
  return out;
}

/**
 * The headline: one score, one verdict, and what each of them means (§7.1).
 *
 * Printed with the scale beside the number, because "8" means nothing without
 * "of 21" and a reader should never have to look up what a score is out of. The
 * verdict is printed with the reason it came out that way — errors, warnings or
 * neither — since a verdict whose derivation is invisible is a verdict people
 * argue with instead of acting on.
 */
export function renderScore(result = {}) {
  const score = result.score;
  if (!score) return [];

  const scale = scoreScale();
  const top = scale[scale.length - 1];
  const out = [
    `  Drift score: ${score.score} of ${top} — ${score.means}.`,
    `  Verdict: ${score.verdict} — ${verdictReason(score)}.`,
  ];
  out.push(
    `  The score is how much (${plural(score.total, 'finding')}, weighted by family into a drift mass of ${score.mass}); the verdict is how bad. Same codebase, same numbers, every run.`,
  );
  return out;
}

/** Why this verdict, in the terms it was derived from — never from the score. */
function verdictReason(score) {
  if (score.errors > 0) {
    return `${plural(score.errors, 'finding')} used three times or more, or contradicting something you already recorded`;
  }
  if (score.warnings > 0) {
    return `no systematic drift, and ${plural(score.warnings, 'thing')} worth a look`;
  }
  return 'nothing found in any family';
}
