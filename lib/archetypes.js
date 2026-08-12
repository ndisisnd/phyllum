/**
 * Archetype contracts, read from the skill's own reference file (plan §3.1.1).
 *
 * The tables in `skill/refs/create.md` are the contract — for the skill, for
 * the CLI and for the assertion suite alike. This module parses them at run
 * time rather than restating them, so a contract can never mean one thing in
 * the documentation and another in the code. Editing the table changes the
 * behaviour and changes what the tests expect, which is the point.
 *
 * Three tables are read, each marked in the Markdown with an HTML comment:
 *   basal:contracts    archetype -> mandatory slots + mandatory states
 *   basal:vocabulary   property key -> slot, and the prose phrases naming it
 *   basal:defaults     archetype + slot -> the labelled guess
 */

import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_ROOT } from './template.js';

export const CONTRACT_FILE = path.join(PACKAGE_ROOT, 'skill', 'refs', 'create.md');

const MARKERS = {
  contracts: '<!-- basal:contracts -->',
  vocabulary: '<!-- basal:vocabulary -->',
  defaults: '<!-- basal:defaults -->',
};

const isSeparatorRow = (line) => /^\|[\s:|-]+\|$/.test(line.trim());

const splitRow = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

/** The em dash spelling of "nothing here". */
const isNone = (cell) => cell === '' || cell === '—' || cell === '-' || cell === 'none';

const stripTicks = (cell) => cell.replace(/`/g, '').trim();

/** Split a cell of comma-separated items, dropping the "none" spelling. */
function listCell(cell) {
  if (isNone(cell)) return [];
  return cell
    .split(',')
    .map((item) => stripTicks(item))
    .filter((item) => item.length > 0);
}

/** The first Markdown table after `marker`, as rows of cells (no header). */
function tableAfter(text, marker) {
  const index = text.indexOf(marker);
  if (index === -1) throw new Error(`${CONTRACT_FILE} is missing the ${marker} table marker`);
  const lines = text.slice(index + marker.length).split('\n');
  const rows = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (started) break;
      continue;
    }
    if (!started) {
      started = true; // the header row
      continue;
    }
    if (isSeparatorRow(trimmed)) continue;
    rows.push(splitRow(trimmed));
  }
  if (rows.length === 0) throw new Error(`the ${marker} table in ${CONTRACT_FILE} is empty`);
  return rows;
}

let cache = null;

function load() {
  if (cache) return cache;
  const text = fs.readFileSync(CONTRACT_FILE, 'utf8');

  const archetypes = tableAfter(text, MARKERS.contracts).map(([name, aliases, slots, states]) => ({
    name: name.trim(),
    key: name.trim().toLowerCase(),
    aliases: listCell(aliases).map((a) => a.toLowerCase()),
    slots: listCell(slots),
    states: listCell(states),
  }));

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

  cache = { archetypes, vocabulary, defaults };
  return cache;
}

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

/** Resolve an archetype by canonical key or any alias; null when unknown. */
export function contractFor(word) {
  if (typeof word !== 'string') return null;
  const wanted = word.trim().toLowerCase();
  if (wanted === '') return null;
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
