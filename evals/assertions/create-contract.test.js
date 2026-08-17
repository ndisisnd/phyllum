/**
 * Assertions for the archetype contracts and the follow-up loop
 * (plan §3.1.1, §3.2, §8.5).
 *
 * These are table-driven over `skill/refs/create/`: the same table the skill
 * reads is the table the CLI computes gaps from and the table these checks
 * assert against. Adding an archetype there adds a case here automatically —
 * there is nowhere else for a contract to be written down.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  readContractText,
  CUSTOM_ARCHETYPE,
  archetypes,
  candidateSignals,
  contractFor,
  defaultFor,
  isCustomArchetype,
  propertiesForSlot,
  slotForProperty,
  traceRules,
  vocabulary,
} from '../../lib/archetypes.js';
import {
  answerGap,
  extractDraft,
  gapsFor,
  gatherEvidence,
  newDraft,
  skipSlot,
  suggestionsFor,
  tokenNamesOf,
} from '../../lib/create.js';
import { parse } from '../../lib/design-system.js';
import { FIXTURES, POPULATED_FIXTURE, readFixture, withTempDir } from './helpers.js';
import path from 'node:path';

const FOCUS_RING_FIXTURE = path.join(FIXTURES, 'design-system', 'buttons-with-focus-ring.md');
const NO_FOCUS_RING_FIXTURE = path.join(FIXTURES, 'design-system', 'buttons-without-focus-ring.md');
const EMPTY_FIXTURE = path.join(FIXTURES, 'design-system', 'empty.md');

const draftFor = (archetypeKey) => {
  const draft = newDraft({ input: `a ${archetypeKey}` });
  draft.archetype = archetypeKey;
  draft.archetypeName = contractFor(archetypeKey).name;
  draft.name = `${contractFor(archetypeKey).name}/Default`;
  return draft;
};

test('the contract table in refs/create/ covers the plan §3.1.1 archetypes', () => {
  const names = archetypes().map((archetype) => archetype.name);
  for (const required of ['Button', 'Input', 'Card', 'Badge', 'Modal']) {
    assert.ok(names.includes(required), `refs/create/ has no ${required} contract`);
  }
});

test('the ten v0.3.0 joiners are in the table, each with a contract of its own', () => {
  const names = archetypes().map((archetype) => archetype.name);
  const joiners = [
    'Toggle',
    'Checkbox',
    'Radio',
    'Select',
    'Tooltip',
    'Toast',
    'Tabs',
    'Link',
    'Avatar',
    'Progress',
  ];
  for (const joiner of joiners) {
    assert.ok(names.includes(joiner), `refs/create/ has no ${joiner} contract (v0.3.0 §6.6)`);
    const contract = contractFor(joiner.toLowerCase());
    assert.ok(contract.slots.length > 0, `${joiner} demands nothing, which is not a contract`);
  }

  // Link is deliberately the smallest contract in the set (§6.6).
  const link = contractFor('link');
  for (const contract of archetypes()) {
    assert.ok(
      contract.slots.length >= link.slots.length,
      `${contract.name} is smaller than Link, which the plan calls the smallest`,
    );
  }
});

test('every contract is well-formed: slots the vocabulary knows, states it does not', () => {
  const properties = new Set(vocabulary().map((row) => row.property));
  for (const archetype of archetypes()) {
    assert.equal(archetype.key, archetype.name.toLowerCase());
    for (const slot of archetype.slots) {
      assert.ok(
        propertiesForSlot(slot).length > 0,
        `${archetype.name}: no property key in the vocabulary can fill ${slot}`,
      );
    }
    for (const state of archetype.states) {
      assert.ok(
        !properties.has(state),
        `${archetype.name}: ${state} is both a state and a property, which makes it ambiguous`,
      );
    }
    assert.equal(
      new Set(archetype.slots).size,
      archetype.slots.length,
      `${archetype.name} lists a slot twice`,
    );
  }
});

test('no word resolves to two archetypes, so an alias is never ambiguous', () => {
  const seen = new Map();
  for (const archetype of archetypes()) {
    for (const word of new Set([archetype.key, ...archetype.aliases])) {
      assert.ok(!seen.has(word), `"${word}" names both ${seen.get(word)} and ${archetype.name}`);
      seen.set(word, archetype.name);
      assert.equal(contractFor(word).name, archetype.name, `"${word}" resolves elsewhere`);
    }
  }
});

test('`custom` is reserved: no archetype claims it, and it resolves to no contract', () => {
  assert.equal(CUSTOM_ARCHETYPE, 'custom');
  assert.equal(contractFor(CUSTOM_ARCHETYPE), null, 'a custom must have no contract at all');
  assert.ok(isCustomArchetype('Custom'));
  assert.ok(!isCustomArchetype('button'));
  for (const archetype of archetypes()) {
    assert.ok(
      ![archetype.key, ...archetype.aliases].includes(CUSTOM_ARCHETYPE),
      `${archetype.name} claims the reserved word "custom"`,
    );
  }
});

test('a primary button must define the slots the plan names', () => {
  const button = contractFor('button');
  for (const slot of ['background', 'border-colour', 'radius', 'typography']) {
    assert.ok(button.slots.includes(slot), `Button contract is missing ${slot}`);
  }
  for (const state of ['hover', 'disabled']) {
    assert.ok(button.states.includes(state), `Button contract is missing the ${state} state`);
  }
});

test('for every archetype, an empty draft has the whole contract as its gap list', () => {
  for (const archetype of archetypes()) {
    const gaps = gapsFor(draftFor(archetype.key));
    assert.deepEqual(
      gaps.map((gap) => gap.slot),
      [...archetype.slots, ...archetype.states],
      `${archetype.name}: the gap list should be the contract, in table order`,
    );
  }
});

test('for every archetype, the gap list is the contract minus what is filled', () => {
  for (const archetype of archetypes()) {
    for (const slot of archetype.slots) {
      const draft = draftFor(archetype.key);
      const [property] = propertiesForSlot(slot);
      answerGap(draft, { kind: 'contract', slot, property: property ?? slot }, 'anything');

      const gaps = gapsFor(draft).map((gap) => gap.slot);
      assert.ok(!gaps.includes(slot), `${archetype.name}: ${slot} was filled but still asked about`);
      assert.deepEqual(
        gaps,
        [...archetype.slots.filter((other) => other !== slot), ...archetype.states],
        `${archetype.name}: filling ${slot} should remove exactly that slot`,
      );
    }
  }
});

test('a skipped slot leaves the gap list, because a TODO is an answer', () => {
  for (const archetype of archetypes()) {
    const draft = draftFor(archetype.key);
    const [slot] = archetype.slots;
    skipSlot(draft, slot);
    assert.ok(!gapsFor(draft).some((gap) => gap.slot === slot));
  }
});

test('a mandatory state counts as covered only once it says something', () => {
  const draft = draftFor('button');
  assert.ok(gapsFor(draft).some((gap) => gap.kind === 'state' && gap.slot === 'hover'));
  answerGap(draft, { kind: 'state', slot: 'hover', state: 'hover' }, 'background 10% darker');
  assert.ok(!gapsFor(draft).some((gap) => gap.slot === 'hover'));
});

test('every property in the vocabulary maps to a slot some contract asks for', () => {
  const known = new Set(archetypes().flatMap((archetype) => archetype.slots));
  // `gap` and `focus-ring` are extrapolation-only slots: no contract demands
  // them, and that is exactly why they can be extrapolated.
  const extras = new Set(['gap', 'focus-ring']);
  for (const row of vocabulary()) {
    assert.ok(
      known.has(row.slot) || extras.has(row.slot),
      `${row.property} maps to ${row.slot}, which no contract mentions`,
    );
    assert.equal(slotForProperty(row.property), row.slot);
  }
});

test('every mandatory slot has a labelled default to fall back on', () => {
  for (const archetype of archetypes()) {
    for (const slot of [...archetype.slots, ...archetype.states]) {
      assert.ok(
        defaultFor(archetype.key, slot),
        `no labelled default for ${archetype.name}.${slot} in refs/create/`,
      );
    }
  }
});

test('the contract tables are read from refs/create/, not from the code', () => {
  const text = readContractText();
  for (const marker of ['<!-- phyllum:contracts -->', '<!-- phyllum:vocabulary -->', '<!-- phyllum:defaults -->']) {
    assert.ok(text.includes(marker), `refs/create/ lost its ${marker} marker`);
  }
});

test('suggestions lead with a token the system already has', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  const draft = extractDraft('button primary', { tokenNames: tokenNamesOf(model) });
  const gap = gapsFor(draft, { model }).find((candidate) => candidate.slot === 'radius');

  const evidence = [
    { slot: 'radius', property: 'border-radius', value: '12px', file: 'src/styles.css', count: 14 },
  ];
  const suggestions = suggestionsFor(gap, { model, evidence, archetype: 'button' });

  assert.equal(suggestions[0].source, 'token');
  assert.equal(suggestions[0].token, 'rounded-md');
  assert.ok(suggestions[0].text.includes('rounded-md'));
});

test('suggestions fall through tokens, then codebase evidence, then a labelled guess', () => {
  const model = parse(readFixture(EMPTY_FIXTURE));
  const draft = extractDraft('button primary', { tokenNames: [] });
  const gap = gapsFor(draft, { model }).find((candidate) => candidate.slot === 'radius');
  const evidence = [
    { slot: 'radius', property: 'border-radius', value: '12px', file: 'src/styles.css', count: 14 },
  ];
  const suggestions = suggestionsFor(gap, { model, evidence, archetype: 'button' });

  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.source),
    ['codebase', 'default'],
    'with no tokens yet, the codebase leads and the guess trails',
  );
  assert.ok(/guess/i.test(suggestions.at(-1).text), 'a default must say it is a guess');
});

test('extrapolation proposes a slot every prior component of the kind defines', () => {
  const model = parse(readFixture(FOCUS_RING_FIXTURE));
  const draft = extractDraft('button danger with 12px padding', { tokenNames: tokenNamesOf(model) });
  const gaps = gapsFor(draft, { model });
  const focusRing = gaps.find((gap) => gap.slot === 'focus-ring');
  assert.ok(focusRing, 'all three buttons define focus-ring, so the fourth should be asked');
  assert.equal(focusRing.kind, 'extrapolated');
});

test('extrapolation stays quiet when the precedent is not unanimous', () => {
  for (const fixture of [NO_FOCUS_RING_FIXTURE, EMPTY_FIXTURE]) {
    const model = parse(readFixture(fixture));
    const draft = extractDraft('button danger with 12px padding', { tokenNames: tokenNamesOf(model) });
    assert.ok(!gapsFor(draft, { model }).some((gap) => gap.slot === 'focus-ring'));
  }
});

test('an extrapolated slot is a suggestion, so it can be skipped like any other', () => {
  const model = parse(readFixture(FOCUS_RING_FIXTURE));
  const draft = extractDraft('button danger with 12px padding', { tokenNames: tokenNamesOf(model) });
  skipSlot(draft, 'focus-ring');
  assert.ok(!gapsFor(draft, { model }).some((gap) => gap.slot === 'focus-ring'));
});

test('the value every prior button agrees on leads that slot', () => {
  const model = parse(readFixture(FOCUS_RING_FIXTURE));
  const draft = extractDraft('button danger', { tokenNames: tokenNamesOf(model) });
  const gap = gapsFor(draft, { model }).find((candidate) => candidate.slot === 'focus-ring');
  const [first] = suggestionsFor(gap, { model, evidence: [], archetype: 'button' });
  assert.equal(first.token, 'color-focus');
});

test('gathering codebase evidence reads files and writes none', async () => {
  await withTempDir(async (dir) => {
    fs.cpSync(path.join(FIXTURES, 'codebases', 'react-css'), dir, { recursive: true });
    const before = fs.readdirSync(dir).sort();
    const evidence = gatherEvidence(dir);

    const radius = evidence.find((item) => item.slot === 'radius');
    assert.ok(radius, 'the fixture stylesheet has border-radius in it');
    assert.equal(radius.file.endsWith('styles.css'), true);
    assert.deepEqual(fs.readdirSync(dir).sort(), before, 'evidence gathering is read-only');
  });
});

// ---------------------------------------------------------------------------
// The M5 tables: what an image may be asked to measure, and what a repeated
// pattern has to look like to be a candidate (plan §3.1 Modes B and C)
// ---------------------------------------------------------------------------

test('every measurable property is a property the vocabulary already knows', () => {
  const known = new Set(vocabulary().map((row) => row.property));
  for (const rule of traceRules()) {
    assert.ok(known.has(rule.property), `${rule.property} is measurable but has no slot`);
    assert.equal(rule.slot, slotForProperty(rule.property));
    assert.ok(
      rule.minConfidence > 0 && rule.minConfidence <= 1,
      `${rule.property} has no usable confidence bar`,
    );
    assert.ok(rule.tolerance.length > 0, `${rule.property} states no tolerance`);
  }
});

test('a still image is never asked about a state', () => {
  const measurable = new Set(traceRules().map((rule) => rule.property));
  for (const archetype of archetypes()) {
    for (const state of archetype.states) {
      assert.ok(!measurable.has(state), `${state} is a state and cannot be measured`);
    }
  }
});

test('every candidate signal resolves to an archetype the contract table has', () => {
  for (const row of candidateSignals()) {
    assert.ok(['element', 'class', 'component'].includes(row.signal), `unknown signal ${row.signal}`);
    assert.ok(row.matches.length > 0, `${row.signal} row matches nothing`);
    assert.ok(row.minimum >= 2, 'one sighting is never a pattern');
    if (row.archetype) {
      assert.ok(contractFor(row.archetype), `${row.archetype} is not an archetype`);
      continue;
    }
    // A row with no archetype resolves the matched word through the aliases.
    for (const word of row.matches) {
      assert.ok(contractFor(word), `${word} resolves to no archetype`);
    }
  }
});

test('the tables are read from the file, not restated in code', () => {
  const text = readContractText();
  for (const marker of ['<!-- phyllum:trace -->', '<!-- phyllum:candidates -->']) {
    assert.ok(text.includes(marker), `refs/create/ is missing ${marker}`);
  }
});
