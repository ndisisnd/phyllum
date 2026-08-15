/**
 * Assertions for the nomenclature library (v0.3.0 plan §4, §5.1–5.2, §8).
 *
 * These are table-driven over `skill/refs/nomenclature.md`: the same rows the
 * skill reads, the CLI parses and this suite asserts. Two properties are pinned
 * hardest, because they are the two the plan names outright — well-formedness
 * with slot order enforced and strict words only, and the neutral ramp matching
 * the shipped table exactly.
 *
 * M1 ships data and a reader. Nothing here asserts a behaviour change, because
 * there is none: no command consumes the library yet.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  NOMENCLATURE_FILE,
  composeName,
  isWellFormed,
  neutralRamp,
  neutralRampValue,
  parseNomenclature,
  rampScale,
  rampStep,
  rampSteps,
  readName,
  slotForWord,
  slotNames,
  slotWords,
} from '../../lib/nomenclature.js';

const text = () => fs.readFileSync(NOMENCLATURE_FILE, 'utf8');

// ---------------------------------------------------------------------------
// The tables are the contract
// ---------------------------------------------------------------------------

test('the vocabulary is read from refs/nomenclature.md, not from the code', () => {
  const source = text();
  for (const marker of [
    '<!-- phyllum:name-slots -->',
    '<!-- phyllum:neutral-ramp -->',
    '<!-- phyllum:ramp-scale -->',
  ]) {
    assert.ok(source.includes(marker), `refs/nomenclature.md lost its ${marker} marker`);
  }

  // The parser is a reader, not a second copy: hand it a doctored file and the
  // vocabulary changes with it.
  const doctored = source.replace(
    '`neutral`, `interaction`, `accent`',
    '`neutral`, `interaction`, `flavour`',
  );
  assert.notEqual(doctored, source, 'the family row is where the test thinks it is');
  const parsed = parseNomenclature(doctored);
  const family = parsed.slots.find((row) => row.slot === 'family');
  assert.ok(family.words.includes('flavour'), 'the word list came out of the file');
  assert.ok(!family.words.includes('accent'));
});

test('the four slots are declared in the order a name spells them', () => {
  assert.deepEqual(slotNames(), ['family', 'rank', 'exception', 'state']);
});

test('family and rank are mandatory; exception and state are optional', () => {
  const parsed = parseNomenclature(text());
  const required = Object.fromEntries(parsed.slots.map((row) => [row.slot, row.required]));
  assert.deepEqual(required, { family: true, rank: true, exception: false, state: false });
});

test('the word lists are the plan §4.1 lists, one spelling per word', () => {
  assert.deepEqual(slotWords('family'), [
    'neutral',
    'interaction',
    'accent',
    'surface',
    'success',
    'warning',
    'danger',
    'info',
  ]);
  assert.deepEqual(slotWords('rank'), ['primary', 'secondary', 'tertiary']);
  assert.deepEqual(slotWords('exception'), [
    'lighter',
    'darker',
    'highlight',
    'subtle',
    'bold',
    'inverse',
  ]);
  assert.deepEqual(slotWords('state'), [
    'active',
    'inactive',
    'hover',
    'pressed',
    'focused',
    'selected',
    'disabled',
  ]);

  // The deliberate omissions, and the deliberate spellings. A synonym creeping
  // into a strict list is how a vocabulary stops being one.
  for (const excluded of ['hovered', 'focus', 'visited', 'dragged', 'feedback', 'error']) {
    assert.equal(slotForWord(excluded), null, `\`${excluded}\` should not be in any slot`);
  }
});

test('no word belongs to two slots, so no name is ambiguous', () => {
  const seen = new Set();
  for (const slot of slotNames()) {
    for (const word of slotWords(slot)) {
      assert.ok(!seen.has(word), `\`${word}\` is claimed by two slots`);
      seen.add(word);
    }
  }
  assert.equal(slotForWord('neutral'), 'family');
  assert.equal(slotForWord('bold'), 'exception');
  assert.equal(slotForWord('hover'), 'state');
});

test('a table that claims one word for two slots is refused outright', () => {
  const doctored = text().replace('`primary`, `secondary`, `tertiary`', '`primary`, `bold`');
  assert.throws(() => parseNomenclature(doctored), /claimed by both/);
});

// ---------------------------------------------------------------------------
// Well-formedness — plan §8, "slot order enforced, strict words only"
// ---------------------------------------------------------------------------

test('the plan §4.1 well-formed names are well-formed', () => {
  for (const name of [
    'neutral-primary',
    'interaction-secondary',
    'interaction-primary-hover',
    'danger-primary-bold-pressed',
    'neutral-primary-darker',
    'surface-tertiary-subtle-disabled',
    'info-secondary-inverse',
    'success-primary-selected',
  ]) {
    assert.ok(isWellFormed(name), `${name} should be well-formed`);
  }
});

test('slot order is part of the strictness', () => {
  // The plan's own counter-example, and its neighbours: every one of these is a
  // name made only of known words, in an order the format does not allow.
  for (const name of [
    'hover-neutral',
    'primary-neutral',
    'neutral-hover-primary',
    'neutral-primary-pressed-bold',
    'neutral-bold-primary',
  ]) {
    assert.ok(!isWellFormed(name), `${name} should not be well-formed`);
  }
  assert.match(readName('hover-neutral').reason, /not a family word/);
});

test('only the strict words count, and only in their one spelling', () => {
  for (const name of [
    'brand-primary',
    'neutral-main',
    'neutral-primary-hovered',
    'neutral-primary-focus',
    'neutral-primary-dragged',
    'Neutral-Primary',
  ]) {
    assert.ok(!isWellFormed(name), `${name} should not be well-formed`);
  }
});

test('family and rank are mandatory, and each slot is used at most once', () => {
  assert.ok(!isWellFormed('neutral'), 'a family alone is not a name');
  assert.ok(!isWellFormed('primary'), 'a rank alone is not a name');
  assert.match(readName('neutral').reason, /missing its rank/);
  assert.ok(!isWellFormed('neutral-primary-hover-pressed'), 'one state, not two');
  assert.ok(!isWellFormed('neutral-primary-bold-subtle'), 'one exception, not two');
});

test('a malformed string is refused rather than parsed around', () => {
  for (const name of ['', '   ', '-', 'neutral-', '-primary', 'neutral--primary', ' neutral-primary']) {
    assert.ok(!isWellFormed(name), `${JSON.stringify(name)} should not be well-formed`);
  }
  assert.ok(!isWellFormed(null));
  assert.ok(!isWellFormed(undefined));
});

test('a read name reports which word filled which slot', () => {
  assert.deepEqual(readName('danger-primary-bold-pressed').slots, {
    family: 'danger',
    rank: 'primary',
    exception: 'bold',
    state: 'pressed',
  });
  assert.deepEqual(readName('neutral-primary-hover').slots, {
    family: 'neutral',
    rank: 'primary',
    state: 'hover',
  });
});

test('composing a name and checking one read the same table', () => {
  assert.equal(composeName({ family: 'interaction', rank: 'primary' }), 'interaction-primary');
  assert.equal(
    composeName({ family: 'danger', rank: 'primary', exception: 'bold', state: 'pressed' }),
    'danger-primary-bold-pressed',
  );
  // Slots given out of order still come out in slot order — the table decides.
  assert.equal(
    composeName({ state: 'hover', rank: 'secondary', family: 'accent' }),
    'accent-secondary-hover',
  );
  // And nothing composable is ever unreadable.
  assert.ok(isWellFormed(composeName({ family: 'surface', rank: 'tertiary', state: 'disabled' })));

  assert.equal(composeName({ family: 'neutral' }), null, 'rank is mandatory');
  assert.equal(composeName({ family: 'brand', rank: 'primary' }), null, 'strict words only');
});

// ---------------------------------------------------------------------------
// The neutral ramp — plan §5.1, "equals the shipped table exactly"
// ---------------------------------------------------------------------------

test('the neutral ramp equals the shipped table exactly', () => {
  assert.deepEqual(
    neutralRamp().map((row) => [row.token, row.value]),
    [
      ['neutral-100', '#F5F5F5'],
      ['neutral-200', '#E5E5E5'],
      ['neutral-300', '#D4D4D4'],
      ['neutral-400', '#A3A3A3'],
      ['neutral-500', '#737373'],
      ['neutral-600', '#525252'],
      ['neutral-700', '#404040'],
      ['neutral-800', '#262626'],
      ['neutral-900', '#171717'],
    ],
  );
  assert.equal(neutralRampValue(500), '#737373');
  assert.equal(neutralRampValue(950), null, 'the ramp has nine steps, not ten');
});

test('the neutral ramp is nine pure greys, lightest first, inside white and black', () => {
  const ramp = neutralRamp();
  assert.equal(ramp.length, 9);
  assert.deepEqual(
    ramp.map((row) => row.step),
    [100, 200, 300, 400, 500, 600, 700, 800, 900],
  );

  let previous = 256;
  for (const row of ramp) {
    const [red, green, blue] = channels(row.value);
    assert.equal(red, green, `${row.token} is not a pure grey`);
    assert.equal(green, blue, `${row.token} is not a pure grey`);
    assert.ok(red < previous, `${row.token} is not darker than the step above it`);
    previous = red;
    assert.ok(red < 255 && red > 0, `${row.token} is pure white or pure black`);
  }
});

// ---------------------------------------------------------------------------
// The derivation scale — plan §5.2
// ---------------------------------------------------------------------------

test('the derivation scale is nine steps, on the same rungs as the ramp', () => {
  assert.deepEqual(rampSteps(), [100, 200, 300, 400, 500, 600, 700, 800, 900]);
  assert.deepEqual(
    rampSteps(),
    neutralRamp().map((row) => row.step),
    'a derived ramp and the neutral ramp have to line up rung for rung',
  );
});

test('the lightness scale falls, and the saturation taper is a multiplier', () => {
  let previous = 101;
  for (const row of rampScale()) {
    assert.ok(row.lightness < previous, `step ${row.step} is not darker than the step above it`);
    assert.ok(row.lightness > 0 && row.lightness < 100, `step ${row.step} is pure white or black`);
    previous = row.lightness;
    assert.ok(
      row.saturation > 0 && row.saturation <= 1,
      `step ${row.step}'s saturation is not a multiplier`,
    );
  }
  // Full saturation in the middle, tapered at both ends — the disclosed shape.
  assert.equal(rampStep(500).saturation, 1);
  assert.ok(rampStep(100).saturation < 1, 'the lightest step is a tint');
  assert.ok(rampStep(900).saturation < 1, 'the darkest step is a shade');
});

test('the lightness scale is the neutral ramp own lightness, step for step', () => {
  // Stated in the file and pinned here: a derived `accentRed400` is the same
  // brightness as `neutral-400`, which is the whole reason the scale is not a
  // second set of numbers picked independently.
  for (const row of rampScale()) {
    const [red, green, blue] = channels(neutralRampValue(row.step));
    const lightness = Math.round(((Math.max(red, green, blue) + Math.min(red, green, blue)) / 2 / 255) * 100);
    assert.equal(row.lightness, lightness, `step ${row.step} drifts from the neutral ramp`);
  }
});

function channels(hex) {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
}
