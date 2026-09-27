/**
 * Assertions for `sample` and the sample offer in `init` (v0.13.0).
 *
 * Every one of these runs in a throwaway temp directory. `sample dispose` and
 * `sample restore` write, so they are never pointed at the repository itself.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { parse, render, validateStructure } from '../../lib/design-system.js';
import { applyRestore, planRestore, readSample, sampleStatus } from '../../lib/sample.js';
import { instantiateTemplate, packageVersion } from '../../lib/template.js';
import { withTempDir } from './helpers.js';

const run = (line, cwd, extra = {}) =>
  execute(tokenizeLine(line), { cwd, yes: true, today: '2026-08-12', ...extra });

const file = (dir) => path.join(dir, 'DESIGN-SYSTEM.md');
const read = (dir) => fs.readFileSync(file(dir), 'utf8');
const edit = (dir, from, to) => {
  const text = read(dir);
  assert.ok(text.includes(from), `the sample no longer contains ${JSON.stringify(from)}`);
  fs.writeFileSync(file(dir), text.replace(from, to));
};

const yes = async () => true;
const no = async () => false;

/** A project initialised with the sample, and nothing else. */
async function withSample(body) {
  await withTempDir(async (dir) => {
    await run('init', dir, { sample: true });
    await body(dir);
  });
}

// ---------------------------------------------------------------------------
// The shipped sample
// ---------------------------------------------------------------------------

test('the sample carries the asked-for components, and every one names only its own tokens', () => {
  const sample = readSample();
  assert.deepEqual(
    sample.components.map((component) => component.name),
    ['Button/Primary', 'Accordion', 'Tag/Small', 'Tag/Large', 'Card'],
  );
  assert.ok(validateStructure(render(sample)).valid);
  assert.deepEqual(sample.backlog.filter((line) => line.trim() !== ''), []);

  // Nothing in the sample marks it as sample, so every entry must be one the
  // status reads back as shipped when the whole sample is present.
  const status = sampleStatus(sample, sample);
  assert.ok(status.every((entry) => entry.status === 'untouched'));
});

test('the Card carries a shadow at rest and a deeper one on hover', () => {
  const card = readSample().components.find((component) => component.name === 'Card');
  const spec = card.blocks.find((block) => block.lang === 'yaml').content;
  assert.match(spec, /^ {2}shadow: shadow-md$/m);
  assert.match(spec, /^ {4}shadow: shadow-lg$/m);
});

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

test('init with the sample writes the template plus the sample, in one write', async () => {
  await withSample(async (dir) => {
    const template = instantiateTemplate({
      project: path.basename(dir),
      version: packageVersion(),
      created: '2026-08-12',
    });
    const model = parse(template);
    assert.equal(read(dir), render(applyRestore(model, planRestore(model))));
    assert.ok(!fs.existsSync(`${file(dir)}.bak`), 'a fresh project gets no backup of an empty file');
  });
});

test('init reports the sample it added, and how to remove it', async () => {
  await withTempDir(async (dir) => {
    const { out, actions } = await run('init', dir, { sample: true });
    assert.ok(actions.includes('sample-added'));
    assert.ok(out.includes('Button/Primary, Accordion, Tag/Small, Tag/Large, Card'));
    assert.ok(out.includes('phyllum sample dispose'));
  });
});

test('init asks about the sample, and a no leaves the template empty', async () => {
  await withTempDir(async (dir) => {
    const asked = [];
    const confirm = async (question) => {
      asked.push(question);
      return false;
    };
    const { actions } = await run('init', dir, { yes: false, confirm });
    assert.ok(asked.some((question) => question.includes('sample design system')));
    assert.ok(actions.includes('sample-skipped'));
    assert.equal(parse(read(dir)).components.length, 0);
  });
});

test('init never offers the sample to a file that already exists', async () => {
  await withTempDir(async (dir) => {
    await run('init', dir, { sample: false });
    const before = read(dir);
    const { actions } = await run('init', dir, { sample: true });
    assert.ok(!actions.includes('sample-added'));
    assert.equal(read(dir), before);
  });
});

// ---------------------------------------------------------------------------
// sample (status)
// ---------------------------------------------------------------------------

test('bare sample reports where each entry stands, and writes nothing', async () => {
  await withSample(async (dir) => {
    edit(dir, '| interaction-primary-hover | #0E3895 |', '| interaction-primary-hover | #111111 |');
    const before = read(dir);
    const { out } = await run('sample', dir);
    assert.equal(read(dir), before);
    assert.ok(out.includes('43 tokens and 5 components as shipped'));
    assert.ok(out.includes('1 token changed since'));
    assert.ok(out.includes('Colours: interaction-primary-hover'));
  });
});

// ---------------------------------------------------------------------------
// sample dispose
// ---------------------------------------------------------------------------

test('dispose removes every untouched entry, leaving the empty template', async () => {
  await withTempDir(async (empty) => {
    await run('init', empty, { sample: false });
    await withSample(async (dir) => {
      const { out } = await run('sample dispose', dir, { confirm: yes });
      assert.ok(out.includes('Disposed of 44 tokens and 5 components'));
      assert.equal(read(dir), read(empty).replace(path.basename(empty), path.basename(dir)));
    });
  });
});

test('dispose needs a person: --yes does not answer it, and no gate means no write', async () => {
  await withSample(async (dir) => {
    const before = read(dir);
    const { out } = await run('sample dispose', dir, { yes: true, confirm: undefined });
    assert.ok(out.includes('Nothing was written.'));
    assert.equal(read(dir), before);

    await run('sample dispose', dir, { yes: true, confirm: no });
    assert.equal(read(dir), before);
  });
});

test('dispose keeps an edited component and every token it still names', async () => {
  await withSample(async (dir) => {
    edit(dir, '  shadow: shadow-md\n', '  shadow: shadow-sm\n');
    const { out } = await run('sample dispose', dir, { confirm: yes });
    assert.ok(out.includes('Kept, because you changed it'));

    const model = parse(read(dir));
    assert.deepEqual(model.components.map((component) => component.name), ['Card']);
    const numbers = model.tokens.numbers.map(([name]) => name);
    for (const name of ['shadow-sm', 'shadow-lg', 'rounded-lg', 'space-xl', 'border-hairline']) {
      assert.ok(numbers.includes(name), `${name} was removed from under the Card`);
    }
    assert.ok(!numbers.includes('shadow-md'), 'a token nothing names any more goes');
    assert.ok(!numbers.includes('rounded-sm'), 'a Tag-only token goes with the Tags');
  });
});

test('dispose keeps a component the codebase uses', async () => {
  await withSample(async (dir) => {
    edit(dir, 'name: Tag/Small\n', 'name: Tag/Small\napplied: true\n');
    const { out } = await run('sample dispose', dir, { confirm: yes });
    assert.ok(out.includes('`applied: true`'));
    assert.deepEqual(
      parse(read(dir)).components.map((component) => component.name),
      ['Tag/Small'],
    );
  });
});

// ---------------------------------------------------------------------------
// sample restore
// ---------------------------------------------------------------------------

test('restore after dispose puts the file back exactly as init wrote it', async () => {
  await withSample(async (dir) => {
    const original = read(dir);
    await run('sample dispose', dir, { confirm: yes });
    assert.notEqual(read(dir), original);
    await run('sample restore', dir);
    assert.equal(read(dir), original);
  });
});

test('restore adds only what is missing, and never overwrites a name', async () => {
  await withSample(async (dir) => {
    edit(dir, '| interaction-primary-hover | #0E3895 |', '| interaction-primary-hover | #111111 |');
    edit(dir, '| surface-secondary | #F5F5F5 |\n', '');
    const { out } = await run('sample restore', dir);
    assert.ok(out.includes('Restored 1 token'));
    assert.ok(out.includes('the name is already yours'));

    const colours = parse(read(dir)).tokens.colours;
    const value = (name) => colours.find(([token]) => token === name)?.[1];
    assert.equal(value('surface-secondary'), '#F5F5F5');
    assert.equal(value('interaction-primary-hover'), '#111111');
  });
});

test('a second restore adds nothing', async () => {
  await withSample(async (dir) => {
    const before = read(dir);
    const { out } = await run('sample restore', dir);
    assert.ok(out.includes('nothing to restore'));
    assert.equal(read(dir), before);
  });
});

test('restore takes --yes, and a declined gate writes nothing', async () => {
  await withTempDir(async (dir) => {
    await run('init', dir, { sample: false });
    const before = read(dir);
    await run('sample restore', dir, { yes: false, confirm: no });
    assert.equal(read(dir), before);
    await run('sample restore', dir, { yes: true });
    assert.equal(parse(read(dir)).components.length, 5);
  });
});
