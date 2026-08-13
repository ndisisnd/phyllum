/**
 * `assess --json` — the machine-readable end of the same pipeline (§6.5.1).
 *
 * The terminal report is a rendering of the assessment object; so is this. That
 * is the whole design: CI, a script or another tool gets **the exact object the
 * report renders from**, never a summary re-derived for machines. If the two
 * ever disagreed, one of them would be lying, and the one nobody reads by eye
 * would be the one that stayed wrong.
 *
 * Three properties this file exists to guarantee.
 *
 * **It is stable.** Two runs over an unchanged codebase produce byte-identical
 * files. Nothing here is a timestamp, a duration, a random id or an absolute
 * path — a diff between two runs is a diff of what changed in the codebase, or
 * it is nothing at all. That is what makes the file useful to check into CI and
 * compare against the last one.
 *
 * **It is versioned.** `schemaVersion` is the first field, so a consumer can
 * refuse a shape it does not know rather than reading a field that moved. The
 * version is about *this file's* shape, not about Phyllum's release, and it
 * changes only when a key changes meaning.
 *
 * **It writes one file and enters no conversation.** `--json` is a
 * read-and-write-one-file run. The review loop is a conversation with a person,
 * and a flag that redirects output to a file has nobody to have it with — so
 * the tracks are not walked, nothing is accepted, and `DESIGN-SYSTEM.md` is not
 * touched. Combining it with `assess update`, whose entire purpose is to accept
 * on your behalf, is refused rather than silently resolved in either direction.
 */

import { packageVersion } from './template.js';
import { specNotices } from './tokenise-spec.js';
import { ASSESS_JSON_FILE, writeAssessJson } from './write.js';

/**
 * The shape of this file. Bump it when a key changes meaning or disappears —
 * never for a key that is merely added, since a reader that ignores unknown
 * keys is a reader adding one cannot break.
 */
export const SCHEMA_VERSION = 1;

/** Where the file lands when the flag carries no path of its own. */
export const DEFAULT_JSON_PATH = ASSESS_JSON_FILE;

/**
 * The assessment as data, minus the two things that must not be in a file
 * meant to be diffed.
 *
 * `sightings` goes because it is every raw reading the scan took — tens of
 * thousands of rows on a real codebase, and every one of them already
 * summarised into the inventory above it. `root` goes because it is an absolute
 * path: the same project assessed from two checkouts would produce two
 * different files, which is exactly the false positive a diff must not show.
 */
export function assessmentJson(result = {}, { mode = 'assess' } = {}) {
  // `names` goes for the same reason `sightings` does: it is raw scan evidence
  // for one internal check, not a finding, and publishing it would invite a
  // consumer to read it as one.
  const { sightings, names, ...values } = result.values ?? {};
  return {
    schemaVersion: SCHEMA_VERSION,
    phyllum: packageVersion(),
    mode,
    readOnly: true,
    detection: result.detection ?? null,
    summary: result.summary ?? null,
    score: result.score ?? null,
    values,
    components: result.components ?? null,
    hygiene: result.hygiene ?? null,
    similarity: result.similarity ?? null,
    naming: result.naming ?? null,
    props: result.props ?? null,
    extras: result.extras ?? null,
    // Empty on a shipped copy of the tables. It is in the file rather than only
    // on the terminal because a CI job is the reader least able to notice that
    // its rules quietly shrank — a machine reading a clean assessment deserves
    // to know it was graded with a rule missing.
    specNotices: specNotices(),
  };
}

/** The bytes, formatted the one way — indented two, one trailing newline. */
export function serialiseAssessment(result, options) {
  return `${JSON.stringify(assessmentJson(result, options), null, 2)}\n`;
}

/**
 * Write the assessment to a JSON file and say where it went.
 *
 * The path goes through the same funnel every other write does; the widening
 * that lets it land outside `.phyllum/` lives in `lib/write.js`, where it is
 * one readable function rather than a caller's judgement call.
 */
export function writeAssessment(root, result, { path: target = DEFAULT_JSON_PATH, mode } = {}) {
  const contents = serialiseAssessment(result, { mode });
  const written = writeAssessJson(root, target, contents);
  return { path: written, bytes: Buffer.byteLength(contents) };
}

/**
 * What the terminal says when the report went to a file instead of to it.
 *
 * Short, and still says the two things a person needs: the headline they came
 * for, and that nothing else happened. A tool run in CI prints into a log
 * nobody reads until something breaks, so the line that matters is the verdict.
 */
export function renderJsonNotice({ path: target, bytes }, result = {}) {
  const score = result.score ?? {};
  return [
    `phyllum assess — read-only, written to ${target}`,
    '',
    `  Drift score ${score.score ?? '?'}, verdict ${score.verdict ?? 'unknown'} — ${score.errors ?? 0} error${score.errors === 1 ? '' : 's'}, ${score.warnings ?? 0} warning${score.warnings === 1 ? '' : 's'}.`,
    `  ${bytes} bytes of assessment, schema version ${SCHEMA_VERSION}. The same codebase writes the same file, so two runs diff cleanly.`,
    '  No review, nothing accepted, nothing else written — `--json` is a read and one file.',
  ];
}

/**
 * What the terminal says when the one file `--json` writes could not be written.
 *
 * The bar the v0.2.0 sweep set is that a raw errno never reaches a user, and a
 * failed write here was breaking it in two ways at once. `error.message` from
 * `fs` is a sentence about a syscall — `EISDIR: illegal operation on a
 * directory, rename '…'` — and the path it names is not the path the user
 * typed but the temp file beside it, an internal detail of the atomic write
 * that nobody outside this codebase should ever see.
 *
 * So the failure is translated: the target is the one the user typed, the errno
 * appears as a code in parentheses rather than as prose, and the two failures
 * worth diagnosing by name — a directory sitting where the file should go, and
 * a directory nobody may write into — say what to do instead of what happened.
 * A refusal from the permission model already explains itself and is passed
 * through unchanged.
 */
export function renderJsonWriteFailure(target, error) {
  const code = error?.code ?? null;
  const why =
    error?.name === 'PermissionError'
      ? error.message
      : code === 'EISDIR' || code === 'EPERM'
        ? `There is already a directory at ${target}, so no file can be written there.`
        : code === 'EACCES'
          ? `This user cannot write to ${target} (EACCES).`
          : code === 'ENOSPC'
            ? 'There is no space left on the device (ENOSPC).'
            : `${target} could not be written (${code ?? 'unknown reason'}).`;
  return (
    `Phyllum could not write the assessment to ${target}.\n` +
    `  ${why}\n` +
    '  Nothing was written — not a partial file, and not somewhere else instead. ' +
    '`--json` writes one file or none.\n'
  );
}

/**
 * Why `--json` and `update` cannot be the same run.
 *
 * Not a technical limitation, and the message says so. `update` exists to
 * accept suggestions on your behalf and edit `DESIGN-SYSTEM.md`; `--json` exists
 * to report without touching anything. Running both would either write the
 * design system during a run whose whole promise is that it does not, or
 * quietly ignore half the command line. Refusing is the only answer that does
 * not surprise somebody.
 */
export function renderJsonUpdateRefusal() {
  return (
    '`assess update` and `--json` ask for opposite things.\n' +
    '  `update` accepts the proposed tokens for you and edits DESIGN-SYSTEM.md.\n' +
    '  `--json` reports the assessment to a file and writes nothing else.\n' +
    'Run them separately: `phyllum assess --json` for the report, then `phyllum assess update` when you want the tokens written.\n'
  );
}
