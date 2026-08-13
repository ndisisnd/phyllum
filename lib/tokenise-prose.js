/**
 * Reading a token out of a sentence (v0.2.0 plan §6).
 *
 * `tokenise` used to read the codebase. As of v0.2.0 that is `assess`'s job and
 * this module is the whole of `tokenise`'s input: one sentence in, one candidate
 * token out. "our brand blue #2563EB" is a colour called `color-primary`;
 * "16px spacing called space-md" is a spacing value the user named themselves.
 *
 * Three rules shape everything here:
 *
 *   1. **Never invent a value.** A sentence with no concrete value produces a
 *      question, not a guess and not an error. The caller asks it.
 *   2. **The user's name wins.** A name in the sentence is used verbatim; a name
 *      Phyllum suggests is confirmed before it is written.
 *   3. **The scales live in the reference file.** Role words, weight words,
 *      colour names, ladders and typography bands all come from
 *      `skill/refs/tokenise.md` through `tokenise-spec.js` — this module reads
 *      tables, it does not restate them.
 *
 * Values out, nothing printed and nothing written: the conversation is
 * `tokenise-command.js`'s and the write is `write.js`'s.
 */

import {
  appliesToFor,
  appliesToForCluster,
  hintFor,
  ladderFor,
  roleForProperty,
  weightForWord,
} from './tokenise-spec.js';
import {
  colourPattern,
  isRoleColour,
  lengthPattern,
  nameColour,
  nameTypography,
  normaliseValue,
  toPx,
  uniqueName,
} from './tokenise.js';

const ROLES = new Set(['radius', 'spacing', 'border']);
const DEFAULT_ROLE = 'spacing';
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+$/;
const WEIGHT_STEPS = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);

/** The CSS initial values, recorded rather than invented (see the ref file). */
export const IMPLIED_WEIGHT = '400';
export const IMPLIED_LINE_HEIGHT = 'normal';

const words = (text) =>
  String(text)
    .split(/[\s,;:()]+/)
    .map((word) => word.replace(/^[`'"]+|[`'".!?]+$/g, ''))
    .filter((word) => word.length > 0);

/** Every match of a global pattern, with the matched text blanked out after. */
function harvest(text, pattern) {
  const found = [];
  let rest = text;
  for (const match of text.matchAll(pattern)) found.push(match[0]);
  for (const value of found) rest = rest.split(value).join(' ');
  return { found, rest };
}

// ---------------------------------------------------------------------------
// The name in the sentence, if there is one
// ---------------------------------------------------------------------------

/**
 * Words that can sit between a naming word and the name, and never *are* the name.
 * Kept deliberately tiny: a pronoun and an article, nothing that guesses.
 */
const FILLER_AFTER_NAME_HINT = new Set(['it', 'this', 'that', 'these', 'those', 'them', 'the', 'a', 'an']);

/**
 * The name the user typed: a backticked word, the word after "called" / "named"
 * / "as", or a bare hyphenated identifier. Anything the tables already know as a
 * hint word or a CSS property is not a name.
 */
export function nameInProse(prose) {
  const backticked = String(prose).match(/`([A-Za-z][A-Za-z0-9-]*)`/);
  if (backticked) return backticked[1];

  const list = words(prose);
  const known = (word) => Boolean(hintFor(word) || roleForProperty(word) || weightForWord(word));
  // `corner-radius` is two words the tables already know, so it is a property,
  // not a name. `brand-blue` is neither, so it is what the user calls this.
  const nameable = (word) =>
    IDENTIFIER.test(word) && !known(word) && !word.split('-').some((part) => known(part));

  for (let index = 0; index < list.length - 1; index += 1) {
    if (hintFor(list[index]) !== 'name') continue;
    // "the next word" is the contract's rule, and a pronoun is not a word anybody
    // means as a name (v0.2.0 M8). "call it color-brand" is the ordinary English
    // way to name something, and reading it literally recorded a token called
    // `it` — a wrong name written silently into the user's design system, which is
    // worse than not finding a name at all. So one filler word is stepped over.
    let at = index + 1;
    while (at < list.length && FILLER_AFTER_NAME_HINT.has(list[at].toLowerCase())) at += 1;
    const candidate = list[at];
    if (
      candidate !== undefined &&
      /^[A-Za-z][A-Za-z0-9-]*$/.test(candidate) &&
      !hintFor(candidate) &&
      !weightForWord(candidate)
    ) {
      return candidate;
    }
  }

  return list.find(nameable) ?? null;
}

/** The number role a sentence names, or null when it names none. */
export function roleInProse(prose, { name = null } = {}) {
  for (const word of words(prose)) {
    const hint = hintFor(word);
    if (hint && ROLES.has(hint)) return hint;
    const byProperty = roleForProperty(word);
    if (byProperty) return byProperty;
  }
  // A name the user chose can also settle it: `space-md` is spacing.
  for (const role of ROLES) {
    const { rungs } = ladderFor(role);
    if (name && rungs.some((rung) => rung === name || name.startsWith(`${rung.split('-')[0]}-`))) {
      return role;
    }
  }
  return null;
}

/** Does the sentence talk about type at all? */
export function mentionsTypography(prose) {
  return words(prose).some((word) => hintFor(word) === 'typography' || weightForWord(word) !== null);
}

// ---------------------------------------------------------------------------
// The value (or values) in the sentence
// ---------------------------------------------------------------------------

/**
 * Every token this sentence could be about, in the order it mentions them.
 * Usually exactly one; a sentence carrying two values is a sentence the caller
 * has to ask about, because `tokenise` records one token per run.
 */
export function valuesInProse(prose) {
  const text = String(prose ?? '');
  const colours = harvest(text, colourPattern());
  const lengths = harvest(colours.rest, lengthPattern());

  // What is left can only carry bare numbers: a weight (700) or a line-height (1.2).
  const bare = [...lengths.rest.matchAll(/(?<![\w.#-])(\d+(?:\.\d+)?)(?![\w.%-])/g)].map((match) =>
    Number.parseFloat(match[1]),
  );
  const wordWeight = words(text).map((word) => weightForWord(word)).find((value) => value !== null);
  const weight = wordWeight ?? bare.find((value) => WEIGHT_STEPS.has(value)) ?? null;
  const lineHeight = bare.find((value) => value <= 4) ?? null;

  const candidates = colours.found.map((value) => ({ pass: 'colours', value }));

  const typographic = mentionsTypography(text) || weight !== null || lineHeight !== null;
  if (typographic && lengths.found.length > 0) {
    candidates.push({
      pass: 'typography',
      value: lengths.found[0],
      size: lengths.found[0],
      weight: weight === null ? IMPLIED_WEIGHT : String(weight),
      lineHeight: lineHeight === null ? IMPLIED_LINE_HEIGHT : String(lineHeight),
      implied: [
        ...(weight === null ? ['font-weight 400'] : []),
        ...(lineHeight === null ? ['line-height normal'] : []),
      ],
    });
  } else {
    for (const value of lengths.found) candidates.push({ pass: 'numbers', value });
  }

  return { candidates, weight, lineHeight, typographic };
}

/**
 * The sentence, read. `candidates` is what it could be about (possibly empty,
 * which is the follow-up case), `name` is the user's own name for it, and
 * `role`/`roleFromProse` say whether a length's meaning was stated or assumed.
 */
export function parseProse(prose) {
  const input = String(prose ?? '').trim();
  const name = nameInProse(input);
  const role = roleInProse(input, { name });
  const { candidates, typographic } = valuesInProse(input);

  for (const candidate of candidates) {
    if (candidate.pass !== 'numbers') continue;
    candidate.role = role ?? DEFAULT_ROLE;
    candidate.roleFromProse = role !== null;
  }

  return {
    input,
    name,
    nameFromProse: name !== null,
    role,
    typographic,
    candidates,
    complete: candidates.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Naming what the sentence did not name
// ---------------------------------------------------------------------------

/** Every token name the model already uses. */
export function takenNames(model) {
  const taken = new Set();
  for (const key of ['colours', 'numbers', 'typography']) {
    for (const row of model?.tokens?.[key] ?? []) if (row[0]) taken.add(row[0]);
  }
  return taken;
}

/** How many chromatic colours the system already names — the next one's rank. */
function chromaticRank(model) {
  const rows = model?.tokens?.colours ?? [];
  return rows.filter((row) => row[1] && !isRoleColour(row[1])).length + 1;
}

/**
 * Where a length sits on its role's ladder, relative to what is already named:
 * the centre rung when it is the first of its kind, a rung up when it is bigger
 * than everything named, a rung down when it is smaller.
 */
export function ladderPlacement(role, value, model) {
  const { rungs, centre } = ladderFor(role);
  if (rungs.length === 0) return `${role}-1`;

  const label = appliesToFor(role);
  const existing = (model?.tokens?.numbers ?? [])
    .filter((row) => row[2] === label && rungs.includes(row[0]))
    .map((row) => ({
      index: rungs.indexOf(row[0]),
      px: toPx(row[1]) ?? Number.parseFloat(row[1]),
    }))
    .filter((row) => Number.isFinite(row.px))
    .sort((a, b) => a.px - b.px);

  if (existing.length === 0) return rungs[centre];

  const px = toPx(value) ?? Number.parseFloat(value);
  const smallest = existing[0];
  const largest = existing[existing.length - 1];
  if (!Number.isFinite(px)) return rungs[centre];
  if (px > largest.px) return rungs[Math.min(largest.index + 1, rungs.length - 1)];
  if (px < smallest.px) return rungs[Math.max(smallest.index - 1, 0)];

  const below = [...existing].reverse().find((row) => row.px < px);
  const above = existing.find((row) => row.px > px);
  const from = (below?.index ?? -1) + 1;
  const to = above?.index ?? rungs.length;
  for (let index = from; index < to; index += 1) {
    if (!existing.some((row) => row.index === index)) return rungs[index];
  }
  return rungs[centre];
}

/** The name Phyllum would propose for one candidate, and why it proposed it. */
export function suggestName(candidate, model) {
  if (candidate.pass === 'colours') {
    const value = candidate.value;
    const suggested = nameColour(value, chromaticRank(model));
    return {
      name: suggested,
      why: isRoleColour(value)
        ? 'the colour itself says what it is for'
        : `the ${ordinal(chromaticRank(model))} chromatic colour in your system`,
    };
  }
  if (candidate.pass === 'typography') {
    return { name: nameTypography(candidate), why: 'weight picks the role, size picks the band' };
  }
  const role = candidate.role ?? DEFAULT_ROLE;
  return {
    name: ladderPlacement(role, candidate.value, model),
    why: `where ${candidate.value} sits on the ${appliesToFor(role)} ladder`,
  };
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];
const ordinal = (n) => ORDINALS[n - 1] ?? `${n}th`;

// ---------------------------------------------------------------------------
// The proposal — the same shape the acceptance path already writes
// ---------------------------------------------------------------------------

const SECTION_OF = { colours: 'colours', numbers: 'numbers', typography: 'typography' };

/** A table cell that cannot break the table it lands in. */
export const cell = (text) => String(text).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

/**
 * Is this value already named? A number has to match in its own role as well as
 * its value: a 12px radius does not mean a 12px padding is named.
 */
export function existingTokenFor(candidate, model) {
  const raw = candidate.pass === 'typography' ? candidate.size : candidate.value;
  const wanted = normaliseValue(raw);
  // Lengths are compared in px as well as literally, so `1rem` recognises the
  // `16px` the system already names — the same rule clustering uses.
  const px = toPx(raw);
  const same = (value) =>
    normaliseValue(value) === wanted ||
    (px !== null && toPx(value) !== null && toPx(value) === px);

  if (candidate.pass === 'colours') {
    const row = (model?.tokens?.colours ?? []).find((item) => normaliseValue(item[1]) === wanted);
    return row ? { name: row[0], section: 'colours' } : null;
  }
  if (candidate.pass === 'typography') {
    const row = (model?.tokens?.typography ?? []).find((item) => same(item[1]));
    return row ? { name: row[0], section: 'typography' } : null;
  }
  // The Numbers table holds three kinds of value now — lengths with a role, and
  // the two compounds — and the "applies to" column is what tells them apart. A
  // shadow is looked up as a shadow, never as the spacing a roleless number
  // would default to.
  const label = appliesToForCluster({
    pass: candidate.pass,
    role: candidate.role ?? DEFAULT_ROLE,
  });
  const row = (model?.tokens?.numbers ?? []).find((item) => same(item[1]) && item[2] === label);
  return row ? { name: row[0], section: 'numbers' } : null;
}

/**
 * Turn a read sentence into the proposal the review and the write step already
 * understand — the same object `assess` produces from a cluster, minus the
 * codebase evidence a sentence does not have.
 */
export function proposalFrom(candidate, { name, model, prose, suggested = null }) {
  const taken = takenNames(model);
  const settled = uniqueName(name, taken);
  const value =
    candidate.pass === 'typography'
      ? `${candidate.size} / ${candidate.weight} / ${candidate.lineHeight}`
      : candidate.value;

  return {
    pass: candidate.pass,
    section: SECTION_OF[candidate.pass],
    role: candidate.pass === 'numbers' ? (candidate.role ?? DEFAULT_ROLE) : null,
    name: settled,
    suggestedName: suggested ?? settled,
    value,
    size: candidate.size ?? null,
    weight: candidate.weight ?? null,
    lineHeight: candidate.lineHeight ?? null,
    appliesTo: candidate.pass === 'numbers' ? appliesToFor(candidate.role ?? DEFAULT_ROLE) : '',
    notes: cell(`from prose: "${prose}"`),
    count: 1,
    files: [],
    properties: [],
    members: [
      {
        value,
        raw: candidate.pass === 'typography' ? candidate.size : candidate.value,
        count: 1,
      },
    ],
    merged: false,
    source: 'prose',
    implied: candidate.implied ?? [],
  };
}
