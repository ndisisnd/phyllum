/**
 * `phyllum version` (plan v0.2.0 §3).
 *
 * One question, asked plainly: which Phyllum am I running, and is it the current
 * one? Three things make the answer trustworthy.
 *
 *   The installed version is read, never written down. It comes from the
 *   package's own package.json, so it cannot drift from the code the user is
 *   actually running — there is no version string anywhere in the source.
 *
 *   The registry check happens here and nowhere else. This is the only command
 *   that touches the network (plan §3 decision), so no other command pays for
 *   it and nothing nags the user in a banner they did not ask for.
 *
 *   Being offline is an answer, not a failure. A registry that cannot be
 *   reached still leaves the installed version worth printing, so `version`
 *   reports what it knows, says what it could not check, and exits 0.
 *
 * A third row joins them in v0.7.1 (plan v0.5.2 §4, carried forward): the state
 * of the skill copy in the directory you are standing in. `upgrade` keeps the
 * CLI and that copy on the same version, and until now nothing ever told the
 * user when the two had parted company. Three properties of the older rows
 * carry over to the new one without exception.
 *
 *   The row always prints, whatever the finding — including `none in this
 *   directory`, which keeps the output the same shape everywhere and points a
 *   fresh project at `phyllum init` (plan §9 decision 3).
 *
 *   The row costs no network. It is a file comparison, so it is fully answered
 *   offline and under `--skip-registry`, where the registry rows are not.
 *
 *   The row never fails the command. `version` still exits 0 for every finding,
 *   because a user with an edited skill copy has not done anything wrong.
 *
 * The wording is deliberately modest: a neutral count, never the word "behind"
 * and never "out of date" (plan §3.2). The count is the only part the byte
 * comparison can prove; the closing line carries the recommendation.
 */

import {
  PACKAGE_NAME,
  compareVersions,
  describeReason,
  latestPublishedVersion,
} from './npm-registry.js';
import { inspectSkillCopy } from './skill-drift.js';
import { packageVersion } from './template.js';

/** The four things `version` can conclude. */
export const STATUSES = ['current', 'outdated', 'ahead', 'unknown'];

/** Which conclusion follows from the two versions. */
export function statusFor(installed, latest) {
  if (!latest) return 'unknown';
  const order = compareVersions(installed, latest);
  if (order === null) return 'unknown';
  if (order < 0) return 'outdated';
  if (order > 0) return 'ahead';
  return 'current';
}

const HEADLINE = {
  current: (installed) => `phyllum ${installed} — up to date.`,
  outdated: (installed) => `phyllum ${installed} — a newer version has been published.`,
  ahead: (installed) => `phyllum ${installed} — ahead of what is published.`,
  unknown: (installed) => `phyllum ${installed} — installed version only.`,
};

/** The skill copy has never been set up here, as far as the row is concerned. */
const NO_COPY = { finding: 'none', total: 0, differing: 0 };

/**
 * The right-hand side of the skill row, one phrasing per finding.
 *
 * `differs` reads as a count of files out of a total, and nothing more. The
 * verb is frozen plural — "1 of 46 files differ" — because it agrees with the
 * plural noun it follows, not with the count in front of it. One shape means
 * one string to read, one string to match, and no branch to get wrong.
 */
const SKILL_ROW = {
  'in-step': () => 'in step with this install',
  differs: ({ differing, total }) => `${differing} of ${total} files differ from this install`,
  none: () => 'none in this directory',
};

/** Re-syncing is worth doing on its own account, with or without a new version. */
const RESYNC = 'Run `phyllum upgrade` to re-sync the skill copy with this install.';

export function renderVersion({ installed, latest, status, check, skill = NO_COPY }) {
  const finding = SKILL_ROW[skill.finding] ? skill.finding : 'none';
  const differs = finding === 'differs';

  const lines = [HEADLINE[status](installed)];
  lines.push(`  installed         ${installed}`);
  lines.push(
    status === 'unknown'
      ? `  latest published  unknown — ${describeReason(check)}`
      : `  latest published  ${latest}`,
  );
  lines.push(`  skill copy        ${SKILL_ROW[finding](skill)}`);
  lines.push('');

  // Two rules govern the closing line (plan v0.5.2 §4). When the CLI is
  // outdated *and* the copy differs, one sentence covers both — `upgrade` does
  // the two jobs in one run, so naming it twice would misdescribe the work.
  // When the CLI is not outdated and only the copy differs, the closing line
  // names `upgrade` on its own account.
  if (status === 'outdated') {
    lines.push(
      differs
        ? `Run \`phyllum upgrade\` to move to ${latest} and re-sync the skill copy.`
        : `Run \`phyllum upgrade\` to move to ${latest}.`,
    );
  } else if (status === 'ahead') {
    lines.push(
      `This build is newer than ${PACKAGE_NAME}@${latest} on npm, so there is nothing to update to.`,
    );
    if (differs) lines.push(RESYNC);
  } else if (status === 'unknown') {
    lines.push('Nothing is wrong with your install — the check needs the network and this run did not have it.');
    lines.push('`version` is the only command that asks the registry, so everything else works offline.');
    if (differs) lines.push(RESYNC);
  } else {
    lines.push(differs ? RESYNC : 'Nothing to do.');
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Run `phyllum version`.
 *
 * ctx: { cwd, fetch, timeoutMs, registryBase, skipRegistry }
 *   cwd           the project whose skill copy is reported on; defaults to here
 *   fetch         injected for the assertion suite; defaults to the global one
 *   skipRegistry  report the installed version without asking anyone
 *
 * Always exits 0: knowing your version is never a failure, and neither is
 * being offline while you find it out.
 *
 * The skill copy is inspected before the registry is asked, and separately from
 * it. That order is the point: the row is answered even when the request is
 * skipped or fails, because it never needed the network in the first place.
 */
export async function runVersion(ctx = {}) {
  const installed = packageVersion();
  const skill = inspectSkillCopy(ctx.cwd);

  if (ctx.skipRegistry) {
    return {
      out: renderVersion({
        installed,
        latest: null,
        status: 'unknown',
        check: { reason: 'skipped' },
        skill,
      }),
      code: 0,
      status: 'unknown',
      installed,
      skill,
    };
  }

  const check = await latestPublishedVersion({
    fetchImpl: ctx.fetch,
    timeoutMs: ctx.timeoutMs,
    base: ctx.registryBase,
  });
  const latest = check.ok ? check.version : null;
  const status = statusFor(installed, latest);

  return {
    out: renderVersion({ installed, latest, status, check, skill }),
    code: 0,
    status,
    installed,
    latest,
    check,
    skill,
  };
}
