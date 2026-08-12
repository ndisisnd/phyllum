#!/usr/bin/env node
/**
 * The eval runner (plan §8.5).
 *
 * `node evals/run-evals.js` scores every eval and prints the table.
 * `node evals/run-evals.js --record` also writes evals/baseline.json, the
 * committed record of what each score was, so "never quietly worse" is a
 * checkable fact rather than a memory. The assertion suite reads that file.
 *
 * `--responder recorded` grades committed model recordings instead of Basal's
 * own extraction. Nothing here calls a model: recordings are made offline (see
 * evals/run.md) and a missing recording is reported as missing, never guessed.
 *
 * Exit code 1 when any eval is below its threshold.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { EVALS_DIR, PACKAGE_ROOT, runAll } from './graders.js';

export const BASELINE_PATH = path.join(EVALS_DIR, 'baseline.json');

const argv = process.argv.slice(2);
const record = argv.includes('--record');
const responderIndex = argv.indexOf('--responder');
const responder = responderIndex === -1 ? 'deterministic' : argv[responderIndex + 1];

function packageVersion() {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
}

export function report(results) {
  const lines = ['eval                        responder       score   threshold  result'];
  for (const [id, result] of Object.entries(results)) {
    lines.push(
      [
        id.padEnd(27),
        result.responder.padEnd(15),
        result.score.toFixed(3).padStart(5),
        result.threshold.toFixed(2).padStart(10),
        result.passed ? '  pass' : '  FAIL',
      ].join(' '),
    );
    for (const failure of result.failures) lines.push(`    ${failure}`);
    if (result.unrecorded.length > 0) {
      lines.push(`    not recorded: ${result.unrecorded.join(', ')} (see evals/run.md)`);
    }
  }
  return lines.join('\n');
}

function main() {
  const results = runAll(responder);
  process.stdout.write(`${report(results)}\n`);

  if (record) {
    // Committed model recordings are graded too, and recorded separately: the
    // deterministic score is the gate, the recorded score is the evidence that
    // the same rules work when a real model follows them.
    const recorded = runAll('recorded');
    const baseline = {
      recordedAt: new Date().toISOString().slice(0, 10),
      basalVersion: packageVersion(),
      milestone: 'M2',
      note:
        'Scores recorded by `node evals/run-evals.js --record`. Thresholds may be raised, ' +
        'never silently lowered: a lowered threshold needs a note in the change explaining why.',
      evals: Object.fromEntries(
        Object.entries(results).map(([id, result]) => [
          id,
          {
            responder: result.responder,
            score: result.score,
            threshold: result.threshold,
            points: result.points,
            max: result.max,
          },
        ]),
      ),
      recordedRuns: Object.fromEntries(
        Object.entries(recorded)
          .filter(([, result]) => result.responder === 'recorded' && result.max > 0)
          .map(([id, result]) => [
            id,
            {
              score: result.score,
              threshold: result.threshold,
              points: result.points,
              max: result.max,
              unrecordedCases: result.unrecorded,
            },
          ]),
      ),
    };
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    process.stdout.write(`\nwrote ${path.relative(PACKAGE_ROOT, BASELINE_PATH)}\n`);
  }

  return Object.values(results).every((result) => result.passed) ? 0 : 1;
}

process.exitCode = main();
