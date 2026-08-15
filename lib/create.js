/**
 * `create` — the deterministic half (plan §3, §7.3).
 *
 * The split the plan draws is: the CLI owns mechanics, the skill owns
 * intelligence. This module is the mechanics — a draft-spec data model, gap
 * computation against the archetype contract, suggestion ordering, and the
 * render/write path. Every rule it applies is read from `skill/refs/create.md`
 * rather than restated here, so the documentation and the code cannot drift.
 *
 * Two invariants hold everywhere in this file:
 *
 *   Anti-fabrication. A value only enters a draft with an origin — the user's
 *   prose, an answered follow-up, or a token the user picked. Nothing is ever
 *   filled in because it "usually" looks a certain way.
 *
 *   Values are free. Rules govern WHICH slots must be filled, never WHAT goes
 *   in them. Values are copied verbatim: no rounding, no unit conversion, no
 *   case fixing, no substituting a token that is merely close.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  CUSTOM_ARCHETYPE,
  archetypeWords,
  contractFor,
  defaultFor,
  isCustomArchetype,
  phraseIndex,
  slotForProperty,
} from './archetypes.js';

/** Variant words that become the second half of a component name. */
export const VARIANTS = [
  'primary',
  'secondary',
  'tertiary',
  'ghost',
  'outline',
  'outlined',
  'solid',
  'subtle',
  'danger',
  'destructive',
  'success',
  'warning',
  'info',
  'neutral',
  'inverse',
  'small',
  'medium',
  'large',
  'compact',
  'default',
];

/** State words that scope the pairs in their clause. */
export const STATE_WORDS = ['hover', 'disabled', 'focus', 'focused', 'error', 'invalid', 'active', 'pressed', 'checked'];

const STATE_CANONICAL = { focused: 'focus', invalid: 'error', pressed: 'active' };

/** Bare keywords that count as values when a property phrase claims them. */
const KEYWORDS = [
  'transparent',
  'currentcolor',
  'inherit',
  'none',
  'bold',
  'semibold',
  'normal',
  'italic',
  'uppercase',
  'lowercase',
  'capitalize',
  'white',
  'black',
  'red',
  'blue',
  'green',
  'grey',
  'gray',
];

/** CSS spellings that map onto a contract slot. Codebase evidence only. */
const CSS_ALIASES = {
  'background-color': 'background',
  background: 'background',
  'background-image': 'background',
  color: 'text-colour',
  'border-color': 'border-colour',
  'border-width': 'border-colour',
  'border-radius': 'radius',
  'box-shadow': 'shadow',
  padding: 'padding',
  'padding-top': 'padding',
  'padding-bottom': 'padding',
  'padding-left': 'padding',
  'padding-right': 'padding',
  'font-size': 'typography',
  'font-weight': 'typography',
  'line-height': 'typography',
  gap: 'gap',
  outline: 'focus-ring',
};

const EVIDENCE_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less', '.jsx', '.tsx', '.html']);
const EVIDENCE_SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.phyllum', 'coverage']);

// ---------------------------------------------------------------------------
// Value literals
// ---------------------------------------------------------------------------

const VALUE_PATTERNS = [
  /"[^"]*"|'[^']*'/g,
  /\b(?:rgba?|hsla?|linear-gradient|radial-gradient|conic-gradient|var|calc|url)\([^()]*(?:\([^()]*\)[^()]*)*\)/gi,
  /#[0-9a-fA-F]{3,8}\b/g,
  /\b\d*\.?\d+(?:px|rem|em|ex|ch|%|pt|vh|vw|deg|s|ms)\b/gi,
  new RegExp(`\\b(?:${KEYWORDS.join('|')})\\b`, 'gi'),
  /\b\d*\.?\d+\b/g,
];

/** Every value literal in `text`, non-overlapping, richest pattern first. */
function findValues(text) {
  const found = [];
  const claimed = (start, end) => found.some((v) => start < v.end && end > v.start);
  for (const pattern of VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      if (!claimed(match.index, match.index + match[0].length)) {
        found.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
      }
      match = pattern.exec(text);
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** Merge value literals separated by whitespace only: `0 1px 2px rgba(...)`. */
function mergeAdjacent(values, text) {
  const merged = [];
  for (const value of values) {
    const previous = merged[merged.length - 1];
    if (previous && /^[ \t]+$/.test(text.slice(previous.end, value.start))) {
      previous.end = value.end;
      previous.text = text.slice(previous.start, previous.end);
      continue;
    }
    merged.push({ ...value });
  }
  return merged;
}

const CONNECTORS = new Set([
  '',
  'of',
  'is',
  'are',
  'a',
  'an',
  'the',
  'to',
  'at',
  'with',
  'and',
  'set',
  'use',
  'uses',
  'using',
  'in',
  'by',
  'has',
  'have',
  'its',
  'their',
]);

/** Is the text between a value and a phrase nothing but glue? */
function isGlue(between) {
  return between
    .toLowerCase()
    .split(/[^a-z]+/)
    .every((word) => CONNECTORS.has(word));
}

/** Non-overlapping matches of `needles` (longest first) in a lowercased line. */
function findPhrases(lower, needles) {
  const found = [];
  const claimed = (start, end) => found.some((p) => start < p.end && end > p.start);
  for (const entry of needles) {
    let from = 0;
    for (;;) {
      const index = lower.indexOf(entry.phrase, from);
      if (index === -1) break;
      const end = index + entry.phrase.length;
      const before = index === 0 ? ' ' : lower[index - 1];
      const after = end >= lower.length ? ' ' : lower[end];
      const bounded = !/[a-z0-9]/.test(before) && !/[a-z0-9-]/.test(after);
      if (bounded && !claimed(index, end)) found.push({ ...entry, start: index, end });
      from = index + 1;
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Draft model
// ---------------------------------------------------------------------------

/** An empty draft. `status` walks the state machine in refs/create.md. */
export function newDraft({ mode = 'prose', input = '', now = new Date().toISOString() } = {}) {
  return {
    name: null,
    archetype: null,
    archetypeName: null,
    source: { mode, input },
    properties: [],
    states: [],
    skipped: [],
    unattached: [],
    status: 'drafting',
    createdAt: now,
    updatedAt: now,
  };
}

const titleCase = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/**
 * Prose -> draft spec (plan §3.1, Mode A).
 *
 * Extraction only. Anything the sentence does not say becomes a gap, and any
 * value that cannot be attached to a property is recorded as unattached — a
 * follow-up question, never a guess.
 */
export function extractDraft(prose, { now, tokenNames = [], custom = false, name = null } = {}) {
  const text = String(prose ?? '');
  const draft = newDraft({ mode: 'prose', input: text, now });
  const lower = text.toLowerCase();

  // 1. Archetype. No archetype word means no draft properties — just a question.
  //    Unless the user has already answered that question with **custom**
  //    (v0.3.0 §6.7): then there is no archetype to find, and the sentence is
  //    read for exactly what it says and nothing more.
  const archetypeHit = findPhrases(
    lower,
    archetypeWords().map((entry) => ({ phrase: entry.word, archetype: entry.archetype })),
  )[0];
  if (!archetypeHit && !custom) {
    draft.unknownArchetype = true;
    return draft;
  }

  if (custom) {
    draft.archetype = CUSTOM_ARCHETYPE;
    draft.archetypeName = 'Custom';
    draft.custom = true;
  } else {
    draft.archetype = archetypeHit.archetype.key;
    draft.archetypeName = archetypeHit.archetype.name;
  }

  // 2. Name: an explicit `named X` wins, otherwise Archetype/Variant. A custom
  //    has no archetype to build a name from, so an unnamed one stays unnamed
  //    and the caller asks — a name is never invented either.
  const explicit = text.match(/\b(?:named|called)\s+"?([A-Za-z][A-Za-z0-9/_-]*)"?/i);
  if (explicit) {
    draft.name = explicit[1];
  } else if (custom) {
    draft.name = name ? String(name).trim() : null;
  } else {
    const variant = findPhrases(
      lower,
      VARIANTS.map((word) => ({ phrase: word, variant: word })),
    )[0];
    draft.name = `${archetypeHit.archetype.name}/${titleCase(variant ? variant.variant : 'default')}`;
  }

  // 3 & 4. Property/value pairs, clause by clause, scoped by any state word.
  const phrases = phraseIndex();
  for (const clause of splitClauses(text)) {
    const clauseLower = clause.text.toLowerCase();
    const state = findPhrases(
      clauseLower,
      STATE_WORDS.map((word) => ({ phrase: word, state: word })),
    )[0];
    const stateName = state ? STATE_CANONICAL[state.state] ?? state.state : null;

    const phraseHits = findPhrases(clauseLower, phrases);

    // A token the user names in the sentence — "with the rounded-md radius" —
    // is a value like any other, and the best kind: already named by them.
    const namedTokens = findPhrases(
      clauseLower,
      tokenNames.map((token) => ({ phrase: token.toLowerCase(), token })),
    ).map((hit) => ({ start: hit.start, end: hit.end, text: hit.token, token: hit.token }));

    const literals = mergeAdjacent(findValues(clause.text), clause.text).filter(
      (value) =>
        !phraseHits.some((p) => value.start < p.end && value.end > p.start) &&
        !namedTokens.some((t) => value.start < t.end && value.end > t.start),
    );
    const values = [...literals, ...namedTokens].sort((a, b) => a.start - b.start);

    for (const { value, phrase } of pairValues(values, phraseHits, clause.text)) {
      if (!phrase) {
        draft.unattached.push(value.text);
        continue;
      }
      addProperty(draft, {
        key: phrase.property,
        slot: phrase.slot,
        value: value.text,
        token: value.token,
        origin: 'prose',
        state: stateName,
      });
    }
  }

  return draft;
}

/**
 * Clauses are the scope of a state word: split on `;`, `,` and `and`, but
 * never inside brackets or quotes — a `linear-gradient(#fff, #eee)` is one
 * value, not two clauses.
 */
function splitClauses(text) {
  const clauses = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (depth > 0) continue;

    if (char === ';' || char === ',') {
      clauses.push({ text: text.slice(start, i) });
      start = i + 1;
      continue;
    }
    const word = text.slice(i, i + 5).toLowerCase();
    if (word === ' and ' || (i === 0 && text.slice(0, 4).toLowerCase() === 'and ')) {
      clauses.push({ text: text.slice(start, i) });
      start = i + (word === ' and ' ? 5 : 4);
      i = start - 1;
    }
  }
  clauses.push({ text: text.slice(start) });
  return clauses.filter((clause) => clause.text.trim() !== '');
}

/**
 * Pair each value with a property phrase: closest pairing wins, each phrase
 * takes at most one value, and only glue words may sit between the two. A
 * value that finds no phrase stays unattached — a question, not a guess.
 */
function pairValues(values, phrases, text) {
  const candidates = [];
  for (const value of values) {
    const left = [...phrases].reverse().find((p) => p.end <= value.start);
    if (left && !values.some((v) => v.end <= value.start && v.start >= left.end)) {
      const between = text.slice(left.end, value.start);
      if (isGlue(between)) candidates.push({ value, phrase: left, distance: value.start - left.end });
    }
    const right = phrases.find((p) => p.start >= value.end);
    if (right && !values.some((v) => v.start >= value.end && v.end <= right.start)) {
      const between = text.slice(value.end, right.start);
      if (isGlue(between)) candidates.push({ value, phrase: right, distance: right.start - value.end });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.value.start - b.value.start);

  const takenPhrases = new Set();
  const takenValues = new Set();
  const pairs = [];
  for (const candidate of candidates) {
    if (takenPhrases.has(candidate.phrase) || takenValues.has(candidate.value)) continue;
    takenPhrases.add(candidate.phrase);
    takenValues.add(candidate.value);
    pairs.push({ value: candidate.value, phrase: candidate.phrase });
  }
  for (const value of values) {
    if (!takenValues.has(value)) pairs.push({ value, phrase: null });
  }
  return pairs.sort((a, b) => a.value.start - b.value.start);
}

/** Record a property on the draft (or on one of its states). */
export function addProperty(draft, { key, slot, value, origin, token, state = null }) {
  const entry = {
    key,
    slot: slot ?? slotForProperty(key),
    value,
    origin,
    ...(token ? { token } : {}),
  };
  const bucket = state ? stateBucket(draft, state) : draft;
  const existing = bucket.properties.findIndex((p) => p.key === key);
  if (existing === -1) bucket.properties.push(entry);
  else bucket.properties[existing] = entry;
  draft.skipped = draft.skipped.filter((s) => s !== entry.slot && s !== `state:${state}`);
  return draft;
}

function stateBucket(draft, name) {
  let bucket = draft.states.find((s) => s.name === name);
  if (!bucket) {
    bucket = { name, properties: [] };
    draft.states.push(bucket);
  }
  return bucket;
}

/** The user said "skip": the slot becomes an honest TODO, not a guess. */
export function skipSlot(draft, slot) {
  if (!draft.skipped.includes(slot)) draft.skipped.push(slot);
  return draft;
}

/** Answer a gap with a value or a token (plan §3.2). */
export function answerGap(draft, gap, answer) {
  if (answer === null || answer === undefined || String(answer).trim().toLowerCase() === 'skip') {
    return skipSlot(draft, gap.state ? `state:${gap.state}` : gap.skipAs ?? gap.slot);
  }
  const suggestion = typeof answer === 'object' ? answer : { value: String(answer) };

  // A state answer is a sentence about the state ("background 10% darker"),
  // not a property/value pair. It is recorded verbatim as the state's note —
  // the scalar form the spec block already supports.
  if (gap.kind === 'state' && !suggestion.property) {
    const bucket = stateBucket(draft, gap.state ?? gap.slot);
    bucket.note = suggestion.token ?? suggestion.value;
    bucket.origin = suggestion.token ? 'token' : 'answer';
    draft.skipped = draft.skipped.filter((s) => s !== `state:${bucket.name}`);
    return draft;
  }

  return addProperty(draft, {
    key: gap.property ?? gap.slot,
    slot: gap.slot,
    value: suggestion.token ?? suggestion.value,
    token: suggestion.token,
    origin: suggestion.token ? 'token' : 'answer',
    state: gap.state ?? null,
  });
}

// ---------------------------------------------------------------------------
// Gaps
// ---------------------------------------------------------------------------

/**
 * Is this draft (or parsed spec) a contract-free custom? (v0.3.0 §6.7)
 *
 * Two spellings answer yes, and both are written by the same renderer: the
 * explicit `custom: true` marker, and the reserved `custom` archetype word. A
 * reader that has only one of the two — a hand-edited file, an older draft —
 * still gets the right answer.
 */
export function isCustom(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return entry.custom === true || isCustomArchetype(entry.archetype);
}

/** Start a contract-free draft, named by the user (v0.3.0 §6.7). */
export function newCustomDraft({ name = null, mode = 'pick', input = '', now } = {}) {
  const draft = newDraft({ mode, input, now });
  draft.archetype = CUSTOM_ARCHETYPE;
  draft.archetypeName = 'Custom';
  draft.custom = true;
  draft.name = name ? String(name).trim() : null;
  return draft;
}

/** Slots this draft has filled, by any of the slot's property keys. */
export function filledSlots(draft) {
  return new Set(draft.properties.map((property) => property.slot));
}

/**
 * The gap list (plan §3.1.1, §3.2): the contract's mandatory slots and states
 * minus what the input filled and what the user skipped, plus the slots
 * extrapolated from prior components of the same archetype.
 */
export function gapsFor(draft, { model = null } = {}) {
  // A custom follows no contract, so it has no gap list: no mandatory slots, no
  // mandatory states, and no extrapolation from anybody else's components
  // (v0.3.0 §6.7). It is complete when the user says it is.
  if (isCustom(draft)) return [];

  const contract = contractFor(draft.archetype);
  if (!contract) return [];

  const filled = filledSlots(draft);
  const skipped = new Set(draft.skipped);
  const gaps = [];

  for (const slot of contract.slots) {
    if (filled.has(slot) || skipped.has(slot)) continue;
    gaps.push({ kind: 'contract', slot, property: slot, archetype: contract.key });
  }

  for (const state of contract.states) {
    const bucket = draft.states.find((s) => s.name === state);
    const covered = bucket && (bucket.properties.length > 0 || bucket.note);
    if (covered || skipped.has(`state:${state}`)) continue;
    gaps.push({ kind: 'state', slot: state, state, property: state, archetype: contract.key });
  }

  for (const slot of extrapolatedSlots(model, contract)) {
    if (filled.has(slot) || skipped.has(slot)) continue;
    gaps.push({ kind: 'extrapolated', slot, property: slot, archetype: contract.key });
  }

  return gaps;
}

/**
 * Slots every existing component of this archetype defines, which the contract
 * does not demand (plan §3.1.1). One precedent is not a system, so a slot only
 * counts when *all* prior components of the archetype agree on it.
 */
export function extrapolatedSlots(model, contract) {
  if (!model || !contract) return [];
  const priors = componentsOfArchetype(model, contract.key);
  if (priors.length === 0) return [];

  const mandatory = new Set(contract.slots);
  const counts = new Map();
  for (const prior of priors) {
    const slots = new Set(Object.keys(prior.properties).map((key) => slotForProperty(key)));
    for (const slot of slots) counts.set(slot, (counts.get(slot) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([slot, count]) => count === priors.length && !mandatory.has(slot))
    .map(([slot]) => slot)
    .sort();
}

/** The value prior components of this archetype agree on for a slot, if any. */
export function extrapolatedValue(model, archetypeKey, slot) {
  const priors = componentsOfArchetype(model, archetypeKey);
  if (priors.length === 0) return null;
  const values = new Set();
  for (const prior of priors) {
    for (const [key, value] of Object.entries(prior.properties)) {
      if (slotForProperty(key) === slot && value !== 'TODO') values.add(value);
    }
  }
  return values.size === 1 ? [...values][0] : null;
}

/** Parsed spec blocks of every component in the model with this archetype. */
export function componentsOfArchetype(model, archetypeKey) {
  if (!model || isCustomArchetype(archetypeKey)) return [];
  const out = [];
  for (const component of model.components ?? []) {
    const block = (component.blocks ?? []).find((b) => b.lang === 'yaml');
    if (!block) continue;
    const spec = parseSpecBlock(block.content);
    // A custom is nobody's precedent: it claimed no contract, so it cannot be
    // evidence about what components of a *kind* always define (§6.7).
    if (isCustom(spec)) continue;
    if (spec.archetype === archetypeKey) out.push(spec);
  }
  return out;
}

/** Read back a spec block Phyllum wrote (plan §7.1 — the file is a database). */
export function parseSpecBlock(text) {
  const spec = { name: null, archetype: null, custom: false, properties: {}, states: {} };
  let section = null;
  let state = null;
  for (const raw of String(text).split('\n')) {
    // Strip trailing comments — a `#` followed by a space. A `#` that starts a
    // colour (`#2563EB`) is a value, not a comment, and must survive.
    const line = raw.replace(/\s+#\s.*$/, '').trimEnd();
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    const match = line.trim().match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;

    if (indent === 0) {
      if (key === 'name') spec.name = value;
      else if (key === 'archetype') spec.archetype = value;
      // The custom marker (v0.3.0 §6.7) — read back so nothing downstream has
      // to infer "no contract" from the absence of one.
      else if (key === 'custom') spec.custom = value.trim().toLowerCase() === 'true';
      else if (key === 'properties') section = 'properties';
      else if (key === 'states') section = 'states';
      else section = null;
      state = null;
      continue;
    }
    if (section === 'properties' && indent === 2) {
      spec.properties[key] = value;
      continue;
    }
    if (section === 'states' && indent === 2) {
      if (value === '' ) {
        state = key;
        spec.states[key] = {};
      } else {
        spec.states[key] = value; // `disabled: TODO`
        state = null;
      }
      continue;
    }
    if (section === 'states' && indent === 4 && state) {
      spec.states[state][key] = value;
    }
  }
  return spec;
}

// ---------------------------------------------------------------------------
// Suggestions (plan §3.2 — existing tokens, then codebase, then labelled guess)
// ---------------------------------------------------------------------------

const COLOUR_SLOTS = new Set(['background', 'text-colour', 'border-colour', 'overlay-colour', 'focus-ring']);
const NUMBER_SLOTS = new Set(['radius', 'padding', 'gap', 'shadow']);

const SLOT_HINTS = {
  radius: ['radius', 'round', 'corner'],
  padding: ['padding', 'spacing', 'inset', 'space'],
  gap: ['gap', 'spacing', 'space'],
  background: ['background', 'surface', 'fill'],
  'text-colour': ['text', 'foreground', 'label', 'ink'],
  'border-colour': ['border', 'stroke', 'outline'],
  'overlay-colour': ['overlay', 'scrim', 'backdrop'],
};

function tokenRowsForSlot(model, slot) {
  if (!model) return [];
  if (COLOUR_SLOTS.has(slot)) {
    return (model.tokens.colours ?? []).map((row) => ({ token: row[0], value: row[1], note: row[2] ?? '' }));
  }
  if (NUMBER_SLOTS.has(slot)) {
    return (model.tokens.numbers ?? []).map((row) => ({ token: row[0], value: row[1], note: row[2] ?? '' }));
  }
  if (slot === 'typography') {
    return (model.tokens.typography ?? []).map((row) => ({
      token: row[0],
      value: [row[1], row[2], row[3]].filter(Boolean).join(' / '),
      note: 'typography',
    }));
  }
  return [];
}

/**
 * Suggestions for one gap, in the plan's priority order. The first suggestion
 * is a token whenever the system already has one that fits — a raw value never
 * outranks a token the user already named.
 */
export function suggestionsFor(gap, { model = null, evidence = [], archetype = null } = {}) {
  const slot = gap.slot;
  const out = [];

  const rows = tokenRowsForSlot(model, slot);
  const hints = SLOT_HINTS[slot] ?? [];
  const matchesHint = (row) =>
    hints.length === 0 ||
    hints.some((hint) => `${row.token} ${row.note}`.toLowerCase().includes(hint));
  const hinted = rows.filter(matchesHint);
  const ordered = hinted.length > 0 ? hinted : rows;

  // A value every prior component of this archetype agrees on leads the list.
  const agreed = extrapolatedValue(model, archetype ?? gap.archetype, slot);
  const lead = ordered.filter((row) => row.token === agreed || row.value === agreed);
  for (const row of [...lead, ...ordered.filter((row) => !lead.includes(row))]) {
    out.push({
      source: 'token',
      token: row.token,
      value: row.value,
      text: `Your system already has \`${row.token}\` (${row.value}) — use it?`,
    });
  }

  // A traced reading that did not clear its confidence bar (plan §3.1 Mode B).
  // It is offered, clearly marked, and recorded only if the user picks it —
  // which is the difference between showing the working and inventing a value.
  if (gap.reading) {
    out.push({
      source: 'traced',
      value: gap.reading,
      confidence: gap.confidence,
      text: `${gap.reading} — what the image reads, at ${gap.confidence} confidence: measured, but not confidently enough for Phyllum to record on its own.`,
    });
  }

  for (const item of evidence.filter((e) => e.slot === slot).slice(0, 3)) {
    out.push({
      source: 'codebase',
      value: item.value,
      where: item.file,
      text: `${item.file} uses \`${item.property}: ${item.value}\` (${item.count}×) — use that?`,
    });
  }

  const guess = defaultFor(archetype ?? gap.archetype, slot);
  if (guess) {
    out.push({
      source: 'default',
      value: guess,
      text: `${guess} — a sensible default for a ${archetype ?? gap.archetype}, and a labelled guess, not something from your code.`,
    });
  }

  return out;
}

/** Read-only sweep of the project for values near similar components (§3.2). */
export function gatherEvidence(root, { maxFiles = 40, maxDepth = 4 } = {}) {
  const counts = new Map();
  const walk = (dir, depth) => {
    if (depth > maxDepth || counts.size > 400) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (EVIDENCE_SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!EVIDENCE_EXTENSIONS.has(path.extname(entry.name))) continue;
      if (maxFiles-- <= 0) return;
      let text;
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const rel = path.relative(root, full).split(path.sep).join('/');
      const pattern = /([a-z-]+)\s*:\s*([^;{}\n]+)[;\n]/gi;
      let match = pattern.exec(text);
      while (match !== null) {
        const property = match[1].toLowerCase();
        const value = match[2].trim();
        const slot = CSS_ALIASES[property];
        if (slot && value.length < 60) {
          const key = `${slot}|${property}|${value}|${rel}`;
          const seen = counts.get(key) ?? { slot, property, value, file: rel, count: 0 };
          seen.count += 1;
          counts.set(key, seen);
        }
        match = pattern.exec(text);
      }
    }
  };
  walk(root, 0);
  return [...counts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// ---------------------------------------------------------------------------
// Tokens, spec rendering, and the write step
// ---------------------------------------------------------------------------

/**
 * Swap a raw value for the token that already names it (the rerunnable
 * guarantee: the same input converges on the same token). Only an exact value
 * match counts — a token that is merely close is never substituted.
 */
export function resolveTokens(draft, model) {
  if (!model) return draft;

  // A token only stands in for a value in a slot it is actually about: the
  // radius token `rounded-md (12px)` must never quietly become a padding.
  const swap = (property) => {
    if (property.token) return;
    const candidates = tokenRowsForSlot(model, property.slot).filter((row) =>
      slotAcceptsToken(property.slot, row),
    );
    const match = candidates.find(
      (row) => String(row.value).toLowerCase() === String(property.value).toLowerCase(),
    );
    if (!match) return;
    property.token = match.token;
    property.value = match.token;
  };
  draft.properties.forEach(swap);
  for (const state of draft.states) state.properties.forEach(swap);
  return draft;
}

/**
 * Would this token be about this slot? Two colours with the same value are the
 * same colour, so any colour token may name a colour slot. Numbers are not
 * interchangeable that way — `rounded-md (12px)` is a corner radius, and a
 * 12px padding is a different fact that happens to share a number.
 */
function slotAcceptsToken(slot, row) {
  if (COLOUR_SLOTS.has(slot) || slot === 'typography') return true;
  const hints = SLOT_HINTS[slot] ?? [];
  if (hints.length === 0) return false;
  return hints.some((hint) => `${row.token} ${row.note}`.toLowerCase().includes(hint));
}

/** Every token name in the model, longest first so scans prefer the specific. */
export function tokenNamesOf(model) {
  if (!model) return [];
  const names = [];
  for (const key of ['colours', 'numbers', 'typography']) {
    for (const row of model.tokens[key] ?? []) if (row[0]) names.push(row[0]);
  }
  return names.sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/** Is this value a token name in the model? Raw values carry tokenise debt. */
export function isTokenName(model, value) {
  return tokenNamesOf(model).includes(value);
}

/**
 * Re-running `create` for a name that already exists opens a revision, not a
 * duplicate (plan §3.3). Everything the user accepted last time is carried
 * over — including the slots they skipped, which stay skipped — and the new
 * description overrides only what it actually mentions.
 */
export function seedFromExisting(draft, model) {
  const component = (model?.components ?? []).find((entry) => entry.name === draft.name);
  const block = component?.blocks?.find((b) => b.lang === 'yaml');
  if (!block) return { draft, revision: false };

  const spec = parseSpecBlock(block.content);
  // Re-creating a custom opens a revision of a custom: the marker is part of
  // what was accepted, so it survives the rerun rather than the component
  // quietly acquiring a contract (§6.7).
  if (isCustom(spec)) {
    draft.custom = true;
    draft.archetype = CUSTOM_ARCHETYPE;
    draft.archetypeName = 'Custom';
  }
  const has = (key) => draft.properties.some((property) => property.key === key);

  for (const [key, value] of Object.entries(spec.properties)) {
    if (has(key)) continue;
    if (value === 'TODO') {
      skipSlot(draft, slotForProperty(key));
      continue;
    }
    addProperty(draft, {
      key,
      slot: slotForProperty(key),
      value,
      token: isTokenName(model, value) ? value : undefined,
      origin: 'existing',
    });
  }

  for (const [name, value] of Object.entries(spec.states)) {
    const bucket = draft.states.find((state) => state.name === name);
    if (bucket && (bucket.properties.length > 0 || bucket.note)) continue;
    if (value === 'TODO') {
      skipSlot(draft, `state:${name}`);
      continue;
    }
    if (typeof value === 'string') {
      const state = stateBucket(draft, name);
      state.note = value;
      state.origin = 'existing';
      continue;
    }
    for (const [key, stateValue] of Object.entries(value)) {
      addProperty(draft, {
        key,
        slot: slotForProperty(key),
        value: stateValue,
        token: isTokenName(model, stateValue) ? stateValue : undefined,
        origin: 'existing',
        state: name,
      });
    }
  }

  draft.revisionOf = draft.name;
  return { draft, revision: true };
}

/** The YAML spec block for a draft (plan §7.1.1). */
export function renderSpecBlock(draft, { model = null } = {}) {
  const lines = [`name: ${draft.name}`, `archetype: ${draft.archetype}`];
  // A custom says so on the page (v0.3.0 §6.7), so that a reader — `assess`,
  // `apply`, a person — knows there is no contract to hold it to without having
  // to know which words the contract table happens to contain.
  if (isCustom(draft)) lines.push('custom: true');
  lines.push('properties:');
  const debt = (property) =>
    property.token || isTokenName(model, property.value) ? '' : ' # TODO: tokenise';

  for (const property of draft.properties) {
    lines.push(`  ${property.key}: ${property.value}${debt(property)}`);
  }
  for (const slot of draft.skipped.filter((s) => !s.startsWith('state:'))) {
    lines.push(`  ${slot}: TODO`);
  }
  if (draft.properties.length === 0 && draft.skipped.length === 0) lines.push('  {}');

  const skippedStates = draft.skipped
    .filter((s) => s.startsWith('state:'))
    .map((s) => s.slice('state:'.length));
  if (draft.states.length > 0 || skippedStates.length > 0) {
    lines.push('states:');
    for (const state of draft.states) {
      if (state.properties.length === 0 && state.note) {
        lines.push(`  ${state.name}: ${state.note}`);
        continue;
      }
      lines.push(`  ${state.name}:`);
      for (const property of state.properties) {
        lines.push(`    ${property.key}: ${property.value}${debt(property)}`);
      }
      if (state.note) lines.push(`    note: ${state.note}`);
    }
    for (const state of skippedStates) lines.push(`  ${state}: TODO`);
  }
  return lines.join('\n');
}

/** Backlog entries this component owes (plan §7.1.1, §3.2). */
export function backlogEntriesFor(draft, { model = null } = {}) {
  const entries = [];
  const raw = (property, scope) => {
    if (property.token || isTokenName(model, property.value)) return;
    entries.push(`TODO: tokenise \`${property.value}\` (${draft.name} ${scope})`);
  };
  for (const property of draft.properties) raw(property, property.key);
  for (const state of draft.states) {
    for (const property of state.properties) raw(property, `${state.name} ${property.key}`);
  }
  for (const slot of draft.skipped) {
    const label = slot.startsWith('state:') ? slot.slice('state:'.length) : slot;
    entries.push(`TODO: fill contract slot \`${label}\` (${draft.name})`);
  }
  return entries;
}

/** Does this Backlog line belong to this component? */
function ownsBacklogLine(line, name) {
  return line.includes(`(${name} `) || line.includes(`(${name})`);
}

/**
 * Put the component into the model: update in place when the name already
 * exists, append otherwise, and replace this component's Backlog entries
 * rather than duplicating them.
 */
export function upsertComponent(model, draft, { blocks } = {}) {
  const specBlocks = blocks ?? [{ lang: 'yaml', content: renderSpecBlock(draft, { model }) }];
  const index = model.components.findIndex((component) => component.name === draft.name);
  const updated = index !== -1;
  const entry = { name: draft.name, blocks: specBlocks };
  if (updated) model.components[index] = entry;
  else model.components.push(entry);

  model.backlog = model.backlog.filter((line) => !ownsBacklogLine(line, draft.name));
  model.backlog.push(...backlogEntriesFor(draft, { model }));
  return { model, updated };
}
