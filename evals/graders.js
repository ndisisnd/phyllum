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
import { scanCandidates } from '../lib/candidates.js';
import { detectHarness } from '../lib/harness-detect.js';
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
import { proposeTokens, scanCodebase } from '../lib/tokenise.js';
import { parseProse, suggestName } from '../lib/tokenise-prose.js';

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
 */
export const MILESTONE = 'v0.2.1 M1';
export const RELEASE = 'v0.2.0';

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
    const expected = testCase.expected;

    claim(
      parsed.complete === expected.complete,
      `${testCase.id}: complete = ${parsed.complete}, expected ${expected.complete}`,
    );

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
    }

    // Two values in one sentence is a question, never a pick.
    if (expected.asks) {
      claim(
        parsed.candidates.length > 1,
        `${testCase.id}: a sentence with two values must offer both, not choose one`,
      );
    }
  }

  return { ...score(points, max), failures, unrecorded: [], threshold: spec.threshold };
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
