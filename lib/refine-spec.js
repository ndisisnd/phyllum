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
 *   phyllum:usage-clauses          the usage contract's clauses, family and kind
 *   phyllum:test-harnesses         the test runners, how each is detected, its dialect
 *   phyllum:test-render            the render libraries a mounted clause needs
 *
 * The last three arrived with phase 3 and follow the same discipline. A clause
 * table read from code is what stops `refine tests` from asserting something
 * the protocol never claimed: the reference says what each clause asserts and
 * when it is stated at all, and the code holds only how that sentence is
 * spelled in one runner's dialect.
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
  usageClauses: '<!-- phyllum:usage-clauses -->',
  testHarnesses: '<!-- phyllum:test-harnesses -->',
  testRender: '<!-- phyllum:test-render -->',
};

/** The two clause kinds, and the difference decides whether a clause can be emitted. */
export const SPEC_CLAUSE = 'spec';
export const RENDERED_CLAUSE = 'rendered';

/** The three parts of a usage contract, in the order the protocol states them. */
export const CLAUSE_FAMILIES = ['type', 'data', 'usage'];

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

  const usageClauses = tableAfter(text, MARKERS.usageClauses).map(
    ([clause, family, kind, asserts, statedWhen]) => ({
      clause: stripTicks(clause),
      family: familyCell(family),
      kind: kindCell(kind),
      asserts: String(asserts ?? '').trim(),
      statedWhen: String(statedWhen ?? '').trim(),
    }),
  );

  const testHarnesses = tableAfter(text, MARKERS.testHarnesses).map(
    ([name, configs, pkg, suite, unit, assertion, imports]) => ({
      id: stripTicks(name),
      name: stripTicks(name),
      configs: listCell(configs ?? ''),
      package: isNone(stripTicks(pkg ?? '')) ? null : stripTicks(pkg),
      suite: stripTicks(suite ?? ''),
      case: stripTicks(unit ?? ''),
      assertion: stripTicks(assertion ?? ''),
      imports: importsCell(imports ?? ''),
    }),
  );

  const testRender = tableAfter(text, MARKERS.testRender).map(
    ([name, pkg, imports, render, query]) => ({
      id: stripTicks(name),
      package: stripTicks(pkg ?? ''),
      imports: importsCell(imports ?? ''),
      render: stripTicks(render ?? ''),
      query: stripTicks(query ?? ''),
    }),
  );

  return { coverageRules, namingRules, linters, usageClauses, testHarnesses, testRender };
}

/**
 * An import cell, split on the statement terminator rather than on commas.
 *
 * `listCell` cannot read this column: `import { describe, expect, it }` is one
 * statement with two commas in it, and splitting there would hand the generator
 * three broken lines. A statement ends at its semicolon, which is also how the
 * generated file will read.
 */
function importsCell(cell) {
  const text = String(cell ?? '').trim();
  if (isNone(text)) return [];
  return text
    .split(';')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => `${line};`);
}

/** A family cell is one of three words, and a fourth would be a new part of the contract. */
function familyCell(cell) {
  const word = stripTicks(cell ?? '').toLowerCase();
  if (!CLAUSE_FAMILIES.includes(word)) {
    throw new Error(
      `${refFileOf(MARKERS.usageClauses, REFINE_REF)}: "${cell}" is not a clause family — the three are ${CLAUSE_FAMILIES.join(', ')}`,
    );
  }
  return word;
}

/** A kind cell is `spec` or `rendered`; the difference decides what can be emitted. */
function kindCell(cell) {
  const word = stripTicks(cell ?? '').toLowerCase();
  if (word !== SPEC_CLAUSE && word !== RENDERED_CLAUSE) {
    throw new Error(
      `${refFileOf(MARKERS.usageClauses, REFINE_REF)}: "${cell}" is not a clause kind — the two are \`${SPEC_CLAUSE}\` and \`${RENDERED_CLAUSE}\``,
    );
  }
  return word;
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

/** The usage contract's clauses, in the order the protocol lists them. */
export const usageClauses = () => load().usageClauses;

/** One clause's row by name, or null — a clause nothing declares is one nothing may assert. */
export const usageClauseFor = (clause) =>
  load().usageClauses.find((row) => row.clause === String(clause)) ?? null;

/** Every test runner Refine knows how to detect and write for, in table order. */
export const testHarnesses = () => load().testHarnesses;

/** One harness's row by name, or null. */
export const testHarnessFor = (id) =>
  load().testHarnesses.find((row) => row.id === String(id).toLowerCase()) ?? null;

/** The render libraries a mounted clause can be written against. */
export const renderLibraries = () => load().testRender;
