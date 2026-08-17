/**
 * Similarity — what is nearly the same as what (v0.2.1 plan §4).
 *
 * Every other check `assess` runs reads one thing at a time. The value rules
 * read one value and ask how often it is written; the hygiene checks read one
 * project and ask what collides. Neither can answer the question a designer
 * asks first on opening an unfamiliar codebase: **is this the same component
 * twice?** That question is about two things at once, and it needs a comparison
 * rather than a count.
 *
 * Three readings, one shape:
 *
 *   1. **Component clones** — two repeated markup signatures whose element and
 *      class words largely overlap. `.card.shadow` and `.card.shadow-sm` are one
 *      component that drifted, and counting each of them separately — which is
 *      all v0.2.0 could do — reports the symptom and hides the cause.
 *   2. **Style duplicates** — two *named* style blocks declaring materially the
 *      same `property: value` set. A `.card` and a `.panel` with the same
 *      padding, radius and shadow are one rule written twice, and the fact that
 *      they have different names is exactly why nobody noticed.
 *   3. **Utility overlaps** — one long class bundle repeated across elements
 *      that no component was ever extracted from. The Tailwind case, and the
 *      one finding here that is a nudge rather than a defect.
 *
 * Everything is **scored**, and every score is a number in [0, 1] computed from
 * structure alone: set overlap and tag comparison, no model call, no judgement
 * that could come out differently on a second run. That is not a performance
 * choice — a similarity report is only usable if "0.82" means the same thing in
 * every codebase and on every rerun, and a number a model produced cannot
 * promise that. The weights that make up a score, the bands that grade it and
 * the caps that bound it are all rows in `refs/assess/`, so tuning any of them
 * is an edit to a table rather than to this file.
 *
 * Two honesty rules run through all of it. A score is **reported, never
 * applied**: a clone comes with a merge suggestion naming the more-used
 * signature as the survivor, and that suggestion lands in the same
 * `DESIGN-SYSTEM.md` review loop every other suggestion lands in — nothing here
 * renames a class or rewrites a component, because changing code is `apply`'s
 * PRD-gated work. And the comparison is **bounded and says so**: comparing
 * everything to everything else is quadratic, so the pass compares the
 * most-used signatures and the first blocks it read, up to the caps in the
 * limits table, and hands those caps to the report rather than truncating in
 * silence.
 *
 * Like every module on the scan path, this one reads and never writes.
 */

import fs from 'node:fs';
import path from 'node:path';

import { isRegistered, registeredNames, scanMarkup, wordsIn } from './candidates.js';
import {
  MAX_SOURCE_BYTES,
  dataBlocks,
  gitignoreMatcher,
  isDataFile,
  readTextFile,
} from './scan-text.js';
import {
  bandFor,
  bandGraded,
  similarityLimit,
  similaritySeverityFor,
  similarityWeight,
  sources,
} from './tokenise-spec.js';
import { normaliseValue } from './tokenise.js';

/** Scores are rounded so two runs cannot disagree in the sixteenth decimal. */
const round = (score) => Math.round(score * 1000) / 1000;

/**
 * How much two sets have in common, as a fraction of everything in either.
 *
 * Jaccard rather than a count of shared members, because a count rewards size:
 * a nine-class element sharing three classes with a three-class one is not
 * "three classes similar", it is mostly different.
 */
export function jaccard(a, b) {
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** The caps this pass ran under, as the report states them. */
export function similarityCaps() {
  return {
    signatures: similarityLimit('signatures'),
    blocks: similarityLimit('blocks'),
    pairs: similarityLimit('pairs'),
    bundleClasses: similarityLimit('bundle classes'),
    bundleUses: similarityLimit('bundle uses'),
  };
}

/** One finding, in the vocabulary the value and hygiene findings already use. */
function finding(rule, score, value, detail, evidence = []) {
  return {
    rule,
    severity: similaritySeverityFor(rule, score),
    // Only a family the table grades by band carries one. A repeated utility
    // bundle scores 1 against itself by construction, and calling that a clone
    // would be a number pretending to have decided something.
    band: bandGraded(rule) ? (bandFor(score)?.band ?? null) : null,
    score,
    value,
    detail,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Component clones
// ---------------------------------------------------------------------------

/** `btn--primary card` -> { btn, primary, card } — spelling forgiven once. */
export const classWords = (classes) => new Set(classes.flatMap((name) => wordsIn(name)));

/**
 * Is this signature worth comparing at all?
 *
 * A bare `div` with no classes has nothing to be similar *with* — comparing it
 * to a bare `span` would score two unrelated elements against each other and
 * call the result evidence. A signature earns a comparison by carrying at least
 * one class word, or by being a named component, which is a claim about what
 * the element is.
 */
const isComparable = (signature) =>
  classWords(signature.classes).size > 0 || /^[A-Z]/.test(signature.element);

/**
 * How alike are two signatures, in one number?
 *
 * Class words carry most of the weight because they carry most of the meaning:
 * `btn--primary` and `PrimaryBtn` are one pattern spelled twice, and comparing
 * the spellings rather than the words would say they have nothing in common.
 * The element is a bonus and not a gate — two different tags carrying the same
 * classes are still worth reporting, just more quietly, which is what a
 * class-only score being capped below the clone band does to them.
 */
export function signatureScore(a, b) {
  const classes = jaccard(classWords(a.classes), classWords(b.classes));
  // An exact tag match short-circuits to 1 so the common case never depends on
  // how a tag name happens to split into words; anything else is compared by
  // words, so `Card` and `PrimaryCard` read as near rather than as unrelated.
  const element =
    String(a.element).toLowerCase() === String(b.element).toLowerCase()
      ? 1
      : jaccard(new Set(wordsIn(a.element)), new Set(wordsIn(b.element)));
  return round(
    similarityWeight('class words') * classes + similarityWeight('element') * element,
  );
}

/** The one to keep: whichever is written more, and the name itself on a tie. */
function survivorOf(a, b) {
  if (a.count !== b.count) return a.count > b.count ? a : b;
  return a.signature.localeCompare(b.signature) <= 0 ? a : b;
}

const where = (signature) =>
  `${signature.signature} used ${signature.count}× (${signature.files[0] ?? 'unknown'}${signature.files.length > 1 ? ` +${signature.files.length - 1} more` : ''})`;

/**
 * Every pair of signatures alike enough to be worth saying out loud.
 *
 * The list is sorted before it is capped, and it arrives sorted by use, so the
 * cap drops the tail of a long codebase rather than an arbitrary forty patterns
 * out of the middle of it.
 */
export function componentClones(signatures) {
  const caps = similarityCaps();
  const comparable = signatures.filter(isComparable).slice(0, caps.signatures);
  const rows = [];
  let budget = caps.pairs;

  for (let i = 0; i < comparable.length && budget > 0; i += 1) {
    for (let j = i + 1; j < comparable.length && budget > 0; j += 1) {
      budget -= 1;
      const a = comparable[i];
      const b = comparable[j];
      const score = signatureScore(a, b);
      const graded = bandFor(score);
      if (!graded) continue;

      const survivor = survivorOf(a, b);
      const merged = survivor === a ? b : a;
      rows.push({
        ...finding(
          'component-clone',
          score,
          `${a.signature} ~ ${b.signature}`,
          graded.band === 'clone'
            ? `the same pattern twice — keep \`${survivor.signature}\` and fold \`${merged.signature}\` into it`
            : 'two patterns close enough that one of them is probably a variant of the other',
          [where(a), where(b)],
        ),
        pair: [a.signature, b.signature],
        // A suggestion, and only for the band that earned one. A pattern
        // similarity is a thing to look at; naming a survivor for one would be
        // proposing a merge nobody has evidence for yet.
        survivor: graded.band === 'clone' ? survivor.signature : null,
      });
    }
  }

  return {
    rows: rows.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value)),
    compared: comparable.length,
    total: signatures.filter(isComparable).length,
    capped: signatures.filter(isComparable).length > caps.signatures,
  };
}

// ---------------------------------------------------------------------------
// Utility overlaps
// ---------------------------------------------------------------------------

/**
 * Class bundles long enough and repeated enough to be a component nobody
 * extracted.
 *
 * The score is 1 by construction — the bundle is identical to itself on every
 * element it appears on, which is the whole finding. It is still a `warn`,
 * because a repeated utility bundle is a component waiting to be extracted
 * rather than a defect, and that is a decision about the design system.
 */
export function utilityOverlaps(signatures, model) {
  const caps = similarityCaps();
  const registered = registeredNames(model);
  const rows = [];

  for (const signature of signatures) {
    if (signature.classes.length < caps.bundleClasses) continue;
    if (signature.count < caps.bundleUses) continue;
    if (isRegistered(signature, registered)) continue;
    rows.push({
      ...finding(
        'utility-overlap',
        1,
        signature.classes.join(' '),
        `written on ${signature.count} elements as \`${signature.element}\` and never extracted into a component`,
        [where(signature)],
      ),
      signature: signature.signature,
      element: signature.element,
      classes: [...signature.classes],
      count: signature.count,
    });
  }

  return rows.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// ---------------------------------------------------------------------------
// Style duplicates
// ---------------------------------------------------------------------------

/** The innermost brace-bounded blocks, with whatever text opened them. */
const BLOCK = /([^{}]*)\{([^{}]*)\}/g;

/** `const Card = styled.div` … ` — the CSS-in-JS spelling of a rule block. */
const STYLED = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*styled(?:\.[A-Za-z][\w]*|\([^)]*\))\s*`([\s\S]*?)`/g;

const kebab = (name) =>
  String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();

/**
 * What opened this block, as a name a report can print.
 *
 * The last line before the brace, because that is the selector in a stylesheet
 * and the assignment in a script. A grouped selector written across several
 * lines is named by its last one, which is a small loss and the alternative is
 * a parser — this pass reports *that* two blocks are the same, and the file and
 * line are in the evidence beside the name.
 */
export function blockName(prefix) {
  const line = String(prefix)
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();
  if (!line) return '';
  return line
    .replace(/[=:(,]\s*$/, '')
    .replace(/^(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+/, '')
    .replace(/["'`]/g, '')
    .trim();
}

/**
 * A block's declarations as a comparable fingerprint.
 *
 * Two rules are read as one fact per declaration, normalised the same way the
 * values pass normalises anything: `#FFF` and `#fff` are one value, and a
 * property spelled `borderRadius` in a style object is the `border-radius` a
 * stylesheet writes.
 *
 * The `null` return is the honesty rule that keeps this pass from reading files
 * it does not understand. A block counts only when it holds at least two
 * declarations **and** at least one property the property tables recognise —
 * without that, a configuration object of two strings would be a style
 * duplicate of another configuration object.
 */
export function fingerprint(body) {
  const pairs = dataBlocks(body, { unresolved: true }).flat();
  const out = new Set();
  let recognised = 0;
  for (const pair of pairs) {
    const value = String(pair.value ?? '').trim();
    if (value === '' || value.includes('{')) continue;
    if (pair.property) recognised += 1;
    out.add(`${pair.property ?? kebab(pair.key)}: ${normaliseValue(value)}`);
  }
  if (out.size < 2 || recognised === 0) return null;
  return out;
}

/** Every named style block in one file's text, in the order it was written. */
export function blocksIn(text, file) {
  const found = [];
  const add = (name, kind, body) => {
    const trimmed = String(name).trim();
    if (trimmed === '') return;
    const pairs = fingerprint(body);
    if (!pairs) return;
    found.push({ name: trimmed, kind, file, pairs });
  };

  STYLED.lastIndex = 0;
  let styled = STYLED.exec(text);
  while (styled !== null) {
    add(styled[1], 'styled', styled[2]);
    styled = STYLED.exec(text);
  }

  BLOCK.lastIndex = 0;
  let block = BLOCK.exec(text);
  while (block !== null) {
    add(blockName(block[1]), 'block', block[2]);
    block = BLOCK.exec(text);
  }

  return found;
}

/**
 * Every named style block in the project, up to the cap (read-only).
 *
 * A third read of the source after the values pass and the markup pass, and it
 * is a third read on purpose: neither of the other two keeps a block together
 * with the name that opened it, and the name is what makes a duplicate
 * reportable rather than merely true.
 */
export function styleBlocks(root, { maxFiles = 400, maxDepth = 8 } = {}) {
  const { extensions, skipped } = sources();
  const known = new Set(extensions);
  const skip = new Set(skipped);
  const cap = similarityCaps().blocks;
  const resolved = path.resolve(root);
  const ignored = gitignoreMatcher(resolved);
  const found = [];
  let budget = maxFiles;

  const walk = (dir, depth) => {
    if (depth > maxDepth || budget <= 0 || found.length >= cap) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (found.length >= cap) return;
      if (skip.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(resolved, full).split(path.sep).join('/');
      if (ignored(rel)) continue;
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      // The same reach the values pass has, and for the same reason: a
      // `styled.div` template lives in a `.js` file as often as in a `.jsx`
      // one, and a scan that reads styling only out of stylesheets is
      // language-agnostic in name only.
      const wanted = known.has(path.extname(entry.name).toLowerCase());
      if (!wanted && !isDataFile(entry.name)) continue;
      if (budget-- <= 0) return;
      const text = wanted
        ? readTextFile(full, { maxBytes: MAX_SOURCE_BYTES })
        : readTextFile(full);
      if (text === null) continue;
      for (const block of blocksIn(text, rel)) {
        if (found.length >= cap) return;
        found.push(block);
      }
    }
  };

  walk(resolved, 0);
  return found;
}

/** Two blocks are duplicates by how much of their declarations they share. */
export function blockScore(a, b) {
  return round(similarityWeight('declarations') * jaccard(a.pairs, b.pairs));
}

/** Named style blocks declaring materially the same thing under two names. */
export function styleDuplicates(blocks) {
  const caps = similarityCaps();
  const rows = [];
  let budget = caps.pairs;

  for (let i = 0; i < blocks.length && budget > 0; i += 1) {
    for (let j = i + 1; j < blocks.length && budget > 0; j += 1) {
      budget -= 1;
      const a = blocks[i];
      const b = blocks[j];
      // One rule read twice out of one file is a quirk of the reader, not a
      // duplicate anybody wrote.
      if (a.name === b.name && a.file === b.file) continue;
      const score = blockScore(a, b);
      const graded = bandFor(score);
      if (!graded) continue;
      rows.push({
        ...finding(
          'style-duplicate',
          score,
          `${a.name} ~ ${b.name}`,
          graded.band === 'clone'
            ? 'the same declarations under two names — one of them can be the other'
            : 'two blocks declaring materially the same thing, with some of it drifted',
          [`${a.name} (${a.file})`, `${b.name} (${b.file})`],
        ),
        pair: [a.name, b.name],
        files: [a.file, b.file],
        shared: [...a.pairs].filter((pair) => b.pairs.has(pair)).sort(),
      });
    }
  }

  return rows.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value));
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

/**
 * The similarity half of the assessment: clones, duplicates, overlaps.
 *
 * Two of the three read markup, so two of the three are React-only in v0.2.1
 * for exactly the reason the component pass is — and they say the question was
 * not asked rather than answering it as "nothing found". Style duplicates read
 * stylesheets and theme files, so they run on every stack.
 */
export function assessSimilarity(root, model, components = {}, options = {}) {
  const caps = similarityCaps();
  const markupChecked = Boolean(components.ran);
  const signatures = markupChecked ? scanMarkup(root, options) : [];
  const clones = markupChecked
    ? componentClones(signatures)
    : { rows: [], compared: 0, total: 0, capped: false };
  const overlaps = markupChecked ? utilityOverlaps(signatures, model) : [];
  const blocks = styleBlocks(root, options);
  const duplicates = styleDuplicates(blocks);

  return {
    caps,
    markupChecked,
    markupReason: markupChecked ? null : (components.reason ?? null),
    compared: {
      signatures: clones.compared,
      signaturesFound: clones.total,
      signaturesCapped: clones.capped,
      blocks: blocks.length,
      blocksCapped: blocks.length >= caps.blocks,
    },
    clones: clones.rows,
    duplicates,
    overlaps,
    findings: [...clones.rows, ...duplicates, ...overlaps],
  };
}
