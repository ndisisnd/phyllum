/**
 * `system` (plan §6): a formatted read of DESIGN-SYSTEM.md, and nothing else.
 *
 * It keeps no state of its own and writes nothing, so what it prints is always
 * true of the source file. The scope word narrows the listing; `all` and the
 * bare command are the same call, so their output is byte-for-byte identical.
 */

import { APPLIED_WORDS } from './applied.js';
import { parseSpecBlock } from './create.js';
import { SCOPES } from './registry.js';
import { TOKEN_SECTIONS, parse } from './design-system.js';
import { readingsOf, renderBlock } from './typography.js';

export function isScope(word) {
  return SCOPES.includes(String(word).toLowerCase());
}

export function renderInvalidScope(word, commandName = 'system') {
  return (
    `"${word}" is not a scope Phyllum knows.\n` +
    `Valid scopes for \`phyllum ${commandName}\`: ${SCOPES.join(', ')} (default: all).\n`
  );
}

function pad(rows) {
  if (rows.length === 0) return [];
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, String(cell ?? '').length);
    });
  }
  return rows.map((row) =>
    row
      .map((cell, i) => String(cell ?? '').padEnd(i === row.length - 1 ? 0 : widths[i]))
      .join('  ')
      .trimEnd(),
  );
}

/**
 * The optional readings one typography row's block holds, indented one step
 * further than the row itself (v0.7.3 phase 6).
 *
 * `renderBlock` is the exact renderer `codegen.js` and `update-command.js`
 * already write a block back out with, in the contract table's own order —
 * reused rather than restated so `display`, `system` and a hand-read of
 * DESIGN-SYSTEM.md never disagree on what one line means. A token with no
 * optional readings, or a block this reader could not read, renders nothing:
 * "say nothing" is what "holds none" looks like here too.
 */
function renderTypographyReadings(model, token) {
  const block = renderBlock(readingsOf(model, token));
  return block === '' ? [] : block.split('\n');
}

function renderTokens(model) {
  const lines = ['Tokens'];
  for (const section of TOKEN_SECTIONS) {
    const rows = model.tokens[section.key] ?? [];
    const label = section.heading.replace('### ', '');
    lines.push(`  ${label} (${rows.length})`);
    if (rows.length === 0) {
      lines.push('    (none yet)');
    } else if (section.key === 'typography') {
      const padded = pad(rows);
      rows.forEach((row, index) => {
        lines.push(`    ${padded[index]}`);
        for (const line of renderTypographyReadings(model, (row[0] ?? '').toString().trim())) {
          lines.push(`      ${line}`);
        }
      });
    } else {
      for (const line of pad(rows)) lines.push(`    ${line}`);
    }
    // Primitives are rows of the Colours section (v0.3.0 §5.3), so they are
    // listed with it — under their own label, because a ramp is a different kind
    // of thing from a semantic token and reading them as one list helps nobody.
    if (section.key === 'colours' && (model.tokens.primitives ?? []).length > 0) {
      lines.push(`    Primitives (${model.tokens.primitives.length})`);
      for (const line of pad(model.tokens.primitives)) lines.push(`      ${line}`);
    }
  }
  return lines;
}

function renderComponents(model) {
  const lines = [`Components (${model.components.length})`];
  if (model.components.length === 0) {
    lines.push('  (none yet — run `phyllum create` to add one)');
    return lines;
  }
  for (const component of model.components) {
    const spec = component.blocks.find((b) => b.lang === 'yaml');
    // The adoption reading, when there is one (v0.5.0 §3.4). No flag means
    // `apply` has never run here, and the listing says nothing rather than
    // guessing at "not applied" — silence is the honest reading of absence.
    const applied = spec ? parseSpecBlock(spec.content).applied : null;
    const reading = applied === null ? '' : ` — ${APPLIED_WORDS[String(applied)]}`;
    lines.push(`  ${component.name}${reading}`);
    if (spec) {
      for (const line of spec.content.split('\n')) lines.push(`    ${line}`);
    } else {
      lines.push('    (no spec block)');
    }
    for (const block of component.blocks) {
      if (block === spec) continue;
      const count = block.content.split('\n').length;
      const lang = block.lang || 'code';
      lines.push(`    [${lang} block: ${count} lines — see DESIGN-SYSTEM.md]`);
    }
  }
  return lines;
}

function renderBacklog(model) {
  const lines = [`Backlog (${model.backlog.length})`];
  if (model.backlog.length === 0) {
    lines.push('  (nothing outstanding)');
    return lines;
  }
  for (const item of model.backlog) lines.push(`  - ${item}`);
  return lines;
}

/** Render the listing for a parsed model at the given scope. */
export function renderSystem(text, scope = 'all') {
  const model = parse(text);
  const lines = [`Design System — ${model.header.project || 'unnamed project'}`];
  lines.push('(read from DESIGN-SYSTEM.md — Phyllum keeps no state of its own)');
  lines.push('');

  if (scope === 'tokens') {
    lines.push(...renderTokens(model));
  } else if (scope === 'components') {
    lines.push(...renderComponents(model));
  } else {
    lines.push(...renderTokens(model));
    lines.push('');
    lines.push(...renderComponents(model));
    lines.push('');
    lines.push(...renderBacklog(model));
  }

  return `${lines.join('\n')}\n`;
}
