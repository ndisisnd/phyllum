/**
 * Assertions for `pipeline` (v0.8.0 M3).
 *
 * The command has two halves and they carry two different risks. The listing is
 * generated from the command table, so the checks on it ask the same question
 * `menu`'s do: does the table still describe what the user is told exists? The
 * reading is derived from files on disk, so the checks on it ask the harder
 * question: is every sentence about this project something that was actually
 * observed here? A position Phyllum could not read is the case worth pinning —
 * an unreadable file must produce no position at all, because a guessed one is
 * an invented one.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { COMMANDS, STAGES, SYSTEM_STAGE, resolveCommand } from '../../lib/registry.js';
import { EMPTY_STAGE_NOTE } from '../../lib/menu.js';
import { positionLines, readPipelineFacts, renderPipeline } from '../../lib/pipeline.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { POPULATED_FIXTURE, diffSnapshots, readFixture, snapshotContents, withTempDir } from './helpers.js';

const run = (line, ctx) => execute(tokenizeLine(line), ctx);

/** The populated fixture with one component's spec block carrying a reading. */
function withAppliedReading(value) {
  const text = readFixture(POPULATED_FIXTURE);
  const marked = text.replace('archetype: button\n', `archetype: button\napplied: ${value}\n`);
  assert.notEqual(marked, text, 'the fixture no longer has the spec block this test marks');
  return marked;
}

// ---------------------------------------------------------------------------
// The listing: the model
// ---------------------------------------------------------------------------

test('pipeline prints the four stages in pipeline order, each with its question', () => {
  const lines = renderPipeline(process.cwd()).split('\n');
  const headings = STAGES.map((stage, index) => `${index + 1}. ${stage.label} — ${stage.question}`);
  const found = lines.filter((line) => /^\d+\. /.test(line));
  assert.deepEqual(found, headings);
});

test('every command in a stage is listed under that stage, and System commands are not', () => {
  const out = renderPipeline(process.cwd());
  const listing = out.split('Where this project sits')[0];

  for (const stage of STAGES) {
    const section = listing.split(`${stage.label} — ${stage.question}`)[1] ?? '';
    const body = section.split('\n\n')[0];
    for (const command of COMMANDS.filter((c) => c.stage === stage.id)) {
      assert.ok(body.includes(command.invocation), `${command.name} is missing from ${stage.label}`);
    }
  }

  // The System grouping is named once as a grouping; no System command is listed
  // as a step of the pipeline it is not part of. The first column is compared
  // whole, so that `phyllum` cannot match `phyllum assess` and friends.
  const width = Math.max(
    ...COMMANDS.filter((c) => c.stage !== SYSTEM_STAGE).map((c) => c.invocation.length),
  );
  const listed = listing
    .split('\n')
    .filter((line) => line.startsWith('  phyllum'))
    .map((line) => line.slice(2, 2 + width).trim());
  for (const command of COMMANDS.filter((c) => c.stage === SYSTEM_STAGE)) {
    assert.ok(!listed.includes(command.invocation), `${command.name} is listed as a pipeline step`);
  }
  assert.ok(listing.includes('System is not a stage'));
});

test('a stage with no commands says so in the same words the menu uses', () => {
  const out = renderPipeline(process.cwd());
  const empty = STAGES.filter((stage) => COMMANDS.every((c) => c.stage !== stage.id));
  assert.ok(empty.length > 0, 'v0.8.0 ships two empty stages; finding none means the model changed');
  for (const stage of empty) {
    const section = out.split(`${stage.label} — ${stage.question}`)[1].split('\n\n')[0];
    assert.equal(section.trim(), EMPTY_STAGE_NOTE);
  }
});

// ---------------------------------------------------------------------------
// The reading: where the project sits
// ---------------------------------------------------------------------------

test('with no design system, the project sits before Assess', async () => {
  await withTempDir(async (dir) => {
    const result = await run('pipeline', { cwd: dir });
    assert.equal(result.code, 0);
    assert.equal(result.out, renderPipeline(dir));

    const reading = result.out.split('Where this project sits')[1];
    assert.ok(reading.includes('DESIGN-SYSTEM.md  not here'));
    assert.ok(reading.includes('before Assess'));
    // Nothing later in the pipeline may be claimed from an absent file.
    assert.ok(!reading.includes('reads as Build'));
  });
});

test('a recorded system with no `applied:` reading sits in Build', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    const { out, code } = await run('pipeline', { cwd: dir });
    assert.equal(code, 0);

    const reading = out.split('Where this project sits')[1];
    assert.ok(reading.includes('4 tokens, 2 components'), reading);
    assert.ok(reading.includes('none — no component records one'));
    assert.ok(reading.includes('That reads as Build'));
    assert.ok(reading.includes('`phyllum apply` has not recorded a reading'));
  });
});

test('a reading of `true` puts the project past Build, and `false` leaves it in Build', async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, 'DESIGN-SYSTEM.md');

    fs.writeFileSync(file, withAppliedReading('true'));
    const adopted = renderPipeline(dir).split('Where this project sits')[1];
    assert.ok(adopted.includes('1 of 1 component'), adopted);
    assert.ok(adopted.includes('That reads as past Build'));

    fs.writeFileSync(file, withAppliedReading('false'));
    const unused = renderPipeline(dir).split('Where this project sits')[1];
    assert.ok(unused.includes('none of them reads `true`'), unused);
    assert.ok(unused.includes('That reads as Build'));
    assert.ok(!unused.includes('past Build'));
  });
});

test('a design system that will not open produces facts but no position', () => {
  const facts = { present: true, unreadable: 'EACCES', tokens: 0, components: 0, readings: 0, applied: 0 };
  const lines = positionLines(facts).join('\n');
  assert.ok(lines.includes('EACCES'));
  assert.ok(lines.includes('will not place a project on facts it cannot read'));
  for (const stage of STAGES) {
    assert.ok(!lines.includes(`reads as ${stage.label}`), `a position was invented from an unreadable file`);
  }
});

test('the facts are read from disk, and .phyllum output is reported when it is there', async () => {
  await withTempDir(async (dir) => {
    assert.deepEqual(readPipelineFacts(dir), {
      present: false,
      unreadable: null,
      tokens: 0,
      components: 0,
      readings: 0,
      applied: 0,
      state: false,
      assessJson: false,
      prd: false,
    });

    fs.mkdirSync(path.join(dir, '.phyllum'));
    fs.writeFileSync(path.join(dir, '.phyllum', 'PRD.md'), '# plan\n');
    const facts = readPipelineFacts(dir);
    assert.equal(facts.state, true);
    assert.equal(facts.prd, true);
    assert.equal(facts.assessJson, false);
    assert.ok(renderPipeline(dir).includes('.phyllum/PRD.md'));
  });
});

// ---------------------------------------------------------------------------
// The command itself
// ---------------------------------------------------------------------------

test('pipeline is a System command, registered and dispatchable under one name', () => {
  const command = resolveCommand('pipeline');
  assert.ok(command, 'pipeline is not registered');
  assert.equal(command.stage, SYSTEM_STAGE);
  assert.deepEqual(command.aliases, []);
  assert.equal(command.built, true);
});

test('pipeline writes nothing, whatever it finds', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    const before = snapshotContents(dir);
    await run('pipeline', { cwd: dir });
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff, { added: [], changed: [], removed: [] });
  });
});

test('pipeline needs no design system: it runs in an empty directory and creates none', async () => {
  await withTempDir(async (dir) => {
    const { out, code } = await run('pipeline', { cwd: dir });
    assert.equal(code, 0);
    assert.ok(!out.includes('Run `phyllum init`'), 'pipeline reports the absence rather than refusing');
    assert.deepEqual(fs.readdirSync(dir), []);
  });
});
