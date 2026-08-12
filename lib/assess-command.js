/**
 * `phyllum assess` — the command surface for the scan (v0.2.0 plan §5.1).
 *
 * This milestone builds the engine's read half, so the command is the engine's
 * report: what Phyllum can see, what it read, and what the codebase actually
 * uses once near-identical values have been clustered together. Turning that
 * inventory into a mapping table and two suggestion tracks is the next step, and
 * the report says so rather than implying the flow is already there.
 *
 * The whole command is mechanical — a scan and a rendering, no model involved and
 * no conversation — which is why it works in a plain terminal with nothing
 * installed. The conversational half arrives with the suggestions.
 *
 * Same shape as every other command here: arguments in, text out. Nothing prints,
 * nothing reads `process`, and nothing writes at all.
 */

import fs from 'node:fs';
import path from 'node:path';

import { assess } from './assess.js';
import { parse } from './design-system.js';
import { renderDetection } from './detect.js';
import { DESIGN_SYSTEM_FILE } from './write.js';

/** The reserved scope words after `assess` (plan §2.2 argument grammar). */
export const ASSESS_SCOPES = ['tokens', 'components', 'update'];

/** The milestone the chained modes land in, named once. */
const CHAINED_MILESTONE = 'M5';

/** How many rows a report shows before it says "and more". */
const PREVIEW = 8;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const isAssessScope = (word) => ASSESS_SCOPES.includes(String(word ?? '').toLowerCase());

/** A recognised scope word that has no flow behind it yet. */
export function renderScopeNotice(word) {
  return (
    `\`assess ${word}\` is a chained mode: the same scan, fast-forwarded into one track.\n` +
    `The chained modes land in ${CHAINED_MILESTONE}. Run \`phyllum assess\` for the scan itself.\n`
  );
}

/** A word that is not a scope at all — the valid ones, rather than an error. */
export function renderInvalidScope(word) {
  return (
    `\`${word}\` is not something \`assess\` takes.\n` +
    `The scope words are ${ASSESS_SCOPES.map((scope) => `\`${scope}\``).join(', ')} — or nothing at all for the full assessment.\n`
  );
}

/** One inventory row as the user reads it: the value, and where it lives. */
export function renderRow(row) {
  const where =
    row.files.length === 0
      ? ''
      : `  ${row.files[0]}${row.files.length > 1 ? ` +${row.files.length - 1} more` : ''}`;
  const kind = row.role ? `${row.pass}, ${row.role}` : row.pass;
  const merged = row.merged
    ? ` (merged ${row.members.slice(1).map((member) => member.value).join(', ')})`
    : '';
  return `    ${row.value}  used ${row.count}×  [${kind}]${where}${merged}`;
}

/** One component candidate as the user reads it. */
export function renderCandidate(candidate) {
  const where = candidate.files.length > 1
    ? `${candidate.files[0]} +${candidate.files.length - 1} more`
    : candidate.files[0];
  return `    ${candidate.name} — \`${candidate.signature}\` used ${candidate.count}× (${where})`;
}

/**
 * The assessment, as a report.
 *
 * Three sections, in the order the pipeline runs, because the order is the
 * explanation: what Phyllum can see, what it read, and what it found.
 */
export function renderAssessment(result) {
  const { detection, values, components, summary } = result;
  const out = ['phyllum assess — read-only', ''];

  out.push(...renderDetection(detection), '');

  out.push('Step 2 — the scan');
  if (values.files === 0) {
    out.push('  Nothing to read here yet — no stylesheets, no markup, no theme files.');
  } else {
    out.push(`  Read ${plural(values.files, 'file')}, read-only. Nothing was written.`);
    if (values.dataFiles > 0) {
      out.push(
        `  ${values.dataFiles} of those ${values.dataFiles === 1 ? 'is' : 'are'} neither a stylesheet nor markup — read for \`property: value\` pairs, because raw styling is not only ever written in CSS.`,
      );
    }
  }
  out.push('');

  out.push('Step 3 — what your codebase uses');
  if (summary.distinctValues === 0) {
    out.push('  No colours, numbers or typography written out as raw values.');
  } else {
    out.push(
      `  ${plural(values.raw, 'raw value')} written out, ${plural(summary.distinctValues, 'distinct value')} once near-identical ones are clustered together.`,
    );
    if (summary.covered > 0) {
      const named = [...new Set(values.covered.map((row) => row.token).filter(Boolean))].slice(
        0,
        PREVIEW,
      );
      out.push(
        `  ${summary.covered} of those ${summary.covered === 1 ? 'is' : 'are'} already named by your design system${named.length > 0 ? `: ${named.join(', ')}` : ''}.`,
      );
    }
    if (summary.proposed === 0) {
      out.push('  Nothing is unnamed — every raw value in here maps to a token you already have.');
    } else {
      out.push(`  ${plural(summary.proposed, 'value')} not named yet, most-used first:`);
      for (const row of values.uncovered.slice(0, PREVIEW)) out.push(renderRow(row));
      if (values.uncovered.length > PREVIEW) {
        out.push(`    …and ${values.uncovered.length - PREVIEW} more.`);
      }
    }
  }
  out.push('');

  out.push('Step 4 — patterns that look like components');
  if (!components.ran) {
    out.push(`  Not run — ${components.reason}.`);
  } else if (components.candidates.length === 0) {
    out.push('  Nothing repeated often enough to look like a component your system is missing.');
  } else {
    out.push(
      `  ${plural(components.candidates.length, 'pattern')} your code repeats and your design system has never been told about:`,
    );
    for (const candidate of components.candidates.slice(0, PREVIEW)) {
      out.push(renderCandidate(candidate));
    }
    if (components.candidates.length > PREVIEW) {
      out.push(`    …and ${components.candidates.length - PREVIEW} more.`);
    }
  }
  out.push('');

  out.push(
    'Nothing was written, and nothing in your codebase was changed — `assess` reads your code, only `apply` ever writes it.',
  );
  out.push(
    `Naming these and writing the ones you accept into ${DESIGN_SYSTEM_FILE} is the suggestion half, and lands in M4.`,
  );
  return out;
}

/**
 * Run `assess`.
 *
 * ctx: { cwd }
 * There is no `ask` and no `confirm` here on purpose: a scan has nothing to ask
 * about and nothing to accept. The review loop arrives with the suggestions.
 */
export async function runAssess(args, ctx = {}) {
  const root = ctx.cwd;

  const word = args.length > 0 ? String(args[0]?.value ?? args[0] ?? '') : '';
  if (word !== '') {
    if (isAssessScope(word)) return { out: renderScopeNotice(word.toLowerCase()), code: 0 };
    return { out: renderInvalidScope(word), code: 0 };
  }

  const model = parse(fs.readFileSync(path.join(root, DESIGN_SYSTEM_FILE), 'utf8'));
  const result = assess(root, model, ctx.scanOptions ?? {});
  return { out: `${renderAssessment(result).join('\n')}\n`, code: 0, assessment: result };
}
