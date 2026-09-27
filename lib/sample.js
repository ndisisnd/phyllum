/**
 * The sample design system — the mechanics.
 *
 * Phyllum ships one worked example: `templates/SAMPLE-DESIGN-SYSTEM.md`. It is
 * a whole design system in the file's own shape — two primitive ramps, the
 * semantic colours, numbers and type that sit on them, and five components
 * built from those tokens — so a new user opens `DESIGN-SYSTEM.md` on a system
 * that already shows what one looks like, rather than on five empty tables.
 *
 * The sample lives *inside* `DESIGN-SYSTEM.md`, never beside it. That keeps the
 * one-write-target rule whole: there is no second file to keep in step, and
 * `dispose` and `restore` are edits to the one file every other command edits.
 *
 * Nothing marks an entry as sample. An entry **is** sample while it still reads
 * exactly as it shipped — same name, same value, same spec — and stops being
 * sample the moment somebody changes it. So:
 *
 *   dispose   removes every entry still identical to the shipped one, and keeps
 *             anything edited, anything your own components still point at, and
 *             any component the codebase already uses
 *   restore   adds back every shipped entry whose name is not in the file, and
 *             never overwrites a name that is — that name is yours now
 *
 * Both are arithmetic over two parsed files. There is no model in this path.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parse } from './design-system.js';
import { parseSpecBlock } from './create.js';
import { PACKAGE_ROOT } from './template.js';

export const SAMPLE_PATH = path.join(PACKAGE_ROOT, 'templates', 'SAMPLE-DESIGN-SYSTEM.md');

/** The token tables a sample entry can sit in, in the order they are reported. */
export const SAMPLE_TOKEN_KEYS = ['colours', 'primitives', 'numbers', 'typography'];

/** The shipped sample, parsed. */
export function readSample() {
  return parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// Sameness — what "still reads exactly as it shipped" means
// ---------------------------------------------------------------------------

const cellsOf = (row) => (row ?? []).map((cell) => String(cell ?? '').trim());

/**
 * Two token rows are the same row when every cell the sample carries matches.
 *
 * Compared over the sample's cells only, so a pre-v0.3.0 Colours table with its
 * extra `notes` cell still recognises an untouched sample row.
 */
function sameRow(sampleRow, row) {
  const mine = cellsOf(row);
  return cellsOf(sampleRow).every((cell, i) => cell.toLowerCase() === (mine[i] ?? '').toLowerCase());
}

/** A spec block without its derived `applied:` line, which `apply` writes, not a person. */
const specText = (component) =>
  (component?.blocks?.find((block) => block.lang === 'yaml')?.content ?? '')
    .split('\n')
    .filter((line) => !/^applied:/.test(line.trim()))
    .join('\n')
    .trim();

/**
 * A component still reads as shipped when its spec does, and it carries nothing
 * the sample did not — a docs block `govern docs` wrote is somebody's work.
 */
function sameComponent(sampleComponent, component) {
  if (specText(sampleComponent) !== specText(component)) return false;
  const langs = (entry) => entry.blocks.map((block) => block.lang).join(',');
  return langs(sampleComponent) === langs(component);
}

// ---------------------------------------------------------------------------
// Where each shipped entry stands in this file
// ---------------------------------------------------------------------------

/**
 * Every shipped entry, with where it stands in `model`:
 *
 *   untouched   the name is there and reads exactly as shipped
 *   changed     the name is there and reads differently — it is yours now
 *   missing     the name is not there
 */
export function sampleStatus(model, sample = readSample()) {
  const entries = [];
  for (const key of SAMPLE_TOKEN_KEYS) {
    const rows = model.tokens[key] ?? [];
    for (const sampleRow of sample.tokens[key] ?? []) {
      const found = rows.find((row) => String(row[0] ?? '').trim() === sampleRow[0]);
      entries.push({
        kind: 'token',
        key,
        name: sampleRow[0],
        row: sampleRow,
        status: !found ? 'missing' : sameRow(sampleRow, found) ? 'untouched' : 'changed',
      });
    }
  }
  for (const sampleComponent of sample.components) {
    const found = model.components.find((component) => component.name === sampleComponent.name);
    entries.push({
      kind: 'component',
      key: 'components',
      name: sampleComponent.name,
      component: sampleComponent,
      status: !found ? 'missing' : sameComponent(sampleComponent, found) ? 'untouched' : 'changed',
    });
  }
  return entries;
}

/** Every value a component's spec names, in properties and states alike. */
function referencedNames(component) {
  const spec = parseSpecBlock(component.blocks.find((block) => block.lang === 'yaml')?.content ?? '');
  const names = new Set(Object.values(spec.properties).map((value) => String(value).trim()));
  for (const state of Object.values(spec.states)) {
    if (state && typeof state === 'object') {
      for (const value of Object.values(state)) names.add(String(value).trim());
    }
  }
  return { names, applied: spec.applied };
}

// ---------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------

/**
 * What `dispose` would remove, and what it keeps and why — worked out before
 * anything is written.
 *
 * Components are decided first, because a token can only go once no component
 * that stays still names it. That covers your own components built on sample
 * tokens, and sample components kept for any reason: removing the token under a
 * component that stays would leave it pointing at nothing.
 */
export function planDispose(model, sample = readSample()) {
  const status = sampleStatus(model, sample);
  const remove = [];
  const changed = status.filter((entry) => entry.status === 'changed');
  const inUse = [];
  const referenced = [];

  const removedComponents = new Set();
  for (const entry of status.filter((e) => e.kind === 'component' && e.status === 'untouched')) {
    const component = model.components.find((c) => c.name === entry.name);
    if (referencedNames(component).applied === true) {
      inUse.push(entry);
      continue;
    }
    removedComponents.add(entry.name);
    remove.push(entry);
  }

  const stillNamed = new Set();
  for (const component of model.components) {
    if (removedComponents.has(component.name)) continue;
    for (const name of referencedNames(component).names) stillNamed.add(name);
  }

  for (const entry of status.filter((e) => e.kind === 'token' && e.status === 'untouched')) {
    if (stillNamed.has(entry.name)) referenced.push(entry);
    else remove.push(entry);
  }

  return { status, remove, changed, inUse, referenced };
}

/** Take the planned entries out of the model. Nothing else moves. */
export function applyDispose(model, plan) {
  const goes = (key, name) => plan.remove.some((entry) => entry.key === key && entry.name === name);
  for (const key of SAMPLE_TOKEN_KEYS) {
    model.tokens[key] = (model.tokens[key] ?? []).filter((row) => !goes(key, String(row[0] ?? '').trim()));
  }
  model.components = model.components.filter((component) => !goes('components', component.name));
  return model;
}

// ---------------------------------------------------------------------------
// restore
// ---------------------------------------------------------------------------

/** What `restore` would add back — the missing entries — and the names it leaves alone. */
export function planRestore(model, sample = readSample()) {
  const status = sampleStatus(model, sample);
  return {
    status,
    add: status.filter((entry) => entry.status === 'missing'),
    changed: status.filter((entry) => entry.status === 'changed'),
  };
}

/**
 * Put the missing entries back, each at the end of its own table or section.
 *
 * A row is written in the file's own column shape, so a Colours table that still
 * carries a legacy `notes` column gets an empty cell there rather than a short row.
 */
export function applyRestore(model, plan) {
  for (const entry of plan.add) {
    if (entry.kind === 'token') {
      model.tokens[entry.key] = model.tokens[entry.key] ?? [];
      model.tokens[entry.key].push([...entry.row]);
    } else {
      model.components.push({
        name: entry.component.name,
        blocks: entry.component.blocks.map((block) => ({ ...block })),
      });
    }
  }
  return model;
}

/** How many entries of each kind a list holds, for the one-line summaries. */
export function countByKind(entries) {
  const tokens = entries.filter((entry) => entry.kind === 'token').length;
  const components = entries.filter((entry) => entry.kind === 'component').length;
  return { tokens, components };
}
