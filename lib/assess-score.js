/**
 * The headline: one score and one verdict (v0.2.1 plan §7.1).
 *
 * Everything before this module answers a question about part of a codebase.
 * This one answers the question a person actually opens the report with — *how
 * bad is it?* — and it has to answer in a way that survives being quoted out of
 * context, because that is what a headline number is for.
 *
 * Two numbers rather than one, deliberately, because there are two questions
 * hiding in "how bad":
 *
 *   - **The verdict** — is any of this systematic? `fail` the moment one
 *     `error` finding exists anywhere, `pass w/ warnings` when there are only
 *     exceptions, `pass` when there is nothing at all. Derived from severities
 *     and never from the score.
 *   - **The score** — how much of it is there? One step on a seven-step
 *     Fibonacci scale, 1 to 21, lower better.
 *
 * They can disagree, and a report where they cannot is a report that lost
 * information. A codebase with one value written three times and nothing else
 * fails at a score of 1; a codebase with ninety deliberate one-off exceptions
 * passes with warnings at 8. Both readings are true, and neither is derivable
 * from the other.
 *
 * **Why Fibonacci.** Drift does not grow evenly, and neither does the work of
 * fixing it. A 0–100 scale would imply that 61 and 64 are different states of a
 * project; they are not, and no scan is precise enough to claim they are. The
 * Fibonacci steps widen as they climb, so the distance between two scores says
 * something honest: the next step up is roughly twice the problem, not one
 * percent more of it. The cut-points double for exactly that reason, and they
 * are rows in `refs/assess/` — a project that wants a harsher scale edits a
 * table, not this file.
 *
 * **Why weights.** Counting findings would say a stale token and a prop
 * contradiction are the same amount of wrong. They are not: one costs a reader
 * a moment of confusion, the other means two call sites of the same component
 * disagree about what it takes. So each family carries a weight per severity,
 * again from the table, and the sum of them is the *drift mass* the scale reads.
 *
 * Nothing here rescans anything. Every input is a count already derived by the
 * family that made the findings, which is what makes the score deterministic
 * for free: the same codebase produces the same findings, and the same findings
 * produce the same mass.
 */

import { ERROR, WARN, summariseFindings } from './assess.js';
import { scoreFamilies, scoreStepFor, scoreWeight, verdictFor } from './tokenise-spec.js';

/**
 * The five families, plus the extras, each with the findings it owns.
 *
 * The names are the ones the weights table uses, because a family that scores
 * under one name and reports under another is a family somebody will eventually
 * mis-weight. `lint` covers both halves of the values pass — the uncovered
 * values and the ones seen but not read — since both are raw styling the design
 * system does not name.
 */
export function familyFindings(result = {}) {
  const values = result.values ?? {};
  return {
    lint: [...(values.uncovered ?? []), ...(values.unreadable ?? [])],
    similarity: result.similarity?.findings ?? [],
    props: result.props?.findings ?? [],
    naming: result.naming?.findings ?? [],
    hygiene: result.hygiene?.findings ?? [],
    extras: result.extras?.findings ?? [],
  };
}

/**
 * Every family counted the same way, and then counted once more all together.
 *
 * One summariser for six families and for the whole, so the report cannot print
 * a total that disagrees with the rows above it — the failure mode a summary has
 * to be built against, because nobody adds up a table by hand.
 */
export function countFamilies(result = {}) {
  const findings = familyFindings(result);
  const families = {};
  const all = [];
  for (const [family, rows] of Object.entries(findings)) {
    families[family] = summariseFindings(rows);
    all.push(...rows);
  }
  return { families, overall: summariseFindings(all) };
}

/**
 * The weighted sum of everything found — the number the scale reads.
 *
 * A family the weights table does not name contributes nothing, and that is the
 * safe direction for the default to point: a check added later cannot silently
 * inflate every project's score before somebody decides what it is worth.
 */
export function driftMass(families = {}) {
  const known = new Set(scoreFamilies());
  let mass = 0;
  for (const [family, summary] of Object.entries(families)) {
    if (!known.has(family)) continue;
    mass += (summary.bySeverity?.[ERROR] ?? 0) * scoreWeight(family, ERROR);
    mass += (summary.bySeverity?.[WARN] ?? 0) * scoreWeight(family, WARN);
  }
  return mass;
}

/**
 * The whole headline for one assessment: counts, mass, step, verdict.
 *
 * Returned as data rather than as a sentence, so the terminal report, the JSON
 * file and the assertions all read the same object — three renderings of one
 * judgement, and no way for them to reach three different ones.
 */
export function scoreAssessment(result = {}) {
  const { families, overall } = countFamilies(result);
  const mass = driftMass(families);
  const step = scoreStepFor(mass);
  const errors = overall.bySeverity?.[ERROR] ?? 0;
  const warnings = overall.bySeverity?.[WARN] ?? 0;
  const verdict = verdictFor({ errors, warnings });

  return {
    score: step?.step ?? null,
    means: step?.means ?? null,
    mass,
    verdict,
    errors,
    warnings,
    total: overall.total,
    byRule: overall.byRule,
    families,
    // `clean` is exactly `verdict === 'pass'` (§7), stated here once so the
    // summary and the verdict can never drift into two different ideas of what
    // a clean project is.
    clean: verdict === 'pass',
  };
}
