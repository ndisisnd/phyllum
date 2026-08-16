/**
 * `phyllum update` — the design-system editing verb (v0.4.0 plan §6).
 *
 * Every other command adds, reads, or pushes outward. This one **changes what is
 * already recorded**, and it is the second time the word has changed hands in two
 * releases: up to v0.2.3 `update` moved the install (that is `upgrade` now), in
 * v0.3.0 it was `apply`'s alias (that is `apply`, under its own name), and from
 * v0.4.0 it is its own command with its own contract in `skill/refs/update.md`.
 *
 * The shape is `tokenise`'s, deliberately: tokens in, text out, nothing printed
 * here, nothing read from `process`, and the one write funnel at the end of the
 * one branch that writes. The conversation is the tokenise kind picker's posture
 * too — numbers or words both pick, free text is honoured everywhere and read as
 * prose, and a skip at any depth writes nothing.
 *
 * What it never does is the whole of §6.5, and three of them are structural
 * rather than remembered: it holds no path but `DESIGN-SYSTEM.md`, it reaches no
 * writer but `writeDesignSystem`, and the only call to it sits after the
 * acceptance gate.
 */

import fs from 'node:fs';
import path from 'node:path';

import { CUSTOM_ARCHETYPE, contractFor, phraseIndex } from './archetypes.js';
import {
  STATE_WORDS,
  answerGap,
  extractDraft,
  isCustom,
  parseSpecBlock,
  renderSpecBlock,
  resolveTokens,
  seedFromExisting,
  suggestionsFor,
  tokenNamesOf,
} from './create.js';
import { acceptDraft, questionFor, resolveAnswer } from './create-command.js';
import { renderSpecNotices } from './assess-report.js';
import { parse, render } from './design-system.js';
import { detectProject } from './detect.js';
import { advance } from './state.js';
import { comparisonValue, normaliseValue, toPx } from './tokenise.js';
import { valuesInProse } from './tokenise-prose.js';
import { appliesToFor } from './tokenise-spec.js';
import { pickLabel, resolvePick } from './tokenise-command.js';
import {
  changeVerbs,
  isChainWord,
  renamePhrases,
  updateCopy,
  updateGrammar,
  updateMenuOptions,
  updateQuestionFor,
  updateSpecNotices,
  updateTypeOptions,
} from './update-spec.js';
import { DESIGN_SYSTEM_FILE, writeDesignSystem } from './write.js';

const NOT_WRITTEN = `Nothing has been written — Phyllum writes ${DESIGN_SYSTEM_FILE} only when you accept.`;

/** The section headings, as the proposal names them. */
const SECTION_LABEL = { colours: 'Colours', numbers: 'Numbers', typography: 'Typography' };

/** How many times a question is put again before the run gives up saying so. */
const MAX_FOLLOW_UPS = 2;

// ---------------------------------------------------------------------------
// What the user reads
// ---------------------------------------------------------------------------

/** `update` with no way to ask: what it takes, in the grammar table's words. */
export function renderUsage() {
  return [
    '`update` changes something your design system already records:',
    ...updateGrammar().map((row) => `  ${row.typed.padEnd(36)}${row.opens}`),
    '',
    'It edits DESIGN-SYSTEM.md and nothing else. Applying the design system to your',
    'code is `phyllum apply`, under its own name.',
  ].join('\n');
}

/** One picker block: the question, its numbered rows, the escape line. */
function renderPick(question, rows) {
  return [
    question,
    ...rows.map((row, index) => `  ${index + 1}. ${row.printsAs}`),
    updateCopy('escape'),
  ].join('\n');
}

/**
 * The empty run's menu — the one place the `apply` breadcrumb prints.
 *
 * It prints here and nowhere else on purpose (§6.1): a user who typed `update
 * token` did not mistype anything, and a pointer on every question would be a
 * command apologising for its own name.
 */
export function renderMenu() {
  return [renderPick(updateCopy('menu-question'), updateMenuOptions()), '', updateCopy('breadcrumb')].join(
    '\n',
  );
}

/** The type question `update token` opens with. */
export function renderTypePicker() {
  return renderPick(updateCopy('type-question'), updateTypeOptions());
}

/**
 * One prose question, composed from its table row: the ask, the target, the
 * hint, an example, the escape. Nothing here is spelled in the code — a question
 * whose copy lived in two places would drift out of one of them.
 */
export function changeQuestion(question, target) {
  const row = updateQuestionFor(question);
  if (!row) return `What is changing about \`${target}\`? (or "skip")`;
  return `${row.asks} \`${target}\`? ${row.hint} — e.g. "${row.example}". (or "skip")`;
}

// ---------------------------------------------------------------------------
// The recorded things, as rows
// ---------------------------------------------------------------------------

/** The value of one token row, in the terms its section uses. */
export function describeToken(entry) {
  if (entry.section === 'typography') {
    return `${entry.row[1]} / ${entry.row[2]} / ${entry.row[3]}`;
  }
  if (entry.section === 'numbers') return `${entry.row[1]}  (${entry.row[2]})`;
  return entry.row[1];
}

/**
 * Every token of one type, in file order.
 *
 * The `Role` cell narrows Numbers by its "applies to" column, so *a border
 * radius* lists radii and not spacings — the same column that keeps a 12px
 * radius and a 12px padding two different facts everywhere else.
 */
export function tokensOfType(model, type) {
  if (!type.section) return allTokens(model);
  const rows = model?.tokens?.[type.section] ?? [];
  const label = type.role ? appliesToFor(type.role) : null;
  const out = [];
  rows.forEach((row, index) => {
    if (label !== null && row[2] !== label) return;
    if (!isListable(row)) return;
    out.push({ section: type.section, index, row, name: row[0] });
  });
  return out;
}

/** Every recorded token, whatever its section — what `something else` lists. */
export function allTokens(model) {
  const out = [];
  for (const section of ['colours', 'numbers', 'typography']) {
    (model?.tokens?.[section] ?? []).forEach((row, index) => {
      if (!isListable(row)) return;
      out.push({ section, index, row, name: row[0] });
    });
  }
  return out;
}

/**
 * Is this row one a user can be offered? (v0.4.0 M7)
 *
 * `DESIGN-SYSTEM.md` is a file people hand-edit — that is the whole design — so
 * a table with a ragged row in it is an expected input. Before this check the
 * ragged row was *listed*: a token with no value printed as `2. color-surface
 * undefined`, and a value with no token printed as a blank name beside it. Both
 * are pickable, and picking one puts a proposal about nothing behind the
 * acceptance gate — the fault v0.3.0 M7 closed on the queue, arriving this time
 * through the file rather than through the session.
 *
 * A row needs a name and a value to be a token. One without either is not a row
 * `update` refuses to work near; it is a row `update` cannot honestly offer, so
 * it is left out of the list and the omission is said out loud.
 */
export function isListable(row) {
  const name = String(row?.[0] ?? '').trim();
  const value = String(row?.[1] ?? '').trim();
  return name !== '' && value !== '';
}

/** How many rows in scope `update` could not offer, and why it says so. */
export function unlistableCount(model, type) {
  const sections = type?.section ? [type.section] : ['colours', 'numbers', 'typography'];
  const label = type?.section && type.role ? appliesToFor(type.role) : null;
  let count = 0;
  for (const section of sections) {
    for (const row of model?.tokens?.[section] ?? []) {
      if (label !== null && row[2] !== label) continue;
      if (!isListable(row)) count += 1;
    }
  }
  return count;
}

/** The omission, said out loud — never a silently shorter list. */
export function renderUnlistable(count) {
  if (count === 0) return null;
  return (
    `  (${count} row${count === 1 ? '' : 's'} in ${DESIGN_SYSTEM_FILE} ` +
    `${count === 1 ? 'is' : 'are'} missing a token name or a value, so ${count === 1 ? 'it is' : 'they are'} not listed — ` +
    'fix the table by hand and they come back.)'
  );
}

/** The numbered list of a type's tokens — every row of the section, never elided. */
export function renderTokenList(type, entries) {
  const width = Math.max(...entries.map((entry) => entry.name.length));
  return [
    `${type.section ? SECTION_LABEL[type.section] : 'Every token'} — ${entries.length} token${entries.length === 1 ? '' : 's'}:`,
    ...entries.map(
      (entry, index) => `  ${index + 1}. ${entry.name.padEnd(width)}  ${describeToken(entry)}`,
    ),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// The recorded components, as rows (§6.3)
// ---------------------------------------------------------------------------

/**
 * Every `### <name>` in the Components section, with the archetype its spec
 * block records.
 *
 * The archetype is **read, never inferred**: a component whose entry carries no
 * spec block has no archetype to print, and prints none. `create` is the command
 * that records one, and step 2 says so rather than guessing a contract for it.
 */
export function componentEntries(model) {
  return (model?.components ?? []).map((component) => {
    const block = (component.blocks ?? []).find((item) => item.lang === 'yaml');
    const spec = block ? parseSpecBlock(block.content) : null;
    return {
      name: component.name,
      component,
      spec,
      archetype: spec ? (isCustom(spec) ? CUSTOM_ARCHETYPE : spec.archetype) : null,
    };
  });
}

/** The numbered list of recorded components — every one of them, with its archetype. */
export function renderComponentList(entries) {
  const width = Math.max(...entries.map((entry) => entry.name.length));
  return [
    `Components — ${entries.length} recorded:`,
    ...entries.map(
      (entry, index) =>
        `  ${index + 1}. ${entry.name.padEnd(width)}  ${entry.archetype ?? '(no spec block)'}`,
    ),
  ].join('\n');
}

/** A system with no components says so and points at `create` — no dead end. */
export function renderNoComponents() {
  return [
    `There are no components in ${DESIGN_SYSTEM_FILE} yet, so there is nothing to update.`,
    '`phyllum create "a primary button with 12px padding"` records the first one.',
  ].join('\n');
}

/** An entry `update` cannot revise, because nothing recorded says what it is. */
export function renderNoSpecBlock(entry) {
  return [
    `\`${entry.name}\` has no spec block in ${DESIGN_SYSTEM_FILE}, so there is nothing recorded to revise.`,
    `\`phyllum create "${entry.name} …"\` records one, and \`update\` can edit it after that.`,
  ].join('\n');
}

/** An empty section says so and points at the command that fills it. */
export function renderEmptySection(type) {
  const what = pickLabel(type);
  return [
    `There are no ${what} tokens in ${DESIGN_SYSTEM_FILE} yet, so there is nothing to update.`,
    '`phyllum tokenise "our brand blue #2563EB"` names the first one.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Reading a target out of prose (§6.2)
// ---------------------------------------------------------------------------

const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** Does this sentence name that recorded thing, whole and on its own? */
export function namesTarget(prose, name) {
  const text = String(prose ?? '');
  const pattern = new RegExp(`(^|[^A-Za-z0-9_\`-])\`?${escapeRe(name)}\`?($|[^A-Za-z0-9_\`-])`, 'i');
  return pattern.test(text);
}

/**
 * What a sentence is about — exactly, or not at all.
 *
 * The rule is narrow because the never-list forbids a guess: an **exact** whole
 * name, backticked or bare, resolves; two different names resolve to nothing and
 * get the disambiguation question; no name at all resolves to nothing and gets
 * the menu. There is no prefix match, no substring match and no edit distance,
 * so a sentence about `color-primar` is asked about rather than quietly applied
 * to `color-primary`.
 */
export function matchTarget(prose, model) {
  const found = [];
  for (const entry of allTokens(model)) {
    if (namesTarget(prose, entry.name)) found.push({ kind: 'token', name: entry.name, entry });
  }
  for (const component of model?.components ?? []) {
    if (namesTarget(prose, component.name)) found.push({ kind: 'component', name: component.name });
  }
  const names = [...new Set(found.map((item) => item.name))];
  if (names.length === 1) return { matched: found[0], candidates: found };

  // One component and some tokens is not ambiguity, it is a component sentence
  // (§6.3): "Button/Primary background becomes color-primary" names one thing
  // being changed and one value it is changed to. Two components, or two tokens
  // and no component, still asks — that is a genuine fork, and Phyllum never
  // picks a side of one.
  const components = found.filter((item) => item.kind === 'component');
  if (components.length === 1) return { matched: components[0], candidates: found };

  return { matched: null, candidates: found };
}

// ---------------------------------------------------------------------------
// Reading a change out of prose (§6.4)
// ---------------------------------------------------------------------------

/** The new name a change sentence spells, or null. Only the table's phrases count. */
export function renameInProse(prose) {
  const text = String(prose ?? '');
  for (const phrase of renamePhrases()) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9-])${escapeRe(phrase)}\\s+\`?([A-Za-z][A-Za-z0-9-]*)\`?`, 'i');
    const match = text.match(pattern);
    if (match) return match[2];
  }
  return null;
}

/**
 * What one change sentence says, against the token it is about.
 *
 * Only what the sentence mentions comes back. A typography reading whose weight
 * the sentence never stated keeps the weight it had — the CSS defaults fill a
 * *new* token's gaps, and filling an existing token's from them would change a
 * slot the prose did not mention, which is on the never-list.
 */
export function readChange(prose, entry) {
  const { candidates } = valuesInProse(prose);
  const name = renameInProse(prose);
  const row = [...entry.row];
  let changedValue = false;

  const colour = candidates.find((item) => item.pass === 'colours');
  const length = candidates.find((item) => item.pass === 'numbers');
  const reading = candidates.find((item) => item.pass === 'typography');

  if (entry.section === 'colours' && colour) {
    row[1] = colour.value;
    changedValue = true;
  }
  if (entry.section === 'numbers' && (length || reading)) {
    row[1] = (length ?? reading).value;
    changedValue = true;
  }
  if (entry.section === 'typography' && (reading || length)) {
    if (reading) {
      const implied = reading.implied ?? [];
      row[1] = reading.size;
      if (!implied.some((item) => item.startsWith('font-weight'))) row[2] = String(reading.weight);
      if (!implied.some((item) => item.startsWith('line-height'))) row[3] = String(reading.lineHeight);
    } else {
      row[1] = length.value;
    }
    changedValue = true;
  }

  if (name) row[0] = name;
  return { row, name: name ?? null, changedValue, changed: changedValue || Boolean(name) };
}

// ---------------------------------------------------------------------------
// Reading a component change out of prose (§6.3)
// ---------------------------------------------------------------------------

/**
 * The one recorded component a sentence names, or null.
 *
 * Inside `update component` the *kind* of the target is already settled, so a
 * sentence naming both a component and a token — "Button/Primary background
 * becomes color-primary", which is the shape the question asks for — is not
 * ambiguous at all. Two components in one sentence still is, and still asks.
 */
export function matchComponent(prose, entries) {
  const found = entries.filter((entry) => namesTarget(prose, entry.name));
  return found.length === 1 ? found[0] : null;
}

/**
 * A change sentence with its change verbs lifted out.
 *
 * `becomes` is glue and nothing else, but it is not a word the create extractor
 * treats as glue, so a sentence in exactly the shape the question asks for would
 * otherwise read as a slot and a value that never met. The verbs come from the
 * ref table, so the copy that asks the question and the parser that reads the
 * answer cannot drift apart.
 */
export function liftChangeVerbs(prose) {
  let text = String(prose ?? '');
  for (const verb of changeVerbs()) {
    text = text.replace(
      new RegExp(`(^|[^A-Za-z0-9-])${escapeRe(verb)}($|[^A-Za-z0-9-])`, 'gi'),
      '$1 $2',
    );
  }
  return text;
}

const STATE_CANONICAL = { focused: 'focus', invalid: 'error', pressed: 'active' };

/**
 * The slots and states a sentence *names*, whether or not it gives them a value.
 *
 * This is the half of the never-list that cannot be enforced by the extractor
 * alone. `extractDraft` records a slot only when the sentence pairs it with a
 * value, so "add a disabled state" would otherwise read as a sentence about
 * nothing. Naming without valuing is a **question**, and a skipped question is a
 * `TODO` — never an invented value.
 *
 * Matching is longest-first with claimed ranges, so "focus ring" is the focus
 * ring and not the `focus` state wearing a stray word.
 */
export function mentionedSlots(prose) {
  const lower = String(prose ?? '').toLowerCase();
  const needles = [
    ...phraseIndex().map((row) => ({ phrase: row.phrase, slot: row.slot, property: row.property })),
    ...STATE_WORDS.map((word) => ({ phrase: word, state: STATE_CANONICAL[word] ?? word })),
  ].sort((a, b) => b.phrase.length - a.phrase.length || a.phrase.localeCompare(b.phrase));

  const claimed = [];
  const slots = [];
  const states = [];
  for (const needle of needles) {
    let from = 0;
    for (;;) {
      const index = lower.indexOf(needle.phrase, from);
      if (index === -1) break;
      const end = index + needle.phrase.length;
      const before = index === 0 ? ' ' : lower[index - 1];
      const after = end >= lower.length ? ' ' : lower[end];
      const bounded = !/[a-z0-9]/.test(before) && !/[a-z0-9-]/.test(after);
      const taken = claimed.some((range) => index < range.end && end > range.start);
      if (bounded && !taken) {
        claimed.push({ start: index, end });
        if (needle.state) states.push(needle.state);
        else slots.push({ slot: needle.slot, property: needle.property });
      }
      from = index + 1;
    }
  }
  return {
    slots: slots.filter(
      (item, index) => slots.findIndex((other) => other.slot === item.slot) === index,
    ),
    states: [...new Set(states)],
  };
}

/**
 * A revision draft for one recorded component, from one change sentence.
 *
 * The sentence is read as a **custom** one — no archetype word is looked for,
 * because the target was picked rather than guessed at, and a `named X` inside a
 * change sentence describes the component rather than renaming it. The recorded
 * archetype is then put back, so the draft is a revision of what is on the page
 * and not a differently-shaped new thing.
 *
 * `seedFromExisting` is deliberately *not* called here: it belongs after the
 * open questions are answered, so the carry-over is the last word on every slot
 * the sentence never touched.
 */
export function componentDraft(prose, entry, model, { now } = {}) {
  const draft = extractDraft(liftChangeVerbs(prose), {
    now,
    tokenNames: tokenNamesOf(model),
    custom: true,
    name: entry.name,
  });
  draft.name = entry.name;
  if (isCustom(entry.spec)) {
    draft.custom = true;
    draft.archetype = CUSTOM_ARCHETYPE;
    draft.archetypeName = 'Custom';
  } else {
    draft.custom = false;
    draft.archetype = entry.spec.archetype;
    draft.archetypeName = contractFor(entry.spec.archetype)?.name ?? entry.spec.archetype;
  }
  return draft;
}

/** The named-without-a-value gaps of one draft — the questions, in sentence order. */
export function openMentions(draft, mentioned) {
  const filled = new Set(draft.properties.map((property) => property.slot));
  const skipped = new Set(draft.skipped);
  const gaps = [];
  for (const { slot, property } of mentioned.slots) {
    if (filled.has(slot) || skipped.has(slot)) continue;
    gaps.push({ kind: 'contract', slot, property, archetype: draft.archetype });
  }
  for (const state of mentioned.states) {
    const bucket = draft.states.find((item) => item.name === state);
    if (bucket && (bucket.properties.length > 0 || bucket.note)) continue;
    if (skipped.has(`state:${state}`)) continue;
    gaps.push({ kind: 'state', slot: state, state, property: state, archetype: draft.archetype });
  }
  return gaps;
}

/**
 * What actually changed, spec against spec.
 *
 * The diff is taken between the **recorded** spec block and the one the revision
 * renders, so the sentence "every other slot is unchanged" is a fact read off
 * the two blocks rather than a promise made about them.
 */
export function specDiff(before, after) {
  const changes = [];
  const compare = (scope, was, now) => {
    for (const [key, value] of Object.entries(now)) {
      if (typeof value === 'object' || typeof was[key] === 'object') continue;
      if (was[key] === value) continue;
      changes.push({ scope, key, from: was[key] ?? null, to: value });
    }
    for (const key of Object.keys(was)) {
      if (key in now) continue;
      changes.push({ scope, key, from: was[key], to: null });
    }
  };
  compare(null, before.properties, after.properties);

  const states = new Set([...Object.keys(before.states), ...Object.keys(after.states)]);
  for (const state of states) {
    const was = before.states[state];
    const now = after.states[state];
    if (typeof was === 'object' && typeof now === 'object') {
      compare(state, was, now);
      continue;
    }
    if (was === now) continue;
    changes.push({
      scope: null,
      key: state,
      from: typeof was === 'object' ? '(a block)' : (was ?? null),
      to: typeof now === 'object' ? '(a block)' : (now ?? null),
      state: true,
    });
  }
  return changes;
}

/** Old and new, slot by slot — and the count of everything left alone. */
export function renderComponentProposal(entry, changes, untouched) {
  const label = (change) =>
    `${change.state ? 'state ' : ''}${change.scope ? `${change.scope}.` : ''}${change.key}`;
  const width = Math.max(...changes.map((change) => label(change).length));
  const lines = [
    `\`${entry.name}\`${entry.archetype ? ` (${entry.archetype})` : ''} in Components:`,
    ...changes.map((change) => {
      const from = change.from === null ? '(not recorded)' : change.from;
      const to = change.to === null ? '(removed)' : change.to;
      return `  ${label(change).padEnd(width)}  ${from} → ${to}`;
    }),
  ];
  lines.push(
    untouched === 0
      ? '  nothing else is recorded, so nothing else changes'
      : `  every other slot is left exactly as recorded (${untouched} of them)`,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Convergence, re-run on an edit (§6.4)
// ---------------------------------------------------------------------------

/**
 * The token that already holds this value, or null.
 *
 * The comparison is §3.1's, so a colour compares by its channels and
 * `rgba(37, 99, 235, 1)` **is** the `#2563EB` a system already names. A number
 * collides only inside its own "applies to", because a 12px radius and a 12px
 * padding are different facts.
 */
export function collisionFor(model, entry, row) {
  const rows = model?.tokens?.[entry.section] ?? [];
  const value = row[1];
  for (const [index, other] of rows.entries()) {
    if (index === entry.index) continue;
    if (entry.section === 'colours') {
      if (comparisonValue(other[1]) === comparisonValue(value)) return other[0];
      continue;
    }
    if (entry.section === 'numbers') {
      if (other[2] !== row[2]) continue;
      const px = toPx(value);
      const same =
        normaliseValue(other[1]) === normaliseValue(value) ||
        (px !== null && toPx(other[1]) !== null && toPx(other[1]) === px);
      if (same) return other[0];
      continue;
    }
    if (normaliseValue(other[1]) === normaliseValue(value)) return other[0];
  }
  return null;
}

/**
 * Why this rename cannot be made honestly, or null (v0.4.0 M7).
 *
 * Convergence already stops two names landing on one value. This is the same
 * check turned the other way up — two *values* landing on one name — and it was
 * missing, which made a rename the one edit that could put the file into a state
 * every other command treats as impossible.
 *
 * Two ways it goes wrong, and both end in the same place:
 *
 * - **The new name is taken.** Renaming `color-primary` to `color-surface`
 *   while `color-surface` exists leaves two rows under one name holding
 *   different values, and the ripple points every reference at whichever the
 *   reader happens to resolve first.
 * - **The old name is not unique.** A hand-edited file with `color-primary`
 *   twice cannot say which row a spec slot means. Rewriting them all hands the
 *   picked row every reference the *other* row owned — a component that meant
 *   `#2563EB` silently now means `#10B981`. That is not a ripple, it is a theft,
 *   and it is exactly the lie of omission the ripple exists to prevent.
 *
 * Neither is a crash and neither is a guess: the run says which, and stops
 * before the gate, so nothing is written and the value change is still
 * available in a second run.
 */
export function renameRefusal(model, entry, newName) {
  const rows = ['colours', 'numbers', 'typography'].flatMap((section) =>
    (model?.tokens?.[section] ?? []).map((row, index) => ({ section, index, name: row[0] })),
  );
  const duplicates = rows.filter((row) => row.name === entry.name);
  if (duplicates.length > 1) {
    return [
      `\`${entry.name}\` names ${duplicates.length} rows in ${DESIGN_SYSTEM_FILE}, so a rename cannot say which one a reference means.`,
      'Renaming one of them would hand it every reference the others own, so this edit stopped here —',
      'give the rows distinct names by hand, then run this again.',
    ];
  }
  const taken = rows.find(
    (row) => row.name === newName && !(row.section === entry.section && row.index === entry.index),
  );
  if (taken) {
    return [
      `\`${newName}\` already names a token in ${DESIGN_SYSTEM_FILE}.`,
      'Two values under one name is the mirror of two names on one value, so this edit stopped here —',
      `merge \`${entry.name}\` and \`${newName}\` by hand, or run this again with a different name.`,
    ];
  }
  return null;
}

// ---------------------------------------------------------------------------
// The rename ripple (§6.4)
// ---------------------------------------------------------------------------

/**
 * Everything a rename has to rewrite, worked out before anything is written.
 *
 * Two kinds of reference and no third: a **spec slot** whose value is the old
 * name, and a **Backlog line** naming it. Both are rewritten in the same write
 * as the token row itself, so the file is never on disk with a reference
 * pointing at a name that no longer exists — a rename that silently orphaned its
 * references would be a lie of omission.
 *
 * The plan is computed first and applied after the gate, because it is also what
 * the proposal *reports*: accepting a rename is accepting all of it, and that is
 * only true if the count was on screen before the question.
 */
export function planRename(model, oldName, newName) {
  const slot = new RegExp(`^(\\s*[A-Za-z0-9_.\\/-]+:\\s*)\`?${escapeRe(oldName)}\`?(\\s*)(#.*)?$`);
  const word = new RegExp(`(^|[^A-Za-z0-9_-])(\`?)${escapeRe(oldName)}(\`?)($|[^A-Za-z0-9_-])`, 'g');

  const slots = [];
  for (const component of model?.components ?? []) {
    for (const [blockIndex, block] of (component.blocks ?? []).entries()) {
      const lines = block.content.split('\n');
      lines.forEach((line, lineIndex) => {
        const match = line.match(slot);
        if (!match) return;
        slots.push({
          component: component.name,
          block: blockIndex,
          line: lineIndex,
          text: `${match[1]}${newName}${match[2] ?? ''}${match[3] ?? ''}`,
          slot: match[1].trim().replace(/:$/, ''),
        });
      });
    }
  }

  const backlog = [];
  (model?.backlog ?? []).forEach((line, index) => {
    word.lastIndex = 0;
    if (!word.test(line)) return;
    word.lastIndex = 0;
    backlog.push({ index, text: line.replace(word, `$1$2${newName}$3$4`) });
  });

  return { oldName, newName, slots, backlog };
}

/** Apply a rename plan to the model. Called once, after the gate. */
export function applyRename(model, plan) {
  for (const entry of plan.slots) {
    const component = model.components.find((item) => item.name === entry.component);
    const block = component.blocks[entry.block];
    const lines = block.content.split('\n');
    lines[entry.line] = entry.text;
    block.content = lines.join('\n');
  }
  for (const entry of plan.backlog) model.backlog[entry.index] = entry.text;
  return model;
}

/** What the ripple says out loud, before the gate. */
export function renderRipple(plan) {
  if (plan.slots.length === 0 && plan.backlog.length === 0) {
    return `  nothing else references \`${plan.oldName}\`, so nothing else changes`;
  }
  const parts = [];
  if (plan.slots.length > 0) {
    const where = [...new Set(plan.slots.map((entry) => entry.component))].join(', ');
    parts.push(`${plan.slots.length} spec slot${plan.slots.length === 1 ? '' : 's'} (${where})`);
  }
  if (plan.backlog.length > 0) {
    parts.push(`${plan.backlog.length} Backlog line${plan.backlog.length === 1 ? '' : 's'}`);
  }
  return `  renaming also rewrites ${parts.join(' and ')} — in the same write, and nothing else`;
}

// ---------------------------------------------------------------------------
// The proposal
// ---------------------------------------------------------------------------

/** Old and new, side by side. */
export function renderProposal(entry, next) {
  const before = describeToken(entry);
  const after = describeToken({ ...entry, row: next });
  const lines = [`\`${entry.name}\` in ${SECTION_LABEL[entry.section]}:`];
  lines.push(
    before === after ? `  value  ${before} (unchanged)` : `  value  ${before} → ${after}`,
  );
  lines.push(
    entry.name === next[0]
      ? `  name   ${entry.name} (unchanged)`
      : `  name   ${entry.name} → ${next[0]}`,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * Run `update`.
 *
 * ctx: { cwd, ask, confirm }
 *   ask(question, suggestions)  the menu, the type question, the pick, the change
 *   confirm(question)           the acceptance gate; without it nothing is
 *                               written, because nothing was accepted
 */
export async function runUpdate(args = [], ctx = {}) {
  const root = ctx.cwd;
  const model = parse(fs.readFileSync(path.join(root, DESIGN_SYSTEM_FILE), 'utf8'));
  const canAsk = typeof ctx.ask === 'function';

  // ---- the chain word, then the sentence ----------------------------------
  const first = args[0];
  const chained = first && !first.quoted && isChainWord(String(first.value ?? ''));
  const chain = chained ? String(first.value).toLowerCase() : null;
  const prose = (chained ? args.slice(1) : args)
    .map((argument) => String(argument?.value ?? argument ?? ''))
    .join(' ')
    .trim();

  // A menu with nobody to pick is a wall, so a run with no way to ask prints the
  // grammar and stops — the same posture the tokenise picker keeps.
  if (!canAsk) return { out: `${renderUsage()}\n\n${NOT_WRITTEN}\n`, code: 1 };

  const out = [];

  // A row the contract reader had to drop is said before anything is asked
  // (v0.4.0 M7). It is empty on every shipped copy of `refs/update.md`; when it
  // is not, the run below is being conducted with one of its own rules missing,
  // and the user is the one who has to know that.
  const notices = renderSpecNotices(updateSpecNotices(), { ran: 'this run' });
  if (notices.length > 0) out.push(...notices, '');

  if (chain === 'component') return updateComponent(out, { ctx, root, model, prose });
  if (chain === 'token') return updateToken(out, { ctx, root, model, prose });

  // ---- a sentence with no chain word: read it for its target ---------------
  if (prose !== '') {
    const { matched, candidates } = matchTarget(prose, model);
    if (matched?.kind === 'component') {
      return updateComponent(out, { ctx, root, model, prose, entry: { name: matched.name } });
    }
    if (matched?.kind === 'token') {
      return updateToken(out, { ctx, root, model, prose, entry: matched.entry });
    }
    if (candidates.length > 0) {
      const picked = await disambiguate(ctx, candidates, prose, out);
      if (!picked) return { out: `${out.join('\n')}\n${NOT_WRITTEN}\n`, code: 0 };
      if (picked.kind === 'component') {
        return updateComponent(out, { ctx, root, model, prose, entry: { name: picked.name } });
      }
      return updateToken(out, { ctx, root, model, prose, entry: picked.entry });
    }
    out.push(
      `Nothing in ${DESIGN_SYSTEM_FILE} is named in "${prose}", and Phyllum never guesses a target.`,
      '',
    );
  }

  // ---- the menu ------------------------------------------------------------
  const picked = resolvePick(await ctx.ask(renderMenu(), []), updateMenuOptions());
  if (picked.action === 'skip') return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };
  if (picked.action === 'prose') {
    const { matched } = matchTarget(picked.prose, model);
    if (matched?.kind === 'component') {
      return updateComponent(out, {
        ctx,
        root,
        model,
        prose: picked.prose,
        entry: { name: matched.name },
      });
    }
    if (matched?.kind === 'token') {
      return updateToken(out, { ctx, root, model, prose: picked.prose, entry: matched.entry });
    }
    out.push(
      `Nothing in ${DESIGN_SYSTEM_FILE} is named in "${picked.prose}", and Phyllum never guesses a target.`,
      '',
    );
    return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };
  }

  if (picked.row.chain === 'component') return updateComponent(out, { ctx, root, model, prose });
  return updateToken(out, { ctx, root, model, prose: '' });
}

/** The disambiguation question — never a guess, and never a dead end. */
async function disambiguate(ctx, candidates, prose, out) {
  const rows = candidates.map((item) => ({
    pick: item.name,
    printsAs: `${item.name} — the recorded ${item.kind}`,
    item,
  }));
  out.push(`"${prose}" could mean ${rows.length} recorded things, so I am not guessing.`, '');
  const answer = resolvePick(
    await ctx.ask(renderPick('Which one are you updating?', rows), []),
    rows,
  );
  if (answer.action === 'pick') return answer.row.item;
  return null;
}

/**
 * `update component` — list, pick, prose, revision, proposal, gate, one write
 * (§6.3).
 *
 * The change lands as a **revision**, and the revision is `create`'s: the same
 * `extractDraft` reads the sentence, the same `seedFromExisting` carries over
 * everything the sentence never mentioned, the same `resolveTokens` names a raw
 * value the system already holds a token for, and the same `acceptDraft` is the
 * only path from here to the file. This command is a second door into that
 * machinery, not a second copy of it — the only thing it owns is the
 * conversation that gets a target and a sentence in front of it.
 *
 * `entry` is set when the target was already read out of a sentence; without it
 * the flow opens at the list, which is where a bare `update component` starts.
 */
async function updateComponent(out, { ctx, root, model, prose, entry = null }) {
  const entries = componentEntries(model);
  if (entries.length === 0) {
    out.push(renderNoComponents(), '', NOT_WRITTEN, '');
    return { out: out.join('\n'), code: 0 };
  }

  let target = entry ? (entries.find((item) => item.name === entry.name) ?? entry) : null;
  let sentence = prose;

  // A chained run whose sentence already names a component skips the list: the
  // target is read, and asking for it again would be asking twice.
  if (!target && sentence !== '') target = matchComponent(sentence, entries);

  if (!target) {
    out.push(renderComponentList(entries), '');
    const chosen = resolvePick(
      await ctx.ask('Which one are you updating?', []),
      entries.map((item) => ({ pick: item.name, printsAs: item.name, entry: item })),
    );
    if (chosen.action === 'skip') return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };
    if (chosen.action === 'pick') target = chosen.row.entry;
    else {
      const found = matchComponent(chosen.prose, entries);
      if (!found) {
        out.push(
          `Nothing in that list is called "${chosen.prose}", and Phyllum never guesses a target.`,
          '',
          NOT_WRITTEN,
          '',
        );
        return { out: out.join('\n'), code: 0 };
      }
      target = found;
      sentence = chosen.prose;
    }
  }

  // An entry with nothing recorded under it has nothing to revise — and says
  // which command records it, rather than dead-ending or inventing a contract.
  if (!target.spec) {
    out.push(renderNoSpecBlock(target), '', NOT_WRITTEN, '');
    return { out: out.join('\n'), code: 0 };
  }

  // ---- the change, in prose ------------------------------------------------
  let draft = null;
  let mentioned = { slots: [], states: [] };
  for (let round = 0; ; round += 1) {
    if (sentence !== '') {
      draft = componentDraft(sentence, target, model, { now: ctx.today });
      mentioned = mentionedSlots(liftChangeVerbs(sentence));
      if (draft.properties.length > 0 || draft.states.length > 0 || mentioned.slots.length > 0 || mentioned.states.length > 0) {
        break;
      }
    }
    if (round >= MAX_FOLLOW_UPS) {
      out.push(
        `Nothing in "${sentence}" names a slot or a state of \`${target.name}\`, and Phyllum never invents one.`,
        '',
        NOT_WRITTEN,
        '',
      );
      return { out: out.join('\n'), code: 0 };
    }
    const answer = await ctx.ask(changeQuestion('component-change', target.name), [
      { action: 'skip', text: 'skip — leave this component as it is' },
    ]);
    const raw = String(answer ?? '').trim();
    if (raw === '' || resolvePick(raw, []).action === 'skip') {
      return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };
    }
    sentence = raw;
  }

  // ---- a slot named without a value is a question, and a skip is a `TODO` ---
  const gaps = openMentions(draft, mentioned);
  if (gaps.length > 0 && typeof ctx.ask === 'function') {
    const context = { model, evidence: [], archetype: draft.archetype };
    for (const gap of gaps) {
      const suggestions = suggestionsFor(gap, context);
      const answer = await ctx.ask(questionFor(gap, { mode: 'prose' }), suggestions);
      answerGap(draft, gap, resolveAnswer(answer, suggestions));
    }
  } else {
    for (const gap of gaps) answerGap(draft, gap, 'skip');
  }

  // ---- everything the sentence never mentioned, exactly as recorded --------
  seedFromExisting(draft, model);
  settleSkips(draft);
  resolveTokens(draft, model);
  orderLikeRecorded(draft, target.spec);

  const before = target.spec;
  const after = parseSpecBlock(renderSpecBlock(draft, { model }));
  const changes = specDiff(before, after);
  if (changes.length === 0) {
    out.push(
      `Nothing in "${sentence}" changes anything \`${target.name}\` records, so there is nothing to write.`,
      'Name the slot and its new value — e.g. "background becomes color-primary".',
      '',
      NOT_WRITTEN,
      '',
    );
    return { out: out.join('\n'), code: 0 };
  }

  // The draft walks the same state machine `create`'s does, because it *is*
  // one: a revision reaches the gate through `review`, never straight from
  // `drafting`.
  if (draft.status === 'drafting') advance(draft, 'review');

  const touched = new Set(changes.filter((change) => !change.scope).map((change) => change.key));
  const untouched = Object.keys(before.properties).filter((key) => !touched.has(key)).length;
  out.push(renderComponentProposal(target, changes, untouched), '');

  // ---- the acceptance gate. Only this branch writes. -----------------------
  if (typeof ctx.confirm !== 'function') {
    out.push(NOT_WRITTEN, '');
    return { out: out.join('\n'), code: 0 };
  }
  const yes = await ctx.confirm(`Write \`${target.name}\` to ${DESIGN_SYSTEM_FILE}?`);
  if (!yes) {
    out.push('Not accepted, so nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }

  const { updated } = acceptDraft(root, draft, {
    model,
    framework: detectProject(root).framework,
    session: false,
  });
  out.push(
    updated
      ? `Updated \`${target.name}\` in ${DESIGN_SYSTEM_FILE} (in place — no duplicate entry).`
      : `Wrote \`${target.name}\` to ${DESIGN_SYSTEM_FILE}.`,
    '',
  );
  return { out: out.join('\n'), code: 0 };
}

/**
 * Keep the recorded property order.
 *
 * A revision that reordered untouched slots would still be honest about their
 * values and dishonest about the page: the diff a user reads afterwards has to
 * show the lines the sentence named, and nothing else. New keys go last, in the
 * order the sentence introduced them.
 */
/**
 * A skip means "leave it as it is", and the record has the last word.
 *
 * Skipping a question about a state the file already fills must not blank it: the
 * carry-over puts the recorded value back, so the skip has nothing left to
 * record and drops. Without this the spec block would carry the state twice —
 * once with its value and once as a `TODO` — which is a slot the prose never
 * asked to change, changed.
 */
function settleSkips(draft) {
  draft.skipped = draft.skipped.filter((slot) => {
    if (!slot.startsWith('state:')) return true;
    const bucket = draft.states.find((item) => item.name === slot.slice('state:'.length));
    return !(bucket && (bucket.properties.length > 0 || bucket.note));
  });
  return draft;
}

function orderLikeRecorded(draft, spec) {
  const order = Object.keys(spec.properties);
  draft.properties.sort((a, b) => {
    const left = order.indexOf(a.key);
    const right = order.indexOf(b.key);
    if (left === -1 && right === -1) return 0;
    if (left === -1) return 1;
    if (right === -1) return -1;
    return left - right;
  });
  return draft;
}

/**
 * `update token` — type, list, pick, prose, proposal, gate, one write (§6.4).
 *
 * `entry` is set when the target was already read out of a sentence; without it
 * the flow opens at the type question, which is where an empty run starts.
 */
async function updateToken(out, { ctx, root, model, prose, entry = null }) {
  let target = entry;
  let sentence = prose;

  if (!target) {
    // A chained run whose sentence already names a token skips the picker: the
    // target is read, and asking for it again would be asking twice.
    if (sentence !== '') {
      const { matched } = matchTarget(sentence, model);
      if (matched?.kind === 'token') target = matched.entry;
    }
  }

  if (!target) {
    const picked = resolvePick(await ctx.ask(renderTypePicker(), []), updateTypeOptions());
    if (picked.action === 'skip') return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };

    let type = null;
    if (picked.action === 'prose') {
      sentence = picked.prose;
      const { matched } = matchTarget(sentence, model);
      if (matched?.kind === 'token') target = matched.entry;
      // A sentence that named nothing recorded still has somewhere to go: the
      // full list of every token, which is what `something else` lists.
      if (!target) type = updateTypeOptions().find((row) => row.section === null) ?? null;
    } else {
      type = picked.row;
    }

    if (!target && type) {
      const entries = tokensOfType(model, type);
      if (entries.length === 0) {
        // "There are none" and "there are some, and none of them readable" are
        // different facts, and only one of them points at `tokenise`.
        const omitted = renderUnlistable(unlistableCount(model, type));
        out.push(renderEmptySection(type));
        if (omitted) out.push(omitted);
        out.push('', NOT_WRITTEN, '');
        return { out: out.join('\n'), code: 0 };
      }
      out.push(renderTokenList(type, entries));
      const omitted = renderUnlistable(unlistableCount(model, type));
      if (omitted) out.push(omitted);
      out.push('');
      const chosen = resolvePick(
        await ctx.ask('Which one are you updating?', []),
        entries.map((item) => ({ pick: item.name, printsAs: item.name, entry: item })),
      );
      if (chosen.action === 'skip') return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };
      if (chosen.action === 'pick') target = chosen.row.entry;
      else {
        const { matched } = matchTarget(chosen.prose, model);
        if (!matched || matched.kind !== 'token') {
          out.push(
            `Nothing in that list is called "${chosen.prose}", and Phyllum never guesses a target.`,
            '',
            NOT_WRITTEN,
            '',
          );
          return { out: out.join('\n'), code: 0 };
        }
        target = matched.entry;
        sentence = chosen.prose;
      }
    }
  }

  // ---- the change, in prose ------------------------------------------------
  let change = sentence === '' ? { changed: false } : readChange(sentence, target);
  for (let round = 0; !change.changed; round += 1) {
    if (round >= MAX_FOLLOW_UPS) {
      out.push(
        `Nothing in "${sentence}" says what changes about \`${target.name}\`, and Phyllum never invents a value.`,
        '',
        NOT_WRITTEN,
        '',
      );
      return { out: out.join('\n'), code: 0 };
    }
    const answer = await ctx.ask(changeQuestion('token-change', target.name), [
      { action: 'skip', text: 'skip — leave this token as it is' },
    ]);
    const raw = String(answer ?? '').trim();
    if (raw === '' || resolvePick(raw, []).action === 'skip') {
      return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };
    }
    sentence = raw;
    change = readChange(sentence, target);
  }

  // ---- convergence, re-run on the new value --------------------------------
  if (change.changedValue) {
    const holder = collisionFor(model, target, change.row);
    if (holder) {
      out.push(
        `${change.row[1]} is already \`${holder}\` in ${DESIGN_SYSTEM_FILE}.`,
        'Two names on one value is what convergence exists to prevent, so this edit stopped here —',
        `merge \`${target.name}\` and \`${holder}\` by hand, or run this again with a different value.`,
        '',
        NOT_WRITTEN,
        '',
      );
      return { out: out.join('\n'), code: 0 };
    }
  }

  // ---- the rename, checked the way a value change is ------------------------
  const renaming = change.name !== null && change.name !== target.name;
  if (renaming) {
    const refusal = renameRefusal(model, target, change.name);
    if (refusal) {
      out.push(...refusal, '', NOT_WRITTEN, '');
      return { out: out.join('\n'), code: 0 };
    }
  }

  // ---- the proposal, and what a rename drags with it -----------------------
  const plan = renaming ? planRename(model, target.name, change.name) : null;
  out.push(renderProposal(target, change.row));
  if (plan) out.push(renderRipple(plan));
  out.push('');

  // ---- the acceptance gate. Only this branch writes. -----------------------
  if (typeof ctx.confirm !== 'function') {
    out.push(NOT_WRITTEN, '');
    return { out: out.join('\n'), code: 0 };
  }
  const yes = await ctx.confirm(`Write \`${change.row[0]}\` to ${DESIGN_SYSTEM_FILE}?`);
  if (!yes) {
    out.push('Not accepted, so nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }

  model.tokens[target.section][target.index] = change.row;
  if (plan) applyRename(model, plan);
  writeDesignSystem(root, render(model));

  out.push(`Wrote \`${change.row[0]}\` to ${DESIGN_SYSTEM_FILE}.`);
  if (plan) {
    for (const slot of plan.slots) {
      out.push(`  ${slot.component}'s \`${slot.slot}\` now references \`${plan.newName}\`.`);
    }
    for (const line of plan.backlog) out.push(`  Backlog: ${line.text}`);
  }
  out.push('');
  return { out: out.join('\n'), code: 0 };
}
