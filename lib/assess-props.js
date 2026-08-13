/**
 * Prop mismatches — one component, one contract (v0.2.1 plan §5.2).
 *
 * A component is a promise about how it is called. `Button` takes an `onClick`,
 * a `size` that is a word, and a `variant` that decides how it looks. Every
 * check `assess` ran before this one reads what a codebase *declares*; this one
 * reads what the codebase *does with what it declared* — and it is the first
 * place in the assessment where a finding means somebody's call site is wrong
 * rather than untidy.
 *
 * Three readings:
 *
 *   1. **Synonyms** — one component given two names for the same prop.
 *      `onPress` in one file and `onClick` in the next means one of those two
 *      call sites is handing a prop to a component that has never heard of it,
 *      and the handler silently never fires. That is a defect, not a style.
 *   2. **Type conflicts** — one prop given values of two different shapes.
 *      `size="lg"` beside `size={3}` means the prop cannot mean one thing, so
 *      one of the two is passing something the component will not understand.
 *   3. **Style bypasses** — an inline `style` on a component the design system
 *      already gives variants for. Not a contradiction: an escape. Somebody
 *      stepped around the system, and sometimes that is the right call, which is
 *      why this one is a warning and the other two are errors.
 *
 * **The reader is a regex attribute scan** — decided in the plan (§5.2, §12) and
 * not a compromise Phyllum hides. No JSX parser, no type inference, no module
 * resolution. That buys determinism and costs reach, and the cost is paid out
 * loud in three places:
 *
 *   - A value the scan cannot read — `{handleClick}`, a call, anything with an
 *     operator in it — is recorded as an **expression** and counted, and never
 *     used to claim a conflict. A disagreement between a string and something
 *     Phyllum did not read is a guess, not a finding.
 *   - A usage that spreads (`{...props}`) can supply any prop at all, so this
 *     pass reports only what is **present** and never what is missing. Nothing
 *     here says a component is missing a prop.
 *   - The pass is React-only in v0.2.1, exactly as the component pass is, and on
 *     any other stack the answer is that the question was not asked.
 *
 * The synonym table is deliberately short, because every pair in it is a pair
 * Phyllum will call a mistake. A word with an honest second meaning on the same
 * element — `type`, which is a variant to one library and an HTML attribute to
 * every browser — stays out of it. A synonym table that is generous is a table
 * that cries wolf, and this is the only family in the assessment allowed to say
 * `error` about somebody's markup.
 *
 * Read-only, like every module on the scan path: no write call anywhere in it.
 */

import fs from 'node:fs';
import path from 'node:path';

import { OPENING_TAG } from './candidates.js';
import { componentNameFor } from './codegen.js';
import { MAX_SOURCE_BYTES, readTextFile } from './scan-text.js';
import {
  consistencyLimit,
  propKindComparable,
  propMeaningFor,
  propSeverityFor,
  propsWatchedBy,
  sources,
} from './tokenise-spec.js';

/** The sentence every prop finding is read under, and never without. */
export const PROP_CAVEAT =
  'this is a regex attribute scan, not a parser and not a type checker — a value it cannot read is reported as unread and never counted as a conflict, and a usage that spreads props is read for what it says, never for what it leaves out';

/** A finding, in the vocabulary every other family already uses. */
function finding(rule, value, detail, evidence = []) {
  return { rule, severity: propSeverityFor(rule), value, detail, evidence };
}

// ---------------------------------------------------------------------------
// Reading one opening tag's attributes
// ---------------------------------------------------------------------------

/**
 * A brace-delimited attribute value, brace-counted rather than regex-matched.
 *
 * `style={{ background: '#2563EB' }}` nests, and a regex that stops at the
 * first `}` reads half a value and calls it whole. Counting depth and skipping
 * over quoted text is the smallest reader that gets an object right, and
 * getting an object right is the difference between reading a style bypass and
 * inventing one.
 */
export function readBraced(text, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i += 1) {
    const character = text[i];
    if (quote) {
      if (character === '\\') i += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return { value: text.slice(start, i + 1), next: i + 1 };
    }
  }
  // An unbalanced brace means the tag regex and the file disagree about where
  // this tag ends. The honest answer is to take what is there and stop.
  return { value: text.slice(start), next: text.length };
}

/**
 * What shape a written value is.
 *
 * Recognising a shape is a fact about the language, so it lives here; whether
 * two shapes may be *compared* is a decision, and that lives in the table.
 */
export function kindOf(raw) {
  if (raw === null || raw === undefined) return 'boolean';
  const value = String(raw).trim();
  if (/^["']/.test(value)) return 'string';
  if (!value.startsWith('{')) return 'string';

  const inner = value.slice(1, -1).trim();
  if (inner === '') return 'expression';
  if (inner === 'true' || inner === 'false') return 'boolean';
  if (/^-?\d+(?:\.\d+)?$/.test(inner)) return 'number';
  if (/^'[^']*'$/.test(inner) || /^"[^"]*"$/.test(inner)) return 'string';
  if (/^`[^`]*`$/.test(inner) && !inner.includes('${')) return 'string';
  if (inner.startsWith('{') && inner.endsWith('}')) return 'object';
  if (inner.startsWith('[') && inner.endsWith(']')) return 'array';
  return 'expression';
}

/** Every attribute written inside one opening tag, in the order it was written. */
export function readAttributes(text) {
  const source = String(text ?? '');
  const out = [];
  let i = 0;

  const skipSpace = () => {
    while (i < source.length && /\s/.test(source[i])) i += 1;
  };

  while (i < source.length) {
    skipSpace();
    if (i >= source.length) break;

    if (source[i] === '{') {
      const braced = readBraced(source, i);
      i = braced.next;
      // `{...props}` is the only brace that can appear where a name should be.
      if (/^\{\s*\.\.\./.test(braced.value)) out.push({ name: null, spread: true, raw: braced.value, kind: 'expression' });
      continue;
    }
    if (source[i] === '/') {
      i += 1;
      continue;
    }

    const start = i;
    while (i < source.length && /[A-Za-z0-9_:$.-]/.test(source[i])) i += 1;
    const name = source.slice(start, i);
    if (name === '') {
      i += 1;
      continue;
    }

    skipSpace();
    if (source[i] !== '=') {
      // A bare attribute is JSX's spelling of `true`.
      out.push({ name, spread: false, raw: null, kind: 'boolean' });
      continue;
    }
    i += 1;
    skipSpace();

    let raw;
    const opener = source[i];
    if (opener === '"' || opener === "'") {
      const from = i;
      i += 1;
      while (i < source.length && source[i] !== opener) i += 1;
      i += 1;
      raw = source.slice(from, i);
    } else if (opener === '{') {
      const braced = readBraced(source, i);
      raw = braced.value;
      i = braced.next;
    } else {
      const from = i;
      while (i < source.length && !/\s/.test(source[i])) i += 1;
      raw = source.slice(from, i);
    }
    out.push({ name, spread: false, raw, kind: kindOf(raw) });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Reading the project
// ---------------------------------------------------------------------------

const isComponentTag = (element) => /^[A-Z]/.test(element);

/** Every component usage in one file's text, with the attributes it was given. */
export function usagesIn(text, file) {
  const found = [];
  OPENING_TAG.lastIndex = 0;
  let match = OPENING_TAG.exec(text);
  while (match !== null) {
    // A lowercase tag is markup, not a component call: `<div style={{…}}>` is a
    // styled element and has no contract to contradict.
    if (isComponentTag(match[1])) {
      const attributes = readAttributes(match[2] ?? '');
      found.push({
        component: match[1],
        file,
        attributes: attributes.filter((attribute) => !attribute.spread),
        spreads: attributes.filter((attribute) => attribute.spread).length,
      });
    }
    match = OPENING_TAG.exec(text);
  }
  return found;
}

/**
 * Every component usage in the project, grouped by component (read-only).
 *
 * A fourth read of the source, and a fourth on purpose: the markup scan keeps
 * an element and its class list and throws the rest of the tag away, which is
 * exactly the half this question needs. Reusing it would mean widening what a
 * signature is for every caller that already depends on the narrow one.
 */
export function scanUsages(root, { maxFiles = 400, maxDepth = 8 } = {}) {
  const { extensions, stylesheets, skipped } = sources();
  const styles = new Set(stylesheets);
  const known = new Set(extensions.filter((extension) => !styles.has(extension)));
  const skip = new Set(skipped);
  const resolved = path.resolve(root);
  const components = new Map();
  let budget = maxFiles;

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
      if (!known.has(path.extname(entry.name).toLowerCase())) continue;
      if (budget-- <= 0) return;
      const text = readTextFile(full, { maxBytes: MAX_SOURCE_BYTES });
      if (text === null) continue;
      const rel = path.relative(resolved, full).split(path.sep).join('/');
      for (const usage of usagesIn(text, rel)) {
        const entry =
          components.get(usage.component) ??
          { component: usage.component, count: 0, files: [], spreads: 0, usages: [] };
        entry.count += 1;
        entry.spreads += usage.spreads;
        if (!entry.files.includes(rel)) entry.files.push(rel);
        entry.usages.push(usage);
        components.set(usage.component, entry);
      }
    }
  };

  walk(resolved, 0);
  return [...components.values()].sort(
    (a, b) => b.count - a.count || a.component.localeCompare(b.component),
  );
}

// ---------------------------------------------------------------------------
// The three readings
// ---------------------------------------------------------------------------

const example = (attribute) =>
  attribute.raw === null ? `${attribute.name}` : `${attribute.name}=${attribute.raw}`;

/** One component called with two names for one prop. */
export function synonymFindings(component) {
  const meanings = new Map();
  for (const usage of component.usages) {
    for (const attribute of usage.attributes) {
      const meaning = propMeaningFor(attribute.name);
      if (!meaning) continue;
      const seen = meanings.get(meaning) ?? new Map();
      const row = seen.get(attribute.name) ?? { name: attribute.name, count: 0, files: [] };
      row.count += 1;
      if (!row.files.includes(usage.file)) row.files.push(usage.file);
      seen.set(attribute.name, row);
      meanings.set(meaning, seen);
    }
  }

  const rows = [];
  for (const [meaning, spellings] of meanings) {
    if (spellings.size < 2) continue;
    const written = [...spellings.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    );
    rows.push({
      ...finding(
        'prop-synonym',
        `${component.component}: ${written.map((row) => row.name).join(' + ')}`,
        `two names for one prop on one component — a component has one API, so one of these call sites is handing \`${component.component}\` a prop it has never heard of`,
        written.map((row) => `${row.name} on ${row.count} usage${row.count === 1 ? '' : 's'} (${row.files.join(', ')})`),
      ),
      component: component.component,
      meaning,
      spellings: written.map((row) => row.name),
      keep: written[0].name,
    });
  }
  return rows.sort((a, b) => a.value.localeCompare(b.value));
}

/** One prop on one component given values of two different shapes. */
export function conflictFindings(component) {
  const props = new Map();
  let unread = 0;
  for (const usage of component.usages) {
    for (const attribute of usage.attributes) {
      if (!propKindComparable(attribute.kind)) {
        unread += 1;
        continue;
      }
      const kinds = props.get(attribute.name) ?? new Map();
      const row = kinds.get(attribute.kind) ?? { kind: attribute.kind, count: 0, example: example(attribute), files: [] };
      row.count += 1;
      if (!row.files.includes(usage.file)) row.files.push(usage.file);
      kinds.set(attribute.kind, row);
      props.set(attribute.name, kinds);
    }
  }

  const rows = [];
  for (const [name, kinds] of props) {
    if (kinds.size < 2) continue;
    const written = [...kinds.values()].sort(
      (a, b) => b.count - a.count || a.kind.localeCompare(b.kind),
    );
    rows.push({
      ...finding(
        'prop-type-conflict',
        `${component.component}.${name}`,
        `one prop given ${written.map((row) => `a ${row.kind}`).join(' and ')} — a prop means one thing, so one of these values is not the thing it means`,
        written.map((row) => `${row.example} in ${row.files.join(', ')}`),
      ),
      component: component.component,
      prop: name,
      kinds: written.map((row) => row.kind),
    });
  }
  return { rows: rows.sort((a, b) => a.value.localeCompare(b.value)), unread };
}

/**
 * Which registered components have variants worth using.
 *
 * A bypass is only a finding when there is something to bypass: a component the
 * system records with one variant has no alternative to offer, and telling
 * somebody to use a variant that does not exist is worse than saying nothing.
 */
export function variantsByComponent(model) {
  const bases = new Map();
  for (const component of model?.components ?? []) {
    const [base, variant = 'Default'] = String(component.name).split('/');
    const entry = bases.get(base) ?? { base, variants: new Set(), spellings: new Set() };
    entry.variants.add(variant);
    entry.spellings.add(base.toLowerCase());
    entry.spellings.add(componentNameFor(base).toLowerCase());
    entry.spellings.add(componentNameFor(component.name).toLowerCase());
    bases.set(base, entry);
  }
  return [...bases.values()].filter((entry) => entry.variants.size > 1);
}

/** A style-affecting prop on a component that already has variants. */
export function bypassFindings(component, variants) {
  const watched = new Set(propsWatchedBy('prop-style-bypass'));
  const match = variants.find((entry) => entry.spellings.has(component.component.toLowerCase()));
  if (!match) return [];

  const props = new Map();
  for (const usage of component.usages) {
    for (const attribute of usage.attributes) {
      if (!watched.has(String(attribute.name).toLowerCase())) continue;
      const row = props.get(attribute.name) ?? { name: attribute.name, count: 0, files: [], examples: [] };
      row.count += 1;
      if (!row.files.includes(usage.file)) row.files.push(usage.file);
      if (row.examples.length < 3) row.examples.push(`${example(attribute)} (${usage.file})`);
      props.set(attribute.name, row);
    }
  }

  const offered = [...match.variants].sort().join(', ');
  return [...props.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((row) => ({
      ...finding(
        'prop-style-bypass',
        `${component.component}.${row.name}`,
        `styled from the call site on a component the design system gives ${match.variants.size} variants (${offered}) — this is an escape from the system rather than a use of it`,
        row.examples,
      ),
      component: component.component,
      prop: row.name,
      base: match.base,
      variants: [...match.variants].sort(),
      count: row.count,
    }));
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

/**
 * The prop half of the consistency check: synonyms, conflicts, bypasses.
 *
 * Bounded the way M3's comparison is bounded, and for the same reason: a scan
 * that reads a big repository has to stay a scan. The components are sorted by
 * use before they are capped, so the tail is what drops, and the caps are
 * handed to the report rather than applied in silence.
 */
export function assessProps(root, model, components = {}, options = {}) {
  const caps = {
    components: consistencyLimit('components'),
    usages: consistencyLimit('usages'),
  };

  if (!components.ran) {
    return {
      caveat: PROP_CAVEAT,
      checked: false,
      reason: components.reason ?? null,
      caps,
      compared: { components: 0, componentsFound: 0, componentsCapped: false, usages: 0, spreads: 0, unread: 0 },
      synonyms: [],
      conflicts: [],
      bypasses: [],
      findings: [],
    };
  }

  const all = scanUsages(root, options);
  const compared = all.slice(0, caps.components).map((component) => ({
    ...component,
    usages: component.usages.slice(0, caps.usages),
  }));
  const variants = variantsByComponent(model);

  const synonyms = [];
  const conflicts = [];
  const bypasses = [];
  let unread = 0;
  let usages = 0;
  let spreads = 0;

  for (const component of compared) {
    usages += component.usages.length;
    spreads += component.spreads;
    synonyms.push(...synonymFindings(component));
    const conflict = conflictFindings(component);
    conflicts.push(...conflict.rows);
    unread += conflict.unread;
    bypasses.push(...bypassFindings(component, variants));
  }

  return {
    caveat: PROP_CAVEAT,
    checked: true,
    reason: null,
    caps,
    compared: {
      components: compared.length,
      componentsFound: all.length,
      componentsCapped: all.length > caps.components,
      usages,
      spreads,
      unread,
    },
    synonyms,
    conflicts,
    bypasses,
    findings: [...synonyms, ...conflicts, ...bypasses],
  };
}
