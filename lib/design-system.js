/**
 * The DESIGN-SYSTEM.md contract (plan §7.1 / §7.1.1).
 *
 * One parser, one renderer, one structure validator. `system`, the GUI and
 * every rerun-diff read through this module, which is what lets the
 * round-trip invariant (parse -> render -> parse is a fixed point) mean
 * something: if it holds here, it holds everywhere.
 *
 * Fencing rule: a fenced block is opened with one more backtick than the
 * longest run of backticks it contains, minimum three. Fence length is
 * significant to the parser, so a ```` block is not closed by ```.
 *
 * v0.7.3 phase 1 adds one thing to the file shape and nothing else: a
 * typography token may carry a fenced block of optional readings, under a
 * `#### <token>` heading, directly beneath the Typography table. This module
 * owns that block's *shape* — where it sits, what order the blocks are written
 * in, and the promise that their text survives a round trip byte for byte. It
 * never looks inside one. What a line inside a block means is
 * `lib/typography.js`'s job, read against the contract table in
 * `skill/refs/typography.md`. Keeping the two apart is what lets a block
 * Phyllum cannot understand still be parsed, preserved and written back
 * unchanged, which is the tolerant-parsing rule the rest of this file follows.
 */

export const TITLE = '# Design System';
export const WARNING =
  "> Phyllum manages this file. It is the single source of truth for this project's design system.";

export const TOKEN_SECTIONS = [
  // v0.3.0 §5.5: Colours is `token | value`. The `notes` cell recorded the
  // sentence a token came from — provenance, which is history rather than design
  // system. A file written before this still has the column and keeps it (see
  // `columns` below); `init` is where its removal is offered.
  { key: 'colours', heading: '### Colours', columns: ['token', 'value'] },
  { key: 'numbers', heading: '### Numbers', columns: ['token', 'value', 'applies to'] },
  {
    key: 'typography',
    heading: '### Typography',
    columns: ['token', 'size', 'weight', 'line-height'],
  },
];

/**
 * The primitive ramps `create primitives` writes (v0.3.0 §5.3).
 *
 * They are colours, so they live inside the Colours section rather than in a
 * top-level section of their own: one nested heading, ordinary inline rows
 * beneath it, the same column shape as the rest of Colours. Semantic tokens stay
 * readable above it, and a file with no primitives simply has no heading — which
 * is why this one is not in MANDATORY_HEADINGS and `init` adds it only when
 * there are primitives to put under it.
 */
export const HEADING_PRIMITIVES = '#### Primitives';

/**
 * The language a typography readings block is fenced as (v0.7.3 phase 1).
 *
 * YAML by convention rather than by parser: one `reading: value` per line, and
 * the value is whatever follows the colon. A block is fenced rather than
 * tabulated because a Markdown cell cannot hold a value carrying commas, quotes
 * or brackets without escaping it — and an escaped value is a corrected value,
 * which the never-correct rule forbids.
 */
export const TYPOGRAPHY_BLOCK_LANG = 'yaml';

export const HEADING_TOKENS = '## Tokens';
export const HEADING_COMPONENTS = '## Components';
export const HEADING_BACKLOG = '## Backlog';

export const EMPTY_COMPONENTS_NOTE = '_No components yet. Run `phyllum create` to add one._';
export const EMPTY_BACKLOG_NOTE = '_Nothing outstanding._';

/** Every heading the template contract guarantees, in canonical order. */
export const MANDATORY_HEADINGS = [
  TITLE,
  HEADING_TOKENS,
  ...TOKEN_SECTIONS.map((s) => s.heading),
  HEADING_COMPONENTS,
  HEADING_BACKLOG,
];

const HEADER_FIELDS = ['Project', 'Phyllum version', 'Created'];

// ---------------------------------------------------------------------------
// Fencing
// ---------------------------------------------------------------------------

/** The opening fence a block of `content` needs under the four-backtick rule. */
export function fenceFor(content) {
  let longest = 0;
  for (const run of String(content).matchAll(/`+/g)) {
    longest = Math.max(longest, run[0].length);
  }
  return '`'.repeat(Math.max(3, longest + 1));
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * An empty design system — the model form of the canonical template.
 * meta: { project, version, created }
 */
export function emptyModel(meta = {}) {
  return {
    header: {
      project: meta.project ?? 'Unnamed project',
      version: meta.version ?? '0.0.0',
      created: meta.created ?? new Date().toISOString().slice(0, 10),
    },
    tokens: { colours: [], numbers: [], typography: [], primitives: [] },
    // The optional-readings blocks that sit beneath the Typography table
    // (v0.7.3 phase 1), in file order: `{ token, lang, content }`. A token with
    // no optional readings has no entry here at all — an empty block is not the
    // same as no block, and only the second one is what a pre-v0.7.3 file has.
    // `content` is null for a `#### <token>` heading with no block under it,
    // which is preserved rather than dropped like everything else here.
    typographyBlocks: [],
    // The columns each section's table actually carries in *this* file. Empty
    // means "the canonical ones". A file written before v0.3.0 has a third
    // `notes` column in Colours, and the never-drop-content rule says a render
    // may not quietly throw that cell away — so the shape is read from the file
    // and written back out as it was found. `init` offers the one-time removal.
    columns: {},
    components: [],
    backlog: [],
  };
}

/** The columns one section carries in this model — the file's shape, or the canonical one. */
export function columnsFor(model, key) {
  const section = TOKEN_SECTIONS.find((s) => s.key === key || (key === 'primitives' && s.key === 'colours'));
  return model?.columns?.[key === 'primitives' ? 'colours' : key] ?? section?.columns ?? [];
}

/**
 * The columns this file carries that the contract no longer does (v0.3.0 §5.5).
 *
 * Reported rather than removed. Dropping a column drops what people wrote in it,
 * and the never-drop-content rule does not bend for a column Phyllum itself once
 * asked for — so the removal is `init`'s to offer and the user's to accept.
 */
export function legacyColumns(model) {
  const found = [];
  for (const section of TOKEN_SECTIONS) {
    const columns = model?.columns?.[section.key];
    if (!columns || columns.length <= section.columns.length) continue;
    found.push({ key: section.key, heading: section.heading, extra: columns.slice(section.columns.length) });
  }
  return found;
}

/** Take the model back to the contract's columns, cells and all. Only on an accepted offer. */
export function dropLegacyColumns(model) {
  const dropped = legacyColumns(model);
  for (const { key } of dropped) {
    const width = TOKEN_SECTIONS.find((s) => s.key === key).columns.length;
    delete model.columns[key];
    model.tokens[key] = (model.tokens[key] ?? []).map((row) => row.slice(0, width));
    if (key === 'colours') {
      model.tokens.primitives = (model.tokens.primitives ?? []).map((row) => row.slice(0, width));
    }
  }
  return dropped;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

const isSeparatorRow = (line) => /^\|[\s:|-]+\|$/.test(line.trim());
const splitRow = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

/** Read a DESIGN-SYSTEM.md file into the model. */
export function parse(text) {
  const lines = String(text).split('\n');
  const model = emptyModel({ project: '', version: '', created: '' });

  let section = 'header';
  let tokenKey = null;
  let component = null;
  let typeBlock = null; // the `#### <token>` heading whose block has not arrived
  let fence = null; // { marker, lang, lines }

  for (const line of lines) {
    // Inside a fenced block nothing is a heading — fence length is significant.
    if (fence) {
      const close = line.match(/^(`{3,})\s*$/);
      if (close && close[1].length >= fence.marker.length) {
        const content = fence.lines.join('\n');
        // One fence reader, two destinations: a component's spec and code
        // blocks, and a typography token's readings block. Which one is holding
        // the fence is settled before it opens, never after.
        if (fence.owner === 'typography') fence.block.content = content;
        else component?.blocks.push({ lang: fence.lang, content });
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }

    const open = line.match(/^(`{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
    if (open && section === 'components' && component) {
      fence = { marker: open[1], lang: open[2] ?? '', lines: [], owner: 'components' };
      continue;
    }
    // Only the *first* block under a `#### <token>` heading is that token's
    // readings. A second fenced block there belongs to nothing, so it is not
    // swallowed into the first — it is left as the prose it looks like.
    if (open && typeBlock && typeBlock.content === null) {
      typeBlock.lang = open[2] ?? '';
      fence = { marker: open[1], lines: [], owner: 'typography', block: typeBlock };
      continue;
    }

    const trimmed = line.trim();

    if (trimmed === HEADING_TOKENS) {
      section = 'tokens';
      tokenKey = null;
      typeBlock = null;
      continue;
    }
    if (trimmed === HEADING_COMPONENTS) {
      section = 'components';
      component = null;
      typeBlock = null;
      continue;
    }
    if (trimmed === HEADING_BACKLOG) {
      section = 'backlog';
      component = null;
      typeBlock = null;
      continue;
    }

    if (section === 'header') {
      const field = trimmed.match(/^-\s+([^:]+):\s*(.*)$/);
      if (field && HEADER_FIELDS.includes(field[1])) {
        if (field[1] === 'Project') model.header.project = field[2];
        if (field[1] === 'Phyllum version') model.header.version = field[2];
        if (field[1] === 'Created') model.header.created = field[2];
      }
      continue;
    }

    if (section === 'tokens') {
      const known = TOKEN_SECTIONS.find((s) => s.heading === trimmed);
      if (known) {
        tokenKey = known.key;
        typeBlock = null;
        continue;
      }
      // The one nested subsection (§5.3). It belongs to Colours, so it is only a
      // heading while Colours is the section in hand; anywhere else it is prose.
      if (trimmed === HEADING_PRIMITIVES && (tokenKey === 'colours' || tokenKey === 'primitives')) {
        tokenKey = 'primitives';
        typeBlock = null;
        continue;
      }
      // A typography token's optional readings (v0.7.3 phase 1). The heading is
      // only a heading while Typography is the section in hand — `#### Anything`
      // under Colours is the primitives heading or prose, and neither is this.
      // The entry is pushed the moment the heading is read, before its block has
      // arrived, so a heading with no block under it is preserved too.
      const typeHeading = tokenKey === 'typography' ? trimmed.match(/^####\s+(.+)$/) : null;
      if (typeHeading) {
        typeBlock = { token: typeHeading[1].trim(), lang: '', content: null };
        model.typographyBlocks.push(typeBlock);
        continue;
      }
      if (!tokenKey || !trimmed.startsWith('|')) continue;
      if (isSeparatorRow(trimmed)) continue;
      const cells = splitRow(trimmed);
      // The header row repeats the column names; it is structure, not data. It
      // is read as a *prefix* so a legacy table with an extra column still reads
      // as a header — and the extra column is remembered, not dropped. Both the
      // shape already read from this file and the canonical one count, so a
      // hand-edited file whose two tables disagree still parses as two tables.
      const key = tokenKey === 'primitives' ? 'colours' : tokenKey;
      const canonical = TOKEN_SECTIONS.find((s) => s.key === key).columns;
      const header = [columnsFor(model, tokenKey), canonical].find(
        (columns) => cells.length >= columns.length && columns.every((c, i) => c === cells[i]),
      );
      if (header) {
        if (cells.length > canonical.length) model.columns[key] = cells;
        continue;
      }
      model.tokens[tokenKey].push(cells);
      continue;
    }

    if (section === 'components') {
      const heading = trimmed.match(/^###\s+(.+)$/);
      if (heading) {
        component = { name: heading[1].trim(), blocks: [] };
        model.components.push(component);
      }
      continue;
    }

    if (section === 'backlog') {
      const item = trimmed.match(/^-\s+(.*)$/);
      if (item) model.backlog.push(item[1]);
    }
  }

  return model;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderTable(columns, rows) {
  const out = [`| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`];
  for (const row of rows) {
    const cells = columns.map((_, i) => (row[i] ?? '').toString());
    out.push(`| ${cells.join(' | ')} |`);
  }
  return out;
}

/**
 * The typography blocks in the order they are written: the Typography table's
 * own row order (v0.7.3 phase 1).
 *
 * A block whose token has no row in the table has no place in that order, so it
 * is written after the ones that do, keeping the order it was found in. It is
 * never pruned — a hand-edited table or a rename is not licence to throw away
 * what somebody wrote — and `lib/typography.js` reports it rather than reading
 * it. The sort is stable, so two blocks under one name keep their order too.
 */
export function orderedTypographyBlocks(model) {
  const blocks = model?.typographyBlocks ?? [];
  const rows = (model?.tokens?.typography ?? []).map((row) => (row[0] ?? '').trim());
  const rank = (block) => {
    const index = rows.indexOf(block.token);
    return index === -1 ? rows.length : index;
  };
  return blocks
    .map((block, index) => ({ block, index, rank: rank(block) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.block);
}

/** Write the model back out as DESIGN-SYSTEM.md text. */
export function render(model) {
  const out = [];
  out.push(TITLE, '', WARNING, '');
  out.push(`- Project: ${model.header.project}`);
  out.push(`- Phyllum version: ${model.header.version}`);
  out.push(`- Created: ${model.header.created}`);
  out.push('');

  out.push(HEADING_TOKENS, '');
  for (const section of TOKEN_SECTIONS) {
    out.push(section.heading, '');
    out.push(...renderTable(columnsFor(model, section.key), model.tokens[section.key] ?? []));
    out.push('');
    // Primitives are Colours' own subsection, so they render inside it — and
    // only when there are any. A system with no ramps keeps the file it had.
    if (section.key === 'colours' && (model.tokens.primitives ?? []).length > 0) {
      out.push(HEADING_PRIMITIVES, '');
      out.push(...renderTable(columnsFor(model, 'primitives'), model.tokens.primitives));
      out.push('');
    }
    // The optional-readings blocks sit directly beneath the Typography table
    // (v0.7.3 phase 1), and a system where no token records one writes nothing
    // here — which is what keeps every file written before v0.7.3 identical.
    if (section.key === 'typography') {
      for (const block of orderedTypographyBlocks(model)) {
        out.push(`#### ${block.token}`, '');
        if (block.content === null || block.content === undefined) continue;
        const marker = fenceFor(block.content);
        out.push(`${marker}${block.lang ?? ''}`);
        out.push(...block.content.split('\n'));
        out.push(marker, '');
      }
    }
  }

  out.push(HEADING_COMPONENTS, '');
  if (model.components.length === 0) {
    out.push(EMPTY_COMPONENTS_NOTE, '');
  } else {
    for (const component of model.components) {
      out.push(`### ${component.name}`, '');
      for (const block of component.blocks) {
        const marker = fenceFor(block.content);
        out.push(`${marker}${block.lang ?? ''}`);
        out.push(...block.content.split('\n'));
        out.push(marker, '');
      }
    }
  }

  out.push(HEADING_BACKLOG, '');
  if (model.backlog.length === 0) {
    out.push(EMPTY_BACKLOG_NOTE, '');
  } else {
    for (const item of model.backlog) out.push(`- ${item}`);
    out.push('');
  }

  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

// ---------------------------------------------------------------------------
// Structure validation and repair
// ---------------------------------------------------------------------------

/** Which mandatory headings (plan §7.1.1) are missing from a file? */
export function missingHeadings(text) {
  const lines = String(text).split('\n');
  const present = new Set();
  let fence = null;
  for (const line of lines) {
    if (fence) {
      const close = line.match(/^(`{3,})\s*$/);
      if (close && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = line.match(/^(`{3,})/);
    if (open) {
      fence = open[1];
      continue;
    }
    const trimmed = line.trim();
    if (MANDATORY_HEADINGS.includes(trimmed)) present.add(trimmed);
  }
  return MANDATORY_HEADINGS.filter((h) => !present.has(h));
}

/** True when the file honours the §7.1.1 section contract. */
export function validateStructure(text) {
  const missing = missingHeadings(text);
  const fencing = validateFencing(text);
  return { valid: missing.length === 0 && fencing.valid, missing, fencing };
}

/**
 * Every fenced block must be opened with a longer run of backticks than
 * anything it contains — the four-backtick rule generalised.
 */
export function validateFencing(text) {
  const lines = String(text).split('\n');
  const problems = [];
  let fence = null;
  lines.forEach((line, index) => {
    if (fence) {
      const close = line.match(/^(`{3,})\s*$/);
      if (close && close[1].length >= fence.marker.length) {
        const inner = fence.lines.join('\n');
        if (fenceFor(inner).length > fence.marker.length) {
          problems.push(
            `line ${fence.line + 1}: block opened with ${fence.marker.length} backticks contains a longer run`,
          );
        }
        fence = null;
      } else {
        fence.lines.push(line);
      }
      return;
    }
    const open = line.match(/^(`{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
    if (open) fence = { marker: open[1], line: index, lines: [] };
  });
  if (fence) problems.push(`line ${fence.line + 1}: unclosed fenced block`);
  return { valid: problems.length === 0, problems };
}

const canonicalBody = {
  [TITLE]: (meta) => [
    '',
    WARNING,
    '',
    `- Project: ${meta.project}`,
    `- Phyllum version: ${meta.version}`,
    `- Created: ${meta.created}`,
    '',
  ],
  [HEADING_TOKENS]: () => [''],
  [HEADING_COMPONENTS]: () => ['', EMPTY_COMPONENTS_NOTE, ''],
  [HEADING_BACKLOG]: () => ['', EMPTY_BACKLOG_NOTE, ''],
};
for (const section of TOKEN_SECTIONS) {
  canonicalBody[section.heading] = () => ['', ...renderTable(section.columns, []), ''];
}

/**
 * Add back any mandatory heading the user removed, in canonical position,
 * without dropping a single line of what they wrote. Additions only.
 */
export function repairStructure(text, meta = {}) {
  const missing = missingHeadings(text);
  if (missing.length === 0) return { text: String(text), repaired: [] };

  const lines = String(text).split('\n');
  const index = new Map();
  let fence = null;
  lines.forEach((line, i) => {
    if (fence) {
      const close = line.match(/^(`{3,})\s*$/);
      if (close && close[1].length >= fence.length) fence = null;
      return;
    }
    const open = line.match(/^(`{3,})/);
    if (open) {
      fence = open[1];
      return;
    }
    const trimmed = line.trim();
    if (MANDATORY_HEADINGS.includes(trimmed) && !index.has(trimmed)) index.set(trimmed, i);
  });

  const found = MANDATORY_HEADINGS.filter((h) => index.has(h));
  const firstFound = found.length > 0 ? index.get(found[0]) : lines.length;

  const out = [];
  // A missing title has to lead, so the file still opens with its H1.
  if (!index.has(TITLE)) {
    out.push(TITLE, ...canonicalBody[TITLE](withDefaults(meta)));
  }
  // Anything the user wrote above the first known heading is kept verbatim.
  out.push(...lines.slice(0, firstFound));

  for (let i = 0; i < MANDATORY_HEADINGS.length; i += 1) {
    const heading = MANDATORY_HEADINGS[i];
    if (!index.has(heading)) {
      if (heading === TITLE) continue; // already emitted above
      out.push(heading, ...canonicalBody[heading](withDefaults(meta)));
      continue;
    }
    const start = index.get(heading);
    const nextFound = MANDATORY_HEADINGS.slice(i + 1).find((h) => index.has(h));
    const end = nextFound === undefined ? lines.length : index.get(nextFound);
    out.push(...lines.slice(start, end));
  }

  const text2 = `${out.join('\n').replace(/\n+$/, '')}\n`;
  return { text: text2, repaired: missing };
}

function withDefaults(meta) {
  return {
    project: meta.project ?? 'Unnamed project',
    version: meta.version ?? '0.0.0',
    created: meta.created ?? new Date().toISOString().slice(0, 10),
  };
}
