/**
 * The nomenclature library, read from the skill's own reference file
 * (v0.3.0 plan §4, §5.1–5.2).
 *
 * `skill/refs/nomenclature.md` is the contract and this module is its reader,
 * exactly as `lib/tokenise-spec.js` reads `refs/tokenise.md` and
 * `lib/archetypes.js` reads `refs/create.md`. Editing a table there changes the
 * vocabulary and changes what the assertion suite expects, which is the point —
 * there is no second copy of these words in the code:
 *   phyllum:name-slots    the four slots, their order, whether they are required,
 *                         and the strict word list of each
 *   phyllum:neutral-ramp  the nine shipped grey constants, `neutral-100`…`-900`
 *   phyllum:ramp-scale    the fixed nine-step lightness scale a derived ramp is
 *                         placed on, and the saturation taper per step
 *
 * Nothing here changes any command's behaviour. The library is data first: it
 * ships, settles, and is consumed later by `tokenise`'s naming suggestions and
 * by `create primitives`.
 */

import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_ROOT } from './template.js';
import { listCell, numberCell, stripTicks, tableAfter as readTable } from './md-tables.js';

export const NOMENCLATURE_FILE = path.join(PACKAGE_ROOT, 'skill', 'refs', 'nomenclature.md');

const MARKERS = {
  nameSlots: '<!-- phyllum:name-slots -->',
  neutralRamp: '<!-- phyllum:neutral-ramp -->',
  rampScale: '<!-- phyllum:ramp-scale -->',
};

/** The separator between slots. One character, and it is part of the format. */
export const SLOT_SEPARATOR = '-';

const table = (text, marker) => readTable(text, marker, NOMENCLATURE_FILE);

const isYes = (cell) => /^yes\b/i.test(stripTicks(cell ?? ''));

let cache = null;

/**
 * The tables, as data. Split out from `load` so the assertions can feed it a
 * doctored copy of the reference file rather than overwriting the one the
 * package ships.
 */
export function parseNomenclature(text) {
  // The slots are a *list* and not a map, because their order is the contract:
  // `neutral-primary-hover` is a name and `hover-neutral` is not, and the only
  // thing that says so is the order these rows are declared in.
  const slots = table(text, MARKERS.nameSlots)
    .map(([slot, order, required, words]) => ({
      slot: stripTicks(slot),
      order: numberCell(order),
      required: isYes(required),
      words: listCell(words),
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const slot of slots) {
    if (slot.slot === '') throw new Error('a name-slots row has no slot name');
    if (slot.words.length === 0) throw new Error(`the ${slot.slot} slot has no words`);
  }

  // A word that meant two slots would make a name ambiguous, and an ambiguous
  // name cannot be checked at all — the walk below would have to guess which
  // slot a part belongs to. Disjointness is a property of the table, so it is
  // checked where the table is read.
  const seen = new Map();
  for (const slot of slots) {
    for (const word of slot.words) {
      const owner = seen.get(word);
      if (owner) throw new Error(`\`${word}\` is claimed by both ${owner} and ${slot.slot}`);
      seen.set(word, slot.slot);
    }
  }

  const neutralRamp = table(text, MARKERS.neutralRamp).map(([step, token, value]) => ({
    step: numberCell(step),
    token: stripTicks(token),
    value: stripTicks(value).toUpperCase(),
  }));

  for (const step of neutralRamp) {
    if (!/^#[0-9A-F]{6}$/.test(step.value)) {
      throw new Error(`the neutral ramp's ${step.step} step is not a six-digit hex value`);
    }
  }

  const rampScale = table(text, MARKERS.rampScale).map(([step, lightness, saturation]) => ({
    step: numberCell(step),
    lightness: numberCell(lightness),
    saturation: numberCell(saturation),
  }));

  for (const step of rampScale) {
    if (step.step === null) throw new Error('a ramp-scale row has no step number');
    if (step.lightness === null) throw new Error(`the ${step.step} step has no lightness`);
    if (step.saturation === null) throw new Error(`the ${step.step} step has no saturation`);
  }

  return { slots, neutralRamp, rampScale };
}

function load() {
  if (cache) return cache;
  cache = parseNomenclature(fs.readFileSync(NOMENCLATURE_FILE, 'utf8'));
  return cache;
}

/** Re-read the tables — only the assertions, which rewrite the file, need this. */
export function reloadNomenclature() {
  cache = null;
  return load();
}

export const nomenclature = () => load();

/** The four slots, in the order a name spells them. */
export const slots = () => load().slots;

/** Just the slot names, in order: `family`, `rank`, `exception`, `state`. */
export const slotNames = () => load().slots.map((row) => row.slot);

/** The strict word list for one slot, or an empty list for a slot nobody named. */
export const slotWords = (slot) => load().slots.find((row) => row.slot === slot)?.words ?? [];

/** Which slot a word belongs to, or null — the words are disjoint, so this is exact. */
export function slotForWord(word) {
  const wanted = String(word ?? '');
  return load().slots.find((row) => row.words.includes(wanted))?.slot ?? null;
}

/**
 * Read a candidate name against the format, part by part.
 *
 * The walk is the format: take the slots in their declared order and consume
 * parts from the left. A part that matches the slot in hand fills it; a part
 * that does not moves the walk on, which an optional slot allows and a required
 * slot refuses. A name is well-formed when every part has been consumed and
 * every required slot filled.
 *
 * That single pass is what enforces order without a regexp. `hover-neutral`
 * fails at the first step — `hover` is not a family, and family is required —
 * rather than being quietly reordered into the name it looks like. The reason
 * is returned alongside so a caller can say *why* rather than only *no*.
 */
export function readName(name) {
  const raw = String(name ?? '');
  const result = { name: raw, wellFormed: false, slots: {}, reason: null };

  if (raw.trim() === '') {
    result.reason = 'an empty name';
    return result;
  }
  if (raw !== raw.trim()) {
    result.reason = 'a name with surrounding whitespace';
    return result;
  }

  const parts = raw.split(SLOT_SEPARATOR);
  if (parts.some((part) => part === '')) {
    result.reason = `\`${raw}\` has an empty slot`;
    return result;
  }

  let index = 0;
  for (const slot of load().slots) {
    const part = parts[index];
    if (part !== undefined && slot.words.includes(part)) {
      result.slots[slot.slot] = part;
      index += 1;
      continue;
    }
    if (slot.required) {
      result.reason =
        part === undefined
          ? `\`${raw}\` is missing its ${slot.slot}`
          : `\`${part}\` is not a ${slot.slot} word`;
      return result;
    }
  }

  if (index < parts.length) {
    result.reason = `\`${parts[index]}\` does not belong in a name, or is out of slot order`;
    return result;
  }

  result.wellFormed = true;
  return result;
}

/** Is this a name the vocabulary knows? */
export const isWellFormed = (name) => readName(name).wellFormed;

/**
 * Build a name from its slots, or null when the slots do not make one.
 *
 * Composing through the same table the checker reads is what keeps a suggestion
 * from ever proposing a name the checker would reject.
 */
export function composeName(parts = {}) {
  const words = [];
  for (const slot of load().slots) {
    const word = parts[slot.slot];
    if (word === undefined || word === null || word === '') {
      if (slot.required) return null;
      continue;
    }
    if (!slot.words.includes(word)) return null;
    words.push(word);
  }
  return words.join(SLOT_SEPARATOR);
}

/** The nine shipped grey constants, lightest first. */
export const neutralRamp = () => load().neutralRamp;

/** The hex constant for one neutral step, or null. */
export const neutralRampValue = (step) =>
  load().neutralRamp.find((row) => row.step === Number(step))?.value ?? null;

/** The nine step numbers, lightest first: 100 … 900. */
export const rampSteps = () => load().rampScale.map((row) => row.step);

/** The fixed lightness scale and its saturation taper, lightest step first. */
export const rampScale = () => load().rampScale;

/** The scale row for one step, or null. */
export const rampStep = (step) => load().rampScale.find((row) => row.step === Number(step)) ?? null;
