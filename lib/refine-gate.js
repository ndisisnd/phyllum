/**
 * The full gate — bare `refine`, and the report it leaves behind (v0.11.0 phase 6).
 *
 * Phases 2 to 5 shipped seven checks as libraries with no command in front of
 * them. This module is the sixth phase's whole job: run every section in the
 * order the protocol fixes, over the subject the caller named, and write one
 * numbered report saying what the answer was on the day it was asked.
 *
 * Five decisions shape everything below, and each one is a rule from
 * `refs/refine/protocol-refine.md` rather than a choice made here.
 *
 *   1. **The order is the table.** `phyllum:refine-gate` names the seven
 *      sections and the kind of each. `gateSections()` returns those rows and
 *      this module walks them in the order they come back. There is no array of
 *      section names in this file, because an order written down twice is an
 *      order that can be reordered in one of the two copies — and "deterministic
 *      checks first" is the stage's central claim.
 *   2. **The scope is the table too.** `phyllum:refine-scopes` names the three
 *      subjects — one component, one token, the whole system — and `resolveSubject`
 *      answers with one of those three words or with a refusal.
 *   3. **An unrecorded subject is a refusal, never a guess.** `refine card-hero`
 *      on a design system with no `card-hero` says so and writes nothing.
 *      Grading something the design system does not record would grade an
 *      invention, and a numbered report of an invented grade is worse than no
 *      report at all.
 *   4. **No section is skipped, and a section that cannot run says why.** Every
 *      one of the seven appears in every report. A section outside the subject's
 *      reach — coverage against a token, which is not a thing that gets built —
 *      is reported as not applying, with the reason. Silence is the one answer a
 *      gate may not give.
 *   5. **Nothing is fixed, and nothing outside `.phyllum/` is written.** The
 *      sections are the phase-2-to-5 libraries, unchanged, each of which already
 *      reports rather than repairs. The one write is the numbered report, and it
 *      goes through the funnel in `lib/write.js` like every other write.
 *
 * ## One computation, two readings
 *
 * Section 1 asks whether the subject has a recorded contract; section 6 asks
 * whether tests for that contract exist. Both facts come out of one
 * `refineTests` run, computed once and afterwards only read. That is not an
 * optimisation — it is what makes the report internally consistent. Ship
 * criterion 1 reads the same derived clauses section 1 reports, so a component
 * cannot be told its contract is present in section 1 and absent in section 7.
 *
 * ## Numbering and dating
 *
 * Both are `lib/assess-reports.js`'s, and they are its rather than a third
 * spelling of them for the reason that file gives: two numbering schemes in one
 * directory is one scheme too many. Numbering is numeric and never
 * lexicographic, the next number is one past the highest that *exists* rather
 * than one past the count, a deleted number is never reused, and a report is
 * never overwritten.
 *
 * `reportDate` is imported rather than reimplemented, which also imports its
 * one non-obvious property: **the date is read in local time, not UTC.**
 * `toISOString()` is the shorter spelling and it dates a report in a timezone
 * the reader does not live in — run at 04:00 in +08 and the file says
 * yesterday. Determinism is supplied by the injection seam above it, not by the
 * zone the default happens to read.
 */

import fs from 'node:fs';
import path from 'node:path';

import { reportDate } from './assess-reports.js';
import { componentContrast } from './refine-a11y.js';
import { refineA11y } from './refine-a11y.js';
import { refineCoverage, componentFiles } from './refine-coverage.js';
import { COMPONENT, TOKEN, subjectKind, recordedTokenNames } from './refine-deprecate.js';
import { refineLint } from './refine-lint.js';
import { TOKEN_SECTIONS, refineNaming } from './refine-naming.js';
import { refineShip } from './refine-ship.js';
import { refineTests } from './refine-tests.js';
import { gateSections, refineScopeFor } from './refine-spec.js';
import { parseSpecBlock } from './create.js';
import { readComponent, specOf } from './prd.js';
import {
  DESIGN_SYSTEM_FILE,
  REFINE_REPORT_PREFIX,
  STATE_DIR,
  refineReportFile,
  writeRefineReportFile,
} from './write.js';

/** Where numbered gate reports live — inside the session directory, with the rest. */
export const REFINE_REPORT_DIR = STATE_DIR;

/** The only filename shape this module recognises, and the one it writes. */
export const REFINE_REPORT_PATTERN = /^refine-report-(\d+)\.md$/;

/** The fence's info string — how a consumer finds the verdict block. */
export const REFINE_VERDICT_FENCE = 'phyllum-refine-verdict';

/**
 * The shape of the verdict block. Bumped on a field that changes meaning or
 * disappears; never on one that is merely added — the rule
 * `RECOMMENDATIONS_SCHEMA_VERSION` states in `lib/assess-reports.js`.
 */
export const REFINE_VERDICT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

/** A report number, or a thrown error — never a silently coerced `NaN`. */
function asReportNumber(number) {
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`a report number is a whole number from 1 upwards, not "${number}"`);
  }
  return n;
}

/** The report file's name for a given number. */
export function refineReportFileName(number) {
  return `refine-report-${asReportNumber(number)}.md`;
}

/**
 * The report's path, relative to the project root, posix-style.
 *
 * Built by the write funnel rather than here, for the reason `reportPathFor`
 * in `assess-reports.js` gives: the name this module writes and the name the
 * permission model knows are one string, not two that agree today.
 */
export function refineReportPathFor(number) {
  return refineReportFile(asReportNumber(number));
}

/**
 * Every gate report number already on disk, ascending and numeric.
 *
 * A missing `.phyllum/` is an empty list rather than an error: the first gate
 * run in a project happens before the directory necessarily exists.
 */
export function listRefineReportNumbers(root) {
  const dir = path.join(path.resolve(root), ...REFINE_REPORT_DIR.split('/'));
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const numbers = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = REFINE_REPORT_PATTERN.exec(entry.name);
    if (!match) continue;
    // A leading zero would make `refine-report-01.md` and `refine-report-1.md`
    // the same number under two names, and only one of them is a name this
    // module writes. The other is a stranger, and strangers are ignored.
    if (match[1].length > 1 && match[1].startsWith('0')) continue;
    numbers.push(Number(match[1]));
  }
  return numbers.sort((a, b) => a - b);
}

/** Every gate report on disk as `{ number, path }`, in numeric order. */
export function listRefineReports(root) {
  return listRefineReportNumbers(root).map((number) => ({
    number,
    path: refineReportPathFor(number),
  }));
}

/**
 * The number the next gate report takes: one past the highest that exists.
 *
 * Not one past the count. A number already named a gate run somebody may have
 * quoted, and a second run under that name would make the quote wrong.
 */
export function nextRefineReportNumber(root) {
  const numbers = listRefineReportNumbers(root);
  return numbers.length === 0 ? 1 : numbers[numbers.length - 1] + 1;
}

/** The most recent gate report, or null when there is none. */
export function latestRefineReportNumber(root) {
  const numbers = listRefineReportNumbers(root);
  return numbers.length === 0 ? null : numbers[numbers.length - 1];
}

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

/**
 * Which of the three subjects the caller named — or a refusal.
 *
 * No subject is the whole system, which is the default because it is the
 * question the stage exists to answer; a user who wanted one component named it.
 * A subject the design system does not record comes back `recorded: false` with
 * the reason, and nothing downstream grades it.
 */
export function resolveSubject(model, subject = null) {
  const typed = subject === null || subject === undefined ? '' : String(subject).trim();
  if (typed === '') {
    return { scope: 'system', subject: null, recorded: true, reason: null };
  }
  const kind = subjectKind(model, typed);
  if (kind === null) {
    return {
      scope: null,
      subject: typed,
      recorded: false,
      reason:
        `\`${typed}\` is not a component or a token this design system records, ` +
        'so there is nothing to grade — recording it comes first.',
    };
  }
  // `subjectKind` answers in the same two words the scopes table uses, and the
  // table is asked anyway: a word the reference stopped listing is a scope
  // nothing describes.
  const row = refineScopeFor(kind);
  if (!row) {
    throw new Error(`"${kind}" is not a scope the refs/refine/ scopes table records`);
  }
  return { scope: row.scope, subject: typed, recorded: true, reason: null };
}

/** Which token table a recorded token sits in, and the row it is. */
function tokenRow(model, name) {
  for (const section of TOKEN_SECTIONS) {
    for (const row of model?.tokens?.[section] ?? []) {
      if (String(row?.[0] ?? '').trim() === name) return { section, row };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The sections
// ---------------------------------------------------------------------------

/** A section that does not apply to this subject, saying so rather than nothing. */
const notApplicable = (row, reason) => ({
  order: row.order,
  section: row.section,
  key: row.key,
  kind: row.kind,
  asks: row.asks,
  applies: false,
  ran: false,
  reason,
  pass: null,
  findings: [],
  detail: null,
});

/** A section that ran, in the shape every reader of a report section sees. */
const ranSection = (row, { applies = true, ran = true, reason = null, pass = null, findings = [], detail = null }) => ({
  order: row.order,
  section: row.section,
  key: row.key,
  kind: row.kind,
  asks: row.asks,
  applies,
  ran,
  reason,
  pass,
  findings,
  detail,
});

/**
 * Section 1 — contract.
 *
 * A component's contract is its archetype and its slots, read through the same
 * derived clauses ship criterion 1 reads, so the two can never disagree. A
 * token's is its role and its value, which is a direct read of the table it
 * sits in.
 */
function contractSection(row, { scope, subject, model, tests }) {
  if (scope === 'token') {
    const found = tokenRow(model, subject);
    if (!found) return notApplicable(row, `\`${subject}\` sits in no token table this gate can read`);
    const [, ...values] = found.row;
    const value = values.map((cell) => String(cell ?? '').trim()).filter((cell) => cell !== '');
    const stated = value.length > 0 && !value.some((cell) => cell.toUpperCase() === 'TODO');
    return ranSection(row, {
      pass: stated,
      reason: stated ? null : `\`${subject}\` records no value in the ${found.section} table`,
      detail: {
        subjects: [
          {
            subject,
            kind: 'token',
            role: found.section,
            value: value.join(' · '),
            pass: stated,
          },
        ],
      },
    });
  }

  if (!tests) return notApplicable(row, 'the contract reading could not be derived');

  const entries = tests.components
    .filter((entry) => scope !== 'component' || entry.component === subject)
    .map((entry) => {
      const component = (model?.components ?? []).find(
        (row2) => String(row2.name) === entry.component,
      );
      const recorded = component ? readComponent(component) : null;
      const slots = component ? parseSpecBlock(specOf(component) ?? '')?.properties ?? {} : {};
      const stated = entry.clauses.filter((clause) => clause.stated);
      return {
        subject: entry.component,
        kind: 'component',
        archetype: recorded?.archetype ?? null,
        slots: Object.keys(slots).length,
        clauses: stated.map((clause) => clause.clause),
        pass: stated.length > 0,
        reason:
          stated.length > 0
            ? null
            : (entry.unstated[0]?.reason ?? 'no usage-contract clause can be derived from this spec'),
      };
    });

  const graded = entries.length;
  return ranSection(row, {
    pass: graded === 0 ? null : entries.every((entry) => entry.pass),
    reason: graded === 0 ? 'this design system records no component' : null,
    detail: { subjects: entries },
  });
}

/** Section 2 — coverage. A token is not a thing that gets built, so it is out of reach. */
function coverageSection(row, { scope, subject, coverage }) {
  if (scope === 'token') {
    return notApplicable(row, 'coverage grades what a built component carries, and a token is not built');
  }
  if (!coverage || coverage.ran === false) {
    return ranSection(row, {
      ran: false,
      reason: coverage?.reason ?? 'the coverage section could not run',
      pass: null,
    });
  }
  const components = coverage.components.filter(
    (entry) => scope !== 'component' || entry.component === subject,
  );
  const graded = components.filter((entry) => entry.checked);
  return ranSection(row, {
    pass: graded.length === 0 ? null : graded.every((entry) => entry.pass),
    reason: graded.length === 0 ? 'no recorded component was found built in this codebase' : null,
    findings: components.flatMap((entry) => entry.findings),
    detail: { components, caveat: coverage.caveat ?? null },
  });
}

/** Section 3 — naming. The one section every scope reaches, tokens included. */
function namingSection(row, { scope, subject, naming }) {
  if (!naming) return notApplicable(row, 'the naming section could not run');
  const names = naming.names.filter((entry) => scope === 'system' || entry.name === subject);
  if (names.length === 0) {
    return ranSection(row, { pass: null, reason: 'nothing recorded carries this name' });
  }
  return ranSection(row, {
    pass: names.every((entry) => entry.pass),
    findings: names.flatMap((entry) => entry.findings),
    detail: { names },
  });
}

/**
 * Section 4 — a11y.
 *
 * A component's reading is the one `refine a11y` already produced. A token's is
 * narrower and the scopes table says exactly how narrow: its contrast pairings,
 * meaning every measured pair a component spec binds it into, plus whether any
 * spec binds it at all.
 */
function a11ySection(row, { scope, subject, model, a11y }) {
  if (!a11y) return notApplicable(row, 'the a11y section could not run');

  if (scope === 'token') {
    const pairs = [];
    for (const component of model?.components ?? []) {
      const recorded = readComponent(component);
      const spec = parseSpecBlock(specOf(component) ?? '');
      for (const pair of componentContrast(recorded.name, spec, model).pairs) {
        if (!namesToken(pair.foreground, subject) && !namesToken(pair.background, subject)) continue;
        pairs.push({ component: recorded.name, ...pair });
      }
    }
    const unpaired = (a11y.unpaired ?? []).includes(String(subject).toLowerCase());
    const measured = pairs.filter((pair) => pair.pass !== null);
    return ranSection(row, {
      pass: measured.length === 0 ? null : measured.every((pair) => pair.pass),
      reason:
        measured.length > 0
          ? null
          : unpaired
            ? 'no component spec binds this token on either side of a pair, so nothing records what it is read against'
            : 'this token sits in no pair the contrast table names',
      detail: { pairs, unpaired },
    });
  }

  const components = a11y.components.filter(
    (entry) => scope !== 'component' || entry.component === subject,
  );
  const graded = components.filter((entry) => entry.checked);
  return ranSection(row, {
    pass: graded.length === 0 ? null : graded.every((entry) => entry.pass),
    reason: graded.length === 0 ? 'no recorded component could be graded for accessibility' : null,
    findings: components.flatMap((entry) => entry.findings),
    detail: {
      components,
      unpaired: scope === 'system' ? (a11y.unpaired ?? []) : [],
      markupRead: a11y.markupRead ?? null,
      markupReason: a11y.markupReason ?? null,
    },
  });
}

/** Does this bound slot value name the token — bare, or through `var(--…)`? */
function namesToken(bound, token) {
  const cleaned = String(bound ?? '')
    .trim()
    .replace(/^var\(\s*--/, '')
    .replace(/\s*\)$/, '')
    .toLowerCase();
  return cleaned === String(token ?? '').toLowerCase();
}

/** Section 5 — lint. A token has no files of its own for a linter to be pointed at. */
function lintSection(row, { scope, lint }) {
  if (scope === 'token') {
    return notApplicable(row, 'a linter is pointed at files, and a token has none of its own');
  }
  if (!lint) return notApplicable(row, 'the lint section could not run');
  if (lint.pass === null) {
    return ranSection(row, {
      ran: false,
      reason: lint.reason ?? 'no linter is configured in this project',
      pass: null,
      detail: { linters: lint.linters ?? [], runner: lint.runner ?? null },
    });
  }
  return ranSection(row, {
    pass: lint.pass,
    findings: lint.findings ?? [],
    detail: { linters: lint.linters ?? [], runner: lint.runner ?? null, couldNotRun: lint.couldNotRun ?? [] },
  });
}

/** Section 6 — tests. What the project carries, never what `refine tests` rendered. */
function testsSection(row, { scope, subject, tests }) {
  if (scope === 'token') {
    return notApplicable(row, 'a usage contract is a component’s, so a token carries no contract test');
  }
  if (!tests) return notApplicable(row, 'the tests section could not run');
  const components = tests.components.filter(
    (entry) => scope !== 'component' || entry.component === subject,
  );
  return ranSection(row, {
    pass: components.length === 0 ? null : components.every((entry) => entry.existing.length > 0),
    reason: components.length === 0 ? 'this design system records no component' : null,
    findings: (tests.findings ?? []).filter(
      (finding) => scope !== 'component' || finding.value === subject,
    ),
    detail: { harness: tests.harness ?? null, render: tests.render ?? null, components },
  });
}

/**
 * Section 7 — the ship verdict.
 *
 * It re-reads nothing and re-runs nothing: the six sections above are handed to
 * `refineShip`, which walks the criteria table over them. A token has no ship
 * verdict because the six criteria are a component's — coverage, a11y, lint,
 * tests and docs all name one — and inventing a shorter bar for tokens would be
 * the softened verdict the protocol forbids.
 */
function shipSection(row, { scope, subject, ship }) {
  if (scope === 'token') {
    return notApplicable(
      row,
      'the six ship criteria are a component’s; a token is shipped by the components that use it',
    );
  }
  if (!ship) return notApplicable(row, 'the ship section could not run');
  const components = ship.components.filter(
    (entry) => scope !== 'component' || entry.component === subject,
  );
  return ranSection(row, {
    pass: components.length === 0 ? null : components.every((entry) => entry.shippable),
    reason: components.length === 0 ? 'this design system records no component' : null,
    detail: {
      components,
      shippable: components.filter((entry) => entry.shippable).map((entry) => entry.component),
      notShippable: components.filter((entry) => !entry.shippable).map((entry) => entry.component),
    },
  });
}

/** Which builder answers which section, keyed by the table's own word. */
const BUILDERS = {
  contract: contractSection,
  coverage: coverageSection,
  naming: namingSection,
  a11y: a11ySection,
  lint: lintSection,
  tests: testsSection,
  ship: shipSection,
};

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Run the full gate over one subject.
 *
 * The sections come back in the order `phyllum:refine-gate` states, one entry
 * per row, always seven, with no row omitted for any reason. Every underlying
 * check may be handed in through `options` — the way `refineShip` accepts its
 * sections — so a caller that has already run one does not run it twice, and a
 * suite that wants a fixed answer supplies one.
 */
export function runRefineGate(root, model, options = {}) {
  const resolved = resolveSubject(model, options.subject ?? null);
  if (!resolved.recorded) {
    return {
      ran: false,
      refused: true,
      scope: null,
      subject: resolved.subject,
      reason: resolved.reason,
      sections: [],
      verdict: null,
    };
  }

  const { scope, subject } = resolved;
  const text = options.text ?? readDesignSystem(root);
  const tests = options.tests ?? refineTests(root, model, options);
  const coverage = options.coverage ?? refineCoverage(root, model, options);
  const naming = options.naming ?? refineNaming(model);
  const a11y = options.a11y ?? refineA11y(root, model, options);
  const lint =
    options.lint ??
    refineLint(root, { ...options, files: lintFilesFor(root, model, scope, subject, options) });
  const ship =
    options.ship ?? refineShip(root, model, { ...options, text, coverage, a11y, lint, tests });

  const context = { scope, subject, model, text, tests, coverage, naming, a11y, lint, ship };
  const sections = gateSections().map((row) => {
    const build = BUILDERS[row.key];
    // A row the table gained without a reader is reported as unreadable rather
    // than dropped, because a missing section is the one thing a gate may not do.
    if (!build) return notApplicable(row, 'no reader is wired for this gate section');
    return build(row, context);
  });

  const verdict = sections.find((entry) => entry.key === 'ship') ?? null;
  return {
    ran: true,
    refused: false,
    scope,
    subject,
    reason: null,
    sections,
    verdict: verdict
      ? {
          pass: verdict.pass,
          shippable: verdict.detail?.shippable ?? [],
          notShippable: verdict.detail?.notShippable ?? [],
          reason: verdict.reason,
          applies: verdict.applies,
        }
      : null,
  };
}

/** The files a linter is pointed at for a component scope — the whole project otherwise. */
function lintFilesFor(root, model, scope, subject, options) {
  if (scope !== 'component') return options.files ?? null;
  const entry = componentFiles(root, model, { signatures: options.signatures ?? null }).find(
    (row) => row.component === subject,
  );
  const files = entry?.files ?? [];
  return files.length === 0 ? null : files;
}

/** `DESIGN-SYSTEM.md` as text, or null — what the ship section reads deprecations from. */
function readDesignSystem(root) {
  try {
    return fs.readFileSync(path.join(path.resolve(root), DESIGN_SYSTEM_FILE), 'utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The verdict block
// ---------------------------------------------------------------------------

/** The fenced block, as lines. The only machine-readable part of the report. */
export function renderVerdictBlock(gate = {}) {
  const payload = {
    schemaVersion: REFINE_VERDICT_SCHEMA_VERSION,
    scope: gate.scope ?? null,
    subject: gate.subject ?? null,
    sections: (gate.sections ?? []).map((entry) => ({
      order: entry.order,
      section: entry.section,
      kind: entry.kind,
      applies: entry.applies,
      ran: entry.ran,
      pass: entry.pass,
      reason: entry.reason ?? null,
    })),
    shippable: gate.verdict?.shippable ?? [],
    notShippable: gate.verdict?.notShippable ?? [],
    verdict: verdictWord(gate),
  };
  const fence = '```';
  return [`${fence}${REFINE_VERDICT_FENCE}`, ...JSON.stringify(payload, null, 2).split('\n'), fence];
}

/**
 * The verdict in one word.
 *
 * Three answers, and the third is the one that may not be folded into either of
 * the others: a gate with nothing to grade has **no verdict**, which is not the
 * same sentence as "not shippable" and is very much not the same sentence as
 * "shippable".
 */
export function verdictWord(gate = {}) {
  const verdict = gate.verdict;
  if (!verdict || verdict.applies === false || verdict.pass === null) return 'no verdict';
  return verdict.pass ? 'shippable' : 'not shippable';
}

/** Read the verdict block back out of a report. */
export function parseVerdictBlock(text = '') {
  const fence = '```';
  const opener = `${fence}${REFINE_VERDICT_FENCE}`;
  const lines = String(text).split('\n');
  const start = lines.findIndex((line) => line.trim() === opener);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() === fence);
  if (end === -1) {
    throw new SyntaxError(`the ${REFINE_VERDICT_FENCE} block in this report is never closed.`);
  }
  let payload;
  try {
    payload = JSON.parse(rest.slice(0, end).join('\n'));
  } catch (error) {
    throw new SyntaxError(
      `the ${REFINE_VERDICT_FENCE} block in this report is not valid JSON (${error.message}).`,
    );
  }
  return {
    schemaVersion: payload.schemaVersion ?? null,
    scope: payload.scope ?? null,
    subject: payload.subject ?? null,
    sections: Array.isArray(payload.sections) ? payload.sections : [],
    shippable: Array.isArray(payload.shippable) ? payload.shippable : [],
    notShippable: Array.isArray(payload.notShippable) ? payload.notShippable : [],
    verdict: payload.verdict ?? null,
  };
}

// ---------------------------------------------------------------------------
// The template
// ---------------------------------------------------------------------------

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

/** How a section's answer reads at the top of its own body. */
function answerLine(entry) {
  if (!entry.applies) return `Does not apply — ${entry.reason}.`;
  if (!entry.ran) return `Could not run — ${entry.reason}.`;
  if (entry.pass === null) return `Nothing to grade — ${entry.reason ?? 'no subject reached this section'}.`;
  return entry.pass ? 'Pass.' : 'Fail.';
}

/** The evidence under a section: its findings, at most a handful of them. */
function findingLines(entry, limit = 5) {
  const findings = entry.findings ?? [];
  if (findings.length === 0) return [];
  const lines = findings
    .slice(0, limit)
    .map((row) => `- **${row.severity}** · \`${row.rule}\` — ${row.detail ?? row.value}`);
  if (findings.length > limit) {
    lines.push(`- …and ${plural(findings.length - limit, 'more finding')}.`);
  }
  return lines;
}

/** The Ship verdict section's own body: the conjunction, and what is open. */
function shipLines(entry) {
  if (!entry.applies || !entry.ran || entry.pass === null) return [];
  const components = entry.detail?.components ?? [];
  return components.map((component) => {
    if (component.shippable) return `- \`${component.component}\` — shippable.`;
    const blocked = component.blocked ? ` ${component.blocked}.` : '';
    return `- \`${component.component}\` — not shippable; open: ${component.open.join(', ')}.${blocked}`;
  });
}

/** The summary above the sections: the scope, the verdict, and what failed. */
function summaryLines(gate) {
  const scope = gate.scope === 'system' ? 'the whole system' : `\`${gate.subject}\``;
  const graded = (gate.sections ?? []).filter((entry) => entry.applies && entry.ran);
  const failed = graded.filter((entry) => entry.pass === false);
  const lines = [
    `Gate run over ${scope}: ${plural(graded.length, 'section')} ran, ` +
      `${plural((gate.sections ?? []).length - graded.length, 'section')} did not.`,
    '',
    `Verdict: **${verdictWord(gate)}**.`,
  ];
  if (failed.length > 0) {
    lines.push('', `Open sections: ${failed.map((entry) => entry.section).join(', ')}.`);
  }
  return lines;
}

/**
 * The whole gate report.
 *
 * Seven numbered sections in gate order, under a date and a summary — the shape
 * `protocol-refine.md` §4 states. Lightweight on purpose, exactly as the assess
 * and build reports are: a report is a working document, so each section is the
 * answer, the reason and a handful of findings, and the full detail stays in
 * the gate result for whatever wants all of it.
 *
 * `date` is required rather than defaulted, for the reason `renderAssessReport`
 * requires it: a default here would be a clock read inside render code, and
 * determinism forbids that. `writeRefineReport` below is where the default lives.
 */
export function renderRefineReport({ number, date, gate = {} } = {}) {
  const n = asReportNumber(number);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError(`a report needs its own date as YYYY-MM-DD, not "${date}"`);
  }
  if (gate.ran === false) {
    throw new Error(
      `a refused gate leaves no report — ${gate.reason ?? 'the subject is not recorded'}`,
    );
  }

  const scopeLine = gate.scope === 'system' ? 'the whole system' : `${gate.scope} \`${gate.subject}\``;
  const lines = [
    `# Refine report ${n}`,
    '',
    `Date: ${date}`,
    `Scope: ${scopeLine}`,
    '',
    '## Summary',
    '',
    ...summaryLines(gate),
  ];

  for (const entry of gate.sections ?? []) {
    lines.push('', `## ${entry.order}. ${titleCase(entry.section)}`, '', answerLine(entry));
    const evidence = entry.key === 'ship' ? shipLines(entry) : findingLines(entry);
    if (evidence.length > 0) lines.push('', ...evidence);
  }

  lines.push('', ...renderVerdictBlock(gate));
  return `${lines.join('\n')}\n`;
}

/** `ship verdict` → `Ship verdict`; the section names are the table's own words. */
const titleCase = (name) => String(name).charAt(0).toUpperCase() + String(name).slice(1);

/**
 * Write the next gate report — or a numbered one, when the caller already
 * resolved the number.
 *
 * The clock's default lives here and nowhere deeper, so a caller that wants
 * fixed bytes passes `date` and gets them. The write goes through the funnel,
 * which is what keeps `.phyllum/refine-report-[n].md` a legitimate target
 * rather than a raw `fs` call.
 */
export function writeRefineReport(root, gate, { number = null, date = null, now = new Date() } = {}) {
  const n = number === null ? nextRefineReportNumber(root) : asReportNumber(number);
  const on = date ?? reportDate(now);
  const contents = renderRefineReport({ number: n, date: on, gate });
  const written = writeRefineReportFile(root, n, contents);
  return { number: n, date: on, path: written, bytes: Buffer.byteLength(contents) };
}

/** Read one gate report back, or null when it is not there. */
export function readRefineReport(root, number) {
  const abs = path.join(path.resolve(root), ...refineReportPathFor(number).split('/'));
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Run the gate and leave the report behind — the whole of bare `refine`.
 *
 * A refusal writes nothing and says why, which is the one path through this
 * function that produces no numbered report.
 */
export function refineGate(root, model, options = {}) {
  const gate = runRefineGate(root, model, options);
  if (!gate.ran) return { ...gate, report: null };
  const report = writeRefineReport(root, gate, {
    number: options.number ?? null,
    date: options.date ?? null,
    now: options.now ?? new Date(),
  });
  return { ...gate, report };
}

export { REFINE_REPORT_PREFIX, recordedTokenNames, COMPONENT, TOKEN };
