/**
 * The Refine stage's tables, read out of `refs/refine/` (v0.11.0 phase 2).
 *
 * The three deterministic modes each carry a contract that is a table rather
 * than a paragraph: coverage has its rules and their severities, naming has
 * its rules and the subject each one grades, lint has the linters it knows how
 * to detect and the check-mode command each one is started with. This module is
 * their one reader, exactly as `lib/tokenise-spec.js` reads `refs/tokenise/` and
 * `lib/archetypes.js` reads `refs/create/`.
 *
 * There is no second copy of these rows in the code, and that is the point of
 * the module rather than a nicety. Two of the three tables decide what a gate
 * *fails* on; the third decides what Phyllum *runs*. A severity edited in one
 * place and remembered in another would make the gate say two things, and a
 * command edited in the reference while a hard-coded copy kept running would
 * make "report mode, never fix" a claim rather than a fact.
 *
 *   phyllum:refine-coverage-rules  the coverage rules and their severities
 *   phyllum:refine-naming-rules    the naming rules, their subject, their severity
 *   phyllum:refine-linters         the linters, how each is detected, how each is run
 *
 * Nothing here runs anything or reads a project. It reads Phyllum's own shipped
 * reference tree and returns rows.
 */

import { listCell, isNone, stripTicks, tableAfter as readTable } from './md-tables.js';
import { readRef, refFileOf } from './refs.js';

/** The stage folder these tables live in. */
export const REFINE_REF = 'refine';

export const MARKERS = {
  coverageRules: '<!-- phyllum:refine-coverage-rules -->',
  namingRules: '<!-- phyllum:refine-naming-rules -->',
  linters: '<!-- phyllum:refine-linters -->',
};

/** The two severities, the same two words every other finding in Phyllum uses. */
export const ERROR = 'error';
export const WARN = 'warn';

const tableAfter = (text, marker) => readTable(text, marker, refFileOf(marker, REFINE_REF));

/** A severity cell is one of two words, and a third would be a new vocabulary. */
function severityCell(cell, marker) {
  const word = stripTicks(cell ?? '').toLowerCase();
  if (word !== ERROR && word !== WARN) {
    throw new Error(
      `${refFileOf(marker, REFINE_REF)}: "${cell}" is not a severity — the two words are \`${ERROR}\` and \`${WARN}\``,
    );
  }
  return word;
}

/**
 * The three tables, read out of text rather than off disk.
 *
 * Split out for the reason `parseNomenclature` and `parseContracts` are: the
 * malformed-input sweep exercises the reader against doctored text, and
 * doctoring text is not the same as writing inside the package.
 */
export function parseRefineSpec(text) {
  const coverageRules = tableAfter(text, MARKERS.coverageRules).map(([rule, severity, detects]) => ({
    rule: stripTicks(rule),
    section: 'coverage',
    severity: severityCell(severity, MARKERS.coverageRules),
    detects: String(detects ?? '').trim(),
  }));

  const namingRules = tableAfter(text, MARKERS.namingRules).map(
    ([rule, subject, severity, detects]) => ({
      rule: stripTicks(rule),
      section: 'naming',
      subject: stripTicks(subject),
      severity: severityCell(severity, MARKERS.namingRules),
      detects: String(detects ?? '').trim(),
    }),
  );

  const linters = tableAfter(text, MARKERS.linters).map(
    ([name, configs, manifestKey, pkg, command]) => ({
      id: stripTicks(name),
      name: stripTicks(name),
      configs: listCell(configs ?? ''),
      manifestKey: isNone(stripTicks(manifestKey ?? '')) ? null : stripTicks(manifestKey),
      package: isNone(stripTicks(pkg ?? '')) ? null : stripTicks(pkg),
      // Whitespace only, exactly as `splitCommand` reads a recorded command:
      // a command that needs a quoting grammar is a command that needs a shell.
      command: stripTicks(command ?? '')
        .split(/\s+/)
        .filter((word) => word !== ''),
    }),
  );

  return { coverageRules, namingRules, linters };
}

let cache = null;

function load() {
  if (cache) return cache;
  cache = parseRefineSpec(readRef(REFINE_REF));
  return cache;
}

/** Forget the parse — the hostile-input sweeps re-read a doctored tree. */
export function reloadRefineSpec() {
  cache = null;
}

/** Every rule the deterministic modes can report, both sections at once. */
export const refineRules = () => [...load().coverageRules, ...load().namingRules];

/** One rule's row, or null — a rule nothing declares is a rule nothing may report. */
export const refineRuleFor = (rule) =>
  refineRules().find((row) => row.rule === String(rule)) ?? null;

/** The severity the table gives a rule. A rule with no row is a programming error. */
export function refineSeverityFor(rule) {
  const row = refineRuleFor(rule);
  if (!row) throw new Error(`no refine rule is called "${rule}" — the tables in refs/refine/ decide`);
  return row.severity;
}

/** The coverage rules, in table order. */
export const coverageRules = () => load().coverageRules;

/** The naming rules, in table order. */
export const namingRules = () => load().namingRules;

/** Every linter Refine knows how to detect and start. */
export const linters = () => load().linters;

/** One linter's row by name, or null. */
export const linterFor = (id) =>
  load().linters.find((row) => row.id === String(id).toLowerCase()) ?? null;
