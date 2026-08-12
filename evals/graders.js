/**
 * The eval graders (plan §8.5).
 *
 * Assertions are pass/fail mechanics. Evals are scored behaviour: how well
 * `create` understands a description, whether it ever invents a value, whether
 * it leads with a token the user already named. Each eval below grades a
 * *responder* against pinned fixtures and returns a score with a threshold.
 *
 * Two responders exist, and the difference matters:
 *
 *   deterministic  Basal's own extraction, running here and now. No model is
 *                  involved, so the score is reproducible on any machine.
 *   recorded       a draft captured from a real `claude` run and committed
 *                  under evals/fixtures/recordings/. Nothing here ever calls a
 *                  model live, and nothing here fabricates what one would have
 *                  said: a missing recording is reported as missing.
 *
 * See evals/run.md for how to record, and how to re-record when the prompt or
 * the contract changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractDraft,
  gapsFor,
  suggestionsFor,
  tokenNamesOf,
} from '../lib/create.js';
import { emptyModel, parse } from '../lib/design-system.js';
import { proposeTokens, scanCodebase } from '../lib/tokenise.js';

export const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(EVALS_DIR, '..');
export const RECORDINGS_DIR = path.join(EVALS_DIR, 'fixtures', 'recordings');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, rel), 'utf8'));
const readText = (rel) => fs.readFileSync(path.join(PACKAGE_ROOT, rel), 'utf8');

/** A recorded draft for one case, or null when nobody has recorded it. */
export function readRecording(evalId, caseId) {
  const file = path.join(RECORDINGS_DIR, evalId, `${caseId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Turn one case into a draft.
 * `responder` is 'deterministic' (run the extractor) or 'recorded' (read a
 * committed model run). A recorded case with no recording returns null, and
 * the grader counts it as unrecorded rather than as a pass or a failure.
 */
function draftFor(evalId, testCase, responder, model) {
  if (responder === 'recorded') {
    const recording = readRecording(evalId, testCase.id);
    return recording ? recording.draft : null;
  }
  return extractDraft(testCase.prompt, { tokenNames: tokenNamesOf(model) });
}

const propertiesOf = (draft) =>
  Object.fromEntries((draft?.properties ?? []).map((property) => [property.key, property.value]));

const allValues = (draft) => [
  ...(draft?.properties ?? []).map((property) => property.value),
  ...(draft?.states ?? []).flatMap((state) => state.properties.map((property) => property.value)),
];

function score(points, max) {
  return { points, max, score: max === 0 ? 1 : points / max };
}

// ---------------------------------------------------------------------------
// The evals
// ---------------------------------------------------------------------------

/**
 * Prose mode reads a description the way the user meant it (plan §8.5).
 * Graded on extraction accuracy over the pinned prompts, including the
 * canonical "button primary with 12px padding-top and 8px padding-bottom".
 */
function proseExtraction(responder) {
  const spec = readJson('evals/prompts/create-prose-extraction.json');
  let points = 0;
  let max = 0;
  const failures = [];
  const unrecorded = [];

  for (const testCase of spec.cases) {
    const draft = draftFor(spec.eval, testCase, responder, null);
    if (!draft) {
      unrecorded.push(testCase.id);
      continue;
    }
    const found = propertiesOf(draft);

    max += 2; // the name and the archetype are two of the claims being graded
    if (draft.name === testCase.expected.name) points += 1;
    else failures.push(`${testCase.id}: name ${draft.name} ≠ ${testCase.expected.name}`);
    if (draft.archetype === testCase.expected.archetype) points += 1;
    else failures.push(`${testCase.id}: archetype ${draft.archetype} ≠ ${testCase.expected.archetype}`);

    for (const [key, value] of Object.entries(testCase.expected.properties)) {
      max += 1;
      if (found[key] === value) points += 1;
      else failures.push(`${testCase.id}: ${key} = ${found[key] ?? '(missing)'} ≠ ${value}`);
    }

    for (const property of Object.keys(found)) {
      if (!(property in testCase.expected.properties)) {
        max += 1;
        failures.push(`${testCase.id}: ${property} was extracted but not expected`);
      }
    }
  }

  return { ...score(points, max), failures, unrecorded, threshold: spec.threshold };
}

/**
 * Anti-fabrication: a draft may only contain values the input actually
 * supplied. This is the failure mode the whole eval exists to catch, so its
 * threshold is 1.0 and stays there.
 */
function antiFabrication(responder) {
  const spec = readJson('evals/prompts/create-anti-fabrication.json');
  let points = 0;
  let max = 0;
  const failures = [];
  const unrecorded = [];

  for (const testCase of spec.cases) {
    const model = testCase.fixture ? parse(readText(testCase.fixture)) : null;
    const draft = draftFor(spec.eval, testCase, responder, model);
    if (!draft) {
      unrecorded.push(testCase.id);
      continue;
    }
    const prompt = testCase.prompt.toLowerCase();
    const tokens = tokenNamesOf(model).map((name) => name.toLowerCase());
    for (const value of allValues(draft)) {
      max += 1;
      const text = String(value).toLowerCase();
      if (prompt.includes(text) || (tokens.includes(text) && prompt.includes(text))) points += 1;
      else failures.push(`${testCase.id}: "${value}" appears in the draft but not in the prompt`);
    }
    // A prompt that says nothing still scores: the honest answer is an empty
    // draft, and an empty draft has nothing to fabricate.
    if (allValues(draft).length === 0) {
      max += 1;
      points += 1;
    }
  }

  return { ...score(points, max), failures, unrecorded, threshold: spec.threshold };
}

/** Token-first suggestions: an existing token always outranks a raw value. */
function tokenFirst() {
  const spec = readJson('evals/prompts/create-token-first.json');
  let points = 0;
  let max = 0;
  const failures = [];

  for (const testCase of spec.cases) {
    const model = parse(readText(testCase.fixture));
    const draft = extractDraft(testCase.prompt, { tokenNames: tokenNamesOf(model) });
    const gaps = gapsFor(draft, { model });
    const gap = gaps.find((candidate) => candidate.slot === testCase.slot);
    max += 1;
    if (!gap) {
      failures.push(`${testCase.id}: ${testCase.slot} was not offered as a gap`);
      continue;
    }
    const [first] = suggestionsFor(gap, { model, evidence: testCase.evidence ?? [], archetype: draft.archetype });
    if (first && first.source === 'token' && first.token === testCase.expectedToken) points += 1;
    else {
      failures.push(
        `${testCase.id}: first suggestion for ${testCase.slot} was ${first ? `${first.source} ${first.token ?? first.value}` : '(none)'}, expected token ${testCase.expectedToken}`,
      );
    }
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

/** Extrapolation: propose what every prior component of the kind defines. */
function extrapolation() {
  const spec = readJson('evals/prompts/create-extrapolation.json');
  let points = 0;
  let max = 0;
  const failures = [];

  for (const testCase of spec.cases) {
    const model = parse(readText(testCase.fixture));
    const draft = extractDraft(testCase.prompt, { tokenNames: tokenNamesOf(model) });
    const slots = gapsFor(draft, { model }).map((gap) => gap.slot);
    max += 1;
    const proposed = slots.includes(testCase.slot);
    if (proposed === testCase.expectProposed) points += 1;
    else {
      failures.push(
        `${testCase.id}: ${testCase.slot} ${proposed ? 'was' : 'was not'} proposed; expected the opposite`,
      );
    }
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

/** Values are free: whatever the user says is recorded verbatim. */
function valuesAreFree(responder) {
  const spec = readJson('evals/prompts/create-values-free.json');
  let points = 0;
  let max = 0;
  const failures = [];
  const unrecorded = [];

  for (const testCase of spec.cases) {
    const draft = draftFor(spec.eval, testCase, responder, null);
    if (!draft) {
      unrecorded.push(testCase.id);
      continue;
    }
    const found = propertiesOf(draft);
    for (const [key, value] of Object.entries(testCase.expected.properties)) {
      max += 1;
      if (found[key] === value) points += 1;
      else failures.push(`${testCase.id}: ${key} = ${found[key] ?? '(missing)'} ≠ ${value} (verbatim)`);
    }
  }

  return { ...score(points, max), failures, unrecorded, threshold: spec.threshold };
}

// ---------------------------------------------------------------------------
// tokenise (plan §4, §8.5)
// ---------------------------------------------------------------------------

const scanCache = new Map();

/** The proposals for a fixture codebase, against an empty system. */
function proposalsForFixture(fixture) {
  if (!scanCache.has(fixture)) {
    const sightings = scanCodebase(path.join(PACKAGE_ROOT, fixture));
    scanCache.set(fixture, proposeTokens(sightings, emptyModel()));
  }
  return scanCache.get(fixture);
}

const memberCount = (proposal, value) =>
  proposal.members.find((member) => member.raw.toLowerCase() === String(value).toLowerCase())?.count ?? 0;

/**
 * Clustering: near-identical values become one proposal, and values that are
 * genuinely different stay apart. The plan's own case — `#2563EB` ×14 beside
 * `#2564EC` ×2 — has to come out as one token, not two.
 */
function clustering() {
  const spec = readJson('evals/prompts/tokenise-clustering.json');
  let points = 0;
  let max = 0;
  const failures = [];

  for (const testCase of spec.cases) {
    const proposals = proposalsForFixture(testCase.fixture).filter(
      (proposal) => !testCase.pass || proposal.pass === testCase.pass,
    );
    const covering = proposals.filter((proposal) =>
      testCase.values.some((value) => memberCount(proposal, value) > 0),
    );

    max += 1;
    if (covering.length === testCase.expectedProposals) points += 1;
    else {
      failures.push(
        `${testCase.id}: ${covering.length} proposal(s) cover ${testCase.values.join(' / ')}, expected ${testCase.expectedProposals}`,
      );
    }

    if (testCase.expectedProposals !== 1 || covering.length !== 1) continue;
    const [proposal] = covering;

    max += 1;
    if (proposal.value === testCase.representative) points += 1;
    else {
      failures.push(
        `${testCase.id}: the cluster is represented by ${proposal.value}, expected the most-used ${testCase.representative}`,
      );
    }

    for (const [value, count] of Object.entries(testCase.counts ?? {})) {
      max += 1;
      if (memberCount(proposal, value) === count) points += 1;
      else failures.push(`${testCase.id}: ${value} counted ${memberCount(proposal, value)}×, expected ${count}×`);
    }
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

/** The proposed name for one pinned cluster, from Basal or from a recording. */
function nameFor(evalId, testCase, responder) {
  if (responder === 'recorded') {
    const recording = readRecording(evalId, testCase.id);
    if (!recording) return null;
    const found = (recording.proposals ?? []).find(
      (proposal) => String(proposal.value).toLowerCase() === testCase.value.toLowerCase(),
    );
    return found ? found.name : null;
  }
  const proposal = proposalsForFixture(testCase.fixture).find(
    (candidate) => candidate.value.toLowerCase() === testCase.value.toLowerCase(),
  );
  return proposal ? proposal.name : null;
}

/**
 * Naming: would a designer recognise the name? Two claims per case, because
 * they fail differently — a name can be on the documented scale and still be
 * the wrong rung, and a name off the scale is wrong however apt it sounds.
 */
function naming(responder) {
  const spec = readJson('evals/prompts/tokenise-naming.json');
  let points = 0;
  let max = 0;
  const failures = [];
  const unrecorded = [];

  for (const testCase of spec.cases) {
    const name = nameFor(spec.eval, testCase, responder);
    if (name === null) {
      if (responder === 'recorded') unrecorded.push(testCase.id);
      else {
        max += 2;
        failures.push(`${testCase.id}: nothing was proposed for ${testCase.value}`);
      }
      continue;
    }

    max += 1;
    if (new RegExp(testCase.pattern).test(name)) points += 1;
    else failures.push(`${testCase.id}: "${name}" is not on the ${testCase.scale} scale`);

    max += 1;
    if (testCase.accepted.includes(name)) points += 1;
    else failures.push(`${testCase.id}: "${name}" is not one of ${testCase.accepted.join(', ')}`);
  }

  return { ...score(points, max), failures, unrecorded, threshold: spec.threshold };
}

export const EVALS = [
  { id: 'create-prose-extraction', modelDependent: true, run: proseExtraction },
  { id: 'create-anti-fabrication', modelDependent: true, run: antiFabrication },
  { id: 'create-token-first', modelDependent: false, run: tokenFirst },
  { id: 'create-extrapolation', modelDependent: false, run: extrapolation },
  { id: 'create-values-free', modelDependent: true, run: valuesAreFree },
  { id: 'tokenise-clustering', modelDependent: false, run: clustering },
  { id: 'tokenise-naming', modelDependent: true, run: naming },
];

/** Run every eval against one responder. */
export function runAll(responder = 'deterministic') {
  const results = {};
  for (const item of EVALS) {
    const responderForItem = item.modelDependent ? responder : 'deterministic';
    const result = item.run(responderForItem);
    results[item.id] = {
      responder: responderForItem,
      score: Number(result.score.toFixed(4)),
      threshold: result.threshold,
      points: result.points,
      max: result.max,
      passed: result.score >= result.threshold,
      failures: result.failures,
      unrecorded: result.unrecorded,
    };
  }
  return results;
}
