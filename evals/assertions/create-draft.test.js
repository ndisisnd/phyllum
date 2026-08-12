/**
 * Assertions for the draft spec — the data model behind `create` (plan §3.1).
 *
 * These cover the mechanical half of prose mode: what a sentence turns into,
 * what it does not turn into, and the invariant that a value can only enter a
 * draft with an origin.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addProperty,
  answerGap,
  extractDraft,
  filledSlots,
  newDraft,
  parseSpecBlock,
  renderSpecBlock,
  resolveTokens,
  seedFromExisting,
  skipSlot,
  tokenNamesOf,
} from '../../lib/create.js';
import { parse } from '../../lib/design-system.js';
import { POPULATED_FIXTURE, readFixture } from './helpers.js';

const propertiesOf = (draft) =>
  Object.fromEntries(draft.properties.map((property) => [property.key, property.value]));

test('the canonical prose example parses into the spec the plan describes', () => {
  const draft = extractDraft('button primary with 12px padding-top and 8px padding-bottom');
  assert.equal(draft.name, 'Button/Primary');
  assert.equal(draft.archetype, 'button');
  assert.deepEqual(propertiesOf(draft), { 'padding-top': '12px', 'padding-bottom': '8px' });
  assert.ok(draft.properties.every((property) => property.origin === 'prose'));
});

test('a property phrase keeps its value whichever side of it the value sits', () => {
  const before = extractDraft('button with 12px padding-top');
  const after = extractDraft('button with padding-top: 12px');
  assert.deepEqual(propertiesOf(before), { 'padding-top': '12px' });
  assert.deepEqual(propertiesOf(after), { 'padding-top': '12px' });
});

test('a property key is mapped to the contract slot it fills', () => {
  const draft = extractDraft('button primary with 12px padding-top');
  assert.deepEqual([...filledSlots(draft)], ['padding']);
});

test('a state word scopes the values in its clause', () => {
  const draft = extractDraft('button primary with a #2563EB background and a #1D4ED8 background on hover');
  assert.deepEqual(propertiesOf(draft), { background: '#2563EB' });
  assert.deepEqual(draft.states.map((state) => state.name), ['hover']);
  assert.deepEqual(draft.states[0].properties[0].value, '#1D4ED8');
});

test('values are free: four radii, a gradient and an odd number all survive verbatim', () => {
  const radii = extractDraft(
    'primary button with 4px top-left radius, 8px top-right radius, 12px bottom-right radius and 16px bottom-left radius',
  );
  assert.deepEqual(propertiesOf(radii), {
    'radius-top-left': '4px',
    'radius-top-right': '8px',
    'radius-bottom-right': '12px',
    'radius-bottom-left': '16px',
  });

  const gradient = extractDraft('a card with a linear-gradient(#fff, #eee) background');
  assert.deepEqual(propertiesOf(gradient), { background: 'linear-gradient(#fff, #eee)' });

  const odd = extractDraft('badge with 3px font size and 1234px radius');
  assert.deepEqual(propertiesOf(odd), { 'font-size': '3px', radius: '1234px' });

  const lower = extractDraft('button primary with a #2563eb background');
  assert.equal(propertiesOf(lower).background, '#2563eb', 'case is part of the value');
});

test('anti-fabrication: every value in a draft appears in the sentence', () => {
  for (const prose of [
    'button primary',
    'a card with 16px padding',
    'a modal',
    'input field with 6px corner radius',
  ]) {
    const draft = extractDraft(prose);
    for (const property of draft.properties) {
      assert.ok(
        prose.toLowerCase().includes(String(property.value).toLowerCase()),
        `"${property.value}" is in the draft for "${prose}" but not in the sentence`,
      );
    }
  }
});

test('a bare archetype fills nothing at all', () => {
  const draft = extractDraft('button primary');
  assert.deepEqual(draft.properties, []);
  assert.deepEqual(draft.states, []);
  assert.deepEqual(draft.skipped, []);
});

test('an unrecognised archetype is a question, not a guess', () => {
  const draft = extractDraft('help');
  assert.equal(draft.unknownArchetype, true);
  assert.equal(draft.archetype, null);
  assert.deepEqual(draft.properties, []);
});

test('a value with nothing to attach to is recorded as unattached', () => {
  const draft = extractDraft('button primary #2563EB');
  assert.deepEqual(draft.properties, []);
  assert.deepEqual(draft.unattached, ['#2563EB']);
});

test('a name can be given outright, and otherwise comes from the variant', () => {
  assert.equal(extractDraft('input field named SearchBox').name, 'SearchBox');
  assert.equal(extractDraft('a card').name, 'Card/Default');
  assert.equal(extractDraft('ghost button').name, 'Button/Ghost');
});

test('an alias names the same archetype as its canonical word', () => {
  assert.equal(extractDraft('a cta with 8px radius').archetype, 'button');
  assert.equal(extractDraft('a dialog with 8px radius').archetype, 'modal');
});

test('a token the user names in the sentence is recorded as that token', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  const draft = extractDraft('button primary with the rounded-md radius', {
    tokenNames: tokenNamesOf(model),
  });
  assert.equal(draft.properties[0].value, 'rounded-md');
  assert.equal(draft.properties[0].token, 'rounded-md');
  assert.ok(!renderSpecBlock(draft, { model }).includes('TODO: tokenise'));
});

test('a raw value that a token already names converges on the token', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  const draft = resolveTokens(extractDraft('button primary with a #2563EB background'), model);
  assert.equal(draft.properties[0].value, 'color-primary');
});

test('a token for a different kind of number is never substituted in', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  // rounded-md is 12px and is about corner radius; a 12px padding is a
  // different fact that happens to share a number.
  const draft = resolveTokens(extractDraft('button primary with 12px padding-top'), model);
  assert.equal(draft.properties[0].value, '12px');
});

test('a skipped slot becomes a TODO in the spec block, and answering clears it', () => {
  const draft = extractDraft('button primary');
  skipSlot(draft, 'border-colour');
  assert.ok(renderSpecBlock(draft).includes('border-colour: TODO'));

  answerGap(draft, { kind: 'contract', slot: 'border-colour', property: 'border-colour' }, '#111111');
  const spec = renderSpecBlock(draft);
  assert.ok(!spec.includes('border-colour: TODO'));
  assert.ok(spec.includes('border-colour: #111111 # TODO: tokenise'));
});

test('an answered state is recorded in the state, not as a property', () => {
  const draft = extractDraft('button primary');
  answerGap(draft, { kind: 'state', slot: 'hover', state: 'hover' }, 'background 10% darker');
  assert.deepEqual(draft.properties, []);
  assert.ok(renderSpecBlock(draft).includes('hover: background 10% darker'));
});

test('the spec block Phyllum writes is the spec block Phyllum reads back', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  const draft = extractDraft('button primary with 12px padding-top', {
    tokenNames: tokenNamesOf(model),
  });
  answerGap(draft, { kind: 'contract', slot: 'radius', property: 'radius' }, { token: 'rounded-md' });
  skipSlot(draft, 'border-colour');
  answerGap(draft, { kind: 'state', slot: 'hover', state: 'hover' }, 'darker background');

  const parsed = parseSpecBlock(renderSpecBlock(draft, { model }));
  assert.equal(parsed.name, 'Button/Primary');
  assert.equal(parsed.archetype, 'button');
  assert.equal(parsed.properties['padding-top'], '12px');
  assert.equal(parsed.properties.radius, 'rounded-md');
  assert.equal(parsed.properties['border-colour'], 'TODO');
  assert.equal(parsed.states.hover, 'darker background');
});

test('a colour value survives the comment stripper when a spec is read back', () => {
  const parsed = parseSpecBlock(
    ['name: Button/Primary', 'archetype: button', 'properties:', '  background: #2563EB # TODO: tokenise'].join('\n'),
  );
  assert.equal(parsed.properties.background, '#2563EB');
});

test('re-creating a name carries the accepted spec forward, and the new words win', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  const draft = extractDraft('button primary with 20px padding-top', {
    tokenNames: tokenNamesOf(model),
  });
  const { revision } = seedFromExisting(draft, model);
  assert.equal(revision, true);

  const properties = propertiesOf(draft);
  assert.equal(properties['padding-top'], '20px', 'the new description wins');
  assert.equal(properties['padding-bottom'], '8px', 'the rest is carried over');
  assert.equal(properties.background, 'color-primary');
  assert.ok(draft.skipped.includes('state:disabled'), 'a skipped slot stays skipped');
});

test('a draft with no archetype has nothing to carry forward', () => {
  const draft = newDraft({ input: 'nothing' });
  addProperty(draft, { key: 'radius', value: '4px', origin: 'answer' });
  assert.equal(draft.properties.length, 1);
  assert.equal(draft.properties[0].slot, 'radius');
});
