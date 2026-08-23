/**
 * The typography reading contract, read from the skill's own reference file
 * (v0.7.3 plan §"The contract", §"The file shape", phase 1).
 *
 * A typography token recorded three readings until v0.7.3 — size, weight and
 * line-height — and those three are the Typography table's own columns. v0.7.3
 * widens the token to twenty-one readings, and the eighteen new ones are
 * optional and live in a fenced YAML block beneath the table.
 *
 * `skill/refs/typography.md` is the contract and this module is its reader,
 * exactly as `lib/nomenclature.js` reads `skill/refs/nomenclature.md` and
 * `lib/tokenise-spec.js` reads `refs/tokenise/`. Editing a table there changes
 * the vocabulary and changes what the assertion suite expects, which is the
 * point — there is no second copy of these readings in the code:
 *   phyllum:type-readings   reading -> kind (bare/enum/value) and the CSS
 *                           declaration it becomes
 *   phyllum:type-conflicts  the three ways two readings collide, and the one
 *                           settled answer each collision has
 *
 * The split of labour with `lib/design-system.js` is deliberate and is what
 * keeps the import graph acyclic. `design-system.js` owns the *shape*: it
 * parses the `#### <token>` headings and their fenced blocks, preserves their
 * text byte for byte, and writes them back in the table's row order. It never
 * looks inside a block. This module owns the *meaning*: it reads the block's
 * lines against the contract table, refuses a reading the table does not hold,
 * reports every collision, and turns a set of readings into declarations.
 *
 * Nothing here is destructive. A line this module cannot read is left exactly
 * where the user wrote it and reported; a block naming a token the table does
 * not hold is preserved whole and reported. The never-invent and never-correct
 * rules are the two this reader exists to keep: an absent reading is "not
 * decided" and never a default, and a value is recorded exactly as given.
 */

import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_ROOT } from './template.js';
import { TOKEN_SECTIONS } from './design-system.js';
import { stripTicks, tableAfter as readTable } from './md-tables.js';

export const TYPOGRAPHY_FILE = path.join(PACKAGE_ROOT, 'skill', 'refs', 'typography.md');

/** The reader-facing path, which is what a notice names rather than the install path. */
export const TYPOGRAPHY_REF = 'refs/typography.md';

export const MARKERS = {
  readings: '<!-- phyllum:type-readings -->',
  conflicts: '<!-- phyllum:type-conflicts -->',
};

/** The kinds a reading can be gathered as. */
export const KINDS = ['bare', 'enum', 'value'];

/** The three ways two readings collide. */
export const CONFLICT_KINDS = ['shared', 'contradiction', 'overlap'];

/**
 * A contract table that cannot be read (the M7 rule, v0.3.0 onwards).
 *
 * The contract is *data Phyllum ships*, so a broken table is not user error in
 * the ordinary sense — it means the installed copy of the skill has been edited
 * or has gone stale against the CLI. That has one answer, and it is not a stack
 * trace: say which file is wrong, say what is wrong with it, and say that
 * `phyllum upgrade` puts a clean copy back. `execute.js` catches this at the
 * dispatch boundary exactly as it catches a damaged `nomenclature.md`, for the
 * same reason — a decision deserves a sentence.
 */
export class TypographyError extends Error {
  constructor(detail) {
    super(detail);
    this.name = 'TypographyError';
    this.detail = detail;
    this.file = TYPOGRAPHY_FILE;
  }
}

/** Every failure in this reader is the same kind of failure, so it is raised once. */
const fail = (detail) => {
  throw new TypographyError(detail);
};

const table = (text, marker) => {
  try {
    return readTable(text, marker, TYPOGRAPHY_REF);
  } catch (error) {
    // `md-tables` speaks for every reference file; here it speaks for this one.
    throw new TypographyError(error.message);
  }
};

/**
 * The three mandatory readings, taken from the Typography table's own columns.
 *
 * They are not a list of their own, because they are already declared once — as
 * the columns of the four-column table in `design-system.js`. Deriving them
 * here is what makes "size, weight and line-height stay mandatory" a fact about
 * the file shape rather than a second list that could drift from it.
 */
export const CORE_READINGS = TOKEN_SECTIONS.find((s) => s.key === 'typography').columns.slice(1);

const isCore = (reading) => CORE_READINGS.includes(reading);

/**
 * Read one `CSS declaration` cell.
 *
 * A cell is one property with zero or more alternative values, and the `/`
 * separates the alternatives. `font-size` is a property whose value comes from
 * the reading. `text-decoration-line: underline` is the whole declaration, which
 * is what a bare reading always is. `font-style: italic` / `oblique` names the
 * property once and offers two words, so the second alternative inherits the
 * property from the first.
 */
function parseDeclarationCell(cell, reading) {
  const parts = String(cell)
    .split('/')
    .map((part) => stripTicks(part))
    .filter((part) => part.length > 0);
  if (parts.length === 0) fail(`the ${reading} reading has no CSS declaration`);

  let property = null;
  const values = [];
  for (const part of parts) {
    const colon = part.indexOf(':');
    if (colon === -1) {
      if (property === null) {
        // The first alternative names the property; a cell that is only a value
        // names nothing at all.
        property = part;
        continue;
      }
      values.push(part.trim());
      continue;
    }
    const name = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (property === null) property = name;
    else if (name !== property) {
      fail(`the ${reading} reading names two properties, \`${property}\` and \`${name}\``);
    }
    if (value !== '') values.push(value);
  }
  if (!property) fail(`the ${reading} reading has no CSS property`);
  return { property, values };
}

/**
 * The tables, as data. Split out from `load` so the assertions can feed it a
 * doctored copy of the reference file rather than overwriting the one the
 * package ships.
 */
export function parseTypographyContract(text) {
  // The readings are a *list* and not a map, because their order is the
  // contract: it is the order declarations are emitted in, and it is the order
  // two merged keywords are written in.
  const readings = table(text, MARKERS.readings).map(([reading, kind, declaration]) => {
    const name = stripTicks(reading ?? '');
    const gathered = stripTicks(kind ?? '').toLowerCase();
    if (name === '') fail('a type-readings row has no reading name');
    if (!KINDS.includes(gathered)) {
      fail(`the ${name} reading is gathered as \`${gathered}\`, which is not bare, enum or value`);
    }
    const { property, values } = parseDeclarationCell(declaration ?? '', name);
    if (gathered === 'bare' && values.length !== 1) {
      fail(`the bare reading ${name} must name exactly one value, not ${values.length}`);
    }
    return { reading: name, kind: gathered, property, values, core: isCore(name) };
  });

  // A reading named twice would make a block ambiguous — the writer would fill
  // one row and the reader would consult the other. Uniqueness is a property of
  // the table, so it is checked where the table is read.
  const seen = new Set();
  for (const row of readings) {
    if (seen.has(row.reading)) fail(`\`${row.reading}\` is declared twice`);
    seen.add(row.reading);
  }

  for (const reading of CORE_READINGS) {
    if (!seen.has(reading)) {
      fail(`the mandatory reading \`${reading}\` is not in the table, so the four-column table and the contract disagree`);
    }
  }

  const conflicts = table(text, MARKERS.conflicts).map(([rule, kind, involved, declaration, outcome]) => {
    const name = stripTicks(rule ?? '');
    const gathered = stripTicks(kind ?? '').toLowerCase();
    if (name === '') fail('a type-conflicts row has no rule name');
    if (!CONFLICT_KINDS.includes(gathered)) {
      fail(`the ${name} rule is a \`${gathered}\`, which is not shared, contradiction or overlap`);
    }
    const members = String(involved ?? '')
      .split(',')
      .map((item) => stripTicks(item))
      .filter((item) => item.length > 0);
    if (members.length < 2) fail(`the ${name} rule names fewer than two readings`);
    for (const member of members) {
      if (!seen.has(member)) fail(`the ${name} rule names \`${member}\`, which is not a reading`);
    }
    return {
      rule: name,
      kind: gathered,
      readings: members,
      property: stripTicks(declaration ?? ''),
      outcome: String(outcome ?? '').trim(),
    };
  });

  return { readings, conflicts };
}

let cache = null;

function load() {
  if (cache) return cache;
  cache = parseTypographyContract(fs.readFileSync(TYPOGRAPHY_FILE, 'utf8'));
  return cache;
}

/** Re-read the tables — only the assertions, which rewrite the file, need this. */
export function reloadTypography() {
  cache = null;
  return load();
}

export const typographyContract = () => load();

/** The twenty-one readings, in the contract table's own order. */
export const readings = () => load().readings;

/** Just the reading names, in order. */
export const readingNames = () => load().readings.map((row) => row.reading);

/** The eighteen optional readings, in order — everything the table holds bar the core three. */
export const optionalReadings = () => load().readings.filter((row) => !row.core);

/** The contract row for one reading, or null. */
export const readingFor = (name) => load().readings.find((row) => row.reading === name) ?? null;

/** Is this a reading the contract knows? */
export const isReading = (name) => readingFor(name) !== null;

/** The three collision rules, in the contract table's own order. */
export const conflicts = () => load().conflicts;

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

/**
 * Turn a set of recorded readings into CSS declarations.
 *
 * One declaration per recorded reading, in the contract table's row order —
 * with one exception, and it is the first conflict rule. Two readings that
 * share a property merge into **one** declaration carrying both keywords, in
 * the order the conflict rule lists them, because two declarations of one
 * property is a silent overwrite rather than two decisions.
 *
 * `entries` is `{ reading: value }` or a list of `{ reading, value }`. A bare
 * reading's value is ignored — its declaration is fixed by the table.
 *
 * Nothing is validated here beyond "is this a reading". A value is emitted
 * exactly as it was recorded, which is the never-correct rule holding at the
 * one place it would be easiest to break.
 */
export function declarationsFor(entries) {
  const list = Array.isArray(entries)
    ? entries
    : Object.entries(entries ?? {}).map(([reading, value]) => ({ reading, value }));
  const held = new Map();
  for (const entry of list) {
    if (isReading(entry.reading)) held.set(entry.reading, entry.value);
  }

  // Which readings merge, and in what order — read from the conflict table
  // rather than from a pair of names spelled out here.
  const merges = load().conflicts.filter((rule) => rule.kind === 'shared');
  const mergedAway = new Set();
  for (const rule of merges) {
    const present = rule.readings.filter((reading) => held.has(reading));
    if (present.length < 2) continue;
    for (const reading of present.slice(1)) mergedAway.add(reading);
  }

  const out = [];
  for (const row of load().readings) {
    if (!held.has(row.reading)) continue;
    if (mergedAway.has(row.reading)) continue;

    const rule = merges.find(
      (merge) => merge.readings.includes(row.reading) && merge.readings.filter((r) => held.has(r)).length > 1,
    );
    if (rule) {
      const words = rule.readings
        .filter((reading) => held.has(reading))
        .map((reading) => readingFor(reading).values[0]);
      out.push({ property: rule.property, value: words.join(' '), readings: rule.readings.filter((r) => held.has(r)) });
      continue;
    }

    const value = row.kind === 'bare' ? row.values[0] : String(held.get(row.reading) ?? '');
    out.push({ property: row.property, value, readings: [row.reading] });
  }
  return out;
}

/** The declarations of one set of readings, as `property: value` strings. */
export const declarationTextFor = (entries) =>
  declarationsFor(entries).map((declaration) => `${declaration.property}: ${declaration.value}`);

// ---------------------------------------------------------------------------
// Reading a block
// ---------------------------------------------------------------------------

const notice = (kind, token, message) => ({ kind, token, message });

/**
 * Read one block's text into readings.
 *
 * The block is YAML by convention rather than by parser: one `reading: value`
 * per line, and everything after the colon is the value, verbatim. That is
 * deliberate. A real YAML load would unquote `"Inter", system-ui`, drop the
 * quotes a font stack needs and hand back a corrected value — and correcting a
 * value is the one thing this file may never do. Taking the rest of the line
 * as written is what makes the round trip byte-identical.
 */
export function readBlock(content, token = '') {
  const readings = {};
  const notices = [];
  const seen = new Set();

  for (const raw of String(content ?? '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:(.*)$/);
    if (!match) {
      notices.push(
        notice(
          'unreadable-line',
          token,
          `\`${trimmed}\` is not a \`reading: value\` line, so nothing was read from it. The line is left exactly as written.`,
        ),
      );
      continue;
    }

    const name = match[1];
    const value = match[2].trim();

    if (!isReading(name)) {
      notices.push(
        notice(
          'unknown-reading',
          token,
          `\`${name}\` is not one of the twenty-one readings in ${TYPOGRAPHY_REF} (${MARKERS.readings}), so it is not recorded. The line is left exactly as written.`,
        ),
      );
      continue;
    }

    if (seen.has(name)) {
      // The same answer a duplicated name gets everywhere else: the name does
      // not identify one reading, so neither reading is taken.
      delete readings[name];
      notices.push(
        notice(
          'duplicate-reading',
          token,
          `\`${name}\` is recorded twice, so the name does not identify one reading and neither was read.`,
        ),
      );
      continue;
    }
    seen.add(name);

    const row = readingFor(name);
    if (row.kind === 'bare') {
      // A bare reading carries no value, so it has exactly one spelling. A
      // block saying anything else is saying something Phyllum cannot read, and
      // an unreadable line is never resolved into a `true`.
      if (value === 'true') readings[name] = true;
      else {
        notices.push(
          notice(
            'unreadable-value',
            token,
            `\`${name}\` is a bare reading, which is written \`${name}: true\` and nothing else, so \`${value}\` was not read.`,
          ),
        );
      }
      continue;
    }

    if (value === '') {
      notices.push(
        notice(
          'unreadable-value',
          token,
          `\`${name}\` has no value, so nothing was read. An absent reading means "not decided", never a default.`,
        ),
      );
      continue;
    }
    readings[name] = value;
  }

  return { readings, notices };
}

// ---------------------------------------------------------------------------
// Reading a whole model
// ---------------------------------------------------------------------------

/**
 * Every collision one token's readings carry.
 *
 * Two of the three rules are questions rather than answers, so this returns
 * notices rather than a resolution. A `shared` rule is not a collision at all
 * by the time it gets here — `declarationsFor` merges it — so it is not
 * reported.
 */
export function conflictNotices(readings, token = '') {
  const held = new Set(Object.keys(readings ?? {}));
  const out = [];
  for (const rule of load().conflicts) {
    const present = rule.readings.filter((reading) => held.has(reading));
    if (rule.kind === 'shared') continue;
    if (rule.kind === 'contradiction' && present.length > 1) {
      out.push(
        notice(
          'conflict',
          token,
          `\`${present.join('` and `')}\` both write \`${rule.property}\`, and no value of it means both. ` +
            'Neither reading is dropped and neither wins — say which one this token means.',
        ),
      );
      continue;
    }
    if (rule.kind === 'overlap') {
      const [shorthand, ...longhands] = rule.readings;
      if (!held.has(shorthand)) continue;
      const covered = longhands.filter((reading) => held.has(reading));
      if (covered.length === 0) continue;
      out.push(
        notice(
          'overlap',
          token,
          `\`${shorthand}\` is the shorthand over \`${covered.join('` and `')}\`, so the two recordings reach the same feature. ` +
            'Neither is dropped — say which one this token means.',
        ),
      );
    }
  }
  return out;
}

/**
 * Read every optional reading a model's typography blocks hold.
 *
 * Returns `{ readings, notices }` where `readings` is token -> `{ reading:
 * value }` for every token whose name identifies exactly one block. Everything
 * this reader could not turn into a reading comes back as a notice; nothing is
 * ever removed from the model, which stays exactly as `design-system.js`
 * parsed it.
 */
export function readTypography(model) {
  const blocks = model?.typographyBlocks ?? [];
  const rows = new Set((model?.tokens?.typography ?? []).map((row) => (row[0] ?? '').trim()));

  const byToken = new Map();
  for (const block of blocks) {
    if (!byToken.has(block.token)) byToken.set(block.token, []);
    byToken.get(block.token).push(block);
  }

  const readings = {};
  const notices = [];

  for (const [token, held] of byToken) {
    if (!rows.has(token)) {
      notices.push(
        notice(
          'unknown-token',
          token,
          `\`${token}\` has a readings block but no row in the Typography table, so nothing reads it. ` +
            'The block is left exactly as written — Phyllum prunes nothing.',
        ),
      );
      continue;
    }
    if (held.length > 1) {
      notices.push(
        notice(
          'ambiguous-token',
          token,
          `\`${token}\` carries ${held.length} readings blocks, so the name does not identify one block ` +
            'and no reading was taken from either. Give them different names, or keep one.',
        ),
      );
      continue;
    }

    const block = held[0];
    if (block.content === null || block.content === undefined) continue;
    const read = readBlock(block.content, token);
    notices.push(...read.notices);
    notices.push(...conflictNotices(read.readings, token));
    if (Object.keys(read.readings).length > 0) readings[token] = read.readings;
  }

  return { readings, notices };
}

/**
 * The optional readings one token holds, or an empty object.
 *
 * The empty object is the never-invent rule in its shortest form: a token with
 * no block, a token whose name identifies two blocks, and a token whose block
 * held nothing readable all answer the same way — nothing is decided.
 */
export function readingsOf(model, token) {
  return readTypography(model).readings[token] ?? {};
}

/**
 * Render a set of readings as the body of a block.
 *
 * The order is the contract table's order, which is what makes a block written
 * by Phyllum stable across runs. A value is written exactly as it was recorded.
 */
export function renderBlock(entries) {
  const held = Array.isArray(entries)
    ? Object.fromEntries(entries.map((entry) => [entry.reading, entry.value]))
    : (entries ?? {});
  const out = [];
  for (const row of load().readings) {
    if (row.core) continue; // the four-column table records these, not the block
    if (!Object.hasOwn(held, row.reading)) continue;
    const value = row.kind === 'bare' ? 'true' : String(held[row.reading]);
    out.push(`${row.reading}: ${value}`);
  }
  return out.join('\n');
}
