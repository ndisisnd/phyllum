/**
 * `assess` — the scan engine (v0.2.0 plan §5.1, steps 1–3).
 *
 * `assess` answers one question about a codebase: how much raw, un-systematised
 * styling is in here? It is the first Phyllum command whose whole job is to read
 * somebody else's code, so the shape of it is dictated by that: **detect, scan,
 * aggregate**, and not one write anywhere in the path.
 *
 *   1. **Detect.** What language and framework is this? The answer picks the
 *      scanners. The values pass runs on any stack; the component pass commits to
 *      React in v0.2.0, and says so plainly when it does not run.
 *   2. **Scan.** Read-only. Stylesheets are read as stylesheets, markup as
 *      markup, and every other text file for `property: value` pairs — so a
 *      theme file in JSON or Go counts as much as a `.css` file does.
 *   3. **Aggregate.** Cluster near-identical values, count usage, rank by
 *      frequency, and split what the design system already names from what it
 *      does not. Only the second half is a suggestion; the first half is coverage.
 *
 * There is a third split, and it is the one that keeps the report honest: a value
 * can be *seen but not read*. A colour or a length written against a property no
 * table gives a meaning to is real evidence of drift, but it has no role — and
 * without a role, `12px` could be a corner or a padding. Those used to be dropped
 * in silence, which understated the drift. They are collected separately now, and
 * the review asks about them instead of naming them.
 *
 * Nothing here is new design work. The clustering, the naming scales and the
 * rerun diff are the behaviours v0.1.0's `tokenise` had and `assess` inherits
 * (v0.2.0 plan §5.3), so this module delegates to `lib/tokenise.js` rather than
 * restating any of it. What is new is the reach of the scan and the fact that the
 * result reports coverage as well as proposals — the mapping table and the two
 * suggestion tracks are built on this object, and read from it rather than
 * rescanning.
 *
 * Read-only is a property of the code, not a promise in a document: there is no
 * write call in this module, and the assertion suite diffs the entire directory
 * around every scan.
 *
 * v0.2.1 adds the fourth thing this module does, and it is a judgement rather
 * than a reading: **severity**. A colour written forty times is systematic
 * drift; the same colour written once is probably somebody's exception, and
 * demanding a token for both is how a tool earns the habit of being ignored. So
 * every finding is classified by how often its value is used — the threshold is
 * a row in `refs/assess/`, not a constant here — and every finding is also
 * given the name of the rule family it belongs to, so a report can say "the
 * shadows are fixed, the spacing is not".
 *
 * Severity is assigned *here*, at aggregation, and nowhere upstream. A scanner
 * reports what it saw in one file; how much a sighting matters is a question
 * about the whole codebase, and it cannot be answered one file at a time.
 *
 * v0.2.1 also adds a fifth thing, and it is the first one that is not about a
 * value at all: **hygiene** (§6). What frameworks and styling systems collide,
 * and what the design system holds that the codebase never mentions. Both are
 * questions about the project rather than about any value in it, so they live in
 * `lib/assess-hygiene.js` and hang off this object under `hygiene` — the values
 * findings are untouched by them, because a stale token is not drift.
 *
 * And a sixth, which is the first one that reads two things at once:
 * **similarity** (§4). Clones, style duplicates and utility overlaps, each
 * scored in [0, 1] from structure alone. It lives in `lib/assess-similarity.js`
 * and hangs off this object under `similarity`, for the same reason hygiene
 * does — "these two components are one component" is not a fact about a value,
 * and folding it into the drift count would make one number answer two
 * questions.
 *
 * And a seventh, which is the question underneath the sixth: **consistency**
 * (§5). Similarity asks whether two things are the same thing; consistency asks
 * whether, when they are, they are *called* the same thing and *used* the same
 * way. It is two modules rather than one because it is two readers with nothing
 * in common but the question. `lib/assess-naming.js` reads names — class names,
 * component tags, the components `DESIGN-SYSTEM.md` registers — and reports what
 * strays from the house style the codebase already has. `lib/assess-props.js`
 * reads *attributes*, which no other pass in the assessment looks at, and
 * reports the call sites that contradict a component's own contract. They hang
 * off this object under `naming` and `props`, and are counted separately again:
 * a component named two ways and a component called two ways are two problems,
 * and one number cannot answer both.
 */

import { assessExtras } from './assess-extras.js';
import { assessHygiene } from './assess-hygiene.js';
import { assessNaming } from './assess-naming.js';
import { assessProps } from './assess-props.js';
import { scoreAssessment } from './assess-score.js';
import { assessSimilarity } from './assess-similarity.js';
import { scanCandidates, scanMarkup } from './candidates.js';
import { detectProject } from './detect.js';
import { existingTokenFor } from './tokenise-prose.js';
import { componentPassRuns, lintRuleFor, severityFor } from './tokenise-spec.js';
import {
  clusterIsKnown,
  clusterSightings,
  displayValue,
  knownValues,
  normaliseValue,
  proposeTokens,
  scanCodebase,
  toPx,
} from './tokenise.js';

/** The widened sweep is bounded on purpose; a report says what it read. */
export const SCAN_LIMITS = { maxFiles: 2000, maxDepth: 12 };

const PASSES = ['colours', 'numbers', 'typography', 'shadows', 'borders'];

/** The two severities, so a caller can count without spelling them itself. */
export const ERROR = 'error';
export const WARN = 'warn';

/**
 * Why the component pass did not run, in one sentence the user can act on.
 *
 * An empty project and an unsupported stack are different facts, and neither is
 * "no components found" — saying that would imply a pass that never happened.
 */
function componentSkipReason(detection) {
  if (detection.empty) {
    return 'there is nothing here to read yet, so no component pass ran';
  }
  return (
    `component detection is React-only in v0.2.0, and this looks like ${detection.framework} — ` +
    'the values pass above ran in full'
  );
}

/**
 * A cluster as the mapping table reads it: the value, where and how often it is
 * used, and which pass it belongs to.
 */
function inventoryRow(cluster) {
  return {
    pass: cluster.pass,
    role: cluster.role ?? null,
    // Which family of the lint rules this value belongs to. It is a fact about
    // the value rather than about the finding, so a covered row carries it too:
    // "your radii are all named" is only sayable if named radii know they are
    // radii.
    rule: lintRuleFor(cluster),
    value: displayValue(cluster),
    count: cluster.count,
    files: cluster.files,
    properties: [...new Set(cluster.members.flatMap((member) => member.properties ?? []))],
    // Each member keeps its own files and properties, not just its value. A
    // cluster's `files` is the union, which is the right answer for a report and
    // the wrong one for `apply`: a PRD criterion names the literal *and* the file
    // it is written in, so the member has to carry both.
    members: cluster.members.map((member) => ({
      value: cluster.pass === 'typography' ? member.size : member.value,
      count: member.count,
      files: [...(member.files ?? [])],
      properties: [...(member.properties ?? [])],
    })),
    merged: cluster.members.length > 1,
  };
}

/**
 * Does the design system already name this value, whatever it applies to?
 *
 * The question is looser than the covered/uncovered split on purpose. An
 * unreadable sighting has no role, so it cannot be matched role-for-role — but a
 * `#2563EB` the system already calls `color-primary` is not worth asking about
 * again, and an accepted answer has to make the row disappear on the next run.
 */
function alreadyNamed(row, model) {
  if (row.kind === 'colour') return knownValues(model).colours.has(normaliseValue(row.value));
  const px = toPx(row.value);
  return (model?.tokens?.numbers ?? []).some(
    (token) =>
      normaliseValue(token[1]) === normaliseValue(row.value) ||
      (px !== null && toPx(token[1]) !== null && toPx(token[1]) === px),
  );
}

/**
 * The fourth bucket: values the scan could see but not read.
 *
 * A colour or a length written against a property no table gives a meaning to —
 * `accent: '#7C3AED'`, `box-shadow: 0 2px 8px …`, a Kotlin constant nobody named
 * after a CSS property. Phyllum will not invent the role, so these are never
 * proposals; they are questions, and the review asks them the same way `tokenise`
 * asks what a bare length applies to.
 */
export function unreadableRows(sightings, model) {
  const rows = new Map();
  for (const sighting of sightings) {
    const key = `${sighting.kind}|${normaliseValue(sighting.value)}`;
    const row =
      rows.get(key) ??
      { kind: sighting.kind, value: sighting.value, count: 0, files: [], properties: [] };
    row.count += 1;
    if (!row.files.includes(sighting.file)) row.files.push(sighting.file);
    if (sighting.property && !row.properties.includes(sighting.property)) {
      row.properties.push(sighting.property);
    }
    rows.set(key, row);
  }
  return (
    [...rows.values()]
      .filter((row) => !alreadyNamed(row, model))
      // A value seen but not read still gets a severity — how often it is
      // written is a fact — but never a rule. Naming its family would mean
      // guessing which family it is in, and not guessing is the whole reason
      // this bucket exists.
      .map((row) => ({ ...row, rule: null, severity: severityFor(row.count) }))
      .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)))
  );
}

/**
 * The findings counted two ways: how serious they are, and what kind they are.
 *
 * Both counts are derived from the rows rather than accumulated alongside them,
 * so there is no way for the summary to disagree with the table underneath it —
 * the failure mode a report has to be built against, because nobody checks a
 * total by hand.
 */
export function summariseFindings(rows) {
  const bySeverity = { [ERROR]: 0, [WARN]: 0 };
  const byRule = {};
  for (const row of rows) {
    if (row.severity) bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
    // A row with no rule is the fourth bucket, and it is counted under the one
    // honest label available: Phyllum saw it and could not say what it is.
    const rule = row.rule ?? 'unread';
    byRule[rule] = (byRule[rule] ?? 0) + 1;
  }
  return { total: rows.length, bySeverity, byRule };
}

/**
 * The values pass: scan, cluster, then split covered from uncovered.
 *
 * `covered` is the half a rerun exists for. A value the system already names is
 * not a proposal — it is evidence that the token is doing its job — so it is
 * reported as coverage and never offered for naming again.
 */
export function assessValues(root, model, options = {}) {
  const stats = {};
  const unreadable = [];
  // Custom-property names, declared or spent, collected by the same walk
  // (v0.2.1 M6). It answers one question and feeds one check — see
  // `unusedTokens` — and deliberately touches no value finding, severity,
  // cluster, proposal or score.
  const names = new Set();
  const sightings = scanCodebase(root, {
    ...SCAN_LIMITS,
    ...options,
    text: true,
    gitignore: true,
    stats,
    unknown: unreadable,
    names,
  });

  const known = knownValues(model);
  const clusters = clusterSightings(sightings);
  const covered = [];
  const uncovered = [];
  for (const cluster of clusters) {
    if (!clusterIsKnown(cluster, known)) {
      // Only an uncovered value is a finding, so only an uncovered value has a
      // severity. A covered one is evidence a token is doing its job.
      uncovered.push({ ...inventoryRow(cluster), severity: severityFor(cluster.count) });
      continue;
    }
    const token = existingTokenFor(cluster.representative, model);
    covered.push({ ...inventoryRow(cluster), severity: null, token: token?.name ?? null });
  }

  // Proposals come back from the same clusters in the same order, so a proposal
  // is severity-classified by the same count its inventory row was.
  const proposals = proposeTokens(sightings, model).map((proposal) => ({
    ...proposal,
    rule: lintRuleFor(proposal),
    severity: severityFor(proposal.count),
  }));
  const counts = Object.fromEntries(
    PASSES.map((pass) => [pass, proposals.filter((proposal) => proposal.pass === pass).length]),
  );
  // The fourth bucket: seen, not read. One question each, never a proposal until
  // the user says what it applies to.
  const unread = unreadableRows(unreadable, model);

  return {
    files: stats.files ?? 0,
    dataFiles: stats.dataFiles ?? 0,
    sightings,
    // Sorted, because everything an assessment returns has to be the same on
    // two runs over the same codebase — a Set's insertion order is the walk's
    // order, which is stable, but saying so out loud costs one call.
    names: [...names].sort(),
    // Every distinct value the codebase uses, most-used first — the mapping
    // table's rows, covered and uncovered together.
    inventory: [...covered, ...uncovered].sort((a, b) => b.count - a.count),
    covered,
    uncovered,
    unreadable: unread,
    proposals,
    counts,
    // How the findings break down by severity and by rule family. Both are
    // derived rather than stored, so they can never disagree with the rows.
    findings: summariseFindings([...uncovered, ...unread]),
    // How many times a raw value is written out across the whole codebase. This
    // is the number that makes drift feel like a size rather than a list.
    raw: sightings.reduce((total, sighting) => total + sighting.count, 0),
  };
}

/**
 * The component pass: repeated markup patterns the design system has never been
 * told about. React only in v0.2.0, and honest about it when it does not run.
 */
export function assessComponents(root, model, detection, options = {}) {
  if (!componentPassRuns(detection.frameworkId)) {
    return {
      ran: false,
      stack: detection.framework,
      reason: componentSkipReason(detection),
      candidates: [],
    };
  }
  return {
    ran: true,
    stack: detection.framework,
    reason: null,
    candidates: scanCandidates(root, model, { ...SCAN_LIMITS, ...options }),
  };
}

/**
 * Assess a project: detect, scan, aggregate. Values in, inventory out.
 *
 * The returned object is the whole assessment, and it is the contract the mapping
 * table and the suggestion tracks are built against — they read this, they do not
 * rescan. Nothing was written to produce it.
 */
export function assess(root, model, options = {}) {
  const detection = detectProject(root);
  const values = assessValues(root, model, options);
  // The markup walk, done once and handed to everyone who needs it (v0.2.1 M6).
  // Four passes below ask for the same list of element/class signatures, and
  // until now each one walked the tree and re-read every markup file to get it.
  // It is computed here rather than cached inside `scanMarkup` because this
  // function is the only scope in which "the codebase has not changed" is
  // guaranteed — `apply run` assesses and then edits source in the same process,
  // and a cache that outlived one assessment would eventually answer with the
  // codebase as it was before the edits.
  //
  // Only when the component pass runs, because that is the same condition all
  // five consumers already gate on: no markup pass, no markup walk.
  const scanOptions = { ...SCAN_LIMITS, ...options };
  if (componentPassRuns(detection.frameworkId) && !scanOptions.signatures) {
    scanOptions.signatures = scanMarkup(root, scanOptions);
  }

  const components = assessComponents(root, model, detection, scanOptions);

  const hygiene = assessHygiene(root, model, detection, values, components, scanOptions);
  // Counted by the same function the value findings are counted by, so one
  // vocabulary covers both halves of the report and neither can drift into a
  // private way of saying "two warnings".
  hygiene.summary = summariseFindings(hygiene.findings);

  const similarity = assessSimilarity(root, model, components, scanOptions);
  // Counted by the same summariser again. A similarity finding carries a score
  // as well as a severity, but the score is how the severity was decided — so
  // the counts stay in one vocabulary and the report never has two ways of
  // saying "one error".
  similarity.summary = summariseFindings(similarity.findings);

  const naming = assessNaming(root, model, components, scanOptions);
  const props = assessProps(root, model, components, scanOptions);
  // The same summariser a fourth and fifth time, and the two families are kept
  // apart from each other as well as from everything else. A name that strays
  // from the house style is untidy; a prop that contradicts a component's own
  // contract is broken. Counting them together would let the second hide inside
  // the first.
  naming.summary = summariseFindings(naming.findings);
  props.summary = summariseFindings(props.findings);

  // And the sixth family, which is six checks rather than one (§8): the ones
  // that read a colour against another colour, a dark theme against a light
  // one, and the two kinds of literal no property table gives a role to. They
  // are last because they are the only family that needs the values pass to
  // have finished — "token-worthy" is a severity, and severities are counted
  // above.
  const extras = assessExtras(root, model, values, scanOptions);
  extras.summary = summariseFindings(extras.findings);

  const result = {
    root,
    readOnly: true,
    detection,
    values,
    components,
    hygiene,
    similarity,
    naming,
    props,
    extras,
    summary: {
      filesRead: values.files,
      rawValues: values.raw,
      distinctValues: values.inventory.length,
      covered: values.covered.length,
      proposed: values.proposals.length,
      unreadable: values.unreadable.length,
      // The two numbers the v0.2.1 report leads with: how much of the drift is
      // systematic, and how much of it looks like a deliberate exception.
      errors: values.findings.bySeverity[ERROR],
      warnings: values.findings.bySeverity[WARN],
      byRule: values.findings.byRule,
      componentCandidates: components.candidates.length,
      componentPassRan: components.ran,
      // Hygiene is counted separately from the value findings on purpose. A
      // stale token is not drift, and adding it to the drift count would make
      // the headline number answer two questions at once.
      collisions: hygiene.collisions.length,
      unusedTokens: hygiene.unused.tokens.length,
      unusedComponents: hygiene.unused.components.length,
      hygieneFindings: hygiene.findings.length,
      // Similarity is counted separately again, and for the third time the
      // reason is that it answers its own question: two components being one
      // component is not more drift, it is fewer components.
      clones: similarity.clones.length,
      styleDuplicates: similarity.duplicates.length,
      utilityOverlaps: similarity.overlaps.length,
      similarityFindings: similarity.findings.length,
      // Consistency, counted its own way for the same reason again — and split
      // in two, because §5's two halves do not fail alike: naming drift is
      // always a warning and a prop mismatch is usually an error.
      namingDrift: naming.drift.length,
      namingStrays: naming.strays.length,
      namingFindings: naming.findings.length,
      propSynonyms: props.synonyms.length,
      propConflicts: props.conflicts.length,
      propBypasses: props.bypasses.length,
      propFindings: props.findings.length,
      propPassRan: props.checked,
      // The §8 extras, counted apart again — and the two that can decline to
      // run reported as declined rather than as empty.
      nearDuplicateColours: extras.colours.length,
      darkModeGaps: extras.dark.rows.length,
      darkModeChecked: extras.dark.checked,
      tokenAliases: extras.aliases.length,
      offScaleSpacing: extras.spacing.rows.length,
      offScaleChecked: extras.spacing.checked,
      zIndexSprawl: extras.zIndex.length,
      hardcodedBreakpoints: extras.breakpoints.length,
      extraFindings: extras.findings.length,
    },
  };

  // The headline, last, because it is the only thing here that reads every
  // family at once (§7.1). `clean` comes back from the same object the score
  // and the verdict do, so the summary's oldest flag and the report's newest
  // sentence are one judgement rather than two.
  result.score = scoreAssessment(result);
  result.summary.score = result.score.score;
  result.summary.verdict = result.score.verdict;
  result.summary.driftMass = result.score.mass;
  result.summary.totalErrors = result.score.errors;
  result.summary.totalWarnings = result.score.warnings;
  result.summary.clean = result.score.clean;
  return result;
}
