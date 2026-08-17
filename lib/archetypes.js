/**
 * Archetype contracts, read from the skill's own reference file (plan §3.1.1).
 *
 * The tables in `skill/refs/create/` are the contract — for the skill, for
 * the CLI and for the assertion suite alike. This module parses them at run
 * time rather than restating them, so a contract can never mean one thing in
 * the documentation and another in the code. Editing the table changes the
 * behaviour and changes what the tests expect, which is the point.
 *
 * Three tables are read, each marked in the Markdown with an HTML comment:
 *   phyllum:contracts    archetype -> mandatory slots + mandatory states
 *   phyllum:vocabulary   property key -> slot, and the prose phrases naming it
 *   phyllum:defaults     archetype + slot -> the labelled guess
 */

import { readRef, refFileOf } from './refs.js';
import { isNone, listCell, stripTicks, tableAfter as readTable } from './md-tables.js';

/** The folder this module reads, loaded whole (v0.4.1 §3). */
export const CONTRACT_REF = 'create';

/** The `create` folder as one text. */
export const readContractText = () => readRef(CONTRACT_REF);

export const MARKERS = {
  contracts: '<!-- phyllum:contracts -->',
  vocabulary: '<!-- phyllum:vocabulary -->',
  defaults: '<!-- phyllum:defaults -->',
  trace: '<!-- phyllum:trace -->',
  candidates: '<!-- phyllum:candidates -->',
};

/** The tables in this file, read through the one Markdown table reader. */
const tableAfter = (text, marker) => readTable(text, marker, refFileOf(marker, CONTRACT_REF));

let cache = null;

/**
 * A contract row, dropped rather than thrown on (v0.4.1 M3).
 *
 * `phyllum:contracts` is the last shipped table with no tolerance in it, and
 * v0.4.1 gave it a fifth column and a second reader — the dashboard's preview
 * draws the element this table names. One hand-mangled row used to take every
 * caller down with a `TypeError`, which is the failure v0.4.0 M7 ruled out in
 * three other files on exactly this argument: a contract with one typo in it is
 * still a contract, and refusing all of it is the larger failure.
 *
 * The notice names the file as well as the table, because a message naming the
 * wrong file is worse than none.
 */
function tolerantRows(table, marker, mapRow, ignored) {
  const file = refFileOf(marker, CONTRACT_REF);
  const out = [];
  for (const row of table) {
    try {
      const mapped = mapRow(row);
      if (mapped !== null && mapped !== undefined) out.push(mapped);
    } catch (error) {
      const name = marker.replace(/<!--\s*|\s*-->/g, '');
      ignored.push(
        `${file} ${name}: ignored an unreadable row (${row.map((cell) => cell.trim()).join(' | ')}) — ${error.message}`,
      );
    }
  }
  return out;
}

/**
 * The contract tables, read out of text rather than off disk.
 *
 * Split out for the same reason `parseNomenclature` is: the malformed-input
 * sweep exercises the reader against doctored text, and doctoring the text is
 * not the same as writing inside the package.
 */
export function parseContracts(text) {
  const ignored = [];

  const archetypes = tolerantRows(
    tableAfter(text, MARKERS.contracts),
    MARKERS.contracts,
    ([name, aliases, slots, states, previewElement]) => {
      const label = String(name ?? '').trim();
      if (label === '') throw new Error('the archetype cell is empty');
      return {
        name: label,
        key: label.toLowerCase(),
        aliases: listCell(aliases ?? '').map((a) => a.toLowerCase()),
        slots: listCell(slots ?? ''),
        states: listCell(states ?? ''),
        // The dashboard's column (v0.4.1 §4.1): the one HTML element the Library
        // view's preview projects this archetype's spec into. Read here so the
        // table stays the single statement of it; a copy that predates the column
        // reads as `null` rather than as a guess.
        previewElement: isNone(stripTicks(previewElement ?? '')) ? null : stripTicks(previewElement),
      };
    },
    ignored,
  );

  const vocabulary = tableAfter(text, MARKERS.vocabulary).map(([property, slot, phrases]) => ({
    property: stripTicks(property),
    slot: stripTicks(slot),
    phrases: listCell(phrases).map((p) => p.toLowerCase()),
  }));

  const defaults = tableAfter(text, MARKERS.defaults).map(([archetype, slot, guess]) => ({
    archetype: archetype.trim().toLowerCase(),
    slot: stripTicks(slot),
    value: guess.trim(),
  }));

  // What an image can be asked to measure, and how sure a reading has to be
  // before it is allowed to be a value rather than a question (Mode B).
  const trace = tableAfter(text, MARKERS.trace).map(([property, kind, confidence, tolerance]) => ({
    property: stripTicks(property),
    slot: null, // filled in below, once the vocabulary is loaded
    kind: stripTicks(kind),
    minConfidence: Number(stripTicks(confidence)),
    tolerance: stripTicks(tolerance),
  }));
  for (const row of trace) {
    row.slot = vocabulary.find((entry) => entry.property === row.property)?.slot ?? row.property;
  }

  // What a repeated pattern in the codebase has to look like to be offered as a
  // candidate component (Mode C).
  const candidates = tableAfter(text, MARKERS.candidates).map(
    ([signal, matches, archetype, minimum]) => ({
      signal: stripTicks(signal),
      matches: listCell(matches).map((word) => word.toLowerCase()),
      archetype: isNone(stripTicks(archetype)) ? null : stripTicks(archetype).toLowerCase(),
      minimum: Number(stripTicks(minimum)),
    }),
  );

  return { archetypes, vocabulary, defaults, trace, candidates, ignored };
}

function load() {
  if (cache) return cache;
  cache = parseContracts(readContractText());
  return cache;
}

/** What the contracts table could not read, as sentences naming file and table. */
export const contractNotices = () => load().ignored;

/** Re-read the tables — only the tests, which rewrite the file, need this. */
export function reloadContracts() {
  cache = null;
  return load();
}

export function archetypes() {
  return load().archetypes;
}

export function vocabulary() {
  return load().vocabulary;
}

export function defaults() {
  return load().defaults;
}

/** The measurable properties of an image, with their confidence bars (Mode B). */
export function traceRules() {
  return load().trace;
}

/** One measurable property's rule, or null when an image cannot show it. */
export function traceRuleFor(property) {
  if (typeof property !== 'string') return null;
  return load().trace.find((row) => row.property === property.trim()) ?? null;
}

/** The signals that turn a repeated codebase pattern into a candidate (Mode C). */
export function candidateSignals() {
  return load().candidates;
}

/**
 * The word a contract-free component records instead of an archetype
 * (v0.3.0 §6.7).
 *
 * It is deliberately *not* a row in the contract table, so every lookup for it
 * comes back empty and nothing can grade a custom against rules it never
 * claimed. `isCustomArchetype` exists so that intent is written down at each
 * reader rather than being an accident of the table's contents.
 */
export const CUSTOM_ARCHETYPE = 'custom';

/** Is this the contract-free archetype? */
export function isCustomArchetype(word) {
  return typeof word === 'string' && word.trim().toLowerCase() === CUSTOM_ARCHETYPE;
}

/** Resolve an archetype by canonical key or any alias; null when unknown. */
export function contractFor(word) {
  if (typeof word !== 'string') return null;
  const wanted = word.trim().toLowerCase();
  if (wanted === '') return null;
  // A custom has no contract, and asking for one must not fall through to a row
  // that happens to be spelled that way.
  if (wanted === CUSTOM_ARCHETYPE) return null;
  return (
    load().archetypes.find(
      (archetype) => archetype.key === wanted || archetype.aliases.includes(wanted),
    ) ?? null
  );
}

/** The contract slot a property key fills — `padding-top` fills `padding`. */
export function slotForProperty(property) {
  const entry = load().vocabulary.find((row) => row.property === property);
  return entry ? entry.slot : property;
}

/** Every property key that can fill a slot. */
export function propertiesForSlot(slot) {
  return load()
    .vocabulary.filter((row) => row.slot === slot)
    .map((row) => row.property);
}

/**
 * Prose phrases, longest first, so "top padding" wins over "padding" and a
 * greedy scan of a sentence never mislabels the more specific phrase.
 */
export function phraseIndex() {
  const entries = [];
  for (const row of load().vocabulary) {
    entries.push({ phrase: row.property.toLowerCase(), property: row.property, slot: row.slot });
    for (const phrase of row.phrases) {
      entries.push({ phrase, property: row.property, slot: row.slot });
    }
  }
  entries.sort((a, b) => b.phrase.length - a.phrase.length || a.phrase.localeCompare(b.phrase));
  return entries;
}

/** The labelled guess for a slot (or state) of an archetype, if the table has one. */
export function defaultFor(archetypeKey, slot) {
  const entry = load().defaults.find(
    (row) => row.archetype === String(archetypeKey).toLowerCase() && row.slot === slot,
  );
  return entry ? entry.value : null;
}

/**
 * The HTML element the dashboard previews this archetype with (v0.4.1 §4.1).
 *
 * `custom` has no contract and therefore no row, so it comes back `null` — the
 * page falls back to its generic block rather than being told a shape here.
 */
export function previewElementFor(word) {
  return contractFor(word)?.previewElement ?? null;
}

/** Archetype words and aliases, longest first, for scanning a sentence. */
export function archetypeWords() {
  const words = [];
  for (const archetype of load().archetypes) {
    words.push({ word: archetype.key, archetype });
    for (const alias of archetype.aliases) words.push({ word: alias, archetype });
  }
  words.sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word));
  return words;
}
