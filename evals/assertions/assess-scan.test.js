/**
 * Assertions for the codebase scan, the clustering and the rerun diff.
 *
 * **This is `assess`'s coverage** (v0.2.0 plan §5.1, §5.3, §7). Two halves sit in
 * one file because they are one behaviour:
 *
 *   1. The inherited half. `tokenise` reads prose now; reading a codebase is
 *      `assess`'s job, so the checks that prove the scan works moved here with
 *      the behaviour rather than being deleted — coverage moves, it does not drop.
 *   2. The M3 half. `assess` takes the engine over and widens it: the values pass
 *      goes language-agnostic, component detection commits to React, and the
 *      result reports what the design system already covers as well as what it
 *      does not.
 *
 * The promise this file exists to prove is the one both plans put first: the
 * scan is **read-only**. Every check that runs a scan diffs the whole directory
 * around it and demands that nothing at all changed — not one byte, not one new
 * file — because a tool that reads your codebase has to earn that trust before
 * it asks to write a single line.
 *
 * The command surface lives in `assess-cli.test.js`. Still to be written when the
 * suggestion half lands (M4–M5): the mapping table's rendering, the two
 * suggestion tracks, the chained `assess tokens` / `assess components` /
 * `assess update` modes, and `assess update`'s promise to touch DESIGN-SYSTEM.md
 * and nothing else.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { assess, assessValues } from '../../lib/assess.js';
import { parse, render, validateStructure } from '../../lib/design-system.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { dataBlocks, gitignoreMatcher, isDataFile, resolveProperty } from '../../lib/scan-text.js';
import {
  applyAcceptance,
  clusterSightings,
  deltaE,
  ladderNames,
  normaliseValue,
  proposeTokens,
  ruleBlocks,
  scanCodebase,
  tailwindDeclarations,
  toPx,
  tokenise,
} from '../../lib/tokenise.js';
import {
  componentPassRuns,
  componentStacks,
  roleForProperty,
  sources,
  textScan,
  threshold,
} from '../../lib/tokenise-spec.js';
import {
  FIXTURES,
  PACKAGE_ROOT,
  POPULATED_FIXTURE,
  copyDir,
  diffSnapshots,
  readFixture,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const MIXED = path.join(FIXTURES, 'codebases', 'tokenise-mixed');
const emptySystem = () => parse(readFixture(path.join(FIXTURES, 'design-system', 'empty.md')));

const proposalNamed = (proposals, name) => proposals.find((proposal) => proposal.name === name);
const memberValues = (proposal) => proposal.members.map((member) => member.raw);

/** A copy of the fixture codebase, so a test can add a file to it. */
async function withCodebase(body) {
  return withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    return body(dir);
  });
}

test('the scan writes nothing at all — not one byte of the codebase', async () => {
  await withCodebase(async (dir) => {
    const before = snapshotContents(dir);
    const sightings = scanCodebase(dir);
    assert.ok(sightings.length > 0, 'the scan found something to be read-only about');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('proposing tokens writes nothing either — only acceptance writes', async () => {
  await withCodebase(async (dir) => {
    const before = snapshotContents(dir);
    const { proposals } = tokenise(dir, emptySystem());
    assert.ok(proposals.length > 0);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('there is no write call anywhere in the scanning engine', () => {
  // Read-only is a property of the code, not a promise in a document — so every
  // module on the scan path is checked, not just the oldest one.
  for (const rel of ['lib/tokenise.js', 'lib/scan-text.js', 'lib/assess.js', 'lib/assess-command.js']) {
    const engine = fs.readFileSync(path.join(PACKAGE_ROOT, rel), 'utf8');
    for (const forbidden of [
      'writeFileSync',
      'appendFileSync',
      'mkdirSync',
      'renameSync',
      'rmSync',
      'createWriteStream',
    ]) {
      assert.ok(!engine.includes(forbidden), `${rel} must not call ${forbidden}`);
    }
  }
});

test('the three passes each find their own kind of value', () => {
  const sightings = scanCodebase(MIXED);
  const passes = new Set(sightings.map((sighting) => sighting.pass));
  assert.deepEqual([...passes].sort(), ['colours', 'numbers', 'typography']);

  const colour = sightings.find((sighting) => sighting.value === '#2563EB');
  assert.equal(colour.pass, 'colours');
  assert.equal(colour.count, 14, 'the plan’s canonical count');

  const radius = sightings.find(
    (sighting) => sighting.pass === 'numbers' && sighting.role === 'radius' && sighting.value === '12px',
  );
  assert.ok(radius, 'a corner radius is a number with a role, not just a length');

  const type = sightings.find((sighting) => sighting.pass === 'typography' && sighting.size === '12px');
  assert.equal(type.weight, '700');
  assert.equal(type.lineHeight, '1.3');
});

test('the scan reads stylesheets, inline styles and Tailwind arbitrary values', () => {
  const sightings = scanCodebase(MIXED);
  const files = new Set(sightings.flatMap((sighting) => sighting.files));
  assert.ok(files.has('src/styles.css'), 'stylesheets');
  assert.ok(files.has('index.html'), 'inline style attributes');
  assert.ok(files.has('src/Button.jsx'), 'inline style objects and Tailwind arbitrary values');

  assert.deepEqual(tailwindDeclarations('class="rounded-[12px] bg-[#2563EB] text-[12px]"'), [
    { property: 'border-radius', value: '12px' },
    { property: 'background', value: '#2563EB' },
    { property: 'font-size', value: '12px' },
  ]);
  // Tailwind's own named scale is somebody else's token set, not a raw value.
  assert.deepEqual(tailwindDeclarations('class="px-4 text-sm rounded-md"'), []);
});

test('shorthands are split rather than skipped', () => {
  const blocks = ruleBlocks('.a { padding: 12px 16px; border: 1px solid #2563EB; }');
  assert.deepEqual(blocks[0], [
    { property: 'padding', value: '12px 16px' },
    { property: 'border', value: '1px solid #2563EB' },
  ]);

  const sightings = scanCodebase(MIXED);
  const border = sightings.find((s) => s.pass === 'numbers' && s.role === 'border');
  assert.equal(border.value, '1px', 'the length in `border:` is a border width');
  assert.ok(
    sightings.some((s) => s.pass === 'colours' && s.properties.includes('border')),
    'and the colour in the same shorthand is a colour',
  );
});

test('the scan skips the directories the spec table says it skips', async () => {
  await withCodebase(async (dir) => {
    fs.mkdirSync(path.join(dir, 'node_modules', 'thing'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'thing', 'a.css'), '.x { color: #ABCDEF; }');
    assert.ok(sources().skipped.includes('node_modules'));
    const sightings = scanCodebase(dir);
    assert.ok(!sightings.some((sighting) => sighting.value === '#ABCDEF'), 'vendor code is not your design system');
  });
});

test('near-identical values cluster into one proposal, most-used representing it', () => {
  const { proposals } = tokenise(MIXED, emptySystem());
  const blue = proposalNamed(proposals, 'color-primary');
  assert.equal(blue.value, '#2563EB', 'the representative is a value that exists in the code');
  assert.deepEqual(memberValues(blue).sort(), ['#2563EB', '#2564EC']);
  assert.equal(blue.count, 16, '14 + 2 sightings, reviewed as one decision');
  assert.ok(blue.merged);

  const radius = proposalNamed(proposals, 'rounded-md');
  assert.deepEqual(memberValues(radius).sort(), ['11px', '12px']);
  assert.equal(radius.value, '12px');
});

test('values that are genuinely different stay apart', () => {
  const { proposals } = tokenise(MIXED, emptySystem());
  const blue = proposalNamed(proposals, 'color-primary');
  assert.ok(!memberValues(blue).includes('#FFFFFF'));

  // Same number, different role: a 12px radius is not an 8px padding's neighbour.
  const spacing = proposals.filter((proposal) => proposal.role === 'spacing');
  assert.ok(spacing.length >= 2);
  for (const proposal of spacing) assert.ok(!memberValues(proposal).includes('12px'));
});

test('the clustering thresholds come from the table, not from the code', () => {
  assert.equal(threshold('colours'), 3);
  assert.equal(threshold('numbers'), 1);
  assert.ok(deltaE('#2563EB', '#2564EC') < threshold('colours'));
  assert.ok(deltaE('#2563EB', '#FFFFFF') > threshold('colours'));
  assert.equal(toPx('0.75rem'), 12, 'rem is read at 16px — for comparison only');
});

test('proposals are ranked by frequency, most-used first', () => {
  const { proposals } = tokenise(MIXED, emptySystem());
  const counts = proposals.map((proposal) => proposal.count);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  assert.equal(proposals[0].name, 'color-primary', 'the blue the codebase leans on hardest leads');
});

test('names follow the documented scales', () => {
  const { proposals } = tokenise(MIXED, emptySystem());
  assert.ok(proposalNamed(proposals, 'color-primary'), 'the most-used chromatic colour');
  assert.ok(proposalNamed(proposals, 'color-surface'), 'near-white is a surface');
  assert.ok(proposalNamed(proposals, 'color-text'), 'near-black is text');
  assert.ok(proposalNamed(proposals, 'rounded-md'), 'the plan’s own radius example');
  assert.ok(proposalNamed(proposals, 'space-md'), 'the middle of three spacing steps');
  assert.ok(proposalNamed(proposals, 'highlight-small'), 'the plan’s own typography example');
});

test('a lone value on a ladder lands on the centre rung, not the smallest', () => {
  assert.deepEqual(ladderNames('radius', 1), ['rounded-md']);
  assert.deepEqual(ladderNames('radius', 2), ['rounded-sm', 'rounded-md']);
  assert.deepEqual(ladderNames('radius', 3), ['rounded-sm', 'rounded-md', 'rounded-lg']);
  assert.deepEqual(ladderNames('spacing', 3), ['space-sm', 'space-md', 'space-lg']);
  assert.equal(ladderNames('radius', 8).length, 8, 'overflow is numbered rather than dropped');
});

test('a name already taken gets a suffix rather than being reused', () => {
  const { proposals } = tokenise(MIXED, emptySystem());
  const names = proposals.map((proposal) => proposal.name);
  assert.equal(new Set(names).size, names.length, 'no two proposals claim the same name');
});

test('the role table decides which spec key a number token may fill', () => {
  assert.equal(roleForProperty('border-radius'), 'radius');
  assert.equal(roleForProperty('radius'), 'radius', 'Phyllum’s own spec key, same role');
  assert.equal(roleForProperty('padding-top'), 'spacing');
  assert.equal(roleForProperty('font-size'), null, 'type is the typography pass’s business');
});

test('a value the system already names is matched silently, not proposed again', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  const { proposals } = tokenise(MIXED, model);
  const names = proposals.map((proposal) => proposal.name);
  assert.ok(!names.includes('color-primary'), '#2563EB is already color-primary');
  assert.ok(
    !proposals.some((proposal) => memberValues(proposal).includes('#2563EB')),
    'and neither is the near-identical member that clusters with it',
  );
});

test('values are compared normalised, and recorded exactly as written', () => {
  assert.equal(normaliseValue('#ABC'), '#aabbcc');
  assert.equal(normaliseValue('  #2563EB '), '#2563eb');
  assert.equal(normaliseValue('rgb(37, 99, 235)'), 'rgb(37,99,235)');

  const model = parse(readFixture(POPULATED_FIXTURE));
  model.tokens.colours = [['color-brand', '#2563eb', 'lower case on purpose']];
  const { proposals } = tokenise(MIXED, model);
  assert.ok(
    !proposals.some((proposal) => proposal.value === '#2563EB'),
    'case is not a difference in intent',
  );
});

test('clustering is deterministic — the same codebase, the same proposals', () => {
  const once = tokenise(MIXED, emptySystem()).proposals.map((p) => `${p.name}:${p.value}:${p.count}`);
  const twice = tokenise(MIXED, emptySystem()).proposals.map((p) => `${p.name}:${p.value}:${p.count}`);
  assert.deepEqual(twice, once);
});

test('an empty project proposes nothing rather than inventing a starter set', async () => {
  await withTempDir(async (dir) => {
    const { proposals } = tokenise(dir, emptySystem());
    assert.deepEqual(proposals, []);
  });
});

test('clusterSightings groups by intent, and keeps the order it was given', () => {
  const sightings = [
    { pass: 'colours', value: '#2563EB', count: 14, files: ['a.css'], properties: ['color'] },
    { pass: 'colours', value: '#2564EC', count: 2, files: ['b.css'], properties: ['color'] },
    { pass: 'colours', value: '#FFFFFF', count: 9, files: ['a.css'], properties: ['color'] },
  ];
  const clusters = clusterSightings(sightings);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].count, 16, 'the merged blue outranks the white it beats');
  assert.equal(clusters[0].representative.value, '#2563EB');
  assert.deepEqual(clusters[0].files, ['a.css', 'b.css']);
});

// ---------------------------------------------------------------------------
// Inherited from v0.1.0 `tokenise`'s write tests — the scan-driven half.
//
// These used to run through `runTokenise`, which scanned the codebase. It reads
// prose now, so the same promises are asserted one level down, against the
// engine `assess` will drive: what the scan proposes, what acceptance writes,
// and what a rerun does. When `assess` exists these get a command to drive
// again.
// ---------------------------------------------------------------------------

test('accepting scanned proposals writes token rows into the right sections', async () => {
  await withCodebase(async (dir) => {
    const model = parse(readFixture(POPULATED_FIXTURE));
    const { proposals } = tokenise(dir, model);
    const { written } = applyAcceptance(model, proposals);
    assert.ok(written.length > 0, 'a codebase with raw values proposes something to write');

    const rendered = render(model);
    assert.ok(validateStructure(rendered).valid, 'the template contract still holds');
    const reparsed = parse(rendered);

    const colour = reparsed.tokens.colours.find((row) => row[0] === 'color-text');
    assert.ok(colour, 'a colour goes in Colours');
    assert.equal(colour[1], '#111827');
    assert.ok(colour[2].includes('used'), 'the notes cell records the sightings');

    const number = reparsed.tokens.numbers.find((row) => row[0] === 'space-md');
    assert.ok(number, 'a number goes in Numbers');
    assert.equal(number[1], '16px');
    assert.equal(number[2], 'spacing', 'the applies-to cell records the role');

    const type = reparsed.tokens.typography.find((row) => row[0] === 'highlight-large');
    assert.ok(type, 'typography goes in Typography');
    assert.deepEqual(type.slice(1), ['20px', '700', '1.2']);
  });
});

test('a merged cluster is one row, with the members it folded in on the record', async () => {
  await withCodebase(async (dir) => {
    const model = emptySystem();
    const { proposals } = tokenise(dir, model);
    applyAcceptance(model, proposals);

    const rows = model.tokens.colours.filter((row) => ['#2563EB', '#2564EC'].includes(row[1]));
    assert.equal(rows.length, 1, 'one blue, one token');
    assert.equal(rows[0][0], 'color-primary');
    assert.ok(rows[0][2].includes('#2564EC'), 'the merged member is visible in the notes');
  });
});

test('a scanned token clears the Backlog debt it pays off, and only that', async () => {
  await withCodebase(async (dir) => {
    const model = parse(readFixture(POPULATED_FIXTURE));
    assert.ok(model.backlog.includes('TODO: tokenise `8px` (Button/Primary padding-bottom)'));

    const { proposals } = tokenise(dir, model);
    applyAcceptance(model, proposals);

    assert.ok(
      !model.backlog.includes('TODO: tokenise `8px` (Button/Primary padding-bottom)'),
      'the debt this token pays off is gone',
    );
    assert.ok(
      model.backlog.includes('TODO: fill contract slot `disabled` (Button/Primary)'),
      'a skipped contract slot is a different debt, and stays until the slot is filled',
    );

    const spec = model.components.find((c) => c.name === 'Button/Primary').blocks[0].content;
    assert.ok(spec.includes('padding-bottom: space-sm'), 'the raw value became the token');
    assert.ok(spec.includes('background: color-primary'), 'a token reference is left alone');
    assert.ok(
      spec.includes('padding-top: 12px # TODO: tokenise'),
      '12px is a radius in this codebase, so it never pays off a padding’s debt',
    );
  });
});

test('a rerun after acceptance proposes nothing, and one new colour proposes exactly one', async () => {
  await withCodebase(async (dir) => {
    const model = parse(readFixture(POPULATED_FIXTURE));
    applyAcceptance(model, tokenise(dir, model).proposals);

    assert.deepEqual(tokenise(dir, model).proposals, [], 'an unchanged rerun proposes nothing');

    fs.writeFileSync(path.join(dir, 'src', 'new.css'), '.alert { color: #DC2626; }\n');
    const { proposals } = tokenise(dir, model);
    assert.equal(proposals.length, 1, 'only what is new is proposed');
    assert.equal(proposals[0].value, '#DC2626');
  });
});

// ---------------------------------------------------------------------------
// `init`'s step 4 — the seed pass is a codebase scan, so it belongs here too
// ---------------------------------------------------------------------------

test('init offers a first pass over the codebase and reports what it found', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    const { out, actions } = await execute(tokenizeLine('init'), {
      cwd: dir,
      yes: true,
      today: '2026-08-12',
    });

    assert.ok(out.includes('Step 4 — seed the system'));
    assert.ok(out.includes('read-only'));
    assert.ok(out.includes('color-primary'), 'the most-used value leads the preview');
    assert.ok(actions.some((action) => action.startsWith('tokenise-seed-')));
  });
});

test('the seeded pass names nothing on the user’s behalf', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    await execute(tokenizeLine('init'), { cwd: dir, yes: true, today: '2026-08-12' });

    const model = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
    assert.deepEqual(model.tokens.colours, [], 'a walkthrough that assumed yes must not name tokens');
    assert.deepEqual(model.tokens.numbers, []);
    assert.deepEqual(model.tokens.typography, []);
  });
});

test('declining the seed skips it, and says how to run it later', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    const { actions } = await execute(tokenizeLine('init'), {
      cwd: dir,
      yes: false,
      confirm: async (question) => !question.includes('read-only pass'),
      today: '2026-08-12',
    });
    assert.ok(actions.includes('tokenise-seed-skipped'));
  });
});

test('init on a project with no styles says so rather than showing an empty list', async () => {
  await withTempDir(async (dir) => {
    const { out } = await execute(tokenizeLine('init'), { cwd: dir, yes: true, today: '2026-08-12' });
    assert.ok(out.includes('no colours, numbers or typography to name yet'));
  });
});

// ---------------------------------------------------------------------------
// M3 — `assess` takes the engine over, and widens it
//
// Two commitments from the plan's §5.1 shape everything below. The *values* pass
// is language-agnostic: raw styling lives in theme files, config and constants as
// much as it lives in `.css`, so any text file is read for `property: value`
// pairs. *Component* detection commits to React, and says so when it does not run
// rather than reporting an empty list a pass never produced.
// ---------------------------------------------------------------------------

const emptyProject = (body) => withTempDir(body);

/** A codebase whose styling lives somewhere other than a stylesheet. */
function writePolyglot(dir) {
  fs.mkdirSync(path.join(dir, 'internal'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'theme.json'),
    JSON.stringify({ colors: { brand: '#7C3AED' }, radii: { card: '18px' }, timeout: 30 }, null, 2),
  );
  fs.writeFileSync(
    path.join(dir, 'internal', 'tokens.go'),
    'package internal\n\nconst BorderRadius = "22px"\nconst Padding = "28px"\n',
  );
  fs.writeFileSync(
    path.join(dir, 'notes.md'),
    'Our brand blue is `#123456` and the radius is `border-radius: 99px`.\n',
  );
}

test('assess writes nothing at all — not one byte, whatever it reads', async () => {
  await withCodebase(async (dir) => {
    writePolyglot(dir);
    const before = snapshotContents(dir);
    const result = assess(dir, emptySystem());
    assert.ok(result.readOnly);
    assert.ok(result.summary.rawValues > 0, 'it found something to be read-only about');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('the values pass reads any language, not just stylesheets and markup', async () => {
  await withCodebase(async (dir) => {
    writePolyglot(dir);
    const { proposals, dataFiles } = assessValues(dir, emptySystem());
    const values = proposals.map((proposal) => proposal.value);

    assert.ok(dataFiles >= 2, 'the report counts the files that are neither CSS nor markup');
    assert.ok(values.includes('#7C3AED'), 'a colour in a JSON theme file is a colour');
    assert.ok(values.includes('18px'), 'and `radii: { card }` is a corner radius');
    assert.ok(values.includes('22px'), 'a Go constant named BorderRadius is one too');

    const radius = proposals.find((proposal) => proposal.value === '18px');
    assert.equal(radius.role, 'radius', 'the property tables decide the role, in any language');
    const padding = proposals.find((proposal) => proposal.value === '28px');
    assert.equal(padding.role, 'spacing');
  });
});

test('a key the property tables do not recognise is not a design decision', async () => {
  await withCodebase(async (dir) => {
    writePolyglot(dir);
    const { sightings } = assessValues(dir, emptySystem());
    assert.ok(!sightings.some((sighting) => sighting.value === '30'), '`timeout: 30` is not spacing');
  });
});

test('documentation is not evidence: prose about a colour is not a use of it', async () => {
  await withCodebase(async (dir) => {
    writePolyglot(dir);
    const { sightings } = assessValues(dir, emptySystem());
    const files = new Set(sightings.flatMap((sighting) => sighting.files));
    assert.ok(!files.has('notes.md'), 'a README example would inflate every number in the report');
    assert.ok(!sightings.some((sighting) => sighting.value === '#123456'));
    assert.ok(!sightings.some((sighting) => sighting.value === '99px'));

    // And the rule is a table, not a hidden list in the code.
    assert.ok(textScan().skippedExtensions.includes('.md'));
    assert.ok(textScan().skippedFiles.includes('DESIGN-SYSTEM.md'));
  });
});

test("Phyllum's own record is never read as evidence of drift", async () => {
  await withCodebase(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    const { sightings } = assessValues(dir, emptySystem());
    const files = new Set(sightings.flatMap((sighting) => sighting.files));
    assert.ok(!files.has('DESIGN-SYSTEM.md'), 'the design system may not count as its own drift');
  });
});

test('a lockfile is machine output, not styling', () => {
  assert.ok(!isDataFile('package-lock.json'));
  assert.ok(!isDataFile('pnpm-lock.yaml'));
  assert.ok(!isDataFile('bundle.min.js'), 'and a minified bundle is nobody’s design decision');
  assert.ok(isDataFile('theme.json'));
  assert.ok(isDataFile('tokens.go'));
});

test('what .gitignore ignores is not part of the codebase', async () => {
  await withCodebase(async (dir) => {
    fs.mkdirSync(path.join(dir, 'generated'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'generated', 'theme.css'), '.x { color: #ABCDEF; }');
    fs.writeFileSync(path.join(dir, 'vendored.css'), '.y { color: #FEDCBA; }');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'generated/\nvendored.css\n');

    const { sightings } = assessValues(dir, emptySystem());
    const values = sightings.map((sighting) => sighting.value);
    assert.ok(!values.includes('#ABCDEF'), 'an ignored directory is not yours to systematise');
    assert.ok(!values.includes('#FEDCBA'), 'and neither is an ignored file');
    assert.ok(values.includes('#2563EB'), 'the rest of the codebase is still read');
  });
});

test('the gitignore matcher reads the common patterns, and negation', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(
      path.join(dir, '.gitignore'),
      ['# a comment', '', 'build/', '*.tmp', '/root-only.css', 'keep/*.css', '!keep/wanted.css'].join('\n'),
    );
    const ignored = gitignoreMatcher(dir);
    assert.ok(ignored('build'));
    assert.ok(ignored('build/a.css'));
    assert.ok(ignored('src/deep/build/a.css'), 'a pattern with no slash matches at any depth');
    assert.ok(ignored('a.tmp'));
    assert.ok(ignored('root-only.css'));
    assert.ok(!ignored('src/root-only.css'), 'a leading slash anchors to the root');
    assert.ok(ignored('keep/other.css'));
    assert.ok(!ignored('keep/wanted.css'), 'the last matching rule wins, so `!` un-ignores');
    assert.ok(!ignored('src/styles.css'));
  });
});

test('a project with no .gitignore ignores nothing, rather than failing', async () => {
  await withTempDir(async (dir) => {
    assert.equal(gitignoreMatcher(dir)('anything'), false);
  });
});

test('a `property: value` pair means the same fact in every syntax', () => {
  const same = [
    'border-radius: 12px;',
    '{ "borderRadius": "12px" }',
    'const BorderRadius = "12px"',
    'border_radius: 12px',
  ];
  for (const text of same) {
    const blocks = dataBlocks(text);
    assert.deepEqual(blocks[0], [{ property: 'border-radius', value: '12px' }], text);
  }

  // A theme file pluralises; the property tables do not. Both are read.
  assert.equal(resolveProperty('colors'), 'color');
  assert.equal(resolveProperty('colours'), 'color');
  assert.equal(resolveProperty('radii'), 'radius');
  assert.equal(resolveProperty('fontSizes'), 'font-size');
  assert.equal(resolveProperty('timeout'), null, 'and a key with no meaning gets none');
});

test('a comma inside a function call is not the end of a statement', () => {
  assert.deepEqual(dataBlocks('color: rgb(37, 99, 235)')[0], [
    { property: 'color', value: 'rgb(37, 99, 235)' },
  ]);
});

test('a bare literal with no property attached is not a sighting', () => {
  // A hex code in a string or a test fixture is not evidence that anything is
  // styled with it, and a number with no property has no role — so `12px` could
  // be a corner or a padding, and Phyllum does not guess which.
  assert.deepEqual(dataBlocks('const values = ["#2563EB", "12px"];'), []);
  assert.deepEqual(dataBlocks('// color: #ABCDEF is only an example\n'), []);
});

test('the covered half and the proposed half are reported separately', async () => {
  await withCodebase(async (dir) => {
    const model = parse(readFixture(POPULATED_FIXTURE));
    const { covered, uncovered, proposals, inventory } = assessValues(dir, model);

    assert.ok(covered.length > 0, 'a value the system names is coverage, not a suggestion');
    assert.ok(
      covered.some((row) => row.token === 'color-primary'),
      'and the report says which token covers it',
    );
    assert.equal(uncovered.length, proposals.length, 'everything uncovered is proposed, and only that');
    assert.equal(inventory.length, covered.length + uncovered.length, 'the table shows both halves');
    assert.deepEqual(
      inventory.map((row) => row.count),
      [...inventory.map((row) => row.count)].sort((a, b) => b - a),
      'most-used first',
    );
  });
});

test('a second assess after acceptance proposes nothing, and says so as coverage', async () => {
  await withCodebase(async (dir) => {
    const model = parse(readFixture(POPULATED_FIXTURE));
    applyAcceptance(model, assessValues(dir, model).proposals);

    const again = assessValues(dir, model);
    assert.deepEqual(again.proposals, [], 'an unchanged rerun proposes nothing');
    assert.ok(again.covered.length > 0, 'the same values are now reported as covered');

    fs.writeFileSync(path.join(dir, 'src', 'new.css'), '.alert { color: #DC2626; }\n');
    const drifted = assessValues(dir, model);
    assert.equal(drifted.proposals.length, 1, 'only what has drifted since is proposed');
    assert.equal(drifted.proposals[0].value, '#DC2626');
  });
});

test('the component pass runs on React, and only where the table says it does', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'repeated-jsx'), dir);
    const result = assess(dir, emptySystem());
    assert.equal(result.components.ran, true);
    assert.equal(result.components.reason, null);
    assert.ok(result.components.candidates.length > 0, 'a repeated pattern is a candidate');
    for (const candidate of result.components.candidates) {
      assert.ok(candidate.name.includes('/'), 'a candidate seeds a name and an archetype');
      assert.ok(candidate.count > 0);
      assert.ok(candidate.files.length > 0);
    }
  });
});

test('an unsupported stack gets the values pass and an honest note, never a fake one', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'vue-app'), dir);
    const result = assess(dir, emptySystem());

    assert.equal(result.detection.frameworkId, 'vue');
    assert.equal(result.components.ran, false);
    assert.deepEqual(result.components.candidates, []);
    assert.match(result.components.reason, /React-only in v0\.2\.0/);
    assert.match(result.components.reason, /values pass above ran in full/);

    // And "ran in full" is a claim the values actually back up.
    assert.ok(result.values.proposals.some((proposal) => proposal.value === '#2563eb'));
    assert.ok(result.values.proposals.some((proposal) => proposal.value === '8px'));
  });
});

test('which stacks the component pass commits to is a table, not a branch in the code', () => {
  assert.deepEqual(componentStacks(), ['react', 'react-next']);
  assert.ok(componentPassRuns('react'));
  assert.ok(componentPassRuns('react-next'));
  for (const stack of ['vue', 'vue-nuxt', 'svelte', 'svelte-kit', 'html', 'unknown']) {
    assert.ok(!componentPassRuns(stack), `${stack} has no component pass in v0.2.0`);
  }
});

test('an empty project reports nothing rather than inventing a starter set', async () => {
  await emptyProject(async (dir) => {
    const result = assess(dir, emptySystem());
    assert.equal(result.summary.rawValues, 0);
    assert.equal(result.summary.distinctValues, 0);
    assert.equal(result.summary.proposed, 0);
    assert.equal(result.summary.componentPassRan, false);
    assert.match(result.components.reason, /nothing here to read yet/);
    assert.ok(result.summary.clean);
  });
});

test('a codebase with no design system yet is all proposal and no coverage', async () => {
  await withCodebase(async (dir) => {
    const result = assess(dir, emptySystem());
    assert.deepEqual(result.values.covered, []);
    assert.equal(result.summary.covered, 0);
    assert.equal(result.summary.proposed, result.values.uncovered.length);
    assert.ok(result.summary.proposed > 0);
  });
});

test('the assessment is deterministic — the same codebase, the same reading', async () => {
  await withCodebase(async (dir) => {
    writePolyglot(dir);
    const fingerprint = () =>
      assess(dir, emptySystem()).values.proposals.map((p) => `${p.name}:${p.value}:${p.count}`);
    assert.deepEqual(fingerprint(), fingerprint());
  });
});

test('the scan reports how many files it read, so the number is never implied', async () => {
  await withCodebase(async (dir) => {
    writePolyglot(dir);
    const result = assess(dir, emptySystem());
    assert.ok(result.values.files >= 5, 'three source files plus the polyglot ones');
    assert.ok(result.values.dataFiles >= 2);
    assert.ok(result.values.dataFiles < result.values.files);
    assert.equal(result.summary.filesRead, result.values.files);
  });
});
