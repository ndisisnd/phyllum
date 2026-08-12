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
 */

export const TITLE = '# Design System';
export const WARNING =
  "> Basal manages this file. It is the single source of truth for this project's design system.";

export const TOKEN_SECTIONS = [
  { key: 'colours', heading: '### Colours', columns: ['token', 'value', 'notes'] },
  { key: 'numbers', heading: '### Numbers', columns: ['token', 'value', 'applies to'] },
  {
    key: 'typography',
    heading: '### Typography',
    columns: ['token', 'size', 'weight', 'line-height'],
  },
];

export const HEADING_TOKENS = '## Tokens';
export const HEADING_COMPONENTS = '## Components';
export const HEADING_BACKLOG = '## Backlog';

export const EMPTY_COMPONENTS_NOTE = '_No components yet. Run `basal create` to add one._';
export const EMPTY_BACKLOG_NOTE = '_Nothing outstanding._';

/** Every heading the template contract guarantees, in canonical order. */
export const MANDATORY_HEADINGS = [
  TITLE,
  HEADING_TOKENS,
  ...TOKEN_SECTIONS.map((s) => s.heading),
  HEADING_COMPONENTS,
  HEADING_BACKLOG,
];

const HEADER_FIELDS = ['Project', 'Basal version', 'Created'];

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
    tokens: { colours: [], numbers: [], typography: [] },
    components: [],
    backlog: [],
  };
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
  let fence = null; // { marker, lang, lines }

  for (const line of lines) {
    // Inside a fenced block nothing is a heading — fence length is significant.
    if (fence) {
      const close = line.match(/^(`{3,})\s*$/);
      if (close && close[1].length >= fence.marker.length) {
        component?.blocks.push({ lang: fence.lang, content: fence.lines.join('\n') });
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }

    const open = line.match(/^(`{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
    if (open && section === 'components' && component) {
      fence = { marker: open[1], lang: open[2] ?? '', lines: [] };
      continue;
    }

    const trimmed = line.trim();

    if (trimmed === HEADING_TOKENS) {
      section = 'tokens';
      tokenKey = null;
      continue;
    }
    if (trimmed === HEADING_COMPONENTS) {
      section = 'components';
      component = null;
      continue;
    }
    if (trimmed === HEADING_BACKLOG) {
      section = 'backlog';
      component = null;
      continue;
    }

    if (section === 'header') {
      const field = trimmed.match(/^-\s+([^:]+):\s*(.*)$/);
      if (field && HEADER_FIELDS.includes(field[1])) {
        if (field[1] === 'Project') model.header.project = field[2];
        if (field[1] === 'Basal version') model.header.version = field[2];
        if (field[1] === 'Created') model.header.created = field[2];
      }
      continue;
    }

    if (section === 'tokens') {
      const known = TOKEN_SECTIONS.find((s) => s.heading === trimmed);
      if (known) {
        tokenKey = known.key;
        continue;
      }
      if (!tokenKey || !trimmed.startsWith('|')) continue;
      if (isSeparatorRow(trimmed)) continue;
      const cells = splitRow(trimmed);
      const columns = TOKEN_SECTIONS.find((s) => s.key === tokenKey).columns;
      // The header row repeats the column names; it is structure, not data.
      if (cells.length === columns.length && cells.every((c, i) => c === columns[i])) continue;
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

/** Write the model back out as DESIGN-SYSTEM.md text. */
export function render(model) {
  const out = [];
  out.push(TITLE, '', WARNING, '');
  out.push(`- Project: ${model.header.project}`);
  out.push(`- Basal version: ${model.header.version}`);
  out.push(`- Created: ${model.header.created}`);
  out.push('');

  out.push(HEADING_TOKENS, '');
  for (const section of TOKEN_SECTIONS) {
    out.push(section.heading, '');
    out.push(...renderTable(section.columns, model.tokens[section.key] ?? []));
    out.push('');
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
    `- Basal version: ${meta.version}`,
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
