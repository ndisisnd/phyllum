/**
 * Assertions for custom components — `create` without a contract
 * (v0.3.0 plan §6.7, §8).
 *
 * Custom mode removes exactly one thing: the archetype contract. Everything the
 * rest of Phyllum rests on stays, and these checks are mostly about *that* — the
 * marker on the page, the unchanged file shape, the acceptance gate, the rerun.
 *
 * Three claims are the ones worth breaking a build over:
 *
 *   It records only what was said. No mandatory slot, no gap list, and no slot
 *   invented because a component of some kind "usually" has one.
 *
 *   It says so on the page. A custom carries `archetype: custom` and
 *   `custom: true`, so nothing downstream has to infer "no contract" from an
 *   absence — and nothing grades it against rules it never claimed.
 *
 *   It is an escape hatch, not a default. Custom is the last row of the picker,
 *   prose that matches an archetype never lands in it, and prose that matches
 *   nothing is *offered* it rather than dropped into it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { CUSTOM_ARCHETYPE, contractFor } from '../../lib/archetypes.js';
import { assess } from '../../lib/assess.js';
import { pickList, renderPicker, resolvePick, seedFromPick } from '../../lib/candidates.js';
import { runCreate } from '../../lib/create-command.js';
import {
  componentsOfArchetype,
  extractDraft,
  gapsFor,
  isCustom,
  newCustomDraft,
  parseSpecBlock,
  renderSpecBlock,
  seedFromExisting,
} from '../../lib/create.js';
import { parse, validateStructure } from '../../lib/design-system.js';
import { adoptionMatch, readComponent } from '../../lib/prd.js';
import { readDraft } from '../../lib/state.js';
import {
  FIXTURES,
  POPULATED_FIXTURE,
  copyDir,
  diffSnapshots,
  readFixture,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const tokens = (line, quoted = true) => [{ value: line, quoted }];
const read = (dir) => fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');

async function withProject(body, fixture = POPULATED_FIXTURE) {
  return withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(fixture));
    return body(dir);
  });
}

/** A ctx that answers the custom loop with the lines given, in order. */
function scripted(answers) {
  const queue = [...answers];
  return async () => (queue.length > 0 ? queue.shift() : 'done');
}

// ---------------------------------------------------------------------------
// No contract: no slots, no states, no gap list
// ---------------------------------------------------------------------------

test('a custom has no contract to be held to', () => {
  assert.equal(contractFor(CUSTOM_ARCHETYPE), null);
  const draft = newCustomDraft({ name: 'Hero/Landing' });
  assert.ok(isCustom(draft));
  assert.deepEqual(gapsFor(draft), [], 'no mandatory slots and no mandatory states');
  assert.deepEqual(draft.properties, [], 'and nothing seeded into it either');
});

test('a custom records exactly what was said, and never a slot that was not', () => {
  const draft = extractDraft('a hero block with a #2563EB background and 48px padding', {
    custom: true,
    name: 'Hero/Landing',
  });

  assert.equal(draft.archetype, CUSTOM_ARCHETYPE);
  assert.equal(draft.name, 'Hero/Landing');
  assert.deepEqual(
    draft.properties.map((property) => [property.key, property.value]),
    [
      ['background', '#2563EB'],
      ['padding', '48px'],
    ],
  );
  assert.deepEqual(gapsFor(draft), [], 'a custom is never asked for anything else');
  assert.deepEqual(draft.states, []);
});

test('a value with nothing to attach to is a question in custom mode too', () => {
  const draft = extractDraft('a hero block #2563EB', { custom: true, name: 'Hero/Landing' });
  assert.deepEqual(draft.properties, [], 'nothing is guessed at');
  assert.deepEqual(draft.unattached, ['#2563EB']);
});

// ---------------------------------------------------------------------------
// The marker, and who reads it
// ---------------------------------------------------------------------------

test('the spec block records the no-archetype status, and reads back', () => {
  const draft = extractDraft('a hero block with a #2563EB background', {
    custom: true,
    name: 'Hero/Landing',
  });
  const block = renderSpecBlock(draft);

  assert.match(block, /^archetype: custom$/m);
  assert.match(block, /^custom: true$/m);

  const spec = parseSpecBlock(block);
  assert.equal(spec.custom, true);
  assert.equal(spec.archetype, CUSTOM_ARCHETYPE);
  assert.equal(spec.properties.background, '#2563EB');
  assert.ok(isCustom(spec));
});

test('an ordinary component carries no marker, so the marker means something', () => {
  const draft = extractDraft('button primary with 12px padding-top');
  const block = renderSpecBlock(draft);
  assert.ok(!/custom/.test(block));
  assert.equal(parseSpecBlock(block).custom, false);
  assert.ok(!isCustom(parseSpecBlock(block)));
});

test('a custom is nobody’s precedent: extrapolation never reads one', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  model.components.push({
    name: 'Hero/Landing',
    blocks: [
      {
        lang: 'yaml',
        content: 'name: Hero/Landing\narchetype: custom\ncustom: true\nproperties:\n  background: color-primary\n',
      },
    ],
  });

  for (const archetype of [CUSTOM_ARCHETYPE, 'button', 'card']) {
    assert.ok(
      !componentsOfArchetype(model, archetype).some((spec) => spec.name === 'Hero/Landing'),
      `a custom was read as a prior component of ${archetype}`,
    );
  }
});

test('component matching skips a custom rather than grading it against a contract', () => {
  const recorded = readComponent({
    name: 'Hero/Landing',
    blocks: [
      { lang: 'yaml', content: 'name: Hero/Landing\narchetype: custom\ncustom: true\nproperties:\n  background: color-primary\n' },
    ],
  });
  assert.equal(recorded.custom, true);
  assert.equal(recorded.hasTodo, false);

  // Whatever the markup looks like, a custom claims none of it: the match is an
  // archetype comparison, and a custom has no archetype.
  for (const signature of [
    { element: 'div', classes: ['hero'] },
    { element: 'button', classes: ['btn'] },
    { element: 'Hero', classes: [] },
  ]) {
    assert.equal(adoptionMatch(signature, recorded), false);
  }
});

// ---------------------------------------------------------------------------
// The picker: last, and only ever by asking
// ---------------------------------------------------------------------------

test('custom is the last row of the picker, and resolves by number or by name', async () => {
  await withProject(async (dir) => {
    const picker = pickList(dir, parse(read(dir)));
    const last = picker.choices.length;

    assert.equal(picker.choices.at(-1).kind, 'custom');
    assert.equal(resolvePick(String(last), picker).kind, 'custom');
    assert.equal(resolvePick('custom', picker).kind, 'custom');
    assert.equal(resolvePick('1', picker).kind, 'archetype', 'archetypes still come first');

    const text = renderPicker(picker);
    assert.ok(text.includes('follows no archetype contract'));
    assert.ok(text.indexOf('1. Button') < text.indexOf('. Custom'));
  });
});

test('a custom pick seeds a name and nothing else at all', () => {
  const draft = seedFromPick({ kind: 'custom', archetype: CUSTOM_ARCHETYPE }, { name: 'Hero/Landing' });
  assert.equal(draft.name, 'Hero/Landing');
  assert.equal(draft.archetype, CUSTOM_ARCHETYPE);
  assert.equal(draft.custom, true);
  assert.deepEqual(draft.properties, []);
  assert.deepEqual(gapsFor(draft), []);
});

// ---------------------------------------------------------------------------
// The command flow
// ---------------------------------------------------------------------------

test('prose that matches an archetype never lands in custom', async () => {
  await withProject(async (dir) => {
    const asked = [];
    await runCreate(tokens('button primary with 12px padding-top'), {
      cwd: dir,
      env: {},
      ask: async (question) => {
        asked.push(question);
        return 'skip';
      },
    });

    const draft = readDraft(dir);
    assert.equal(draft.archetype, 'button');
    assert.ok(!draft.custom);
    assert.ok(
      !asked.some((question) => /custom/i.test(question)),
      'a description with an archetype in it is never offered custom',
    );
  });
});

test('prose that matches nothing is offered custom, and a no writes nothing', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out } = await runCreate(tokens('a bespoke chart frame'), {
      cwd: dir,
      env: {},
      ask: async () => 'no',
      confirm: async () => true,
    });

    assert.ok(out.includes('could not tell which kind of component'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});

test('custom mode walks an open loop, records the answers, and writes on acceptance', async () => {
  await withProject(async (dir) => {
    const questions = [];
    const answers = scripted(['Chart/Frame', 'background #0F172A', 'grid-colour', 'skip', 'done']);
    const { out, code } = await runCreate(tokens('a bespoke chart frame'), {
      cwd: dir,
      env: {},
      ask: async (question) => {
        questions.push(question);
        return answers(question);
      },
      confirm: async () => true,
    });

    assert.equal(code, 0);
    assert.ok(
      questions.some((question) => /custom/i.test(question)),
      'the offer is made before anything is recorded',
    );
    assert.ok(out.includes('no mandatory slots and no gap list'));
    assert.ok(out.includes('Wrote Chart/Frame to DESIGN-SYSTEM.md'));

    const model = parse(read(dir));
    const component = model.components.find((entry) => entry.name === 'Chart/Frame');
    assert.ok(component, 'a custom is written as an ordinary component entry');

    const spec = parseSpecBlock(component.blocks.find((block) => block.lang === 'yaml').content);
    assert.equal(spec.custom, true);
    assert.equal(spec.properties['background'], '#0F172A');
    assert.equal(spec.properties['grid-colour'], 'TODO', 'a slot with no value is a TODO, not a guess');

    // The file shape is unchanged: spec block, code blocks, and a Backlog line
    // for the raw value, exactly as any other component would carry.
    assert.deepEqual(
      component.blocks.map((block) => block.lang),
      ['yaml', 'jsx', 'css'],
    );
    assert.equal(validateStructure(read(dir)).valid, true);
    assert.ok(model.backlog.some((line) => line.includes('tokenise `#0F172A` (Chart/Frame')));
  });
});

test('re-creating a custom opens a revision, and it stays a custom', async () => {
  await withProject(async (dir) => {
    const first = scripted(['Chart/Frame', 'background #0F172A', 'done']);
    await runCreate(tokens('a bespoke chart frame'), {
      cwd: dir,
      env: {},
      ask: async (question) => first(question),
      confirm: async () => true,
    });

    const second = scripted(['Chart/Frame', 'radius 4px', 'done']);
    await runCreate(tokens('a bespoke chart frame'), {
      cwd: dir,
      env: {},
      ask: async (question) => second(question),
      confirm: async () => true,
    });

    const model = parse(read(dir));
    const named = model.components.filter((entry) => entry.name === 'Chart/Frame');
    assert.equal(named.length, 1, 'a rerun revises, it never duplicates');

    const spec = parseSpecBlock(named[0].blocks.find((block) => block.lang === 'yaml').content);
    assert.equal(spec.custom, true, 'the marker survives the revision');
    assert.equal(spec.properties.background, '#0F172A', 'and so does what was already accepted');
    assert.equal(spec.properties.radius, '4px');
  });
});

test('an existing custom seeds a custom draft, whatever the new run thinks it is', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  model.components.push({
    name: 'Chart/Frame',
    blocks: [
      {
        lang: 'yaml',
        content: 'name: Chart/Frame\narchetype: custom\ncustom: true\nproperties:\n  background: color-primary\n',
      },
    ],
  });

  const draft = newCustomDraft({ name: 'Chart/Frame' });
  const { revision } = seedFromExisting(draft, model);
  assert.equal(revision, true);
  assert.equal(draft.custom, true);
  assert.equal(draft.archetype, CUSTOM_ARCHETYPE);
  assert.deepEqual(gapsFor(draft, { model }), []);
});

test('assess reads a system holding a custom without grading it against anything', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'repeated-jsx'), dir);
    const answers = scripted(['Chart/Frame', 'background #0F172A', 'done']);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    await runCreate(tokens('a bespoke chart frame'), {
      cwd: dir,
      env: {},
      ask: async (question) => answers(question),
      confirm: async () => true,
    });

    const model = parse(read(dir));
    const before = snapshotContents(dir);
    const result = assess(dir, model);

    // The whole assessment runs, and the read stays a read.
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
    assert.ok(result.summary);

    // A custom is a component like any other to the passes that read names and
    // values — and invisible to the one pass that reads archetypes, because it
    // has none to compare (§6.7).
    assert.ok(
      !result.components.candidates.some((candidate) => candidate.name === 'Chart/Frame'),
      'a recorded custom is never re-proposed as a candidate',
    );
    for (const candidate of result.components.candidates) {
      assert.notEqual(candidate.archetype, CUSTOM_ARCHETYPE, 'nothing is ever detected as custom');
    }
  });
});

test('nothing is written until the custom is accepted', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const answers = scripted(['Chart/Frame', 'background #0F172A', 'done']);
    const { out } = await runCreate(tokens('a bespoke chart frame'), {
      cwd: dir,
      env: {},
      ask: async (question) => answers(question),
      confirm: async () => false,
    });

    assert.ok(out.includes('Not accepted, so nothing was written'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});
