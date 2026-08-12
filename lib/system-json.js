/**
 * The design system as JSON — the one parse contract the GUI reads (plan §5).
 *
 * The GUI's `GET /system` must show exactly what `basal system` shows, or the
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

import { TOKEN_SECTIONS, parse } from './design-system.js';
import { DESIGN_SYSTEM_FILE } from './write.js';

/** The JSON shape served at `GET /system`. */
export function systemJson(text) {
  const model = parse(text);
  const tokens = {};
  for (const section of TOKEN_SECTIONS) {
    const rows = model.tokens[section.key] ?? [];
    tokens[section.key] = rows.map((row) => {
      const entry = { cells: row.map((cell) => String(cell ?? '')) };
      section.columns.forEach((column, index) => {
        entry[column] = String(row[index] ?? '');
      });
      return entry;
    });
  }

  const components = model.components.map((component) => {
    const spec = component.blocks.find((block) => block.lang === 'yaml') ?? null;
    return {
      name: component.name,
      spec: spec ? spec.content : null,
      blocks: component.blocks.map((block) => ({ lang: block.lang || 'code', content: block.content })),
    };
  });

  return {
    header: model.header,
    columns: Object.fromEntries(TOKEN_SECTIONS.map((section) => [section.key, section.columns])),
    tokens,
    components,
    backlog: model.backlog,
    counts: {
      colours: tokens.colours.length,
      numbers: tokens.numbers.length,
      typography: tokens.typography.length,
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
