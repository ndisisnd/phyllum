/**
 * `govern docs` — the five-part documentation template (v0.12.0 phase 4).
 *
 * Governance is the stage that says what the rules are, and this is the mode
 * that writes the thing a reader needs before any rule is useful: what the
 * component is, and how it is meant to be used. It writes one file,
 * `DESIGN-SYSTEM.md`, and it writes one block inside it.
 *
 * The reference is `refs/govern/docs.md`; where that file and this one disagree,
 * that one wins and this one is wrong. What is worth stating here is the four
 * decisions the code is shaped around, because each one is enforced below rather
 * than promised in a comment.
 *
 *   1. **The template is the table.** `phyllum:docs-parts` names the five parts,
 *      in order, with the most items each may hold. This module walks that
 *      table. There is no array of part names in here, so a part cannot be
 *      dropped from the code while the reference still lists it, and an entry
 *      cannot be rendered in an order nobody wrote down.
 *   2. **The cap is read, not remembered.** "Up to three do-not-do examples" is
 *      a number in the `Most` column, checked when the entry is built. A fourth
 *      is refused rather than trimmed, because a silent trim is a decision the
 *      writer never got told about.
 *   3. **A part with no content is `TODO`, never absent.** The renderer emits
 *      all five parts always. That is `protocol-compliance.md` §5's rule about
 *      debt applied to prose: a stated gap is compliant and a quiet one is not,
 *      and it is what lets `refine ship` distinguish "not documented" from
 *      "documented, with one part still open".
 *   4. **The entry is read back with the template that wrote it.** The title
 *      line and the part headings come out of the copy table in both
 *      directions, so a line edited in the reference stays a line the parser
 *      recognises — the same discipline `lib/govern-log.js` applies to the
 *      changelog's own headings.
 *
 * Nothing here writes prose. The five parts are stated by whatever gathered
 * them — the spec block, the usage contract, the adoption evidence, the user —
 * and this module renders, checks and places them. `planDocs` derives and
 * reaches no writer; `writeDocs` is the write, and the acceptance in between is
 * the skill's.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  HEADING_BACKLOG,
  HEADING_COMPONENTS,
  HEADING_TOKENS,
  fenceFor,
} from './design-system.js';
import { numberCell, stripTicks, tableAfter as readTable } from './md-tables.js';
import { readRef, refFileOf } from './refs.js';
import { DESIGN_SYSTEM_FILE, writeDesignSystem } from './write.js';

/** The stage folder these tables live in. */
export const GOVERN_REF = 'govern';

export const MARKERS = {
  parts: '<!-- phyllum:docs-parts -->',
  sources: '<!-- phyllum:docs-sources -->',
  copy: '<!-- phyllum:docs-copy -->',
};

/**
 * The fenced block's language, and the one discriminator that finds the entry.
 *
 * No other block under a component's heading uses it: the spec block is `yaml`
 * and a code block is whatever framework the project writes in. So the entry is
 * found by what it is rather than by counting blocks, which is what keeps a
 * component with two code samples from confusing the reader.
 */
export const DOCS_LANG = 'markdown';

const tableAfter = (text, marker) => readTable(text, marker, refFileOf(marker, GOVERN_REF));

/**
 * The three tables, read out of text rather than off disk.
 *
 * Split out for the reason `parseGovernLogSpec` is: the malformed-input sweep
 * exercises the reader against doctored text, and doctoring text is not the
 * same as writing inside the package.
 */
export function parseGovernDocsSpec(text) {
  const parts = tableAfter(text, MARKERS.parts).map(([part, heading, answers, most]) => ({
    part: stripTicks(part),
    heading: String(heading ?? '').trim(),
    answers: String(answers ?? '').trim(),
    // The cap is the table's number. A row with no readable one would be a part
    // with no ceiling, which is the thing the column exists to prevent, so it
    // is refused rather than defaulted.
    most: capCell(most, stripTicks(part)),
  }));

  const sources = tableAfter(text, MARKERS.sources).map(([part, from, silent]) => ({
    part: stripTicks(part),
    from: String(from ?? '').trim(),
    whenSilent: String(silent ?? '').trim(),
  }));

  const copy = Object.fromEntries(
    tableAfter(text, MARKERS.copy).map(([line, printed]) => [
      stripTicks(line),
      String(printed ?? '').trim(),
    ]),
  );

  return { parts, sources, copy };
}

/** A `Most` cell is a positive whole number; anything else is not a ceiling. */
function capCell(cell, part) {
  const most = numberCell(cell ?? '');
  if (!Number.isInteger(most) || most < 1) {
    throw new Error(
      `${refFileOf(MARKERS.parts, GOVERN_REF)}: "${cell}" is not a ceiling for "${part}" — a Most cell is a whole number of one or more`,
    );
  }
  return most;
}

let specCache = null;

/** The tables, read once. The reference tree is Phyllum's own and does not change. */
export function governDocsSpec() {
  if (!specCache) specCache = parseGovernDocsSpec(readRef(GOVERN_REF));
  return specCache;
}

/** Forget the tables — the hostile-input sweeps rebuild them against doctored text. */
export function reloadGovernDocsSpec() {
  specCache = null;
}

/** The five parts, in table order — the template itself. */
export const docsParts = () => governDocsSpec().parts;

/** The five part names, in table order. */
export const docsPartNames = () => docsParts().map((row) => row.part);

/** One part's row by name, or null — a part nothing declares is one nothing renders. */
export const docsPartFor = (part) =>
  docsParts().find((row) => row.part === String(part ?? '').trim()) ?? null;

/** Where each part's content comes from, in table order. */
export const docsSources = () => governDocsSpec().sources;

/** One fixed line, by its name in the copy table. */
export function copyLine(name) {
  const line = governDocsSpec().copy[name];
  if (line === undefined) {
    throw new Error(`${refFileOf(MARKERS.copy, GOVERN_REF)} has no "${name}" line`);
  }
  return line;
}

/** Fill `{placeholders}` in a copy line. An unfilled placeholder is left as it is. */
export function fillLine(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}

/** The word a part with no content carries, straight from the copy table. */
export const todoWord = () => copyLine('todo');

// ---------------------------------------------------------------------------
// The failure
// ---------------------------------------------------------------------------

/**
 * An entry that could not be built — a part nobody declared, an empty part, or
 * more items than the ceiling allows. Raised before anything is rendered, so a
 * refused entry never reaches a file at all.
 */
export class DocsEntryError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'DocsEntryError';
    Object.assign(this, detail);
  }
}

// ---------------------------------------------------------------------------
// One entry
// ---------------------------------------------------------------------------

/** One part's stated content, as a list of items, whatever shape it came in. */
function itemsOf(value) {
  const list = Array.isArray(value) ? value : [value];
  return list
    // Trailing spaces go; blank lines stay. A blank line inside a part is the
    // writer's paragraph break or their code example's own spacing, and a
    // renderer that swallowed it would be editing what it was handed.
    .map((item) => String(item ?? '').replace(/[ \t]+$/gm, '').trim())
    .filter((item) => item !== '');
}

/**
 * The five parts, in table order, checked against the table.
 *
 * A part the caller did not state comes back as `TODO` rather than missing:
 * the template is fixed, so an entry always has five parts and the ones with no
 * answer say so. A part stated as empty is a different thing — somebody meant
 * to write something and wrote nothing — and it is refused so the silence is
 * never mistaken for a stated gap.
 */
export function normaliseParts(parts = {}) {
  const declared = docsPartNames();
  for (const key of Object.keys(parts)) {
    if (!declared.includes(key)) {
      throw new DocsEntryError(
        fillLine(copyLine('unknown-part'), { part: key, parts: declared.join(', ') }),
        { part: key },
      );
    }
  }

  return docsParts().map((row) => {
    if (!Object.hasOwn(parts, row.part) || parts[row.part] === null) {
      return { ...row, items: [todoWord()], todo: true };
    }
    const items = itemsOf(parts[row.part]);
    if (items.length === 0) {
      throw new DocsEntryError(fillLine(copyLine('empty-part'), { part: row.part }), {
        part: row.part,
      });
    }
    if (items.length > row.most) {
      throw new DocsEntryError(
        fillLine(copyLine('over-cap'), {
          part: row.part,
          most: row.most,
          count: items.length,
        }),
        { part: row.part, most: row.most, count: items.length },
      );
    }
    return { ...row, items, todo: items.every((item) => item === todoWord()) };
  });
}

/**
 * One entry as the text of the block that is written.
 *
 * The parts are walked in table order and every one is emitted, so the shape is
 * the same in every entry the mode has ever written. A part whose ceiling is one
 * renders as a body; a part that may hold several renders as a list, because a
 * list of one is still the shape a reader of the next entry expects.
 */
export function renderEntry(name, parts = {}) {
  const subject = stripTicks(String(name ?? '')).trim();
  if (subject === '') {
    throw new DocsEntryError(fillLine(copyLine('unrecorded'), { name: String(name ?? '') }));
  }
  const rows = normaliseParts(parts);
  const out = [fillLine(copyLine('title'), { name: subject })];
  for (const row of rows) {
    out.push('', fillLine(copyLine('part-heading'), { heading: row.heading }), '');
    if (row.most === 1) out.push(row.items[0]);
    else for (const item of row.items) out.push(fillLine(copyLine('item'), { item }));
  }
  return `${out.join('\n')}\n`;
}

/** The title template as a pattern, so a block is recognised by what wrote it. */
function titlePattern() {
  return templatePattern(copyLine('title'), { '{name}': '(.+)' });
}

/** The list-item template as a pattern, for the same reason. */
function itemPattern() {
  return templatePattern(copyLine('item'), { '{item}': '(.+)' });
}

/** A copy line with its fixed words escaped and its placeholders turned into groups. */
function templatePattern(template, groups) {
  const keys = Object.keys(groups);
  const splitter = new RegExp(`(${keys.map((key) => key.replace(/[{}]/g, '\\$&')).join('|')})`);
  const source = String(template)
    .split(splitter)
    .map((piece) =>
      Object.hasOwn(groups, piece) ? groups[piece] : piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^${source}$`);
}

/** The heading line one part is written under. */
const headingLine = (row) => fillLine(copyLine('part-heading'), { heading: row.heading });

/**
 * A block of text read back as an entry, or null when it is not one.
 *
 * Null means "this is not a documentation entry", which is a different answer
 * from "this entry is incomplete" — a code sample and a half-written entry must
 * never read alike. The title line is what decides, and it is the same line the
 * renderer wrote.
 *
 * Everything the caller needs to grade the entry comes back with it: which parts
 * are present, which are missing, which are still `TODO`, whether the headings
 * ran in the template's order, and whether any part broke its ceiling. Nothing
 * here decides what any of that means for a verdict.
 */
export function parseEntry(text) {
  const lines = String(text ?? '').split('\n');
  const first = lines.findIndex((line) => line.trim() !== '');
  const title = first === -1 ? null : lines[first].trim().match(titlePattern());
  if (!title) return null;

  const rows = docsParts();
  const headings = new Map(rows.map((row) => [headingLine(row), row]));
  const found = new Map();
  const order = [];
  let current = null;
  let body = [];

  const close = () => {
    if (!current) return;
    const item = itemPattern();
    // Blank lines at the edges are the renderer's spacing, not content. Blank
    // lines inside a body are the writer's, and they survive: a code example is
    // one of the five parts, and a code example without its blank lines is a
    // different example.
    const bodyLines = [...body];
    while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
    while (bodyLines.length > 0 && bodyLines.at(-1).trim() === '') bodyLines.pop();
    const written = bodyLines.filter((line) => line.trim() !== '');
    // A list is a list only where the part may hold more than one thing. A body
    // that happens to open with a dash under a single-item part is prose with a
    // dash in it, and reading it as two items would invent a ceiling breach.
    const listed = current.most > 1 && written.length > 0 && written.every((line) => item.test(line.trim()));
    const content =
      bodyLines.length === 0
        ? []
        : listed
          ? written.map((line) => line.trim().match(item)[1].trim())
          : [bodyLines.join('\n')];
    found.set(current.part, {
      part: current.part,
      heading: current.heading,
      items: content,
      todo: content.length > 0 && content.every((entry) => entry === todoWord()),
      most: current.most,
      overCap: content.length > current.most,
    });
    current = null;
    body = [];
  };

  for (const line of lines.slice(first + 1)) {
    const row = headings.get(line.trim());
    if (row) {
      close();
      // A heading repeated is not a second part; the first reading stands, and
      // the duplicate's body is read into it rather than replacing it.
      if (!found.has(row.part)) order.push(row.part);
      current = row;
      continue;
    }
    if (current) body.push(line);
  }
  close();

  const parts = rows.map(
    (row) =>
      found.get(row.part) ?? {
        part: row.part,
        heading: row.heading,
        items: [],
        todo: false,
        most: row.most,
        overCap: false,
      },
  );

  const missing = parts.filter((row) => row.items.length === 0).map((row) => row.part);
  const todo = parts.filter((row) => row.todo).map((row) => row.part);
  const overCap = parts.filter((row) => row.overCap).map((row) => row.part);

  return {
    name: title[1].trim(),
    parts,
    order,
    // The template's order, not merely its membership. An entry whose parts
    // arrived in another order is an entry the reader of the next one has to
    // hunt through, and that is the thing the fixed template forbids.
    ordered: order.join(',') === docsPartNames().slice(0, order.length).join(','),
    missing,
    todo,
    overCap,
    complete:
      missing.length === 0 &&
      todo.length === 0 &&
      overCap.length === 0 &&
      order.length === rows.length &&
      order.join(',') === docsPartNames().join(','),
  };
}

// ---------------------------------------------------------------------------
// Finding the block in the file
// ---------------------------------------------------------------------------

/**
 * Every recorded component's heading and fenced blocks, as line ranges.
 *
 * The walk is `lib/design-system.js`'s own reading of the components section,
 * kept as line numbers rather than as a model. The write this module performs is
 * surgical — one block replaced or one block inserted — for the reason
 * `refine deprecate`'s is: re-rendering the whole file from a parsed model would
 * put every byte of somebody's design system at risk to add a paragraph.
 */
export function componentBlocks(text) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  let inComponents = false;
  let current = null;
  let fence = null;

  lines.forEach((line, index) => {
    if (fence) {
      const closing = line.match(/^(`{3,})\s*$/);
      if (closing && closing[1].length >= fence.marker.length) {
        current?.blocks.push({
          lang: fence.lang,
          open: fence.open,
          close: index,
          content: lines.slice(fence.open + 1, index).join('\n'),
        });
        fence = null;
      }
      return;
    }

    const trimmed = line.trim();
    if (trimmed === HEADING_TOKENS || trimmed === HEADING_BACKLOG) {
      inComponents = false;
      current = null;
      return;
    }
    if (trimmed === HEADING_COMPONENTS) {
      inComponents = true;
      current = null;
      return;
    }
    if (!inComponents) return;

    const heading = trimmed.match(/^###\s+(.+)$/);
    if (heading) {
      current = { name: heading[1].trim(), heading: index, blocks: [] };
      out.push(current);
      return;
    }
    const opening = line.match(/^(`{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
    if (opening && current) fence = { marker: opening[1], lang: opening[2] ?? '', open: index };
  });

  return out;
}

/** One component's record in the file, or null when nothing records that name. */
export const componentIn = (text, name) =>
  componentBlocks(text).find((entry) => entry.name === String(name ?? '').trim()) ?? null;

/**
 * The documentation block under one component's heading, or null.
 *
 * Both tests have to hold: the block's language, and a title line the renderer
 * would have written. A `markdown` block somebody put there by hand that is not
 * an entry is left alone rather than overwritten, which is the same restraint
 * `govern log` shows towards prose in the changelog.
 */
export function docsBlockOf(component) {
  for (const block of component?.blocks ?? []) {
    if (block.lang !== DOCS_LANG) continue;
    if (parseEntry(block.content)) return block;
  }
  return null;
}

/** The parsed entry recorded for one component in the file, or null. */
export function docsEntryIn(text, name) {
  const component = componentIn(text, name);
  if (!component) return null;
  const block = docsBlockOf(component);
  return block ? parseEntry(block.content) : null;
}

/**
 * The parsed entry recorded on a parsed component, or null.
 *
 * The seam `refine ship` reads through. It is handed the component off
 * `lib/design-system.js`'s model rather than the file's text, so the criterion
 * reads the entry with the parser that writes it and there is one answer to
 * "is there an entry" rather than two.
 */
export function docsEntryOf(component) {
  const block = (component?.blocks ?? []).find(
    (item) => item.lang === DOCS_LANG && parseEntry(item.content),
  );
  return block ? parseEntry(block.content) : null;
}

// ---------------------------------------------------------------------------
// The derivation, and the write
// ---------------------------------------------------------------------------

/** `DESIGN-SYSTEM.md` as text, or null when the project has none. */
export function readDesignSystem(root) {
  try {
    return fs.readFileSync(path.join(path.resolve(root), DESIGN_SYSTEM_FILE), 'utf8');
  } catch {
    return null;
  }
}

/**
 * What `govern docs` *would* write, having written nothing.
 *
 * Holds no writer and reaches none, exactly as `planAppend` and `planDeprecation`
 * do: the proposal is what the skill shows before it asks, and the acceptance is
 * what turns it into a call to `writeDocs`.
 *
 * `writes: false` is the rerunnable case. An entry that renders to exactly the
 * block already under the heading changes nothing rather than rewriting the file
 * with identical bytes.
 */
export function planDocs(root, name, parts = {}, options = {}) {
  const before = options.text ?? readDesignSystem(root) ?? '';
  const subject = stripTicks(String(name ?? '')).trim();
  const component = componentIn(before, subject);
  if (!component) {
    throw new DocsEntryError(fillLine(copyLine('unrecorded'), { name: subject }), {
      component: subject,
    });
  }

  const entryText = renderEntry(subject, parts);
  const marker = fenceFor(entryText);
  const block = [`${marker}${DOCS_LANG}`, ...entryText.replace(/\n$/, '').split('\n'), marker];
  const existing = docsBlockOf(component);
  const lines = before.split('\n');

  if (existing && lines.slice(existing.open, existing.close + 1).join('\n') === block.join('\n')) {
    return {
      path: DESIGN_SYSTEM_FILE,
      component: subject,
      entry: parseEntry(entryText),
      block: block.join('\n'),
      before,
      after: before,
      writes: false,
      replaced: false,
      reason: fillLine(copyLine('unchanged'), { name: subject }),
    };
  }

  const next = [...lines];
  if (existing) {
    next.splice(existing.open, existing.close - existing.open + 1, ...block);
  } else {
    // After everything already under the heading: the spec block is the
    // component's contract and a code block is what it renders as, and the
    // documentation reads after both rather than between them.
    const last = component.blocks.at(-1);
    const at = last ? last.close + 1 : component.heading + 1;
    next.splice(at, 0, '', ...block);
  }

  return {
    path: DESIGN_SYSTEM_FILE,
    component: subject,
    entry: parseEntry(entryText),
    block: block.join('\n'),
    before,
    after: next.join('\n'),
    writes: true,
    replaced: Boolean(existing),
    reason: null,
  };
}

/**
 * Write one component's documentation entry.
 *
 * The plan is derived, and only then does the funnel see the text. A run that
 * would change nothing writes nothing at all.
 */
export function writeDocs(root, name, parts = {}, options = {}) {
  const plan = planDocs(root, name, parts, options);
  if (!plan.writes) return { ...plan, written: false };
  writeDesignSystem(root, plan.after, options);
  return { ...plan, written: true };
}
