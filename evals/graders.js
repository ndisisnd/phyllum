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
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { contractFor, traceRuleFor } from '../lib/archetypes.js';
import { commandLine, detectInstall, updateCommandFor } from '../lib/install-method.js';
import { assess, assessValues } from '../lib/assess.js';
import { renderAssessment } from '../lib/assess-command.js';
import { FAMILIES, renderFindings, renderScore } from '../lib/assess-report.js';
import { countFamilies, driftMass, scoreAssessment } from '../lib/assess-score.js';
import { scanCandidates } from '../lib/candidates.js';
import { detectHarness } from '../lib/harness-detect.js';
import { deriveRamp, neutralRampRows, walkPrimitives } from '../lib/primitives.js';
import { buildPhases, componentChanges, criterionFields, tokenChanges } from '../lib/prd.js';
import { applyFile, classifyCriterion, rawLiteralRemains } from '../lib/apply-mechanical.js';
import { verifyCriterion } from '../lib/apply-run.js';
import {
  extractDraft,
  gapsFor,
  suggestionsFor,
  tokenNamesOf,
} from '../lib/create.js';
import { emptyModel, parse } from '../lib/design-system.js';
import { codeViewFor, detectProject } from '../lib/detect.js';
import { ingestTrace, mergeTraceGaps, withinTolerance } from '../lib/trace.js';
import { applyAcceptance, proposeTokens, scanCodebase } from '../lib/tokenise.js';
import { accepted, decide, questionFor } from '../lib/tokenise-command.js';
import {
  existingTokenFor,
  parseProse,
  proposalFrom,
  suggestName,
  takenNames,
} from '../lib/tokenise-prose.js';
import {
  actionFor,
  actionRules,
  extraRules,
  hygieneRules,
  lintRules,
  namingRules,
  propRules,
  scoreStepFor,
  similarityRules,
} from '../lib/tokenise-spec.js';

export const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(EVALS_DIR, '..');
export const RECORDINGS_DIR = path.join(EVALS_DIR, 'fixtures', 'recordings');

/**
 * The milestone the committed baseline belongs to, and the release it gates.
 *
 * Re-stamped for v0.2.0 in M8, which is the release's hardening milestone and the
 * only place the baseline is fully re-recorded. Two things changed with it:
 *
 *   - **The release is `v0.2.0`, not `v1`.** The old stamp said `v1` because the
 *     v0.1.0 baseline *was* the first one; carrying it into a second release made
 *     "which release does this bar belong to" unanswerable from the file.
 *   - **Two evals were renamed.** `tokenise-clustering` and `tokenise-naming`
 *     both grade a scan of a fixture *codebase*, which has been `assess`'s job
 *     since M3 — so they are `assess-clustering` and `assess-naming` now. An id
 *     is part of the recorded baseline, so a rename is only honest in a release
 *     that re-records one, which is why it waited for here.
 *
 * The bar itself only ever tightens. Every score the v0.1.0 baseline recorded is
 * still met or beaten, and no threshold has ever been lowered.
 *
 * Re-stamped again in v0.2.1 M1, and for one reason: that milestone adds an eval
 * (`assess-severity`), and an eval that exists must have a recorded score or the
 * baseline is no longer a complete bar. The **release** stamp deliberately stays
 * `v0.2.0` — the bar being cleared is still the released one, and v0.2.1's own
 * bar is stamped in its hardening milestone, where the version is bumped and the
 * whole file is re-recorded at once.
 *
 * And again in v0.2.1 M2, for the same reason and with the same restraint:
 * `assess-hygiene` joins the list, so the bar is re-recorded to stay complete,
 * and the release stamp still says `v0.2.0` because that is still the released
 * bar being cleared. No threshold moved.
 *
 * M3 adds `assess-similarity` on exactly the same terms. The stamp moves, the
 * release does not, and every score the last recording held is met again.
 *
 * And M4 adds `assess-consistency`, the fourth time and the last of the
 * assessment-depth milestones to add a family of its own. Same terms again: the
 * stamp moves, the release stays where it is, no threshold is lowered.
 *
 * M5 adds `assess-report`, and it is a different kind of addition: the first
 * eval that grades the assessment as a whole rather than one family of finding —
 * the six smaller checks, the drift score, the verdict, and the report that
 * groups every finding into one row shape. Same terms as the four before it. The
 * stamp moves to `v0.2.1 M5`, the release stamp stays `v0.2.0` because that is
 * still the released bar being cleared, and no threshold is lowered.
 *
 * M6 is the milestone where the **release** stamp finally moves. Five milestones
 * kept it at `v0.2.0` on purpose — until a release is cut, the bar every change
 * has to clear is the last released one, and moving the stamp early would have
 * meant each milestone measuring itself against the milestone before it rather
 * than against the last thing a user could install. M6 cuts the release, so
 * `v0.2.1` becomes the bar the next release will have to clear. Nineteen evals,
 * every one at 1.000, no threshold lowered and none ever has been.
 */
export const MILESTONE = 'v0.2.1 M6';
export const RELEASE = 'v0.2.1';

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
  // A `custom` case is the contract-free mode (v0.3.0 §6.7): the user has
  // already answered "which kind of component is this?" with "none of them", so
  // the sentence is read for exactly what it says and the name comes from them.
  return extractDraft(testCase.prompt, {
    tokenNames: tokenNamesOf(model),
    custom: testCase.custom === true,
    name: testCase.name ?? null,
  });
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

    // The claim custom mode exists to make: no contract, so no gap list — and
    // therefore no slot proposed that the description never mentioned (§6.7).
    if (testCase.custom) {
      max += 1;
      const gaps = gapsFor(draft, { model: null }).map((gap) => gap.slot);
      if (gaps.length === 0) points += 1;
      else failures.push(`${testCase.id}: a custom was asked for ${gaps.join(', ')}`);
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
    // `create primitives` is the other thing `create` offers before you choose
    // (v0.3.0 §5.1). It is graded here because the claim is the same one the
    // picker makes: what Phyllum puts in front of you, and in what order —
    // never a ramp nobody asked for. The walk is the command's own loop with
    // the answers pinned and the I/O left out.
    if (testCase.kind === 'primitives') {
      const model = emptyModel();
      model.tokens.colours = (testCase.colours ?? []).map(([token, value]) => [token, value]);
      for (const base of testCase.existingRamps ?? []) {
        const value = (testCase.colours ?? []).find(([token]) => token === base)?.[1];
        const rows = base === 'neutral' ? neutralRampRows() : deriveRamp(base, value);
        for (const row of rows) model.tokens.primitives.push([row.token, row.value]);
      }
      const walk = walkPrimitives(model, testCase.answers ?? {});

      max += 1;
      if (walk.asked.join(' + ') === testCase.expect.asked.join(' + ')) points += 1;
      else failures.push(`${testCase.id}: asked ${walk.asked.join(', ') || '(nothing)'}, expected ${testCase.expect.asked.join(', ')}`);

      max += 1;
      const proposed = walk.proposed.map((offer) => offer.base);
      if (proposed.join(' + ') === testCase.expect.proposed.join(' + ')) points += 1;
      else failures.push(`${testCase.id}: proposed ${proposed.join(', ') || '(nothing)'}, expected ${testCase.expect.proposed.join(', ') || '(nothing)'}`);

      // The order claim, which is the point of the whole eval: nothing is
      // proposed for a token whose question was never asked.
      max += 1;
      if (proposed.every((base) => walk.asked.includes(base))) points += 1;
      else failures.push(`${testCase.id}: proposed a ramp for a token it never asked about`);
      continue;
    }

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
// assess — clustering and naming over a real codebase (v0.2.0 §5.1, §7)
// ---------------------------------------------------------------------------
//
// These two graded `tokenise` until v0.2.0, and the ids said so until M8. They
// never moved: what moved was the command. v0.2.0's division is that **assess
// reads code, tokenise reads prose**, and both graders here scan a fixture
// *codebase* — so they were, in substance, assess's evals filed under the wrong
// name. Renaming them is the last chance to do it: an id is part of the recorded
// baseline, so it can only change in a release that re-records one.

const scanCache = new Map();

/** The proposals for a fixture codebase, against an empty system. */
function proposalsForFixture(fixture, scan = 'sources') {
  const key = `${scan}:${fixture}`;
  if (!scanCache.has(key)) {
    // `assess` widens the sweep to every text file, whatever the language, so a
    // case about a theme file in JSON or Go has to be scanned the way `assess`
    // scans. The default stays the extension-gated sweep, so every case pinned
    // before this is graded by exactly the same reading as before.
    const proposals =
      scan === 'assess'
        ? assessValues(path.join(PACKAGE_ROOT, fixture), emptyModel()).proposals
        : proposeTokens(scanCodebase(path.join(PACKAGE_ROOT, fixture)), emptyModel());
    scanCache.set(key, proposals);
  }
  return scanCache.get(key);
}

const memberCount = (proposal, value) =>
  proposal.members.find((member) => member.raw.toLowerCase() === String(value).toLowerCase())?.count ?? 0;

/**
 * Clustering: near-identical values become one proposal, and values that are
 * genuinely different stay apart. The plan's own case — `#2563EB` ×14 beside
 * `#2564EC` ×2 — has to come out as one token, not two.
 */
function clustering() {
  const spec = readJson('evals/prompts/assess-clustering.json');
  let points = 0;
  let max = 0;
  const failures = [];

  for (const testCase of spec.cases) {
    const proposals = proposalsForFixture(testCase.fixture, testCase.scan).filter(
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
  const spec = readJson('evals/prompts/assess-naming.json');
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
// assess — severity and rule families (v0.2.1 §3.1, §3.2)
// ---------------------------------------------------------------------------

/**
 * How much does a finding matter, and what kind of finding is it?
 *
 * Both halves of v0.2.1's lint path over one pinned codebase, and both are
 * facts rather than judgements — a value's severity is a function of how often
 * it is written, and its family is a row in a table. So there is no responder
 * switch and no headroom in the threshold.
 *
 * The cases that outrank the rest are the two that assert an absence: a
 * `box-shadow: none` proposing nothing, and the `1px` inside a border shorthand
 * not being counted a second time as a length. Double-counting is the failure
 * the compound passes introduce if the scalar reading is not stood down, and it
 * is invisible in any check that only looks at what *is* reported.
 */
function assessSeverity() {
  const spec = readJson('evals/prompts/assess-severity.json');
  const result = assess(path.join(PACKAGE_ROOT, spec.fixture), emptyModel());
  const { proposals, unreadable } = result.values;
  let points = 0;
  let max = 0;
  const failures = [];

  const claim = (ok, why) => {
    max += 1;
    if (ok) points += 1;
    else failures.push(why);
  };

  const sameValue = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

  for (const testCase of spec.cases) {
    if (testCase.kind === 'absent') {
      claim(
        !proposals.some(
          (proposal) =>
            sameValue(proposal.value, testCase.value) ||
            proposal.members.some((member) => sameValue(member.raw, testCase.value)),
        ),
        `${testCase.id}: ${testCase.value} was proposed, and should not have been`,
      );
      continue;
    }

    if (testCase.kind === 'unread') {
      const row = unreadable.find((item) => sameValue(item.value, testCase.value));
      claim(Boolean(row), `${testCase.id}: ${testCase.value} is not in the seen-but-not-read bucket`);
      if (!row) continue;
      claim(
        row.severity === testCase.expected.severity && row.rule === null,
        `${testCase.id}: severity ${row.severity} / rule ${row.rule ?? 'none'}, expected ${testCase.expected.severity} and no rule`,
      );
      continue;
    }

    const proposal = proposals.find((item) => sameValue(item.value, testCase.value));
    if (!proposal) {
      max += 5;
      failures.push(`${testCase.id}: nothing was proposed for ${testCase.value}`);
      continue;
    }
    const expected = testCase.expected;

    claim(proposal.rule === expected.rule, `${testCase.id}: rule ${proposal.rule} ≠ ${expected.rule}`);
    claim(
      proposal.severity === expected.severity,
      `${testCase.id}: severity ${proposal.severity} ≠ ${expected.severity} (used ${proposal.count}×)`,
    );
    claim(proposal.count === expected.count, `${testCase.id}: counted ${proposal.count}×, expected ${expected.count}×`);
    claim(
      proposal.appliesTo === expected.appliesTo,
      `${testCase.id}: applies to "${proposal.appliesTo}", expected "${expected.appliesTo}"`,
    );
    claim(
      new RegExp(expected.name).test(proposal.name),
      `${testCase.id}: "${proposal.name}" is not a name on the documented ladder`,
    );
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

// ---------------------------------------------------------------------------
// assess — hygiene: collisions and unused (v0.2.1 §6.1, §6.2)
// ---------------------------------------------------------------------------

/**
 * What collides in this project, and what does nothing use?
 *
 * Both halves over pinned fixtures, and both are readings of evidence rather
 * than judgements — which packages a manifest declares, which files exist,
 * which strings a scan saw. So there is no responder switch and no headroom in
 * the threshold.
 *
 * The cases that outrank the rest are the six that assert an absence: the
 * ordinary Tailwind app that is not two styling systems, the Next.js app that is
 * not two frameworks, the token whose name is written even though its value
 * drifted, and the Vue project told its components were not read rather than
 * that they are all unused. A hygiene check that fires on healthy projects is
 * worse than none, because every finding it makes is a warning somebody has to
 * read and dismiss.
 */
function assessHygieneEval() {
  const spec = readJson('evals/prompts/assess-hygiene.json');
  let points = 0;
  let max = 0;
  const failures = [];

  const claim = (ok, why) => {
    max += 1;
    if (ok) points += 1;
    else failures.push(why);
  };

  const rootOf = (fixture) => path.join(PACKAGE_ROOT, spec.fixtures[fixture]);
  const systemIn = (fixture) =>
    parse(fs.readFileSync(path.join(rootOf(fixture), 'DESIGN-SYSTEM.md'), 'utf8'));

  /**
   * `own` reads the fixture's own design system, a named fixture borrows one —
   * which is how the Vue case is given components it could be wrong about — and
   * nothing at all means an empty system, where only collisions are in play.
   */
  const modelFor = (testCase) => {
    if (!testCase.system) return emptyModel();
    return systemIn(testCase.system === 'own' ? testCase.fixture : testCase.system);
  };

  // One scan per fixture-and-system pair, because several cases read the same
  // assessment and scanning per case would grade the fixtures' size, not the code.
  const scans = new Map();
  const scanFor = (testCase) => {
    const key = `${testCase.fixture}|${testCase.system ?? 'empty'}`;
    if (!scans.has(key)) scans.set(key, assess(rootOf(testCase.fixture), modelFor(testCase)));
    return scans.get(key);
  };

  for (const testCase of spec.cases) {
    const result = scanFor(testCase);
    const { hygiene } = result;

    if (testCase.kind === 'collision') {
      const finding = hygiene.collisions.find(
        (item) => item.rule === testCase.rule && item.value === testCase.value,
      );
      claim(Boolean(finding), `${testCase.id}: no ${testCase.rule} naming "${testCase.value}"`);
      if (!finding) {
        max += 2;
        continue;
      }
      claim(finding.severity === 'warn', `${testCase.id}: severity ${finding.severity}, expected warn`);
      claim(
        testCase.evidence.every((item) =>
          finding.evidence.some((seen) => String(seen).includes(item)),
        ),
        `${testCase.id}: evidence ${finding.evidence.join(' / ')} does not show ${testCase.evidence.join(', ')}`,
      );
      continue;
    }

    if (testCase.kind === 'no-collision') {
      claim(
        hygiene.collisions.length === 0,
        `${testCase.id}: reported ${hygiene.collisions.map((item) => item.value).join(', ')}`,
      );
      continue;
    }

    if (testCase.kind === 'unused-token' || testCase.kind === 'used-token') {
      const row = hygiene.unused.tokens.find((item) => item.token === testCase.token);
      if (testCase.kind === 'used-token') {
        claim(!row, `${testCase.id}: ${testCase.token} was called unused, and the code uses it`);
        continue;
      }
      claim(Boolean(row), `${testCase.id}: ${testCase.token} is not reported unused`);
      if (!row) {
        max += 2;
        continue;
      }
      claim(row.severity === 'warn', `${testCase.id}: severity ${row.severity}, expected warn`);
      claim(
        row.detail.includes(hygiene.caveat),
        `${testCase.id}: the finding does not carry the bounded-scan caveat`,
      );
      continue;
    }

    if (testCase.kind === 'unused-component' || testCase.kind === 'used-component') {
      const row = hygiene.unused.components.find((item) => item.component === testCase.component);
      if (testCase.kind === 'used-component') {
        claim(!row, `${testCase.id}: ${testCase.component} was called unused, and the markup uses it`);
        continue;
      }
      claim(Boolean(row), `${testCase.id}: ${testCase.component} is not reported unused`);
      if (!row) {
        max += 2;
        continue;
      }
      claim(row.severity === 'warn', `${testCase.id}: severity ${row.severity}, expected warn`);
      claim(
        (row.spellings ?? []).length > 0,
        `${testCase.id}: the finding does not say which spellings were looked for`,
      );
      continue;
    }

    if (testCase.kind === 'not-checked') {
      claim(
        hygiene.unused.componentsChecked === false,
        `${testCase.id}: the component half claims to have run on a stack it cannot read`,
      );
      claim(
        hygiene.unused.components.length === 0,
        `${testCase.id}: named ${hygiene.unused.components.length} components it never looked for`,
      );
      claim(
        Boolean(hygiene.unused.componentsReason),
        `${testCase.id}: skipped the question without saying why`,
      );
    }
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

// ---------------------------------------------------------------------------
// assess — similarity: clones, duplicates, overlaps (v0.2.1 §4)
// ---------------------------------------------------------------------------

/**
 * What in this codebase is nearly the same as what else?
 *
 * The first check `assess` runs that reads two things against each other, and
 * the first whose answer is a number rather than a category — so the grading is
 * as much about the number as about the finding. A pair reported in the wrong
 * band is a wrong answer here, not a near miss: the bands are what a reader
 * acts on, and 0.79 and 0.81 mean different things on purpose.
 *
 * Every case runs over a pinned fixture and the whole comparison is set
 * arithmetic, so there is no responder and no headroom in the threshold. The
 * cases that outrank the rest are the four that assert an absence — the
 * ordinary project with nothing alike in it, the bundle not yet repeated
 * enough, the two unrelated elements, and the Vue project whose markup was
 * never read. A similarity pass that cannot stay quiet is a similarity pass
 * nobody leaves switched on.
 */
function assessSimilarityEval() {
  const spec = readJson('evals/prompts/assess-similarity.json');
  let points = 0;
  let max = 0;
  const failures = [];

  const claim = (ok, why) => {
    max += 1;
    if (ok) points += 1;
    else failures.push(why);
  };

  const rootOf = (fixture) => path.join(PACKAGE_ROOT, spec.fixtures[fixture]);

  // One scan per fixture: several cases read the same assessment, and scanning
  // per case would grade the size of the fixtures rather than the code.
  const scans = new Map();
  const scanFor = (testCase) => {
    if (!scans.has(testCase.fixture)) {
      scans.set(testCase.fixture, assess(rootOf(testCase.fixture), emptyModel()));
    }
    return scans.get(testCase.fixture);
  };

  /** A pair matches however the two halves happen to be ordered. */
  const isPair = (finding, pair) =>
    [...(finding.pair ?? [])].sort().join('|') === [...pair].sort().join('|');

  for (const testCase of spec.cases) {
    const { similarity } = scanFor(testCase);

    if (testCase.kind === 'clone' || testCase.kind === 'similar') {
      const finding = similarity.clones.find((row) => isPair(row, testCase.pair));
      claim(Boolean(finding), `${testCase.id}: ${testCase.pair.join(' ~ ')} is not reported`);
      if (!finding) {
        max += 3;
        continue;
      }
      const clone = testCase.kind === 'clone';
      claim(
        finding.band === (clone ? 'clone' : 'similar'),
        `${testCase.id}: banded ${finding.band} at ${finding.score}`,
      );
      claim(
        finding.severity === (clone ? 'error' : 'warn'),
        `${testCase.id}: severity ${finding.severity}`,
      );
      claim(
        clone
          ? finding.survivor === testCase.survivor
          : finding.survivor === null,
        clone
          ? `${testCase.id}: survivor ${finding.survivor}, expected ${testCase.survivor}`
          : `${testCase.id}: named a survivor for a pattern similarity`,
      );
      continue;
    }

    if (testCase.kind === 'not-similar') {
      claim(
        !similarity.clones.some((row) => isPair(row, testCase.pair)),
        `${testCase.id}: ${testCase.pair.join(' ~ ')} was reported, and shares nothing`,
      );
      continue;
    }

    if (testCase.kind === 'duplicate' || testCase.kind === 'near-duplicate') {
      const finding = similarity.duplicates.find((row) => isPair(row, testCase.pair));
      claim(Boolean(finding), `${testCase.id}: ${testCase.pair.join(' ~ ')} is not reported`);
      const duplicate = testCase.kind === 'duplicate';
      if (!finding) {
        max += duplicate ? 3 : 2;
        continue;
      }
      claim(
        finding.band === (duplicate ? 'clone' : 'similar'),
        `${testCase.id}: banded ${finding.band} at ${finding.score}`,
      );
      claim(
        finding.severity === (duplicate ? 'error' : 'warn'),
        `${testCase.id}: severity ${finding.severity}`,
      );
      if (!duplicate) continue;
      claim(
        (testCase.shared ?? []).every((pair) => finding.shared.includes(pair)),
        `${testCase.id}: shared ${finding.shared.join(' / ')} does not list ${(testCase.shared ?? []).join(', ')}`,
      );
      continue;
    }

    if (testCase.kind === 'no-duplicate') {
      claim(
        !similarity.duplicates.some((row) => (row.pair ?? []).includes(testCase.name)),
        `${testCase.id}: ${testCase.name} was paired with something`,
      );
      continue;
    }

    if (testCase.kind === 'overlap') {
      const finding = similarity.overlaps.find((row) => row.value === testCase.value);
      claim(Boolean(finding), `${testCase.id}: the bundle "${testCase.value}" is not reported`);
      if (!finding) {
        max += 2;
        continue;
      }
      claim(finding.severity === 'warn', `${testCase.id}: severity ${finding.severity}`);
      claim(
        finding.count === testCase.count,
        `${testCase.id}: written on ${finding.count} elements, expected ${testCase.count}`,
      );
      continue;
    }

    if (testCase.kind === 'no-overlap') {
      claim(
        !similarity.overlaps.some((row) => row.value === testCase.value),
        `${testCase.id}: "${testCase.value}" was called a bundle`,
      );
      continue;
    }

    if (testCase.kind === 'no-findings') {
      claim(
        similarity.findings.length === 0,
        `${testCase.id}: reported ${similarity.findings.map((row) => row.value).join(', ')}`,
      );
      continue;
    }

    if (testCase.kind === 'not-checked') {
      claim(
        similarity.markupChecked === false,
        `${testCase.id}: claims to have compared markup it cannot read`,
      );
      claim(
        similarity.clones.length === 0 && similarity.overlaps.length === 0,
        `${testCase.id}: named ${similarity.clones.length + similarity.overlaps.length} markup findings it never looked for`,
      );
      claim(
        Boolean(similarity.markupReason),
        `${testCase.id}: skipped the question without saying why`,
      );
      claim(
        similarity.compared.blocks > 0,
        `${testCase.id}: the style blocks were not compared, and they read on any stack`,
      );
      continue;
    }

    if (testCase.kind === 'bounded') {
      claim(
        similarity.findings.every((row) => row.score >= 0 && row.score <= 1),
        `${testCase.id}: a score fell outside [0, 1]`,
      );
      claim(
        similarity.caps.signatures > 0 &&
          similarity.caps.blocks > 0 &&
          similarity.caps.pairs > 0,
        `${testCase.id}: the report does not state the caps it ran under`,
      );
      claim(
        similarity.compared.signatures > 0 && similarity.compared.blocks > 0,
        `${testCase.id}: the report does not say what it compared`,
      );
    }
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

// ---------------------------------------------------------------------------
// assess — consistency: naming drift and prop mismatches (v0.2.1 §5)
// ---------------------------------------------------------------------------

/**
 * Is one concept called one thing, and is one component used one way?
 *
 * The grading is harsher in spirit than anything before it, because this is the
 * first family allowed to say `error` about somebody's markup. A wrong naming
 * stray is an annoyance; a wrong prop synonym is Phyllum telling a developer
 * that working code is broken. So the negative cases carry the same weight as
 * the positive ones and there is no partial credit for finding the right thing
 * for the wrong reason — a drift group reported without its suggestion, or a
 * conflict reported over a value the scan could not read, scores as a miss.
 *
 * Every case runs over a pinned fixture and every reading is set arithmetic
 * over names and attributes, so there is no responder and no headroom.
 */
function assessConsistencyEval() {
  const spec = readJson('evals/prompts/assess-consistency.json');
  let points = 0;
  let max = 0;
  const failures = [];

  const claim = (ok, why) => {
    max += 1;
    if (ok) points += 1;
    else failures.push(why);
  };

  const rootOf = (fixture) => path.join(PACKAGE_ROOT, spec.fixtures[fixture]);
  const modelFor = (testCase) =>
    testCase.system === 'own'
      ? parse(fs.readFileSync(path.join(rootOf(testCase.fixture), 'DESIGN-SYSTEM.md'), 'utf8'))
      : emptyModel();

  // One scan per fixture-and-system pair: several cases read the same
  // assessment, and scanning per case would grade the fixtures' size.
  const scans = new Map();
  const scanFor = (testCase) => {
    const key = `${testCase.fixture}|${testCase.system ?? 'empty'}`;
    if (!scans.has(key)) scans.set(key, assess(rootOf(testCase.fixture), modelFor(testCase)));
    return scans.get(key);
  };

  /** A group matches however its spellings happen to be ordered. */
  const isGroup = (row, forms) =>
    [...(row.forms ?? [])].sort().join('|') === [...forms].sort().join('|');

  for (const testCase of spec.cases) {
    const { naming, props } = scanFor(testCase);

    if (testCase.kind === 'drift') {
      const row = naming.drift.find((item) => isGroup(item, testCase.forms));
      claim(Boolean(row), `${testCase.id}: ${testCase.forms.join(' / ')} is not reported as drift`);
      if (!row) {
        max += 3;
        continue;
      }
      claim(row.drift === testCase.drift, `${testCase.id}: called ${row.drift} drift`);
      claim(
        row.suggested === testCase.suggested,
        `${testCase.id}: suggested \`${row.suggested}\`, expected \`${testCase.suggested}\``,
      );
      claim(row.severity === 'warn', `${testCase.id}: severity ${row.severity}`);
      continue;
    }

    if (testCase.kind === 'no-drift') {
      claim(
        !naming.drift.some((row) => (row.forms ?? []).includes(testCase.name)),
        `${testCase.id}: ${testCase.name} was grouped with something`,
      );
      continue;
    }

    if (testCase.kind === 'convention') {
      const dominant = naming.conventions?.[testCase.of];
      claim(Boolean(dominant?.decided), `${testCase.id}: no ${testCase.of} convention was decided`);
      claim(
        dominant?.convention === testCase.convention,
        `${testCase.id}: called ${dominant?.convention}, expected ${testCase.convention}`,
      );
      continue;
    }

    if (testCase.kind === 'no-convention') {
      const dominant = naming.conventions?.[testCase.of];
      claim(
        dominant?.decided === false,
        `${testCase.id}: elected ${dominant?.convention} out of ${dominant?.voters} names`,
      );
      claim(Boolean(dominant?.reason), `${testCase.id}: gave no reason for having no answer`);
      continue;
    }

    if (testCase.kind === 'stray') {
      const row = naming.strays.find((item) => item.value === testCase.name);
      claim(Boolean(row), `${testCase.id}: ${testCase.name} is not reported as a stray`);
      if (!row) {
        max += 3;
        continue;
      }
      claim(
        row.convention === testCase.convention,
        `${testCase.id}: read as ${row.convention}, expected ${testCase.convention}`,
      );
      claim(
        row.suggested === testCase.suggested,
        `${testCase.id}: suggested \`${row.suggested}\`, expected \`${testCase.suggested}\``,
      );
      claim(row.severity === 'warn', `${testCase.id}: severity ${row.severity}`);
      continue;
    }

    if (testCase.kind === 'no-stray') {
      claim(
        !naming.findings.some((row) => row.value === testCase.name),
        `${testCase.id}: ${testCase.name} was reported`,
      );
      continue;
    }

    if (testCase.kind === 'synonym') {
      const row = props.synonyms.find((item) => item.component === testCase.component);
      claim(Boolean(row), `${testCase.id}: ${testCase.component} is not reported`);
      if (!row) {
        max += 2;
        continue;
      }
      claim(
        testCase.spellings.every((name) => row.spellings.includes(name)),
        `${testCase.id}: reported ${row.spellings.join(' + ')}`,
      );
      claim(row.severity === 'error', `${testCase.id}: severity ${row.severity}`);
      continue;
    }

    if (testCase.kind === 'conflict') {
      const row = props.conflicts.find(
        (item) => item.component === testCase.component && item.prop === testCase.prop,
      );
      claim(Boolean(row), `${testCase.id}: ${testCase.component}.${testCase.prop} is not reported`);
      if (!row) {
        max += 2;
        continue;
      }
      claim(
        [...row.kinds].sort().join('|') === [...testCase.kinds].sort().join('|'),
        `${testCase.id}: reported ${row.kinds.join(' and ')}`,
      );
      claim(row.severity === 'error', `${testCase.id}: severity ${row.severity}`);
      continue;
    }

    if (testCase.kind === 'no-conflict') {
      claim(
        !props.conflicts.some(
          (row) => row.component === testCase.component && row.prop === testCase.prop,
        ),
        `${testCase.id}: ${testCase.component}.${testCase.prop} was called a conflict`,
      );
      continue;
    }

    if (testCase.kind === 'bypass') {
      const row = props.bypasses.find(
        (item) => item.component === testCase.component && item.prop === testCase.prop,
      );
      claim(Boolean(row), `${testCase.id}: ${testCase.component}.${testCase.prop} is not reported`);
      if (!row) {
        max += 2;
        continue;
      }
      claim(row.severity === 'warn', `${testCase.id}: severity ${row.severity}`);
      claim(
        testCase.variants.every((variant) => row.variants.includes(variant)),
        `${testCase.id}: named ${row.variants.join(', ')} as the variants`,
      );
      continue;
    }

    if (testCase.kind === 'unread') {
      claim(
        props.compared.unread > 0,
        `${testCase.id}: counted no unreadable values in a fixture written to have them`,
      );
      claim(
        props.conflicts.every((row) => !row.kinds.includes('expression')),
        `${testCase.id}: compared a value it could not read`,
      );
      continue;
    }

    if (testCase.kind === 'no-findings') {
      claim(
        naming.findings.length === 0 && props.findings.length === 0,
        `${testCase.id}: reported ${[...naming.findings, ...props.findings].map((row) => row.value).join(', ')}`,
      );
      continue;
    }

    if (testCase.kind === 'not-checked') {
      claim(props.checked === false, `${testCase.id}: claims to have read props it cannot read`);
      claim(
        props.findings.length === 0,
        `${testCase.id}: named ${props.findings.length} mismatches it never looked for`,
      );
      claim(Boolean(props.reason), `${testCase.id}: skipped the question without saying why`);
    }
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

// ---------------------------------------------------------------------------
// tokenise — the prose path, which is all `tokenise` is now (v0.2.0 §6, §7)
// ---------------------------------------------------------------------------

/**
 * One sentence in, one token out.
 *
 * `tokenise` stopped reading the codebase in M2, and the two evals filed under
 * `tokenise-*` both scanned one — so once those were renamed to `assess-*` in M8
 * the command had no eval of its own. This is it, and it is deterministic end to
 * end: `parseProse` is a pure function of the sentence, so every claim is a fact
 * rather than a judgement and the threshold is 1.0.
 *
 * The claim that earns its keep is the name. Reading a name out of a sentence
 * *wrongly* is worse than finding none, because a wrong name is written into the
 * user's design system without anything looking amiss — which is exactly what M8
 * found ("call it color-brand" recorded a token called `it`).
 */
function proseTokenise() {
  const spec = readJson('evals/prompts/tokenise-prose-extraction.json');
  const model = emptyModel();
  let points = 0;
  let max = 0;
  const failures = [];

  const claim = (ok, why) => {
    max += 1;
    if (ok) points += 1;
    else failures.push(why);
  };

  for (const testCase of spec.cases) {
    const parsed = parseProse(testCase.prose);

    // The queue, walked. A `loop` case grades what the conversation does rather
    // than what the reader read: the same chain `runQueue` runs per entry —
    // suggest, propose, ask, decide, accept, write — with the answers pinned
    // and the I/O left out, so a batch of three is graded as three questions
    // and three decisions rather than as one parse.
    if (testCase.loop) {
      const walked = walkQueue(parsed.candidates, testCase.loop.answers);
      claim(
        walked.questions.length === testCase.loop.questions,
        `${testCase.id}: asked ${walked.questions.length} question(s), expected ${testCase.loop.questions} — one per value, one at a time`,
      );
      claim(
        walked.questions.every((question, index) => question.includes(walked.values[index])),
        `${testCase.id}: a question was asked about a value out of turn`,
      );
      claim(
        walked.written.join(' + ') === testCase.loop.written.join(' + '),
        `${testCase.id}: wrote ${walked.written.join(', ') || '(nothing)'}, expected ${testCase.loop.written.join(', ')}`,
      );
      continue;
    }

    const expected = testCase.expected;

    claim(
      parsed.complete === expected.complete,
      `${testCase.id}: complete = ${parsed.complete}, expected ${expected.complete}`,
    );

    if (expected.queue) {
      const queue = parsed.candidates.map((candidate) =>
        candidate.pass === 'typography'
          ? `${candidate.size} / ${candidate.weight} / ${candidate.lineHeight}`
          : candidate.value,
      );
      claim(
        queue.join(' + ') === expected.queue.join(' + '),
        `${testCase.id}: the queue is ${queue.join(', ')}, expected ${expected.queue.join(', ')}`,
      );
    }

    if ('name' in expected) {
      claim(parsed.name === expected.name, `${testCase.id}: name = ${parsed.name} ≠ ${expected.name}`);
    }
    if ('nameFromProse' in expected) {
      claim(
        parsed.nameFromProse === expected.nameFromProse,
        `${testCase.id}: nameFromProse = ${parsed.nameFromProse}, expected ${expected.nameFromProse}`,
      );
    }

    claim(
      parsed.candidates.length === expected.candidates.length,
      `${testCase.id}: ${parsed.candidates.length} candidate(s), expected ${expected.candidates.length}`,
    );

    for (const [index, want] of expected.candidates.entries()) {
      const got = parsed.candidates[index];
      if (!got) {
        claim(false, `${testCase.id}: candidate ${index + 1} is missing`);
        continue;
      }
      for (const [key, value] of Object.entries(want)) {
        const actual = Array.isArray(got[key]) ? got[key].join(' + ') : got[key];
        const wanted = Array.isArray(value) ? value.join(' + ') : value;
        claim(actual === wanted, `${testCase.id}: candidate ${index + 1} ${key} = ${actual} ≠ ${wanted}`);
      }
    }

    // A sentence that named nothing must still get a name Phyllum can defend, on
    // the documented scale — the suggestion half of M2's rework.
    if (expected.suggested) {
      const [candidate] = parsed.candidates;
      const suggestion = candidate ? suggestName(candidate, model) : null;
      claim(
        typeof suggestion?.name === 'string' && new RegExp(expected.suggested).test(suggestion.name),
        `${testCase.id}: suggested "${suggestion?.name ?? '(none)'}" is not on the ${expected.suggested} scale`,
      );
      // And it must come from the source the contract says it should. A right
      // name from the wrong source is a coincidence, and coincidences stop
      // holding as soon as the vocabulary grows (v0.3.0 §4.3).
      if (expected.suggestedSource) {
        claim(
          suggestion?.source === expected.suggestedSource,
          `${testCase.id}: the name came from the ${suggestion?.source ?? 'unknown'} source, expected ${expected.suggestedSource}`,
        );
      }
    }
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

/**
 * The proposal queue, walked without a terminal (v0.3.0 plan §3).
 *
 * `runQueue` in `lib/tokenise-command.js` is this chain plus the printing, the
 * questions and the file write; the pieces themselves — `suggestName`,
 * `proposalFrom`, `questionFor`, `decide`, `accepted`, `applyAcceptance` — are
 * the real ones, in the real order, against a real model that grows as the run
 * accepts. That is what makes the two claims here worth grading: one question
 * per entry and no more, and a skipped entry costing only itself while every
 * later entry still ranks against what was accepted before it.
 */
function walkQueue(queue, answers) {
  const model = emptyModel();
  const questions = [];
  const written = [];
  const values = [];

  for (const [index, candidate] of queue.entries()) {
    values.push(candidate.pass === 'typography' ? candidate.size : candidate.value);
    if (existingTokenFor(candidate, model)) continue;

    const suggestion = candidate.nameFromProse ? null : suggestName(candidate, model);
    const proposal = proposalFrom(candidate, {
      name: candidate.name ?? suggestion.name,
      model,
      suggested: suggestion?.name ?? null,
    });
    questions.push(questionFor(proposal));

    const decision = decide(proposal, answers[index] ?? 'skip', { names: [...takenNames(model)] });
    const keep = accepted([decision]);
    if (keep.length === 0) continue;
    for (const item of applyAcceptance(model, keep).written) written.push(item.name);
  }

  return { questions, written, values };
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

// ---------------------------------------------------------------------------
// update — install detection (plan v0.2.0 §4, §7)
// ---------------------------------------------------------------------------

/**
 * Build one install layout in a temp sandbox, hand it to `body`, remove it.
 *
 * These fixtures cannot be committed: every one of them contains a node_modules
 * directory, and node_modules is gitignored. So the *description* is pinned in
 * the prompt file and the directories are built from it here — which keeps the
 * grading reproducible without a single file in the repository.
 */
function withLayout(testCase, body) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'phyllum-eval-'));
  try {
    const segments = testCase.layout.split('/');
    const packageRoot = path.join(dir, ...segments);
    fs.mkdirSync(packageRoot, { recursive: true });

    const first = segments.indexOf('node_modules');
    const projectRoot = first === -1 ? null : path.join(dir, ...segments.slice(0, first));
    if (projectRoot && testCase.manifest) {
      fs.mkdirSync(projectRoot, { recursive: true });
      fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify(testCase.manifest));
    }
    if (projectRoot && testCase.lockfile) fs.writeFileSync(path.join(projectRoot, testCase.lockfile), '');

    return body({ packageRoot, projectRoot, sandbox: dir });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * How was Phyllum installed, and what is the right update command? Four claims
 * per pinned layout: the kind of install, the package manager, whether v0.2.0
 * drives it, and the command line argument for argument.
 */
function installDetection() {
  const spec = readJson('evals/prompts/update-install-detection.json');
  let points = 0;
  let max = 0;
  const failures = [];

  for (const testCase of spec.cases) {
    // The environment is emptied deliberately: this suite is run by npm, and
    // npm's own user agent would otherwise answer every case for us.
    const { install, command } = withLayout(testCase, ({ packageRoot, sandbox }) => {
      const detected = detectInstall({ packageRoot, env: {}, cwd: sandbox });
      return { install: detected, command: commandLine(updateCommandFor(detected)) };
    });
    const expected = testCase.expected;

    max += 1;
    if (install.kind === expected.kind) points += 1;
    else failures.push(`${testCase.id}: kind ${install.kind} ≠ ${expected.kind}`);

    max += 1;
    if ((install.manager ?? null) === expected.manager) points += 1;
    else failures.push(`${testCase.id}: manager ${install.manager ?? 'none'} ≠ ${expected.manager ?? 'none'}`);

    max += 1;
    if (install.supported === expected.supported) points += 1;
    else {
      failures.push(
        `${testCase.id}: ${install.supported ? 'claims' : 'denies'} support, expected the opposite`,
      );
    }

    max += 1;
    if ((command ?? null) === expected.command) points += 1;
    else failures.push(`${testCase.id}: command "${command ?? 'none'}" ≠ "${expected.command ?? 'none'}"`);
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

// ---------------------------------------------------------------------------
// apply — the PRD contract (plan v0.2.0 §6.5.1, §7)
// ---------------------------------------------------------------------------

/**
 * Does the plan say the right thing about the right codebase?
 *
 * `apply` step one is mechanical from end to end, so unlike the `create` evals
 * there is no model half here to leave unscored: harness detection, the change
 * inventory, the exclusions and the phase grouping are all facts about pinned
 * fixtures, and all four are graded.
 *
 * The fifth criterion is the one the plan §7 note asks for by name —
 * **every acceptance criterion has to map to a change somebody could verify.**
 * So each criterion is checked against the fixture on disk: the file it names
 * must exist, and the literal or pattern it names must actually appear in that
 * file. A criterion nobody can check is the failure mode this eval exists to
 * catch, and it fails whatever else scored.
 */
function applyPrdContract() {
  const spec = readJson('evals/prompts/apply-prd-contract.json');
  const model = parse(readText(spec.designSystem));
  let points = 0;
  let max = 0;
  const failures = [];

  const compare = (id, label, actual, expected) => {
    max += 1;
    const a = [...actual].sort().join(' · ');
    const b = [...expected].sort().join(' · ');
    if (a === b) points += 1;
    else failures.push(`${id}: ${label}\n      got      ${a || '(none)'}\n      expected ${b || '(none)'}`);
  };

  for (const testCase of spec.cases) {
    const root = path.join(PACKAGE_ROOT, testCase.fixture);
    const expected = testCase.expected;

    if (testCase.kind === 'harness') {
      // A pinned project, and the one question that decides the PRD's shape.
      const harness = detectHarness(root, { home: path.join(os.tmpdir(), 'phyllum-no-home') });
      max += 1;
      if (
        (harness.id ?? null) === expected.id &&
        harness.layer === expected.layer &&
        (harness.config ?? null) === expected.config
      ) {
        points += 1;
      } else {
        failures.push(
          `${testCase.id}: harness ${harness.id ?? 'none'} via ${harness.layer} (${harness.config ?? '—'}) ` +
            `≠ ${expected.id ?? 'none'} via ${expected.layer} (${expected.config ?? '—'})`,
        );
      }
      continue;
    }

    const assessment = assess(root, model);
    const tokens = tokenChanges(assessment, model);
    const components = componentChanges(root, model, assessment);
    const phases = buildPhases({ tokens: tokens.changes, components: components.changes });
    const changes = phases.flatMap((phase) => phase.changes);

    compare(
      testCase.id,
      'criteria',
      changes.map((change) =>
        change.kind === 'component'
          ? `${change.file}|${change.pattern}|component ${change.component}`
          : `${change.file}|${change.literal}|token ${change.token}`,
      ),
      expected.criteria,
    );

    compare(testCase.id, 'phases', phases.map((phase) => phase.title), expected.phases);

    // Exclusions are graded by kind, because the *reason* is the product here: a
    // literal nobody named and a literal named for another role are different
    // facts, and collapsing them would be the dishonest answer.
    const wrongRole = tokens.unnamed.filter((row) => /repurposes a token across roles/.test(row.reason));
    const plainlyUnnamed = tokens.unnamed.filter((row) => /no token in DESIGN-SYSTEM\.md names/.test(row.reason));
    compare(testCase.id, 'exclusions: unnamed', plainlyUnnamed.map((row) => row.value), expected.exclusions.unnamed);
    compare(testCase.id, 'exclusions: wrong role', wrongRole.map((row) => row.value), expected.exclusions.wrongRole);
    compare(
      testCase.id,
      'exclusions: TODO components',
      components.excluded.map((row) => row.component),
      expected.exclusions.todoComponents,
    );

    max += 1;
    if (components.ran === expected.exclusions.adoptionRan) points += 1;
    else {
      failures.push(
        `${testCase.id}: the adoption pass ${components.ran ? 'ran' : 'did not run'}, expected the opposite`,
      );
    }

    // And the criterion that outranks the rest: is every change checkable?
    max += 1;
    const unverifiable = [];
    for (const change of changes) {
      const file = path.join(root, change.file);
      if (!fs.existsSync(file)) {
        unverifiable.push(`${change.id} names a file that does not exist: ${change.file}`);
        continue;
      }
      const contents = fs.readFileSync(file, 'utf8').toLowerCase();
      const subject = change.kind === 'component' ? change.pattern.split('.').at(-1) : change.literal;
      if (!contents.includes(String(subject).toLowerCase())) {
        unverifiable.push(`${change.id} names ${subject}, which is not in ${change.file}`);
      }
    }
    if (unverifiable.length === 0) points += 1;
    else failures.push(`${testCase.id}: unverifiable criteria\n      ${unverifiable.join('\n      ')}`);
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

// ---------------------------------------------------------------------------
// apply run — the decisions either side of the agent (plan v0.2.0 §6.5.2, §7)
// ---------------------------------------------------------------------------

/**
 * `apply run` delegates the part no runner can grade, and decides everything
 * else. This eval grades the deciding.
 *
 * Three questions, in the order a run asks them. **Routing**: can Node do this
 * criterion itself, and if not, which of the four reasons sends it to a model?
 * **Substitution**: does the edit land where the criterion says and nowhere else,
 * and is the token it now reads actually declared? **Verification**: reading the
 * file afterwards, can Phyllum tell satisfied from not-satisfied from *cannot
 * tell*? The third answer is the one that matters most — it is what stops a phase
 * rather than ticking a box on an agent's word.
 */
function applyRunExecution() {
  const spec = readJson('evals/prompts/apply-run-execution.json');
  const model = parse(readText(spec.designSystem));
  let points = 0;
  let max = 0;
  const failures = [];

  const check = (label, condition, detail = '') => {
    max += 1;
    if (condition) points += 1;
    else failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
  };

  /** The four agent reasons, keyed the way the prompt set names them. */
  const reasonKind = (reason) => {
    if (/near-identical/.test(reason)) return 'near-identical';
    if (/size, weight and line-height/.test(reason)) return 'typography';
    if (/generation, not substitution/.test(reason)) return 'component';
    if (/not a stylesheet/.test(reason)) return 'not-a-stylesheet';
    return 'other';
  };

  for (const testCase of spec.cases) {
    if (testCase.kind === 'routing') {
      const root = path.join(PACKAGE_ROOT, testCase.fixture);
      const assessment = assess(root, model);
      const tokens = tokenChanges(assessment, model);
      const components = componentChanges(root, model, assessment);
      const phases = buildPhases({ tokens: tokens.changes, components: components.changes });

      const mechanical = [];
      const agent = {};
      for (const change of phases.flatMap((phase) => phase.changes)) {
        const fields = Object.fromEntries(criterionFields(change));
        const entry = classifyCriterion({ id: change.id, fields }, model);
        const key =
          change.kind === 'component'
            ? `${change.file}|${change.pattern}|component ${change.component}`
            : `${change.file}|${change.literal}|token ${change.token}`;
        if (entry.route === 'mechanical') mechanical.push(key);
        else agent[key] = reasonKind(entry.reason);
      }

      check(
        `${testCase.id}: which criteria Node does itself`,
        [...mechanical].sort().join(' · ') === [...testCase.expected.mechanical].sort().join(' · '),
        `got ${mechanical.sort().join(' · ') || '(none)'}`,
      );
      check(
        `${testCase.id}: which criteria need a model, and why each one does`,
        JSON.stringify(sortKeys(agent)) === JSON.stringify(sortKeys(testCase.expected.agent)),
        `got ${JSON.stringify(sortKeys(agent))}`,
      );
      continue;
    }

    if (testCase.kind === 'substitution') {
      const plan = {
        file: 'src/styles.css',
        literal: testCase.literal,
        properties: testCase.properties,
        reference: `var(--${testCase.token.name})`,
        token: testCase.token,
      };
      const applied = applyFile(testCase.source, [{ id: 'AC-1.1', plan }]);
      check(
        `${testCase.id}: the number of values replaced`,
        applied.results[0].replaced === testCase.expected.replaced,
        `replaced ${applied.results[0].replaced}, expected ${testCase.expected.replaced}`,
      );
      for (const fragment of testCase.expected.contains) {
        check(`${testCase.id}: the result contains ${fragment}`, applied.text.includes(fragment), applied.text);
      }
      check(
        `${testCase.id}: no raw literal left on the named properties`,
        rawLiteralRemains(applied.text, plan) === testCase.expected.rawRemainsOnNamedProperties,
      );
      continue;
    }

    if (testCase.kind === 'verification') {
      const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'phyllum-eval-'));
      try {
        const target = path.join(dir, testCase.file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, testCase.source);
        const { literal, token, properties } = testCase.criterion;
        const result = verifyCriterion(
          dir,
          {
            id: 'AC-1.1',
            done: false,
            fields: {
              file: `\`${testCase.file}\``,
              literal: `\`${literal}\``,
              becomes: `token \`${token}\``,
              check: `in \`${testCase.file}\`, every ${properties
                .map((property) => `\`${property}\``)
                .join(', ')} value of \`${literal}\` reads the \`${token}\` token instead, and no raw \`${literal}\` is left on those properties.`,
            },
          },
          model,
        );
        check(
          `${testCase.id}: satisfied is ${String(testCase.expected.satisfied)}`,
          result.satisfied === testCase.expected.satisfied,
          `got ${String(result.satisfied)} (${result.why ?? 'no reason'})`,
        );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

// ---------------------------------------------------------------------------
// assess — the report, the score and the smaller checks (v0.2.1 §7, §8)
// ---------------------------------------------------------------------------

/**
 * How much drift is in this codebase, how bad is it, and what do I do about it?
 *
 * The first eval that grades the *whole* assessment rather than one family of
 * finding. Everything it reads is arithmetic over counts the families already
 * produced, so there is no responder and no headroom in the threshold.
 *
 * The cases that outrank the rest are the four asserting an absence: six checks
 * staying quiet on projects that do not have these problems. A report whose
 * smaller checks fire on a healthy codebase is a report whose smaller checks
 * get folded, and then the section might as well not exist.
 *
 * The next most important is `score-and-verdict-are-independent`. The two
 * answer different questions — how much, and how bad — and a codebase that
 * fails at the bottom of the scale and one that passes-with-warnings near the
 * top both have to be expressible, or one of the two numbers is decoration.
 */
function assessReportEval() {
  const spec = readJson('evals/prompts/assess-report.json');
  let points = 0;
  let max = 0;
  const failures = [];

  const claim = (ok, why) => {
    max += 1;
    if (ok) points += 1;
    else failures.push(why);
  };

  const rootOf = (fixture) => path.join(PACKAGE_ROOT, spec.fixtures[fixture]);
  const modelFor = (testCase) => {
    if (!testCase.system || testCase.system === 'none') return emptyModel();
    const root = rootOf(testCase.system === 'own' ? testCase.fixture : testCase.system);
    return parse(fs.readFileSync(path.join(root, 'DESIGN-SYSTEM.md'), 'utf8'));
  };

  // One scan per fixture-and-system pair: several cases read the same
  // assessment, and scanning per case would grade the fixtures' size.
  const scans = new Map();
  const scanFor = (testCase) => {
    const key = `${testCase.fixture}|${testCase.system ?? 'none'}`;
    if (!scans.has(key)) scans.set(key, assess(rootOf(testCase.fixture), modelFor(testCase)));
    return scans.get(key);
  };

  for (const testCase of spec.cases) {
    if (testCase.kind === 'extra') {
      const { extras } = scanFor(testCase);
      const finding = extras.findings.find(
        (item) => item.rule === testCase.rule && item.value === testCase.value,
      );
      claim(Boolean(finding), `${testCase.id}: no ${testCase.rule} naming "${testCase.value}"`);
      if (!finding) {
        max += 3;
        continue;
      }
      claim(
        finding.severity === testCase.severity,
        `${testCase.id}: severity ${finding.severity}, expected ${testCase.severity}`,
      );
      claim(
        String(finding.detail).includes(testCase.detail),
        `${testCase.id}: "${finding.detail}" does not say ${testCase.detail}`,
      );
      claim(
        (finding.evidence ?? []).length > 0,
        `${testCase.id}: the finding carries no evidence`,
      );
      claim(
        Boolean(actionFor(finding.rule)),
        `${testCase.id}: ${finding.rule} has no suggested action`,
      );
      continue;
    }

    if (testCase.kind === 'not-checked') {
      const { extras } = scanFor(testCase);
      const half = extras[testCase.check];
      claim(
        half.checked === false,
        `${testCase.id}: the ${testCase.check} check claims to have run without the evidence for it`,
      );
      claim(
        half.rows.length === 0,
        `${testCase.id}: reported ${half.rows.length} findings from a check that could not run`,
      );
      claim(Boolean(half.reason), `${testCase.id}: skipped the question without saying why`);
      continue;
    }

    if (testCase.kind === 'no-extras') {
      const { extras } = scanFor(testCase);
      claim(
        extras.findings.length === 0,
        `${testCase.id}: reported ${extras.findings.map((item) => item.rule).join(', ')}`,
      );
      continue;
    }

    if (testCase.kind === 'score') {
      const result = scanFor(testCase);
      claim(
        result.score.score === testCase.score,
        `${testCase.id}: scored ${result.score.score} of 21, expected ${testCase.score}`,
      );
      claim(
        result.score.verdict === testCase.verdict,
        `${testCase.id}: verdict ${result.score.verdict}, expected ${testCase.verdict}`,
      );
      claim(
        result.summary.clean === testCase.clean,
        `${testCase.id}: clean is ${result.summary.clean}, expected ${testCase.clean}`,
      );
      claim(
        result.score.clean === (result.score.verdict === 'pass'),
        `${testCase.id}: clean and the verdict disagree`,
      );
      claim(
        Boolean(result.score.means),
        `${testCase.id}: the score is a number with nothing said about what it means`,
      );
      continue;
    }

    if (testCase.kind === 'independence') {
      const oneError = scoreAssessment({
        values: { uncovered: [{ rule: 'raw-colour', severity: 'error' }] },
      });
      claim(oneError.verdict === 'fail', `${testCase.id}: one error did not fail`);
      claim(oneError.score <= 2, `${testCase.id}: one error scored ${oneError.score}, high on the scale`);

      const manyWarnings = scoreAssessment({
        values: {
          uncovered: Array.from({ length: 40 }, () => ({ rule: 'raw-colour', severity: 'warn' })),
        },
      });
      claim(
        manyWarnings.verdict === 'pass w/ warnings',
        `${testCase.id}: forty exceptions did not pass with warnings`,
      );
      claim(
        manyWarnings.score >= 8,
        `${testCase.id}: forty exceptions scored ${manyWarnings.score}, low on the scale`,
      );
      continue;
    }

    if (testCase.kind === 'arithmetic') {
      const result = scanFor(testCase);
      const { families, overall } = countFamilies(result);
      const summed = Object.values(families).reduce((total, family) => total + family.total, 0);
      claim(
        summed === overall.total,
        `${testCase.id}: the families sum to ${summed} and the total says ${overall.total}`,
      );
      claim(
        driftMass(families) === result.score.mass,
        `${testCase.id}: the drift mass is not the weighted sum of the families`,
      );
      claim(
        scoreStepFor(result.score.mass).step === result.score.score,
        `${testCase.id}: the mass does not land on the step the report printed`,
      );
      continue;
    }

    if (testCase.kind === 'actions') {
      const declared = new Set(actionRules());
      const rules = [
        ...lintRules(),
        ...hygieneRules(),
        ...similarityRules(),
        ...namingRules(),
        ...propRules(),
        ...extraRules(),
        'unread',
      ];
      for (const rule of rules) {
        claim(declared.has(rule), `${testCase.id}: ${rule} has no row in the action table`);
      }
      claim(
        actionFor('a-rule-nobody-wrote') === null,
        `${testCase.id}: an action was invented for a rule that does not exist`,
      );
      continue;
    }

    if (testCase.kind === 'report') {
      const result = scanFor(testCase);
      const rollUp = renderFindings(result).join('\n');
      for (const [family] of FAMILIES) {
        claim(rollUp.includes(`  ${family} —`), `${testCase.id}: the roll-up has no ${family} row`);
      }
      claim(
        rollUp.includes('severity · finding · evidence · what to do'),
        `${testCase.id}: the roll-up does not state its row shape`,
      );
      const headline = renderScore(result).join('\n');
      claim(
        headline.includes(`Drift score: ${result.score.score} of 21`),
        `${testCase.id}: the headline does not print the score out of the scale`,
      );
      claim(
        headline.includes(`Verdict: ${result.score.verdict}`),
        `${testCase.id}: the headline does not print the verdict`,
      );
      continue;
    }

    if (testCase.kind === 'inheritance') {
      // One scan, one rendering: every chained mode prints the same report and
      // then walks a different track, so what is graded here is that the shared
      // rendering carries the whole judgement. The per-mode command output is
      // asserted end to end in evals/assertions/assess-report.test.js.
      const result = scanFor(testCase);
      const out = renderAssessment(result).join('\n');
      claim(
        out.includes(`Drift score: ${result.score.score} of 21`),
        `${testCase.id}: the shared report does not carry the score`,
      );
      claim(
        out.includes(`Verdict: ${result.score.verdict}`),
        `${testCase.id}: the shared report does not carry the verdict`,
      );
      claim(
        out.includes('The smaller checks'),
        `${testCase.id}: the shared report does not run the smaller checks`,
      );
      claim(
        out.includes('The findings — severity'),
        `${testCase.id}: the shared report does not group the findings by family`,
      );
      claim(
        testCase.modes.length === 3,
        `${testCase.id}: the case names ${testCase.modes.length} modes, expected three`,
      );
    }
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
}

/** Object keys in a fixed order, so a comparison is about content. */
function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

export const EVALS = [
  { id: 'init-detection', modelDependent: false, run: initDetection },
  { id: 'apply-prd-contract', modelDependent: false, run: applyPrdContract },
  { id: 'apply-run-execution', modelDependent: false, run: applyRunExecution },
  { id: 'update-install-detection', modelDependent: false, run: installDetection },
  { id: 'create-prose-extraction', modelDependent: true, run: proseExtraction },
  { id: 'create-anti-fabrication', modelDependent: true, run: antiFabrication },
  { id: 'create-token-first', modelDependent: false, run: tokenFirst },
  { id: 'create-extrapolation', modelDependent: false, run: extrapolation },
  { id: 'create-values-free', modelDependent: true, run: valuesAreFree },
  { id: 'create-image-trace', modelDependent: true, run: imageTrace },
  { id: 'create-pick-candidates', modelDependent: false, run: pickCandidates },
  { id: 'assess-clustering', modelDependent: false, run: clustering },
  { id: 'assess-naming', modelDependent: true, run: naming },
  { id: 'assess-severity', modelDependent: false, run: assessSeverity },
  { id: 'assess-hygiene', modelDependent: false, run: assessHygieneEval },
  { id: 'assess-similarity', modelDependent: false, run: assessSimilarityEval },
  { id: 'assess-consistency', modelDependent: false, run: assessConsistencyEval },
  { id: 'assess-report', modelDependent: false, run: assessReportEval },
  { id: 'tokenise-prose-extraction', modelDependent: false, run: proseTokenise },
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
