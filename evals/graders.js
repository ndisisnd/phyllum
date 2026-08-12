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
 *   deterministic  Phyllum's own extraction, running here and now. No model is
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

import { contractFor, traceRuleFor } from '../lib/archetypes.js';
import { scanCandidates } from '../lib/candidates.js';
import {
  extractDraft,
  gapsFor,
  suggestionsFor,
  tokenNamesOf,
} from '../lib/create.js';
import { emptyModel, parse } from '../lib/design-system.js';
import { codeViewFor, detectProject } from '../lib/detect.js';
import { ingestTrace, mergeTraceGaps, withinTolerance } from '../lib/trace.js';
import { proposeTokens, scanCodebase } from '../lib/tokenise.js';

export const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(EVALS_DIR, '..');
export const RECORDINGS_DIR = path.join(EVALS_DIR, 'fixtures', 'recordings');

/** The milestone the committed baseline belongs to, and the release it gates. */
export const MILESTONE = 'M6';
export const RELEASE = 'v1';

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
// create — image mode (plan §3.1 Mode B, §8.5)
// ---------------------------------------------------------------------------

/**
 * The trace result for one case. `deterministic` reads the pinned trace fixture
 * — a plausible reply in the documented shape, committed so the grading is
 * reproducible without a model. `recorded` reads a real `claude` trace of the
 * same image; a missing one is reported as missing.
 */
function traceFor(evalId, testCase, responder) {
  if (responder === 'recorded') {
    const recording = readRecording(evalId, testCase.id);
    return recording ? recording.trace ?? null : null;
  }
  return readJson(testCase.trace);
}

/**
 * Image mode: measured within tolerance, unsure becomes a question, and nothing
 * an image cannot show ever becomes a value.
 */
function imageTrace(responder) {
  const spec = readJson('evals/prompts/create-image-trace.json');
  const truthFile = readJson(spec.groundTruth);
  let points = 0;
  let max = 0;
  const failures = [];
  const unrecorded = [];

  for (const testCase of spec.cases) {
    const result = traceFor(spec.eval, testCase, responder);
    if (!result) {
      unrecorded.push(testCase.id);
      continue;
    }

    const { draft, questions, refused } = ingestTrace(result, { file: testCase.image });
    const truth = truthFile.images[path.basename(testCase.image)].properties;
    const measured = new Map(draft.properties.map((property) => [property.key, property.value]));
    const asked = new Set(questions.map((question) => question.property));
    const dropped = new Set(refused.map((item) => item.property));

    // Measurements that cleared their bar are in the draft, and are true.
    for (const property of testCase.expectMeasured) {
      max += 2;
      if (!measured.has(property)) {
        failures.push(`${testCase.id}: ${property} was measured but is not in the draft`);
        continue;
      }
      points += 1;
      const rule = traceRuleFor(property);
      if (withinTolerance(rule, measured.get(property), truth[property])) points += 1;
      else {
        failures.push(
          `${testCase.id}: ${property} traced ${measured.get(property)}, ground truth ${truth[property]} — outside ${rule?.tolerance}`,
        );
      }
    }

    // Everything unsure or unseeable is a question, and is not a value.
    for (const property of testCase.expectQuestions) {
      max += 2;
      if (asked.has(property)) points += 1;
      else failures.push(`${testCase.id}: ${property} should have become a follow-up question`);
      if (!measured.has(property)) points += 1;
      else failures.push(`${testCase.id}: ${property} was recorded as ${measured.get(property)} despite being unsure`);
    }

    // A claim about something a still image cannot show is refused outright.
    for (const property of testCase.expectRefused ?? []) {
      max += 2;
      if (dropped.has(property)) points += 1;
      else failures.push(`${testCase.id}: the claim about ${property} should have been refused`);
      if (!measured.has(property)) points += 1;
      else failures.push(`${testCase.id}: ${property} reached the draft, and an image cannot show it`);
    }

    // Nothing in the draft that the trace did not measure.
    const claimed = new Set(
      (result.measurements ?? []).map((measurement) => String(measurement?.property ?? '')),
    );
    max += 1;
    const invented = [...measured.keys()].filter((property) => !claimed.has(property));
    if (invented.length === 0) points += 1;
    else failures.push(`${testCase.id}: ${invented.join(', ')} appear in the draft but were never measured`);

    // States are never traced from a still image; they are always asked about.
    const contract = contractFor(testCase.archetype);
    const gapSlots = new Set(
      mergeTraceGaps(questions, gapsFor(draft, { model: null })).map((gap) => gap.slot),
    );
    max += 1;
    const missedStates = (contract?.states ?? []).filter((state) => !gapSlots.has(state));
    if (missedStates.length === 0 && draft.states.length === 0) points += 1;
    else {
      failures.push(
        `${testCase.id}: states ${missedStates.join(', ') || '(recorded from the image)'} were not left as questions`,
      );
    }
  }

  return { ...score(points, max), failures, unrecorded, threshold: spec.threshold };
}

// ---------------------------------------------------------------------------
// create — pick mode (plan §3.1 Mode C, §8.5)
// ---------------------------------------------------------------------------

const candidateCache = new Map();

function candidatesFor(testCase) {
  const key = `${testCase.fixture}|${testCase.designSystem}`;
  if (!candidateCache.has(key)) {
    const model = parse(readText(testCase.designSystem));
    candidateCache.set(key, scanCandidates(path.join(PACKAGE_ROOT, testCase.fixture), model));
  }
  return candidateCache.get(key);
}

/** Pick mode: the repeated pattern shows up, and nothing else sneaks in. */
function pickCandidates() {
  const spec = readJson('evals/prompts/create-pick-candidates.json');
  let points = 0;
  let max = 0;
  const failures = [];

  for (const testCase of spec.cases) {
    const candidates = candidatesFor(testCase);
    const found = candidates.find((candidate) => candidate.signature === testCase.signature);

    if (testCase.expect === 'absent') {
      max += 1;
      if (!found) points += 1;
      else failures.push(`${testCase.id}: ${testCase.signature} was proposed and should not have been`);
      continue;
    }

    max += 1;
    if (!found) {
      failures.push(`${testCase.id}: ${testCase.signature} is not in the candidate list`);
      continue;
    }
    points += 1;

    max += 1;
    if (found.name === testCase.name) points += 1;
    else failures.push(`${testCase.id}: named ${found.name}, expected ${testCase.name}`);

    max += 1;
    if (found.archetype === testCase.archetype) points += 1;
    else failures.push(`${testCase.id}: archetype ${found.archetype}, expected ${testCase.archetype}`);

    max += 1;
    if (found.count >= testCase.minCount) points += 1;
    else failures.push(`${testCase.id}: counted ${found.count}×, expected at least ${testCase.minCount}×`);
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
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

/** The proposed name for one pinned cluster, from Phyllum or from a recording. */
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

// ---------------------------------------------------------------------------
// init — step 1 detection (plan §6.5, §3.3, §8.5)
// ---------------------------------------------------------------------------

/**
 * The deterministic core of "look before asking": what framework is this, how
 * is it styled, what design artefacts exist, and what will the code view be?
 * All four are facts about a pinned fixture, so they are scored here. The prose
 * half of step 1 needs a model judge and stays with the rubric — see
 * evals/rubrics/init-detection.md.
 */
function initDetection() {
  const spec = readJson('evals/prompts/init-detection.json');
  let points = 0;
  let max = 0;
  const failures = [];

  for (const testCase of spec.cases) {
    // No responder switch here on purpose: this half of step 1 is a fact about
    // a pinned fixture, so there is nothing for a model to answer differently.
    const detection = detectProject(path.join(PACKAGE_ROOT, testCase.fixture));
    const expected = testCase.expected;

    max += 1;
    if (detection.framework === expected.framework) points += 1;
    else failures.push(`${testCase.id}: framework ${detection.framework} ≠ ${expected.framework}`);

    max += 1;
    if (detection.styling === expected.styling) points += 1;
    else failures.push(`${testCase.id}: styling ${detection.styling} ≠ ${expected.styling}`);

    max += 1;
    const artefacts = [...(detection.artefacts ?? [])].sort();
    if (artefacts.join(',') === [...expected.artefacts].sort().join(',')) points += 1;
    else {
      failures.push(
        `${testCase.id}: artefacts ${artefacts.join(', ') || '(none)'} ≠ ${expected.artefacts.join(', ') || '(none)'}`,
      );
    }

    // The code view has to be right about itself: React + CSS every time, and
    // honest about whether that was detected or defaulted to (plan §3.3, §9).
    max += 1;
    const codeView = detection.codeView ?? codeViewFor(detection);
    const wanted = expected.codeView;
    if (
      codeView.language === wanted.language &&
      codeView.styling === wanted.styling &&
      Boolean(codeView.fallback) === wanted.fallback &&
      (!codeView.fallback || String(codeView.reason ?? '').length > 0)
    ) {
      points += 1;
    } else {
      failures.push(
        `${testCase.id}: code view ${codeView.language} + ${codeView.styling}` +
          `${codeView.fallback ? ' (fallback)' : ''} ≠ ${wanted.language} + ${wanted.styling}` +
          `${wanted.fallback ? ' (fallback)' : ''}`,
      );
    }
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

export const EVALS = [
  { id: 'init-detection', modelDependent: false, run: initDetection },
  { id: 'create-prose-extraction', modelDependent: true, run: proseExtraction },
  { id: 'create-anti-fabrication', modelDependent: true, run: antiFabrication },
  { id: 'create-token-first', modelDependent: false, run: tokenFirst },
  { id: 'create-extrapolation', modelDependent: false, run: extrapolation },
  { id: 'create-values-free', modelDependent: true, run: valuesAreFree },
  { id: 'create-image-trace', modelDependent: true, run: imageTrace },
  { id: 'create-pick-candidates', modelDependent: false, run: pickCandidates },
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
