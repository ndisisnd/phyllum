/**
 * Assertions for the confirmation, the acceptance and the write step
 * (v0.2.0 plan §6, §7).
 *
 * Two promises are checked here. The first is the one `create` also makes:
 * nothing reaches DESIGN-SYSTEM.md until the user accepts, and when they do,
 * exactly one file changes. The second belongs to `tokenise` alone — a newly
 * named token has to pay off the debt already written down for it, so the
 * Backlog shrinks instead of growing a second copy.
 *
 * The scan-driven half of this file's v0.1.0 coverage moved to
 * `assess-scan.test.js` with the behaviour it describes.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse, validateStructure } from '../../lib/design-system.js';
import { accepted, decide, runTokenise } from '../../lib/tokenise-command.js';
import { retokeniseSpec } from '../../lib/tokenise.js';
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
const EMPTY_FIXTURE = path.join(FIXTURES, 'design-system', 'empty.md');
const read = (dir) => fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
const args = (prose) => [{ value: prose, quoted: true }];

/** A design system to name into — and a codebase `tokenise` must not touch. */
async function withProject(body, fixture = POPULATED_FIXTURE) {
  return withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(fixture));
    return body(dir);
  });
}

const acceptAll = { ask: async () => 'y', confirm: async () => true };

test('a sentence with no acceptance leaves the design system alone', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { code } = await runTokenise(args('our brand green #16A34A'), { cwd: dir, env: {} });
    assert.equal(code, 1, 'with no route to a model and no acceptance, tokenise reports it');

    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.changed, [], 'DESIGN-SYSTEM.md must not change before acceptance');
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.added, ['.phyllum/session.json'], 'only Phyllum-owned state may appear');
  });
});

test('declining the acceptance writes nothing', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    const { out } = await runTokenise(args('our brand green #16A34A'), {
      cwd: dir,
      env: {},
      ask: async () => 'y',
      confirm: async () => false,
    });
    assert.equal(read(dir), before);
    assert.ok(out.includes('nothing was written'));
  });
});

test('skipping the name question writes nothing, and says so', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    const { out } = await runTokenise(args('our brand green #16A34A'), {
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

test('accepting changes exactly one file, and never the codebase', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    await runTokenise(args('our brand green #16A34A'), { cwd: dir, env: {}, ...acceptAll });

    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.changed, ['DESIGN-SYSTEM.md'], 'the codebase itself is untouched');
    assert.deepEqual(diff.added, ['.phyllum/session.json', 'DESIGN-SYSTEM.md.bak']);
    assert.deepEqual(diff.removed, []);
    assert.ok(validateStructure(read(dir)).valid, 'the template contract still holds');
  });
});

test('each pass writes into its own section, with the right columns', async () => {
  await withProject(async (dir) => {
    await runTokenise(args('our brand green #16A34A'), { cwd: dir, env: {}, ...acceptAll });
    await runTokenise(args('24px spacing'), { cwd: dir, env: {}, ...acceptAll });
    await runTokenise(args('caption 11px light 1.4'), { cwd: dir, env: {}, ...acceptAll });
    const model = parse(read(dir));

    const colour = model.tokens.colours.find((row) => row[1] === '#16A34A');
    assert.ok(colour, 'a colour goes in Colours');
    assert.equal(colour.length, 2, 'Colours is token | value — provenance is history, not design system');

    const number = model.tokens.numbers.find((row) => row[1] === '24px');
    assert.ok(number, 'a number goes in Numbers');
    assert.equal(number[2], 'spacing', 'the applies-to cell records the role');

    const type = model.tokens.typography.find((row) => row[1] === '11px');
    assert.ok(type, 'typography goes in Typography');
    assert.deepEqual(type.slice(1), ['11px', '300', '1.4']);

    for (const section of ['colours', 'numbers', 'typography']) {
      for (const row of model.tokens[section]) {
        assert.ok(row[0], `a ${section} row with no token name got written`);
      }
    }
  }, EMPTY_FIXTURE);
});

test('a name in the sentence is used verbatim, and never put back to the user', async () => {
  await withProject(async (dir) => {
    let asked = 0;
    await runTokenise(args('16px spacing called space-md'), {
      cwd: dir,
      env: {},
      ask: async () => {
        asked += 1;
        return 'y';
      },
      confirm: async () => true,
    });
    assert.equal(asked, 0, 'a name the user typed needs no confirmation');
    const model = parse(read(dir));
    assert.ok(model.tokens.numbers.some((row) => row[0] === 'space-md' && row[1] === '16px'));
  }, EMPTY_FIXTURE);
});

test('renaming the suggestion writes the name the user typed', async () => {
  await withProject(async (dir) => {
    await runTokenise(args('our brand green #16A34A'), {
      cwd: dir,
      env: {},
      ask: async () => 'brand-green',
      confirm: async () => true,
    });
    const model = parse(read(dir));
    assert.ok(model.tokens.colours.some((row) => row[0] === 'brand-green' && row[1] === '#16A34A'));
  });
});

test('accepting a token clears the Backlog debt it pays off, and only that', async () => {
  await withProject(async (dir) => {
    const before = parse(read(dir)).backlog;
    assert.ok(before.includes('TODO: tokenise `8px` (Button/Primary padding-bottom)'));
    assert.ok(before.includes('TODO: fill contract slot `disabled` (Button/Primary)'));

    await runTokenise(args('8px spacing'), { cwd: dir, env: {}, ...acceptAll });
    const model = parse(read(dir));

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
    await runTokenise(args('8px spacing'), { cwd: dir, env: {}, ...acceptAll });
    const model = parse(read(dir));
    const spec = model.components.find((c) => c.name === 'Button/Primary').blocks[0].content;

    assert.ok(spec.includes('padding-bottom: space-md'), 'the raw value became the token');
    assert.ok(!/padding-bottom:.*TODO: tokenise/.test(spec), 'and the marker went with it');
    assert.ok(spec.includes('background: color-primary'), 'a token reference is left alone');
  });
});

test('a number named as a radius never pays off a padding’s debt', async () => {
  await withProject(async (dir) => {
    await runTokenise(args('12px corner radius'), { cwd: dir, env: {}, ...acceptAll });
    const model = parse(read(dir));
    const spec = model.components.find((c) => c.name === 'Button/Primary').blocks[0].content;
    assert.ok(
      spec.includes('padding-top: 12px # TODO: tokenise'),
      'the same number in a different slot is a different fact',
    );
    assert.ok(model.backlog.some((line) => line.includes('`12px` (Button/Primary padding-top)')));
  });
});

test('a number token may only fill the slot its role is about', () => {
  const proposal = {
    pass: 'numbers',
    role: 'radius',
    members: [{ raw: '12px', count: 7 }],
  };
  const spec = [
    'properties:',
    '  radius: 12px # TODO: tokenise',
    '  padding-top: 12px # TODO: tokenise',
  ].join('\n');
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

test('naming the same value twice is refused the second time', async () => {
  await withProject(async (dir) => {
    await runTokenise(args('our brand green #16A34A'), { cwd: dir, env: {}, ...acceptAll });
    const after = read(dir);

    const { out } = await runTokenise(args('the green again #16A34A'), {
      cwd: dir,
      env: {},
      ...acceptAll,
    });
    assert.ok(out.includes('is already'));
    assert.equal(read(dir), after, 'a value the system names is never written twice');
  });
});

test('merging into an existing token adds no second token, and still clears the debt', async () => {
  await withProject(async (dir) => {
    const before = parse(read(dir)).tokens.numbers.length;
    await runTokenise(args('16px spacing'), {
      cwd: dir,
      env: {},
      ask: async () => 'merge rounded-md',
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
    const { out } = await runTokenise(args('our brand green #16A34A'), {
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

test('the proposal is kept in .phyllum/session.json, and nothing else is clobbered', async () => {
  await withProject(async (dir) => {
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.phyllum', 'session.json'),
      JSON.stringify({ version: 1, gui: { pid: 42 } }),
    );
    await runTokenise(args('our brand green #16A34A'), { cwd: dir, env: {} });

    const state = readState(dir);
    assert.deepEqual(state.gui, { pid: 42 }, 'the GUI record survives a tokenise run');
    assert.equal(state.tokenise.source, 'prose');
    assert.equal(state.tokenise.input, 'our brand green #16A34A');
    assert.ok(state.tokenise.proposals.every((proposal) => proposal.name));
  });
});

test('the write goes through the funnel, so the file stays parseable and atomic', async () => {
  await withProject(async (dir) => {
    await runTokenise(args('24px spacing'), { cwd: dir, env: {}, ...acceptAll });
    const rendered = read(dir);
    assert.ok(validateStructure(rendered).valid);
    assert.ok(parse(rendered).tokens.numbers.some((row) => row[1] === '24px'));
  });
});

test('tokenise never rewrites the codebase to use the tokens it names', async () => {
  await withProject(async (dir) => {
    const cssBefore = fs.readFileSync(path.join(dir, 'src', 'styles.css'), 'utf8');
    const { out } = await runTokenise(args('our brand green #16A34A'), {
      cwd: dir,
      env: {},
      ...acceptAll,
    });
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'styles.css'), 'utf8'), cssBefore);
    assert.ok(out.includes('`assess` reads the code'));
  });
});
