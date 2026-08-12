/**
 * Assertions for the review, the acceptance and the write step (plan §4, §8.5).
 *
 * Two promises are checked here. The first is the one `create` also makes:
 * nothing reaches DESIGN-SYSTEM.md until the user accepts, and when they do,
 * exactly one file in their codebase changes. The second belongs to `tokenise`
 * alone — a newly named token has to pay off the debt that was already written
 * down for it, so the Backlog shrinks instead of growing a second copy.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse, render, validateStructure } from '../../lib/design-system.js';
import { accepted, decide, runTokenise } from '../../lib/tokenise-command.js';
import { applyAcceptance, retokeniseSpec, tokenise } from '../../lib/tokenise.js';
import { readState } from '../../lib/state.js';
import {
  FIXTURES,
  POPULATED_FIXTURE,
  copyDir,
  diffSnapshots,
  readFixture,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const MIXED = path.join(FIXTURES, 'codebases', 'tokenise-mixed');
const read = (dir) => fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');

/** A codebase with values in it and a design system to name them into. */
async function withProject(body, fixture = POPULATED_FIXTURE) {
  return withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(fixture));
    return body(dir);
  });
}

const acceptAll = { ask: async () => 'y', confirm: async () => true };

test('a scan with no acceptance leaves the design system alone', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { code } = await runTokenise([], { cwd: dir, env: {} });
    assert.equal(code, 1, 'with no route to a model and no acceptance, tokenise reports it');

    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.changed, [], 'DESIGN-SYSTEM.md must not change before acceptance');
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.added, ['.basal/session.json'], 'only Basal-owned state may appear');
  });
});

test('declining the acceptance writes nothing', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    const { out } = await runTokenise([], {
      cwd: dir,
      env: {},
      ask: async () => 'y',
      confirm: async () => false,
    });
    assert.equal(read(dir), before);
    assert.ok(out.includes('nothing was written'));
  });
});

test('skipping every proposal writes nothing, and says so', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    const { out } = await runTokenise([], {
      cwd: dir,
      env: {},
      ask: async () => 'skip',
      confirm: async () => {
        throw new Error('tokenise asked to write when nothing was accepted');
      },
    });
    assert.equal(read(dir), before);
    assert.ok(out.includes('Nothing accepted'));
  });
});

test('accepting changes exactly one file in the codebase', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    await runTokenise([], { cwd: dir, env: {}, ...acceptAll });

    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.changed, ['DESIGN-SYSTEM.md'], 'the codebase itself is untouched');
    assert.deepEqual(diff.added, ['.basal/session.json']);
    assert.deepEqual(diff.removed, []);
    assert.ok(validateStructure(read(dir)).valid, 'the template contract still holds');
  });
});

test('accepted tokens land in the right section, with the right columns', async () => {
  await withProject(async (dir) => {
    await runTokenise([], { cwd: dir, env: {}, ...acceptAll });
    const model = parse(read(dir));

    const colour = model.tokens.colours.find((row) => row[0] === 'color-text');
    assert.ok(colour, 'a colour goes in Colours');
    assert.equal(colour[1], '#111827');
    assert.ok(colour[2].includes('used'), 'the notes cell records the sightings');

    const number = model.tokens.numbers.find((row) => row[0] === 'space-md');
    assert.ok(number, 'a number goes in Numbers');
    assert.equal(number[1], '16px');
    assert.equal(number[2], 'spacing', 'the applies-to cell records the role');

    const type = model.tokens.typography.find((row) => row[0] === 'highlight-large');
    assert.ok(type, 'typography goes in Typography');
    assert.deepEqual(type.slice(1), ['20px', '700', '1.2']);

    for (const section of ['colours', 'numbers', 'typography']) {
      for (const row of model.tokens[section]) {
        assert.ok(row[0], `a ${section} row with no token name got written`);
      }
    }
  });
});

test('a merged cluster is one row, with the members it folded in on the record', async () => {
  await withProject(async (dir) => {
    // The system already names the blue, so use a design system that does not.
    fs.writeFileSync(
      path.join(dir, 'DESIGN-SYSTEM.md'),
      readFixture(path.join(FIXTURES, 'design-system', 'empty.md')),
    );
    await runTokenise([], { cwd: dir, env: {}, ...acceptAll });

    const model = parse(read(dir));
    const rows = model.tokens.colours.filter((row) => ['#2563EB', '#2564EC'].includes(row[1]));
    assert.equal(rows.length, 1, 'one blue, one token');
    assert.equal(rows[0][0], 'color-primary');
    assert.ok(rows[0][2].includes('#2564EC'), 'the merged member is visible in the notes');
  });
});

test('accepting a token clears the Backlog debt it pays off, and only that', async () => {
  await withProject(async (dir) => {
    const before = parse(read(dir)).backlog;
    assert.ok(before.includes('TODO: tokenise `8px` (Button/Primary padding-bottom)'));
    assert.ok(before.includes('TODO: tokenise `12px` (Button/Primary padding-top)'));
    assert.ok(before.includes('TODO: fill contract slot `disabled` (Button/Primary)'));

    await runTokenise([], { cwd: dir, env: {}, ...acceptAll });
    const model = parse(read(dir));

    // 8px is a spacing value in the fixture codebase, and Button/Primary owes it.
    assert.ok(
      !model.backlog.includes('TODO: tokenise `8px` (Button/Primary padding-bottom)'),
      'the debt this token pays off is gone',
    );
    assert.ok(
      model.backlog.includes('TODO: fill contract slot `disabled` (Button/Primary)'),
      'a skipped contract slot is a different debt, and stays until the slot is filled',
    );
  });
});

test('the component that owed the debt now references the token by name', async () => {
  await withProject(async (dir) => {
    await runTokenise([], { cwd: dir, env: {}, ...acceptAll });
    const model = parse(read(dir));
    const spec = model.components.find((c) => c.name === 'Button/Primary').blocks[0].content;

    assert.ok(spec.includes('padding-bottom: space-sm'), 'the raw value became the token');
    assert.ok(!/padding-bottom:.*TODO: tokenise/.test(spec), 'and the marker went with it');
    assert.ok(spec.includes('background: color-primary'), 'a token reference is left alone');
    assert.ok(
      spec.includes('padding-top: 12px # TODO: tokenise'),
      '12px is a radius in this codebase, so it never pays off a padding’s debt',
    );
  });
});

test('a number token may only fill the slot its role is about', () => {
  const proposal = {
    pass: 'numbers',
    role: 'radius',
    members: [{ raw: '12px', count: 7 }],
  };
  const spec = ['properties:', '  radius: 12px # TODO: tokenise', '  padding-top: 12px # TODO: tokenise'].join('\n');
  const result = retokeniseSpec(spec, proposal, 'rounded-md');

  assert.ok(result.content.includes('radius: rounded-md'));
  assert.ok(
    result.content.includes('padding-top: 12px # TODO: tokenise'),
    'the same number in a different slot is a different fact',
  );
});

test('a line that already names a token is never rewritten', () => {
  const proposal = { pass: 'colours', members: [{ raw: '#2563EB', count: 14 }] };
  const spec = 'properties:\n  background: color-primary\n';
  assert.equal(retokeniseSpec(spec, proposal, 'color-brand').changed, false);
});

test('an immediate rerun proposes nothing at all', async () => {
  await withProject(async (dir) => {
    await runTokenise([], { cwd: dir, env: {}, ...acceptAll });
    const after = read(dir);

    const { out } = await runTokenise([], { cwd: dir, env: {}, ...acceptAll });
    assert.ok(out.includes('nothing new to name'));
    assert.equal(read(dir), after, 'a rerun that proposes nothing writes nothing');
  });
});

test('adding one new colour makes exactly one proposal appear', async () => {
  await withProject(async (dir) => {
    await runTokenise([], { cwd: dir, env: {}, ...acceptAll });
    const namedBefore = parse(read(dir)).tokens.colours.length;

    fs.writeFileSync(path.join(dir, 'src', 'new.css'), '.alert { color: #DC2626; }\n');
    const { proposals } = tokenise(dir, parse(read(dir)));
    assert.equal(proposals.length, 1, 'only what is new is proposed');
    assert.equal(proposals[0].value, '#DC2626');

    await runTokenise([], { cwd: dir, env: {}, ...acceptAll });
    assert.equal(parse(read(dir)).tokens.colours.length, namedBefore + 1);
  });
});

test('renaming a proposal writes the name the user typed', async () => {
  await withProject(async (dir) => {
    await runTokenise([], {
      cwd: dir,
      env: {},
      ask: async (question) => (question.includes('#111827') ? 'color-ink' : 'skip'),
      confirm: async () => true,
    });
    const model = parse(read(dir));
    assert.ok(model.tokens.colours.some((row) => row[0] === 'color-ink' && row[1] === '#111827'));
  });
});

test('merging into an existing token adds no second token, and still clears the debt', async () => {
  await withProject(async (dir) => {
    const before = parse(read(dir)).tokens.numbers.length;
    await runTokenise([], {
      cwd: dir,
      env: {},
      ask: async (question) => (question.includes('16px') ? 'merge rounded-md' : 'skip'),
      confirm: async () => true,
    });

    const model = parse(read(dir));
    assert.equal(model.tokens.numbers.length, before, 'a merge is not a new token');
    assert.ok(!model.backlog.some((line) => line.includes('`16px`')));
  });
});

test('merging into a name nobody has is refused rather than guessed at', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    const { out } = await runTokenise([], {
      cwd: dir,
      env: {},
      ask: async () => 'merge nothing-like-this',
      confirm: async () => {
        throw new Error('tokenise accepted a merge into a name that does not exist');
      },
    });
    assert.ok(out.includes('is not a token or a proposal'));
    assert.equal(read(dir), before);
  });
});

test('the answer grammar is the one the review table documents', () => {
  const proposal = { name: 'color-primary', value: '#2563EB', members: [] };
  const names = ['color-primary', 'rounded-md'];
  assert.equal(decide(proposal, 'y', { names }).action, 'confirm');
  assert.equal(decide(proposal, '', { names }).action, 'confirm', 'enter means yes');
  assert.equal(decide(proposal, 'skip', { names }).action, 'skip');
  assert.equal(decide(proposal, 'n', { names }).action, 'skip');
  assert.deepEqual(decide(proposal, 'brand-blue', { names }), {
    proposal,
    action: 'rename',
    name: 'brand-blue',
  });
  assert.equal(decide(proposal, 'merge rounded-md', { names }).target, 'rounded-md');
  assert.equal(decide(proposal, '2', { names }).action, 'skip', 'the numbered picker');
});

test('accepted() turns decisions into exactly what will be written', () => {
  const proposal = { name: 'color-primary', value: '#2563EB', members: [] };
  assert.deepEqual(accepted([{ proposal, action: 'skip' }]), []);
  assert.equal(accepted([{ proposal, action: 'rename', name: 'brand' }])[0].name, 'brand');
  assert.equal(
    accepted([{ proposal, action: 'merge', target: 'color-brand' }])[0].mergedInto,
    'color-brand',
  );
});

test('the proposals are kept in .basal/session.json, and nothing else is clobbered', async () => {
  await withProject(async (dir) => {
    fs.mkdirSync(path.join(dir, '.basal'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.basal', 'session.json'),
      JSON.stringify({ version: 1, gui: { pid: 42 } }),
    );
    await runTokenise([], { cwd: dir, env: {} });

    const state = readState(dir);
    assert.deepEqual(state.gui, { pid: 42 }, 'the GUI record survives a tokenise run');
    assert.ok(state.tokenise.proposed > 0);
    assert.ok(state.tokenise.proposals.every((proposal) => proposal.name));
  });
});

test('the write goes through the funnel, so the file stays parseable and atomic', async () => {
  await withProject(async (dir) => {
    const model = parse(read(dir));
    const { proposals } = tokenise(dir, model);
    applyAcceptance(model, proposals.slice(0, 1));

    const rendered = render(model);
    assert.ok(validateStructure(rendered).valid);
    assert.deepEqual(parse(rendered).tokens.numbers, model.tokens.numbers, 'parse → render → parse');
  });
});

test('v1 never rewrites the codebase to use the tokens it names', async () => {
  await withProject(async (dir) => {
    const cssBefore = fs.readFileSync(path.join(dir, 'src', 'styles.css'), 'utf8');
    const { out } = await runTokenise([], { cwd: dir, env: {}, ...acceptAll });
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'styles.css'), 'utf8'), cssBefore);
    assert.ok(out.includes('Your codebase is untouched'));
  });
});
