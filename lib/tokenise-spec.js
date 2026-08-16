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
 *   phyllum:gradient-names the gradient naming scale, and the mark word every
 *                          proposed gradient name carries
 *   phyllum:ladders        the number ladders and their centre rung
 *   phyllum:type-roles     weight -> typography role
 *   phyllum:type-bands     size -> typography band and its name suffix
 *   phyllum:queue          what a proposal queue does with its entries
 *   phyllum:value-comparison  written shape -> how two values of it are compared
 *   phyllum:reading-splits what opens a new typography reading, and what does not
 *   phyllum:binding        which way a stranded fragment reaches for its reading
 *   phyllum:name-source    which naming source is consulted first, and its fallback
 *   phyllum:role-signals   a word in the prose -> the nomenclature slot it signals
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
  gradientNames: '<!-- phyllum:gradient-names -->',
  ladders: '<!-- phyllum:ladders -->',
  typeRoles: '<!-- phyllum:type-roles -->',
  typeBands: '<!-- phyllum:type-bands -->',
  compounds: '<!-- phyllum:compounds -->',
  queue: '<!-- phyllum:queue -->',
  valueComparison: '<!-- phyllum:value-comparison -->',
  readingSplits: '<!-- phyllum:reading-splits -->',
  binding: '<!-- phyllum:binding -->',
  nameSource: '<!-- phyllum:name-source -->',
  roleSignals: '<!-- phyllum:role-signals -->',
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

/**
 * A row that cannot be read is dropped, and saying so is the whole point
 * (v0.2.1 M6).
 *
 * The tables ship with Phyllum, so a broken row is not the usual "somebody's
 * file is malformed" — it is somebody's *edit* to the contract, which is
 * exactly what these files are for. `refs/assess.md` is installed into a
 * project's `.claude/skills/`, and a project that tunes a severity or moves a
 * similarity band is doing the thing the design invites. The failure worth
 * hardening against is a tuned row that is one typo away from readable.
 *
 * Before M6 that typo took the whole CLI down: `comparatorCell` throws on a
 * cell it cannot parse, and nothing caught it, so a single bad character in a
 * severity row turned every `assess`, `tokenise` and `create` run into a bare
 * stack trace with no clue which row caused it.
 *
 * Now the row is dropped and the drop is *recorded*. The two halves matter
 * equally. Dropping keeps the other forty rows working, which is the honest
 * outcome — one unreadable line is not a reason to refuse to run. Recording is
 * what stops the drop from being a silent behaviour change: the same rule
 * `readApplyConfig` already follows for `.phyllum/config.json`, and for the
 * same reason — a setting quietly ignored is worse than a setting rejected,
 * because the user believes it took effect.
 */
function tolerantRows(table, marker, mapRow, ignored) {
  const out = [];
  for (const row of table) {
    try {
      const mapped = mapRow(row);
      if (mapped !== null && mapped !== undefined) out.push(mapped);
    } catch (error) {
      const name = marker.replace(/<!--\s*|\s*-->/g, '');
      ignored.push(
        `${name}: ignored an unreadable row (${row.map((cell) => cell.trim()).join(' | ')}) — ${error.message}`,
      );
    }
  }
  return out;
}

function load() {
  if (cache) return cache;
  const text = fs.readFileSync(SPEC_FILE, 'utf8');
  const assessText = fs.readFileSync(ASSESS_SPEC_FILE, 'utf8');
  cache = parseSpec(text, assessText);
  return cache;
}

/**
 * The tables, as data. Split out from `load` so the hostile-row sweep can feed
 * it a doctored copy of the real reference files rather than overwriting the
 * ones the package ships — a test that edits `skill/refs/assess.md` in place is
 * one crash away from leaving the repository broken.
 */
export function parseSpec(text, assessText) {
  /** Rows dropped because they could not be read, in the words above. */
  const ignored = [];

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

  // Every judgement table below reads through `tolerantRows`, which is where a
  // row that cannot be read stops being a crash and becomes a recorded
  // omission. `named` is the other half of the same idea: a row whose key cell
  // is blank would otherwise become a rule called "", matching nothing and
  // reported as nothing — a silent drop wearing a valid row's clothes.
  const rows = (marker, mapRow) =>
    tolerantRows(assessTable(assessText, marker), marker, mapRow, ignored);
  const named = (cell, what) => {
    const value = stripTicks(cell ?? '');
    if (value === '') throw new Error(`the ${what} cell is empty`);
    return value;
  };

  // How often a value has to be written before it stops being an exception.
  // Rows are tested in order, first match wins, so the table reads as a ladder
  // rather than as a pair of ranges that have to be kept from overlapping.
  const severities = rows(ASSESS_MARKERS.severity, ([severity, used]) => ({
    severity: named(severity, 'severity'),
    used: comparatorCell(used),
  }));

  const lintRules = rows(ASSESS_MARKERS.lintRules, ([rule, pass, role]) => ({
    rule: named(rule, 'rule'),
    pass: stripTicks(pass ?? ''),
    role: isNone(stripTicks(role ?? '')) ? null : stripTicks(role),
  }));

  // The hygiene families and what each one is worth. Unlike a value finding,
  // a hygiene finding's severity is not a frequency — there is nothing to
  // count — so it is stated per rule, in the same place the rest of the
  // grading is stated.
  const hygieneRules = rows(ASSESS_MARKERS.hygieneRules, ([rule, severity]) => ({
    rule: named(rule, 'rule'),
    severity: named(severity, 'severity'),
  }));

  // Similarity is graded two ways at once, so it is two tables and not one: a
  // family says how it is graded (`by band`, or a severity outright) and the
  // bands say what a score is worth. Keeping them apart is what lets a project
  // move the clone line without touching what a clone *is*.
  const similarityRules = rows(ASSESS_MARKERS.similarityRules, ([rule, severity]) => ({
    rule: named(rule, 'rule'),
    severity: named(severity, 'severity'),
  }));

  const similarityWeights = Object.fromEntries(
    rows(ASSESS_MARKERS.similarityWeights, ([part, weight]) => [
      named(part, 'part'),
      numberCell(weight),
    ]),
  );

  const similarityBands = rows(ASSESS_MARKERS.similarityBands, ([band, score, severity]) => ({
    band: named(band, 'band'),
    score: comparatorCell(score),
    severity: named(severity, 'severity'),
  }));

  const similarityLimits = Object.fromEntries(
    rows(ASSESS_MARKERS.similarityLimits, ([limit, value]) => [
      named(limit, 'limit'),
      numberCell(value),
    ]),
  );

  // The conventions are a *list* and not a map, because their order is part of
  // the contract twice over: the rows overlap (BEM is kebab with two more
  // separators, `Button` is Pascal case and one capitalised word at once) so the
  // first match wins, and a tie in the vote is broken by the same order — which
  // is how a dominant convention comes out the same way on every run.
  const namingConventions = rows(ASSESS_MARKERS.namingConventions, ([convention, , , votes]) => ({
    convention: named(convention, 'convention'),
    // A row votes for a convention rather than for itself, so `bem` can be
    // recognised as its own shape and still counted as the kebab it is a
    // spelling of. An em dash is a row that abstains.
    votesAs: isNone(stripTicks(votes ?? '')) ? null : stripTicks(votes),
  }));

  const namingRules = rows(ASSESS_MARKERS.namingRules, ([rule, severity]) => ({
    rule: named(rule, 'rule'),
    severity: named(severity, 'severity'),
  }));

  // The `watches` column is empty for two of the three rows, exactly as the
  // lint-rules table's role column is: a rule that reads every prop names no
  // props, and a rule that reads three of them says which three here rather
  // than in a constant only a code change can reach.
  const propRules = rows(ASSESS_MARKERS.propRules, ([rule, severity, watches]) => ({
    rule: named(rule, 'rule'),
    severity: named(severity, 'severity'),
    watches: listCell(watches ?? '').map((prop) => prop.toLowerCase()),
  }));

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
  const propKinds = rows(ASSESS_MARKERS.propKinds, ([kind, , comparable]) => ({
    kind: named(kind, 'kind'),
    comparable: /^yes\b/i.test(stripTicks(comparable ?? '')),
  }));

  const consistencyLimits = Object.fromEntries(
    rows(ASSESS_MARKERS.consistencyLimits, ([limit, value]) => [
      named(limit, 'limit'),
      numberCell(value),
    ]),
  );

  // The §8 extras. One family in the report and six rules underneath it, each
  // with its own severity, because they are only alike in not belonging
  // anywhere else.
  const extraRules = rows(ASSESS_MARKERS.extraRules, ([rule, severity]) => ({
    rule: named(rule, 'rule'),
    severity: named(severity, 'severity'),
  }));

  const extraLimits = Object.fromEntries(
    rows(ASSESS_MARKERS.extraLimits, ([limit, value]) => [named(limit, 'limit'), numberCell(value)]),
  );

  // What counts as evidence that this codebase has a dark theme at all. The
  // check is conditional on it, so the list of what to look for is the check's
  // whole gate — and a gate belongs in the table, not in a regex nobody reads.
  const darkEvidence = rows(ASSESS_MARKERS.darkEvidence, ([evidence, writtenAs, readFrom]) => ({
    evidence: named(evidence, 'evidence'),
    spellings: listCell(writtenAs ?? ''),
    readFrom: stripTicks(readFrom ?? ''),
  }));

  // The one thing to do about a finding, per rule. It is the half of a report a
  // reader acts on, so it is data a project can edit rather than a sentence
  // buried in a renderer.
  const actions = Object.fromEntries(
    rows(ASSESS_MARKERS.actions, ([rule, action]) => [named(rule, 'rule'), (action ?? '').trim()]),
  );

  // The score is two tables and not one, for the same reason similarity is: the
  // weights say what a finding is worth, and the steps say what a total means.
  // A project can make naming matter more without touching where the steps sit.
  const scoreWeights = Object.fromEntries(
    rows(ASSESS_MARKERS.scoreWeights, ([family, error, warn]) => [
      named(family, 'family'),
      { error: numberCell(error ?? '') ?? 0, warn: numberCell(warn ?? '') ?? 0 },
    ]),
  );

  // Rows are tested in order and the first match wins, so the ladder reads
  // upwards and the last row — an em dash, matching anything — is the top step.
  const scoreSteps = rows(ASSESS_MARKERS.scoreSteps, ([step, mass, means]) => {
    const value = numberCell(step ?? '');
    // A step with no number is not a step. Dropping it silently would move
    // every score above it by one rung, which is the quietest way a hand-edited
    // table could make two runs disagree about the same codebase.
    if (value === null) throw new Error('the step cell is not a number');
    return { step: value, mass: comparatorCell(mass), means: (means ?? '').trim() };
  });

  // Only the labels are data here: which of the three a run gets is decided by
  // counting errors and warnings, and that counting is the same everywhere.
  const verdicts = rows(ASSESS_MARKERS.verdicts, ([verdict, when]) => ({
    verdict: named(verdict, 'verdict'),
    when: (when ?? '').trim(),
  }));

  // ---- the batch intake (v0.3.0 plan §3) ---------------------------------
  //
  // Five tables and one idea: a sentence may carry several values, and the
  // *reading* is the only thing that changes. What a queue does with an entry
  // (order, duplicates, one question at a time, what a skip costs, where the
  // queue is kept) is one row each, so the behaviour can be read without
  // reading the loop that implements it.
  const queue = Object.fromEntries(
    tableAfter(text, MARKERS.queue).map(([rule, setting]) => [
      stripTicks(rule),
      stripTicks(setting),
    ]),
  );

  // How a value is compared, by the shape it is written in (v0.4.0 plan §3.1).
  // `channels` is what makes `rgba(37, 99, 235)` the `#2563EB` a system already
  // names; `string` is the older normalisation, and everything Phyllum cannot
  // read as a colour keeps it.
  const valueComparison = Object.fromEntries(
    tableAfter(text, MARKERS.valueComparison).map(([shape, , comparedAs]) => [
      stripTicks(shape).toLowerCase(),
      stripTicks(comparedAs ?? '').toLowerCase(),
    ]),
  );

  // What opens a new typography reading. A row whose spelling is an em dash is
  // not a literal: `role-word` means the `typography` words of the prose table,
  // so adding a role word there adds a splitter here and nowhere else.
  const readingSplits = tableAfter(text, MARKERS.readingSplits).map(
    ([splitter, writtenAs, opens]) => ({
      splitter: stripTicks(splitter),
      writtenAs: isNone(stripTicks(writtenAs)) ? null : stripTicks(writtenAs),
      opens: /^yes\b/i.test(stripTicks(opens ?? '')),
    }),
  );

  // Which way a fragment reaches for what it belongs to. `left` is the rule and
  // `right` is the one exception — a fragment with nothing behind it.
  const binding = Object.fromEntries(
    tableAfter(text, MARKERS.binding).map(([fragment, , direction]) => [
      stripTicks(fragment),
      isNone(stripTicks(direction ?? '')) ? null : stripTicks(direction),
    ]),
  );

  // Which naming source is consulted first, and what it falls back to. The
  // nomenclature library supersedes the colour scale (v0.3.0 plan §4.3), and
  // this table is where that decision is recorded rather than coded.
  const nameSource = tableAfter(text, MARKERS.nameSource).map(
    ([source, applies, when, fallback]) => ({
      source: stripTicks(source),
      appliesTo: listCell(applies),
      when: (when ?? '').trim(),
      fallsBackTo: isNone(stripTicks(fallback ?? '')) ? null : stripTicks(fallback),
    }),
  );

  // The words a sentence uses to say what a colour is *for*, mapped onto the
  // one spelling the library ships. Flattened into word -> { slot, word },
  // because the question asked of a sentence is always "does this word name a
  // slot the vocabulary knows?".
  const roleSignals = new Map();
  for (const [words, slot, word] of tableAfter(text, MARKERS.roleSignals)) {
    for (const spelling of listCell(words)) {
      roleSignals.set(spelling.toLowerCase(), { slot: stripTicks(slot), word: stripTicks(word) });
    }
  }

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

  // The gradient scale (v0.4.0 plan §5.2). Its own table rather than a shape
  // column on the colour scale: every colour row is a lightness and a saturation
  // test, and a gradient has neither, so a gradient row there would be a row the
  // table's own comparators cannot judge. The `Mark` column is the word every
  // name Phyllum proposes for a gradient carries — the fallback leads with it,
  // and a library-derived name takes it as its last part.
  const gradientNames = tableAfter(text, MARKERS.gradientNames).map(([name, rank, mark]) => ({
    name: stripTicks(name),
    rank: numberCell(rank),
    mark: stripTicks(mark ?? ''),
  }));

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

  return {
    ignored,
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
    queue,
    valueComparison,
    readingSplits,
    binding,
    nameSource,
    roleSignals,
    review,
    colourNames,
    gradientNames,
    ladders,
    typeRoles,
    typeBands,
  };
}

/** Re-read the tables — only the tests, which rewrite the file, need this. */
export function reloadSpec() {
  cache = null;
  return load();
}

export const spec = () => load();

/**
 * The rows the spec reader had to drop, in a sentence each — empty on every
 * shipped copy of the tables, and the whole reason the drop is not silent.
 */
export const specNotices = () => load().ignored;

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
export const gradientNames = () => load().gradientNames;

/**
 * The word every gradient name Phyllum proposes carries (v0.4.0 plan §5.2).
 *
 * One word, read from the table rather than spelled here, so a project that
 * renames the mark renames it once. The fallback scale leads with it and a
 * library-derived name takes it as its last part.
 */
export const gradientMark = () => load().gradientNames.find((row) => row.mark)?.mark ?? 'gradient';

/**
 * The value shapes one pass reads, as the passes table writes them.
 *
 * The colours row is the only caller so far, and it is what tells the gradient
 * reader which functions are gradients: adding a row's shape adds the shape, and
 * there is no second list of them in the code.
 */
export function shapesFor(pass) {
  return load().passes.find((row) => row.pass === pass)?.shapes ?? [];
}

/** The gradient function names the colours row lists — `linear-gradient`, … */
export function gradientFunctions() {
  return shapesFor('colours')
    .filter((shape) => /-gradient\(\)$/.test(shape))
    .map((shape) => shape.replace(/\(\)$/, ''));
}
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

// ---------------------------------------------------------------------------
// The batch intake — several values, one sentence (v0.3.0 plan §3)
// ---------------------------------------------------------------------------

/** Every queue rule, as the table states them. */
export const queueRules = () => load().queue;

/** One queue rule's setting — `order`, `duplicates`, `skip`, … */
export const queueRule = (rule) => load().queue[rule] ?? null;

/** Every value shape and how it is compared, as the table states them. */
export const valueComparisons = () => load().valueComparison;

/**
 * How one written shape is compared — `channels` or `string` (v0.4.0 §3.1).
 *
 * A shape the table does not list compares as a string, which is the reading
 * Phyllum had before the table existed: an unknown shape is never folded into
 * a colour it might not be.
 */
export const comparedAs = (shape) => load().valueComparison[shape] ?? 'string';

/** The rows that say what opens a new typography reading. */
export const readingSplits = () => load().readingSplits;

/**
 * The literal separators that open a reading — `,`, `;`, `and`.
 *
 * The role-word row is deliberately not here: its spelling is an em dash,
 * meaning "the typography words of the prose table", and the caller reads those
 * from `proseHints` so there is exactly one list of role words in the package.
 */
export const readingSeparators = () =>
  load()
    .readingSplits.filter((row) => row.opens && row.writtenAs !== null)
    .map((row) => row.writtenAs);

/** Does this splitter open a new reading? `/` is on the table saying no. */
export const splitterOpens = (splitter) =>
  load().readingSplits.find((row) => row.splitter === splitter)?.opens ?? false;

/** Which way a fragment reaches for what it belongs to: 'left', 'right', null. */
export const bindingDirection = (fragment) => load().binding[fragment] ?? null;

/** The naming sources, in the order the table consults them. */
export const nameSources = () => load().nameSource;

/** Is this source consulted for this pass at all? */
export const nameSourceApplies = (source, pass) =>
  load().nameSource.find((row) => row.source === source)?.appliesTo.includes(pass) ?? false;

/** What a source falls back to when it has no answer, or null. */
export const nameSourceFallback = (source) =>
  load().nameSource.find((row) => row.source === source)?.fallsBackTo ?? null;

/** Every role-signal spelling the table knows — for the assertions. */
export const roleSignalWords = () => [...load().roleSignals.keys()];

/**
 * What one word says about a colour's job: `{ slot, word }`, or null.
 *
 * Null is the common answer and the right one. Most words in most sentences
 * signal nothing, and a suggestion built out of a word nobody listed would be a
 * guess wearing the library's clothes.
 */
export const roleSignalFor = (word) => load().roleSignals.get(String(word ?? '').toLowerCase()) ?? null;

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
