/**
 * Shared helpers for the assertion suite.
 *
 * Every test that writes anything works in a throwaway temp directory. The
 * repository itself is never a test subject — `init` in particular must only
 * ever run inside a sandbox.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXTURES = path.join(PACKAGE_ROOT, 'evals', 'fixtures');

export const POPULATED_FIXTURE = path.join(FIXTURES, 'design-system', 'populated.md');
export const USER_EDITED_FIXTURE = path.join(FIXTURES, 'design-system', 'user-edited.md');

export function readFixture(file) {
  return fs.readFileSync(file, 'utf8');
}

/** Make a temp directory and hand it to `body`, cleaning up afterwards. */
export async function withTempDir(body) {
  // realpath so macOS's /var -> /private/var symlink cannot break path comparisons.
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'phyllum-test-'));
  try {
    return await body(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Copy a fixture codebase into a temp directory. */
export function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

/** Every file under `dir`, as sorted posix-style relative paths. */
export function snapshotPaths(dir) {
  const out = [];
  const walk = (current, prefix) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(current, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(dir, '');
  return out.sort();
}

/** Path -> contents, for proving a command wrote nothing. */
export function snapshotContents(dir) {
  const map = new Map();
  for (const rel of snapshotPaths(dir)) {
    map.set(rel, fs.readFileSync(path.join(dir, rel), 'utf8'));
  }
  return map;
}

export function diffSnapshots(before, after) {
  const added = [];
  const changed = [];
  const removed = [];
  for (const [rel, contents] of after) {
    if (!before.has(rel)) added.push(rel);
    else if (before.get(rel) !== contents) changed.push(rel);
  }
  for (const rel of before.keys()) if (!after.has(rel)) removed.push(rel);
  return { added: added.sort(), changed: changed.sort(), removed: removed.sort() };
}
