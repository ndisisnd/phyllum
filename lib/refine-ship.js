/**
 * `refine ship` — six criteria, one conjunction (v0.11.0 §5).
 *
 * The gate's seventh section, run on its own. It asks the question the stage
 * exists to answer — is this ready for production? — and it answers the only
 * way a gate can: by naming a bar, checking every part of it, and refusing to
 * average.
 *
 * Four decisions shape everything below:
 *
 *   1. **The criteria are the table, not a list in here.** `phyllum:ship-checks`
 *      in `refs/refine/ship.md` names the six, in order, with the section each
 *      one reads. This module iterates that table. A criterion dropped from the
 *      code while the reference still listed it would ship a component on five
 *      checks and call it six.
 *   2. **It re-runs nothing.** Every reading is a result one of the six gate
 *      sections already produced, handed in by the caller or computed once here
 *      and then only read. A verdict that re-read the codebase could disagree
 *      with the report printed above it.
 *   3. **Three answers, not two.** `pass`, `fail`, and `unmet` — the section
 *      could not run, or the stage that satisfies the criterion does not exist
 *      yet. Only `pass` ships, which is the protocol's rule that a criterion
 *      passed by absence is a criterion nobody checked.
 *   4. **Nothing is written.** Not a report, not `DESIGN-SYSTEM.md`. A verdict
 *      is true of a codebase on the day it was derived, and a `shippable: true`
 *      recorded in the file would keep saying yes long after the last criterion
 *      stopped holding. Re-deriving is cheap; a stale yes is not.
 *
 * A deprecated component is never shippable, and that is not a seventh
 * criterion. The six are still read and still reported — a component on its way
 * out can be perfectly clean — and the conjunction on top refuses it anyway.
 */

import fs from 'node:fs';
import path from 'node:path';

import { componentDeprecations } from './refine-deprecate.js';
import { refineA11y } from './refine-a11y.js';
import { refineCoverage } from './refine-coverage.js';
import { refineLint } from './refine-lint.js';
import { refineTests } from './refine-tests.js';
import {
  SHIP_FAIL,
  SHIP_PASS,
  SHIP_UNMET,
  shipChecks,
  shipStatusShips,
} from './refine-spec.js';
import { readComponent } from './prd.js';
import { DESIGN_SYSTEM_FILE } from './write.js';

/**
 * The spec-block key the docs criterion reads.
 *
 * It is the criterion's own `reads` word from `phyllum:ship-checks` rather than
 * a second spelling of it, because one name written twice is one name too many.
 * Governance (v0.12.0) is what will write the entry; until then the line is
 * only ever there because somebody put it there by hand.
 */
export const docsKey = () => shipChecks().find((row) => row.reads === 'docs')?.reads ?? 'docs';

/** One criterion's answer, in the shape every consumer reads. */
const answer = (row, status, reason = null) => ({
  criterion: row.criterion,
  reads: row.reads,
  status,
  reason,
  ships: shipStatusShips(status),
});

// ---------------------------------------------------------------------------
// The six readings
// ---------------------------------------------------------------------------

/**
 * A section-level verdict, turned into a criterion answer.
 *
 * `pass: null` is the case this exists for. "Everything passed" and "there was
 * nothing to ask" are different sentences, and the sections already keep them
 * apart; collapsing them here would undo that work at the last step.
 */
function fromVerdict(row, { pass, reason }) {
  if (pass === true) return answer(row, SHIP_PASS);
  if (pass === false) return answer(row, SHIP_FAIL, reason ?? row.unmet ?? null);
  return answer(row, SHIP_UNMET, reason ?? row.unmet ?? 'the section could not run');
}

/** Criterion 1: a contract with no derivable clause is an absent contract. */
function contractAnswer(row, tests) {
  if (!tests) return answer(row, SHIP_UNMET, 'the tests section did not run');
  const stated = tests.clauses.filter((clause) => clause.stated);
  if (stated.length > 0) return answer(row, SHIP_PASS);
  return answer(
    row,
    SHIP_FAIL,
    // The clause reasons are the evidence: each one names a fact about the spec
    // block rather than a judgement about it.
    tests.unstated.length > 0
      ? `no usage-contract clause can be derived from this spec — ${tests.unstated[0].reason}`
      : (row.unmet ?? 'no usage-contract clause can be derived from this spec'),
  );
}

/** Criterion 2: the component's own files carry no error-severity finding. */
function coverageAnswer(row, section, entry) {
  if (!section || section.ran === false) {
    return answer(row, SHIP_UNMET, section?.reason ?? 'the coverage section could not run');
  }
  if (!entry) return answer(row, SHIP_UNMET, 'the coverage section reported nothing for this component');
  if (entry.checked === false) return answer(row, SHIP_UNMET, entry.reason ?? row.unmet);
  return entry.pass
    ? answer(row, SHIP_PASS)
    : answer(row, SHIP_FAIL, `${entry.findings.length} coverage finding${entry.findings.length === 1 ? '' : 's'} against this component`);
}

/** Criterion 3: contrast, focus and ARIA, read from the section that ran them. */
function a11yAnswer(row, section, entry) {
  if (!section) return answer(row, SHIP_UNMET, 'the a11y section could not run');
  if (!entry) return answer(row, SHIP_UNMET, 'the a11y section reported nothing for this component');
  if (entry.checked === false) return answer(row, SHIP_UNMET, entry.reason ?? row.unmet);
  return entry.pass
    ? answer(row, SHIP_PASS)
    : answer(row, SHIP_FAIL, `${entry.findings.length} a11y finding${entry.findings.length === 1 ? '' : 's'} against this component`);
}

/** Criterion 5: what the project carries, never what `refine tests` rendered. */
function testsAnswer(row, tests) {
  if (!tests) return answer(row, SHIP_UNMET, 'the tests section did not run');
  if (tests.existing.length > 0) return answer(row, SHIP_PASS);
  return answer(
    row,
    SHIP_FAIL,
    tests.proposal
      ? `no usage-contract test covers this component — \`refine tests\` rendered one for ${tests.proposal.path}, and placing it is yours to do`
      : 'no usage-contract test covers this component',
  );
}

/**
 * Criterion 6: Governance's, and unmet until Governance ships.
 *
 * What is checkable today is whether the spec block records a documentation
 * entry at all. Absence is reported as unmet with the reason named — never as a
 * pass — because a criterion that passes by absence is a criterion that was
 * never checked, and this is the one the protocol names when it says so.
 */
function docsAnswer(row, spec) {
  const key = docsKey();
  const line = String(spec ?? '').match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'));
  if (line && line[1].trim() !== '') return answer(row, SHIP_PASS);
  return answer(
    row,
    SHIP_UNMET,
    `${row.unmet ?? 'nothing writes the documentation entry yet'} — \`govern docs\` is v0.12.0's, and Refine checks the entry rather than writing it`,
  );
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/**
 * One component's six answers and the conjunction over them.
 *
 * The criteria are walked in table order, so the report reads in the order the
 * protocol states the bar. `shippable` is the conjunction, and the deprecation
 * sits on top of it rather than inside it.
 */
export function componentShip(readings) {
  const criteria = shipChecks().map((row) => {
    switch (row.reads) {
      case 'contract':
        return contractAnswer(row, readings.tests);
      case 'coverage':
        return coverageAnswer(row, readings.coverage, readings.coverageEntry);
      case 'a11y':
        return a11yAnswer(row, readings.a11y, readings.a11yEntry);
      case 'lint':
        return fromVerdict(row, readings.lint ?? { pass: null, reason: null });
      case 'tests':
        return testsAnswer(row, readings.tests);
      case 'docs':
        return docsAnswer(row, readings.spec);
      default:
        return answer(row, SHIP_UNMET, 'no reader is wired for this criterion');
    }
  });

  const met = criteria.every((entry) => entry.ships);
  const deprecated = readings.deprecation ?? null;

  return {
    component: readings.component,
    criteria,
    met,
    deprecated,
    // A component the design system has already recorded as on its way out is
    // not a component to put into production, however well it scores.
    shippable: met && deprecated === null,
    blocked: deprecated
      ? `\`${readings.component}\` is deprecated, replaced by \`${deprecated.replacement}\` — ship that instead`
      : null,
    open: criteria.filter((entry) => !entry.ships).map((entry) => entry.criterion),
  };
}

/**
 * `refine ship` over every recorded component.
 *
 * The six sections are computed once when the caller does not hand them in, and
 * only read afterwards. Handing them in is the normal case inside the full
 * gate: they have already run, and running them twice could produce two
 * different answers to one question.
 */
export function refineShip(root, model, options = {}) {
  const text = options.text ?? readDesignSystem(root);
  const coverage = options.coverage ?? refineCoverage(root, model, options);
  const a11y = options.a11y ?? refineA11y(root, model, options);
  const lint = options.lint ?? refineLint(root, options);
  const tests = options.tests ?? refineTests(root, model, options);
  const deprecations = componentDeprecations(text ?? '');

  const coverageByName = new Map((coverage?.components ?? []).map((row) => [row.component, row]));
  const a11yByName = new Map((a11y?.components ?? []).map((row) => [row.component, row]));
  const testsByName = new Map((tests?.components ?? []).map((row) => [row.component, row]));

  const components = (model?.components ?? []).map((component) => {
    const recorded = readComponent(component);
    return componentShip({
      component: recorded.name,
      spec: recorded.spec,
      coverage,
      coverageEntry: coverageByName.get(recorded.name) ?? null,
      a11y,
      a11yEntry: a11yByName.get(recorded.name) ?? null,
      lint,
      tests: testsByName.get(recorded.name) ?? null,
      deprecation: deprecations.get(recorded.name) ?? null,
    });
  });

  return {
    ran: true,
    reason: null,
    sections: { coverage, a11y, lint, tests },
    components,
    shippable: components.filter((entry) => entry.shippable).map((entry) => entry.component),
    // A conjunction over a conjunction, and a system with nothing recorded has
    // no verdict to give rather than a clean one.
    pass: components.length === 0 ? null : components.every((entry) => entry.shippable),
  };
}

/** `DESIGN-SYSTEM.md` as text, or null — the deprecation reading's one input. */
function readDesignSystem(root) {
  try {
    return fs.readFileSync(path.join(path.resolve(root), DESIGN_SYSTEM_FILE), 'utf8');
  } catch {
    return null;
  }
}

/** The criteria this section reports, straight from the table. */
export const criteria = () => shipChecks().map((row) => row.criterion);
