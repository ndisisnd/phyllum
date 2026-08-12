/**
 * Assertions about the evals themselves (plan §8.5, "eval reproducibility").
 *
 * The evals score behaviour; these checks make the scoring honest. Every eval
 * has a rubric and a pinned prompt set, every eval has a recorded baseline, and
 * no score may quietly drop below either its threshold or the number last
 * recorded. Thresholds may be raised; lowering one is a visible edit to
 * baseline.json and to the rubric, never a silent drift.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { EVALS, RECORDINGS_DIR, runAll } from '../graders.js';
import { PACKAGE_ROOT } from './helpers.js';

const baseline = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'evals', 'baseline.json'), 'utf8'));
const read = (rel) => fs.readFileSync(path.join(PACKAGE_ROOT, rel), 'utf8');

test('every eval has a rubric, a pinned prompt set and a recorded baseline', () => {
  for (const item of EVALS) {
    const rubric = `evals/rubrics/${item.id}.md`;
    const prompts = `evals/prompts/${item.id}.json`;
    assert.ok(fs.existsSync(path.join(PACKAGE_ROOT, rubric)), `missing ${rubric}`);
    assert.ok(fs.existsSync(path.join(PACKAGE_ROOT, prompts)), `missing ${prompts}`);
    assert.ok(baseline.evals[item.id], `${item.id} has no baseline score`);

    const spec = JSON.parse(read(prompts));
    assert.ok(spec.cases.length > 0, `${prompts} pins no cases`);
    assert.equal(
      spec.threshold,
      baseline.evals[item.id].threshold,
      `${item.id}: the threshold in the prompts and in the baseline disagree`,
    );
    assert.ok(/threshold/i.test(read(rubric)), `${rubric} should state its threshold`);
  }
});

test('every eval meets its threshold, and none has slipped below its baseline', () => {
  const results = runAll('deterministic');
  for (const [id, result] of Object.entries(results)) {
    assert.ok(
      result.score >= result.threshold,
      `${id}: ${result.score} is below the ${result.threshold} threshold\n  ${result.failures.join('\n  ')}`,
    );
    assert.ok(
      result.score >= baseline.evals[id].score - 1e-9,
      `${id}: ${result.score} is worse than the recorded baseline ${baseline.evals[id].score}`,
    );
  }
});

test('the baseline says when it was recorded and against which version', () => {
  assert.match(baseline.recordedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(baseline.basalVersion, JSON.parse(read('package.json')).version);
  assert.ok(/never silently lowered/i.test(baseline.note));
});

test('committed model recordings are real runs, and are graded as they are', () => {
  const modelDependent = EVALS.filter((item) => item.modelDependent).map((item) => item.id);
  let recordings = 0;

  for (const id of modelDependent) {
    const dir = path.join(RECORDINGS_DIR, id);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const record = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      recordings += 1;
      assert.equal(record.eval, id);
      assert.ok(record.model, `${id}/${file} does not say which model produced it`);
      assert.match(record.recordedAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(record.how.includes('real'), `${id}/${file} must say how it was produced`);
      // A prose `create` recording is a draft, an image one is a trace, and a
      // `tokenise` one is a set of proposed names. All three are the model's
      // own answer, committed verbatim.
      assert.ok(
        Array.isArray(record.draft?.properties) ||
          Array.isArray(record.trace?.measurements) ||
          Array.isArray(record.proposals),
        `${id}/${file} holds neither a draft, a trace, nor proposals`,
      );
    }
  }

  // Recordings are optional — a machine with no model can still run the suite —
  // but when they exist they are graded, not decorative.
  if (recordings === 0) return;
  const results = runAll('recorded');
  for (const id of modelDependent) {
    const result = results[id];
    if (result.max === 0) continue;
    assert.ok(
      result.score >= result.threshold,
      `${id} (recorded): ${result.score} is below the ${result.threshold} threshold\n  ${result.failures.join('\n  ')}`,
    );
  }
});

test('the baseline records what the committed model runs scored', () => {
  const results = runAll('recorded');
  for (const [id, recorded] of Object.entries(baseline.recordedRuns ?? {})) {
    assert.ok(results[id], `${id} is in the baseline's recorded runs but is not an eval`);
    assert.equal(
      results[id].max,
      recorded.max,
      `${id}: the recordings changed without the baseline being re-recorded`,
    );
    assert.ok(
      results[id].score >= recorded.score - 1e-9,
      `${id} (recorded): ${results[id].score} is worse than the recorded ${recorded.score}`,
    );
  }
});

test('the eval runner reports rather than throws when a recording is missing', () => {
  const results = runAll('recorded');
  for (const [id, result] of Object.entries(results)) {
    assert.ok(Array.isArray(result.unrecorded), `${id} should report its unrecorded cases`);
  }
});
