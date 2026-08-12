/**
 * `phyllum assess` — the command surface (v0.2.0 plan §5.1).
 *
 * The pipeline is five steps, and the command is the pipeline read out loud:
 * what Phyllum can see, what it read, what the codebase actually uses, the map of
 * it, and what it suggests you do about it. The order is the explanation.
 *
 * Steps 1–4 are **mechanical**. A scan and a rendering: no model, no
 * conversation, nothing to accept — which is why the whole assessment, up to and
 * including the mapping table with its proposed names in it, works in a plain
 * terminal with nothing installed. That is the split this command is built
 * around, and it is why the report is useful before anybody says yes to anything.
 *
 * Step 5 is the half that talks: the token review and the component pick are
 * conversations, so they run when a `ask`/`confirm` pair is attached (the
 * interactive session, or the skill inside Claude Code) and are previewed rather
 * than pretended at when one is not. The tracks themselves live in
 * `lib/assess-suggest.js`, because they write and this file must not: every module
 * on the scan path is checked for write calls, and that check is the trust a
 * command that reads your code has to earn.
 *
 * Same shape as every other command here: arguments in, text out. Nothing prints
 * and nothing reads `process`.
 */

import fs from 'node:fs';
import path from 'node:path';

import { assess } from './assess.js';
import { renderCandidate, renderMap } from './assess-map.js';
import { runComponentTrack, runTokenTrack } from './assess-suggest.js';
import {
  intelligenceRoute,
  renderSessionNotice,
  renderShellOutNotice,
} from './claude-cli.js';
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

export { renderCandidate };

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

/**
 * The assessment, as a report: steps 1 to 4, and not one word about a model.
 *
 * Everything here is derived from the scan result and formatted, so this function
 * is the definition of the mechanical half — a terminal with nothing installed
 * gets the whole of it, table and proposed names included.
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
      out.push(`  ${plural(summary.proposed, 'value')} not named yet, most-used first in the map below.`);
    }
    if (summary.unreadable > 0) {
      out.push(
        `  ${plural(summary.unreadable, 'value')} plainly a colour or a length but written on a property no table names — seen, not read, and asked about rather than guessed at.`,
      );
    }
  }
  out.push('');

  out.push('Step 4 — the map: what is used, where, what it means, what covers it');
  out.push(...renderMap(result));
  out.push('');

  out.push('  Patterns that look like components');
  if (!components.ran) {
    out.push(`  Not run — ${components.reason}.`);
  } else if (components.candidates.length === 0) {
    out.push('  Nothing repeated often enough to look like a component your system is missing.');
  } else {
    out.push(
      `  ${plural(components.candidates.length, 'pattern')} your code repeats and your design system has never been told about:`,
    );
    for (const candidate of components.candidates.slice(0, PREVIEW)) {
      out.push(`  ${renderCandidate(candidate)}`);
    }
    if (components.candidates.length > PREVIEW) {
      out.push(`    …and ${components.candidates.length - PREVIEW} more.`);
    }
  }
  return out;
}

/**
 * The closing promise, told straight.
 *
 * `assess` writes `DESIGN-SYSTEM.md` and nothing else, and only when something was
 * accepted — so when nothing was, the report says nothing was written, and when
 * something was, it does not pretend otherwise. Either way the codebase is
 * untouched, because writing code belongs to `apply` alone.
 */
export function renderPromise({ written = 0 } = {}) {
  const nothing = written === 0 ? 'Nothing was written, and nothing' : 'Nothing';
  return `${nothing} in your codebase was changed — \`assess\` reads your code, only \`apply\` ever writes it.`;
}

/**
 * How the review would be reached from here, when it was not reached this run.
 *
 * Deliberately silent when there is no route to a model: the assessment above
 * needed none, and a command that just did its whole mechanical job should not
 * close with an install pitch. What it does say is where the conversation lives.
 */
function routeNotice(ctx) {
  const route = intelligenceRoute(ctx.env ?? process.env);
  if (route === 'session') return renderSessionNotice('assess').trimEnd();
  if (route === 'shell-out') return renderShellOutNotice('assess').trimEnd();
  return 'The review is a conversation: run `assess` inside a `phyllum` session to walk it one value at a time.';
}

/**
 * Load the design system and assess the project — one scan, whoever asked for it.
 *
 * This is the seam the chained modes are built on: `assess tokens`,
 * `assess components` and `assess update` are the same scan read three ways, so
 * they call this once and then pick the tracks they want.
 */
export function loadAssessment(ctx = {}) {
  const root = ctx.cwd;
  const model = parse(fs.readFileSync(path.join(root, DESIGN_SYSTEM_FILE), 'utf8'));
  return { root, model, result: assess(root, model, ctx.scanOptions ?? {}) };
}

/**
 * Run the assessment and walk the tracks asked for.
 *
 * `tracks` is what makes the chained modes a wiring job rather than a second
 * implementation: `['tokens']` is `assess tokens`, `['components']` is
 * `assess components`, and a ctx whose `ask`/`confirm` answer for the user is
 * `assess update`. Nothing about the flow changes; only who answers.
 */
export async function runAssessment(ctx = {}, { tracks = ['tokens', 'components'] } = {}) {
  const { root, model, result } = loadAssessment(ctx);
  const out = renderAssessment(result);
  const walked = [];
  let written = 0;

  out.push('', 'Step 5 — suggestions');
  if (tracks.includes('tokens')) {
    const track = await runTokenTrack(root, { result, model, ctx });
    out.push('', ...track.lines);
    written += track.written?.length ?? 0;
    walked.push(track);
  }
  if (tracks.includes('components')) {
    const track = await runComponentTrack(root, { result, model, ctx });
    out.push('', ...track.lines);
    written += track.written ?? 0;
    walked.push(track);
  }

  out.push('', renderPromise({ written }));
  if (walked.some((track) => track.needsConversation)) out.push(routeNotice(ctx));

  return { out: `${out.join('\n')}\n`, code: 0, assessment: result, tracks: walked };
}

/**
 * Run `assess`.
 *
 * ctx: { cwd, env, ask, confirm, today }
 *   ask(question, suggestions)  the review loop: one value at a time, and the
 *                               question about a value that could not be read
 *   confirm(question)           the acceptance gate; without it nothing is
 *                               written, because nothing was accepted
 *
 * Without either, the assessment still runs in full and the suggestions are
 * previewed — the scan and the map never needed a model.
 */
export async function runAssess(args, ctx = {}) {
  const word = args.length > 0 ? String(args[0]?.value ?? args[0] ?? '') : '';
  if (word !== '') {
    if (isAssessScope(word)) return { out: renderScopeNotice(word.toLowerCase()), code: 0 };
    return { out: renderInvalidScope(word), code: 0 };
  }

  return runAssessment(ctx);
}
