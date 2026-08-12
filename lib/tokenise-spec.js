/**
 * The `tokenise` contract, read from the skill's own reference file (plan §4).
 *
 * The tables in `skill/refs/tokenise.md` are the spec — which files are read,
 * which properties belong to which pass and role, how near two values have to
 * be before they cluster, and what the naming scales are. This module parses
 * them at run time rather than restating them, exactly as `lib/archetypes.js`
 * does for `create`. Editing a table there changes the behaviour and changes
 * what the assertion suite expects, which is the point.
 *
 * Twelve tables are read, each marked in the Markdown with an HTML comment:
 *   phyllum:prose-hints    a word in the prose -> the role, pass or name it signals
 *   phyllum:prose-weights  a weight word -> its numeric weight
 *   phyllum:sources        which files are scanned, and which directories are not
 *   phyllum:tailwind       arbitrary-value prefix -> the property it names
 *   phyllum:passes         pass -> token section + the properties it reads
 *   phyllum:roles          number role -> properties, "applies to" label, ladder
 *   phyllum:clustering     how near counts as near, per cluster kind
 *   phyllum:review         the four review actions and the words that pick them
 *   phyllum:colour-names   the colour naming scale, first match wins
 *   phyllum:ladders        the number ladders and their centre rung
 *   phyllum:type-roles     weight -> typography role
 *   phyllum:type-bands     size -> typography band and its name suffix
 */

import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_ROOT } from './template.js';
import {
  comparatorCell,
  listCell,
  numberCell,
  stripTicks,
  tableAfter as readTable,
} from './md-tables.js';

export const SPEC_FILE = path.join(PACKAGE_ROOT, 'skill', 'refs', 'tokenise.md');

const MARKERS = {
  proseHints: '<!-- phyllum:prose-hints -->',
  proseWeights: '<!-- phyllum:prose-weights -->',
  sources: '<!-- phyllum:sources -->',
  tailwind: '<!-- phyllum:tailwind -->',
  passes: '<!-- phyllum:passes -->',
  roles: '<!-- phyllum:roles -->',
  clustering: '<!-- phyllum:clustering -->',
  review: '<!-- phyllum:review -->',
  colourNames: '<!-- phyllum:colour-names -->',
  ladders: '<!-- phyllum:ladders -->',
  typeRoles: '<!-- phyllum:type-roles -->',
  typeBands: '<!-- phyllum:type-bands -->',
};

const tableAfter = (text, marker) => readTable(text, marker, SPEC_FILE);

/** The words in a review-action cell: "`y`, `yes`, `ok`, or an empty answer". */
function answerWords(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim().toLowerCase());
}

let cache = null;

function load() {
  if (cache) return cache;
  const text = fs.readFileSync(SPEC_FILE, 'utf8');

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

  const sourceRows = tableAfter(text, MARKERS.sources).map(([source, items]) => ({
    source: stripTicks(source),
    items: listCell(items),
  }));
  const sourceFor = (name) => sourceRows.find((row) => row.source === name)?.items ?? [];

  const sources = {
    stylesheets: sourceFor('stylesheets'),
    markup: sourceFor('markup'),
    skipped: sourceFor('skipped'),
  };
  sources.extensions = [...sources.stylesheets, ...sources.markup];

  const tailwind = Object.fromEntries(
    tableAfter(text, MARKERS.tailwind).map(([prefix, properties]) => [
      stripTicks(prefix),
      listCell(properties),
    ]),
  );

  const passes = tableAfter(text, MARKERS.passes).map(([pass, section, shapes, properties]) => ({
    pass: stripTicks(pass),
    section: stripTicks(section).toLowerCase(),
    shapes: listCell(shapes),
    properties: properties.includes('(') ? [] : listCell(properties),
  }));

  const roles = tableAfter(text, MARKERS.roles).map(([role, properties, applies, ladder]) => ({
    role: stripTicks(role),
    properties: listCell(properties),
    appliesTo: stripTicks(applies),
    ladder: stripTicks(ladder),
  }));

  const clustering = Object.fromEntries(
    tableAfter(text, MARKERS.clustering).map(([kind, , threshold]) => [
      stripTicks(kind),
      numberCell(threshold),
    ]),
  );

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
    tailwind,
    passes,
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
