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
  proposeTokens,
  scanCodebase,
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
    members: cluster.members.map((member) => ({
      value: cluster.pass === 'typography' ? member.size : member.value,
      count: member.count,
    })),
    merged: cluster.members.length > 1,
  };
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
  const sightings = scanCodebase(root, {
    ...SCAN_LIMITS,
    ...options,
    text: true,
    gitignore: true,
    stats,
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
      componentCandidates: components.candidates.length,
      componentPassRan: components.ran,
      clean: values.proposals.length === 0 && components.candidates.length === 0,
    },
  };
}
