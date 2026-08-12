/**
 * The language-agnostic half of `assess`'s values pass (v0.2.0 plan §5.1).
 *
 * A stylesheet is read as a stylesheet, and markup is read as markup — that much
 * `refs/assess.md`'s sources table has always covered. But raw styling does not
 * live only in `.css` and `.jsx` files: it lives in a theme file in JSON, a
 * constants file in Go, a Kotlin object of colours, a styled-components template
 * literal. The values pass is committed to being language-agnostic, so every
 * other text file is read too.
 *
 * What survives translation between languages is the **`property: value` pair**.
 * `"borderRadius": "12px"`, `border-radius: 12px;`, `borderRadius = 12.px` and
 * `border_radius: 12px` are the same fact in four syntaxes, because the property
 * name is what carries the meaning. So this module does one job: pull pairs out
 * of arbitrary text, in a shape the existing extractor already understands. The
 * property tables then decide whether a pair is a design decision at all, which
 * is why a `timeout: 30` in a config file is not mistaken for one.
 *
 * Two things are deliberately *not* done here. A bare colour or length with no
 * property attached is not a sighting — a hex code in a comment or a test string
 * is not evidence that anything is styled with it, and a number with no property
 * has no role, so `12px` could be a corner or a padding and Phyllum does not
 * guess. And nothing is written: this module reads, and contains no write call.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  colourProperties,
  roleForProperty,
  roles,
  textScan,
  typographyProperties,
} from './tokenise-spec.js';

/** Files bigger than this are skipped rather than parsed — a bounded sweep. */
export const MAX_TEXT_BYTES = 512 * 1024;

/** How much of a file is sniffed before deciding it is not text. */
const SNIFF_BYTES = 8 * 1024;

/** A NUL byte near the start is the honest, cheap definition of "not text". */
export function looksBinary(buffer) {
  const end = Math.min(buffer.length, SNIFF_BYTES);
  for (let i = 0; i < end; i += 1) if (buffer[i] === 0) return true;
  return false;
}

/**
 * Is this file one the language-agnostic sweep reads as data?
 *
 * The exclusions come from the `phyllum:text-scan` table, plus minified bundles,
 * which are machine output nobody styles anything with.
 */
export function isDataFile(name) {
  const lower = String(name).toLowerCase();
  const { skippedExtensions, skippedFiles } = textScan();
  if (skippedFiles.some((file) => file.toLowerCase() === lower)) return false;
  if (skippedExtensions.some((extension) => lower.endsWith(extension))) return false;
  if (/\.min\.[a-z0-9]+$/.test(lower)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Comments are not evidence
// ---------------------------------------------------------------------------

/**
 * Strip the comment syntaxes a `property: value` pair could hide inside. Prose
 * *about* a colour is not a use of it, and an example in a comment would be
 * counted as a real sighting otherwise.
 *
 * `//` is only a comment when it is not the `://` of a URL, and `#` is only
 * stripped at the start of a line, because `#2563EB` is a colour everywhere else.
 */
export function stripComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/^\s*(?:#|--|;)[^\n]*$/gm, '');
}

// ---------------------------------------------------------------------------
// Pairs
// ---------------------------------------------------------------------------

/** camelCase and snake_case both spell the CSS property; so does `--custom`. */
function propertyName(key) {
  return String(key)
    .trim()
    .replace(/^[-$@]+/, '')
    .replace(/_/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * The key in front of a `:` or `=`, which is the *last* identifier before it —
 * `const BorderRadius = "12px"` and `border-radius: 12px` both name the same
 * property, and only one of them has the keyword in front.
 */
const KEY_SHAPE = /([A-Za-z_$@-][A-Za-z0-9_$.-]*)["'`\s]*$/;

/** Is this a property one of the spec tables gives a meaning to? */
function isKnownProperty(property) {
  return (
    colourProperties().includes(property) ||
    roleForProperty(property) !== null ||
    typographyProperties().includes(property)
  );
}

/**
 * The spellings of a key worth trying against the property tables.
 *
 * Three kinds of difference between how a theme file writes a key and how CSS
 * does, and all three are spelling rather than meaning:
 *
 *   plural   `colors`, `colours`, `radii`, `fontSizes` are `color`, `radius`,
 *            `font-size` in a theme file's clothes
 *   qualified `cardRadius` and `primaryColor` are a radius and a colour with the
 *            project's own word attached — the property is still in there
 *   spelling `colour` is `color`
 *
 * Trying the variants is what lets one set of tables read every language. The
 * whole key is always tried first, so an exact property never loses to a guess.
 */
function spellings(name) {
  const out = [];
  const push = (value) => {
    if (value && value !== '' && !out.includes(value)) out.push(value);
  };
  const forms = (base) => {
    push(base);
    if (base.endsWith('ii')) push(base.replace(/ii$/, 'ius'));
    if (base.endsWith('s')) push(base.slice(0, -1));
    push(base.replace(/colours?/g, 'color'));
    if (base.endsWith('s')) push(base.slice(0, -1).replace(/colours?/g, 'color'));
  };

  forms(name);
  // Then the qualified spellings: drop the project's own words off either end,
  // longest remaining phrase first, so `card-radius` finds `radius`.
  const segments = name.split('-').filter(Boolean);
  for (let size = segments.length - 1; size >= 1; size -= 1) {
    forms(segments.slice(segments.length - size).join('-'));
    forms(segments.slice(0, size).join('-'));
  }
  return out;
}

/**
 * The property a key names, or null when no table gives it a meaning.
 *
 * A key that names a *role* rather than a property — `spacing: { md: '16px' }` —
 * resolves to that role's first property, so the role table stays the one place
 * that decides what a number means.
 */
export function resolveProperty(name) {
  const tried = spellings(propertyName(name));
  const known = tried.find((spelling) => isKnownProperty(spelling));
  if (known) return known;
  for (const spelling of tried) {
    const row = roles().find((role) => role.role === spelling);
    if (row && row.properties.length > 0) return row.properties[0];
  }
  return null;
}

/**
 * Split a chunk into statements.
 *
 * A newline always ends one, because every syntax this reads writes one decision
 * per line. A `,` or `;` only ends one at parenthesis depth zero — otherwise
 * `color: rgb(37, 99, 235)` would come apart into three, which is exactly the
 * case a naive comma split gets wrong.
 */
function statements(chunk) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const character of chunk) {
    if (character === '\n') {
      out.push(current);
      current = '';
      depth = 0;
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (character === ',' || character === ';')) {
      out.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  out.push(current);
  return out;
}

/**
 * `"borderRadius": "12px"` -> `{ property: 'border-radius', value: '12px' }`.
 *
 * `context` is the key that opened the enclosing bracket, and it is the fallback
 * when the pair's own key means nothing on its own. A theme file writes
 * `colors: { brand: '#2563EB' }`: `brand` is a name the project chose, not a
 * property, and the fact that it is a colour is carried by the key above it.
 */
function pairIn(statement, context, { unresolved = false } = {}) {
  const at = statement.search(/[:=]/);
  if (at === -1) return null;
  const key = statement.slice(0, at);
  if (!KEY_SHAPE.test(key)) return null;
  const named = key.match(KEY_SHAPE)[1];
  const property = resolveProperty(named) ?? context;
  const value = statement
    .slice(at + 1)
    .trim()
    .replace(/^[:=]+\s*/, '')
    .replace(/^["'`]|["'`]$/g, '')
    .trim();
  if (value === '') return null;
  if (property) return { property, value };
  // No table gives this key a meaning. That is not the same fact as a bare
  // literal: there *is* a property here, Phyllum just cannot read it. The
  // caller decides whether that is worth surfacing (`assess`'s fourth bucket)
  // or worth dropping (every other reader).
  return unresolved ? { property: null, key: named, value } : null;
}

const TRAILING_KEY = /([A-Za-z_$@-][A-Za-z0-9_$.-]*)["'`\s]*[:=]\s*$/;

/**
 * Cut the text into bracketed chunks, remembering which key opened each one.
 *
 * Brackets are what separates one record from the next in every syntax this
 * reads, and the key in front of a bracket is what the record is *about*. Both
 * facts come out of one pass rather than two.
 */
function chunks(text) {
  const out = [];
  const stack = [];
  let current = '';
  const flush = () => {
    if (current.trim() !== '') out.push({ context: stack[stack.length - 1] ?? null, body: current });
    current = '';
  };

  for (const character of text) {
    if (character === '{' || character === '[') {
      const opener = current.match(TRAILING_KEY);
      flush();
      stack.push((opener && resolveProperty(opener[1])) ?? stack[stack.length - 1] ?? null);
      continue;
    }
    if (character === '}' || character === ']') {
      flush();
      stack.pop();
      continue;
    }
    current += character;
  }
  flush();
  return out;
}

/**
 * The `property: value` pairs in a text file, grouped into blocks.
 *
 * Grouping matters for one reason: the typography pass reads font-size, weight
 * and line-height *together*, so it needs to know which three belong to the same
 * thing. Brackets bound a record, and inside one, a blank line bounds the next
 * thing down — so those are what bound a block.
 *
 * `unresolved` keeps the pairs whose key means nothing to the property tables,
 * marked `property: null` and carrying the key as written. Off by default, so
 * every existing reader sees exactly the pairs it always saw.
 */
export function dataBlocks(text, { unresolved = false } = {}) {
  const blocks = [];
  for (const chunk of chunks(stripComments(text))) {
    for (const part of chunk.body.split(/\n[ \t]*\n/)) {
      const pairs = [];
      for (const statement of statements(part)) {
        const pair = pairIn(statement, chunk.context, { unresolved });
        if (pair) pairs.push(pair);
      }
      if (pairs.length > 0) blocks.push(pairs);
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// .gitignore — what the project itself says is not part of the codebase
// ---------------------------------------------------------------------------

function patternToRegExp(pattern) {
  const anchored = pattern.startsWith('/');
  const body = anchored ? pattern.slice(1) : pattern;
  const source = body
    .split('/')
    .map((segment) =>
      segment === '**'
        ? '.*'
        : segment
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]'),
    )
    .join('/');
  // A pattern with no slash matches at any depth; one with a slash is rooted.
  const prefix = anchored || body.includes('/') ? '^' : '^(?:.*/)?';
  return new RegExp(`${prefix}${source}(?:/.*)?$`);
}

/**
 * A matcher for the project's own `.gitignore`.
 *
 * Deliberately the common subset rather than all of git's grammar: comments,
 * blank lines, directory suffixes, anchors, `*`/`?`/`**` globs and `!` negation,
 * with the last matching rule winning. Anything it cannot read it ignores, so an
 * exotic pattern means one extra file is scanned — never a crash, and never a
 * file scanned that a simple rule clearly excluded.
 */
export function gitignoreMatcher(root) {
  const rules = [];
  const file = path.join(root, '.gitignore');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return () => false;
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const negated = line.startsWith('!');
    const pattern = (negated ? line.slice(1) : line).replace(/\/+$/, '');
    if (pattern === '') continue;
    try {
      rules.push({ negated, test: patternToRegExp(pattern) });
    } catch {
      // An unreadable pattern is not evidence; it is simply not applied.
    }
  }
  if (rules.length === 0) return () => false;

  return (relativePath) => {
    let ignored = false;
    for (const rule of rules) {
      if (rule.test.test(relativePath)) ignored = !rule.negated;
    }
    return ignored;
  };
}

/** Read a file as text, or null when it is too big, binary, or unreadable. */
export function readTextFile(absolute, { maxBytes = MAX_TEXT_BYTES } = {}) {
  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    return null;
  }
  if (stat.size > maxBytes) return null;
  let buffer;
  try {
    buffer = fs.readFileSync(absolute);
  } catch {
    return null;
  }
  if (looksBinary(buffer)) return null;
  return buffer.toString('utf8');
}
