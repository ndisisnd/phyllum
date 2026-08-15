/**
 * Assertions for `create primitives` and the Colours table's new shape
 * (v0.3.0 plan §5, §5.5, §8).
 *
 * This is the deterministic half of the milestone, and it is nearly all of it:
 * `create primitives` has no model in its path, so almost everything about it is
 * a fact rather than a judgement. The facts worth pinning are the ones a user
 * would be hurt by if they stopped being true:
 *
 *   - the same input gives byte-identical ramps, every run
 *   - the value you recorded is the value that lands, at its nearest step
 *   - the neutral ramp is the shipped table, not a computed grey
 *   - nothing is generated for a token you said no to
 *   - a rerun reports what is there rather than writing it twice
 *   - Colours is `token | value`, and primitives live under Colours
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { runCreate, runPrimitives } from '../../lib/create-command.js';
import {
  HEADING_PRIMITIVES,
  TOKEN_SECTIONS,
  parse,
  render,
  validateStructure,
} from '../../lib/design-system.js';
import { neutralRamp, rampScale } from '../../lib/nomenclature.js';
import {
  addPrimitives,
  deriveRamp,
  nearestStep,
  primitiveOffers,
  stepName,
  walkPrimitives,
} from '../../lib/primitives.js';
import { toHsl } from '../../lib/tokenise.js';
import { instantiateTemplate } from '../../lib/template.js';
import { runInit } from '../../lib/init.js';
import { FIXTURES, readFixture, snapshotContents, diffSnapshots, withTempDir } from './helpers.js';

const LEGACY_FIXTURE = path.join(FIXTURES, 'design-system', 'legacy-notes.md');

const template = () => instantiateTemplate({ project: 'p', version: '0.0.0', created: '2026-08-15' });

/** A design system holding the colour tokens named, in order. */
function systemWith(colours = []) {
  const rows = colours.map(([token, value]) => `| ${token} | ${value} |`).join('\n');
  return template().replace('### Colours\n\n| token | value |\n| --- | --- |\n', `### Colours\n\n| token | value |\n| --- | --- |\n${rows}${rows ? '\n' : ''}`);
}

async function withProject(text, body) {
  return withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), text);
    return body(dir);
  });
}

const read = (dir) => fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
const args = (value) => [{ value, quoted: false }];

/** Answer yes to everything, remembering the order the questions came in. */
const recorder = (answer = () => true) => {
  const questions = [];
  return {
    questions,
    confirm: async (question) => {
      questions.push(question);
      return answer(question);
    },
  };
};

// ---------------------------------------------------------------------------
// Derivation (§5.2)
// ---------------------------------------------------------------------------

test('a derived ramp is byte-identical across two runs', () => {
  const first = deriveRamp('accentRed', '#DC2626');
  const second = deriveRamp('accentRed', '#DC2626');
  assert.deepEqual(first, second, 'the same input must give the same nine values, always');
  assert.equal(first.length, 9);
  assert.deepEqual(
    first.map((row) => row.step),
    rampScale().map((row) => row.step),
    'the steps are the scale table, in the scale table’s order',
  );
});

test('the token’s own value is slotted at its nearest step, unchanged', () => {
  for (const value of ['#DC2626', 'rgb(37, 99, 235)', '#2563eb']) {
    const ramp = deriveRamp('brand', value);
    const base = ramp.filter((row) => row.base);
    assert.equal(base.length, 1, `${value}: exactly one step is the value itself`);
    assert.equal(base[0].value, value, `${value}: recorded verbatim — never re-spelled, never corrected`);
    assert.equal(base[0].step, nearestStep(toHsl(value).l), `${value}: and it sits at its nearest step`);
  }
});

test('the nearest step is the nearest by lightness, and every other step comes off the scale', () => {
  // The lightest colour there is belongs at the lightest step, and the darkest
  // at the darkest — the two ends are the cheap proof that the search is real.
  assert.equal(nearestStep(toHsl('#FFFFFF').l), rampScale()[0].step);
  assert.equal(nearestStep(toHsl('#000000').l), rampScale()[rampScale().length - 1].step);

  const ramp = deriveRamp('accentRed', '#DC2626');
  for (const row of ramp) {
    if (row.base) continue;
    const scale = rampScale().find((item) => item.step === row.step);
    const hsl = toHsl(row.value);
    assert.ok(Math.abs(hsl.l - scale.lightness) <= 1, `${row.token}: lightness comes from the scale`);
    assert.ok(Math.abs(hsl.h - toHsl('#DC2626').h) <= 2, `${row.token}: the hue is held`);
  }
});

test('saturation tapers at the extremes, and a muted input stays muted', () => {
  const vivid = deriveRamp('vivid', '#DC2626');
  const muted = deriveRamp('muted', '#8B6F6F');
  const saturationAt = (ramp, step) => toHsl(ramp.find((row) => row.step === step).value).s;
  assert.ok(saturationAt(vivid, 100) < saturationAt(vivid, 400), 'the lightest step is a tint, not the colour');
  assert.ok(saturationAt(vivid, 900) < saturationAt(vivid, 500), 'the darkest step is a shade, not the colour');
  assert.ok(saturationAt(muted, 400) < saturationAt(vivid, 400), 'the multiplier scales the token’s own saturation');
});

test('a value no colour reader can read derives nothing, rather than something plausible', () => {
  assert.equal(deriveRamp('x', 'var(--brand)'), null);
  assert.equal(deriveRamp('x', 'linear-gradient(red, blue)'), null);
  assert.equal(deriveRamp('x', ''), null);
});

// ---------------------------------------------------------------------------
// The neutral ramp (§5.1)
// ---------------------------------------------------------------------------

test('the neutral ramp equals the shipped table exactly', async () => {
  await withProject(systemWith(), async (dir) => {
    const { confirm } = recorder();
    await runCreate(args('primitives'), { cwd: dir, env: {}, confirm });
    const rows = parse(read(dir)).tokens.primitives;
    assert.deepEqual(
      rows,
      neutralRamp().map((row) => [row.token, row.value]),
      'nine shipped constants, in the shipped order, with the shipped names',
    );
  });
});

test('with no colour tokens, the neutral ramp is the whole offer', () => {
  const offers = primitiveOffers(parse(systemWith()));
  assert.equal(offers.length, 1);
  assert.equal(offers[0].kind, 'neutral');
});

// ---------------------------------------------------------------------------
// Naming and placement (§5.3)
// ---------------------------------------------------------------------------

test('a step appends to the base name with no hyphen, whatever the casing', () => {
  assert.equal(stepName('accentRed', 100), 'accentRed100');
  assert.equal(stepName('brand-blue', 900), 'brand-blue900');
  assert.deepEqual(
    deriveRamp('accentRed', '#DC2626').map((row) => row.token),
    [100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => `accentRed${step}`),
  );
});

test('primitives land under the Primitives subsection inside Colours', async () => {
  await withProject(systemWith([['accentRed', '#DC2626']]), async (dir) => {
    const { confirm } = recorder();
    await runCreate(args('primitives'), { cwd: dir, env: {}, confirm });

    const text = read(dir);
    const lines = text.split('\n');
    const colours = lines.indexOf('### Colours');
    const primitives = lines.indexOf(HEADING_PRIMITIVES);
    const numbers = lines.indexOf('### Numbers');
    assert.ok(primitives > colours, 'the subsection sits inside Colours');
    assert.ok(primitives < numbers, 'and above the next section, not in it');
    assert.ok(lines.indexOf('| accentRed | #DC2626 |') < primitives, 'semantic tokens stay readable above it');
    assert.ok(text.includes('| accentRed100 | #F9F0F0 |'), 'the ramp rows are ordinary inline rows');
    assert.ok(validateStructure(text).valid, 'and the file still honours the section contract');
  });
});

test('a file with no primitives has no subsection at all', () => {
  const text = render(parse(systemWith([['accentRed', '#DC2626']])));
  assert.ok(!text.includes(HEADING_PRIMITIVES), 'the heading appears only when there is something under it');
  assert.ok(validateStructure(text).valid);
});

test('parse -> render is a fixed point with primitives in the file', async () => {
  await withProject(systemWith([['accentRed', '#DC2626']]), async (dir) => {
    const { confirm } = recorder();
    await runCreate(args('primitives'), { cwd: dir, env: {}, confirm });
    const text = read(dir);
    assert.equal(render(parse(text)), text, 'the round trip must not move a byte');
  });
});

// ---------------------------------------------------------------------------
// Asked first, always (§5.1) — and the gate (§5.3)
// ---------------------------------------------------------------------------

test('every token is asked about before anything is proposed for it', async () => {
  const system = systemWith([
    ['accentRed', '#DC2626'],
    ['brand-blue', '#2563EB'],
  ]);
  await withProject(system, async (dir) => {
    const asked = [];
    await runCreate(args('primitives'), {
      cwd: dir,
      env: {},
      confirm: async (question) => {
        asked.push(question);
        return false;
      },
    });
    assert.equal(asked.length, 3, 'one question per colour token, plus the neutral ramp');
    assert.match(asked[0], /accentRed/);
    assert.match(asked[1], /brand-blue/);
    assert.match(asked[2], /neutral/);
    assert.ok(!asked.some((question) => question.startsWith('Write')), 'a no never reaches the write gate');
    assert.equal(parse(read(dir)).tokens.primitives.length, 0, 'and a no generates nothing');
  });
});

test('a no for one token generates nothing for it, and does not stop the others', () => {
  const model = parse(
    systemWith([
      ['accentRed', '#DC2626'],
      ['brand-blue', '#2563EB'],
    ]),
  );
  const walk = walkPrimitives(model, { accentRed: true, 'brand-blue': false, neutral: false });
  assert.equal(walk.questions.length, 3);
  assert.deepEqual(
    walk.proposed.map((offer) => offer.base),
    ['accentRed'],
  );
  assert.deepEqual(
    walk.declined.map((offer) => offer.base),
    ['brand-blue', 'neutral'],
  );
});

test('a value Phyllum cannot read is named, not guessed at, and never asked about', () => {
  const model = parse(systemWith([['weird', 'var(--brand)']]));
  const walk = walkPrimitives(model, {});
  assert.deepEqual(
    walk.unreadable.map((offer) => offer.base),
    ['weird'],
  );
  assert.ok(!walk.questions.some((question) => question.includes('weird')));
});

test('nothing is written without the acceptance gate, and the gate is the last question', async () => {
  await withProject(systemWith([['accentRed', '#DC2626']]), async (dir) => {
    const before = snapshotContents(dir);
    const { questions, confirm } = recorder((question) => !question.startsWith('Write'));
    const { code } = await runCreate(args('primitives'), { cwd: dir, env: {}, confirm });
    assert.equal(code, 0);
    assert.match(questions[questions.length - 1], /^Write \d+ primitive rows? to DESIGN-SYSTEM.md\?$/);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, [], 'a refused gate writes nothing');
  });
});

test('with nobody to ask, the questions are shown and no ramp is proposed', async () => {
  await withProject(systemWith([['accentRed', '#DC2626']]), async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await runCreate(args('primitives'), { cwd: dir, env: {} });
    assert.equal(code, 0, 'the mode is mechanical — it needs no model, so it never fails for want of one');
    assert.match(out, /Generate a primitive ramp for `accentRed`/);
    assert.ok(!out.includes('accentRed100'), 'a proposal before its question is exactly what §5.1 forbids');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});

test('the write leaves a .bak and touches no other file', async () => {
  await withProject(systemWith([['accentRed', '#DC2626']]), async (dir) => {
    const before = snapshotContents(dir);
    const { confirm } = recorder();
    await runCreate(args('primitives'), { cwd: dir, env: {}, confirm });
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.changed, ['DESIGN-SYSTEM.md']);
    assert.deepEqual(diff.added, ['DESIGN-SYSTEM.md.bak']);
    assert.deepEqual(diff.removed, []);
  });
});

// ---------------------------------------------------------------------------
// Rerunnable (§5.3)
// ---------------------------------------------------------------------------

test('a second run reports the ramp as present and writes nothing', async () => {
  await withProject(systemWith([['accentRed', '#DC2626']]), async (dir) => {
    const { confirm } = recorder();
    await runCreate(args('primitives'), { cwd: dir, env: {}, confirm });
    const first = read(dir);

    const { questions, confirm: again } = recorder();
    const { out } = await runCreate(args('primitives'), { cwd: dir, env: {}, confirm: again });
    assert.equal(read(dir), first, 'a rerun is byte-identical — no second copy of any step');
    assert.equal(questions.length, 0, 'and asks nothing, because there is nothing to decide');
    assert.match(out, /already in your system/);
  });
});

test('a partial ramp offers only its missing steps', async () => {
  const model = parse(systemWith([['accentRed', '#DC2626']]));
  addPrimitives(model, deriveRamp('accentRed', '#DC2626').slice(0, 4));
  const offer = primitiveOffers(model).find((item) => item.base === 'accentRed');
  assert.equal(offer.status, 'partial');
  assert.equal(offer.present.length, 4);
  assert.deepEqual(
    offer.missing.map((row) => row.step),
    [500, 600, 700, 800, 900],
  );
  const walk = walkPrimitives(model, { accentRed: true, neutral: false });
  assert.match(walk.questions[0], /missing 5 of its 9 steps/);
});

// ---------------------------------------------------------------------------
// Colours slims (§5.5)
// ---------------------------------------------------------------------------

test('Colours is token | value, in the template and in everything rendered from it', () => {
  assert.deepEqual(TOKEN_SECTIONS.find((section) => section.key === 'colours').columns, ['token', 'value']);
  const text = template();
  assert.ok(text.includes('### Colours\n\n| token | value |\n| --- | --- |'), 'the template ships the slim table');
  assert.ok(!text.includes('notes'), 'and no notes cell anywhere in it');
  assert.ok(!render(parse(text)).includes('notes'));
});

test('a file written before v0.3.0 keeps the column it has — the renderer never drops it', () => {
  const legacy = readFixture(LEGACY_FIXTURE);
  const model = parse(legacy);
  assert.deepEqual(model.columns.colours, ['token', 'value', 'notes']);
  assert.deepEqual(model.tokens.colours[0], ['color-primary', '#2563EB', 'main brand blue']);
  assert.equal(render(model), legacy, 'rendered back byte for byte, notes and all');
});

test('init offers the removal, and a no keeps every word of it', async () => {
  await withProject(readFixture(LEGACY_FIXTURE), async (dir) => {
    const asked = [];
    const { out, actions } = await runInit(dir, {
      yes: false,
      confirm: async (question) => {
        asked.push(question);
        return !/Remove the/.test(question);
      },
      today: '2026-08-15',
    });
    assert.ok(asked.some((question) => /Remove the `notes` column/.test(question)), 'the removal is offered');
    assert.ok(actions.includes('legacy-columns-kept'));
    assert.ok(read(dir).includes('main brand blue'), 'a no drops nothing');
    assert.match(out, /still carries the `notes` column/);
  });
});

test('init removes it on an explicit yes, and only on one', async () => {
  await withProject(readFixture(LEGACY_FIXTURE), async (dir) => {
    const { actions } = await runInit(dir, { yes: false, confirm: async () => true, today: '2026-08-15' });
    assert.ok(actions.includes('legacy-columns-removed'));
    const model = parse(read(dir));
    assert.equal(model.columns.colours, undefined);
    assert.deepEqual(model.tokens.colours[0], ['color-primary', '#2563EB']);
    assert.ok(!read(dir).includes('main brand blue'), 'the column and its contents go together');
  });

  // `--yes` answers every other prompt in `init`. It does not answer this one:
  // a gate that removes content is only ever answered by a person.
  await withProject(readFixture(LEGACY_FIXTURE), async (dir) => {
    const { actions } = await runInit(dir, { yes: true, today: '2026-08-15' });
    assert.ok(actions.includes('legacy-columns-kept'));
    assert.ok(read(dir).includes('main brand blue'));
  });
});

test('a token written into a legacy file fills the columns that file has', async () => {
  await withProject(readFixture(LEGACY_FIXTURE), async (dir) => {
    const { confirm } = recorder();
    await runPrimitives(dir, { model: parse(read(dir)), ctx: { confirm } });
    const text = read(dir);
    assert.ok(text.includes('| token | value | notes |'), 'the file keeps its shape');
    assert.ok(text.includes('| neutral-100 | #F5F5F5 |  |'), 'and the new row has nothing to say in it');
    assert.equal(render(parse(text)), text);
  });
});

// ---------------------------------------------------------------------------
// The argument grammar (§2)
// ---------------------------------------------------------------------------

test('`primitives` is a reserved word after create, and quoting it means the word', async () => {
  await withProject(systemWith(), async (dir) => {
    const { out } = await runCreate([{ value: 'primitives', quoted: true }], { cwd: dir, env: {} });
    assert.ok(!out.includes('create primitives —'), 'a quoted word is a description, not the mode');
  });
});
