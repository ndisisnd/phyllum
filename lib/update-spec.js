/**
 * The `update` contract, read from the skill's own reference file
 * (v0.4.0 plan §6).
 *
 * Same doctrine as `lib/tokenise-spec.js`: the tables in `skill/refs/update/`
 * *are* the behaviour. This module parses them at run time rather than restating
 * them, so the skill, the CLI and the assertion suite read one source and a copy
 * change is a behaviour change.
 *
 *   phyllum:update-copy      the fixed lines: the two questions, the escape, the
 *                            `apply` breadcrumb
 *   phyllum:update-grammar   what each typed form opens, and which chain word it
 *                            carries
 *   phyllum:update-menu      the empty run's two rows, in printed order
 *   phyllum:update-types     the token type rows, and the section each lists from
 *   phyllum:update-questions every prose question's ask, its bracketed hint and
 *                            its example — one row, one printed question
 *   phyllum:update-rename    the phrases that spell a rename, and nothing else
 *   phyllum:update-verbs     the change verbs that join a slot to its new value
 */

import { readRef, refFileOf } from './refs.js';
import { isNone, listCell, stripTicks, tableAfter as readTable } from './md-tables.js';

/** The folder this module reads, loaded whole (v0.4.1 §3). */
export const UPDATE_SPEC_REF = 'update';

/** The `update` folder as one text. */
export const readUpdateSpecText = () => readRef(UPDATE_SPEC_REF);

const MARKERS = {
  copy: '<!-- phyllum:update-copy -->',
  grammar: '<!-- phyllum:update-grammar -->',
  menu: '<!-- phyllum:update-menu -->',
  types: '<!-- phyllum:update-types -->',
  questions: '<!-- phyllum:update-questions -->',
  rename: '<!-- phyllum:update-rename -->',
  verbs: '<!-- phyllum:update-verbs -->',
  clear: '<!-- phyllum:update-clear -->',
};

const tableAfter = (text, marker) => readTable(text, marker, refFileOf(marker, UPDATE_SPEC_REF));

/**
 * A row that cannot be read is dropped, and saying so is the whole point —
 * `lib/tokenise-spec.js`'s rule, applied to this file's tables (v0.4.0 M7).
 * The notice names the file as well as the table, because there are three
 * tolerant reference files now and a marker alone would not say which to fix.
 */
function tolerantRows(table, marker, mapRow, ignored) {
  const file = refFileOf(marker, UPDATE_SPEC_REF);
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
  cache = parseUpdateSpec(readUpdateSpecText());
  return cache;
}

/**
 * The tables, as data.
 *
 * The copy rows are read **without** stripping backticks, and that is the point:
 * the breadcrumb says ``That is `phyllum apply`.`` and the backticks are part of
 * the sentence a user reads. Every other cell is an identifier, so it is
 * stripped as everywhere else.
 */
export function parseUpdateSpec(text) {
  /** Rows dropped because they could not be read, in a sentence each. */
  const ignored = [];

  /**
   * Every table here is read tolerantly and key-guarded (v0.4.0 M7), the way
   * `refs/assess/`'s judgement tables have been since v0.2.1 M6 and for the
   * same reason: `refs/update/` is installed into a project's
   * `.claude/skills/`, so a hand-edited row is an expected input and a broken
   * one is an expected malformed input.
   *
   * What is new here is what a broken row *costs*. These tables are almost all
   * printed copy — the menu rows, the type rows, the questions — so a row with a
   * blank key cell is not a rule that quietly stops matching. It is a numbered
   * option printed to the user, pickable, resolving to nothing; or a question
   * that loses its bracketed hint while the contract still promises one. Both
   * are the "question about nothing" v0.3.0 M7 closed on the queue, wearing a
   * menu's clothes. So the row is dropped, the rest of the table still works,
   * and the drop is said out loud rather than left for the user to discover by
   * picking it.
   */
  const rows = (marker, mapRow) =>
    tolerantRows(tableAfter(text, marker), marker, mapRow, ignored);
  const named = (cell, what) => {
    const value = stripTicks(cell ?? '');
    if (value === '') throw new Error(`the ${what} cell is empty`);
    return value;
  };

  const copy = Object.fromEntries(
    rows(MARKERS.copy, ([line, printed]) => [named(line, 'line'), (printed ?? '').trim()]),
  );

  const grammar = rows(MARKERS.grammar, ([typed, opens, chain, prose]) => ({
    typed: named(typed, 'typed'),
    opens: (opens ?? '').trim(),
    chain: isNone(stripTicks(chain ?? '')) ? null : stripTicks(chain).toLowerCase(),
    takesProse: /^yes\b/i.test(stripTicks(prose ?? '')),
  }));

  const menu = rows(MARKERS.menu, ([pick, printsAs, chain, flow]) => ({
    pick: named(pick, 'pick'),
    printsAs: (printsAs ?? '').trim(),
    chain: named(chain ?? '', 'chain').toLowerCase(),
    flow: stripTicks(flow ?? ''),
  }));

  // `pick` is `type` under the name the picker reads (v0.4.0 M7). The type rows
  // are answered through the same `resolvePick` the menu and the token list are,
  // and that reader matches on `pick` — so without this cell the one question
  // that promises free text was the one question that threw on it, and matching
  // by the row's own word ("colour", "spacing") never worked at all.
  const types = rows(MARKERS.types, ([type, printsAs, section, role, followUp]) => ({
    type: named(type, 'type'),
    pick: named(type, 'type'),
    printsAs: (printsAs ?? '').trim(),
    section: isNone(stripTicks(section ?? '')) ? null : stripTicks(section).toLowerCase(),
    role: isNone(stripTicks(role ?? '')) ? null : stripTicks(role).toLowerCase(),
    followUp: isNone(stripTicks(followUp ?? '')) ? null : stripTicks(followUp),
  }));

  const questions = rows(MARKERS.questions, ([question, asks, hint, example]) => ({
    question: named(question, 'question'),
    asks: (asks ?? '').trim(),
    hint: stripTicks(hint ?? ''),
    example: stripTicks(example ?? ''),
  }));

  // One row is one meaning and several spellings of it, flattened: the question
  // asked of a sentence is always "does it spell a rename anywhere?". A row
  // spelling no phrase at all is dropped rather than kept as a meaning nothing
  // can express.
  const renamePhrases = [];
  for (const [, writtenAs] of rows(MARKERS.rename, ([meaning, writtenAs]) => {
    const phrases = listCell(writtenAs ?? '');
    if (phrases.length === 0) throw new Error('the written-as cell spells no phrase');
    return [named(meaning, 'meaning'), writtenAs];
  })) {
    for (const phrase of listCell(writtenAs)) renamePhrases.push(phrase.toLowerCase());
  }
  // Longest first, so `rename it to` is read as itself rather than as `rename
  // to` with a stray word between — a shorter phrase must never win a prefix it
  // does not own.
  renamePhrases.sort((a, b) => b.length - a.length);

  // The change verbs are glue, so they are read the same way and sorted the
  // same way: longest first, so `changes to` is read as itself rather than as
  // `change` with a stray word after it.
  const changeVerbs = [];
  for (const [, writtenAs] of rows(MARKERS.verbs, ([meaning, writtenAs]) => {
    const phrases = listCell(writtenAs ?? '');
    if (phrases.length === 0) throw new Error('the written-as cell spells no verb');
    return [named(meaning, 'meaning'), writtenAs];
  })) {
    for (const phrase of listCell(writtenAs)) changeVerbs.push(phrase.toLowerCase());
  }
  changeVerbs.sort((a, b) => b.length - a.length);

  // The words that take a reading away rather than change it (v0.7.3 phase 2).
  // Read and sorted exactly as the rename phrases are, and for the same reason:
  // `no longer` must be read as itself rather than as `no` with a stray word
  // after it. Clearing is the one edit that removes a recorded decision, so the
  // vocabulary for it is a table the user can see rather than a list in code.
  const clearPhrases = [];
  for (const [, writtenAs] of rows(MARKERS.clear, ([meaning, writtenAs]) => {
    const phrases = listCell(writtenAs ?? '');
    if (phrases.length === 0) throw new Error('the written-as cell spells no phrase');
    return [named(meaning, 'meaning'), writtenAs];
  })) {
    for (const phrase of listCell(writtenAs)) clearPhrases.push(phrase.toLowerCase());
  }
  clearPhrases.sort((a, b) => b.length - a.length);

  return { ignored, copy, grammar, menu, types, questions, renamePhrases, changeVerbs, clearPhrases };
}

/** Re-read the tables — only the tests, which doctor the file, need this. */
export function reloadUpdateSpec() {
  cache = null;
  return load();
}

export const updateSpec = () => load();

/**
 * The rows the reader had to drop, in a sentence each — empty on every shipped
 * copy of `refs/update/`, and the whole reason the drop is not silent.
 */
export const updateSpecNotices = () => load().ignored;

/** One fixed line of copy — `menu-question`, `escape`, `breadcrumb`, … */
export const updateCopy = (line) => load().copy[line] ?? '';

/** Every grammar row, in the order the table declares them. */
export const updateGrammar = () => load().grammar;

/** The menu's rows, in the order they are printed and numbered. */
export const updateMenuOptions = () => load().menu;

/** The reserved chain words, in grammar order and without repeats. */
export const chainWords = () => [
  ...new Set(load().grammar.map((row) => row.chain).filter((chain) => chain !== null)),
];

/** Is this typed word a reserved chain word? */
export const isChainWord = (word) =>
  chainWords().includes(String(word ?? '').trim().toLowerCase());

/** The token type rows, in the order they are printed and numbered. */
export const updateTypeOptions = () => load().types;

/** Every prose question the tables declare — for the assertions. */
export const updateQuestions = () => load().questions;

/** One question's row: its ask, its bracketed hint and its example. */
export const updateQuestionFor = (question) =>
  load().questions.find((row) => row.question === question) ?? null;

/**
 * The bracketed shape hint one question wears — `[new value] and/or [rename to
 * <name>]`. Read from the table rather than spelled in the renderer, so the CLI
 * and the assertions cannot disagree about what a question says.
 */
export const updateHint = (question) => updateQuestionFor(question)?.hint ?? '';

/** Every phrase that spells a rename, longest first. */
export const renamePhrases = () => load().renamePhrases;

/** Every change verb, longest first. */
export const changeVerbs = () => load().changeVerbs;

/** Every phrase that clears an optional reading rather than changing it, longest first. */
export const clearPhrases = () => load().clearPhrases;
