/**
 * Reading a token out of a sentence (v0.2.0 plan §6).
 *
 * `tokenise` used to read the codebase. As of v0.2.0 that is `assess`'s job and
 * this module is the whole of `tokenise`'s input: one sentence in, the candidate
 * tokens out. "our brand blue #2563EB" is a colour called `color-primary`;
 * "16px spacing called space-md" is a spacing value the user named themselves.
 *
 * As of v0.3.0 (plan §3) a sentence may carry several values, and this is the
 * only place that changed: the reader keeps going after the first value and
 * returns the whole queue, in sentence order, duplicates collapsed. Everything
 * downstream still runs once per value, exactly as it did when there was only
 * ever one.
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

import { composeName, slotWords } from './nomenclature.js';
import {
  appliesToFor,
  appliesToForCluster,
  bindingDirection,
  hintFor,
  ladderFor,
  nameSourceApplies,
  queueRule,
  readingSeparators,
  roleForProperty,
  roleSignalFor,
  weightForWord,
} from './tokenise-spec.js';
import {
  colourPattern,
  comparisonValue,
  gradientPattern,
  isGradientValue,
  isRoleColour,
  lengthPattern,
  nameColour,
  nameGradient,
  nameTypography,
  normaliseValue,
  toPx,
  uniqueName,
  withGradientMark,
} from './tokenise.js';

const ROLES = new Set(['radius', 'spacing', 'border']);
const DEFAULT_ROLE = 'spacing';
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+$/;
const WEIGHT_STEPS = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);
const BARE_NUMBER = /(?<![\w.#-])(\d+(?:\.\d+)?)(?![\w.%-])/g;

/** The CSS initial values, recorded rather than invented (see the ref file). */
export const IMPLIED_WEIGHT = '400';
export const IMPLIED_LINE_HEIGHT = 'normal';

/**
 * The sentence with every gradient blanked out, its width kept (v0.4.0 §5.1).
 *
 * A gradient is one value, and the words inside it are its own punctuation: `to`
 * and `right` are not role words, and `linear-gradient` is not a hyphenated
 * identifier the user meant as a name. Blanking rather than deleting keeps every
 * index to the right of it exactly where it was, which is what the binding rules
 * are measured in.
 */
export function maskGradients(text) {
  let out = String(text ?? '');
  for (const match of String(text ?? '').matchAll(gradientPattern())) {
    out = blank(out, match.index, match[0].length);
  }
  return out;
}

/** Every word in the sentence, with where it sits — positions are what bind. */
function wordsWithIndex(text) {
  const out = [];
  for (const match of maskGradients(text).matchAll(/[^\s,;:()]+/g)) {
    const word = match[0].replace(/^[`'"]+|[`'".!?]+$/g, '');
    if (word.length > 0) out.push({ word, index: match.index });
  }
  return out;
}

const words = (text) => wordsWithIndex(text).map((item) => item.word);

/**
 * Blank a span out without moving anything after it.
 *
 * The batch reader works in positions — which value comes before which, which
 * name is nearest to which value — so a value that has already been read has to
 * leave a hole of exactly its own width behind. Deleting it instead would shift
 * every index to its right and quietly re-order the queue.
 */
const blank = (text, start, length) =>
  text.slice(0, start) + ' '.repeat(length) + text.slice(start + length);

/** Every match of a global pattern, with where it sat and the text blanked out. */
function harvestAt(text, pattern, offset = 0) {
  const found = [];
  let rest = text;
  for (const match of text.matchAll(pattern)) {
    found.push({ value: match[0], index: offset + match.index });
    rest = blank(rest, match.index, match[0].length);
  }
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

/**
 * Every name the sentence carries, in the order it carries them.
 *
 * `nameInProse` answers "what is this token called?" and is the whole answer for
 * a one-value sentence. A batch needs the plural, because a name is bound to the
 * value nearest it rather than to the sentence: "#2563EB called brand-blue and
 * #10B981 called success-green" names two things and neither name is the
 * sentence's.
 */
export function namesInProse(prose) {
  const text = String(prose ?? '');
  const found = [];
  const add = (name, index) => {
    if (!found.some((item) => item.index === index)) found.push({ name, index });
  };

  for (const match of text.matchAll(/`([A-Za-z][A-Za-z0-9-]*)`/g)) {
    add(match[1], match.index + 1);
  }

  const list = wordsWithIndex(text);
  const known = (word) => Boolean(hintFor(word) || roleForProperty(word) || weightForWord(word));
  const nameable = (word) =>
    IDENTIFIER.test(word) && !known(word) && !word.split('-').some((part) => known(part));

  for (let index = 0; index < list.length - 1; index += 1) {
    if (hintFor(list[index].word) !== 'name') continue;
    let at = index + 1;
    while (at < list.length && FILLER_AFTER_NAME_HINT.has(list[at].word.toLowerCase())) at += 1;
    const candidate = list[at];
    if (
      candidate !== undefined &&
      /^[A-Za-z][A-Za-z0-9-]*$/.test(candidate.word) &&
      !hintFor(candidate.word) &&
      !weightForWord(candidate.word)
    ) {
      add(candidate.word, candidate.index);
    }
  }

  for (const item of list) if (nameable(item.word)) add(item.word, item.index);

  return found.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// Cutting the sentence into readings (v0.3.0 plan §3.2)
// ---------------------------------------------------------------------------

/**
 * Where one typography reading ends and the next begins.
 *
 * Colours and lengths delimit themselves; a typography reading does not, so the
 * sentence is cut before it is read. The cut points come from the
 * `phyllum:reading-splits` table — a role word opens a reading *at* the word, an
 * explicit separator opens one *after* itself — and nothing else cuts. A
 * sentence with no splitter at all is one segment, which is exactly what every
 * single-value sentence has always been.
 */
export function splitSegments(prose) {
  const text = String(prose ?? '');
  const cuts = new Set([0]);

  // A value is never cut in half. `rgb(37, 99, 235)` carries two commas and is
  // one colour, so the spans of the values themselves are off limits to every
  // splitter below — a delimiter inside a value is punctuation, not a delimiter.
  // A gradient carries commas and brackets of its own and is still one value, so
  // its span is off limits to every splitter exactly as `rgb(37, 99, 235)`'s is.
  const spans = [
    ...[...text.matchAll(gradientPattern())],
    ...[...maskGradients(text).matchAll(colourPattern())],
  ].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  const insideValue = (at) => spans.some((span) => at > span.start && at < span.end);

  for (const separator of readingSeparators()) {
    if (/^[A-Za-z]/.test(separator)) {
      for (const item of wordsWithIndex(text)) {
        if (item.word.toLowerCase() === separator.toLowerCase()) {
          cuts.add(item.index + item.word.length);
        }
      }
      continue;
    }
    for (let at = text.indexOf(separator); at !== -1; at = text.indexOf(separator, at + 1)) {
      cuts.add(at + separator.length);
    }
  }

  // A role word opens its own reading, so the cut lands on the word itself —
  // "heading" belongs to the reading it names, not to the one before it.
  for (const item of wordsWithIndex(text)) {
    if (hintFor(item.word) === 'typography') cuts.add(item.index);
  }

  const starts = [...cuts]
    .filter((at) => at < text.length && !insideValue(at))
    .sort((a, b) => a - b);
  if (starts.length === 0) return text.length === 0 ? [] : [{ start: 0, end: text.length }];
  return starts.map((start, index) => ({ start, end: starts[index + 1] ?? text.length }));
}

// ---------------------------------------------------------------------------
// The value (or values) in the sentence
// ---------------------------------------------------------------------------

/** One reading's stated weight and line-height, before the defaults fill in. */
function readSegment(text, segment) {
  const slice = text.slice(segment.start, segment.end);
  // Gradients come out first, whole. A gradient holds colours and lengths inside
  // it — stops and an angle — and reading those would turn one value into four.
  const gradients = harvestAt(slice, gradientPattern(), segment.start);
  const colours = harvestAt(gradients.rest, colourPattern(), segment.start);
  const lengths = harvestAt(colours.rest, lengthPattern(), segment.start);

  // What is left can only carry bare numbers: a weight (700) or a line-height (1.2).
  const bare = [...lengths.rest.matchAll(BARE_NUMBER)].map((match) => Number.parseFloat(match[1]));
  const wordWeight = words(slice)
    .map((word) => weightForWord(word))
    .find((value) => value !== null);
  const weight = wordWeight ?? bare.find((value) => WEIGHT_STEPS.has(value)) ?? null;
  const lineHeight = bare.find((value) => value <= 4) ?? null;
  const typographic =
    words(slice).some((word) => hintFor(word) === 'typography') ||
    weight !== null ||
    lineHeight !== null;

  return {
    slice,
    colours: [...gradients.found, ...colours.found].sort((a, b) => a.index - b.index),
    lengths: lengths.found,
    weight,
    lineHeight,
    typographic,
  };
}

/** A reading with its gaps filled by the CSS initial values, visibly. */
function completeReading(reading) {
  return {
    ...reading,
    weight: reading.weight === null ? IMPLIED_WEIGHT : String(reading.weight),
    lineHeight: reading.lineHeight === null ? IMPLIED_LINE_HEIGHT : String(reading.lineHeight),
    implied: [
      ...(reading.weight === null ? ['font-weight 400'] : []),
      ...(reading.lineHeight === null ? ['line-height normal'] : []),
    ],
  };
}

/**
 * Every token this sentence is about, in the order it mentions them.
 *
 * One value is the common case and reads exactly as it always has. Several
 * values become several candidates in sentence order — the queue's order — and
 * each one carries the fragment of the sentence that led up to it, because that
 * is the text the naming suggestion reads for a role word.
 */
export function valuesInProse(prose) {
  const text = String(prose ?? '');
  const segments = splitSegments(text);
  const candidates = [];
  const readings = [];
  const stranded = [];
  let typographic = false;
  let weight = null;
  let lineHeight = null;

  segments.forEach((segment, order) => {
    const read = readSegment(text, segment);
    if (read.typographic) typographic = true;
    if (weight === null) weight = read.weight;
    if (lineHeight === null) lineHeight = read.lineHeight;

    for (const colour of read.colours) {
      candidates.push({ pass: 'colours', value: colour.value, index: colour.index });
    }

    if (!read.typographic) {
      const role = roleInProse(read.slice);
      for (const length of read.lengths) {
        candidates.push({
          pass: 'numbers',
          value: length.value,
          index: length.index,
          role: role ?? DEFAULT_ROLE,
          roleFromProse: role !== null,
        });
      }
      return;
    }

    // A typographic segment with no size is not a reading — it is a fragment
    // that belongs to one, and the binding table says which.
    if (read.lengths.length === 0) {
      stranded.push({ order, weight: read.weight, lineHeight: read.lineHeight });
      return;
    }

    const reading = {
      pass: 'typography',
      value: read.lengths[0].value,
      size: read.lengths[0].value,
      index: read.lengths[0].index,
      order,
      weight: read.weight,
      lineHeight: read.lineHeight,
    };
    readings.push(reading);
    candidates.push(reading);
  });

  // The stranded fragments, bound. `left` is the rule — a clause is read left to
  // right, so "heading 24px, semibold" is a semibold heading — and `right` is
  // the one exception, for a fragment with no reading behind it at all.
  for (const fragment of stranded) {
    const before = [...readings].reverse().find((reading) => reading.order < fragment.order);
    const after = readings.find((reading) => reading.order > fragment.order);
    const target =
      bindingDirection('reading') === 'left'
        ? (before ?? (bindingDirection('stranded') === 'right' ? after : null))
        : (after ?? before);
    if (!target) continue;
    // A slot the reading already states is left alone: the first statement stands.
    if (target.weight === null && fragment.weight !== null) target.weight = fragment.weight;
    if (target.lineHeight === null && fragment.lineHeight !== null) {
      target.lineHeight = fragment.lineHeight;
    }
  }

  candidates.sort((a, b) => a.index - b.index);
  const finished = candidates.map((candidate) =>
    candidate.pass === 'typography' ? completeReading(candidate) : candidate,
  );

  return { candidates: finished, weight, lineHeight, typographic };
}

/** How a duplicate is recognised: the already-named check's own normalisation. */
function duplicateKey(candidate) {
  if (candidate.pass === 'typography') {
    return `typography|${normaliseValue(candidate.size)}|${candidate.weight}|${candidate.lineHeight}`;
  }
  if (candidate.pass === 'numbers') {
    return `numbers|${normaliseValue(candidate.value)}|${candidate.role ?? DEFAULT_ROLE}`;
  }
  // A colour is compared by its channels, so one colour pasted twice in two
  // formats is one entry — the same convergence the already-named check makes
  // between runs, applied inside one sentence (v0.4.0 plan §3.1).
  return `${candidate.pass}|${comparisonValue(candidate.value)}`;
}

/**
 * Two mentions of one value are one proposal.
 *
 * Convergence has always applied between runs — a value the system already names
 * is not named twice — and this is the same rule applied inside one. The first
 * mention keeps its place in the queue; a name carried by a later mention fills
 * a survivor that has none, because the user did say it.
 */
export function collapseDuplicates(candidates) {
  if (queueRule('duplicates') !== 'collapse') return candidates;
  const out = [];
  for (const candidate of candidates) {
    const key = duplicateKey(candidate);
    const seen = out.find((item) => duplicateKey(item) === key);
    if (!seen) {
      out.push(candidate);
      continue;
    }
    if (!seen.name && candidate.name) {
      seen.name = candidate.name;
      seen.nameFromProse = true;
    }
  }
  return out;
}

/**
 * The stretch of sentence that belongs to one value — what its naming
 * suggestion reads.
 *
 * It runs from the end of the value before to the start of the value after, so
 * the words on either side of a value count as said about *it*: "our danger red
 * #DC2626" and "#DC2626, the danger red" describe the same colour, and a reader
 * would call both of them a danger colour.
 */
function contextFor(candidates, index, text) {
  const previous = candidates[index - 1];
  const next = candidates[index + 1];
  const from = previous ? previous.index + String(previous.value).length : 0;
  return text.slice(from, next ? next.index : text.length).trim();
}

/**
 * The sentence, read. `candidates` is the proposal queue in sentence order
 * (possibly empty, which is the follow-up case), `name` is the user's own name
 * for the first of them, and `role`/`roleFromProse` say whether a length's
 * meaning was stated or assumed.
 */
export function parseProse(prose) {
  const input = String(prose ?? '').trim();
  const name = nameInProse(input);
  const role = roleInProse(input, { name });
  const { candidates, typographic } = valuesInProse(input);

  // A length whose own clause said nothing about its role falls back to what the
  // sentence as a whole says, so "12px and 16px padding" still reads as spacing.
  for (const candidate of candidates) {
    if (candidate.pass !== 'numbers' || candidate.roleFromProse) continue;
    candidate.role = role ?? DEFAULT_ROLE;
    candidate.roleFromProse = role !== null;
  }

  // Names bind to values, not to sentences: each one to the nearest value on its
  // left, or — with nothing on its left — to the first value on its right.
  for (const found of namesInProse(input)) {
    const before = [...candidates].reverse().find((candidate) => candidate.index < found.index);
    const after = candidates.find((candidate) => candidate.index > found.index);
    const target =
      bindingDirection('name') === 'left'
        ? (before ?? (bindingDirection('stranded') === 'right' ? after : null))
        : (after ?? before);
    if (!target || target.name) continue;
    target.name = found.name;
    target.nameFromProse = true;
  }

  for (const [index, candidate] of candidates.entries()) {
    candidate.context = contextFor(candidates, index, input);
    candidate.name = candidate.name ?? null;
    candidate.nameFromProse = Boolean(candidate.name);
  }

  const queue = collapseDuplicates(candidates);

  return {
    input,
    name,
    nameFromProse: name !== null,
    role,
    typographic,
    candidates: queue,
    complete: queue.length > 0,
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
  // A gradient is not on the lightness/saturation scale at all, so it does not
  // move a solid colour's rank: `color-primary` means the first primary colour
  // whether or not a gradient was recorded before it (v0.4.0 plan §5.2).
  return rows.filter((row) => row[1] && !isGradientValue(row[1]) && !isRoleColour(row[1])).length + 1;
}

/** How many gradients the system already names — the next one's rank. */
function gradientRank(model) {
  return (model?.tokens?.colours ?? []).filter((row) => isGradientValue(row[1])).length + 1;
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

// ---------------------------------------------------------------------------
// The nomenclature library as a naming source (v0.3.0 plan §4.2, §4.3)
// ---------------------------------------------------------------------------

/**
 * What the sentence says this colour is *for*, in the library's own words.
 *
 * The words are the `phyllum:role-signals` table's, and the first spelling of a
 * slot wins — a sentence that says both "hover" and "pressed" about one value is
 * a sentence about one state, whichever it named first.
 */
export function signalsInProse(prose) {
  const found = {};
  for (const word of words(prose)) {
    const signal = roleSignalFor(word);
    if (!signal) continue;
    if (found[signal.slot] === undefined) found[signal.slot] = signal.word;
  }
  return found;
}

/**
 * The library's name for this colour, or null when it has none to give.
 *
 * A family is the anchor: `family` and `rank` are the two mandatory slots, and a
 * sentence that signals a rank alone ("our main blue") has named no role at all.
 * With a family and no rank, the rank is read off how many colours that family
 * already names — first `danger` is `danger-primary`, second is
 * `danger-secondary` — and a family whose three ranks are spent returns null
 * rather than inventing a fourth rank word. Null is how this source says "the
 * scale should answer this one", which is exactly what the name-source table
 * promises.
 */
export function nomenclatureName(prose, model) {
  const signals = signalsInProse(prose);
  if (!signals.family) return null;

  const ranks = slotWords('rank');
  let rank = signals.rank ?? null;
  if (rank === null) {
    const used = (model?.tokens?.colours ?? []).filter((row) => {
      const parts = String(row[0] ?? '').split('-');
      return parts[0] === signals.family && ranks.includes(parts[1]);
    }).length;
    rank = ranks[used] ?? null;
    if (rank === null) return null;
  }

  return composeName({
    family: signals.family,
    rank,
    exception: signals.exception,
    state: signals.state,
  });
}

/** The name Phyllum would propose for one candidate, and why it proposed it. */
export function suggestName(candidate, model) {
  if (candidate.pass === 'colours') {
    const value = candidate.value;
    // A gradient is a colour value with no colour to read: `toHsl` returns null
    // for one, so the lightness/saturation scale has nothing to judge. It gets the
    // same two sources in the same order — the library, then a scale of its own —
    // and every name either of them proposes carries the mark word (§5.2).
    const gradient = isGradientValue(value);
    // The library first, the scale as its fallback — the order the name-source
    // table declares, not one this function decided.
    if (nameSourceApplies('nomenclature', 'colours')) {
      const fromLibrary = nomenclatureName(candidate.context ?? '', model);
      if (fromLibrary) {
        return {
          name: gradient ? withGradientMark(fromLibrary) : fromLibrary,
          why: gradient
            ? 'the description says what this gradient is for'
            : 'the description says what this colour is for',
          source: 'nomenclature',
        };
      }
    }
    if (gradient) {
      const rank = gradientRank(model);
      return {
        name: nameGradient(rank),
        source: 'scale',
        why: `the ${ordinal(rank)} gradient in your system`,
      };
    }
    const suggested = nameColour(value, chromaticRank(model));
    return {
      name: suggested,
      source: 'scale',
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
    // Colours are compared by channels, alpha included, so the format the value
    // was pasted in makes no difference to whether it is already named.
    const channels = comparisonValue(raw);
    const row = (model?.tokens?.colours ?? []).find(
      (item) => comparisonValue(item[1]) === channels,
    );
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
export function proposalFrom(candidate, { name, model, suggested = null }) {
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
