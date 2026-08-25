/**
 * Assertions for the reference tree's shape (v0.4.1 plan §3, §6).
 *
 * v0.4.1 turned every protocol's reference from one flat file into a **folder**
 * of per-topic files, so a session can load the slice of contract the moment
 * needs instead of seven hundred lines. That is a pure re-shelving: the same
 * contracts, on new shelves. Which means the risks it carries are all
 * *bookkeeping* risks, and this file is the bookkeeping.
 *
 * Four promises, each one a way the re-shelving could have gone wrong quietly:
 *
 *   1. **Every marker-named table resolves at its new path, and nowhere else.**
 *      The markers (`phyllum:swatches`, `phyllum:cards`, `phyllum:passes`, …)
 *      are how the CLI, the skill and this suite all name one table. A marker
 *      that survived the split in two files would be read from one of them and
 *      edited in the other.
 *   2. **No two markers share a name across the whole tree.** The reader takes
 *      the first table after a marker in a folder read whole, so a duplicated
 *      name is not a duplicate — it is a silent winner.
 *   3. **The installed skill copy equals the source tree, folders included.**
 *      `init` installs the tree and `upgrade` re-syncs it; a copier that walked
 *      only the top level would install SKILL.md and one flat file and leave
 *      every protocol's contract behind.
 *   4. **Every cross-reference inside the refs points at a file that exists.**
 *      A "see the create reference, § revisions" link was live before the split and
 *      dead after it, unless every one of them was re-pointed by hand.
 *
 * Plus the layout itself: a folder per protocol, `nomenclature.md` still flat
 * because it is a shared library loaded whole, and no split file small enough
 * to be below the loading unit it was split to serve.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { REFS_DIR, markerIndex, readRef, refFiles } from '../../lib/refs.js';
import { skillFiles } from '../../lib/template.js';
import { PACKAGE_ROOT } from './helpers.js';

/**
 * Every name that owns a reference folder.
 *
 * All but two are protocols — one command, one folder, one frame file named
 * after it. `build` (v0.10.0 phase 1) and `refine` (v0.11.0 phase 6) are the
 * exceptions and are listed anyway: both are *stage* folders rather than a
 * command's. Build homes five commands and so has no command folder to live
 * in; Refine's `refine` is one command with seven modes, and its folder carries
 * the stage protocol beside a file per mode. Each obeys every rule in this file
 * regardless — the frame file named after the folder, the line floor, unique
 * markers, live cross-references — which is the reason both are checked here
 * rather than exempted.
 */
const PROTOCOLS = [
  'apply',
  'assess',
  'build',
  'create',
  'delete',
  'gui',
  'init',
  'refine',
  'system',
  'tokenise',
  'update',
  'upgrade',
  'version',
];

/**
 * Reference folders that exist but do not own a frame file yet.
 *
 * Empty today, and that is the point of keeping it. `refine` was the one entry
 * it ever held: v0.11.0 wrote the Refine protocol in phase 1, before the gate
 * that runs it, so for five phases the folder carried `protocol-refine.md` and
 * no `refine.md`. Phase 6 landed the frame file with the full gate, and `refine`
 * moved into `PROTOCOLS` above.
 *
 * The list is an enumeration, not an exemption, and it stays here for the next
 * stage folder written ahead of its command. Every tree-wide rule in this file
 * — the line floor, unique markers, live cross-references, the install walk —
 * already covers a pending folder, because those sweep `everyRefFile()` rather
 * than `PROTOCOLS`. What the list buys is that a folder cannot appear in the
 * tree unnoticed: the layout test below demands that every directory under
 * `refs/` is on one of the two lists, and the routing test demands that
 * `SKILL.md` points at it either way.
 */
const PENDING = [];

/**
 * The references that are not folders, by design (v0.4.1 §8).
 *
 * A flat file is a **shared library** rather than a protocol: it belongs to no
 * command, it is loaded whole, and splitting it would hand a reader half a
 * contract. `nomenclature.md` is one because a name is built from four slots in
 * one order. `typography.md` (v0.7.3 phase 1) is the second: the twenty-one
 * readings, their kinds and their CSS are one table read by `tokenise`, the
 * generator, `assess`, `apply` and the GUI alike.
 */
const FLAT = ['nomenclature.md', 'typography.md'];

/** Every `.md` under `skill/refs/`, as paths relative to `refs/`. */
function everyRefFile() {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.name.endsWith('.md')) out.push(rel);
    }
  };
  walk(REFS_DIR, '');
  return out;
}

// ---------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------

test('every protocol is a folder, and the folder carries the file named after it', () => {
  for (const protocol of PROTOCOLS) {
    const dir = path.join(REFS_DIR, protocol);
    assert.ok(fs.statSync(dir).isDirectory(), `refs/${protocol}/ is not a folder`);
    const files = refFiles(protocol).map((file) => path.basename(file));
    assert.ok(
      files.includes(`${protocol}.md`),
      `refs/${protocol}/ has no ${protocol}.md — the frame file is the entry point`,
    );
  }
});

test('every folder under refs/ is enumerated — as a protocol, or as a pending one', () => {
  const dirs = fs
    .readdirSync(REFS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(
    dirs,
    [...PROTOCOLS, ...PENDING].sort(),
    'a reference folder exists that neither PROTOCOLS nor PENDING names',
  );
});

test('a pending folder carries a protocol file, and no frame file pretending to be one', () => {
  for (const pending of PENDING) {
    const files = refFiles(pending).map((file) => path.basename(file));
    assert.ok(
      files.includes(`protocol-${pending}.md`),
      `refs/${pending}/ has no protocol-${pending}.md — a pending folder holds its stage protocol`,
    );
    assert.ok(
      !files.includes(`${pending}.md`),
      `refs/${pending}/${pending}.md exists — move ${pending} from PENDING into PROTOCOLS`,
    );
  }
});

test('nothing is left flat except the shared library', () => {
  const top = fs
    .readdirSync(REFS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  assert.deepEqual(top.sort(), [...FLAT].sort(), 'a protocol reference is a folder, not a file');
});

test('nomenclature stays whole — it is a library, not a protocol', () => {
  // Splitting it is explicitly out of scope (v0.4.1 §8): a name is built from
  // four slots in one order, and a reader consulting it needs all four.
  const text = fs.readFileSync(path.join(REFS_DIR, 'nomenclature.md'), 'utf8');
  for (const marker of ['phyllum:name-slots', 'phyllum:neutral-ramp', 'phyllum:ramp-scale']) {
    assert.ok(text.includes(marker), `nomenclature.md lost its ${marker} table`);
  }
});

test('no split file is smaller than the loading unit it was split to serve', () => {
  // The split rule (§3.1): one file per section a command can need *alone*, and
  // no file under ~40 lines. A 12-line file is not a smaller load, it is one
  // more thing to find.
  const FLOOR = 40;
  for (const rel of everyRefFile()) {
    const lines = fs.readFileSync(path.join(REFS_DIR, rel), 'utf8').split('\n').length;
    assert.ok(lines >= FLOOR, `refs/${rel} is ${lines} lines — below the ${FLOOR}-line floor`);
  }
});

// ---------------------------------------------------------------------------
// The markers
// ---------------------------------------------------------------------------

test('no two markers share a name across the whole tree', () => {
  // `markerIndex` refuses a repeat rather than recording one, so building it is
  // the assertion; the count is here so a marker that vanishes is noticed too.
  const index = markerIndex();
  assert.ok(index.size > 50, `only ${index.size} markers found — the tree lost tables`);

  const seen = new Map();
  for (const rel of everyRefFile()) {
    const text = fs.readFileSync(path.join(REFS_DIR, rel), 'utf8');
    for (const match of text.matchAll(/<!--\s*(phyllum:[\w-]+)\s*-->/g)) {
      const where = seen.get(match[1]);
      assert.equal(where, undefined, `${match[1]} is marked in both refs/${where} and refs/${rel}`);
      seen.set(match[1], rel);
    }
  }
  assert.equal(seen.size, index.size, 'the index and the tree disagree about how many markers exist');
});

test('every marker resolves at its own path, and nowhere else', () => {
  const index = markerIndex();
  for (const [marker, where] of index) {
    const file = path.join(PACKAGE_ROOT, 'skill', where);
    assert.ok(fs.existsSync(file), `${marker} claims ${where}, which does not exist`);
    assert.ok(
      fs.readFileSync(file, 'utf8').includes(`<!-- ${marker} -->`),
      `${marker} is not actually in ${where}`,
    );
    for (const rel of everyRefFile()) {
      if (`refs/${rel}` === where) continue;
      const text = fs.readFileSync(path.join(REFS_DIR, rel), 'utf8');
      assert.ok(
        !text.includes(`<!-- ${marker} -->`),
        `${marker} is marked in refs/${rel} as well as ${where}`,
      );
    }
  }
});

test('a folder read whole still yields every table its protocol owns', () => {
  // The CLI is not lazy and never was: it parses a protocol's tables on the
  // first call. Reading the folder as one text has to be exactly as good as
  // reading the old flat file was.
  const index = markerIndex();
  for (const protocol of PROTOCOLS) {
    const text = readRef(protocol);
    for (const [marker, where] of index) {
      if (!where.startsWith(`refs/${protocol}/`)) continue;
      assert.ok(text.includes(`<!-- ${marker} -->`), `readRef('${protocol}') lost ${marker}`);
    }
  }
});

// ---------------------------------------------------------------------------
// The cross-references
// ---------------------------------------------------------------------------

test('every cross-reference inside the refs points at a file that exists', () => {
  const pattern = /refs\/[\w-]+(?:\/[\w.-]+)?\.md/g;
  let checked = 0;
  for (const rel of everyRefFile()) {
    const text = fs.readFileSync(path.join(REFS_DIR, rel), 'utf8');
    for (const match of text.matchAll(pattern)) {
      const target = path.join(PACKAGE_ROOT, 'skill', match[0]);
      assert.ok(
        fs.existsSync(target),
        `refs/${rel} points at ${match[0]}, which no longer exists`,
      );
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'the refs cross-reference each other; finding none means the sweep broke');
});

test('SKILL.md routes every command at a reference that exists', () => {
  const skill = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'SKILL.md'), 'utf8');
  for (const match of skill.matchAll(/`(refs\/[\w-]+(?:\/[\w.-]+\.md)?\/?)`/g)) {
    const target = path.join(PACKAGE_ROOT, 'skill', match[1]);
    assert.ok(fs.existsSync(target), `SKILL.md names ${match[1]}, which does not exist`);
  }
  // And the table says which file to load, per protocol — the lazy-loading
  // payoff is the index, not the folder.
  for (const protocol of [...PROTOCOLS, ...PENDING]) {
    assert.ok(skill.includes(`refs/${protocol}/`), `SKILL.md does not route ${protocol}`);
  }
});

// ---------------------------------------------------------------------------
// The install
// ---------------------------------------------------------------------------

test('the skill file list is the whole tree, folders included', () => {
  const files = skillFiles();
  assert.ok(files.includes('SKILL.md'));
  for (const rel of everyRefFile()) {
    assert.ok(files.includes(`refs/${rel}`), `skillFiles() misses refs/${rel}`);
  }
  const nested = files.filter((rel) => rel.split('/').length > 2);
  assert.ok(nested.length > 30, `only ${nested.length} nested files — the walk is not recursive`);
});
