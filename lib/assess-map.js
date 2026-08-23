/**
 * The mapping table — `assess` step 4 (v0.2.0 plan §5.1).
 *
 * Step 3 leaves an aggregated inventory: every distinct value the codebase uses,
 * clustered and counted. This module turns that into the one artefact the plan
 * asks for — a table whose row is a whole decision:
 *
 *   value · where and how often it is used · what it looks like it means ·
 *   whether the design system already covers it
 *
 * Two properties of this table are deliberate. It is **mechanical**: no model, no
 * conversation, nothing but the scan result formatted, so it works in a plain
 * terminal with nothing installed. And it is **complete**: four buckets in one
 * ranking rather than a list of problems, because "how far has this drifted?" is
 * only answerable if what is *already* named is on the page next to what is not.
 *
 *   named             the system already has a token for this value
 *   not named yet     a proposal is waiting, with the name Phyllum would suggest
 *   seen, not read    plainly a colour or a length, on a property no table names
 *   patterns          repeated markup the system has never been told about
 *
 * The third bucket is the one that used to be dropped in silence. Surfacing it is
 * not the same as guessing at it: the row says "role unknown", and the review
 * asks, exactly as `tokenise` asks what a bare length applies to.
 */

import { appliesToFor, isCompoundPass, appliesToForCluster } from './tokenise-spec.js';

/** Column widths, in the order the table reads. */
const WIDTH = { value: 20, used: 9, where: 26, means: 30 };

/** The typography row reads all three facts, because the cluster is all three. */
const TYPOGRAPHY_MEANS = 'font size, weight, line-height';

const truncate = (text, width) => {
  const raw = String(text ?? '');
  return raw.length <= width ? raw : `${raw.slice(0, width - 1)}…`;
};

const pad = (text, width) => truncate(text, width).padEnd(width);

/** `src/styles.css +2 more` — the first file, and how many others there are. */
export function whereFor(files = []) {
  if (files.length === 0) return '—';
  return files.length === 1 ? files[0] : `${files[0]} +${files.length - 1} more`;
}

/**
 * What a value looks like it means, in the terms the scan actually established:
 * the properties it was written against, or the role its property carries. Never
 * a reading of intent — Phyllum reports what the code says, not what it meant.
 */
export function meansFor(row) {
  // The unread row leads with the fact that decides what happens next: the value
  // is legible, its role is not, and Phyllum will ask rather than assume.
  if (row.bucket === 'unread') return `${row.kind}, role unknown`;
  // A reading row says which of the twenty-one readings it is and which
  // declaration it was written as, because those are the two facts that decide
  // what it becomes: `kerning on letter-spacing`. The reading is the word a
  // designer would use; the property is the word the code used.
  // …but a reading whose name is its property says nothing twice, so the
  // property is named only where it adds something — the rule the compound row
  // below already follows.
  if (row.reading) return row.reading === row.property ? row.reading : `${row.reading} on ${row.property}`;
  if (row.pass === 'typography') return TYPOGRAPHY_MEANS;
  // A compound says what it is and where it sits: "shadow on box-shadow". The
  // property matters here in a way it does not for a length, because `shadow`
  // and `text-shadow` are the same kind of value on different things.
  if (isCompoundPass(row.pass)) {
    const label = appliesToForCluster(row);
    // …but "border on border" says nothing twice, so the property is named only
    // where it adds something the label did not already say.
    const properties = (row.properties ?? []).filter((property) => property !== label);
    return properties.length === 0 ? label : `${label} on ${properties.slice(0, 2).join(', ')}`;
  }
  if (row.pass === 'numbers') return row.role ? appliesToFor(row.role) : 'length';
  const properties = row.properties ?? [];
  return properties.length === 0 ? 'colour' : `colour on ${properties.slice(0, 2).join(', ')}`;
}

/**
 * Every inventory row as the table reads it, most-used first.
 *
 * The proposal for an uncovered row is found by position, not by search:
 * `values.uncovered` and `values.proposals` are the same clusters in the same
 * order, which is the contract the scan engine returns them under.
 */
export function mapRows(result) {
  const { values } = result;
  const rows = [];

  for (const row of values.covered) {
    rows.push({ ...row, bucket: 'named', coverage: row.token ?? 'already named' });
  }
  values.uncovered.forEach((row, index) => {
    const proposal = values.proposals[index] ?? null;
    rows.push({
      ...row,
      bucket: 'proposed',
      proposal,
      coverage: proposal ? `${proposal.name} (proposed)` : 'not named yet',
    });
  });
  // The eighteen optional typography readings (v0.7.3 phase 4), on the same
  // table as everything else and for the same reason the covered rows are: a
  // `letter-spacing` written eleven times is drift, and drift is only legible
  // beside what the design system already names.
  const typography = values.typography ?? { covered: [], uncovered: [] };
  for (const row of typography.covered ?? []) {
    rows.push({ ...row, bucket: 'named', coverage: row.token ?? 'already named' });
  }
  for (const row of typography.uncovered ?? []) {
    rows.push({
      ...row,
      bucket: 'proposed',
      // A reading cannot become a token on its own — a Typography row needs a
      // size, a weight and a line-height — so a name is proposed only where the
      // rule block that carried the reading also stated the type. Where it did
      // not, the row says `ask`, which is the fourth bucket's own answer and
      // not a guess dressed as one.
      coverage: row.proposal ? `${row.proposal.name} (proposed)` : 'ask',
    });
  }

  for (const row of values.unreadable) {
    rows.push({ ...row, bucket: 'unread', pass: null, role: null, coverage: 'ask' });
  }

  return rows.sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

/** One row of the table. */
export function renderMapRow(row) {
  return (
    `  ${pad(row.value, WIDTH.value)}` +
    ` ${pad(`used ${row.count}×`, WIDTH.used)}` +
    ` ${pad(whereFor(row.files), WIDTH.where)}` +
    ` ${pad(meansFor(row), WIDTH.means)}` +
    ` ${row.coverage}`
  );
}

const HEADER =
  `  ${pad('value', WIDTH.value)}` +
  ` ${pad('used', WIDTH.used)}` +
  ` ${pad('where', WIDTH.where)}` +
  ` ${pad('what it looks like', WIDTH.means)}` +
  ' coverage';

/** How the four buckets add up, in one line. */
export function renderBuckets(result) {
  const { summary } = result;
  const parts = [
    `${summary.covered} already named`,
    `${summary.proposed} not named yet`,
    `${summary.unreadable} seen but not read`,
  ];
  if (result.components.ran) {
    parts.push(`${summary.componentCandidates} repeated pattern${summary.componentCandidates === 1 ? '' : 's'}`);
  }
  return `  Four buckets: ${parts.join(' · ')}.`;
}

/**
 * The typography readings, counted apart in one line (v0.7.3 phase 4).
 *
 * They are on the table above like every other value, so this is a count rather
 * than a list. It is printed because the eighteen new readings are the part of
 * the report a reader has no reason to expect yet: without a sentence saying
 * the scan looked for a kerning and a text-transform, an empty result reads as
 * "there is none of that here" when it might mean "nobody looked".
 */
export function renderReadings(result) {
  const typography = result?.values?.typography;
  if (!typography?.ran) return null;
  const covered = typography.covered.length;
  const proposed = typography.uncovered.length;
  const swept = typography.swept?.readings ?? 0;
  if (covered + proposed === 0) {
    return `  Read every one of the ${swept} optional typography readings — no kerning, case, face or decoration is written raw.`;
  }
  return (
    `  Of the ${swept} optional typography readings, ${covered} already named and ` +
    `${proposed} written raw — kerning, case, face and decoration count as type drift too.`
  );
}

/**
 * One component candidate as the user reads it: the name it would get, the markup
 * signature it was recognised by, and how often the code repeats it.
 */
export function renderCandidate(candidate) {
  const where =
    candidate.files.length > 1
      ? `${candidate.files[0]} +${candidate.files.length - 1} more`
      : candidate.files[0];
  // "repeated", not "used": the counted-value column of the map above is the one
  // place `used N×` means a value sighting, and one meaning per phrase keeps the
  // report's own ranking readable.
  return ` ${candidate.name} — \`${candidate.signature}\` repeated ${candidate.count}× (${where})`;
}

/**
 * What clustering folded together, said out loud.
 *
 * A row of this table can stand for several values the code actually contains,
 * and hiding that would make the inventory look tidier than the codebase is. The
 * representative is always the most-used member — never an average — so naming it
 * is a decision about all of them.
 */
export function renderMerges(rows, { limit = 4 } = {}) {
  const merged = rows.filter((row) => row.merged && (row.members ?? []).length > 1);
  if (merged.length === 0) return [];

  const out = [];
  for (const row of merged.slice(0, limit)) {
    const others = row.members.slice(1).map((member) => member.value);
    out.push(`  ${row.value} also stands for ${others.join(', ')} — one decision, not ${row.members.length}.`);
  }
  if (merged.length > limit) out.push(`  …and ${merged.length - limit} more clusters like that.`);
  return out;
}

/**
 * The table, or an honest sentence when there is nothing to put in one.
 *
 * `limit` bounds the rows shown; the count of what was left out is printed rather
 * than implied, because a truncated table that does not say so is a lie about the
 * size of the problem.
 */
export function renderMap(result, { limit = 12 } = {}) {
  const rows = mapRows(result);
  if (rows.length === 0) {
    return ['  Nothing to map — no raw colour, length or typography value was read.'];
  }

  const out = [HEADER];
  for (const row of rows.slice(0, limit)) out.push(renderMapRow(row));
  if (rows.length > limit) out.push(`  …and ${rows.length - limit} more rows.`);

  const merges = renderMerges(rows);
  if (merges.length > 0) out.push('', ...merges);
  out.push('', renderBuckets(result));
  const readings = renderReadings(result);
  if (readings) out.push(readings);
  return out;
}
