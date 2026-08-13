/**
 * The token contract, read from the skill's own reference files (v0.1.0 plan §4,
 * v0.2.0 plan §5).
 *
 * Two files, one loader. The tables are the spec — which files are read, which
 * properties belong to which pass and role, how near two values have to be
 * before they cluster, and what the naming scales are. This module parses them at
 * run time rather than restating them, exactly as `lib/archetypes.js` does for
 * `create`. Editing a table there changes the behaviour and changes what the
 * assertion suite expects, which is the point.
 *
 * The split between the two files follows the split between the two commands.
 * `refs/tokenise.md` holds what a *name* is made of, because a name means the
 * same thing whether the value came out of a sentence or out of the code:
 *   phyllum:prose-hints    a word in the prose -> the role, pass or name it signals
 *   phyllum:prose-weights  a weight word -> its numeric weight
 *   phyllum:passes         pass -> token section + the properties it reads
 *   phyllum:roles          number role -> properties, "applies to" label, ladder
 *   phyllum:compounds      the two passes whose value is a whole list, not a scalar
 *   phyllum:review         the four review actions and the words that pick them
 *   phyllum:colour-names   the colour naming scale, first match wins
 *   phyllum:ladders        the number ladders and their centre rung
 *   phyllum:type-roles     weight -> typography role
 *   phyllum:type-bands     size -> typography band and its name suffix
 *
 * `refs/assess.md` holds the codebase-scanning contract, which is `assess`'s as
 * of v0.2.0:
 *   phyllum:sources           which files are scanned, and which directories are not
 *   phyllum:text-scan         the language-agnostic sweep, and what it never reads
 *   phyllum:tailwind          arbitrary-value prefix -> the property it names
 *   phyllum:component-stacks  which frameworks the component pass runs on
 *   phyllum:clustering        how near counts as near, per cluster kind
 *   phyllum:severity          how often a value must be used before it is an error
 *   phyllum:lint-rules        pass + role -> the rule family a finding belongs to
 *   phyllum:hygiene-rules     the collision and unused families, and what each is worth
 *   phyllum:similarity-rules  the three similarity families, and how each is graded
 *   phyllum:similarity-weights  what a similarity score is made of, part by part
 *   phyllum:similarity-bands  score -> band and severity, first match wins
 *   phyllum:similarity-limits how much of a codebase one similarity pass compares
 *   phyllum:naming-conventions  the house styles a name can be written in, in order
 *   phyllum:naming-rules      the two naming-drift families, and what each is worth
 *   phyllum:prop-rules        the three prop-mismatch families, and what each is worth
 *   phyllum:prop-synonyms     meaning -> the spellings that all mean it
 *   phyllum:prop-kinds        the shapes a prop value comes in, and which may be compared
 *   phyllum:consistency-limits  how much of a codebase the naming and prop passes read
 */

import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_ROOT } from './template.js';
import {
  comparatorCell,
  isNone,
  listCell,
  numberCell,
  stripTicks,
  tableAfter as readTable,
} from './md-tables.js';

export const SPEC_FILE = path.join(PACKAGE_ROOT, 'skill', 'refs', 'tokenise.md');
export const ASSESS_SPEC_FILE = path.join(PACKAGE_ROOT, 'skill', 'refs', 'assess.md');

const MARKERS = {
  proseHints: '<!-- phyllum:prose-hints -->',
  proseWeights: '<!-- phyllum:prose-weights -->',
  passes: '<!-- phyllum:passes -->',
  roles: '<!-- phyllum:roles -->',
  review: '<!-- phyllum:review -->',
  colourNames: '<!-- phyllum:colour-names -->',
  ladders: '<!-- phyllum:ladders -->',
  typeRoles: '<!-- phyllum:type-roles -->',
  typeBands: '<!-- phyllum:type-bands -->',
  compounds: '<!-- phyllum:compounds -->',
};

/** The scanning tables, which moved to `refs/assess.md` with the behaviour. */
const ASSESS_MARKERS = {
  sources: '<!-- phyllum:sources -->',
  textScan: '<!-- phyllum:text-scan -->',
  tailwind: '<!-- phyllum:tailwind -->',
  componentStacks: '<!-- phyllum:component-stacks -->',
  clustering: '<!-- phyllum:clustering -->',
  severity: '<!-- phyllum:severity -->',
  lintRules: '<!-- phyllum:lint-rules -->',
  hygieneRules: '<!-- phyllum:hygiene-rules -->',
  similarityRules: '<!-- phyllum:similarity-rules -->',
  similarityWeights: '<!-- phyllum:similarity-weights -->',
  similarityBands: '<!-- phyllum:similarity-bands -->',
  similarityLimits: '<!-- phyllum:similarity-limits -->',
  namingConventions: '<!-- phyllum:naming-conventions -->',
  namingRules: '<!-- phyllum:naming-rules -->',
  propRules: '<!-- phyllum:prop-rules -->',
  propSynonyms: '<!-- phyllum:prop-synonyms -->',
  propKinds: '<!-- phyllum:prop-kinds -->',
  consistencyLimits: '<!-- phyllum:consistency-limits -->',
  extraRules: '<!-- phyllum:extra-rules -->',
  extraLimits: '<!-- phyllum:extra-limits -->',
  darkEvidence: '<!-- phyllum:dark-evidence -->',
  actions: '<!-- phyllum:actions -->',
  scoreWeights: '<!-- phyllum:score-weights -->',
  scoreSteps: '<!-- phyllum:score-steps -->',
  verdicts: '<!-- phyllum:verdicts -->',
};

const tableAfter = (text, marker) => readTable(text, marker, SPEC_FILE);
const assessTable = (text, marker) => readTable(text, marker, ASSESS_SPEC_FILE);

/** The words in a review-action cell: "`y`, `yes`, `ok`, or an empty answer". */
function answerWords(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim().toLowerCase());
}

let cache = null;

function load() {
  if (cache) return cache;
  const text = fs.readFileSync(SPEC_FILE, 'utf8');
  const assessText = fs.readFileSync(ASSESS_SPEC_FILE, 'utf8');

  // The prose reader's vocabulary: one row can list several spellings of the
  // same signal, so the table is flattened into word -> meaning.
  const proseHints = new Map();
  for (const [words, means] of tableAfter(text, MARKERS.proseHints)) {
    for (const word of listCell(words)) proseHints.set(word.toLowerCase(), stripTicks(means));
  }

  const proseWeights = new Map();
  for (const [words, weight] of tableAfter(text, MARKERS.proseWeights)) {
    for (const word of listCell(words)) proseWeights.set(word.toLowerCase(), numberCell(weight));
  }

  const rowsBySource = (marker) => {
    const rows = assessTable(assessText, marker).map(([source, items]) => ({
      source: stripTicks(source),
      items: listCell(items),
    }));
    return (name) => rows.find((row) => row.source === name)?.items ?? [];
  };

  const sourceFor = rowsBySource(ASSESS_MARKERS.sources);
  const sources = {
    stylesheets: sourceFor('stylesheets'),
    markup: sourceFor('markup'),
    skipped: sourceFor('skipped'),
  };
  sources.extensions = [...sources.stylesheets, ...sources.markup];

  // The language-agnostic half: every other text file, minus what is never
  // evidence — documentation, data dumps, lockfiles, and Phyllum's own record.
  const textFor = rowsBySource(ASSESS_MARKERS.textScan);
  const textScan = {
    skippedExtensions: textFor('skipped extensions'),
    skippedFiles: textFor('skipped files'),
  };

  const tailwind = Object.fromEntries(
    assessTable(assessText, ASSESS_MARKERS.tailwind).map(([prefix, properties]) => [
      stripTicks(prefix),
      listCell(properties),
    ]),
  );

  // Which stacks the component pass commits to — React only in v0.2.0.
  const componentStacks = assessTable(assessText, ASSESS_MARKERS.componentStacks)
    .filter(([, runs]) => /^yes\b/i.test(stripTicks(runs)))
    .map(([framework]) => stripTicks(framework));

  const passes = tableAfter(text, MARKERS.passes).map(([pass, section, shapes, properties]) => ({
    pass: stripTicks(pass),
    section: stripTicks(section).toLowerCase(),
    shapes: listCell(shapes),
    properties: properties.includes('(') ? [] : listCell(properties),
  }));

  // The compound passes are passes in every way the rest of the code cares
  // about — they have a token section and a property list — so they are folded
  // into `passes` rather than kept as a parallel concept. What is theirs alone
  // is the shorthand trigger, the "applies to" label and the ladder, and those
  // stay on their own rows.
  const compounds = tableAfter(text, MARKERS.compounds).map(
    ([pass, section, properties, applies, ladder, keywords]) => ({
      pass: stripTicks(pass),
      section: stripTicks(section).toLowerCase(),
      properties: listCell(properties).map((property) => property.toLowerCase()),
      appliesTo: stripTicks(applies),
      ladder: stripTicks(ladder),
      keywords: listCell(keywords).map((keyword) => keyword.toLowerCase()),
    }),
  );

  const roles = tableAfter(text, MARKERS.roles).map(([role, properties, applies, ladder]) => ({
    role: stripTicks(role),
    properties: listCell(properties),
    appliesTo: stripTicks(applies),
    ladder: stripTicks(ladder),
  }));

  const clustering = Object.fromEntries(
    assessTable(assessText, ASSESS_MARKERS.clustering).map(([kind, , threshold]) => [
      stripTicks(kind),
      numberCell(threshold),
    ]),
  );

  // How often a value has to be written before it stops being an exception.
  // Rows are tested in order, first match wins, so the table reads as a ladder
  // rather than as a pair of ranges that have to be kept from overlapping.
  const severities = assessTable(assessText, ASSESS_MARKERS.severity).map(([severity, used]) => ({
    severity: stripTicks(severity),
    used: comparatorCell(used),
  }));

  const lintRules = assessTable(assessText, ASSESS_MARKERS.lintRules).map(([rule, pass, role]) => ({
    rule: stripTicks(rule),
    pass: stripTicks(pass),
    role: isNone(stripTicks(role)) ? null : stripTicks(role),
  }));

  // The hygiene families and what each one is worth. Unlike a value finding,
  // a hygiene finding's severity is not a frequency — there is nothing to
  // count — so it is stated per rule, in the same place the rest of the
  // grading is stated.
  const hygieneRules = assessTable(assessText, ASSESS_MARKERS.hygieneRules).map(
    ([rule, severity]) => ({
      rule: stripTicks(rule),
      severity: stripTicks(severity),
    }),
  );

  // Similarity is graded two ways at once, so it is two tables and not one: a
  // family says how it is graded (`by band`, or a severity outright) and the
  // bands say what a score is worth. Keeping them apart is what lets a project
  // move the clone line without touching what a clone *is*.
  const similarityRules = assessTable(assessText, ASSESS_MARKERS.similarityRules).map(
    ([rule, severity]) => ({
      rule: stripTicks(rule),
      severity: stripTicks(severity),
    }),
  );

  const similarityWeights = Object.fromEntries(
    assessTable(assessText, ASSESS_MARKERS.similarityWeights).map(([part, weight]) => [
      stripTicks(part),
      numberCell(weight),
    ]),
  );

  const similarityBands = assessTable(assessText, ASSESS_MARKERS.similarityBands).map(
    ([band, score, severity]) => ({
      band: stripTicks(band),
      score: comparatorCell(score),
      severity: stripTicks(severity),
    }),
  );

  const similarityLimits = Object.fromEntries(
    assessTable(assessText, ASSESS_MARKERS.similarityLimits).map(([limit, value]) => [
      stripTicks(limit),
      numberCell(value),
    ]),
  );

  // The conventions are a *list* and not a map, because their order is part of
  // the contract twice over: the rows overlap (BEM is kebab with two more
  // separators, `Button` is Pascal case and one capitalised word at once) so the
  // first match wins, and a tie in the vote is broken by the same order — which
  // is how a dominant convention comes out the same way on every run.
  const namingConventions = assessTable(assessText, ASSESS_MARKERS.namingConventions).map(
    ([convention, , , votes]) => ({
      convention: stripTicks(convention),
      // A row votes for a convention rather than for itself, so `bem` can be
      // recognised as its own shape and still counted as the kebab it is a
      // spelling of. An em dash is a row that abstains.
      votesAs: isNone(stripTicks(votes)) ? null : stripTicks(votes),
    }),
  );

  const namingRules = assessTable(assessText, ASSESS_MARKERS.namingRules).map(
    ([rule, severity]) => ({ rule: stripTicks(rule), severity: stripTicks(severity) }),
  );

  // The `watches` column is empty for two of the three rows, exactly as the
  // lint-rules table's role column is: a rule that reads every prop names no
  // props, and a rule that reads three of them says which three here rather
  // than in a constant only a code change can reach.
  const propRules = assessTable(assessText, ASSESS_MARKERS.propRules).map(
    ([rule, severity, watches]) => ({
      rule: stripTicks(rule),
      severity: stripTicks(severity),
      watches: listCell(watches).map((prop) => prop.toLowerCase()),
    }),
  );

  // One row is one meaning and several spellings of it, so the table is
  // flattened into spelling -> meaning: the question the pass asks is always
  // "do these two attribute names mean the same thing?".
  const propSynonyms = new Map();
  for (const [meaning, spellings] of assessTable(assessText, ASSESS_MARKERS.propSynonyms)) {
    for (const spelling of listCell(spellings)) {
      propSynonyms.set(spelling.toLowerCase(), stripTicks(meaning));
    }
  }

  // Which shapes a value comes in is a fact about the language and lives in the
  // reader; which of them may be compared against each other is a decision, and
  // decisions live in the table.
  const propKinds = assessTable(assessText, ASSESS_MARKERS.propKinds).map(
    ([kind, , comparable]) => ({
      kind: stripTicks(kind),
      comparable: /^yes\b/i.test(stripTicks(comparable)),
    }),
  );

  const consistencyLimits = Object.fromEntries(
    assessTable(assessText, ASSESS_MARKERS.consistencyLimits).map(([limit, value]) => [
      stripTicks(limit),
      numberCell(value),
    ]),
  );

  // The §8 extras. One family in the report and six rules underneath it, each
  // with its own severity, because they are only alike in not belonging
  // anywhere else.
  const extraRules = assessTable(assessText, ASSESS_MARKERS.extraRules).map(
    ([rule, severity]) => ({ rule: stripTicks(rule), severity: stripTicks(severity) }),
  );

  const extraLimits = Object.fromEntries(
    assessTable(assessText, ASSESS_MARKERS.extraLimits).map(([limit, value]) => [
      stripTicks(limit),
      numberCell(value),
    ]),
  );

  // What counts as evidence that this codebase has a dark theme at all. The
  // check is conditional on it, so the list of what to look for is the check's
  // whole gate — and a gate belongs in the table, not in a regex nobody reads.
  const darkEvidence = assessTable(assessText, ASSESS_MARKERS.darkEvidence).map(
    ([evidence, writtenAs, readFrom]) => ({
      evidence: stripTicks(evidence),
      spellings: listCell(writtenAs),
      readFrom: stripTicks(readFrom),
    }),
  );

  // The one thing to do about a finding, per rule. It is the half of a report a
  // reader acts on, so it is data a project can edit rather than a sentence
  // buried in a renderer.
  const actions = Object.fromEntries(
    assessTable(assessText, ASSESS_MARKERS.actions).map(([rule, action]) => [
      stripTicks(rule),
      action.trim(),
    ]),
  );

  // The score is two tables and not one, for the same reason similarity is: the
  // weights say what a finding is worth, and the steps say what a total means.
  // A project can make naming matter more without touching where the steps sit.
  const scoreWeights = Object.fromEntries(
    assessTable(assessText, ASSESS_MARKERS.scoreWeights).map(([family, error, warn]) => [
      stripTicks(family),
      { error: numberCell(error) ?? 0, warn: numberCell(warn) ?? 0 },
    ]),
  );

  // Rows are tested in order and the first match wins, so the ladder reads
  // upwards and the last row — an em dash, matching anything — is the top step.
  const scoreSteps = assessTable(assessText, ASSESS_MARKERS.scoreSteps).map(
    ([step, mass, means]) => ({
      step: numberCell(step),
      mass: comparatorCell(mass),
      means: means.trim(),
    }),
  );

  // Only the labels are data here: which of the three a run gets is decided by
  // counting errors and warnings, and that counting is the same everywhere.
  const verdicts = assessTable(assessText, ASSESS_MARKERS.verdicts).map(([verdict, when]) => ({
    verdict: stripTicks(verdict),
    when: when.trim(),
  }));

  const review = tableAfter(text, MARKERS.review).map(([action, answers]) => ({
    action: stripTicks(action),
    answers: answerWords(answers),
  }));

  const colourNames = tableAfter(text, MARKERS.colourNames).map(
    ([name, lightness, saturation, rank]) => ({
      name: stripTicks(name),
      lightness: comparatorCell(lightness),
      saturation: comparatorCell(saturation),
      rank: numberCell(rank),
    }),
  );

  const ladders = Object.fromEntries(
    tableAfter(text, MARKERS.ladders).map(([ladder, rungs, centre]) => {
      const list = listCell(rungs);
      return [
        stripTicks(ladder),
        { rungs: list, centre: Math.max(0, list.indexOf(stripTicks(centre))) },
      ];
    }),
  );

  const typeRoles = tableAfter(text, MARKERS.typeRoles).map(([role, weight]) => ({
    role: stripTicks(role),
    weight: comparatorCell(weight),
  }));

  const typeBands = tableAfter(text, MARKERS.typeBands).map(([band, size, suffix]) => ({
    band: stripTicks(band),
    size: comparatorCell(size),
    suffix: stripTicks(suffix) === '—' ? '' : stripTicks(suffix),
  }));

  cache = {
    proseHints,
    proseWeights,
    sources,
    textScan,
    tailwind,
    componentStacks,
    passes: [
      ...passes,
      ...compounds.map((row) => ({
        pass: row.pass,
        section: row.section,
        shapes: [],
        properties: row.properties,
      })),
    ],
    compounds,
    severities,
    lintRules,
    hygieneRules,
    similarityRules,
    similarityWeights,
    similarityBands,
    similarityLimits,
    namingConventions,
    namingRules,
    propRules,
    propSynonyms,
    propKinds,
    consistencyLimits,
    extraRules,
    extraLimits,
    darkEvidence,
    actions,
    scoreWeights,
    scoreSteps,
    verdicts,
    roles,
    clustering,
    review,
    colourNames,
    ladders,
    typeRoles,
    typeBands,
  };
  return cache;
}

/** Re-read the tables — only the tests, which rewrite the file, need this. */
export function reloadSpec() {
  cache = null;
  return load();
}

export const spec = () => load();

export const sources = () => load().sources;

/** What the language-agnostic sweep never reads, by extension and by name. */
export const textScan = () => load().textScan;

/** The framework ids the component pass runs on — React only in v0.2.0. */
export const componentStacks = () => load().componentStacks;

/** Does the component pass commit to this stack? */
export function componentPassRuns(frameworkId) {
  return load().componentStacks.includes(String(frameworkId ?? '').toLowerCase());
}

export const proseHints = () => load().proseHints;
export const proseWeights = () => load().proseWeights;

/** What one word in the prose signals: a number role, `typography`, `name`, or null. */
export function hintFor(word) {
  return load().proseHints.get(String(word).toLowerCase()) ?? null;
}

/** The numeric weight a word like `bold` spells, or null. */
export function weightForWord(word) {
  return load().proseWeights.get(String(word).toLowerCase()) ?? null;
}
export const tailwindPrefixes = () => load().tailwind;
export const passes = () => load().passes;
export const roles = () => load().roles;
export const ladders = () => load().ladders;
export const colourNames = () => load().colourNames;
export const typeRoles = () => load().typeRoles;
export const typeBands = () => load().typeBands;

/** The token section a pass writes into: 'colours' | 'numbers' | 'typography'. */
export function sectionFor(pass) {
  return load().passes.find((row) => row.pass === pass)?.section ?? null;
}

/** How near two values have to be to cluster, by cluster kind. */
export function threshold(kind) {
  const value = load().clustering[kind];
  if (value === null || value === undefined) throw new Error(`no clustering threshold for ${kind}`);
  return value;
}

// ---------------------------------------------------------------------------
// Compound passes — a value that is a whole list, not a scalar
// ---------------------------------------------------------------------------

/** The compound passes, as the `phyllum:compounds` table declares them. */
export const compounds = () => load().compounds;

/** Is this pass one whose value is a compound? */
export const isCompoundPass = (pass) => load().compounds.some((row) => row.pass === pass);

/** The compound row for a pass, or null. */
export const compoundFor = (pass) => load().compounds.find((row) => row.pass === pass) ?? null;

/**
 * The compound pass a property belongs to, or null.
 *
 * A property can belong to a compound pass and to a scalar role at the same
 * time — `border` does — which is what the shorthand keywords sort out at read
 * time. This function only answers which pass *could* read it.
 */
export function compoundPassFor(property) {
  const wanted = String(property ?? '').toLowerCase();
  return load().compounds.find((row) => row.properties.includes(wanted))?.pass ?? null;
}

/**
 * The "applies to" label for a cluster, whichever pass it came out of.
 *
 * A scalar length is labelled by its role and a compound by its pass, because a
 * compound has no role — the whole value is the fact.
 */
export function appliesToForCluster({ pass, role } = {}) {
  const compound = compoundFor(pass);
  if (compound) return compound.appliesTo;
  return role ? appliesToFor(role) : '';
}

/** The ladder a cluster is named on: the compound's own, or its role's. */
export function ladderForCluster({ pass, role } = {}) {
  const compound = compoundFor(pass);
  const name = compound ? compound.ladder : load().roles.find((row) => row.role === role)?.ladder;
  return load().ladders[name] ?? { rungs: [], centre: 0 };
}

// ---------------------------------------------------------------------------
// Severity and rule families (v0.2.1 plan §3.2, §3.1)
// ---------------------------------------------------------------------------

/**
 * How serious is a finding used this many times?
 *
 * The whole judgement is one number from the table, which is the point: a
 * project that wants to be stricter edits a row rather than a constant, and the
 * assertion suite reads the same row.
 */
export function severityFor(count) {
  const used = Number(count) || 0;
  const row = load().severities.find((item) => !item.used || item.used.test(used));
  return row ? row.severity : null;
}

/** Every severity the table declares, most serious first. */
export const severities = () => load().severities.map((row) => row.severity);

/** The rule family a finding belongs to — `raw-radius`, `raw-shadow`, … */
export function lintRuleFor({ pass, role = null } = {}) {
  const row = load().lintRules.find(
    (item) => item.pass === pass && (item.role === null || item.role === role),
  );
  return row ? row.rule : null;
}

/** Every rule family, in the order the table declares them, without repeats. */
export const lintRules = () => [...new Set(load().lintRules.map((row) => row.rule))];

/**
 * How serious a hygiene finding is — stated per rule, because there is nothing
 * to count. A collision is one fact about a project, not a value written N
 * times, so frequency has no reading here.
 */
export function hygieneSeverityFor(rule) {
  const row = load().hygieneRules.find((item) => item.rule === rule);
  return row ? row.severity : null;
}

/** Every hygiene family, in the order the table declares them. */
export const hygieneRules = () => load().hygieneRules.map((row) => row.rule);

/** What one part of a similarity score is worth — `class words`, `element`, … */
export const similarityWeight = (part) => load().similarityWeights[part] ?? 0;

/** How much of a codebase one similarity pass compares — `signatures`, `pairs`, … */
export const similarityLimit = (limit) => load().similarityLimits[limit] ?? 0;

/** Every similarity family, in the order the table declares them. */
export const similarityRules = () => load().similarityRules.map((row) => row.rule);

/**
 * Which band a score falls in, and what that band is worth.
 *
 * Rows are tested in order and the first match wins, so the table reads as a
 * ladder from most serious downwards. A score below every row is not a finding
 * at all — two things sharing one word are not evidence of anything, and
 * returning null here is how that is said.
 */
export function bandFor(score) {
  const value = Number(score) || 0;
  const row = load().similarityBands.find((item) => !item.score || item.score.test(value));
  return row ? { band: row.band, severity: row.severity } : null;
}

/**
 * Is this family graded by its score, or by a severity the table states
 * outright? A band on a finding nobody bands by would be a number pretending to
 * have decided something.
 */
export const bandGraded = (rule) =>
  load().similarityRules.find((item) => item.rule === rule)?.severity === 'by band';

/**
 * How serious a similarity finding is: the score decides for the families whose
 * table cell says `by band`, and the cell itself decides for the ones it does
 * not — a repeated utility bundle is a `warn` however exactly it repeats.
 */
export function similaritySeverityFor(rule, score) {
  const row = load().similarityRules.find((item) => item.rule === rule);
  if (!row) return null;
  if (row.severity !== 'by band') return row.severity;
  return bandFor(score)?.severity ?? null;
}

// ---------------------------------------------------------------------------
// Consistency — naming drift and prop mismatches (v0.2.1 plan §5)
// ---------------------------------------------------------------------------

/**
 * The house styles a name can be written in, in the order the table declares.
 *
 * The order is load-bearing twice. The conventions overlap, so a name is
 * classified by the first row it matches; and when two conventions are used
 * exactly as often, the first-declared one wins the vote. Both readings come
 * out of one list, which is why this returns the list rather than a map.
 */
export const namingConventions = () => load().namingConventions.map((row) => row.convention);

/**
 * Which convention a name written this way is evidence *for*, or null.
 *
 * Two rows in the table make this a lookup rather than a yes/no. A single
 * lower-case word is evidence of nothing — it has no separator and no capital,
 * and counting it would let a codebase full of one-word class names elect a
 * convention nobody chose. And a BEM name is evidence for kebab, because BEM is
 * kebab with two more separators: counting them apart would have every BEM
 * codebase report half of its own names as strays from itself.
 */
export const conventionVotes = (convention) =>
  load().namingConventions.find((row) => row.convention === convention)?.votesAs ?? null;

/** How serious a naming finding is — stated per rule, as hygiene's are. */
export function namingSeverityFor(rule) {
  return load().namingRules.find((item) => item.rule === rule)?.severity ?? null;
}

/** Every naming family, in the order the table declares them. */
export const namingRules = () => load().namingRules.map((row) => row.rule);

/** How serious a prop mismatch is — a contradiction is an error, an escape a warn. */
export function propSeverityFor(rule) {
  return load().propRules.find((item) => item.rule === rule)?.severity ?? null;
}

/** Every prop-mismatch family, in the order the table declares them. */
export const propRules = () => load().propRules.map((row) => row.rule);

/** The props one rule watches — `style`, `css`, `sx` for the bypass check. */
export const propsWatchedBy = (rule) =>
  load().propRules.find((item) => item.rule === rule)?.watches ?? [];

/**
 * What one attribute name means, when the table says two names mean one thing.
 *
 * Null is the common answer and the right one: a prop nobody listed is a prop
 * with no synonym, not a prop with an unknown one.
 */
export const propMeaningFor = (name) =>
  load().propSynonyms.get(String(name ?? '').toLowerCase()) ?? null;

/** Every spelling the synonym table knows, in one set — for the assertions. */
export const propSynonymSpellings = () => [...load().propSynonyms.keys()];

/** Every value shape the table names, in the order it names them. */
export const propKinds = () => load().propKinds.map((row) => row.kind);

/**
 * May two values of this shape be compared against each other?
 *
 * An expression is the whole reason this column exists. An attribute scan can
 * see that `{size}` is an expression and cannot see what it evaluates to, so
 * calling it a conflict with a string would be a guess wearing a finding's
 * clothes.
 */
export const propKindComparable = (kind) =>
  load().propKinds.find((row) => row.kind === kind)?.comparable ?? false;

/** How much of a codebase the naming and prop passes read — `names`, `usages`, … */
export const consistencyLimit = (limit) => load().consistencyLimits[limit] ?? 0;

// ---------------------------------------------------------------------------
// The smaller checks, the score and the verdict (v0.2.1 plan §7, §8)
// ---------------------------------------------------------------------------

/** How serious one of the §8 extras is — stated per rule, as hygiene's are. */
export const extraSeverityFor = (rule) =>
  load().extraRules.find((item) => item.rule === rule)?.severity ?? null;

/** Every extra family, in the order the table declares them. */
export const extraRules = () => load().extraRules.map((row) => row.rule);

/** How far the extras reach — `colour distance`, `off-scale tolerance`, … */
export const extraLimit = (limit) => load().extraLimits[limit] ?? 0;

/** What a codebase with a dark theme looks like, one row per kind of evidence. */
export const darkEvidence = () => load().darkEvidence;

/** Every spelling of dark-mode evidence, flattened — the gate, as one list. */
export const darkSpellings = () => load().darkEvidence.flatMap((row) => row.spellings);

/**
 * The one thing to do about a finding of this rule.
 *
 * Null rather than a generic sentence when the table has no row: a report that
 * invents an action for a rule nobody wrote one for is a report that will
 * eventually suggest something wrong.
 */
export const actionFor = (rule) => load().actions[rule] ?? null;

/** Every rule the action table names — the assertions check it covers them all. */
export const actionRules = () => Object.keys(load().actions);

/** What one finding is worth, by family and severity, in drift-mass points. */
export const scoreWeight = (family, severity) =>
  load().scoreWeights[family]?.[severity] ?? 0;

/** Every family the weights table grades, in the order it declares them. */
export const scoreFamilies = () => Object.keys(load().scoreWeights);

/**
 * Which step of the Fibonacci scale a drift mass falls on.
 *
 * Rows are tested in order and the first match wins, so the table reads as a
 * ladder and the last row — no comparison at all — is the top of the scale.
 * There is always an answer: a scale with a hole in it would be a score that
 * sometimes is not one.
 */
export function scoreStepFor(mass) {
  const value = Number(mass) || 0;
  const row = load().scoreSteps.find((item) => !item.mass || item.mass.test(value));
  return row ? { step: row.step, means: row.means } : null;
}

/** The whole scale, lowest step first — what the report prints "of 21" from. */
export const scoreScale = () => load().scoreSteps.map((row) => row.step);

/** The three verdicts, most serious first, exactly as the table spells them. */
export const verdicts = () => load().verdicts.map((row) => row.verdict);

/**
 * The verdict for a run: errors decide, then warnings, then nothing.
 *
 * Derived from severities and never from the score, because the two answer
 * different questions — how bad, and how much.
 */
export function verdictFor({ errors = 0, warnings = 0 } = {}) {
  const [fail, warned, clean] = verdicts();
  if (errors > 0) return fail;
  if (warnings > 0) return warned;
  return clean;
}

/** The colour properties the colours pass reads. */
export function colourProperties() {
  return load().passes.find((row) => row.pass === 'colours')?.properties ?? [];
}

/** The typography properties the typography pass reads. */
export function typographyProperties() {
  return load().passes.find((row) => row.pass === 'typography')?.properties ?? [];
}

/** The number role a property fills — `border-radius` fills `radius`. */
export function roleForProperty(property) {
  const wanted = String(property).toLowerCase();
  return load().roles.find((row) => row.properties.includes(wanted))?.role ?? null;
}

/** The "applies to" label a role records in the Numbers table. */
export function appliesToFor(role) {
  return load().roles.find((row) => row.role === role)?.appliesTo ?? role;
}

/** The naming ladder a role uses. */
export function ladderFor(role) {
  const name = load().roles.find((row) => row.role === role)?.ladder;
  return load().ladders[name] ?? { rungs: [], centre: 0 };
}

/** Which review action an answer picks; free text means rename. */
export function actionForAnswer(answer) {
  const raw = String(answer ?? '').trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith('merge ')) return { action: 'merge', target: raw.slice(6).trim() };
  const rows = load().review;
  if (raw === '') {
    const enter = rows.find((row) => row.answers.includes('<enter>'));
    return { action: enter ? enter.action : 'confirm' };
  }
  for (const row of rows) {
    if (row.answers.includes(lower)) return { action: row.action };
  }
  return { action: 'rename', name: raw };
}
