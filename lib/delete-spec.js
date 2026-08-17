/**
 * The `delete` contract, read from the skill's own reference files
 * (v0.5.0 plan §4).
 *
 * Same doctrine as `lib/update-spec.js` and `lib/tokenise-spec.js`: the tables
 * in `skill/refs/delete/` *are* the behaviour. This module parses them at run
 * time rather than restating them, so the skill, the CLI and the assertion suite
 * read one source and a copy change is a behaviour change.
 *
 *   phyllum:delete-grammar  what each typed form opens, and which chain word it
 *                           carries — `token` among them, reserved and refused
 *   phyllum:delete-copy     every fixed line the flow prints, `{name}` standing
 *                           for the component in hand
 *   phyllum:delete-flow     the six steps and which one writes — documentation
 *                           the assertions read, not a branch the command takes
 */

import { readRef, refFileOf } from './refs.js';
import { isNone, stripTicks, tableAfter as readTable } from './md-tables.js';

/** The folder this module reads, loaded whole (v0.4.1 §3). */
export const DELETE_SPEC_REF = 'delete';

/** The `delete` folder as one text. */
export const readDeleteSpecText = () => readRef(DELETE_SPEC_REF);

/** The three table markers, exported so the fault sweep can doctor one by name. */
export const DELETE_MARKERS = {
  grammar: '<!-- phyllum:delete-grammar -->',
  copy: '<!-- phyllum:delete-copy -->',
  flow: '<!-- phyllum:delete-flow -->',
};

const tableAfter = (text, marker) => readTable(text, marker, refFileOf(marker, DELETE_SPEC_REF));

/**
 * A row that cannot be read is dropped, and saying so is the whole point —
 * `lib/update-spec.js`'s rule, applied to this file's tables. The notice names
 * the file as well as the table, because there are four tolerant reference
 * folders now and a marker alone would not say which to fix.
 */
function tolerantRows(table, marker, mapRow, ignored) {
  const file = refFileOf(marker, DELETE_SPEC_REF);
  const out = [];
  for (const row of table) {
    try {
      const mapped = mapRow(row);
      if (mapped !== null && mapped !== undefined) out.push(mapped);
    } catch (error) {
      const name = marker.replace(/<!--\s*|\s*-->/g, '');
      ignored.push(
        `${file} ${name}: ignored an unreadable row (${row
          .map((cell) => cell.trim())
          .join(' | ')}) — ${error.message}`,
      );
    }
  }
  return out;
}

let cache = null;

function load() {
  if (cache) return cache;
  cache = parseDeleteSpec(readDeleteSpecText());
  return cache;
}

/**
 * The tables, as data.
 *
 * The copy rows keep their backticks, exactly as `update`'s do: the warning
 * says ``code generated from `Button/Primary` `` and the backticks are part of
 * the sentence a user reads. Every other cell is an identifier, so it is
 * stripped as everywhere else.
 */
export function parseDeleteSpec(text) {
  /** Rows dropped because they could not be read, in a sentence each. */
  const ignored = [];

  const rows = (marker, mapRow) => tolerantRows(tableAfter(text, marker), marker, mapRow, ignored);
  const named = (cell, what) => {
    const value = stripTicks(cell ?? '');
    if (value === '') throw new Error(`the ${what} cell is empty`);
    return value;
  };

  const copy = Object.fromEntries(
    rows(DELETE_MARKERS.copy, ([line, printed]) => {
      const key = named(line, 'line');
      const value = (printed ?? '').trim();
      // A copy row with no text is a printed line that prints nothing — the
      // "question about nothing" v0.3.0 M7 closed, wearing a warning's clothes.
      if (value === '') throw new Error('the text cell is empty');
      return [key, value];
    }),
  );

  const grammar = rows(DELETE_MARKERS.grammar, ([typed, opens, chain, prose]) => ({
    typed: named(typed, 'typed'),
    opens: (opens ?? '').trim(),
    chain: isNone(stripTicks(chain ?? '')) ? null : stripTicks(chain).toLowerCase(),
    takesProse: /^yes\b/i.test(stripTicks(prose ?? '')),
  }));

  const flow = rows(DELETE_MARKERS.flow, ([step, what, writes]) => ({
    step: Number(named(step, 'step')),
    what: (what ?? '').trim(),
    writes: /^yes\b/i.test(stripTicks(writes ?? '')),
  }));

  return { ignored, copy, grammar, flow };
}

/** Re-read the tables — only the tests, which doctor the file, need this. */
export function reloadDeleteSpec() {
  cache = null;
  return load();
}

export const deleteSpec = () => load();

/**
 * The rows the reader had to drop, in a sentence each — empty on every shipped
 * copy of `refs/delete/`, and the whole reason the drop is not silent.
 */
export const deleteSpecNotices = () => load().ignored;

/**
 * One fixed line of copy, with `{name}` filled in.
 *
 * The substitution is the renderer's only liberty with the table: no line is
 * assembled from fragments here, because a sentence spelled half in the ref and
 * half in the code is a sentence neither of them owns.
 */
export const deleteCopy = (line, values = {}) => {
  const text = load().copy[line] ?? '';
  return text.replace(/\{(\w+)\}/g, (whole, key) => (key in values ? String(values[key]) : whole));
};

/** Every grammar row, in the order the table declares them. */
export const deleteGrammar = () => load().grammar;

/** The six steps, in order — what the assertions read the contract from. */
export const deleteFlow = () => load().flow;

/** The reserved chain words, in grammar order and without repeats. */
export const deleteChainWords = () => [
  ...new Set(load().grammar.map((row) => row.chain).filter((chain) => chain !== null)),
];

/** Is this typed word a reserved chain word of `delete`? */
export const isDeleteChainWord = (word) =>
  deleteChainWords().includes(String(word ?? '').trim().toLowerCase());
