/**
 * Assertions for `system` (plan §6, §8.5).
 *
 * `system` is a formatted read and nothing else, so the checks are: does it
 * show everything that is in the file, does `all` really equal the bare
 * command, and does it leave the directory untouched?
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { parse } from '../../lib/design-system.js';
import {
  POPULATED_FIXTURE,
  diffSnapshots,
  readFixture,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const run = (line, cwd) => execute(tokenizeLine(line), { cwd });

async function withFixtureProject(body) {
  return withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    return body(dir);
  });
}

test('system prints every token and every component in the fixture', async () => {
  await withFixtureProject(async (dir) => {
    const model = parse(readFixture(POPULATED_FIXTURE));
    const { out, code } = await run('system', dir);
    assert.equal(code, 0);

    const tokenNames = [
      ...model.tokens.colours,
      ...model.tokens.numbers,
      ...model.tokens.typography,
    ].map((row) => row[0]);
    assert.equal(tokenNames.length, 4);
    for (const name of tokenNames) assert.ok(out.includes(name), `missing token ${name}`);

    assert.equal(model.components.length, 2);
    for (const component of model.components) {
      assert.ok(out.includes(component.name), `missing component ${component.name}`);
    }

    assert.ok(out.includes(`Components (${model.components.length})`));
    assert.ok(out.includes(`Backlog (${model.backlog.length})`));
  });
});

test('system writes nothing', async () => {
  await withFixtureProject(async (dir) => {
    const before = snapshotContents(dir);
    await run('system', dir);
    await run('system tokens', dir);
    await run('system components', dir);
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff, { added: [], changed: [], removed: [] });
  });
});

test('system tokens shows tokens and no component', async () => {
  await withFixtureProject(async (dir) => {
    const { out } = await run('system tokens', dir);
    assert.ok(out.includes('color-primary'));
    assert.ok(out.includes('rounded-md'));
    assert.ok(out.includes('highlight-small'));
    assert.ok(!out.includes('Button/Primary'));
    assert.ok(!out.includes('Card/Basic'));
  });
});

test('system components shows components and no token table', async () => {
  await withFixtureProject(async (dir) => {
    const { out } = await run('system components', dir);
    assert.ok(out.includes('Button/Primary'));
    assert.ok(out.includes('Card/Basic'));
    // No token listing. A component spec may legitimately name a token it
    // consumes, so the check is that the token tables are absent: no
    // subsection labels, and none of the table-only columns.
    for (const label of ['Tokens', 'Colours', 'Numbers', 'Typography']) {
      assert.ok(!out.includes(label), `token section "${label}" leaked into components scope`);
    }
    assert.ok(!out.includes('main brand blue'));
    assert.ok(!out.includes('#2563EB'));
  });
});

test('system all is byte-for-byte identical to bare system', async () => {
  await withFixtureProject(async (dir) => {
    const bare = await run('system', dir);
    const all = await run('system all', dir);
    assert.equal(all.out, bare.out);
    assert.equal(all.code, bare.code);
  });
});

test('an unrecognised scope prints the valid scopes and exits cleanly', async () => {
  await withFixtureProject(async (dir) => {
    const { out, code } = await run('system sideways', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('"sideways" is not a scope'));
    for (const scope of ['tokens', 'components', 'all']) assert.ok(out.includes(scope));
  });
});

/**
 * A design system whose one typography token carries an optional-readings
 * block, alongside a second token that carries none (v0.7.3 phase 6, "the
 * surfaces"). `display` and `system` are one rendering (§6.5.3 dispatch), so
 * both are exercised here rather than trusting that byte-identical dispatch
 * from a distance.
 */
const TYPOGRAPHY_BLOCK_FIXTURE =
  '# Design System\n\n' +
  "> Phyllum manages this file. It is the single source of truth for this project's design system.\n\n" +
  '- Project: acme-web\n' +
  '- Phyllum version: 0.7.3\n' +
  '- Created: 2026-08-24\n\n' +
  '## Tokens\n\n' +
  '### Colours\n\n| token | value |\n| --- | --- |\n\n' +
  '### Numbers\n\n| token | value | applies to |\n| --- | --- | --- |\n\n' +
  '### Typography\n\n' +
  '| token | size | weight | line-height |\n' +
  '| --- | --- | --- | --- |\n' +
  '| highlight-small | 12px | 700 | 1.3 |\n' +
  '| body | 16px | 400 | 1.5 |\n\n' +
  '#### highlight-small\n\n' +
  '```yaml\n' +
  'underline: true\n' +
  'kerning: 0.02em\n' +
  'font-family: "Inter", system-ui, sans-serif\n' +
  '```\n\n' +
  '## Components\n\n## Backlog\n';

async function withTypographyBlockProject(body) {
  return withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), TYPOGRAPHY_BLOCK_FIXTURE);
    return body(dir);
  });
}

test('system prints every optional reading a typography token holds, and nothing for one that holds none', async () => {
  await withTypographyBlockProject(async (dir) => {
    const { out, code } = await run('system', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('underline: true'), out);
    assert.ok(out.includes('kerning: 0.02em'), out);
    assert.ok(out.includes('font-family: "Inter", system-ui, sans-serif'), out);

    // `body` holds no optional readings, so nothing of the block vocabulary
    // follows its row — an absent reading says nothing, never a default line.
    const bodyLine = out.split('\n').findIndex((line) => line.includes('body'));
    assert.ok(bodyLine !== -1, out);
    const nextLine = out.split('\n')[bodyLine + 1] ?? '';
    assert.ok(!/^\s+(underline|kerning|font-family):/.test(nextLine), nextLine);
  });
});

test('display and system render a typography token\'s optional readings byte-identically', async () => {
  await withTypographyBlockProject(async (dir) => {
    const system = await run('system', dir);
    const display = await run('display', dir);
    assert.equal(display.out, system.out);
    assert.equal(display.code, 0);
  });
});

test('the same scope rules apply to dashboard, the gui alias', async () => {
  await withFixtureProject(async (dir) => {
    const { out, code } = await run('dashboard sideways', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('is not a scope'));
    assert.ok(out.includes('phyllum dashboard'));
  });
});
