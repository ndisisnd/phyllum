/**
 * Where the skill's reference files live, now that each protocol is a folder
 * (v0.4.1 plan §3).
 *
 * Until v0.4.1 a protocol's reference was one flat file, so a module that read a
 * contract table opened one path and every marker in it was found there. The
 * reference is a **folder** now — `refs/tokenise/passes.md`,
 * `refs/tokenise/naming.md` and the rest — so a session loads the one topic the
 * moment needs instead of seven hundred lines. Nothing about the contract
 * changed; only the shelf did.
 *
 * That leaves two jobs for one module:
 *
 *   - **Read a protocol whole.** The CLI is not lazy and never was: it parses
 *     every table a protocol owns on the first call and caches the result. So
 *     `readRef('tokenise')` returns the folder's files joined in name order, and
 *     a marker means exactly what it meant when the file was flat. Marker names
 *     are globally unique across the tree, so joining can never make one marker
 *     resolve to another file's table.
 *   - **Say which file a marker is in.** A tolerant table drops an unreadable
 *     row and names the file to fix (v0.4.0 M7). "The file" used to be the
 *     protocol's one file; now it is one of the folder's, so the notice has to
 *     resolve marker → file rather than assume it.
 */

import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_ROOT } from './template.js';

export const REFS_DIR = path.join(PACKAGE_ROOT, 'skill', 'refs');

/** The one reference that is not a folder: a shared library, loaded whole. */
export const NOMENCLATURE_REF = path.join(REFS_DIR, 'nomenclature.md');

/**
 * The one failure this module raises (v0.4.1 M3).
 *
 * The shipped reference tree is Phyllum's own, so every way of failing to read
 * it is the same failure: the installed copy is not the copy that shipped, and
 * `phyllum upgrade` puts it back. `execute.js` catches this at the dispatch
 * boundary exactly as it catches a damaged `nomenclature.md`, and for the same
 * reason — a raw `ENOENT` naming Phyllum's own install path is not an answer.
 */
export class RefsError extends Error {
  constructor(detail) {
    super(detail);
    this.name = 'RefsError';
    this.detail = detail;
  }
}

/**
 * A protocol name is a folder name, and nothing else.
 *
 * `refs/<protocol>/` composes a path, so a name carrying a separator or a dot
 * segment reads a folder that is not a reference folder at all — `../..` walked
 * out of the tree entirely. A name is refused rather than resolved, because a
 * traversal that returns files looks like a success.
 */
const SEGMENT = /^[a-z][a-z0-9-]*$/;

function folderOf(protocol) {
  const name = String(protocol ?? '');
  if (!SEGMENT.test(name)) {
    throw new RefsError(`"${name}" is not a protocol name, so there is no refs/${name}/ to read`);
  }
  return path.join(REFS_DIR, name);
}

/** Every `.md` in one protocol's folder, absolute, in name order. */
export function refFiles(protocol) {
  const dir = folderOf(protocol);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    // Whatever the errno was — gone, not a directory, not readable — the answer
    // is the same one, and it names the folder rather than the install path.
    throw new RefsError(`refs/${protocol}/ is not a reference folder this install can read`);
  }
  return entries
    .filter((name) => name.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(dir, name));
}

/** One protocol's folder, read as one text. Markers are unique, so this is safe. */
export function readRef(protocol) {
  return refFiles(protocol)
    .map((file) => {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch {
        throw new RefsError(`${displayPath(file)} is in this install but cannot be read`);
      }
    })
    .join('\n\n');
}

/** The path a reader should be shown, e.g. `refs/tokenise/passes.md`. */
const displayPath = (absolute) => `refs/${path.relative(REFS_DIR, absolute).split(path.sep).join('/')}`;

let markerCache = null;

/**
 * Marker → the file it lives in, built by reading the tree once.
 *
 * A marker in two files is a contradiction rather than a duplicate — the reader
 * would take the first and the editor would fix the second — so it is refused
 * here rather than discovered later.
 */
export function markerIndex() {
  if (markerCache) return markerCache;
  const index = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const match of text.matchAll(/<!--\s*(phyllum:[\w-]+)\s*-->/g)) {
        const name = match[1];
        const seen = index.get(name);
        if (seen && seen !== displayPath(full)) {
          throw new Error(`${name} is marked in both ${seen} and ${displayPath(full)}`);
        }
        index.set(name, displayPath(full));
      }
    }
  };
  walk(REFS_DIR);
  markerCache = index;
  return index;
}

/** Forget the index — the hostile-input sweeps rebuild it against a doctored tree. */
export function reloadMarkerIndex() {
  markerCache = null;
}

/**
 * The file a marker's table is in, as a reader-facing path.
 *
 * Falls back to the protocol folder when the marker is not on disk, which is
 * what a doctored copy in the assertion suite looks like: the table is being
 * parsed out of a string, so there is no file to name beyond the folder.
 */
export function refFileOf(marker, protocol = null) {
  const name = String(marker).replace(/<!--\s*|\s*-->/g, '').trim();
  const found = markerIndex().get(name);
  if (found) return found;
  return protocol ? `refs/${protocol}/` : 'the reference file';
}
