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
  appliesToFor,
  colourProperties,
  ladderFor,
  roleForProperty,
  sources,
  spec,
  tailwindPrefixes,
  threshold,
  typographyProperties,
} from './tokenise-spec.js';

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

/** Every sighting in one block of declarations. */
function sightingsInBlock(pairs, file) {
  const out = [];
  const colourProps = new Set(colourProperties());
  const typeProps = new Set(typographyProperties());
  const type = { size: null, weight: null, lineHeight: null };

  for (const { property, value } of pairs) {
    if (colourProps.has(property)) {
      COLOUR_PATTERN.lastIndex = 0;
      for (const found of value.match(COLOUR_PATTERN) ?? []) {
        out.push({ pass: 'colours', property, value: found, file });
      }
    }

    const role = roleForProperty(property);
    if (role) {
      for (const found of value.match(LENGTH_PATTERN) ?? []) {
        out.push({ pass: 'numbers', role, property, value: found, file });
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
 */
export function scanCodebase(root, { maxFiles = 400, maxDepth = 8 } = {}) {
  const { extensions, skipped, stylesheets } = sources();
  const skip = new Set(skipped);
  const styleExtensions = new Set(stylesheets);
  const found = new Map();
  let budget = maxFiles;

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
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!extensions.includes(extension)) continue;
      if (budget-- <= 0) return;

      let text;
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const rel = path.relative(root, full).split(path.sep).join('/');
      const markup = !styleExtensions.has(extension);
      for (const block of ruleBlocks(text, { markup })) {
        for (const sighting of sightingsInBlock(block, rel)) record(sighting);
      }
      if (markup) {
        for (const sighting of sightingsInBlock(tailwindDeclarations(text), rel)) record(sighting);
      }
    }
  };

  walk(path.resolve(root), 0);

  return [...found.values()].sort(
    (a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)),
  );
}

// ---------------------------------------------------------------------------
// Clustering — near-identical values become one proposal
// ---------------------------------------------------------------------------

const near = (a, b, limit) => Math.abs(a - b) <= limit;

/** Do these two sightings look like the same intent? */
export function sameIntent(a, b) {
  if (a.pass !== b.pass) return false;
  if (a.pass === 'colours') return deltaE(a.value, b.value) <= threshold('colours');
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

const SECTION_OF = { colours: 'colours', numbers: 'numbers', typography: 'typography' };

/** Is any member of this cluster already named in its token section? */
export function clusterIsKnown(cluster, known) {
  const section = known[SECTION_OF[cluster.pass]];
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
export function ladderNames(role, count) {
  const { rungs, centre } = ladderFor(role);
  if (rungs.length === 0) return Array.from({ length: count }, (_, i) => `${role}-${i + 1}`);
  const prefix = rungs[0].split('-')[0];
  if (count > rungs.length) {
    return Array.from({ length: count }, (_, i) =>
      i < rungs.length ? rungs[i] : `${prefix}-${i + 1}`,
    );
  }
  const start = Math.min(Math.max(centre - Math.floor(count / 2), 0), rungs.length - count);
  return rungs.slice(start, start + count);
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
  if (proposal.pass === 'numbers') return [proposal.name, proposal.value, proposal.appliesTo];
  return [proposal.name, proposal.size, proposal.weight, proposal.lineHeight];
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

  // Numbers are named per role, as a ladder over the role's own clusters.
  const ladderNameFor = new Map();
  const roleOrder = [...new Set(clusters.filter((c) => c.pass === 'numbers').map((c) => c.role))];
  for (const role of roleOrder) {
    const inRole = clusters
      .filter((cluster) => cluster.pass === 'numbers' && cluster.role === role)
      .sort((a, b) => (toPx(a.representative.value) ?? 0) - (toPx(b.representative.value) ?? 0));
    const names = ladderNames(role, inRole.length);
    inRole.forEach((cluster, index) => ladderNameFor.set(cluster, names[index]));
  }

  let chromatic = 0;
  const proposals = [];
  for (const cluster of clusters) {
    let name;
    if (cluster.pass === 'colours') {
      if (!isRoleColour(cluster.representative.value)) chromatic += 1;
      name = nameColour(cluster.representative.value, chromatic);
    } else if (cluster.pass === 'numbers') {
      name = ladderNameFor.get(cluster);
    } else {
      name = typographyName(cluster);
    }

    const rep = cluster.representative;
    proposals.push({
      pass: cluster.pass,
      section: SECTION_OF[cluster.pass],
      role: cluster.role,
      name: uniqueName(name, taken),
      suggestedName: name,
      value: displayValue(cluster),
      size: rep.size ?? null,
      weight: rep.weight ?? null,
      lineHeight: rep.lineHeight ?? null,
      appliesTo: cluster.role ? appliesToFor(cluster.role) : '',
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
