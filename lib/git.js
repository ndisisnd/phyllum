/**
 * Git, as `apply run` needs it (v0.2.0 plan §6.5.3, guarantees 1 and 2).
 *
 * Two of the five execution guarantees are git facts rather than Phyllum facts:
 * work happens on **its own branch**, and each phase lands as **its own commit**.
 * This module is the whole of Phyllum's relationship with git, and it is
 * deliberately small — read the state, make one branch, make one commit per
 * phase, and never anything destructive.
 *
 * What is **not** here is as important as what is: no `reset`, no `revert`, no
 * `checkout --` of a file, no `clean`, no `stash`, no force anything. The plan's
 * failure rule is stop-and-report, keep the branch (§6.5.3, decided): nothing is
 * ever rolled back, so nothing here can roll anything back. The allowlist below
 * is checked on every call, so that promise is structural rather than a habit.
 *
 * Every call goes through `lib/run-command.js`: git by resolved path, arguments
 * as an array, no shell, with a timeout.
 */

import { runCommand, splitCommand } from './run-command.js';

/** The only git subcommands Phyllum runs — read, branch, stage, commit. */
export const ALLOWED_SUBCOMMANDS = [
  'rev-parse',
  'status',
  'branch',
  'checkout',
  'switch',
  'add',
  'commit',
  'diff',
  'log',
  'symbolic-ref',
  // `config` is read-only here: the only call is `config --get user.email`, and
  // per-invocation `-c` overrides are how anything is ever set. Nothing in this
  // module writes to the user's git configuration.
  'config',
];

/** The branch every run works on. One per day; a second run that day resumes it. */
export const BRANCH_PREFIX = 'phyllum/apply-';

export function branchNameFor(today = new Date().toISOString().slice(0, 10)) {
  return `${BRANCH_PREFIX}${today}`;
}

/** Is this the name of a Phyllum work branch? The funnel asks before writing. */
export function isApplyBranch(name) {
  return typeof name === 'string' && name.startsWith(BRANCH_PREFIX);
}

export class GitUsageError extends Error {
  constructor(subcommand) {
    super(
      `Phyllum refused to run \`git ${subcommand}\`. It only ever runs ${ALLOWED_SUBCOMMANDS.join(', ')} — ` +
        'nothing that discards work, because a failed run keeps its branch rather than rolling anything back.',
    );
    this.name = 'GitUsageError';
    this.subcommand = subcommand;
  }
}

/**
 * Run one git command in `root`.
 *
 * `-c` overrides are prepended, not written to the user's config: a commit must
 * not hang waiting for a signing passphrase in a non-interactive run, and that
 * decision belongs to this one invocation rather than to the repository.
 */
export function git(root, args, options = {}) {
  const subcommand = args.find((arg) => !String(arg).startsWith('-'));
  if (!ALLOWED_SUBCOMMANDS.includes(String(subcommand))) throw new GitUsageError(String(subcommand));
  const prefix = ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];
  return runCommand('git', [...prefix, ...args], { cwd: root, timeoutMs: 120_000, ...options });
}

const firstLine = (text) => String(text).split('\n')[0].trim();

/** Is git installed at all? A missing git is a message, not a crash. */
export function gitAvailable(root) {
  return git(root, ['rev-parse', '--git-dir']).missing === false;
}

export function isRepo(root) {
  const result = git(root, ['rev-parse', '--is-inside-work-tree']);
  return result.ok && firstLine(result.stdout) === 'true';
}

/** The branch HEAD is on, or null when HEAD is detached or there are no commits. */
export function currentBranch(root) {
  const result = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!result.ok) return null;
  const name = firstLine(result.stdout);
  return name === '' ? null : name;
}

/** Does this repository have a commit yet? A branch needs somewhere to start. */
export function hasCommits(root) {
  return git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']).ok;
}

export function headSha(root) {
  const result = git(root, ['rev-parse', '--short', 'HEAD']);
  return result.ok ? firstLine(result.stdout) : null;
}

export function branchExists(root, name) {
  return git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]).ok;
}

/**
 * Every path git sees as changed — modified, staged, or untracked.
 *
 * Used twice: before the run, because a dirty tree means Phyllum's commits would
 * carry somebody else's work; and after each phase, to prove the phase touched
 * only the files its criteria named.
 */
export function changedPaths(root) {
  const result = git(root, ['status', '--porcelain', '--untracked-files=all']);
  if (!result.ok) return [];
  const out = [];
  for (const line of result.stdout.split('\n')) {
    if (line.trim() === '') continue;
    const rel = line.slice(3).trim();
    // A rename reads as "old -> new"; the new path is the one that changed.
    const arrow = rel.split(' -> ');
    out.push(arrow[arrow.length - 1].replace(/^"|"$/g, ''));
  }
  return out.sort();
}

export function isClean(root) {
  return changedPaths(root).length === 0;
}

/** Create the work branch from wherever HEAD is now, and stand on it. */
export function createBranch(root, name) {
  return git(root, ['checkout', '-b', name]);
}

/** Stand on an existing branch — the resume path onto a stopped run's branch. */
export function checkoutBranch(root, name) {
  return git(root, ['checkout', name]);
}

/**
 * Commit exactly the named files, and nothing else.
 *
 * The pathspec is repeated on both `add` and `commit` on purpose. It is what
 * makes "one phase, one commit" true even when something else in the tree has
 * changed: a stray edit an agent made outside the phase's criteria stays
 * uncommitted, and the report names it rather than the commit swallowing it.
 */
export function commitFiles(root, files, message, options = {}) {
  const paths = [...new Set(files)];
  if (paths.length === 0) return { ok: false, code: null, stdout: '', stderr: 'nothing to commit', missing: false };

  const added = git(root, ['add', '--', ...paths]);
  if (!added.ok) return added;

  const identity = [];
  if (options.identity) {
    identity.push('-c', `user.name=${options.identity.name}`, '-c', `user.email=${options.identity.email}`);
  }
  const committed = git(root, [...identity, 'commit', '--no-verify', '-m', message, '--', ...paths]);
  if (!committed.ok) return committed;
  return { ...committed, sha: headSha(root) };
}

/** Does git know who is committing? Without an identity, `commit` fails. */
export function hasIdentity(root) {
  const email = git(root, ['config', '--get', 'user.email']);
  return email.ok && firstLine(email.stdout) !== '';
}

/** Turn a detected test command into the pieces the run funnel wants. */
export const testCommandParts = splitCommand;
