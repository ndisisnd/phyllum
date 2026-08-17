/**
 * The `applied` flag (v0.5.0 plan §3).
 *
 * Every recorded component learns, once `apply` has run, whether the codebase is
 * using it right now. The flag is the release's foundation — `delete`'s in-use
 * block reads it — so what has to be proved here is not that it exists but that
 * it is *honest*:
 *
 *   1. **It is a reading, not a declaration.** The evidence is `apply`'s own
 *      already-adopted check, reused rather than re-implemented, and a hand-edit
 *      is overwritten by the next derivation.
 *   2. **The write is exactly one line per component.** `apply` now writes
 *      `DESIGN-SYSTEM.md`, which amends a stated contract — so the file is
 *      diffed byte for byte around the run, and every line but the `applied:`
 *      ones must come back identical.
 *   3. **Absence is not `false`.** A file with no flags is a file `apply` has
 *      never run against. It parses exactly as it did before v0.5.0 at every
 *      scope, and every surface says nothing rather than inventing a reading.
 *
 * The surfaces — `display`, `/system`'s JSON, the GUI badge — are asserted here
 * too, because "where it shows" is half of what the flag is for.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  APPLIED_WORDS,
  deriveAppliedFlags,
  readAppliedFlags,
  setAppliedLines,
  writeAppliedFlags,
} from '../../lib/applied.js';
import { parseSpecBlock } from '../../lib/create.js';
import { parse } from '../../lib/design-system.js';
import { executeArgv } from '../../lib/execute.js';
import { alreadyAdopted, readComponent } from '../../lib/prd.js';
import { renderSystem } from '../../lib/system.js';
import { systemJson } from '../../lib/system-json.js';
import { PRD_FILE } from '../../lib/write.js';
import { FIXTURES, PACKAGE_ROOT, copyDir, withTempDir } from './helpers.js';

const CODEBASES = path.join(FIXTURES, 'codebases');
const POPULATED = path.join(FIXTURES, 'design-system', 'populated.md');

const ctx = (dir, extra = {}) => ({
  cwd: dir,
  today: '2026-08-17',
  home: '/nonexistent-home',
  ...extra,
});

const readSystem = (dir) => fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');

/** A project: the react-css fixture, the populated design system, extra files. */
async function project(body, { fixture = 'react-css', files = {} } = {}) {
  return withTempDir(async (dir) => {
    copyDir(path.join(CODEBASES, fixture), dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), fs.readFileSync(POPULATED, 'utf8'));
    for (const [rel, contents] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), contents);
    }
    return body(dir);
  });
}

/** A file that uses the recorded `Button/Primary` as the component it is. */
const ADOPTED_JSX = [
  'import { ButtonPrimary } from "./ButtonPrimary";',
  '',
  'export function Toolbar() {',
  '  return <ButtonPrimary>Save</ButtonPrimary>;',
  '}',
  '',
].join('\n');

/** Every line of a design system except the `applied:` lines. */
const withoutFlags = (text) =>
  String(text)
    .split('\n')
    .filter((line) => !/^applied:\s/.test(line))
    .join('\n');

// ---------------------------------------------------------------------------
// The evidence: apply's own check, reused
// ---------------------------------------------------------------------------

test('the flag is derived from the same check the adoption pass skips on', () => {
  // `alreadyAdopted` is the predicate that tells `apply` "there is nothing to
  // change at this site". v0.5.0 makes the same answer the flag. There is no
  // second detector: `lib/applied.js` imports this one.
  const recorded = readComponent({
    name: 'Button/Primary',
    blocks: [{ lang: 'yaml', content: 'name: Button/Primary\narchetype: button\n' }],
  });
  assert.equal(recorded.elementName, 'ButtonPrimary');
  assert.equal(recorded.className, 'button-primary');

  assert.equal(alreadyAdopted({ element: 'ButtonPrimary', classes: [] }, recorded), true);
  assert.equal(alreadyAdopted({ element: 'button', classes: ['button-primary'] }, recorded), true);
  assert.equal(alreadyAdopted({ element: 'button', classes: ['btn', 'btn--primary'] }, recorded), false);

  const source = fs.readFileSync(path.join(PACKAGE_ROOT, 'lib', 'applied.js'), 'utf8');
  assert.match(source, /import \{ alreadyAdopted, readComponent \} from '\.\/prd\.js'/);
  assert.ok(
    !/function alreadyAdopted/.test(source),
    'the flag module must not grow a second copy of the evidence rule',
  );
});

test('the derivation reads identity, so a custom component is read like any other', async () => {
  // A custom claims no archetype contract, so the adoption pass proposes no
  // change for it (§6.7). Identity is a different question — the component has a
  // name, the name generates an element and a class, and either one in the code
  // is evidence. Nothing here grades the site against a contract.
  await project(
    async (dir) => {
      const model = parse(readSystem(dir));
      model.components.push({
        name: 'Shape/Blob',
        blocks: [{ lang: 'yaml', content: 'name: Shape/Blob\narchetype: custom\ncustom: true\n' }],
      });
      const flags = deriveAppliedFlags(dir, model);
      assert.equal(flags.get('Shape/Blob'), true, 'a custom is read by its own name');
      assert.equal(flags.get('Button/Primary'), false, '`btn btn--primary` is a copy, not the component');
    },
    { files: { 'src/Blob.jsx': 'export const B = () => <ShapeBlob />;\n' } },
  );
});

// ---------------------------------------------------------------------------
// The write: those lines, and not one other byte
// ---------------------------------------------------------------------------

test('a first apply creates every flag, and writes nothing else in the file', async () => {
  await project(async (dir) => {
    const before = readSystem(dir);
    assert.ok(!/^applied:/m.test(before), 'the fixture starts with no flags at all');

    const result = await executeArgv(['apply'], ctx(dir));
    const after = readSystem(dir);

    assert.equal(result.code, 0);
    assert.deepEqual([...result.applied.entries()].sort(), [
      ['Button/Primary', false],
      ['Card/Basic', false],
    ]);
    assert.match(after, /^name: Button\/Primary\narchetype: button\napplied: false$/m);

    // The whole file, modulo those lines, is the file it was. Not a heading, not
    // a table cell, not a blank line, not a trailing newline.
    assert.equal(withoutFlags(after), before, '`apply` may change no other byte of the design system');
    assert.equal(
      fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md.bak'), 'utf8'),
      before,
      'and the `.bak` is the file as it stood before the write',
    );
  });
});

test('a component the codebase actually uses reads `applied: true`', async () => {
  await project(
    async (dir) => {
      const before = readSystem(dir);
      await executeArgv(['apply'], ctx(dir));
      const after = readSystem(dir);

      const flags = readAppliedFlags(after);
      assert.equal(flags.get('Button/Primary'), true, '`<ButtonPrimary>` is the component itself');
      assert.equal(flags.get('Card/Basic'), false, 'nothing in this codebase is a Card/Basic');
      assert.equal(withoutFlags(after), before);
    },
    { files: { 'src/Toolbar.jsx': ADOPTED_JSX } },
  );
});

test('a re-run re-derives: the reading follows the codebase, not the file', async () => {
  await project(async (dir) => {
    await executeArgv(['apply'], ctx(dir));
    assert.equal(readAppliedFlags(readSystem(dir)).get('Button/Primary'), false);

    // Somebody adopts the component by hand. The next `apply` says so.
    fs.writeFileSync(path.join(dir, 'src', 'Toolbar.jsx'), ADOPTED_JSX);
    await executeArgv(['apply'], ctx(dir));
    assert.equal(readAppliedFlags(readSystem(dir)).get('Button/Primary'), true);

    // And back again when the usage goes away: the flag is a reading of now.
    fs.rmSync(path.join(dir, 'src', 'Toolbar.jsx'));
    await executeArgv(['apply'], ctx(dir));
    assert.equal(readAppliedFlags(readSystem(dir)).get('Button/Primary'), false);
  });
});

test('a hand-edited flag is overwritten by the next derivation', async () => {
  await project(async (dir) => {
    await executeArgv(['apply'], ctx(dir));
    const derived = readSystem(dir);

    // Derived, never declared: an opinion typed into the file is not evidence,
    // and the next run says so without asking, warning or preserving it.
    fs.writeFileSync(
      path.join(dir, 'DESIGN-SYSTEM.md'),
      derived.replace('applied: false', 'applied: true'),
    );
    await executeArgv(['apply'], ctx(dir));

    assert.equal(readSystem(dir), derived, 'the file is back to what the codebase says');
    assert.equal(readAppliedFlags(readSystem(dir)).get('Button/Primary'), false);
  });
});

test('a revision drops the flag, and the next derivation puts it back', async () => {
  // The flip table's fourth row, proved rather than promised. `update component`
  // re-renders a spec block from the parsed spec, and the flag is not a slot a
  // revision carries — nor should it be: the flag is a reading of the codebase,
  // and a sentence about a background is not a reading. So the entry comes back
  // with no `applied:` line, which reads as "apply has never run for this one"
  // — never as `false` — and the next `phyllum apply` re-derives it.
  await project(async (dir) => {
    await executeArgv(['apply'], ctx(dir));
    assert.equal(readAppliedFlags(readSystem(dir)).get('Button/Primary'), false, 'the flag is there first');

    const answers = ['1', 'background becomes color-surface'];
    await executeArgv(['update', 'component'], {
      ...ctx(dir),
      env: { CLAUDE_CODE: '1' },
      ask: async () => answers.shift() ?? 'skip',
      confirm: async () => true,
    });

    assert.equal(
      readAppliedFlags(readSystem(dir)).get('Button/Primary'),
      null,
      'the revision left no flag, and absence is absence rather than `false`',
    );

    await executeArgv(['apply'], ctx(dir));
    assert.equal(
      readAppliedFlags(readSystem(dir)).get('Button/Primary'),
      false,
      'and the next derivation puts the reading back',
    );
  });
});

test('the line is replaced where it stands, and never duplicated', () => {
  const text = [
    '# Design System',
    '',
    '## Components',
    '',
    '### Button/Primary',
    '',
    '```yaml',
    'name: Button/Primary',
    'archetype: button',
    'applied: true',
    'properties:',
    '  radius: rounded-md',
    '```',
    '',
    '## Backlog',
    '',
  ].join('\n');

  const flipped = setAppliedLines(text, new Map([['Button/Primary', false]]));
  assert.equal(flipped.match(/^applied:/gm).length, 1, 'one flag, in the place it already had');
  assert.match(flipped, /archetype: button\napplied: false\nproperties:/);
  assert.equal(withoutFlags(flipped), withoutFlags(text), 'nothing else moved');

  // Rerunnable, like everything else here.
  assert.equal(setAppliedLines(flipped, new Map([['Button/Primary', false]])), flipped);
});

test('a component the caller says nothing about keeps the flag it had', () => {
  const text = fs.readFileSync(POPULATED, 'utf8');
  const one = setAppliedLines(text, new Map([['Card/Basic', true]]));
  assert.deepEqual([...readAppliedFlags(one).entries()], [
    ['Button/Primary', null],
    ['Card/Basic', true],
  ]);
});

test('a run that would change no line writes nothing at all', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), fs.readFileSync(POPULATED, 'utf8'));
    const first = writeAppliedFlags(dir, new Map([['Card/Basic', false]]));
    assert.equal(first.written, true);

    const again = writeAppliedFlags(dir, new Map([['Card/Basic', false]]));
    assert.equal(again.written, false, 'the same reading twice is not an edit');
  });
});

// ---------------------------------------------------------------------------
// Tolerance: a file with no flags
// ---------------------------------------------------------------------------

test('a file with no flags parses exactly as it did before v0.5.0, at every scope', () => {
  const text = fs.readFileSync(POPULATED, 'utf8');
  const model = parse(text);
  assert.equal(model.components.length, 2);

  for (const component of model.components) {
    const spec = parseSpecBlock(component.blocks.find((block) => block.lang === 'yaml').content);
    assert.equal(spec.applied, null, 'no flag is null — never `false`, which would be a claim');
    assert.ok(spec.archetype, 'and everything else still reads');
  }

  const json = systemJson(text);
  for (const component of json.components) assert.equal(component.applied, null);

  // The listing is the file, unchanged, at all three scopes.
  for (const scope of ['all', 'components', 'tokens']) {
    assert.ok(!renderSystem(text, scope).includes('applied'), `${scope} invents no reading`);
  }
  assert.deepEqual([...readAppliedFlags(text).values()], [null, null]);
});

// ---------------------------------------------------------------------------
// Where it shows
// ---------------------------------------------------------------------------

test('`display` prints the reading only when the file carries one', async () => {
  await project(async (dir) => {
    const before = await executeArgv(['display', 'components'], ctx(dir));
    assert.match(before.out, /^ {2}Button\/Primary$/m, 'no flag, no reading');

    await executeArgv(['apply'], ctx(dir));
    const after = await executeArgv(['display', 'components'], ctx(dir));
    assert.match(after.out, /^ {2}Button\/Primary — not applied$/m);
    assert.match(after.out, /^ {2}Card\/Basic — not applied$/m);

    // `display` and `system` are one renderer, so the alias says the same thing.
    const alias = await executeArgv(['system', 'components'], ctx(dir));
    assert.equal(alias.out, after.out);
  });
});

test('`display` says `applied` for a component the codebase uses', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      const result = await executeArgv(['display', 'components'], ctx(dir));
      assert.match(result.out, /^ {2}Button\/Primary — applied$/m);
      assert.match(result.out, /^ {2}Card\/Basic — not applied$/m);
    },
    { files: { 'src/Toolbar.jsx': ADOPTED_JSX } },
  );
});

test('the two readings are spelled one way, in one place', () => {
  // The words `display` prints are the words the ref's table records.
  assert.deepEqual(APPLIED_WORDS, { true: 'applied', false: 'not applied' });
  const ref = fs.readFileSync(
    path.join(PACKAGE_ROOT, 'skill', 'refs', 'system', 'system.md'),
    'utf8',
  );
  const table = ref.slice(ref.indexOf('<!-- phyllum:applied-listing -->'));
  assert.match(table, /`applied: true` \| `Button\/Primary — applied`/);
  assert.match(table, /`applied: false` \| `Button\/Primary — not applied`/);
  assert.match(table, /no `applied:` line \| `Button\/Primary` — nothing added/);
});

test('the JSON the GUI reads carries the flag, tri-state, unchanged', async () => {
  await project(
    async (dir) => {
      await executeArgv(['apply'], ctx(dir));
      const json = systemJson(readSystem(dir));
      const byName = Object.fromEntries(json.components.map((row) => [row.name, row.applied]));
      assert.deepEqual(byName, { 'Button/Primary': true, 'Card/Basic': false });
    },
    { files: { 'src/Toolbar.jsx': ADOPTED_JSX } },
  );
});

test('the GUI badge is drawn for `applied: true` and for nothing else', () => {
  const page = fs.readFileSync(path.join(PACKAGE_ROOT, 'gui', 'index.html'), 'utf8');
  const badge = page.slice(page.indexOf('function appliedBadge'), page.indexOf('function tokenNames'));

  assert.match(badge, /component\.applied === true/, 'the strict reading — `false` and null are not true');
  assert.match(badge, /<span class="chip applied">applied<\/span>/, 'the page\'s own chip');
  assert.ok(!/not applied/.test(badge), 'a badge has room to be right, not to be nuanced');

  // Both surfaces the plan names carry it: the list and the preview panel.
  assert.match(page, /esc\(component && component\.name\) \+\s*appliedBadge\(component\)/);
  assert.match(page, /esc\(component\.name\) \+ appliedBadge\(component\) \+ '<\/h3>'/);

  // The page's own tag styling, and no new colour: the one rule the badge adds
  // reads a variable the page already defines.
  const rule = page.match(/\.chip\.applied \{([^}]*)\}/);
  assert.ok(rule, 'the badge has exactly one rule');
  assert.match(rule[1], /var\(--muted\)/);
  assert.ok(!/#[0-9a-fA-F]{3,8}|rgb|hsl/.test(rule[1]), 'and it introduces no colour of its own');

  // And the flag is never mistaken for a slot holding a raw value.
  assert.match(page, /if \(slot === 'applied'\) continue;/);
});

// ---------------------------------------------------------------------------
// The second writer: a completed adopt phase
// ---------------------------------------------------------------------------

/** The smallest design system with a component and no token in the code. */
const ADOPT_SYSTEM = [
  '# Design System',
  '',
  "> Phyllum manages this file. It is the single source of truth for this project's design system.",
  '',
  '- Project: adopt',
  '- Phyllum version: 0.5.0',
  '- Created: 2026-08-17',
  '',
  '## Tokens',
  '',
  '### Colours',
  '',
  '| token | value |',
  '| --- | --- |',
  '| color-primary | #2563EB |',
  '',
  '### Numbers',
  '',
  '| token | value | applies to |',
  '| --- | --- | --- |',
  '',
  '### Typography',
  '',
  '| token | size | weight | line-height |',
  '| --- | --- | --- | --- |',
  '',
  '## Components',
  '',
  '### Button/Primary',
  '',
  '```yaml',
  'name: Button/Primary',
  'archetype: button',
  'properties:',
  '  background: color-primary',
  '```',
  '',
  '## Backlog',
  '',
  '_Nothing outstanding._',
  '',
].join('\n');

/** Markup that looks like the component without being it — an adoption change. */
const COPY_JSX = [
  'export function Save() {',
  '  return <button className="btn btn--primary">Save</button>;',
  '}',
  '',
].join('\n');

test('a completed `Adopt` phase flips that component to true, in the same breath as the commit', async () => {
  await withTempDir(async (dir) => {
    const rel = 'src/Save.jsx';
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), COPY_JSX);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), ADOPT_SYSTEM);
    fs.writeFileSync(path.join(dir, 'package.json'), '{ "name": "adopt", "dependencies": { "react": "18" } }\n');
    fs.writeFileSync(path.join(dir, '.gitignore'), '.phyllum/\nDESIGN-SYSTEM.md.bak\n');

    const git = (args) => {
      const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
      return result.stdout.trim();
    };
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'tests@phyllum.invalid']);
    git(['config', 'user.name', 'Phyllum Tests']);
    git(['add', '-A']);
    git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'initial']);

    const runCtx = { ...ctx(dir), env: { PATH: '' } };
    const planned = await executeArgv(['apply'], runCtx);
    assert.match(planned.out, /Adopt Button\/Primary/, 'the plan has an adopt phase to complete');
    assert.equal(readAppliedFlags(readSystem(dir)).get('Button/Primary'), false, 'a copy is not the component');

    globalThis.__phyllumFsHarness?.openApplyWindow([rel]);
    try {
      // The stand-in for the orchestrator: it adopts the component the way an
      // agent would. The run still verifies by reading the file, so nothing here
      // passes on the stand-in's word.
      const result = await executeArgv(['apply', 'run'], {
        ...runCtx,
        runAgent: async () => {
          fs.writeFileSync(
            path.join(dir, rel),
            'export function Save() {\n  return <ButtonPrimary>Save</ButtonPrimary>;\n}\n',
          );
          return { ok: true, output: 'done' };
        },
      });
      assert.equal(result.code, 0);
      assert.equal(result.outcome.stopped, null, `the run stopped: ${result.out}`);
    } finally {
      globalThis.__phyllumFsHarness?.closeApplyWindow();
    }

    // The phase landed, so the flag says so *now* — the next `apply` would say
    // the same thing later, and the file should not have to wait for it.
    assert.equal(readAppliedFlags(readSystem(dir)).get('Button/Primary'), true);
    assert.equal(
      withoutFlags(readSystem(dir)),
      withoutFlags(ADOPT_SYSTEM),
      'and the flip touched that line and nothing else',
    );

    // The design system is not in the phase's commit: a phase commits the files
    // its criteria name, and no criterion names Phyllum's own record.
    const committed = spawnSync('git', ['show', '--name-only', '--format=', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8',
    }).stdout;
    assert.deepEqual(committed.split('\n').filter((line) => line !== ''), [rel]);
  });
});

// ---------------------------------------------------------------------------
// The contract the ref records
// ---------------------------------------------------------------------------

test('the flip table in the ref is the behaviour the code implements', () => {
  const ref = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'refs', 'apply', 'plan.md'), 'utf8');
  const table = ref.slice(ref.indexOf('<!-- phyllum:applied-flips -->'));

  assert.match(table, /`phyllum apply`, every run \| every recorded component's flag is re-derived/);
  assert.match(table, /`Adopt <Component>` phase commits \| that component flips to `true`/);
  assert.match(table, /harness executes the PRD instead \|.*catch up on the next `phyllum apply`/);
  // The fourth row is the one v0.5.0 M1 handed forward: a spec block rewritten
  // by `update component` is re-rendered from the parsed spec, and the flag is
  // not one of the things carried by hand. That is contract rather than bug —
  // the flag is a reading of the codebase, and a revision is not a reading —
  // and it is recorded here so it is not discovered.
  assert.match(
    table,
    /any other command rewrites a spec block \| the flag is not carried by hand; the next `phyllum apply` re-derives it/,
  );

  // The readings table states the one thing the whole release rests on: absence
  // is not `false`.
  const readings = ref.slice(ref.indexOf('<!-- phyllum:applied-readings -->'));
  assert.match(readings, /no `applied:` line at all \|.*never run here/);
  assert.match(readings, /\*\*not\*\* a `false`/);

  // And the write amendment is recorded where the permission rule lives, loudly.
  const permissions = fs.readFileSync(
    path.join(PACKAGE_ROOT, 'skill', 'refs', 'apply', 'apply.md'),
    'utf8',
  );
  assert.match(permissions, /<!-- phyllum:applied-write -->/);
  assert.match(permissions, /the `applied:` line of each component's spec block/);
  assert.match(permissions, /`\.bak` taken first/);

  const skill = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'SKILL.md'), 'utf8');
  assert.match(skill, /\| `DESIGN-SYSTEM\.md`, the `applied:` lines only \| `apply` and `apply run`/);
});

// ---------------------------------------------------------------------------
// The PRD the flag rides on
// ---------------------------------------------------------------------------

test('the report names the second write rather than performing it quietly', async () => {
  await project(async (dir) => {
    const result = await executeArgv(['apply'], ctx(dir));
    assert.match(result.out, /Also written: the `applied:` line of 2 components in DESIGN-SYSTEM\.md/);
    assert.match(result.out, /0 adopted in this codebase right now, 2 not/);
    assert.match(result.out, /derived from the same/);
  });
});

test('a run that writes no plan writes no flag either', async () => {
  // Nothing to apply means nothing was planned, and a run that planned nothing
  // is not a run the flags can be a reading of.
  await project(
    async (dir) => {
      const before = readSystem(dir);
      const result = await executeArgv(['apply'], ctx(dir));
      assert.equal(result.written, false);
      assert.ok(!fs.existsSync(path.join(dir, PRD_FILE)));
      assert.equal(readSystem(dir), before, 'and the design system is untouched');
      assert.ok(!fs.existsSync(path.join(dir, 'DESIGN-SYSTEM.md.bak')), 'no `.bak` either');
    },
    { fixture: 'unknown-lang' },
  );
});
