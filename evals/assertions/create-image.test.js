/**
 * Assertions for `create` image mode (plan §3.1 Mode B, §7.3, §8.5).
 *
 * The plan's two hard promises for this mode are checked here:
 *
 *   The output is text. A trace produces a spec the user reads, corrects and
 *   accepts — and no file outside DESIGN-SYSTEM.md and .phyllum/ is ever written,
 *   before acceptance or after it.
 *
 *   Nothing unmeasurable is invented. A reading below its confidence bar
 *   becomes a question that quotes the reading; a claim about something a still
 *   image cannot show is refused outright. Neither ever becomes a value.
 *
 * No test here looks at a pixel or calls a model: the tracing is Claude Code's
 * job (§7.3), so it arrives through `ctx.trace` as a structured result and what
 * is asserted is the frame Phyllum puts around it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { traceRuleFor, traceRules } from '../../lib/archetypes.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { readState, writeState } from '../../lib/state.js';
import {
  ingestTrace,
  looksLikeImagePath,
  traceRequest,
  validateImage,
  withinTolerance,
} from '../../lib/trace.js';
import {
  FIXTURES,
  POPULATED_FIXTURE,
  diffSnapshots,
  readFixture,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const IMAGES = path.join(FIXTURES, 'images');
const TRACES = path.join(FIXTURES, 'traces');

const readTrace = (name) => JSON.parse(fs.readFileSync(path.join(TRACES, name), 'utf8'));
const groundTruth = () =>
  JSON.parse(fs.readFileSync(path.join(IMAGES, 'ground-truth.json'), 'utf8')).images;

const run = (line, cwd, extra = {}) =>
  execute(tokenizeLine(line), { cwd, env: {}, yes: true, ...extra });

/** A project with a design system and the button screenshot in it. */
async function withProject(body) {
  return withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    fs.copyFileSync(path.join(IMAGES, 'button-primary.png'), path.join(dir, 'button.png'));
    return body(dir);
  });
}

/** The same, on a system that has never seen a button before. */
async function withEmptyProject(body) {
  return withTempDir(async (dir) => {
    fs.writeFileSync(
      path.join(dir, 'DESIGN-SYSTEM.md'),
      readFixture(path.join(FIXTURES, 'design-system', 'empty.md')),
    );
    fs.copyFileSync(path.join(IMAGES, 'button-primary.png'), path.join(dir, 'button.png'));
    return body(dir);
  });
}

const tracer = (name) => async () => readTrace(name);

// ---------------------------------------------------------------------------
// The argument, and the file behind it
// ---------------------------------------------------------------------------

test('an image path selects image mode; a quoted description never does', async () => {
  assert.equal(looksLikeImagePath('shot.png'), true);
  assert.equal(looksLikeImagePath('design/hero.WEBP'), true);
  assert.equal(looksLikeImagePath('button primary'), false);

  await withProject(async (dir) => {
    const { out } = await execute(tokenizeLine('create "button danger with a shot.png feel"'), {
      cwd: dir,
      env: {},
    });
    assert.ok(out.includes('Draft — Button/Danger'), 'quoting means prose, whatever it contains');
  });
});

test('validation names the reason rather than guessing at the intent', async () => {
  await withProject(async (dir) => {
    assert.equal(validateImage(dir, 'button.png').ok, true);

    const missing = validateImage(dir, 'nope.png');
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'missing');
    assert.ok(missing.message.includes('There is no image at'));

    const wrongKind = validateImage(dir, 'DESIGN-SYSTEM.md');
    assert.equal(wrongKind.ok, false);
    assert.equal(wrongKind.reason, 'extension');

    fs.mkdirSync(path.join(dir, 'shots.png'));
    const directory = validateImage(dir, 'shots.png');
    assert.equal(directory.ok, false);
    assert.equal(directory.reason, 'not-a-file');
  });
});

// ---------------------------------------------------------------------------
// The trace request — what Phyllum asks for
// ---------------------------------------------------------------------------

test('the trace request asks for exactly what the contract table says is measurable', () => {
  const request = traceRequest({ file: 'button.png', archetype: 'button' });
  for (const rule of traceRules()) {
    assert.ok(request.includes(rule.property), `the request should ask about ${rule.property}`);
    assert.ok(
      request.includes(String(rule.minConfidence)),
      `the request should state ${rule.property}'s confidence bar`,
    );
  }
  assert.ok(request.includes('cannot be traced from a still image'), 'states are excluded up front');
  assert.ok(request.includes('do not supply a plausible value'));
  assert.ok(request.includes('button.png'));
});

// ---------------------------------------------------------------------------
// Ingestion — the anti-fabrication gate
// ---------------------------------------------------------------------------

test('a measurement above its bar becomes a value; below it, a question', () => {
  const { draft, questions } = ingestTrace(readTrace('button-primary.json'), {
    file: 'button.png',
  });
  const values = Object.fromEntries(draft.properties.map((p) => [p.key, p.value]));

  assert.equal(values.background, '#2564EC');
  assert.equal(values.radius, '8px');
  assert.ok(draft.properties.every((property) => property.origin === 'image'));

  // 0.72 against a 0.8 bar, and 0.55 against 0.9: both are questions, and
  // neither value is anywhere in the draft.
  assert.equal(values['border-width'], undefined);
  assert.equal(values['font-weight'], undefined);
  const asked = questions.map((question) => question.property);
  assert.ok(asked.includes('border-width'));
  assert.ok(asked.includes('font-weight'));

  const borderWidth = questions.find((question) => question.property === 'border-width');
  assert.equal(borderWidth.kind, 'traced-low-confidence');
  assert.equal(borderWidth.reading, '2px', 'the reading is quoted as context');
  assert.equal(borderWidth.confidence, 0.72);
});

test('anything an image cannot show is refused, and never reaches the draft', () => {
  const { draft, questions, refused } = ingestTrace(readTrace('button-primary.json'), {
    file: 'button.png',
  });

  const hover = refused.find((item) => item.property === 'hover-background');
  assert.ok(hover, 'a hover colour is not a measurement');
  assert.ok(hover.why.includes('still image'));
  assert.ok(!draft.properties.some((property) => property.key === 'hover-background'));

  // `shadow` came back as explicitly unmeasurable: a question, not a value.
  const shadow = questions.find((question) => question.property === 'shadow');
  assert.equal(shadow.kind, 'traced-unmeasurable');
  assert.equal(shadow.reading, null);
});

test('a measurement with no value or no confidence is not a measurement', () => {
  const { draft, refused } = ingestTrace(
    {
      archetype: 'card',
      measurements: [
        { property: 'background', value: '#FFFFFF' },
        { property: 'radius', confidence: 0.99 },
        { property: 'padding', value: '16px', confidence: 0.95 },
        { property: 'padding', value: '20px', confidence: 0.99 },
      ],
    },
    { file: 'card.png' },
  );

  assert.deepEqual(
    draft.properties.map((property) => property.key),
    ['padding'],
  );
  assert.equal(draft.properties[0].value, '16px', 'the first reading stands; the repeat is refused');
  const why = Object.fromEntries(refused.map((item) => [item.property, item.why]));
  assert.ok(why.background.includes('confidence'));
  assert.ok(why.radius.includes('value'));
  assert.ok(why.padding.includes('twice'));
});

test('a trace of an unknown archetype asks which it is rather than choosing one', () => {
  const { draft } = ingestTrace({ measurements: [] }, { file: 'mystery.png' });
  assert.equal(draft.unknownArchetype, true);
  assert.equal(draft.archetype, null);
});

test('the tolerances are the ones the contract table states', () => {
  const truth = groundTruth()['button-primary.png'].properties;

  // Colour: perceptual distance, so a hair off the brand blue still passes.
  assert.equal(withinTolerance(traceRuleFor('background'), '#2564EC', truth.background), true);
  assert.equal(withinTolerance(traceRuleFor('background'), '#DC2626', truth.background), false);

  // Length: one pixel either way.
  assert.equal(withinTolerance(traceRuleFor('radius'), '9px', truth.radius), true);
  assert.equal(withinTolerance(traceRuleFor('radius'), '11px', truth.radius), false);

  // Weight: exact, because a weight read off a label block is a guess.
  assert.equal(withinTolerance(traceRuleFor('font-weight'), '600', '600'), true);
  assert.equal(withinTolerance(traceRuleFor('font-weight'), '500', '600'), false);
});

// ---------------------------------------------------------------------------
// The command — output is text, and the write funnel stays shut
// ---------------------------------------------------------------------------

test('with no eyes attached, image mode hands the request over and writes nothing', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await run('create button.png', dir, { env: { CLAUDECODE: '1' } });

    assert.equal(code, 0);
    assert.ok(out.includes('Image mode — button.png'));
    assert.ok(out.includes('Reply with JSON only'), 'the request travels with the hand-over');
    assert.ok(out.includes('Nothing has been written'));
    assert.ok(out.includes('inside a Claude Code session'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});

test('a traced image is rendered as text — a spec and a code view — and writes nothing', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await run('create button.png', dir, {
      env: { CLAUDECODE: '1' },
      trace: tracer('button-primary.json'),
    });

    assert.equal(code, 0);
    assert.ok(out.includes('Traced button.png'));
    assert.ok(out.includes('Draft — Button/Primary') || out.includes('Revision — Button/Primary'));
    assert.ok(out.includes('From the image: button.png'));
    assert.ok(out.includes('Spec view'));
    assert.ok(out.includes('radius: 8px'));
    assert.ok(out.includes('Code view (React + CSS)'));
    assert.ok(out.includes('Nothing has been written'));

    // The low-confidence readings are visible as questions, with their numbers.
    assert.ok(out.includes('border-width'));
    assert.ok(out.includes('confidence 0.72'));
    assert.ok(!out.includes('border-width: 2px'), 'and never as a recorded value');

    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.changed, []);
    assert.deepEqual(
      diff.added.filter((rel) => !rel.startsWith('.phyllum/')),
      [],
      'only Phyllum’s own state may appear before acceptance',
    );
  });
});

test('on acceptance exactly one file changes, and it is DESIGN-SYSTEM.md', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out } = await run('create button.png', dir, {
      env: { CLAUDECODE: '1' },
      trace: tracer('button-primary.json'),
      confirm: async () => true,
    });

    assert.ok(out.includes('Button/Primary in DESIGN-SYSTEM.md') || out.includes('Wrote Button/Primary'));
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.changed, ['DESIGN-SYSTEM.md']);
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(
      diff.added.filter((rel) => !rel.startsWith('.phyllum/')),
      [],
      'no file outside DESIGN-SYSTEM.md and .phyllum/ is written',
    );

    const written = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(written.includes('radius: 8px'));
    assert.ok(!written.includes('border-width'), 'an unsure reading is not in the file either');
  });
});

test('the states an image cannot show are asked about, one at a time', async () => {
  // On a system with no Button yet, so nothing is carried over from a previous
  // run — a slot skipped last time stays skipped, which is a different test.
  await withEmptyProject(async (dir) => {
    const asked = [];
    await run('create button.png', dir, {
      env: { CLAUDECODE: '1' },
      trace: tracer('button-primary.json'),
      ask: async (question) => {
        asked.push(question);
        return 'skip';
      },
    });

    assert.ok(asked.some((question) => question.includes('An image shows one state')));
    assert.ok(asked.some((question) => question.includes('hover')));
    assert.ok(asked.some((question) => question.includes('disabled')));
    assert.ok(
      asked.some((question) => question.includes('border-width') && question.includes('0.72')),
      'the unsure reading is quoted in its question',
    );
  });
});

test('an unsure reading is recorded only when the user picks it', async () => {
  await withProject(async (dir) => {
    const { out } = await run('create button.png', dir, {
      env: { CLAUDECODE: '1' },
      trace: tracer('button-primary.json'),
      ask: async (question, suggestions) => {
        if (!question.includes('border-width')) return 'skip';
        const traced = suggestions.findIndex((suggestion) => suggestion.source === 'traced');
        assert.ok(traced !== -1, 'the reading is offered, clearly marked');
        assert.ok(suggestions[traced].text.includes('0.72 confidence'));
        return String(traced + 1);
      },
    });

    assert.ok(out.includes('border-width: 2px'), 'picked, so recorded');
    assert.ok(out.includes('font-weight: TODO'), 'skipped, so an honest TODO');
  });
});

test('an image path that does not resolve is an error, not a description', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await run('create nope.png', dir, { env: { CLAUDECODE: '1' } });
    assert.equal(code, 1);
    assert.ok(out.includes('There is no image at `nope.png`'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});

// ---------------------------------------------------------------------------
// The GUI hand-off (plan §5): a dropped image is an image-mode create
// ---------------------------------------------------------------------------

test('an image queued by the dashboard is picked up by a bare create, and drained', async () => {
  await withProject(async (dir) => {
    fs.mkdirSync(path.join(dir, '.phyllum', 'uploads'), { recursive: true });
    const uploaded = '.phyllum/uploads/2026-08-12-button.png';
    fs.copyFileSync(path.join(IMAGES, 'button-primary.png'), path.join(dir, uploaded));
    writeState(dir, {
      queue: [
        { id: 'abc123', kind: 'create-image', file: uploaded, source: 'gui', status: 'pending' },
      ],
    });

    const { out } = await run('create', dir, {
      env: { CLAUDECODE: '1' },
      trace: tracer('button-primary.json'),
    });

    assert.ok(out.includes('Picking up the image you dropped on the dashboard'));
    assert.ok(out.includes(uploaded));
    assert.ok(out.includes('Spec view'), 'and it runs as a normal image-mode create');
    assert.deepEqual(readState(dir).queue, [], 'the entry leaves the queue once it is picked up');
  });
});
