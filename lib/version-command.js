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
 */

import {
  PACKAGE_NAME,
  compareVersions,
  describeReason,
  latestPublishedVersion,
} from './npm-registry.js';
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

export function renderVersion({ installed, latest, status, check }) {
  const lines = [HEADLINE[status](installed)];
  lines.push(`  installed         ${installed}`);
  lines.push(
    status === 'unknown'
      ? `  latest published  unknown — ${describeReason(check)}`
      : `  latest published  ${latest}`,
  );
  lines.push('');

  if (status === 'outdated') {
    lines.push(`Run \`phyllum update\` to move to ${latest}.`);
  } else if (status === 'ahead') {
    lines.push(
      `This build is newer than ${PACKAGE_NAME}@${latest} on npm, so there is nothing to update to.`,
    );
  } else if (status === 'unknown') {
    lines.push('Nothing is wrong with your install — the check needs the network and this run did not have it.');
    lines.push('`version` is the only command that asks the registry, so everything else works offline.');
  } else {
    lines.push('Nothing to do.');
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Run `phyllum version`.
 *
 * ctx: { fetch, timeoutMs, registryBase, skipRegistry }
 *   fetch         injected for the assertion suite; defaults to the global one
 *   skipRegistry  report the installed version without asking anyone
 *
 * Always exits 0: knowing your version is never a failure, and neither is
 * being offline while you find it out.
 */
export async function runVersion(ctx = {}) {
  const installed = packageVersion();

  if (ctx.skipRegistry) {
    return {
      out: renderVersion({ installed, latest: null, status: 'unknown', check: { reason: 'skipped' } }),
      code: 0,
      status: 'unknown',
      installed,
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
    out: renderVersion({ installed, latest, status, check }),
    code: 0,
    status,
    installed,
    latest,
    check,
  };
}
