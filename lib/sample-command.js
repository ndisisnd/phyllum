/**
 * `phyllum sample` — show, dispose of, or restore the sample design system.
 *
 * Three words, one file:
 *
 *   sample            where each shipped entry stands in this file; writes nothing
 *   sample dispose    remove the entries still identical to the shipped sample
 *   sample restore    add back the shipped entries whose names are not here
 *
 * Both writes go through the one funnel, after the acceptance gate, as a
 * re-render of the model — the same write `create` and `tokenise` make.
 *
 * The two gates are answered differently on purpose. `restore` only adds, so
 * `--yes` answers it the way it answers every other gate that adds. `dispose`
 * takes lines out of the file, and a gate that removes content is only ever
 * answered by a person — the rule `init`'s legacy-column offer and `upgrade`'s
 * prune already keep. What it removes is shipped content nobody edited, and
 * `restore` puts all of it back, but the rule does not bend for a safe removal.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parse, render } from './design-system.js';
import { applyDispose, applyRestore, countByKind, planDispose, planRestore, sampleStatus } from './sample.js';
import { DESIGN_SYSTEM_FILE, writeDesignSystem } from './write.js';

/** The chain words `sample` reserves in argument position. */
export const SAMPLE_WORDS = ['dispose', 'restore'];

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** "12 tokens and 3 components", leaving out a kind there are none of. */
function summarise(entries) {
  const { tokens, components } = countByKind(entries);
  const parts = [];
  if (tokens > 0) parts.push(plural(tokens, 'token'));
  if (components > 0) parts.push(plural(components, 'component'));
  return parts.length > 0 ? parts.join(' and ') : 'nothing';
}

const TABLE_LABEL = {
  colours: 'Colours',
  primitives: 'Primitives',
  numbers: 'Numbers',
  typography: 'Typography',
  components: 'Components',
};

/** One line per table: the names in it, in the order the sample ships them. */
function listByTable(entries, indent = '    ') {
  const lines = [];
  for (const key of Object.keys(TABLE_LABEL)) {
    const names = entries.filter((entry) => entry.key === key).map((entry) => entry.name);
    if (names.length > 0) lines.push(`${indent}${TABLE_LABEL[key]}: ${names.join(', ')}`);
  }
  return lines;
}

export function renderUsage() {
  return [
    '`sample` works with the sample design system Phyllum ships:',
    '  sample            show which sample entries this file holds',
    '  sample dispose    remove the sample entries nobody has changed',
    '  sample restore    add back the sample entries this file is missing',
    '',
    `It edits ${DESIGN_SYSTEM_FILE} and nothing else.`,
  ].join('\n');
}

/** Bare `sample`: where each shipped entry stands. Read-only. */
function renderStatus(status) {
  const untouched = status.filter((entry) => entry.status === 'untouched');
  const changed = status.filter((entry) => entry.status === 'changed');
  const missing = status.filter((entry) => entry.status === 'missing');
  const lines = [`The sample design system ships ${summarise(status)}. In ${DESIGN_SYSTEM_FILE}:`];
  lines.push(`  ${summarise(untouched)} as shipped`);
  if (changed.length > 0) {
    lines.push(`  ${summarise(changed)} changed since — these are yours now:`, ...listByTable(changed));
  }
  lines.push(`  ${summarise(missing)} not here`);
  lines.push('');
  if (untouched.length > 0) lines.push('`phyllum sample dispose` removes the entries still as shipped.');
  if (missing.length > 0) lines.push('`phyllum sample restore` adds back the ones that are not here.');
  return lines;
}

/**
 * Run `sample`.
 *
 * ctx: { cwd, yes, confirm }
 *   confirm(question)  the acceptance gate; without it nothing is written
 *   yes                answers `restore`'s gate, never `dispose`'s
 */
export async function runSample(args = [], ctx = {}) {
  const root = ctx.cwd;
  const text = fs.readFileSync(path.join(root, DESIGN_SYSTEM_FILE), 'utf8');
  const model = parse(text);

  const word = args.length > 0 ? String(args[0]?.value ?? args[0] ?? '').toLowerCase() : '';
  if (word === '') return { out: `${renderStatus(sampleStatus(model)).join('\n')}\n`, code: 0 };
  if (word === 'dispose') return dispose(root, model, ctx);
  if (word === 'restore') return restore(root, model, ctx);
  return { out: `\`${args[0]?.value ?? args[0]}\` is not a \`sample\` word.\n\n${renderUsage()}\n`, code: 0 };
}

async function dispose(root, model, ctx) {
  const plan = planDispose(model);
  const out = [];

  if (plan.remove.length === 0) {
    out.push(`No sample entry in ${DESIGN_SYSTEM_FILE} is still as shipped, so there is nothing to dispose of.`);
  } else {
    out.push(`Disposing of the sample removes ${summarise(plan.remove)} from ${DESIGN_SYSTEM_FILE}:`);
    out.push(...listByTable(plan.remove, '  '));
  }
  if (plan.changed.length > 0) {
    out.push(`Kept, because you changed ${plan.changed.length === 1 ? 'it' : 'them'}:`, ...listByTable(plan.changed, '  '));
  }
  if (plan.referenced.length > 0) {
    out.push('Kept, because a component that stays still names it:', ...listByTable(plan.referenced, '  '));
  }
  if (plan.inUse.length > 0) {
    out.push('Kept, because its spec records `applied: true` — the codebase uses it:', ...listByTable(plan.inUse, '  '));
  }
  out.push('');
  if (plan.remove.length === 0) return { out: `${out.join('\n')}\n`, code: 0 };

  // The removal gate. `ctx.yes` is deliberately not read: a person answers it.
  if (typeof ctx.confirm !== 'function') {
    out.push('Removing content needs a yes from a person, and nobody is here to ask. Nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }
  const accepted = await ctx.confirm(`Remove ${summarise(plan.remove)} of sample content?`);
  if (!accepted) {
    out.push('Not accepted, so nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }

  writeDesignSystem(root, render(applyDispose(model, plan)));
  out.push(`Disposed of ${summarise(plan.remove)}. \`phyllum sample restore\` puts ${plan.remove.length === 1 ? 'it' : 'them'} back.`, '');
  return { out: out.join('\n'), code: 0 };
}

async function restore(root, model, ctx) {
  const plan = planRestore(model);
  const out = [];

  if (plan.add.length === 0) {
    out.push(`Every sample entry is already in ${DESIGN_SYSTEM_FILE}, so there is nothing to restore.`);
  } else {
    out.push(`Restoring the sample adds ${summarise(plan.add)} to ${DESIGN_SYSTEM_FILE}:`);
    out.push(...listByTable(plan.add, '  '));
  }
  if (plan.changed.length > 0) {
    out.push('Left as they are, because the name is already yours:', ...listByTable(plan.changed, '  '));
  }
  out.push('');
  if (plan.add.length === 0) return { out: `${out.join('\n')}\n`, code: 0 };

  const accepted = ctx.yes
    ? true
    : typeof ctx.confirm === 'function'
      ? await ctx.confirm(`Add ${summarise(plan.add)} of sample content?`)
      : false;
  if (!accepted) {
    out.push('Not accepted, so nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }

  writeDesignSystem(root, render(applyRestore(model, plan)));
  out.push(`Restored ${summarise(plan.add)}. \`phyllum sample dispose\` removes ${plan.add.length === 1 ? 'it' : 'them'} again.`, '');
  return { out: out.join('\n'), code: 0 };
}
