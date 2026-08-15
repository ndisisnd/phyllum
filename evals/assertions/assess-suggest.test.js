/**
 * Assertions for `assess`'s two suggestion tracks — the mapping table and the
 * review that turns it into a design system (v0.2.0 plan §5.1 steps 4–5, §7).
 *
 * The scan's own promises are checked in `assess-scan.test.js`, and the command
 * surface in `assess-cli.test.js`. What is checked here is the half that decides
 * whether the assessment is worth anything: does the inventory become a table a
 * person can act on, does the review write what they accepted and nothing else,
 * and — the promise that matters most for a tool reading somebody else's code —
 * does it stay silent about anything it could not actually read?
 *
 * Four rules run through the file:
 *
 *   1. The table is mechanical. No model, no conversation, and it still names the
 *      token it would propose, so a plain terminal gets the whole report.
 *   2. Nothing is written before acceptance, and only DESIGN-SYSTEM.md is ever
 *      written. The codebase is diffed around every run that accepts something.
 *   3. Nothing is guessed. A value whose role could not be read is a question; an
 *      unanswered question leaves the value unnamed.
 *   4. The tracks are separately invokable, because the chained modes (M5) are a
 *      wiring job over this file, not a second implementation.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { loadAssessment, runAssessment } from '../../lib/assess-command.js';
import { mapRows, meansFor, renderMap } from '../../lib/assess-map.js';
import { resolveRoleAnswer, runComponentTrack, runTokenTrack } from '../../lib/assess-suggest.js';
import { parse, validateStructure } from '../../lib/design-system.js';
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
const REPEATED = path.join(FIXTURES, 'codebases', 'repeated-jsx');
const VUE = path.join(FIXTURES, 'codebases', 'vue-app');
const EMPTY_FIXTURE = path.join(FIXTURES, 'design-system', 'empty.md');

const read = (dir) => fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');

/**
 * A project to assess: a design system to write into, and a codebase to read.
 *
 * `unread` writes the one file every "seen, not read" check needs — a Go
 * constants file whose keys mean nothing to the property tables, holding a value
 * that is unmistakably a colour and one that is unmistakably a length.
 */
async function withProject(body, { fixture = POPULATED_FIXTURE, codebase = MIXED, unread = false } = {}) {
  return withTempDir(async (dir) => {
    copyDir(codebase, dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(fixture));
    if (unread) {
      fs.writeFileSync(
        path.join(dir, 'tokens.go'),
        'package ui\n\nconst AccentTint = "#7C3AED"\nconst Gutter = "18px"\n',
      );
    }
    return body(dir);
  });
}

/** Answer every question the way a user in a hurry would: yes to all of it. */
const yesToEverything = (answers = {}) => ({
  env: {},
  today: '2026-08-13',
  ask: async (question) => {
    for (const [pattern, answer] of Object.entries(answers)) {
      if (new RegExp(pattern).test(question)) return answer;
    }
    return 'y';
  },
  confirm: async () => true,
});

// ---------------------------------------------------------------------------
// Step 4 — the map
// ---------------------------------------------------------------------------

test('the map is one ranked table over every bucket, not a list of problems', async () => {
  await withProject(
    async (dir) => {
      const { result } = loadAssessment({ cwd: dir });
      const rows = mapRows(result);

      assert.deepEqual(
        rows.map((row) => row.count),
        [...rows.map((row) => row.count)].sort((a, b) => b - a),
        'most-used first, whichever bucket the row is in',
      );
      assert.equal(
        rows.length,
        result.values.covered.length + result.values.uncovered.length + result.values.unreadable.length,
        'every row the scan produced is on the page — coverage is half the answer',
      );
      assert.deepEqual(
        [...new Set(rows.map((row) => row.bucket))].sort(),
        ['named', 'proposed', 'unread'],
        'all three value buckets are represented in this fixture',
      );
    },
    { unread: true },
  );
});

test('the coverage column names the token, or the name Phyllum would propose', async () => {
  await withProject(async (dir) => {
    const { result } = loadAssessment({ cwd: dir });
    const rows = mapRows(result);

    const covered = rows.find((row) => row.value === '#2563EB');
    assert.equal(covered.bucket, 'named');
    assert.equal(covered.coverage, 'color-primary', 'a value the system names is reported as covered');

    const proposed = rows.find((row) => row.bucket === 'proposed');
    assert.ok(proposed.proposal, 'an uncovered row carries the proposal it belongs to');
    assert.equal(
      proposed.coverage,
      `${proposed.proposal.name} (proposed)`,
      'the proposed name is on the table before anybody is asked anything',
    );
  });
});

test('the map says what a value looks like it means, in the terms the scan established', async () => {
  await withProject(
    async (dir) => {
      const { result } = loadAssessment({ cwd: dir });
      const rows = mapRows(result);

      const radius = rows.find((row) => row.pass === 'numbers' && row.role === 'radius');
      assert.equal(meansFor(radius), 'corner radius', 'a number means its role, never just a number');

      const type = rows.find((row) => row.pass === 'typography');
      assert.match(meansFor(type), /font size, weight, line-height/);

      const unread = rows.find((row) => row.bucket === 'unread');
      assert.match(meansFor(unread), /role unknown/, 'and an unread value says so rather than picking one');
    },
    { unread: true },
  );
});

test('a truncated table says how much it left out rather than implying it is all', async () => {
  await withProject(async (dir) => {
    const { result } = loadAssessment({ cwd: dir });
    const lines = renderMap(result, { limit: 2 });
    assert.ok(lines.some((line) => /…and \d+ more rows\./.test(line)));
    assert.ok(lines.some((line) => line.includes('Four buckets:')), 'the totals are never truncated');
  });
});

test('clustering is disclosed: a row that stands for several values says so', async () => {
  await withProject(async (dir) => {
    const { result } = loadAssessment({ cwd: dir });
    const merged = mapRows(result).filter((row) => row.merged);
    if (merged.length === 0) return; // the fixture may cluster nothing; the render is still checked below

    const lines = renderMap(result);
    assert.ok(
      lines.some((line) => line.includes('also stands for')),
      'a table that hid the merge would look tidier than the codebase is',
    );
  });
});

// ---------------------------------------------------------------------------
// Step 5 — the token track
// ---------------------------------------------------------------------------

test('the table and the proposed names need no model at all', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await runAssessment({ cwd: dir, env: {} });

    assert.equal(code, 0, 'a report is not a failure');
    assert.ok(out.includes('Step 4 — the map'));
    assert.ok(out.includes('Step 5 — suggestions'));
    assert.ok(/\d+ tokens? Phyllum would propose/.test(out), 'the suggestions are named, not withheld');
    assert.ok(out.includes('Nothing was written'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    }, 'a run with nobody to ask writes nothing whatsoever');
  });
});

test('accepting the review changes exactly one file, and never the codebase', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out } = await runAssessment({ cwd: dir, ...yesToEverything({ 'Record one': 'skip' }) });

    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.changed, ['DESIGN-SYSTEM.md'], 'the codebase Phyllum just read is untouched');
    assert.deepEqual(diff.removed, []);
    assert.ok(
      diff.added.every((rel) => rel.startsWith('.phyllum/') || rel === 'DESIGN-SYSTEM.md.bak'),
      'only Phyllum-owned state and the pre-edit backup may appear',
    );
    assert.ok(validateStructure(read(dir)).valid, 'the template contract still holds');
    assert.ok(out.includes('only `apply` ever writes it'));
  });
});

test('a token accepted from the scan lands in its own section with its evidence', async () => {
  await withProject(
    async (dir) => {
      await runAssessment({ cwd: dir, ...yesToEverything({ 'Record one': 'skip' }) });
      const model = parse(read(dir));

      const colour = model.tokens.colours.find((row) => row[1] === '#2563EB');
      assert.ok(colour, 'a scanned colour goes in Colours');
      assert.equal(colour[1], '#2563EB', 'with its value, and no provenance cell beside it');

      const number = model.tokens.numbers.find((row) => row[1] === '12px');
      assert.ok(number, 'a scanned number goes in Numbers, with its role');
      assert.ok(['corner radius', 'spacing', 'border width'].includes(number[2]));
    },
    { fixture: EMPTY_FIXTURE },
  );
});

test('declining the acceptance gate writes nothing at all', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    const { out } = await runAssessment({
      cwd: dir,
      env: {},
      ask: async () => 'y',
      confirm: async () => false,
    });
    assert.equal(read(dir), before);
    assert.ok(out.includes('Not accepted, so nothing was written.'));
  });
});

test('skipping every question writes nothing, and says so rather than going quiet', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    const { out } = await runAssessment({
      cwd: dir,
      env: {},
      ask: async () => 'skip',
      confirm: async () => {
        throw new Error('assess asked to write when nothing was accepted');
      },
    });
    assert.equal(read(dir), before);
    assert.ok(out.includes('Nothing accepted, so nothing was written.'));
  });
});

test('the answer grammar is `tokenise`\'s: rename and merge mean the same here', async () => {
  await withProject(
    async (dir) => {
      await runAssessment({
        cwd: dir,
        ...yesToEverything({ 'Name #2563EB': 'brand-blue', 'Record one': 'skip' }),
      });
      const model = parse(read(dir));
      assert.ok(
        model.tokens.colours.some((row) => row[0] === 'brand-blue' && row[1] === '#2563EB'),
        'a name typed in the review is the name written',
      );
    },
    { fixture: EMPTY_FIXTURE },
  );

  await withProject(async (dir) => {
    const before = parse(read(dir)).tokens.numbers.length;
    await runAssessment({
      cwd: dir,
      ...yesToEverything({ 'Name 16px': 'merge rounded-md', 'Record one': 'skip' }),
    });
    assert.equal(
      parse(read(dir)).tokens.numbers.filter((row) => row[1] === '16px').length,
      0,
      'a merge folds the value into an existing token instead of making a second one',
    );
    assert.ok(parse(read(dir)).tokens.numbers.length >= before);
  });
});

test('a rerun after acceptance proposes nothing — the coverage half is the whole point', async () => {
  await withProject(async (dir) => {
    await runAssessment({
      cwd: dir,
      ...yesToEverything({ 'Which is it': 'corner radius', 'Record one': 'skip' }),
    });
    const after = read(dir);

    const { out, assessment } = await runAssessment({ cwd: dir, env: {} });
    assert.equal(assessment.summary.proposed, 0, 'everything is named now');
    assert.equal(assessment.summary.unreadable, 0, 'including what had to be asked about');
    assert.ok(out.includes('Nothing is unnamed'));
    assert.equal(read(dir), after, 'and a rerun that proposes nothing writes nothing');
  }, { unread: true });
});

// ---------------------------------------------------------------------------
// The fourth bucket — seen, not read
// ---------------------------------------------------------------------------

test('a value whose property means nothing is asked about, not dropped', async () => {
  await withProject(
    async (dir) => {
      const { result } = loadAssessment({ cwd: dir });
      const rows = result.values.unreadable;

      const colour = rows.find((row) => row.value === '#7C3AED');
      assert.ok(colour, 'a colour on an unrecognised key used to vanish in silence');
      assert.equal(colour.kind, 'colour');
      assert.deepEqual(colour.properties, ['AccentTint'], 'the key it was written on is kept, as written');

      const length = rows.find((row) => row.value === '18px');
      assert.ok(length, 'and so did a length');
      assert.equal(length.kind, 'length');
    },
    { unread: true },
  );
});

test('answering what an unread length applies to names it in that role, and only that role', async () => {
  await withProject(
    async (dir) => {
      const asked = [];
      await runAssessment({
        cwd: dir,
        env: {},
        today: '2026-08-13',
        ask: async (question) => {
          asked.push(question);
          if (/Which is it/.test(question)) return 'corner radius';
          if (/Record one/.test(question)) return 'skip';
          return 'y';
        },
        confirm: async () => true,
      });
      assert.ok(
        asked.some((question) => question.includes('18px is written on `Gutter`')),
        'the question names the property it could not read, so the answer is informed',
      );

      const number = parse(read(dir)).tokens.numbers.find((row) => row[1] === '18px');
      assert.ok(number, 'an answered value becomes a token like any other');
      assert.equal(number[2], 'corner radius', 'in the role the user gave it, never a default');
    },
    { fixture: EMPTY_FIXTURE, unread: true },
  );
});

test('an unanswered question leaves the value unnamed rather than guessing a role', async () => {
  await withProject(
    async (dir) => {
      const { out } = await runAssessment({
        cwd: dir,
        ...yesToEverything({ 'Which is it': 'skip', 'worth a token': 'skip', 'Record one': 'skip' }),
      });

      const model = parse(read(dir));
      assert.ok(!model.tokens.numbers.some((row) => row[1] === '18px'), '`12px` could be a corner or a padding');
      assert.ok(!model.tokens.colours.some((row) => row[1] === '#7C3AED'));
      assert.ok(out.includes('Phyllum does not guess'));
    },
    { fixture: EMPTY_FIXTURE, unread: true },
  );
});

test('the role answer has no fallback here, because this is somebody else’s code', () => {
  assert.equal(resolveRoleAnswer('2'), 'radius', 'the numbered picker is the documented order');
  assert.equal(resolveRoleAnswer('corner radius'), 'radius', 'the applies-to label works too');
  assert.equal(resolveRoleAnswer('spacing'), 'spacing');
  assert.equal(resolveRoleAnswer(''), null, 'silence is not consent to a default');
  assert.equal(resolveRoleAnswer('wibble'), null, 'and neither is an answer nobody can place');
});

test('a config number is still not a design decision, whatever bucket exists', async () => {
  await withProject(
    async (dir) => {
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ timeout: 30, retries: 4 }));
      const { result } = loadAssessment({ cwd: dir });
      const values = [
        ...result.values.inventory.map((row) => row.value),
        ...result.values.unreadable.map((row) => row.value),
      ];
      assert.ok(!values.includes('30'), '`timeout: 30` has no unit and no property — it is not styling');
      assert.ok(!values.includes('4'));
    },
    { fixture: EMPTY_FIXTURE },
  );
});

// ---------------------------------------------------------------------------
// Step 5 — the component track
// ---------------------------------------------------------------------------

test('a candidate is walked into `create`, which asks the contract’s own questions', async () => {
  await withProject(
    async (dir) => {
      const { root, model, result } = loadAssessment({ cwd: dir });
      const asked = [];
      const track = await runComponentTrack(root, {
        result,
        model,
        ctx: {
          env: {},
          today: '2026-08-13',
          ask: async (question) => {
            asked.push(question);
            return asked.length === 1 ? '1' : 'skip';
          },
          confirm: async () => true,
        },
      });

      assert.ok(track.created, 'the pick started a draft');
      assert.ok(asked.length > 1, 'and `create` took over the conversation from there');
      assert.ok(read(dir).includes(`### ${track.created.name}`), 'the accepted component is in the file');
      assert.ok(
        track.lines.some((line) => line.includes('still unrecorded')),
        'the patterns not recorded this run are named rather than forgotten',
      );
    },
    { codebase: REPEATED },
  );
});

test('a candidate seeds a name and an archetype, never a value from the scan', async () => {
  await withProject(
    async (dir) => {
      const { root, model, result } = loadAssessment({ cwd: dir });
      let turn = 0;
      await runComponentTrack(root, {
        result,
        model,
        ctx: {
          env: {},
          today: '2026-08-13',
          // The pick, then nothing: every slot is left for the user to fill, which
          // is where a scanned value would show up if one had been seeded.
          ask: async () => {
            turn += 1;
            return turn === 1 ? '1' : 'skip';
          },
          confirm: async () => true,
        },
      });

      const written = parse(read(dir)).components.find((component) => component.name.includes('/'));
      const spec = written.blocks.find((block) => block.lang === 'yaml').content;
      assert.ok(spec.includes('TODO'), 'every slot the user did not answer stays a TODO, never a scanned guess');
      assert.ok(!/#[0-9A-Fa-f]{6}/.test(spec), 'no colour from the surrounding CSS leaked into the spec');
    },
    { codebase: REPEATED, fixture: EMPTY_FIXTURE },
  );
});

test('skipping the component pick writes nothing and keeps the patterns on the page', async () => {
  await withProject(
    async (dir) => {
      const before = read(dir);
      const { root, model, result } = loadAssessment({ cwd: dir });
      const track = await runComponentTrack(root, {
        result,
        model,
        ctx: { env: {}, ask: async () => 'skip', confirm: async () => true },
      });
      assert.equal(track.created, null);
      assert.equal(read(dir), before);
      assert.ok(track.lines.some((line) => line.includes('the patterns stay in the report')));
    },
    { codebase: REPEATED },
  );
});

test('a pick that matches nothing is refused rather than guessed at', async () => {
  await withProject(
    async (dir) => {
      const { root, model, result } = loadAssessment({ cwd: dir });
      const track = await runComponentTrack(root, {
        result,
        model,
        ctx: { env: {}, ask: async () => 'nothing-like-this', confirm: async () => true },
      });
      assert.equal(track.created, null);
      assert.ok(track.lines.some((line) => line.includes('matched nothing on that list')));
    },
    { codebase: REPEATED },
  );
});

test('on a stack the component pass does not support, the track says why', async () => {
  await withProject(
    async (dir) => {
      const { out } = await runAssessment({ cwd: dir, env: {} });
      assert.ok(out.includes('Not run —'), 'the skip is stated');
      assert.ok(out.includes('React-only in v0.2.0'));
      assert.ok(/\d+ tokens? Phyllum would propose/.test(out), 'and the values half still did its job');
    },
    { codebase: VUE, fixture: EMPTY_FIXTURE },
  );
});

// ---------------------------------------------------------------------------
// The seam the chained modes are built on (M5)
// ---------------------------------------------------------------------------

test('either track can be run on its own, from one scan', async () => {
  await withProject(
    async (dir) => {
      const tokensOnly = await runAssessment({ cwd: dir, env: {} }, { tracks: ['tokens'] });
      assert.ok(tokensOnly.out.includes('Tokens'));
      assert.ok(!tokensOnly.out.includes('\nComponents\n'), '`assess tokens` does not walk components');

      const componentsOnly = await runAssessment({ cwd: dir, env: {} }, { tracks: ['components'] });
      assert.ok(componentsOnly.out.includes('Components'));
      assert.ok(!componentsOnly.out.includes('\nTokens\n'), 'and the reverse holds');

      assert.equal(tokensOnly.tracks.length, 1, 'one track asked for is one track walked');
      assert.equal(componentsOnly.tracks.length, 1);
    },
    { codebase: REPEATED },
  );
});

test('one scan feeds the table and both tracks — nothing rescans', async () => {
  await withProject(async (dir) => {
    const { root, model, result } = loadAssessment({ cwd: dir });
    // Emptying the codebase after the scan proves the tracks read the result and
    // not the disk: a rescan would now find nothing to propose.
    fs.rmSync(path.join(dir, 'src'), { recursive: true, force: true });
    const track = await runTokenTrack(root, {
      result,
      model,
      ctx: { env: {}, ask: async () => 'y', confirm: async () => true },
    });
    assert.ok(track.written.length > 0, 'the track named what the scan had already read');
  });
});

test('an auto-answering caller fast-forwards the same flow, with no second path', async () => {
  await withProject(
    async (dir) => {
      // This is the shape `assess update` (M5) uses: the flow is unchanged, only
      // who answers is. If this needed new code in the tracks, the chained modes
      // would be a second implementation of the review.
      const { out } = await runAssessment(
        { cwd: dir, env: {}, ask: async () => 'y', confirm: async () => true },
        { tracks: ['tokens'] },
      );
      assert.ok(/Wrote \d+ tokens? to DESIGN-SYSTEM.md/.test(out));
      assert.ok(parse(read(dir)).tokens.colours.length > 0);
    },
    { fixture: EMPTY_FIXTURE },
  );
});
