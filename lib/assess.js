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
 */

import { scanCandidates } from './candidates.js';
import { detectProject } from './detect.js';
import { existingTokenFor } from './tokenise-prose.js';
import { componentPassRuns } from './tokenise-spec.js';
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

const PASSES = ['colours', 'numbers', 'typography'];

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
  return [...rows.values()]
    .filter((row) => !alreadyNamed(row, model))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
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
  const sightings = scanCodebase(root, {
    ...SCAN_LIMITS,
    ...options,
    text: true,
    gitignore: true,
    stats,
    unknown: unreadable,
  });

  const known = knownValues(model);
  const clusters = clusterSightings(sightings);
  const covered = [];
  const uncovered = [];
  for (const cluster of clusters) {
    if (!clusterIsKnown(cluster, known)) {
      uncovered.push(inventoryRow(cluster));
      continue;
    }
    const token = existingTokenFor(cluster.representative, model);
    covered.push({ ...inventoryRow(cluster), token: token?.name ?? null });
  }

  const proposals = proposeTokens(sightings, model);
  const counts = Object.fromEntries(
    PASSES.map((pass) => [pass, proposals.filter((proposal) => proposal.pass === pass).length]),
  );

  return {
    files: stats.files ?? 0,
    dataFiles: stats.dataFiles ?? 0,
    sightings,
    // Every distinct value the codebase uses, most-used first — the mapping
    // table's rows, covered and uncovered together.
    inventory: [...covered, ...uncovered].sort((a, b) => b.count - a.count),
    covered,
    uncovered,
    // The fourth bucket: seen, not read. One question each, never a proposal
    // until the user says what it applies to.
    unreadable: unreadableRows(unreadable, model),
    proposals,
    counts,
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
  const components = assessComponents(root, model, detection, options);

  return {
    root,
    readOnly: true,
    detection,
    values,
    components,
    summary: {
      filesRead: values.files,
      rawValues: values.raw,
      distinctValues: values.inventory.length,
      covered: values.covered.length,
      proposed: values.proposals.length,
      unreadable: values.unreadable.length,
      componentCandidates: components.candidates.length,
      componentPassRan: components.ran,
      clean:
        values.proposals.length === 0 &&
        values.unreadable.length === 0 &&
        components.candidates.length === 0,
    },
  };
}
