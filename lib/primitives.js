/**
 * `create primitives` — the mechanics (v0.3.0 plan §5).
 *
 * A primitive ramp is the value layer a design system's semantic tokens sit on:
 * nine steps, `100` (lightest) to `900` (darkest). Two behaviours, decided by
 * what the system already holds (§5.1):
 *
 *   no colour tokens      the neutral ramp only — nine shipped constants, read
 *                         straight out of `refs/nomenclature.md`, identical for
 *                         every Phyllum user
 *   colour tokens         one ramp per token, each asked about first, plus the
 *                         neutral ramp alongside when it is not there yet
 *
 * Everything here is **arithmetic and table lookup**. There is no model in this
 * path and no room for one: a derived ramp is a pure function of the token's own
 * value and the scale in `refs/nomenclature.md`, so the same input gives the same
 * nine values on every run and on every machine (§5.2, §5.4). The conversation —
 * the per-token question, the acceptance gate, the write — lives in
 * `create-command.js`, the way `create.js` and `create-command.js` are split.
 *
 * Two rules from the plan are properties of the code below rather than promises:
 *
 *   **The token's own value is never altered.** It is slotted at its nearest step
 *   verbatim — the same characters the user recorded, not a re-spelling of them.
 *
 *   **Nothing is proposed unasked.** `walkPrimitives` cannot produce a proposal
 *   for a token whose question has not been asked and answered yes; the question
 *   comes first in the loop, not beside it.
 */

import { HEADING_PRIMITIVES } from './design-system.js';
import { neutralRamp, rampScale } from './nomenclature.js';
import { hslToRgb, toHsl } from './tokenise.js';

export { HEADING_PRIMITIVES };

/** The step numbers a ramp has, lightest first — the scale table decides. */
export const steps = () => rampScale().map((row) => row.step);

/**
 * The name of one step of a ramp: the base name with the number glued on.
 *
 * No hyphen, whatever the base token's casing (§5.3, decided): `accentRed` →
 * `accentRed100`, `brand-blue` → `brand-blue100`. Semantic names are hyphenated
 * at every slot boundary (§4.1), so a number welded to the name is a design
 * system's way of saying "value layer" at a glance.
 */
export const stepName = (base, step) => `${base}${step}`;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** An HSL triple as a six-digit uppercase hex string. */
export function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, clamp(s, 0, 100) / 100, clamp(l, 0, 100) / 100);
  return `#${[r, g, b].map((channel) => clamp(channel, 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * Which step of the scale a colour already sits on.
 *
 * Nearest by lightness, because lightness is what the scale is made of. A tie
 * goes to the lighter step — an arbitrary choice, but a *fixed* one, and a rule
 * that is written down beats a rule that depends on which way the array was
 * walked. Ties are rare and the two candidates are equally far away, so the
 * question is only ever "which of two", never "which is right".
 */
export function nearestStep(lightness) {
  let best = null;
  for (const row of rampScale()) {
    const distance = Math.abs(row.lightness - lightness);
    if (best === null || distance < best.distance) best = { step: row.step, distance };
  }
  return best?.step ?? null;
}

/**
 * The nine rows of a ramp derived from one token, or null when the token's value
 * is not a colour Phyllum can read.
 *
 * Hold the hue, place lightness on the fixed scale, scale the token's own
 * saturation by the step's multiplier — so a muted input stays muted — and put
 * the original value back at its nearest step untouched.
 */
export function deriveRamp(base, value) {
  const hsl = toHsl(value);
  if (!hsl) return null;
  const home = nearestStep(hsl.l);
  return rampScale().map((row) => ({
    step: row.step,
    token: stepName(base, row.step),
    // The base row is the value as the user wrote it — same case, same notation.
    // Deriving it back would "correct" a value, which Phyllum never does.
    value: row.step === home ? String(value) : hslToHex(hsl.h, hsl.s * row.saturation, row.lightness),
    base: row.step === home,
  }));
}

/** The neutral ramp: nine shipped constants, exactly as `refs/nomenclature.md` ships them. */
export function neutralRampRows() {
  return neutralRamp().map((row) => ({ step: row.step, token: row.token, value: row.value, base: false }));
}

/** The base name the neutral ramp's steps are built on, read from the shipped table. */
export function neutralBase() {
  const [first] = neutralRamp();
  return first ? String(first.token).replace(/\d+$/, '') : 'neutral-';
}

/** Every token name the file already uses, anywhere in its token tables. */
function takenNames(model) {
  const names = new Set();
  for (const key of ['colours', 'numbers', 'typography', 'primitives']) {
    for (const row of model?.tokens?.[key] ?? []) if (row?.[0]) names.add(String(row[0]));
  }
  return names;
}

/**
 * The colour tokens a ramp could be built from — the semantic rows of the
 * Colours table, in the order the file lists them.
 *
 * A row whose value is not a colour Phyllum reads (`var(--brand)`, a gradient, a
 * word) is kept in the list and marked unreadable rather than dropped: the
 * honest answer is to say why no ramp was offered, not to quietly offer fewer.
 */
export function colourTokens(model) {
  return (model?.tokens?.colours ?? [])
    .filter((row) => row?.[0])
    .map((row) => ({ token: String(row[0]), value: String(row[1] ?? ''), readable: toHsl(row[1]) !== null }));
}

/**
 * What `create primitives` has to offer this system, in the order it offers it.
 *
 * One entry per colour token, then the neutral ramp. Each entry knows which of
 * its nine steps the file already has, which is the whole of the rerun
 * guarantee: a ramp that is all there is reported present and proposed again
 * never; a ramp that is half there offers the missing half only.
 */
export function primitiveOffers(model) {
  const taken = takenNames(model);
  const offers = [];

  const offerFor = (kind, base, value, rows) => {
    if (!rows) return { kind, base, value, readable: false, rows: [], missing: [], present: [], status: 'unreadable' };
    const present = rows.filter((row) => taken.has(row.token));
    const missing = rows.filter((row) => !taken.has(row.token));
    return {
      kind,
      base,
      value,
      readable: true,
      rows,
      present,
      missing,
      status: missing.length === 0 ? 'complete' : present.length === 0 ? 'new' : 'partial',
    };
  };

  for (const token of colourTokens(model)) {
    offers.push(offerFor('token', token.token, token.value, token.readable ? deriveRamp(token.token, token.value) : null));
  }
  offers.push(offerFor('neutral', neutralBase().replace(/-$/, ''), null, neutralRampRows()));
  return offers;
}

/** The yes/no a token gets before anything is proposed for it. */
export function questionFor(offer) {
  const what =
    offer.kind === 'neutral'
      ? `the neutral ramp (${offer.rows[0].token}…${offer.rows[offer.rows.length - 1].token}, nine shipped constants)`
      : `a primitive ramp for \`${offer.base}\` (${offer.value})`;
  if (offer.status === 'partial') {
    return `${offer.base} is missing ${offer.missing.length} of its ${offer.rows.length} steps — generate ${offer.missing.length === 1 ? 'it' : 'them'}?`;
  }
  return `Generate ${what}?`;
}

export const isYes = (answer) =>
  answer === true || /^(y|yes)$/i.test(String(answer ?? '').trim());

/**
 * The offers there is anything to ask about.
 *
 * A ramp that is already complete is reported, not offered — asking again about
 * a decision the file already records is how a rerunnable command becomes a
 * nagging one. A value no colour reader can read has nothing to derive from, so
 * it is named as skipped rather than guessed at.
 */
export const askable = (offers) =>
  offers.filter((offer) => offer.status !== 'complete' && offer.status !== 'unreadable');

/**
 * Walk the offers with the answers already known — the same loop the command
 * runs, with the I/O left out.
 *
 * The order is the contract: for each offer, ask, *then* decide, and only then
 * propose. A "no" leaves the loop with nothing recorded for that token, which is
 * why `proposed` can never contain a base whose answer was not yes.
 */
export function walkPrimitives(model, answers = {}, options = {}) {
  // The caller may pass the offers it already computed and showed. They are a
  // pure function of the model, so recomputing them would give the same nine
  // values — but not the same objects, and an edited step lives in an object.
  const offers = options.offers ?? primitiveOffers(model);
  const questions = [];
  const asked = [];
  const proposed = [];
  const declined = [];
  const present = [];
  const unreadable = [];

  for (const offer of offers) {
    if (offer.status === 'unreadable') unreadable.push(offer);
    if (offer.status === 'complete') present.push(offer);
  }

  for (const offer of askable(offers)) {
    questions.push(questionFor(offer));
    asked.push(offer.base);
    const answer = Array.isArray(answers) ? answers[questions.length - 1] : answers[offer.base];
    if (!isYes(answer)) {
      declined.push(offer);
      continue;
    }
    proposed.push(offer);
  }

  return { offers, questions, asked, proposed, declined, present, unreadable };
}

/**
 * Add accepted ramp rows to the model's Primitives subsection.
 *
 * Rows only, in step order, in the Colours column shape — and never a second
 * copy of a step the file already has, which is what makes a rerun a no-op
 * rather than a duplicate.
 */
export function addPrimitives(model, rows) {
  model.tokens.primitives = model.tokens.primitives ?? [];
  const taken = takenNames(model);
  const written = [];
  for (const row of rows) {
    if (taken.has(row.token)) continue;
    model.tokens.primitives.push([row.token, row.value]);
    taken.add(row.token);
    written.push(row);
  }
  return written;
}
