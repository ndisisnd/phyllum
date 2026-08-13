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

import { WARN, assess } from './assess.js';
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

/** How many rows a report shows before it says "and more". */
const PREVIEW = 8;

/**
 * How many components one `assess components` run will walk before it stops.
 *
 * The focused mode loops, so it needs an end even if every pick is accepted: a
 * bound on the loop is how a fast-forward stays a session rather than a shift.
 */
const MAX_COMPONENT_ROUNDS = 20;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const isAssessScope = (word) => ASSESS_SCOPES.includes(String(word ?? '').toLowerCase());

export { renderCandidate };

/** A word that is not a scope at all — the valid ones, rather than an error. */
export function renderInvalidScope(word) {
  return (
    `\`${word}\` is not something \`assess\` takes.\n` +
    `The scope words are ${ASSESS_SCOPES.map((scope) => `\`${scope}\``).join(', ')} — or nothing at all for the full assessment.\n`
  );
}

/**
 * How the findings break down — how much is drift, how much looks deliberate.
 *
 * Two sentences at most, and neither is printed when there is nothing to say.
 * The point of the split is to make the report actionable rather than long: a
 * user who fixes the errors has fixed the systematic problem, and the warnings
 * are there to be read rather than to be worked through.
 */
export function renderSeverities(summary) {
  const { errors = 0, warnings = 0, byRule = {} } = summary;
  if (errors === 0 && warnings === 0) return [];

  const out = [];
  if (errors > 0) {
    // Named by family, because "four colours and a radius" is a different
    // afternoon's work from "nine shadows".
    const families = Object.entries(byRule)
      .filter(([rule]) => rule !== 'unread')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rule, count]) => `${rule} ×${count}`);
    out.push(
      `  ${plural(errors, 'finding')} used three times or more — systematic drift, and the tokens worth naming first${families.length > 0 ? ` (${families.join(', ')})` : ''}.`,
    );
  }
  if (warnings > 0) {
    out.push(
      `  ${plural(warnings, 'finding')} used only once or twice — reported as a likely exception, never accepted on your behalf.`,
    );
  }
  return out;
}

/**
 * Hygiene, as the report reads it (v0.2.1 §6).
 *
 * Two facts about the project rather than about any value in it: what collides,
 * and what the design system holds that nothing seems to use. Both are warnings,
 * so the section is written to be read and not worked through — the evidence is
 * on the line beneath each finding, and the caveat is printed once, next to the
 * only findings it applies to.
 *
 * Silence is a result here, not an omission: a project with nothing colliding
 * and nothing stale is told so in one line, because "no findings" printed is the
 * difference between a check that passed and a check that never ran.
 */
export function renderHygiene(result) {
  const { hygiene } = result;
  if (!hygiene) return [];

  const out = ['  Hygiene — what collides, and what nothing uses'];
  const { collisions, unused } = hygiene;

  if (collisions.length === 0) {
    out.push('  Nothing collides — one framework, one styling system, one theme source.');
  }
  for (const collision of collisions) {
    out.push(`  ${collision.value} — ${collision.detail}.`);
    if (collision.evidence.length > 0) out.push(`    seen in: ${collision.evidence.join(', ')}`);
  }

  const stale = [...unused.tokens, ...unused.components];
  if (stale.length === 0 && unused.componentsChecked) {
    out.push('  Everything your design system holds was seen in the code.');
  } else if (stale.length === 0) {
    out.push('  Every token your design system holds was seen in the code.');
  } else {
    for (const row of stale.slice(0, PREVIEW)) {
      const kind = row.rule === 'unused-token' ? 'token' : 'component';
      out.push(`  ${row.value} — a ${kind} nothing the scan read mentions.`);
    }
    if (stale.length > PREVIEW) out.push(`    …and ${stale.length - PREVIEW} more.`);
    // The caveat is a line of the report, not a footnote in a document nobody
    // opens: this is the finding somebody could act on by deleting something.
    out.push(
      `  Not seen is not the same as unused — ${hygiene.caveat}. Nothing is ever removed for you.`,
    );
  }

  if (!unused.componentsChecked) {
    out.push(`  Components were not checked — ${unused.componentsReason}.`);
  }
  return out;
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
    out.push(...renderSeverities(summary));
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

  const hygiene = renderHygiene(result);
  if (hygiene.length > 0) out.push('', ...hygiene);
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

// ---------------------------------------------------------------------------
// `assess update` — the fast-forward, and the two things it will not answer
// ---------------------------------------------------------------------------

/** The answer grammar's word for "yes, that name is right" (`refs/tokenise.md`). */
const AUTO_ACCEPT = 'y';

/** And its word for "leave it". */
const AUTO_SKIP = 'skip';

/**
 * What `assess update` answers, and what it refuses to.
 *
 * The rule is one sentence: a question whose answer is already on the page gets
 * answered, and a question whose answer is only in your head gets skipped. A
 * proposed token name is on the page — the name was derived mechanically from the
 * value and the naming scales, so accepting it adds nothing a review would have
 * added. A role Phyllum could not read is not on the page, and neither is a
 * component contract, so both are left alone.
 *
 * Questions are told apart by the suggestions they offer rather than by their
 * wording, and anything unrecognised is skipped. That default is the important
 * half: a question this function has never seen can only ever be declined, so a
 * later flow cannot be auto-accepted into by accident.
 *
 * `severity` is the one fact a suggestion list cannot carry, because it is not
 * about the question — it is about the whole codebase, and only the engine that
 * counted it knows it. The track hands it over explicitly for that reason.
 */
export function autoAnswer(suggestions = [], { severity = null } = {}) {
  const offered = new Set((suggestions ?? []).map((item) => item?.action ?? item?.source ?? ''));
  // A role question, or a component pick: both are answers only you have.
  if (offered.has('role') || offered.has('candidate')) return AUTO_SKIP;
  // A `warn` finding is a suspected exception (v0.2.1 §3.2). The name is still
  // on the page, but whether the value deserves a token at all is not — the
  // codebase says it was written once or twice, which is what a deliberate
  // one-off looks like. So this is the third thing the fast-forward declines,
  // and it declines it for the same reason as the other two.
  if (severity === WARN) return AUTO_SKIP;
  // The token review: confirm-or-skip over a name that was already derived.
  if (offered.has('confirm') && offered.has('skip')) return AUTO_ACCEPT;
  return AUTO_SKIP;
}

/**
 * The ctx `assess update` runs on: the same flow, with the answers supplied.
 *
 * This is deliberately a wrapper and not a mode flag threaded through the tracks.
 * `assess update` is not a second review that happens to be quiet — it is the
 * review with a caller who answers, which is why the write path, the acceptance
 * gate and the refusals underneath it are the ones the interactive run uses.
 */
export function autoContext(ctx = {}) {
  return {
    ...ctx,
    ask: async (_question, suggestions = [], meta = {}) => autoAnswer(suggestions, meta),
    confirm: async () => true,
  };
}

/** What `assess update` says about the answers it gave on your behalf. */
export function renderUpdateNotice() {
  return [
    '`assess update` answered step 5 for you:',
    '  Accepted — every proposed token used three times or more, under the name in the map above, and the one write to DESIGN-SYSTEM.md.',
    '  Skipped — any value used only once or twice, because that is what a deliberate exception looks like and only you can say whether it is one.',
    '  Skipped — any value seen but not read, because its role is unknown and Phyllum does not guess one.',
    '  Skipped — recording a component, because that is `create`’s conversation and its questions have answers only you have.',
    '  Run `phyllum assess` (or `assess components`) to walk the skipped ones one at a time.',
  ];
}

// ---------------------------------------------------------------------------
// The tracks, walked
// ---------------------------------------------------------------------------

/**
 * Walk the component track — once for bare `assess`, repeatedly for the focused
 * `assess components`.
 *
 * The orchestrator's decision, stated where the code makes it: a full assessment
 * records **one** component, because an assessment that turned into five queued
 * `create` conversations would stop being an assessment. `assess components` is
 * the mode you chose on purpose, so it loops — one candidate at a time, each with
 * its own pick and its own acceptance gate, and it stops the moment a round
 * records nothing (a skip, an exit, or a pick that matched nothing on the list).
 *
 * Each round re-reads the same scan result with the recorded candidates removed.
 * Nothing rescans, and nothing is offered twice.
 */
async function walkComponents(root, { result, model, ctx, loop }) {
  const first = await runComponentTrack(root, { result, model, ctx, looping: loop });
  const walked = [first];
  const lines = [...first.lines];
  if (!loop) return { walked, lines };

  let remaining = result.components.candidates.filter((candidate) => candidate !== first.created);
  let recorded = first.created;
  let rounds = 1;

  while (recorded && remaining.length > 0 && rounds < MAX_COMPONENT_ROUNDS) {
    const view = { ...result, components: { ...result.components, candidates: remaining } };
    const next = await runComponentTrack(root, {
      result: view,
      model,
      ctx,
      looping: remaining.length > 1,
    });
    walked.push(next);
    // The "Components" header belongs to the section, not to each round.
    lines.push('', ...next.lines.slice(1));
    recorded = next.created;
    remaining = remaining.filter((candidate) => candidate !== next.created);
    rounds += 1;
  }

  if (recorded && remaining.length > 0) {
    lines.push(
      `  ${plural(remaining.length, 'pattern')} left for the next run — ${MAX_COMPONENT_ROUNDS} components in one sitting is enough.`,
    );
  }
  return { walked, lines };
}

/**
 * Run the assessment and walk the tracks asked for.
 *
 * `tracks` is what makes the chained modes a wiring job rather than a second
 * implementation: `['tokens']` is `assess tokens`, `['components']` is
 * `assess components`, and a ctx whose `ask`/`confirm` answer for the user is
 * `assess update`. Nothing about the flow changes; only who answers.
 *
 * `loop` is the focused component mode; `mode` only labels the report.
 */
export async function runAssessment(
  ctx = {},
  { tracks = ['tokens', 'components'], loop = false, mode = null } = {},
) {
  const { root, model, result } = loadAssessment(ctx);
  const out = renderAssessment(result);
  const walked = [];
  let written = 0;

  out.push('', 'Step 5 — suggestions');
  if (mode === 'update') out.push('', ...renderUpdateNotice());
  if (tracks.includes('tokens')) {
    const track = await runTokenTrack(root, { result, model, ctx });
    out.push('', ...track.lines);
    written += track.written?.length ?? 0;
    walked.push(track);
  }
  if (tracks.includes('components')) {
    const components = await walkComponents(root, { result, model, ctx, loop });
    out.push('', ...components.lines);
    for (const track of components.walked) written += track.written ?? 0;
    walked.push(...components.walked);
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
 *
 * The four modes are one scan read four ways (plan §5.2):
 *
 *   assess             scan, map, both tracks; one component per run
 *   assess tokens      scan, map, the token review only
 *   assess components  scan, map, the component picks — looped, one at a time
 *   assess update      scan, map, and the answers supplied: tokens accepted as
 *                      proposed, anything that would be a guess skipped
 */
export async function runAssess(args, ctx = {}) {
  const word = args.length > 0 ? String(args[0]?.value ?? args[0] ?? '') : '';
  const scope = word.toLowerCase();
  if (word !== '' && !isAssessScope(scope)) return { out: renderInvalidScope(word), code: 0 };

  if (scope === 'tokens') return runAssessment(ctx, { tracks: ['tokens'] });
  if (scope === 'components') return runAssessment(ctx, { tracks: ['components'], loop: true });
  if (scope === 'update') return runAssessment(autoContext(ctx), { mode: 'update' });
  return runAssessment(ctx);
}
