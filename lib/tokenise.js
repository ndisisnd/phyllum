/**
 * `tokenise` — the engine (plan §4).
 *
 * Three deterministic stages, in this order and never any other:
 *
 *   1. **Scan.** A read-only sweep of the codebase. This module opens files for
 *      reading and does nothing else — there is no write call anywhere in it,
 *      which is what makes "the scan never writes" a property of the code
 *      rather than a promise in a document.
 *   2. **Cluster, then name.** Near-identical values are grouped first, so the
 *      user is asked about one blue rather than two. Only then does a cluster
 *      get a proposed name, from the scales in `skill/refs/tokenise.md`.
 *   3. **Diff.** Anything the system already names is dropped silently, so a
 *      second run proposes nothing and a changed codebase proposes only what
 *      changed.
 *
 * Everything here is tokens in, values out: no printing, no prompting, no
 * writing. The review loop lives in `tokenise-command.js` and the one write
 * path is still `write.js`.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  appliesToForCluster,
  compoundFor,
  compoundPassFor,
  isCompoundPass,
  colourProperties,
  ladderFor,
  ladderForCluster,
  roleForProperty,
  sectionFor,
  sources,
  spec,
  tailwindPrefixes,
  threshold,
  typographyProperties,
} from './tokenise-spec.js';
import { MAX_SOURCE_BYTES, dataBlocks, gitignoreMatcher, isDataFile, readTextFile } from './scan-text.js';

// ---------------------------------------------------------------------------
// Value shapes
// ---------------------------------------------------------------------------

const COLOUR_PATTERN = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;
const LENGTH_PATTERN = /-?\d*\.?\d+(?:px|rem)\b/g;
const NUMBER_ONLY = /^-?\d*\.?\d+$/;

export const isColourValue = (value) => {
  COLOUR_PATTERN.lastIndex = 0;
  const match = COLOUR_PATTERN.exec(String(value).trim());
  return Boolean(match && match[0] === String(value).trim());
};

/**
 * Fresh copies of the two value shapes, for readers that scan something other
 * than a declaration — prose, for instance. A global regex carries state, so a
 * shared instance cannot be handed out; the *shape* is still defined once here.
 */
export const colourPattern = () => new RegExp(COLOUR_PATTERN.source, 'g');
export const lengthPattern = () => new RegExp(LENGTH_PATTERN.source, 'g');

/** Case-folded, whitespace-stripped, `#abc` expanded to `#aabbcc`. */
export function normaliseValue(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const short = raw.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return raw;
}

/** A length in px, for comparison only — the value is recorded as written. */
export function toPx(value) {
  const match = String(value).trim().match(/^(-?\d*\.?\d+)(px|rem)$/i);
  if (!match) return null;
  return match[2].toLowerCase() === 'rem' ? Number(match[1]) * 16 : Number(match[1]);
}

// ---------------------------------------------------------------------------
// Colour maths — sRGB to Lab, and CIE76 ΔE
// ---------------------------------------------------------------------------

/** {r,g,b} in 0–255, or null when the value is not a colour Phyllum reads. */
export function toRgb(value) {
  const raw = String(value).trim().toLowerCase();
  const hex = raw.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const digits = hex[1];
    const expand = (text) =>
      text.length <= 4
        ? text.split('').map((character) => Number.parseInt(character + character, 16))
        : text.match(/../g).map((pair) => Number.parseInt(pair, 16));
    const [r, g, b] = expand(digits);
    return { r, g, b };
  }
  const rgb = raw.match(/^rgba?\(([^)]*)\)$/);
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
    return { r: parts[0], g: parts[1], b: parts[2] };
  }
  const hsl = raw.match(/^hsla?\(([^)]*)\)$/);
  if (hsl) {
    const parts = hsl[1].split(/[,/\s]+/).filter(Boolean);
    const h = Number.parseFloat(parts[0]);
    const s = Number.parseFloat(parts[1]) / 100;
    const l = Number.parseFloat(parts[2]) / 100;
    if (![h, s, l].every(Number.isFinite)) return null;
    return hslToRgb(h, s, l);
  }
  return null;
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** HSL, as the colour naming table reads it: hue 0–360, the rest 0–100. */
export function toHsl(value) {
  const rgb = toRgb(value);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (((h * 60) % 360) + 360) % 360, s: s * 100, l: l * 100 };
}

function toLab(value) {
  const rgb = toRgb(value);
  if (!rgb) return null;
  const linear = (channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(rgb.r);
  const g = linear(rgb.g);
  const b = linear(rgb.b);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return { l: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

/** CIE76 ΔE between two colours; Infinity when either cannot be read. */
export function deltaE(a, b) {
  const one = toLab(a);
  const two = toLab(b);
  if (!one || !two) return Infinity;
  return Math.sqrt((one.l - two.l) ** 2 + (one.a - two.a) ** 2 + (one.b - two.b) ** 2);
}

// ---------------------------------------------------------------------------
// Compound values — a shadow or a border read as one thing (v0.2.1 plan §3.1)
// ---------------------------------------------------------------------------
//
// `0 2px 8px rgba(0,0,0,0.1)` is not three lengths and a colour; it is one
// shadow, and the parts mean nothing apart. So the scalar path cannot read it —
// `toPx` has nothing to take apart — and until v0.2.1 a shadow fell into the
// "seen, not read" bucket. These functions are the whole difference: take a
// compound apart into the parts a comparison needs, and put it back together in
// one spelling so two writings of the same shadow are one value.
//
// The grammar is in `refs/assess.md`, and the rule that keeps it honest is: a
// value Phyllum cannot read *whole* is not half-read. It goes back to the fourth
// bucket, where a question is asked about it instead.

/** A function call that is not a colour — `var(…)`, `calc(…)`, `url(…)`. */
const OPAQUE_CALL = /^(?!rgba?\(|hsla?\()[a-z-]+\(/i;

/** A part that is nothing but a word: `solid`, `inset`, `none`. */
const KEYWORD = /^[a-z-]+$/i;

/** Split on a separator that is not inside brackets, and drop the empties. */
function splitTop(text, isSeparator) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const character of String(text)) {
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && isSeparator(character)) {
      out.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  out.push(current);
  return out.map((part) => part.trim()).filter((part) => part !== '');
}

/** A length as the compound records it: `0px` and `0` are the same zero. */
function compoundLength(part) {
  const match = String(part).match(/^[+-]?(\d*\.?\d+)(px|rem|em|%|vh|vw)?$/i);
  if (!match) return null;
  return Number(match[1]) === 0 ? '0' : String(part).replace(/^\+/, '').toLowerCase();
}

/** A compound part in px. A bare `0` is zero; `toPx` answers for the rest. */
const compoundPx = (part) => (Number(part) === 0 ? 0 : toPx(part));

/**
 * One compound taken apart: layers, and each layer's keywords, lengths and
 * colour. Null when there is any part Phyllum cannot name, because a compound
 * read in part is worse than one left as a question.
 */
export function parseCompound(value) {
  const layers = [];
  for (const text of splitTop(value, (character) => character === ',')) {
    const layer = { keywords: [], lengths: [], colour: null, parts: [] };
    for (const part of splitTop(text, (character) => /\s/.test(character))) {
      if (OPAQUE_CALL.test(part)) return null;

      const length = compoundLength(part);
      if (length !== null) {
        layer.lengths.push(length);
        layer.parts.push(length);
        continue;
      }
      if (isColourValue(part)) {
        // Two colours in one shadow is not a shadow Phyllum understands.
        if (layer.colour !== null) return null;
        layer.colour = normaliseValue(part);
        layer.parts.push(layer.colour);
        continue;
      }
      if (!KEYWORD.test(part)) return null;
      layer.keywords.push(part.toLowerCase());
      layer.parts.push(part.toLowerCase());
    }
    // `border: none` is a decision to have no border, not a value worth naming.
    if (layer.lengths.length === 0 && layer.colour === null) return null;
    layers.push(layer);
  }
  return layers.length > 0 ? layers : null;
}

/** The compound written once: same parts, same order, one space between them. */
export function normaliseCompound(value) {
  const layers = parseCompound(value);
  if (!layers) return null;
  return layers.map((layer) => layer.parts.join(' ')).join(', ');
}

/**
 * The value this declaration contributes to a compound pass, or null.
 *
 * The shorthand keywords are the trigger, and they are also the guard against
 * counting one fact twice: `border: 1px solid #E5E7EB` is a border because it
 * carries a style keyword, while `border-width: 1px` carries none and stays the
 * scalar `border` role it has always been. A pass that lists no keywords —
 * shadows — reads every declaration on its properties.
 */
export function compoundValue(pass, value) {
  const row = compoundFor(pass);
  if (!row) return null;
  const layers = parseCompound(value);
  if (!layers) return null;
  if (row.keywords.length > 0) {
    const triggered = layers.some((layer) =>
      layer.keywords.some((keyword) => row.keywords.includes(keyword)),
    );
    if (!triggered) return null;
  }
  return layers.map((layer) => layer.parts.join(' ')).join(', ');
}

/** How big a compound is, for laying it on a ladder: the sum of its lengths. */
export function compoundMagnitude(value) {
  let total = 0;
  for (const layer of parseCompound(value) ?? []) {
    for (const length of layer.lengths) total += Math.abs(compoundPx(length) ?? 0);
  }
  return total;
}

// ---------------------------------------------------------------------------
// The scan — read-only, and the only place this module touches the filesystem
// ---------------------------------------------------------------------------

const CAMEL = /[A-Z]/g;
const kebab = (key) => key.replace(CAMEL, (letter) => `-${letter.toLowerCase()}`);

/** Split a declaration list — "padding: 12px; color: red" — into pairs. */
function declarations(body) {
  const out = [];
  for (const chunk of body.split(';')) {
    const at = chunk.indexOf(':');
    if (at === -1) continue;
    const property = chunk.slice(0, at).trim().toLowerCase();
    const value = chunk.slice(at + 1).trim();
    if (property === '' || value === '') continue;
    out.push({ property, value });
  }
  return out;
}

const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

/** Rule blocks in a stylesheet, plus inline style attributes in markup. */
export function ruleBlocks(text, { markup = false } = {}) {
  const blocks = [];
  if (!markup) {
    const pattern = /\{([^{}]*)\}/g;
    let match = pattern.exec(text);
    while (match !== null) {
      const found = declarations(match[1]);
      if (found.length > 0) blocks.push(found);
      match = pattern.exec(text);
    }
    return blocks;
  }

  // A `<style>` block inside markup is a stylesheet that happens to live in a
  // component file — which is where a `.vue`, `.svelte` or `.astro` file keeps
  // most of its styling, so not reading it would make the values pass
  // language-agnostic in name only.
  STYLE_ELEMENT.lastIndex = 0;
  let embedded = STYLE_ELEMENT.exec(text);
  while (embedded !== null) {
    blocks.push(...ruleBlocks(embedded[1]));
    embedded = STYLE_ELEMENT.exec(text);
  }

  const attribute = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/g;
  let match = attribute.exec(text);
  while (match !== null) {
    const found = declarations(match[1] ?? match[2] ?? '');
    if (found.length > 0) blocks.push(found);
    match = attribute.exec(text);
  }

  // The JSX object spelling: style={{ backgroundColor: '#2563EB', padding: 12 }}
  const object = /style\s*=\s*\{\{([^}]*)\}\}/g;
  match = object.exec(text);
  while (match !== null) {
    const found = [];
    for (const pair of match[1].split(',')) {
      const at = pair.indexOf(':');
      if (at === -1) continue;
      const property = kebab(pair.slice(0, at).trim().replace(/['"]/g, '')).toLowerCase();
      const value = pair.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
      if (property && value) found.push({ property, value });
    }
    if (found.length > 0) blocks.push(found);
    match = object.exec(text);
  }

  return blocks;
}

/** Tailwind arbitrary values — `bg-[#2563EB]` — as property/value pairs. */
export function tailwindDeclarations(text) {
  const map = tailwindPrefixes();
  const out = [];
  const pattern = /(?:^|[\s"'`:])(-?[a-z]+)-\[([^\]\s]+)\]/g;
  let match = pattern.exec(text);
  while (match !== null) {
    const candidates = map[match[1].replace(/^-/, '')];
    const value = match[2].replace(/_/g, ' ');
    if (candidates && candidates.length > 0) {
      const property =
        candidates.length === 1
          ? candidates[0]
          : (isColourValue(value) ? candidates.find((name) => /colou?r|fill|stroke/.test(name))
            : candidates.find((name) => !/colou?r|fill|stroke/.test(name))) ?? candidates[0];
      out.push({ property, value });
    }
    match = pattern.exec(text);
  }
  return out;
}

/**
 * Every sighting in one block of declarations.
 *
 * `unknown`, when given, is where the leftovers go: a value that is plainly a
 * colour or a length, written against a property no table gives a meaning to.
 * Those used to be dropped in silence. They are not proposals — without a role
 * `12px` could be a corner or a padding, and Phyllum does not guess — so they
 * are collected separately and asked about rather than named (plan §5.1 step 4).
 */
function sightingsInBlock(pairs, file, unknown = null) {
  const out = [];
  const colourProps = new Set(colourProperties());
  const typeProps = new Set(typographyProperties());
  const type = { size: null, weight: null, lineHeight: null };

  for (const { property, key, value } of pairs) {
    let read = false;

    if (colourProps.has(property)) {
      COLOUR_PATTERN.lastIndex = 0;
      for (const found of value.match(COLOUR_PATTERN) ?? []) {
        out.push({ pass: 'colours', property, value: found, file });
        read = true;
      }
    }

    // A shadow or a border shorthand is one value, not the lengths inside it,
    // so the compound reading goes first and the scalar one stands down when it
    // succeeds. Reading `border: 1px solid #E5E7EB` as both a border and a 1px
    // length would count one decision twice.
    const compoundPass = compoundPassFor(property);
    const compound = compoundPass ? compoundValue(compoundPass, value) : null;
    if (compound) {
      out.push({ pass: compoundPass, property, value: compound, file });
      read = true;
    }

    const role = compound ? null : roleForProperty(property);
    if (role) {
      for (const found of value.match(LENGTH_PATTERN) ?? []) {
        out.push({ pass: 'numbers', role, property, value: found, file });
        read = true;
      }
    }

    if (unknown && !read && !typeProps.has(property)) {
      const where = property ?? key ?? null;
      for (const found of value.match(COLOUR_PATTERN) ?? []) {
        unknown.push({ kind: 'colour', property: where, value: found, file });
      }
      for (const found of value.match(LENGTH_PATTERN) ?? []) {
        unknown.push({ kind: 'length', property: where, value: found, file });
      }
    }

    if (!typeProps.has(property)) continue;
    if (property === 'font-size') type.size = value;
    else if (property === 'font-weight') type.weight = value;
    else if (property === 'line-height') type.lineHeight = value;
    else if (property === 'font') {
      // `font: 700 12px/1.3 system-ui` — weight, then size and line-height.
      const shorthand = value.match(/(?:(\d{3})\s+)?(-?\d*\.?\d+(?:px|rem))(?:\s*\/\s*([^\s]+))?/i);
      if (shorthand) {
        type.weight = shorthand[1] ?? type.weight;
        type.size = shorthand[2];
        type.lineHeight = shorthand[3] ?? type.lineHeight;
      }
      for (const found of value.match(COLOUR_PATTERN) ?? []) {
        out.push({ pass: 'colours', property, value: found, file });
      }
    }
  }

  if (type.size) {
    out.push({
      pass: 'typography',
      property: 'font-size',
      file,
      value: type.size,
      size: type.size,
      weight: type.weight ?? '400',
      lineHeight: type.lineHeight ?? 'normal',
    });
  }
  return out;
}

/** The key that makes two sightings the same value. */
function sightingKey(sighting) {
  if (sighting.pass === 'typography') {
    return [
      'typography',
      normaliseValue(sighting.size),
      normaliseValue(sighting.weight),
      normaliseValue(sighting.lineHeight),
    ].join('|');
  }
  return [sighting.pass, sighting.role ?? '', normaliseValue(sighting.value)].join('|');
}

/**
 * Read the project and return every value it uses, with counts.
 *
 * Read-only: this function opens files for reading and never writes, renames,
 * or creates anything. The assertion suite diffs the whole directory around it.
 *
 * Options:
 *   text       also read every *other* text file for `property: value` pairs —
 *              `assess`'s language-agnostic values pass (v0.2.0 plan §5.1). Off
 *              by default, which is the v0.1.0 extension-gated sweep exactly.
 *   gitignore  treat what `.gitignore` ignores as not part of the codebase.
 *   stats      an object to record what was read into: `{ files, dataFiles }`.
 *   unknown    an array to collect the values whose property could not be read
 *              into — colours and lengths that are plainly design values sitting
 *              on a property no table names. Omit it and they are dropped, which
 *              is v0.1.0's behaviour exactly.
 */
export function scanCodebase(
  root,
  {
    maxFiles = 400,
    maxDepth = 8,
    text: readAnyText = false,
    gitignore = false,
    stats = null,
    unknown = null,
  } = {},
) {
  const { extensions, skipped, stylesheets } = sources();
  const skip = new Set(skipped);
  const styleExtensions = new Set(stylesheets);
  const found = new Map();
  let budget = maxFiles;
  const resolved = path.resolve(root);
  const ignored = gitignore ? gitignoreMatcher(resolved) : () => false;
  const counted = { files: 0, dataFiles: 0 };

  const record = (sighting) => {
    const key = sightingKey(sighting);
    const entry = found.get(key) ?? {
      ...sighting,
      count: 0,
      files: [],
      properties: [],
    };
    entry.count += 1;
    if (!entry.files.includes(sighting.file)) entry.files.push(sighting.file);
    if (!entry.properties.includes(sighting.property)) entry.properties.push(sighting.property);
    found.set(key, entry);
  };

  const walk = (dir, depth) => {
    if (depth > maxDepth || budget <= 0) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(resolved, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        // A dot-directory is tooling, not a codebase, and the widened sweep is
        // bounded on purpose — so it does not walk into one.
        if (readAnyText && entry.name.startsWith('.')) continue;
        if (ignored(rel)) continue;
        walk(full, depth + 1);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      const known = extensions.includes(extension);
      // Every other text file is read for `property: value` pairs — the values
      // pass is language-agnostic, so a Go or Kotlin theme file counts too.
      const asData = !known && readAnyText && isDataFile(entry.name);
      if (!known && !asData) continue;
      if (ignored(rel)) continue;
      if (budget-- <= 0) return;

      // A file Phyllum came here to read gets the looser cap, not no cap at all:
      // an uncapped read makes a scan's memory a property of the user's repository
      // rather than of Phyllum (v0.2.0 M8).
      const text = known ? readTextFile(full, { maxBytes: MAX_SOURCE_BYTES }) : readTextFile(full);
      if (text === null) continue;
      counted.files += 1;
      if (asData) counted.dataFiles += 1;

      if (asData) {
        for (const block of dataBlocks(text, { unresolved: Boolean(unknown) })) {
          for (const sighting of sightingsInBlock(block, rel, unknown)) record(sighting);
        }
        continue;
      }

      const markup = !styleExtensions.has(extension);
      for (const block of ruleBlocks(text, { markup })) {
        for (const sighting of sightingsInBlock(block, rel, unknown)) record(sighting);
      }
      if (markup) {
        for (const sighting of sightingsInBlock(tailwindDeclarations(text), rel)) record(sighting);
      }
    }
  };

  walk(resolved, 0);
  if (stats) Object.assign(stats, counted);

  return [...found.values()].sort(
    (a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)),
  );
}

// ---------------------------------------------------------------------------
// Clustering — near-identical values become one proposal
// ---------------------------------------------------------------------------

const near = (a, b, limit) => Math.abs(a - b) <= limit;

/**
 * Which rows of the clustering table a compound pass is measured by.
 *
 * The thresholds themselves are data, in `refs/assess.md`; this is only the
 * mapping from a pass to the two rows that describe it, which has to be written
 * down somewhere and belongs next to the comparison that uses it.
 */
const COMPOUND_THRESHOLDS = {
  shadows: { length: 'shadow length', colour: 'shadow colour' },
  borders: { length: 'border width', colour: 'border colour' },
};

/** Do two layers describe the same shadow, or the same border? */
function sameLayer(a, b, limits) {
  if (a.keywords.join(' ') !== b.keywords.join(' ')) return false;
  if (a.lengths.length !== b.lengths.length) return false;
  for (const [index, length] of a.lengths.entries()) {
    const one = compoundPx(length);
    const two = compoundPx(b.lengths[index]);
    // A unit Phyllum cannot convert is compared as written rather than guessed
    // at: `2em` and `2rem` are not the same length just because they read alike.
    if (one === null || two === null) {
      if (length !== b.lengths[index]) return false;
    } else if (!near(one, two, limits.length)) {
      return false;
    }
  }
  if ((a.colour === null) !== (b.colour === null)) return false;
  return a.colour === null || deltaE(a.colour, b.colour) <= limits.colour;
}

/**
 * Two compounds are the same intent when every part of them is — the same
 * shape, then each length and each colour within the thresholds the scalar
 * passes already use. Shape first, because `0 2px 8px` and `0 2px 8px 1px` are
 * different shadows however close their numbers, and merging them would be
 * proposing a shadow nobody wrote.
 */
function sameCompound(pass, a, b) {
  const rows = COMPOUND_THRESHOLDS[pass];
  if (!rows) return normaliseValue(a) === normaliseValue(b);
  const one = parseCompound(a);
  const two = parseCompound(b);
  if (!one || !two || one.length !== two.length) return false;
  const limits = { length: threshold(rows.length), colour: threshold(rows.colour) };
  return one.every((layer, index) => sameLayer(layer, two[index], limits));
}

/** Do these two sightings look like the same intent? */
export function sameIntent(a, b) {
  if (a.pass !== b.pass) return false;
  if (a.pass === 'colours') return deltaE(a.value, b.value) <= threshold('colours');
  if (isCompoundPass(a.pass)) return sameCompound(a.pass, a.value, b.value);
  if (a.pass === 'numbers') {
    if (a.role !== b.role) return false;
    const one = toPx(a.value);
    const two = toPx(b.value);
    if (one === null || two === null) return normaliseValue(a.value) === normaliseValue(b.value);
    return near(one, two, threshold('numbers'));
  }
  if (normaliseValue(a.weight) !== normaliseValue(b.weight)) return false;
  const sizeOne = toPx(a.size);
  const sizeTwo = toPx(b.size);
  if (sizeOne === null || sizeTwo === null) {
    if (normaliseValue(a.size) !== normaliseValue(b.size)) return false;
  } else if (!near(sizeOne, sizeTwo, threshold('typography size'))) {
    return false;
  }
  const lhOne = Number.parseFloat(a.lineHeight);
  const lhTwo = Number.parseFloat(b.lineHeight);
  if (!Number.isFinite(lhOne) || !Number.isFinite(lhTwo)) {
    return normaliseValue(a.lineHeight) === normaliseValue(b.lineHeight);
  }
  return near(lhOne, lhTwo, threshold('typography line-height'));
}

/**
 * Group sightings into clusters. The most-used member represents the cluster —
 * never an average, so Phyllum only ever proposes a value the code actually has.
 */
export function clusterSightings(sightings) {
  const clusters = [];
  const ordered = [...sightings].sort(
    (a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)),
  );
  for (const sighting of ordered) {
    const home = clusters.find(
      (cluster) => cluster.pass === sighting.pass && sameIntent(cluster.representative, sighting),
    );
    if (home) {
      home.members.push(sighting);
      home.count += sighting.count;
      for (const file of sighting.files) if (!home.files.includes(file)) home.files.push(file);
      continue;
    }
    clusters.push({
      pass: sighting.pass,
      role: sighting.role ?? null,
      representative: sighting,
      members: [sighting],
      count: sighting.count,
      files: [...sighting.files],
    });
  }
  // Frequency-ranked review: most-used first, ties broken by the value.
  return clusters.sort(
    (a, b) =>
      b.count - a.count ||
      String(a.representative.value).localeCompare(String(b.representative.value)),
  );
}

// ---------------------------------------------------------------------------
// The rerun diff — what the system already names is not proposed again
// ---------------------------------------------------------------------------

/** Every value the model already names, per token section. */
export function knownValues(model) {
  const known = { colours: new Set(), numbers: new Set(), typography: new Set() };
  for (const row of model?.tokens?.colours ?? []) known.colours.add(normaliseValue(row[1]));
  for (const row of model?.tokens?.numbers ?? []) known.numbers.add(normaliseValue(row[1]));
  for (const row of model?.tokens?.typography ?? []) {
    known.typography.add(
      [normaliseValue(row[1]), normaliseValue(row[2]), normaliseValue(row[3])].join('|'),
    );
    known.typography.add(normaliseValue(row[1]));
  }
  return known;
}

/**
 * The token section a pass writes into.
 *
 * Read from the spec rather than hard-coded, because the two compound passes
 * both write into Numbers: a shadow and a border width are lengths with a job,
 * and inventing a fourth section to hold them would change the shape of every
 * `DESIGN-SYSTEM.md` without changing anything the file says.
 */
const sectionOf = (pass) => sectionFor(pass);

/** Is any member of this cluster already named in its token section? */
export function clusterIsKnown(cluster, known) {
  const section = known[sectionOf(cluster.pass)];
  if (!section) return false;
  return cluster.members.some((member) => {
    if (cluster.pass !== 'typography') return section.has(normaliseValue(member.value));
    const triple = [
      normaliseValue(member.size),
      normaliseValue(member.weight),
      normaliseValue(member.lineHeight),
    ].join('|');
    return section.has(triple) || section.has(normaliseValue(member.size));
  });
}

// ---------------------------------------------------------------------------
// Naming — the scales in refs/tokenise.md, applied
// ---------------------------------------------------------------------------

/**
 * The name one colour value gets, given how many chromatic colours came before
 * it. Role rows first (a near-white is a surface, never a "primary"), then the
 * ranked rows. Value in, name out — no cluster required, so a prose-named
 * colour and a scanned one come out of the same table.
 */
export function nameColour(value, chromaticRank = 1) {
  const hsl = toHsl(value) ?? { l: 50, s: 50 };
  for (const row of spec().colourNames) {
    if (row.rank !== null) continue;
    if (row.lightness && !row.lightness.test(hsl.l)) continue;
    if (row.saturation && !row.saturation.test(hsl.s)) continue;
    return row.name;
  }
  const ranked = spec().colourNames.filter((row) => row.rank !== null);
  const exact = ranked.find((row) => row.rank === chromaticRank && !row.name.includes('{'));
  if (exact) return exact.name;
  const overflow = ranked.find((row) => row.name.includes('{'));
  return overflow ? overflow.name.replace('{n}', String(chromaticRank)) : `color-${chromaticRank}`;
}

/**
 * Lay the clusters of one role onto its ladder, smallest first, so the middle
 * one lands on the ladder's centre rung: one radius is `rounded-md`.
 */
function namesOnLadder({ rungs, centre }, count, fallback) {
  if (rungs.length === 0) return Array.from({ length: count }, (_, i) => `${fallback}-${i + 1}`);
  const prefix = rungs[0].split('-')[0];
  if (count > rungs.length) {
    return Array.from({ length: count }, (_, i) =>
      i < rungs.length ? rungs[i] : `${prefix}-${i + 1}`,
    );
  }
  const start = Math.min(Math.max(centre - Math.floor(count / 2), 0), rungs.length - count);
  return rungs.slice(start, start + count);
}

export function ladderNames(role, count) {
  return namesOnLadder(ladderFor(role), count, role);
}

/**
 * The same laying-out, for a cluster rather than a role — a scalar length is
 * named on its role's ladder and a compound on its pass's, because a compound
 * has no role: the whole value is the fact.
 */
export function ladderNamesForCluster(cluster, count) {
  return namesOnLadder(ladderForCluster(cluster), count, cluster.role ?? cluster.pass);
}

/** Where a cluster sits on its ladder: px for a length, total size for a compound. */
function ladderSize(cluster) {
  const { value } = cluster.representative;
  return isCompoundPass(cluster.pass) ? compoundMagnitude(value) : (toPx(value) ?? 0);
}

/** Is this colour one the naming table gives a role to, rather than a rank? */
export function isRoleColour(value) {
  const hsl = toHsl(value) ?? { l: 50, s: 50 };
  return spec().colourNames.some(
    (row) =>
      row.rank === null &&
      (!row.lightness || row.lightness.test(hsl.l)) &&
      (!row.saturation || row.saturation.test(hsl.s)),
  );
}

/**
 * Role plus size band: `12px / 700` is `highlight-small`. The line-height is
 * part of the reading but not part of the name, so it is not read here.
 */
export function nameTypography({ size, weight } = {}) {
  const numericWeight = Number.parseFloat(weight);
  const numericSize = toPx(size) ?? Number.parseFloat(size);
  const role =
    spec().typeRoles.find((row) => !row.weight || row.weight.test(numericWeight))?.role ?? 'body';
  const band = spec().typeBands.find((row) => !row.size || row.size.test(numericSize));
  return `${role}${band ? band.suffix : ''}`;
}

const typographyName = (cluster) => nameTypography(cluster.representative);

/** A name nobody is using yet: `color-primary`, then `color-primary-2`. */
export function uniqueName(name, taken) {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${name}-${suffix}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

/** The display form of a cluster's value. */
export function displayValue(cluster) {
  const rep = cluster.representative;
  if (cluster.pass !== 'typography') return rep.value;
  return `${rep.size} / ${rep.weight} / ${rep.lineHeight}`;
}

/** The row this proposal would add to its token table. */
export function rowFor(proposal) {
  if (proposal.pass === 'colours') return [proposal.name, proposal.value, proposal.notes];
  if (proposal.pass === 'typography') {
    return [proposal.name, proposal.size, proposal.weight, proposal.lineHeight];
  }
  // Numbers, shadows and borders all write the same three columns, because they
  // all write into the Numbers table: the name, the value, and what it applies to.
  return [proposal.name, proposal.value, proposal.appliesTo];
}

function notesFor(cluster) {
  const sightings = `used ${cluster.count}×`;
  const merged = cluster.members
    .slice(1)
    .map((member) => (cluster.pass === 'typography' ? member.size : member.value));
  return merged.length === 0 ? sightings : `${sightings}; merged ${merged.join(', ')}`;
}

/**
 * Turn a scan into the proposals a user is asked about.
 *
 * Cluster, drop everything the system already names, then name what is left.
 * The order is the review order: most-used first.
 */
export function proposeTokens(sightings, model) {
  const known = knownValues(model);
  const taken = new Set();
  for (const key of ['colours', 'numbers', 'typography']) {
    for (const row of model?.tokens?.[key] ?? []) if (row[0]) taken.add(row[0]);
  }

  const clusters = clusterSightings(sightings).filter((cluster) => !clusterIsKnown(cluster, known));

  // Everything named on a ladder, grouped by the ladder it is laid on: a length
  // by its role, a compound by its pass. Each group is sorted smallest first, so
  // the middle one lands on the ladder's centre rung.
  const ladderNameFor = new Map();
  const groups = new Map();
  for (const cluster of clusters) {
    if (cluster.pass === 'colours' || cluster.pass === 'typography') continue;
    const key = isCompoundPass(cluster.pass) ? cluster.pass : `numbers/${cluster.role}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cluster);
  }
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => ladderSize(a) - ladderSize(b));
    const names = ladderNamesForCluster(ordered[0], ordered.length);
    ordered.forEach((cluster, index) => ladderNameFor.set(cluster, names[index]));
  }

  let chromatic = 0;
  const proposals = [];
  for (const cluster of clusters) {
    let name;
    if (cluster.pass === 'colours') {
      if (!isRoleColour(cluster.representative.value)) chromatic += 1;
      name = nameColour(cluster.representative.value, chromatic);
    } else if (cluster.pass === 'typography') {
      name = typographyName(cluster);
    } else {
      name = ladderNameFor.get(cluster);
    }

    const rep = cluster.representative;
    proposals.push({
      pass: cluster.pass,
      section: sectionOf(cluster.pass),
      role: cluster.role,
      name: uniqueName(name, taken),
      suggestedName: name,
      value: displayValue(cluster),
      size: rep.size ?? null,
      weight: rep.weight ?? null,
      lineHeight: rep.lineHeight ?? null,
      appliesTo: appliesToForCluster(cluster),
      notes: notesFor(cluster),
      count: cluster.count,
      files: cluster.files,
      properties: [...new Set(cluster.members.flatMap((member) => member.properties))],
      members: cluster.members.map((member) => ({
        value: cluster.pass === 'typography' ? `${member.size} / ${member.weight} / ${member.lineHeight}` : member.value,
        raw: cluster.pass === 'typography' ? member.size : member.value,
        count: member.count,
      })),
      merged: cluster.members.length > 1,
    });
  }
  return proposals;
}

/** Scan and propose in one call — the shape the command and the evals use. */
export function tokenise(root, model, options = {}) {
  const sightings = scanCodebase(root, options);
  return { sightings, proposals: proposeTokens(sightings, model) };
}

// ---------------------------------------------------------------------------
// Acceptance — token rows, then the Backlog reconciliation
// ---------------------------------------------------------------------------

/** Every raw value an accepted proposal covers, normalised. */
export function coveredValues(proposal) {
  return proposal.members.map((member) => normaliseValue(member.raw));
}

const TYPOGRAPHY_KEYS = new Set(['font', 'font-size', 'typography']);

/**
 * May a token from this proposal stand in for this spec key? A colour is a
 * colour wherever it appears, but a number is not: `rounded-md (12px)` is a
 * corner radius, and a 12px padding is a different fact that shares a number.
 * The role table in `refs/tokenise.md` is what decides.
 */
export function ownsProperty(proposal, key) {
  if (proposal.pass === 'colours') return true;
  if (proposal.pass === 'typography') return TYPOGRAPHY_KEYS.has(key);
  // A compound owns its own pass's properties and nothing else: a shadow token
  // may fill a `box-shadow`, never a `border`, even though both are Numbers.
  if (isCompoundPass(proposal.pass)) return compoundPassFor(key) === proposal.pass;
  return roleForProperty(key) === proposal.role;
}

/**
 * Rewrite one spec block so a raw value becomes the token that now names it.
 * Only lines carrying the `# TODO: tokenise` marker are touched — a line that
 * already names a token is never rewritten — and only when the value matches
 * and the key is one this token is allowed to fill.
 */
export function retokeniseSpec(content, proposal, name) {
  const wanted = new Set(coveredValues(proposal));
  let changed = false;
  const lines = content.split('\n').map((line) => {
    const match = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.+?)\s*#\s*TODO:\s*tokenise\s*$/);
    if (!match) return line;
    if (!wanted.has(normaliseValue(match[3]))) return line;
    if (!ownsProperty(proposal, match[2])) return line;
    changed = true;
    return `${match[1]}${match[2]}: ${name}`;
  });
  return { content: lines.join('\n'), changed };
}

/** `TODO: tokenise \`12px\` (Button/Primary padding-top)`, taken apart. */
export function parseBacklogDebt(line) {
  const match = String(line).match(/^TODO: tokenise `([^`]+)`\s*\(([^\s)]+)\s+([^)]+)\)$/);
  if (!match) return null;
  const scope = match[3].trim().split(/\s+/);
  return { value: match[1], component: match[2], property: scope[scope.length - 1] };
}

/**
 * Write accepted proposals into the model: the token row into its own section,
 * then the Backlog reconciliation the plan asks for (§8.5). Mutates and returns
 * the model — the caller renders and writes it through the one funnel.
 */
export function applyAcceptance(model, accepted) {
  const written = [];
  for (const proposal of accepted) {
    if (proposal.mergedInto) continue;
    model.tokens[proposal.section] = model.tokens[proposal.section] ?? [];
    model.tokens[proposal.section].push(rowFor(proposal));
    written.push(proposal);
  }

  const reconciled = [];
  for (const proposal of accepted) {
    const name = proposal.mergedInto ?? proposal.name;
    const values = coveredValues(proposal);
    if (values.length === 0) continue;

    for (const component of model.components) {
      for (const block of component.blocks) {
        if (block.lang !== 'yaml') continue;
        const result = retokeniseSpec(block.content, proposal, name);
        if (!result.changed) continue;
        block.content = result.content;
        reconciled.push({ component: component.name, token: name });
      }
    }

    // A skipped contract slot stays in the Backlog; only the debt this token
    // actually pays off is removed.
    model.backlog = model.backlog.filter((line) => {
      const debt = parseBacklogDebt(line);
      if (!debt) return true;
      if (!values.includes(normaliseValue(debt.value))) return true;
      return !ownsProperty(proposal, debt.property);
    });
  }

  return { model, written, reconciled };
}
