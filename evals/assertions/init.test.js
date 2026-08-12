/**
 * Assertions for `init` (plan §6.5, §8.5).
 *
 * Every one of these runs in a throwaway temp directory. `init` writes, so it
 * is never pointed at the repository itself.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { MANDATORY_HEADINGS, missingHeadings, validateStructure } from '../../lib/design-system.js';
import { instantiateTemplate, packageVersion, skillFiles } from '../../lib/template.js';
import { GITIGNORE_LINE } from '../../lib/write.js';
import {
  FIXTURES,
  USER_EDITED_FIXTURE,
  copyDir,
  diffSnapshots,
  readFixture,
  snapshotContents,
  snapshotPaths,
  withTempDir,
} from './helpers.js';

const run = (line, cwd, extra = {}) =>
  execute(tokenizeLine(line), { cwd, yes: true, today: '2026-08-12', ...extra });

const readDesignSystem = (dir) => fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');

test('a fresh init produces DESIGN-SYSTEM.md from the canonical template', async () => {
  await withTempDir(async (dir) => {
    const { code } = await run('init', dir);
    assert.equal(code, 0);

    const written = readDesignSystem(dir);
    const expected = instantiateTemplate({
      project: path.basename(dir),
      version: packageVersion(),
      created: '2026-08-12',
    });
    assert.equal(written, expected);
    assert.deepEqual(missingHeadings(written), []);
    for (const heading of MANDATORY_HEADINGS) assert.ok(written.includes(heading));
  });
});

test('init copies every skill file into .claude/skills/phyllum/', async () => {
  await withTempDir(async (dir) => {
    await run('init', dir);
    const installed = snapshotPaths(path.join(dir, '.claude/skills/phyllum'));
    assert.deepEqual(installed, skillFiles().sort());
    assert.ok(installed.includes('SKILL.md'));
    assert.ok(installed.some((rel) => rel.startsWith('refs/')));
  });
});

test('init adds exactly one .phyllum/ line to .gitignore', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
    await run('init', dir);
    const lines = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').split('\n').filter(Boolean);
    assert.deepEqual(lines, ['node_modules', GITIGNORE_LINE]);
  });
});

test('init never touches a path outside the permission model', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'react-css'), dir);
    const before = snapshotContents(dir);
    await run('init', dir);
    const diff = diffSnapshots(before, snapshotContents(dir));

    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.changed, []);
    for (const rel of diff.added) {
      const allowed =
        rel === 'DESIGN-SYSTEM.md' ||
        rel === '.gitignore' ||
        rel.startsWith('.phyllum/') ||
        rel.startsWith('.claude/skills/phyllum/');
      assert.ok(allowed, `init wrote a path outside the permission model: ${rel}`);
    }
    assert.ok(diff.added.includes('DESIGN-SYSTEM.md'));
  });
});

test('a rerun on an untouched project changes nothing', async () => {
  await withTempDir(async (dir) => {
    await run('init', dir);
    const before = snapshotContents(dir);
    const { out } = await run('init', dir);
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff, { added: [], changed: [], removed: [] });
    assert.ok(out.includes('already exists and matches the template contract'));
  });
});

test('a rerun repairs missing sections and drops no user content', async () => {
  await withTempDir(async (dir) => {
    const original = readFixture(USER_EDITED_FIXTURE);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), original);

    const missingBefore = missingHeadings(original);
    assert.ok(missingBefore.length > 0, 'fixture should be missing sections');

    const { out } = await run('init', dir);
    const repaired = readDesignSystem(dir);

    // Every mandatory section is back.
    assert.deepEqual(missingHeadings(repaired), []);
    assert.ok(validateStructure(repaired).valid);
    for (const heading of missingBefore) assert.ok(out.includes(heading));

    // Additions only: every original line survives, in order.
    const originalLines = original.split('\n');
    const repairedLines = repaired.split('\n');
    let cursor = 0;
    for (const line of originalLines) {
      const found = repairedLines.indexOf(line, cursor);
      assert.notEqual(found, -1, `repair dropped a user line: ${JSON.stringify(line)}`);
      cursor = found + 1;
    }
    assert.ok(repairedLines.length > originalLines.length);

    // Including the section that is not part of the template at all.
    assert.ok(repaired.includes('## Notes for reviewers'));
    assert.ok(repaired.includes('our blues are deliberately two different'));
  });
});

test('a second repair rerun is a no-op', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(USER_EDITED_FIXTURE));
    await run('init', dir);
    const afterFirst = readDesignSystem(dir);
    await run('init', dir);
    assert.equal(readDesignSystem(dir), afterFirst);
  });
});

test('init reports the framework and artefacts it found', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'tailwind'), dir);
    const { out } = await run('init', dir);
    assert.ok(out.includes('Framework: React'));
    assert.ok(out.includes('Styling:   Tailwind'));
    assert.ok(out.includes('tailwind.config.js'));
  });
});

test('init names the project from package.json when there is one', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'react-css'), dir);
    await run('init', dir);
    assert.ok(readDesignSystem(dir).includes('- Project: acme-react-css'));
  });
});

test('init finishes on the menu and the help hint', async () => {
  await withTempDir(async (dir) => {
    const { out } = await run('init', dir);
    assert.ok(out.includes('phyllum menu'));
    assert.ok(out.includes('phyllum help [command]'));
    assert.ok(out.includes('Step 5 — where to go next'));
  });
});

test('a declined .gitignore prompt leaves .gitignore alone', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
    await run('init', dir, { yes: false, confirm: async () => false });
    assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), 'node_modules\n');
    assert.ok(fs.existsSync(path.join(dir, 'DESIGN-SYSTEM.md')));
  });
});

test('without a terminal, init assumes yes and never waits for input', async () => {
  await withTempDir(async (dir) => {
    const confirm = async () => {
      throw new Error('init prompted while detached from a terminal');
    };
    const { code } = await run('init', dir, { yes: true, confirm });
    assert.equal(code, 0);
    assert.ok(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').includes(GITIGNORE_LINE));
  });
});
