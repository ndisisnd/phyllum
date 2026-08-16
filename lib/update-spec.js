/**
 * The `update` contract, read from the skill's own reference file
 * (v0.4.0 plan §6).
 *
 * Same doctrine as `lib/tokenise-spec.js`: the tables in `skill/refs/update.md`
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
 */

import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_ROOT } from './template.js';
import { isNone, listCell, stripTicks, tableAfter as readTable } from './md-tables.js';

export const UPDATE_SPEC_FILE = path.join(PACKAGE_ROOT, 'skill', 'refs', 'update.md');

const MARKERS = {
  copy: '<!-- phyllum:update-copy -->',
  grammar: '<!-- phyllum:update-grammar -->',
  menu: '<!-- phyllum:update-menu -->',
  types: '<!-- phyllum:update-types -->',
  questions: '<!-- phyllum:update-questions -->',
  rename: '<!-- phyllum:update-rename -->',
};

const tableAfter = (text, marker) => readTable(text, marker, UPDATE_SPEC_FILE);

let cache = null;

function load() {
  if (cache) return cache;
  cache = parseUpdateSpec(fs.readFileSync(UPDATE_SPEC_FILE, 'utf8'));
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
  const copy = Object.fromEntries(
    tableAfter(text, MARKERS.copy).map(([line, printed]) => [stripTicks(line), (printed ?? '').trim()]),
  );

  const grammar = tableAfter(text, MARKERS.grammar).map(([typed, opens, chain, prose]) => ({
    typed: stripTicks(typed),
    opens: (opens ?? '').trim(),
    chain: isNone(stripTicks(chain ?? '')) ? null : stripTicks(chain).toLowerCase(),
    takesProse: /^yes\b/i.test(stripTicks(prose ?? '')),
  }));

  const menu = tableAfter(text, MARKERS.menu).map(([pick, printsAs, chain, flow]) => ({
    pick: stripTicks(pick),
    printsAs: (printsAs ?? '').trim(),
    chain: stripTicks(chain ?? '').toLowerCase(),
    flow: stripTicks(flow ?? ''),
  }));

  const types = tableAfter(text, MARKERS.types).map(
    ([type, printsAs, section, role, followUp]) => ({
      type: stripTicks(type),
      printsAs: (printsAs ?? '').trim(),
      section: isNone(stripTicks(section ?? '')) ? null : stripTicks(section).toLowerCase(),
      role: isNone(stripTicks(role ?? '')) ? null : stripTicks(role).toLowerCase(),
      followUp: isNone(stripTicks(followUp ?? '')) ? null : stripTicks(followUp),
    }),
  );

  const questions = tableAfter(text, MARKERS.questions).map(([question, asks, hint, example]) => ({
    question: stripTicks(question),
    asks: (asks ?? '').trim(),
    hint: stripTicks(hint ?? ''),
    example: stripTicks(example ?? ''),
  }));

  // One row is one meaning and several spellings of it, flattened: the question
  // asked of a sentence is always "does it spell a rename anywhere?".
  const renamePhrases = [];
  for (const [, writtenAs] of tableAfter(text, MARKERS.rename)) {
    for (const phrase of listCell(writtenAs)) renamePhrases.push(phrase.toLowerCase());
  }
  // Longest first, so `rename it to` is read as itself rather than as `rename
  // to` with a stray word between — a shorter phrase must never win a prefix it
  // does not own.
  renamePhrases.sort((a, b) => b.length - a.length);

  return { copy, grammar, menu, types, questions, renamePhrases };
}

/** Re-read the tables — only the tests, which doctor the file, need this. */
export function reloadUpdateSpec() {
  cache = null;
  return load();
}

export const updateSpec = () => load();

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
