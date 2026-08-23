/**
 * The typography-reading scan — `assess` learns the other eighteen declarations
 * (v0.7.3 plan, phase 4, "The scanner").
 *
 * Until v0.7.3 the values pass read exactly three typographic facts out of a
 * codebase: a font size, a weight and a line-height, read together because a
 * type token recorded those three and nothing else. A token now records
 * twenty-one readings, so a scan that still reads three is a scan that reports a
 * codebase as tidier than it is. A `letter-spacing: 0.02em` written eleven times
 * is drift in exactly the sense the rest of the report already means by drift,
 * and until this module it was either dropped in silence or filed under "seen,
 * not read" with the honest but useless label `role unknown`.
 *
 * The one rule this module exists to keep is the one the phase order was chosen
 * for: **the scanner and the generator must agree on which declaration a reading
 * owns.** `lib/codegen.js` asks `declarationsFor` what CSS a recorded reading
 * becomes; this module asks the same contract table, in `skill/refs/typography.md`,
 * which reading a scanned declaration is. Neither holds a second copy of the map,
 * so widening the table widens both halves at once and they cannot drift apart.
 *
 * Four decisions shape what is read.
 *
 * **A declaration is matched by property, then by keyword.** A reading whose
 * contract cell lists words — the five bare readings and the two enums that name
 * their alternatives — matches only when the scanned value carries one of those
 * words. `text-decoration-line: underline line-through` is therefore two
 * readings, which is the same merge rule read backwards. A reading whose cell
 * names only a property takes the value exactly as written, because the never-
 * correct rule applies to a value read out of code as much as to one read out of
 * a sentence.
 *
 * **A declaration naming none of the listed words records nothing.**
 * `font-style: normal` and `text-decoration-line: none` are the CSS initial
 * values written out, not a typeface decision, and they are passed over the way
 * `border: none` and `box-shadow: none` already are.
 *
 * **A reading is proposed onto a token only when the code says which token.** A
 * type token's mandatory core is a size, a weight and a line-height, so a
 * reading cannot become a token on its own. When the rule block that carries the
 * reading also carries a font size, the block names the type decision the
 * reading belongs to, and the proposed name is the one the typography pass would
 * give that same block — the same `nameTypography` scale, unchanged by this
 * release. When it does not, Phyllum has no token to attach it to and says
 * `ask`, which is what the fourth bucket has always said rather than guessing.
 *
 * **A reading the design system already records is coverage.** A token holding
 * `kerning: 0.02em` makes every `letter-spacing: 0.02em` in the codebase
 * evidence that the token is doing its job, so the row is reported as covered
 * and never proposed again — the same split the colour and number passes make.
 *
 * Like every module on the scan path this one reads and never writes. It takes
 * its own sweep of the project, for the reason `assess-extras.js` takes one: the
 * values pass keeps none of what this needs, because a `letter-spacing` matches
 * no property table and was thrown away before this module existed.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  MAX_SOURCE_BYTES,
  dataBlocks,
  gitignoreMatcher,
  isDataFile,
  readTextFile,
} from './scan-text.js';
import { lintRuleFor, severityFor, sources, threshold } from './tokenise-spec.js';
import { nameTypography, normaliseValue, ruleBlocks, tailwindDeclarations, toPx, uniqueName } from './tokenise.js';
import { CORE_READINGS, readTypography, readings as contractReadings } from './typography.js';

/** The clustering row this pass is measured by, in `refs/assess/detection.md`. */
export const READING_CLUSTER = 'typography reading';

/**
 * How many files the reading sweep opens before it stops. The same bound the
 * rest of the assessment runs under, so the report describes one project rather
 * than one project and a prefix of it.
 */
export const READING_LIMITS = { maxFiles: 2000, maxDepth: 12 };

/**
 * The readings this pass scans for: the eighteen optional ones.
 *
 * The three core readings are deliberately not here. `font-size`, `font-weight`
 * and `line-height` are read by the typography pass as one triple, because a
 * size on its own is not a type decision — and reading them a second time here
 * would count one declaration twice, which is the mistake the compound passes
 * were built to avoid.
 */
export function scannedReadings() {
  return contractReadings().filter((row) => !CORE_READINGS.includes(row.reading));
}

/** Every CSS property the scan watches for, deduplicated, in contract order. */
export function scannedProperties() {
  return [...new Set(scannedReadings().map((row) => row.property))];
}

/** Is this a property the reading scan now reads? Used to stop double counting. */
export function isReadingProperty(property) {
  return scannedProperties().includes(String(property ?? '').toLowerCase());
}

/**
 * Which readings one declaration is, and what value each carries.
 *
 * A property can carry more than one reading — `text-decoration-line` carries
 * two and `font-variant-position` carries two — so this returns a list rather
 * than a row. The order is the contract table's order, which is the order the
 * generator writes merged keywords in.
 */
export function readingsInDeclaration(property, value) {
  const name = String(property ?? '').trim().toLowerCase();
  const written = String(value ?? '').trim();
  if (name === '' || written === '') return [];

  const out = [];
  for (const row of scannedReadings()) {
    if (row.property !== name) continue;
    if (row.values.length === 0) {
      // The cell names a property and nothing else, so the recorded value is
      // whatever the code wrote — verbatim, per the never-correct rule.
      out.push({ reading: row.reading, property: name, value: written, kind: row.kind });
      continue;
    }
    // The cell names its words, so only those words are this reading. A value
    // naming none of them — `font-style: normal`, `text-decoration-line: none` —
    // is the initial value written out rather than a decision, and records
    // nothing, exactly as `border: none` does.
    const found = row.values.find((word) =>
      new RegExp(`(^|[\\s,])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s,])`, 'i').test(written),
    );
    if (found) out.push({ reading: row.reading, property: name, value: found, kind: row.kind });
  }
  return out;
}

/**
 * The type decision a block states, or null.
 *
 * A reading belongs to the type the same rule block sets, and this is how the
 * block says which one. It reads the same three declarations the typography
 * pass reads, including the `font` shorthand, so the name this pass proposes and
 * the name the typography pass proposes for one rule block are one name.
 */
export function coreOf(pairs = []) {
  const core = { size: null, weight: null, lineHeight: null };
  for (const { property, value } of pairs) {
    const name = String(property ?? '').toLowerCase();
    if (name === 'font-size') core.size = value;
    else if (name === 'font-weight') core.weight = value;
    else if (name === 'line-height') core.lineHeight = value;
    else if (name === 'font') {
      const shorthand = String(value).match(/(?:(\d{3})\s+)?(-?\d*\.?\d+(?:px|rem))(?:\s*\/\s*([^\s]+))?/i);
      if (shorthand) {
        core.weight = shorthand[1] ?? core.weight;
        core.size = shorthand[2];
        core.lineHeight = shorthand[3] ?? core.lineHeight;
      }
    }
  }
  if (!core.size) return null;
  // The same two fallbacks the typography pass uses, so one rule block cannot
  // name itself two ways: an absent weight and line-height are the CSS initial
  // values, and they are what the name is read against.
  return { size: core.size, weight: core.weight ?? '400', lineHeight: core.lineHeight ?? 'normal' };
}

/** Every reading sighting in one block of declarations, with the type it sits on. */
export function readingsInBlock(pairs = [], file = '') {
  const owner = coreOf(pairs);
  const out = [];
  for (const { property, value } of pairs) {
    for (const found of readingsInDeclaration(property, value)) {
      out.push({ ...found, file, owner });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

/**
 * The same walk the other passes take — the same extensions, the same skip
 * list, the same `.gitignore`, the same bounded budget — because a sweep with
 * its own idea of what a source file is would report on a different project
 * than the rest of the assessment did.
 */
export function readingSweep(root, { maxFiles = READING_LIMITS.maxFiles, maxDepth = READING_LIMITS.maxDepth } = {}) {
  const { extensions, skipped, stylesheets } = sources();
  const known = new Set(extensions);
  const styleExtensions = new Set(stylesheets);
  const skip = new Set(skipped);
  const resolved = path.resolve(root);
  const ignored = gitignoreMatcher(resolved);

  const sightings = [];
  let files = 0;
  let budget = maxFiles;

  const walk = (dir, depth) => {
    if (depth > maxDepth || budget <= 0) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (budget <= 0) return;
      if (skip.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(resolved, full).split(path.sep).join('/');
      if (ignored(rel)) continue;
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      const wanted = known.has(extension);
      if (!wanted && !isDataFile(entry.name)) continue;
      if (budget-- <= 0) return;
      const text = wanted ? readTextFile(full, { maxBytes: MAX_SOURCE_BYTES }) : readTextFile(full);
      if (text === null) continue;
      files += 1;

      if (!wanted) {
        for (const block of dataBlocks(text)) sightings.push(...readingsInBlock(block, rel));
        continue;
      }

      const markup = !styleExtensions.has(extension);
      for (const block of ruleBlocks(text, { markup })) sightings.push(...readingsInBlock(block, rel));
      if (markup) sightings.push(...readingsInBlock(tailwindDeclarations(text), rel));
    }
  };

  walk(resolved, 0);
  return { files, sightings };
}

// ---------------------------------------------------------------------------
// Clustering and coverage
// ---------------------------------------------------------------------------

/** Two reading sightings are one value when the reading and the value agree. */
function sameReadingValue(a, b, limit) {
  if (a.reading !== b.reading) return false;
  if (normaliseValue(a.value) === normaliseValue(b.value)) return true;
  const one = toPx(a.value);
  const two = toPx(b.value);
  // A unit Phyllum cannot convert is compared as written rather than guessed at,
  // which is the rule the compound passes already follow.
  return one !== null && two !== null && Math.abs(one - two) <= limit;
}

/**
 * Every distinct reading value the codebase writes, most-used first.
 *
 * The representative is the most-used member, never an average — a value nobody
 * wrote is never reported, and never proposed.
 */
export function clusterReadings(sightings = []) {
  const limit = threshold(READING_CLUSTER);
  const clusters = [];
  for (const sighting of sightings) {
    // Matched against the cluster's own reading and representative value, not
    // against one of its members: a member is a value and a count, and only the
    // cluster knows which reading it is.
    const found = clusters.find((cluster) =>
      sameReadingValue({ reading: cluster.reading, value: cluster.members[0].value }, sighting, limit),
    );
    const cluster = found ?? { reading: sighting.reading, property: sighting.property, kind: sighting.kind, members: [], count: 0, files: [], owners: [] };
    if (!found) clusters.push(cluster);

    const member = cluster.members.find((row) => normaliseValue(row.value) === normaliseValue(sighting.value));
    if (member) {
      member.count += 1;
      if (!member.files.includes(sighting.file)) member.files.push(sighting.file);
    } else {
      cluster.members.push({ value: sighting.value, count: 1, files: [sighting.file] });
    }
    cluster.count += 1;
    if (!cluster.files.includes(sighting.file)) cluster.files.push(sighting.file);
    if (sighting.owner) cluster.owners.push(sighting.owner);
  }

  for (const cluster of clusters) {
    cluster.members.sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
    cluster.value = cluster.members[0].value;
    cluster.merged = cluster.members.length > 1;
  }
  return clusters.sort(
    (a, b) =>
      b.count - a.count ||
      a.reading.localeCompare(b.reading) ||
      String(a.value).localeCompare(String(b.value)),
  );
}

/**
 * Which tokens already record which readings, as the coverage check reads them.
 *
 * `readTypography` is the one reader of the optional blocks, so a value the
 * design system names is recognised here on exactly the evidence the file
 * states — never on a second parse of the same block.
 */
export function recordedReadings(model) {
  const { readings } = readTypography(model);
  const rows = [];
  for (const [token, held] of Object.entries(readings ?? {})) {
    for (const [reading, value] of Object.entries(held)) rows.push({ token, reading, value });
  }
  return rows;
}

/** The token that already names this reading value, or null. */
export function coveringToken(cluster, recorded = []) {
  const limit = threshold(READING_CLUSTER);
  const row = recorded.find((held) => {
    if (held.reading !== cluster.reading) return false;
    // A bare reading carries no value at all, so a token recording it names
    // every sighting of it — there is nothing else the declaration could say.
    if (cluster.kind === 'bare') return held.value === true;
    if (normaliseValue(held.value) === normaliseValue(cluster.value)) return true;
    const one = toPx(held.value);
    const two = toPx(cluster.value);
    return one !== null && two !== null && Math.abs(one - two) <= limit;
  });
  return row ? row.token : null;
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

/**
 * One inventory row, in the shape the mapping table and the findings table
 * already read: a value, where and how often it is written, and which family of
 * the lint rules it belongs to.
 */
function readingRow(cluster) {
  return {
    pass: 'typography',
    reading: cluster.reading,
    property: cluster.property,
    kind: cluster.kind,
    // A reading value is filed under the family a type decision belongs to,
    // read from the rules table rather than spelled out here.
    rule: lintRuleFor({ pass: 'typography' }),
    value: cluster.kind === 'bare' ? `${cluster.property}: ${cluster.value}` : cluster.value,
    count: cluster.count,
    files: cluster.files,
    properties: [cluster.property],
    members: cluster.members.map((member) => ({
      value: member.value,
      count: member.count,
      files: [...member.files],
      properties: [cluster.property],
    })),
    merged: cluster.merged,
  };
}

/**
 * The token a reading would be recorded on, when the code says which.
 *
 * The name comes from `nameTypography` — the release's untouched naming scale,
 * where weight picks the role and size picks the band — so a reading proposed
 * here and a type token proposed by the values pass for the same rule block
 * carry one name rather than two.
 */
export function proposalFor(cluster, taken, named = new Map()) {
  const owner = cluster.owners[0] ?? null;
  if (!owner) return null;
  const name = nameTypography(owner);
  // Two readings written on the same type are two readings of **one** token, so
  // the name is spent once per type rather than once per reading. Without this
  // a rule block stating a kerning and a case would propose `highlight-large`
  // and `highlight-large-2` for what the code says is a single decision.
  const key = `${owner.size}|${owner.weight}|${owner.lineHeight}`;
  const unique = named.get(key) ?? uniqueName(name, taken);
  named.set(key, unique);
  return {
    reading: cluster.reading,
    property: cluster.property,
    value: cluster.kind === 'bare' ? true : cluster.value,
    name: unique,
    suggestedName: name,
    size: owner.size,
    weight: owner.weight,
    lineHeight: owner.lineHeight,
    count: cluster.count,
    files: cluster.files,
    severity: severityFor(cluster.count),
    rule: lintRuleFor({ pass: 'typography' }),
    source: 'assess-typography',
  };
}

/**
 * The reading pass, in the shape every other family already has.
 *
 * `covered` is what a token already names, `uncovered` is what nothing does, and
 * only the second half carries a severity — a covered value is evidence a token
 * is doing its job rather than a finding about the codebase. Nothing here is a
 * conversation and nothing here needs a model: the whole pass is the scan
 * formatted, which is what keeps the report complete in a plain terminal.
 */
export function assessTypographyReadings(root, model, options = {}) {
  const sweep = readingSweep(root, options);
  const clusters = clusterReadings(sweep.sightings);
  const recorded = recordedReadings(model);

  // Names already spent, so a proposed name never collides with a token the
  // design system holds — the same guard the values pass applies.
  const taken = new Set();
  for (const key of ['colours', 'numbers', 'typography']) {
    for (const row of model?.tokens?.[key] ?? []) if (row[0]) taken.add(row[0]);
  }

  const covered = [];
  const uncovered = [];
  const proposals = [];
  const named = new Map();
  for (const cluster of clusters) {
    const token = coveringToken(cluster, recorded);
    if (token) {
      covered.push({ ...readingRow(cluster), severity: null, token });
      continue;
    }
    const proposal = proposalFor(cluster, taken, named);
    uncovered.push({ ...readingRow(cluster), severity: severityFor(cluster.count), proposal });
    proposals.push(proposal);
  }

  return {
    ran: true,
    // Counts rather than rows, deliberately. `--json` publishes this object, and
    // the one thing that file must never carry is the raw scan evidence already
    // summarised into the inventory beneath it.
    swept: {
      files: sweep.files,
      readings: scannedReadings().length,
      properties: scannedProperties().length,
      sighted: sweep.sightings.length,
    },
    covered,
    uncovered,
    proposals,
    // The whole inventory in one list, most-used first, covered beside
    // uncovered — the same shape the mapping table reads the value passes in.
    inventory: [...covered, ...uncovered].sort((a, b) => b.count - a.count),
  };
}
