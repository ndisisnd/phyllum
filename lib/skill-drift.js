/**
 * Is the skill copy in this project the one this install would write? (plan v0.5.2 §3)
 *
 * `upgrade` keeps two things on the same version: the CLI, and the copy of the
 * skill that `init` puts in `.claude/skills/phyllum/`. Nothing ever told the user
 * when those two parted company — a habitual `npm install --global phyllum@latest`
 * replaces the package and leaves the project's copy exactly where it was, so
 * Claude goes on reading last month's guidance in silence. This file is the eye
 * that notices, and it only ever *looks*: it reads bytes and returns a
 * description, the same bargain `install-method.js` strikes with `upgrade`.
 * Nothing here writes, spawns or asks the network anything — the deciding and the
 * printing belong to `version-command.js`, and the fixing belongs to `upgrade`.
 *
 * **The signal is the bytes, not a stamp** (plan §3.1). The tempting design is to
 * write `.phyllum-version` into the copy at install time and read it back later.
 * It was rejected twice over. It writes a file nobody asked for, which `init` and
 * `upgrade` both refuse to do on principle; and it reintroduces the very thing
 * `version` was built to avoid — a version string written down somewhere, free to
 * drift from the code it claims to describe. A stamp says what version was
 * *installed*. The bytes say what the file *is*.
 *
 * The comparison is `Buffer.equals`, not a digest. Two reasons, both practical:
 * it stops at the first differing byte (and before that, at a differing length),
 * so the common case of a genuinely changed file costs almost nothing; and an
 * exact comparison never has to explain what a collision would mean. Forty-six
 * files and 372 KB are read twice per call and the whole thing takes
 * milliseconds, so there is nothing a hash would buy back.
 *
 * The shape of the answer is deliberately modest about what it knows:
 *
 *   finding    'in-step' · 'differs' · 'none'
 *   total      how many files this install enumerates — always, even for 'none'
 *   differing  missing + changed + extra, the only number the check can prove
 *   missing    enumerated here, absent from the copy
 *   changed    present in both, bytes differ — or the file could not be read
 *   extra      present in the copy, not enumerated here
 *
 * "Differs" is never called "out of date". Phyllum cannot tell a stale copy from
 * one somebody edited on purpose, and saying "out of date" about a person's own
 * edit would be a lie told confidently. An extra file counts as a difference all
 * the same (plan §3.2 decision): a ref file left behind by an older version is
 * read by Claude as current guidance, which is the precise failure this release
 * exists to surface.
 *
 * **This function never throws.** Not for a missing directory, not for a file
 * that turned into a directory, not for one the operating system refuses to hand
 * over. `version` always exits 0, and a user with an unreadable file has not done
 * anything wrong — an unreadable file is simply reported as `changed`, because
 * "not what this install would write" is the honest reading of a file Phyllum
 * cannot see.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { SKILL_DIR, skillFiles } from './template.js';
import { SKILL_INSTALL_DIR } from './write.js';

/** The three things the skill-copy check can conclude. */
export const FINDINGS = ['in-step', 'differs', 'none'];

/** A posix-style relative path resolved against a directory. */
function under(dir, rel) {
  return path.join(dir, ...rel.split('/'));
}

/** The file's bytes, or null when it cannot be read for any reason at all. */
function readBytes(file) {
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

/** Does anything at all sit at this path? A broken symlink counts as nothing. */
function exists(target) {
  try {
    return fs.statSync(target, { throwIfNoEntry: false }) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Every file inside the installed copy, as posix-style relative paths.
 *
 * Directory entries are descended into; everything else — regular files, and
 * symlinks, which `readdir` reports as their own kind rather than as directories
 * — is listed as a file. That last detail is what keeps a symlinked loop from
 * walking forever, and it is also the right answer: a symlink in the copy is a
 * thing this install did not put there.
 */
function walkCopy(dir) {
  const found = [];
  const walk = (current, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return; // unreadable, or not a directory after all: nothing to enumerate
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(current, entry.name), rel);
      else found.push(rel);
    }
  };
  walk(dir, '');
  return found;
}

/**
 * Compare the skill copy in `root` against the skill inside this package.
 *
 * `root` is the project you are standing in and nowhere else, mirroring
 * `upgrade`, which re-syncs the project you are standing in (plan §3.3). A global
 * install serving five projects still has five copies; this answers for one.
 */
export function inspectSkillCopy(root = process.cwd()) {
  // The enumeration is this install's own tree. It is read defensively for the
  // same reason everything else here is: a package whose skill/ directory has
  // been damaged should still let `version` print a row, not raise.
  let files;
  try {
    files = skillFiles();
  } catch {
    files = [];
  }

  const dir = path.resolve(root, ...SKILL_INSTALL_DIR.split('/'));
  const answer = {
    finding: 'none',
    dir: SKILL_INSTALL_DIR,
    total: files.length,
    differing: 0,
    missing: [],
    changed: [],
    extra: [],
  };

  // Nothing here at all. Not a failure and not a difference — a project Phyllum
  // has never been set up in, which `version` says out loud so the output keeps
  // the same three rows everywhere (plan §9 decision 3).
  if (!exists(dir)) return answer;

  for (const rel of files) {
    const installed = under(dir, rel);
    if (!exists(installed)) {
      answer.missing.push(rel);
      continue;
    }
    const theirs = readBytes(installed);
    const ours = readBytes(under(SKILL_DIR, rel));
    // A file this install cannot read on either side is `changed`: what it holds
    // is unknown, and unknown is not the same as matching.
    if (theirs === null || ours === null || !theirs.equals(ours)) answer.changed.push(rel);
  }

  const enumerated = new Set(files);
  for (const rel of walkCopy(dir)) if (!enumerated.has(rel)) answer.extra.push(rel);

  answer.missing.sort();
  answer.changed.sort();
  answer.extra.sort();
  answer.differing = answer.missing.length + answer.changed.length + answer.extra.length;
  answer.finding = answer.differing === 0 ? 'in-step' : 'differs';
  return answer;
}
