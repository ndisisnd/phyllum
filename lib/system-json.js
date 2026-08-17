/**
 * The design system as JSON — the one parse contract the GUI reads (plan §5).
 *
 * The GUI's `GET /system` must show exactly what `phyllum system` shows, or the
 * dashboard and the terminal would be two sources of truth for one file. So the
 * Python server does not parse DESIGN-SYSTEM.md at all: it shells out to this
 * module through `node`, and serves whatever comes back. One parser
 * (`lib/design-system.js`), one contract, no second implementation to drift.
 *
 * Run directly, it prints the JSON for a project root:
 *
 *   node lib/system-json.js /path/to/project
 *
 * Reading only. Nothing here writes, which is why the Python server — the one
 * process outside the Node write funnel — can call it freely.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { parseSpecBlock } from './create.js';
import { TOKEN_SECTIONS, columnsFor, parse } from './design-system.js';
import { DESIGN_SYSTEM_FILE } from './write.js';

/** The JSON shape served at `GET /system`. */
export function systemJson(text) {
  const model = parse(text);
  const tokens = {};
  // The columns are the ones this file carries, not the ones the contract
  // prefers: a file still holding the legacy `notes` column (v0.3.0 §5.5) is
  // served as it stands, so the dashboard shows the file rather than an edit of
  // it. Primitives (§5.3) are Colours' subsection and are served as their own
  // list, in the same column shape.
  const keys = [...TOKEN_SECTIONS.map((section) => section.key), 'primitives'];
  for (const key of keys) {
    const rows = model.tokens[key] ?? [];
    const columns = columnsFor(model, key);
    tokens[key] = rows.map((row) => {
      const entry = { cells: row.map((cell) => String(cell ?? '')) };
      columns.forEach((column, index) => {
        entry[column] = String(row[index] ?? '');
      });
      return entry;
    });
  }

  // The spec block is served twice: raw, as the file spells it, and parsed into
  // its slots (v0.4.1 §4.3). The dashboard's component preview projects the
  // recorded slots into an HTML element, and a page that re-parsed the YAML
  // itself would be a second parser for the one thing the file is strictest
  // about. So the parse happens here, through `parseSpecBlock` — the same
  // reader `create`, `update` and `assess` use — and the page receives data.
  const components = model.components.map((component) => {
    const spec = component.blocks.find((block) => block.lang === 'yaml') ?? null;
    const parsed = spec ? parseSpecBlock(spec.content) : null;
    return {
      name: component.name,
      spec: spec ? spec.content : null,
      // Null spec means no recorded slots, never invented ones: an empty
      // object says "nothing recorded" without pretending to a shape.
      archetype: parsed ? parsed.archetype : null,
      custom: parsed ? parsed.custom : false,
      // Tri-state, all the way to the page (v0.5.0 §3.4): `true`, `false`, or
      // null for a file `apply` has never run against. The badge is drawn for
      // `true` alone, so null and false look the same on the page — which is
      // right, because neither is evidence of adoption.
      applied: parsed ? parsed.applied : null,
      properties: parsed ? parsed.properties : {},
      states: parsed ? parsed.states : {},
      blocks: component.blocks.map((block) => ({ lang: block.lang || 'code', content: block.content })),
    };
  });

  return {
    header: model.header,
    columns: Object.fromEntries(keys.map((key) => [key, columnsFor(model, key)])),
    tokens,
    components,
    backlog: model.backlog,
    counts: {
      colours: tokens.colours.length,
      numbers: tokens.numbers.length,
      typography: tokens.typography.length,
      primitives: tokens.primitives.length,
      components: components.length,
      backlog: model.backlog.length,
    },
  };
}

/** Read a project's DESIGN-SYSTEM.md and return the same shape. */
export function systemJsonForRoot(root) {
  const file = path.join(path.resolve(root), DESIGN_SYSTEM_FILE);
  if (!fs.existsSync(file)) {
    return { error: 'no-design-system', message: `No ${DESIGN_SYSTEM_FILE} in ${root}.` };
  }
  return systemJson(fs.readFileSync(file, 'utf8'));
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const root = process.argv[2] ?? process.cwd();
  const payload = systemJsonForRoot(root);
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = payload.error ? 1 : 0;
}
