/**
 * Assertions for the `phyllum assess` command surface (v0.2.0 plan §5.1, §7).
 *
 * The engine's checks live in `assess-scan.test.js`. What is checked here is
 * everything the engine cannot see: that the command is registered and reachable,
 * that running it changes nothing on disk, that it says what it read rather than
 * implying it, that it needs no model to run, and that the reserved scope words
 * after `assess` are its own grammar rather than arguments it silently ignores.
 *
 * One promise runs through all of it. `assess` is the first Phyllum command whose
 * whole job is to read somebody else's code, so the trust it has to earn is
 * specific: reading a codebase must leave the codebase exactly as it was. Every
 * check that runs the command diffs the whole directory around it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ASSESS_SCOPES, autoAnswer, isAssessScope } from '../../lib/assess-command.js';
import { parse } from '../../lib/design-system.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { resolveCommand } from '../../lib/registry.js';
import {
  FIXTURES,
  PACKAGE_ROOT,
  POPULATED_FIXTURE,
  copyDir,
  diffSnapshots,
  readFixture,
  snapshotContents,
  snapshotPaths,
  withTempDir,
} from './helpers.js';

const MIXED = path.join(FIXTURES, 'codebases', 'tokenise-mixed');
const EMPTY_FIXTURE = path.join(FIXTURES, 'design-system', 'empty.md');

const run = (line, cwd, extra = {}) =>
  execute(tokenizeLine(line), { cwd, env: {}, yes: true, ...extra });

/** A project with a design system and a codebase full of raw values. */
async function withProject(body, fixture = EMPTY_FIXTURE, codebase = MIXED) {
  return withTempDir(async (dir) => {
    copyDir(codebase, dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(fixture));
    return body(dir);
  });
}

// ---------------------------------------------------------------------------
// Registered, reachable, and pointed at its own contract
// ---------------------------------------------------------------------------

test('assess is registered as built, with no alias, and points at its reference file', () => {
  const command = resolveCommand('assess');
  assert.ok(command, 'assess is a word Phyllum answers to');
  assert.equal(command.built, true);
  assert.deepEqual(command.aliases, [], 'one name, because there is no second spelling of it');

  const skill = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('refs/assess/'), 'SKILL.md routes assess to its own reference folder');
  assert.ok(skill.includes('| `assess` |'), 'and lists it in the command table');
});

test('help for assess is the same page whichever word order you use', async () => {
  await withProject(async (dir) => {
    const a = await run('help assess', dir);
    const b = await run('assess help', dir);
    assert.equal(b.out, a.out);
    assert.ok(!a.out.includes('not built yet'), 'it is built, and must not say otherwise');
    assert.ok(a.out.includes('read-only') || a.out.includes('read your codebase'));
  });
});

test('assess before init points at init and creates nothing', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    const before = snapshotPaths(dir);
    const { out, code } = await run('assess', dir);
    assert.equal(code, 0, 'a missing design system is a message, not a failure');
    assert.ok(out.includes('phyllum init'));
    assert.ok(out.includes('no DESIGN-SYSTEM.md here yet'));
    assert.deepEqual(snapshotPaths(dir), before, 'and nothing was created on the way');
  });
});

// ---------------------------------------------------------------------------
// Read-only, and needs nothing installed
// ---------------------------------------------------------------------------

test('running assess leaves the codebase byte for byte as it was', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { code } = await run('assess', dir, { today: '2026-08-24' });
    assert.equal(code, 0);
    // Since v0.9.0 a full run leaves the stage's output behind. Exactly one
    // file, and it is the report — everything the *user* wrote is untouched,
    // which is the promise this check has always been about.
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: ['.phyllum/assess-1.md'],
      changed: [],
      removed: [],
    });
  });
});

test('the numbered report is the only thing a run adds, and the number climbs', async () => {
  await withProject(async (dir) => {
    const first = await run('assess', dir, { today: '2026-08-24' });
    assert.equal(first.code, 0);
    assert.ok(first.out.includes('`.phyllum/assess-1.md`'), 'the run names the file it left');

    const before = snapshotContents(dir);
    const second = await run('assess', dir, { today: '2026-08-25' });
    assert.equal(second.code, 0);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: ['.phyllum/assess-2.md'],
      changed: [],
      removed: [],
    }, 'a second run adds a second report and rewrites nothing');

    const one = fs.readFileSync(path.join(dir, '.phyllum', 'assess-1.md'), 'utf8');
    const two = fs.readFileSync(path.join(dir, '.phyllum', 'assess-2.md'), 'utf8');
    assert.ok(one.startsWith('# Assessment 1\n'), 'each report knows its own number');
    assert.ok(two.startsWith('# Assessment 2\n'));
    assert.ok(one.includes('Date: 2026-08-24'), 'and carries its own date, from the injected clock');
    assert.ok(two.includes('Date: 2026-08-25'));
    assert.ok(two.includes('```phyllum-recommendations'), 'ending in the machine-readable block');
  });
});

test('a deleted report is not renumbered over — the next number is one past the highest', async () => {
  await withProject(async (dir) => {
    for (const day of ['2026-08-24', '2026-08-25', '2026-08-26']) {
      await run('assess', dir, { today: day });
    }
    fs.rmSync(path.join(dir, '.phyllum', 'assess-2.md'));
    const { out } = await run('assess', dir, { today: '2026-08-27' });
    assert.ok(out.includes('`.phyllum/assess-4.md`'), 'one past the highest, not one past the count');
    assert.equal(fs.existsSync(path.join(dir, '.phyllum', 'assess-2.md')), false, 'and 2 stays gone');
  });
});

test('`assess score` and `assess drift` write nothing at all', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    for (const mode of ['assess score', 'assess drift']) {
      const { code } = await run(mode, dir, { today: '2026-08-24' });
      assert.equal(code, 0, `${mode} runs`);
    }
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    }, 'no report, no design system, not one byte');
  });
});

test('`assess score` is the number alone; `assess drift` is the comparison alone', async () => {
  await withProject(async (dir) => {
    const score = await run('assess score', dir);
    assert.ok(score.out.includes('Drift score:'), 'the score prints the score');
    assert.ok(score.out.includes('Verdict:'), 'and the verdict beside it');
    assert.ok(score.out.includes('protocol-assess-rubric.md'), 'naming the rubric it was computed against');
    assert.ok(!score.out.includes('Step 4 — the map'), 'and nothing of the full report');
    assert.ok(!score.out.includes('Step 5 — suggestions'), 'and no review');

    const drift = await run('assess drift', dir);
    assert.ok(drift.out.includes('DESIGN-SYSTEM.md'), 'drift names what it compared against');
    assert.ok(drift.out.includes('The findings — severity'), 'and lists what did not match');
    assert.ok(!drift.out.includes('Drift score:'), 'with no score');
    assert.ok(!drift.out.includes('Step 5 — suggestions'), 'and no review');
  });
});

test('assess needs no model and no network — the scan is arithmetic', async () => {
  await withProject(async (dir) => {
    // No `claude` on PATH, no session, no `ask`, no `confirm`: `tokenise` would
    // stop here and name both routes to a model. A scan has nothing to ask.
    const { out, code } = await run('assess', dir, { env: {} });
    assert.equal(code, 0);
    assert.ok(!out.includes('Install Claude Code'));
    assert.ok(!out.includes('inside a Claude Code session'));
  });
});

test('the report says what it read and what it never wrote', async () => {
  await withProject(async (dir) => {
    fs.writeFileSync(
      path.join(dir, 'theme.json'),
      JSON.stringify({ colors: { brand: '#7C3AED' } }, null, 2),
    );
    const { out } = await run('assess', dir);

    assert.ok(out.includes('read-only'), 'the promise leads the report');
    assert.ok(/Read \d+ files/.test(out), 'and it counts the files rather than implying them');
    assert.ok(out.includes('neither a stylesheet nor markup'), 'including the ones in other languages');
    assert.ok(out.includes('Nothing was written'));
    assert.ok(out.includes('only `apply` ever writes it'), 'and names the command that does write code');
  });
});

test('the inventory leads with the value the codebase leans on hardest', async () => {
  await withProject(async (dir) => {
    const { out } = await run('assess', dir);
    const listed = out
      .split('\n')
      .filter((line) => /used \d+×/.test(line))
      .map((line) => Number(line.match(/used (\d+)×/)[1]));
    assert.ok(listed.length > 0, 'the report shows the values it found');
    assert.deepEqual(listed, [...listed].sort((a, b) => b - a), 'most-used first');
    assert.ok(out.includes('#2563EB'), 'the brand blue this fixture leans on hardest is in there');
  });
});

test('a value the design system already names is reported as coverage, not as a suggestion', async () => {
  await withProject(async (dir) => {
    const { out } = await run('assess', dir, {});
    assert.ok(out.includes('already named by your design system'));
    assert.ok(out.includes('color-primary'), 'and the token that covers it is named');
  }, POPULATED_FIXTURE);
});

test('an empty project is told it is empty rather than shown an invented list', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(EMPTY_FIXTURE));
    const { out, code } = await run('assess', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('No colours, numbers or typography written out as raw values.'));
    assert.ok(!/used \d+×/.test(out), 'nothing is listed, because nothing was found');
  });
});

test('an unsupported stack is told the component pass did not run', async () => {
  await withProject(
    async (dir) => {
      const { out } = await run('assess', dir);
      assert.ok(out.includes('Not run —'), 'the skip is stated, not left as an empty list');
      assert.ok(out.includes('React-only in v0.2.0'));
      assert.ok(out.includes('values pass above ran in full'));
      assert.ok(/used \d+×/.test(out), 'and the values pass really did run');
    },
    EMPTY_FIXTURE,
    path.join(FIXTURES, 'codebases', 'vue-app'),
  );
});

test('a React codebase is shown the patterns it repeats', async () => {
  await withProject(
    async (dir) => {
      const { out } = await run('assess', dir);
      assert.ok(out.includes('your design system has never been told about'));
      assert.ok(out.includes('used'), 'with a count, because repetition is the evidence');
    },
    EMPTY_FIXTURE,
    path.join(FIXTURES, 'codebases', 'repeated-jsx'),
  );
});

// ---------------------------------------------------------------------------
// The argument grammar
// ---------------------------------------------------------------------------

test('the five words after assess are reserved, and named where the code can read them', () => {
  assert.deepEqual(ASSESS_SCOPES, ['tokens', 'components', 'update', 'score', 'drift']);
  for (const scope of ASSESS_SCOPES) assert.ok(isAssessScope(scope));
  assert.ok(isAssessScope('TOKENS'), 'matching is case-insensitive, like every other word');
  assert.ok(!isAssessScope('all'), '`all` is `system` and `gui`’s word, not this one');
});

test('a word that is not a mode lists all five, rather than erroring', async () => {
  // The whole point of printing the list: a typo should teach the grammar. A
  // reader shown three of five words would conclude the other two do not exist.
  await withProject(async (dir) => {
    const { out, code } = await run('assess hardcoded', dir);
    assert.equal(code, 0, 'a wrong word is a message, not a failure');
    for (const scope of ASSESS_SCOPES) {
      assert.ok(out.includes(`\`${scope}\``), `the list names ${scope}`);
    }
    assert.ok(out.includes('or nothing at all'), 'and the bare command, which is the default');
  });
});

test('every track mode runs the same scan and the same report before it branches', async () => {
  await withProject(async (dir) => {
    const bare = await run('assess', dir);
    // `score` and `drift` are excluded on purpose: they are the two *halves* of
    // the reading, so neither prints the whole report the tracks share.
    for (const scope of ['tokens', 'components', 'update']) {
      const { out, code } = await run(`assess ${scope}`, dir);
      assert.equal(code, 0);
      assert.ok(out.includes('Step 3 — what your codebase uses'), `assess ${scope} still reports the scan`);
      assert.ok(out.includes('Step 4 — the map'), `assess ${scope} still shows the map`);
      assert.ok(out.includes('#2563EB'), 'off the same inventory the bare command reports');
      assert.ok(bare.out.includes('#2563EB'));
    }
  });
});

// ---------------------------------------------------------------------------
// The chained modes (plan §5.2)
// ---------------------------------------------------------------------------

test('assess tokens walks the token track and never opens the component picker', async () => {
  await withProject(
    async (dir) => {
      const { out, code } = await run('assess tokens', dir, { env: {} });
      assert.equal(code, 0);
      assert.ok(out.includes('\nTokens\n'), 'the token track ran');
      assert.ok(!out.includes('\nComponents\n'), 'and the component track did not');
    },
    EMPTY_FIXTURE,
    path.join(FIXTURES, 'codebases', 'repeated-jsx'),
  );
});

test('assess components walks the component track and never opens the token review', async () => {
  await withProject(
    async (dir) => {
      const { out, code } = await run('assess components', dir, { env: {} });
      assert.equal(code, 0);
      assert.ok(out.includes('\nComponents\n'), 'the component track ran');
      assert.ok(!out.includes('\nTokens\n'), 'and the token track did not');
      assert.ok(out.includes('your design system has never been told about'));
    },
    EMPTY_FIXTURE,
    path.join(FIXTURES, 'codebases', 'repeated-jsx'),
  );
});

test('assess components loops one candidate at a time, each with its own consent', async () => {
  await withProject(
    async (dir) => {
      // Two candidates recorded, then a skip. The skip is the exit: a fast-forward
      // that kept asking after "no" would not be a consent gate at all.
      let picks = 0;
      const { out } = await run('assess components', dir, {
        today: '2026-08-13',
        ask: async (question) => {
          if (!question.includes('Record one of these as a component?')) return 'skip';
          picks += 1;
          return picks <= 2 ? '1' : 'skip';
        },
        confirm: async () => true,
      });

      assert.equal(picks, 3, 'asked again after each recording, and once more to be told to stop');
      const recorded = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8')).components;
      assert.equal(recorded.length, 2, 'two components recorded in one looped run');
      assert.ok(out.includes('None recorded this run'), 'and the loop closes on the skip rather than looping on');
    },
    EMPTY_FIXTURE,
    path.join(FIXTURES, 'codebases', 'repeated-jsx'),
  );
});

test('bare assess records one component per run, however many patterns it found', async () => {
  await withProject(
    async (dir) => {
      let picks = 0;
      await run('assess', dir, {
        today: '2026-08-13',
        ask: async (question) => {
          if (question.includes('Record one of these as a component?')) picks += 1;
          return question.includes('Record one of these as a component?') ? '1' : 'skip';
        },
        confirm: async () => true,
      });
      assert.equal(picks, 1, 'a full assessment is not five queued create conversations');
      assert.equal(parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8')).components.length, 1);
    },
    EMPTY_FIXTURE,
    path.join(FIXTURES, 'codebases', 'repeated-jsx'),
  );
});

// ---------------------------------------------------------------------------
// `assess update` — the fast-forward, and the two limits on it
// ---------------------------------------------------------------------------

test('assess update accepts the proposed tokens with nobody to ask', async () => {
  await withProject(async (dir) => {
    // No `ask`, no `confirm`, no model, no network: the names in the map were
    // derived mechanically, so accepting them needs none of that.
    const { out, code } = await run('assess update', dir, { env: {} });
    assert.equal(code, 0);
    assert.ok(out.includes('`assess update` answered step 5 for you'));
    assert.ok(/Wrote \d+ tokens? to DESIGN-SYSTEM.md/.test(out));
    const tokens = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8')).tokens;
    assert.ok(tokens.colours.length > 0, 'and the accepted tokens really are in the file');
  }, EMPTY_FIXTURE);
});

test('assess update writes DESIGN-SYSTEM.md and not one other byte', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    await run('assess update', dir, { env: {} });
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(
      diff.added.sort(),
      ['.phyllum/assess-1.md', 'DESIGN-SYSTEM.md.bak'],
      'the two new files are the backup the funnel took before the edit, and the stage\'s own report',
    );
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.changed, ['DESIGN-SYSTEM.md'], 'the design system file is the only thing it may touch');
  }, EMPTY_FIXTURE);
});

test('assess update leaves a value whose role it could not read unnamed', async () => {
  await withProject(async (dir) => {
    fs.writeFileSync(path.join(dir, 'tokens.go'), 'package ui\n\nconst Gutter = "18px"\nconst Tint = "#7C3AED"\n');
    const { out } = await run('assess update', dir, { env: {} });

    assert.ok(out.includes('seen but not read'), 'the bucket is reported');
    assert.ok(out.includes('does not guess'), 'and the refusal is stated rather than implied');
    const file = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(!file.includes('18px'), 'a length with an unknown role is not written on a guess');
    assert.ok(!file.includes('#7C3AED'), 'and neither is a colour on a property no table names');
  }, EMPTY_FIXTURE);
});

test('assess update records no component, and says which patterns it left', async () => {
  await withProject(
    async (dir) => {
      const { out } = await run('assess update', dir, { env: {} });
      assert.ok(out.includes('Skipped — recording a component'), 'the skip is named, with its reason');
      assert.ok(out.includes('your design system has never been told about'), 'and the patterns stay on the page');
      assert.equal(
        parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8')).components.length,
        0,
        'no component was recorded without its contract being answered',
      );
    },
    EMPTY_FIXTURE,
    path.join(FIXTURES, 'codebases', 'repeated-jsx'),
  );
});

test('the auto-answer declines every question it does not recognise', () => {
  // The token review is the one shape it accepts. Everything else — a role, a
  // component pick, a question some later flow adds — is declined by default, so
  // no new conversation can be auto-accepted into by accident.
  assert.equal(autoAnswer([{ action: 'confirm' }, { action: 'skip' }]), 'y');
  assert.equal(autoAnswer([{ action: 'role' }, { action: 'role' }]), 'skip');
  assert.equal(autoAnswer([{ source: 'candidate', value: 'Card/Default' }]), 'skip');
  assert.equal(autoAnswer([{ action: 'confirm' }]), 'skip', 'confirm alone is the unread-colour question');
  assert.equal(autoAnswer([]), 'skip');
  assert.equal(autoAnswer(), 'skip');
});

test('assess update overrides the caller’s answers rather than asking them', async () => {
  await withProject(async (dir) => {
    let asked = 0;
    await run('assess update', dir, {
      env: {},
      ask: async () => {
        asked += 1;
        return 'skip';
      },
      confirm: async () => {
        asked += 1;
        return false;
      },
    });
    assert.equal(asked, 0, 'the whole point of the mode is that you are not asked');
    assert.ok(parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8')).tokens.colours.length > 0);
  }, EMPTY_FIXTURE);
});

test('a word that is not a scope gets the valid ones rather than an error', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('assess everything', dir);
    assert.equal(code, 0, 'a wrong word is not a crash');
    assert.ok(out.includes('`everything`'));
    for (const scope of ASSESS_SCOPES) assert.ok(out.includes(`\`${scope}\``), `${scope} is offered`);
    assert.ok(out.includes('nothing at all for the full assessment'));
  });
});

// ---------------------------------------------------------------------------
// The map and the suggestions (v0.2.0 plan §5.1 steps 4–5)
// ---------------------------------------------------------------------------

test('the report walks the whole pipeline, in the order it runs', async () => {
  await withProject(async (dir) => {
    const { out } = await run('assess', dir, {});
    const steps = ['Step 2 — the scan', 'Step 3 — what your codebase uses', 'Step 4 — the map', 'Step 5 — suggestions'];
    let at = -1;
    for (const step of steps) {
      const index = out.indexOf(step);
      assert.ok(index > at, `${step} is missing, or out of order`);
      at = index;
    }
  }, POPULATED_FIXTURE);
});

test('the map is a table with a coverage column, not a list of loose values', async () => {
  await withProject(async (dir) => {
    const { out } = await run('assess', dir, {});
    const header = out.split('\n').find((line) => line.includes('what it looks like'));
    assert.ok(header, 'the table names its columns');
    for (const column of ['value', 'used', 'where', 'coverage']) {
      assert.ok(header.includes(column), `the ${column} column is part of the contract`);
    }
    assert.ok(out.includes('color-primary'), 'a covered value shows the token that covers it');
    assert.ok(/\(proposed\)/.test(out), 'and an uncovered one shows the name Phyllum would give it');
    assert.ok(out.includes('Four buckets:'), 'the buckets add up in one line');
  }, POPULATED_FIXTURE);
});

test('a value seen but not read is a question on the page, never a silent drop', async () => {
  await withProject(async (dir) => {
    fs.writeFileSync(path.join(dir, 'tokens.go'), 'package ui\n\nconst AccentTint = "#7C3AED"\n');
    const { out } = await run('assess', dir, {});
    assert.ok(out.includes('#7C3AED'), 'the value is in the report');
    assert.ok(out.includes('role unknown'), 'and it says what it could not work out');
    assert.ok(out.includes('seen but not read'), 'the bucket is named in the totals');
  }, POPULATED_FIXTURE);
});

test('the suggestions are named without a model, and the review is only offered', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await run('assess', dir, { env: {} });

    assert.equal(code, 0, 'a full report is not a failure, whatever is installed');
    assert.ok(/\d+ tokens? Phyllum would propose/.test(out), 'the mechanical half names its proposals');
    assert.ok(out.includes('`phyllum create` opens the same picker'), 'and points at the way in for components');
    assert.ok(!out.includes('Install Claude Code'), 'the assessment needed no model, so it pitches none');
    assert.ok(!out.includes('inside a Claude Code session'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: ['.phyllum/assess-1.md'],
      changed: [],
      removed: [],
    }, 'and a run with nobody to ask still files its report, and still writes nothing of yours');
  }, POPULATED_FIXTURE, path.join(FIXTURES, 'codebases', 'repeated-jsx'));
});

test('assess appears in the menu and in the greeting, exactly once', async () => {
  await withProject(async (dir) => {
    const { out } = await run('menu', dir);
    const lines = out.split('\n').filter((line) => line.includes('phyllum assess'));
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes('Read the codebase'));
  });
});
