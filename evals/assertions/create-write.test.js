/**
 * Assertions for acceptance and the write step (plan §3.3, §7.1.1, §8.5).
 *
 * The promise being checked here is the one that earns the trust: nothing
 * reaches DESIGN-SYSTEM.md before the user accepts, and when they do accept,
 * exactly one file in their codebase changes.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { acceptDraft, runCreate } from '../../lib/create-command.js';
import { extractDraft, skipSlot, tokenNamesOf } from '../../lib/create.js';
import { parse, validateStructure } from '../../lib/design-system.js';
import { TransitionError, advance, readDraft, readState } from '../../lib/state.js';
import { PermissionError, writeGuarded } from '../../lib/write.js';
import {
  POPULATED_FIXTURE,
  diffSnapshots,
  readFixture,
  snapshotContents,
  snapshotPaths,
  withTempDir,
} from './helpers.js';

const tokens = (line, quoted = true) => [{ value: line, quoted }];

/** A project with a design system in it, ready for `create`. */
async function withProject(body, fixture = POPULATED_FIXTURE) {
  return withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(fixture));
    return body(dir);
  });
}

const read = (dir) => fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');

test('a draft with no acceptance writes nothing to the design system', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { code } = await runCreate(tokens('button danger with 12px padding-top'), {
      cwd: dir,
      env: {},
    });
    assert.equal(code, 1, 'with no route to a model and no acceptance, create reports it');

    const after = snapshotContents(dir);
    const diff = diffSnapshots(before, after);
    assert.deepEqual(diff.changed, [], 'DESIGN-SYSTEM.md must not change before acceptance');
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.added, ['.phyllum/session.json'], 'only Phyllum-owned state may appear');
  });
});

test('declining the acceptance leaves the file alone and keeps the draft', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    const { out } = await runCreate(tokens('button danger with 12px padding-top'), {
      cwd: dir,
      env: {},
      confirm: async () => false,
      ask: async () => 'skip',
    });
    assert.equal(read(dir), before);
    assert.ok(out.includes('nothing was written'));
    assert.equal(readDraft(dir).status, 'review', 'the draft is still open for editing');
  });
});

test('accepting changes exactly one file in the codebase', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    await runCreate(tokens('button danger with 12px padding-top'), {
      cwd: dir,
      env: {},
      confirm: async () => true,
      ask: async () => 'skip',
    });

    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.changed, ['DESIGN-SYSTEM.md']);
    assert.deepEqual(diff.added, ['.phyllum/session.json']);
    assert.deepEqual(diff.removed, []);
    assert.ok(validateStructure(read(dir)).valid, 'the template contract still holds');
  });
});

test('the accepted component lands with a spec block and a code view', async () => {
  await withProject(async (dir) => {
    await runCreate(tokens('button danger with 12px padding-top'), {
      cwd: dir,
      env: {},
      confirm: async () => true,
      ask: async () => 'skip',
    });

    const model = parse(read(dir));
    const component = model.components.find((entry) => entry.name === 'Button/Danger');
    assert.ok(component, 'the component is in the file');
    assert.deepEqual(
      component.blocks.map((block) => block.lang),
      ['yaml', 'jsx', 'css'],
      'spec view first, then the React + CSS code view',
    );
    assert.ok(component.blocks[0].content.includes('padding-top: 12px'));
  });
});

test('re-creating a component updates it in place instead of duplicating it', async () => {
  await withProject(async (dir) => {
    const accept = { cwd: dir, env: {}, confirm: async () => true, ask: async () => 'skip' };
    await runCreate(tokens('button danger with 12px padding-top'), accept);
    const first = parse(read(dir)).components.length;

    const { out } = await runCreate(tokens('button danger with 20px padding-top'), accept);
    const model = parse(read(dir));

    assert.equal(model.components.length, first, 'the component count is unchanged');
    assert.equal(model.components.filter((c) => c.name === 'Button/Danger').length, 1);
    assert.ok(out.includes('in place'));

    const spec = model.components.find((c) => c.name === 'Button/Danger').blocks[0].content;
    assert.ok(spec.includes('padding-top: 20px'));
    assert.ok(!spec.includes('padding-top: 12px'), 'the old value is replaced, not kept alongside');
  });
});

test('skipped slots appear as TODO in the component block and in the Backlog', async () => {
  await withProject(async (dir) => {
    await runCreate(tokens('button danger with 12px padding-top'), {
      cwd: dir,
      env: {},
      confirm: async () => true,
      ask: async () => 'skip',
    });

    const model = parse(read(dir));
    const spec = model.components.find((c) => c.name === 'Button/Danger').blocks[0].content;
    for (const slot of ['background', 'text-colour', 'border-colour', 'radius', 'typography']) {
      assert.ok(spec.includes(`${slot}: TODO`), `${slot} should be a TODO in the block`);
      assert.ok(
        model.backlog.includes(`TODO: fill contract slot \`${slot}\` (Button/Danger)`),
        `${slot} should be in the Backlog`,
      );
    }
    assert.ok(model.backlog.includes('TODO: tokenise `12px` (Button/Danger padding-top)'));
  });
});

test('filling a slot on a re-run drops its Backlog entry', async () => {
  await withProject(async (dir) => {
    await runCreate(tokens('button danger with 12px padding-top'), {
      cwd: dir,
      env: {},
      confirm: async () => true,
      ask: async () => 'skip',
    });
    assert.ok(
      parse(read(dir)).backlog.includes('TODO: fill contract slot `radius` (Button/Danger)'),
    );

    await runCreate(tokens('button danger with the rounded-md radius'), {
      cwd: dir,
      env: {},
      confirm: async () => true,
      ask: async () => 'skip',
    });

    const model = parse(read(dir));
    assert.ok(!model.backlog.includes('TODO: fill contract slot `radius` (Button/Danger)'));
    assert.equal(
      model.backlog.filter((line) => line.includes('(Button/Danger')).length,
      new Set(model.backlog.filter((line) => line.includes('(Button/Danger'))).size,
      'no duplicated Backlog entries',
    );
  });
});

test('another component keeps its own Backlog entries when this one is rewritten', async () => {
  await withProject(async (dir) => {
    const before = parse(read(dir)).backlog.filter((line) => line.includes('Button/Primary'));
    assert.ok(before.length > 0, 'the fixture has Button/Primary debt to protect');

    await runCreate(tokens('button danger with 12px padding-top'), {
      cwd: dir,
      env: {},
      confirm: async () => true,
      ask: async () => 'skip',
    });

    const after = parse(read(dir)).backlog.filter((line) => line.includes('Button/Primary'));
    assert.deepEqual(after, before);
  });
});

test('the follow-up answers reach the file, tokens as tokens and values as debt', async () => {
  await withProject(async (dir) => {
    const answers = ['1', 'skip', '#111111', '1', 'skip', 'background 10% darker', 'skip'];
    let index = 0;
    await runCreate(tokens('button danger with 12px padding-top'), {
      cwd: dir,
      env: {},
      ask: async () => answers[index++] ?? 'skip',
      confirm: async () => true,
    });

    const spec = parse(read(dir)).components.find((c) => c.name === 'Button/Danger').blocks[0]
      .content;
    assert.ok(spec.includes('border-colour: #111111 # TODO: tokenise'));
    assert.ok(!/color-surface.*TODO: tokenise/.test(spec), 'a token carries no tokenise debt');
  });
});

test('the draft is persisted in .phyllum/session.json at every step', async () => {
  await withProject(async (dir) => {
    await runCreate(tokens('button danger with 12px padding-top'), { cwd: dir, env: {} });
    const draft = readDraft(dir);
    assert.equal(draft.name, 'Button/Danger');
    assert.equal(draft.status, 'review');
    assert.equal(draft.source.mode, 'prose');
    assert.equal(readState(dir).version, 1);
  });
});

test('the state file keeps whatever else is in it', async () => {
  await withProject(async (dir) => {
    writeGuarded(dir, '.phyllum/session.json', JSON.stringify({ version: 1, gui: { pid: 42 } }));
    await runCreate(tokens('button danger with 12px padding-top'), { cwd: dir, env: {} });
    assert.deepEqual(readState(dir).gui, { pid: 42 }, 'the GUI record survives a create run');
  });
});

test('the acceptance state machine refuses the transitions it does not have', () => {
  const draft = extractDraft('button primary');
  assert.throws(() => advance(draft, 'accept'), TransitionError, 'a drafting spec cannot be accepted');

  advance(draft, 'review');
  advance(draft, 'edit');
  assert.equal(draft.status, 'drafting');

  advance(draft, 'review');
  advance(draft, 'accept');
  assert.equal(draft.status, 'accepted');
  assert.ok(draft.acceptedAt);
  assert.throws(() => advance(draft, 'accept'), TransitionError, 'accepting twice is not a thing');
});

test('accepting a draft writes through the funnel and nowhere else', async () => {
  await withProject(async (dir) => {
    const model = parse(read(dir));
    const draft = extractDraft('badge new with 2px padding-top', { tokenNames: tokenNamesOf(model) });
    skipSlot(draft, 'radius');
    advance(draft, 'review');

    acceptDraft(dir, draft, { model });
    assert.deepEqual(snapshotPaths(dir).sort(), ['.phyllum/session.json', 'DESIGN-SYSTEM.md']);
    assert.equal(draft.status, 'accepted');
    assert.throws(() => writeGuarded(dir, 'src/Badge.jsx', 'nope'), PermissionError);
  });
});

test('an interrupted acceptance leaves the previous file intact', async () => {
  await withProject(async (dir) => {
    const original = read(dir);
    assert.throws(
      () => writeGuarded(dir, 'DESIGN-SYSTEM.md', 'CORRUPT', { faultAfterTempWrite: true }),
      /injected write fault/,
    );
    assert.equal(read(dir), original);
    assert.ok(validateStructure(read(dir)).valid);
  });
});
