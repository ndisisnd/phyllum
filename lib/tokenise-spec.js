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
