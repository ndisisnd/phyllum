/**
 * `phyllum create` — the command flow (plan §3, §8.5).
 *
 * This is the part of `create` that talks to a person: it turns an input into a
 * draft, shows the spec and the code, walks the gaps, and — only on an explicit
 * acceptance — writes. It keeps the M1 shape: no printing, no reading of
 * `process`, just tokens in and text out, so the assertion suite can drive every
 * branch without spawning anything.
 *
 * Three doors into the same room (plan §3.1):
 *
 *   prose  a quoted description
 *   image  a path to an image file, traced
 *   pick   nothing at all: archetypes + candidates
 *
 * They differ only in how the first draft comes to exist. After that it is one
 * follow-up loop, one review, one acceptance gate — and the same rule governs
 * all of it: nothing reaches DESIGN-SYSTEM.md before the user accepts. The draft
 * lives in `.phyllum/session.json` until then.
 *
 * One mode is not a door into that room at all: `create primitives` (v0.3.0 §5)
 * writes colour ramps rather than a component, and it is wholly mechanical —
 * shipped constants and arithmetic, no model in its path. It shares the two
 * things that matter: the consent gate and the one write funnel.
 */

import fs from 'node:fs';
import path from 'node:path';

import { archetypes, contractFor, slotForProperty } from './archetypes.js';
import {
  addProperty,
  extractDraft,
  gapsFor,
  gatherEvidence,
  isCustom,
  renderSpecBlock,
  resolveTokens,
  seedFromExisting,
  skipSlot,
  suggestionsFor,
  tokenNamesOf,
  upsertComponent,
  answerGap,
} from './create.js';
import {
  ingestTrace,
  looksLikeImagePath,
  mergeTraceGaps,
  renderTraceSummary,
  traceRequest,
  validateImage,
} from './trace.js';
import {
  addPrimitives,
  askable,
  isYes,
  primitiveOffers,
  questionFor as primitiveQuestionFor,
  walkPrimitives,
} from './primitives.js';
import { pickList, renderPicker, resolvePick, seedFromPick } from './candidates.js';
import { renderCodeBlocks } from './codegen.js';
import { parse, render } from './design-system.js';
import { detectProject } from './detect.js';
import { advance, readState, saveDraft, writeState } from './state.js';
import { writeDesignSystem } from './write.js';
import {
  intelligenceRoute,
  renderNoIntelligenceNotice,
  renderSessionNotice,
  renderShellOutNotice,
} from './claude-cli.js';

const indent = (text, prefix = '  ') =>
  String(text)
    .split('\n')
    .map((line) => (line === '' ? '' : `${prefix}${line}`))
    .join('\n');

function renderUnknownArchetype(prose) {
  const names = archetypes().map((archetype) => archetype.name).join(', ');
  return (
    `I could not tell which kind of component "${prose}" describes, and Phyllum does not guess.\n` +
    `Name one of these archetypes and run it again: ${names}.\n` +
    'Example: `phyllum create "button primary with 12px padding-top"`.\n' +
    'Or run `phyllum create` and pick **custom** — a component that follows no archetype\n' +
    'contract, and records exactly the slots you describe.\n'
  );
}

/** The question a description matching no archetype is answered with (§6.7). */
function customOfferFor(prose) {
  return (
    `Nothing in "${prose}" names a kind of component I have a contract for, and the ` +
    'nearest fit is not an answer. Record it as a **custom** component instead — no ' +
    'mandatory slots, exactly what you describe? Type a name for it (e.g. `Hero/Landing`), ' +
    'or `no` to stop.'
  );
}

const isNo = (answer) =>
  /^(no|n|nope|skip|stop|cancel|exit|quit)$/i.test(String(answer ?? '').trim());

/** The open-ended loop a custom is built through — no contract, so no checklist. */
async function askCustomSlots(root, draft, { ctx, model, limit = 40 }) {
  if (typeof ctx.ask !== 'function') return draft;

  for (let asked = 0; asked < limit; asked += 1) {
    const answer = String(
      await ctx.ask(
        'Name a slot and its value (e.g. `background #2563EB`), or `done` when this component is complete.',
        [],
      ) ?? '',
    ).trim();
    if (answer === '' || /^(done|finish|finished|that.s it)$/i.test(answer)) break;

    const [key, ...rest] = answer.split(/\s+/);
    const property = key.replace(/:$/, '');
    const value = rest.join(' ').trim();

    // A slot named without a value is a question, never a guess (§6.7). Skipping
    // the question records the honest `TODO`, exactly as a contract slot would.
    if (value === '') {
      const followUp = String(
        await ctx.ask(`What is the ${property}? (or "skip")`, suggestionsFor(
          { slot: slotForProperty(property), property, archetype: null },
          { model, evidence: [], archetype: null },
        )) ?? '',
      ).trim();
      if (followUp === '' || /^skip$/i.test(followUp)) skipSlot(draft, property);
      else addProperty(draft, { key: property, value: followUp, origin: 'answer' });
    } else {
      addProperty(draft, { key: property, value, origin: 'answer' });
    }
    saveDraft(root, draft);
  }
  return draft;
}

/** One line per gap, leading with the suggestion the plan says leads. */
function renderGapLines(gaps, context) {
  const lines = [];
  for (const gap of gaps) {
    const label = gap.kind === 'state' ? `${gap.slot} state` : gap.slot;
    const note = noteFor(gap);
    const [first] = suggestionsFor(gap, context);
    lines.push(`  - ${label}${note}`);
    if (first) lines.push(`      ${first.text}`);
  }
  return lines;
}

function noteFor(gap) {
  if (gap.kind === 'extrapolated') return ' (every component of this kind defines it)';
  if (gap.kind === 'traced-low-confidence') {
    return ` (the image reads about ${gap.reading}, confidence ${gap.confidence} — under the bar)`;
  }
  if (gap.kind === 'traced-unmeasurable') return ' (the image could not show it)';
  return '';
}

/** Where this draft came from, in the user's own terms. */
function sourceLineFor(draft) {
  if (draft.source.mode === 'image') return `From the image: ${draft.source.image}`;
  if (draft.source.mode === 'pick') {
    const candidate = draft.source.candidate;
    return candidate
      ? `From your pick: \`${candidate.signature}\`, used ${candidate.count}× in your codebase`
      : `From your pick: ${draft.source.input}`;
  }
  return `From your description: "${draft.source.input}"`;
}

/** The review the user reads before deciding (plan §3.3). */
export function renderReview(draft, { model, gaps, blocks, codeView = null }) {
  const lines = [
    draft.revisionOf
      ? `Revision — ${draft.name}  (${draft.archetype}, already in your system)`
      : `Draft — ${draft.name}  (${draft.archetype})`,
    sourceLineFor(draft),
    '',
    'Spec view',
    indent(renderSpecBlock(draft, { model }), '  '),
    '',
    'Code view (React + CSS)',
  ];
  // When the codebase is not React, say so rather than letting the default
  // look like a detection result (plan §3.3, §9).
  if (codeView?.fallback && codeView.reason) lines.push(`  ${codeView.reason}`);
  for (const block of blocks) {
    lines.push(`  ${block.lang}`);
    lines.push(indent(block.content, '    '));
    lines.push('');
  }

  const contract = contractFor(draft.archetype);
  const total = contract ? contract.slots.length + contract.states.length : 0;
  if (isCustom(draft)) {
    // No contract, so there is no checklist to report against — saying "no gaps"
    // would imply one was checked (§6.7).
    lines.push(
      'Custom — no archetype contract, so no mandatory slots and no gap list. This spec is',
      'exactly what you described, and it is complete when you say it is.',
    );
  } else if (gaps.length === 0) {
    lines.push('Gaps: none — every slot in the contract is filled or skipped.');
  } else {
    lines.push(`Gaps (${gaps.length} of the ${total} slots and states this archetype must define)`);
    lines.push(...renderGapLines(gaps, { model, evidence: [], archetype: draft.archetype }));
  }
  return lines.join('\n');
}

/** Write the accepted draft — the only path from `create` to the file. */
export function acceptDraft(root, draft, { model, text, framework = 'React' } = {}) {
  const current = model ?? parse(text ?? '');
  const blocks = [
    { lang: 'yaml', content: renderSpecBlock(draft, { model: current }) },
    ...renderCodeBlocks(draft, { model: current, framework }),
  ];
  const { updated } = upsertComponent(current, draft, { blocks });
  writeDesignSystem(root, render(current));
  advance(draft, 'accept');
  saveDraft(root, draft);
  return { updated, model: current };
}

/**
 * Every open question about this draft: the ones the trace raised (they carry
 * the extra context), then the contract's own gaps, with nothing asked twice.
 */
export function openGaps(draft, { traced = [], model = null } = {}) {
  // A traced question is about one property — "the border reads 2px, but I am
  // not sure" — so it stays open until *that* property is answered or skipped,
  // even when something else has already filled its slot.
  const answered = new Set(draft.properties.map((property) => property.key));
  const skipped = new Set(draft.skipped);
  const open = traced.filter(
    (gap) => !answered.has(gap.property) && !skipped.has(gap.property) && !skipped.has(gap.slot),
  );
  return mergeTraceGaps(open, gapsFor(draft, { model }));
}

/**
 * Run `create`.
 *
 * ctx: { cwd, args, env, confirm, ask, trace, today }
 *   confirm(question) -> boolean   the acceptance gate; without it nothing is
 *                                  written, because nothing was accepted
 *   ask(question, suggestions)     the follow-up loop (and the picker), when a
 *                                  terminal is attached; without it the gaps
 *                                  are printed
 *   trace({ file, request })       image mode's eyes: returns a structured
 *                                  trace result. Supplied by the skill when it
 *                                  runs inside Claude Code; absent in a plain
 *                                  terminal, where the request is handed over
 *                                  instead.
 */
export async function runCreate(args, ctx = {}) {
  const root = ctx.cwd;
  const file = path.join(root, 'DESIGN-SYSTEM.md');
  const text = fs.readFileSync(file, 'utf8');
  const model = parse(text);

  if (args.length === 0) return runPick(root, { model, ctx });

  const argument = args[0];
  // `primitives` is a reserved word after `create`, the way `tokens` and
  // `components` chain under `assess` (§2 argument grammar). Quoting it means
  // the word itself, so `create "primitives"` is still a component description.
  if (!argument.quoted && argument.value.toLowerCase() === PRIMITIVES_WORD) {
    return runPrimitives(root, { model, ctx });
  }

  if (!argument.quoted && looksLikeImagePath(argument.value)) {
    return runImage(root, argument.value, { model, ctx });
  }

  const prose = argument.value;
  const tokenNames = tokenNamesOf(model);
  let draft = extractDraft(prose, { now: ctx.today, tokenNames });

  // No archetype in the sentence. With somebody to ask, custom is *offered*
  // (v0.3.0 §6.7) — never assumed, and never the nearest archetype instead.
  if (draft.unknownArchetype) {
    if (typeof ctx.ask !== 'function') {
      saveDraft(root, draft);
      return { out: renderUnknownArchetype(prose), code: 0 };
    }
    const answer = String((await ctx.ask(customOfferFor(prose), [])) ?? '').trim();
    if (answer === '' || isNo(answer)) {
      saveDraft(root, draft);
      return { out: renderUnknownArchetype(prose), code: 0 };
    }
    draft = extractDraft(prose, { now: ctx.today, tokenNames, custom: true, name: answer });
  }

  // A name Phyllum already knows opens a revision of it, never a second entry.
  seedFromExisting(draft, model);
  resolveTokens(draft, model);
  saveDraft(root, draft);

  return finishDraft(root, draft, { model, ctx });
}

// ---------------------------------------------------------------------------
// `create primitives` — the value layer (v0.3.0 plan §5)
// ---------------------------------------------------------------------------
//
// Unlike every other mode in this file, this one is **wholly mechanical**: fixed
// constants for the neutral ramp, arithmetic for a derived one, no model
// anywhere in the path (§5.4). So it does not take the intelligence route the
// other modes fall back on — it runs to completion in a plain terminal with
// nothing installed, and asks for nothing it cannot do itself.
//
// What it does still need is a person, because the plan's rule is that a ramp is
// never assumed: **every token gets its own yes/no before anything is proposed
// for it** (§5.1). The yes/no is a `confirm`, which is exactly what a confirm is
// for; the optional step edit is an `ask`, which only the interactive session
// has. With neither attached there is nobody to ask, so the run reports what it
// *would* ask and writes nothing.

export const PRIMITIVES_WORD = 'primitives';

const rampLines = (offer, rows) => {
  const width = Math.max(...rows.map((row) => row.token.length));
  return rows.map((row) => {
    const note = row.base
      ? '   ← your value, at its nearest step, unchanged'
      : offer.present.some((present) => present.token === row.token)
        ? '   (already in your system)'
        : '';
    return `    ${row.token.padEnd(width)}  ${row.value}${note}`;
  });
};

/** The nine values, shown in full before anything is accepted (§5.1, §5.2). */
function renderRamp(offer) {
  const lines = [];
  lines.push(
    offer.kind === 'neutral'
      ? `  The neutral ramp — nine shipped constants from the nomenclature library:`
      : `  ${offer.base} — nine steps derived from ${offer.value}, hue and saturation held:`,
  );
  lines.push(...rampLines(offer, offer.rows));
  if (offer.status === 'partial') {
    lines.push(`    ${offer.missing.length} of the nine are missing; only those would be written.`);
  }
  return lines;
}

function renderOfferSummary(offers) {
  const lines = [];
  const tokens = offers.filter((offer) => offer.kind === 'token');
  const readable = tokens.filter((offer) => offer.status !== 'unreadable');
  if (tokens.length === 0) {
    lines.push('Your system records no colour tokens yet, so the neutral ramp is the whole offer.');
  } else {
    lines.push(
      `Your system records ${readable.length} colour token${readable.length === 1 ? '' : 's'} a ramp can be built from, plus the neutral ramp.`,
    );
  }
  for (const offer of offers) {
    if (offer.status === 'unreadable') {
      lines.push(`  ${offer.base} (${offer.value}) — not a colour Phyllum can read, so no ramp is offered for it.`);
    }
    if (offer.status === 'complete') {
      lines.push(`  ${offer.base} — its nine steps are already in your system. Nothing to do.`);
    }
  }
  return lines;
}

/** One line per accepted edit, applied to the rows that have not been written yet. */
function applyEdit(answer, proposals) {
  const match = String(answer ?? '').trim().match(/^(\S+)\s+(.+)$/);
  if (!match) return null;
  const [, token, value] = match;
  for (const offer of proposals) {
    const row = offer.missing.find((item) => item.token === token);
    if (!row) continue;
    row.value = value.trim();
    row.base = false;
    return `  ${token} is now ${row.value}.`;
  }
  return null;
}

export async function runPrimitives(root, { model, ctx }) {
  const out = [
    'create primitives — the value layer under your semantic tokens',
    '',
    'Wholly mechanical: shipped constants and arithmetic, no model in the path. The',
    'neutral ramp is the same nine values for every Phyllum user; a derived ramp holds',
    'your token’s hue and saturation and never alters the value you recorded.',
    '',
  ];

  const offers = primitiveOffers(model);
  out.push(...renderOfferSummary(offers), '');

  const open = askable(offers);
  if (open.length === 0) {
    out.push('Every ramp this system could hold is already in it. Nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }

  // Nobody to ask. The questions are shown rather than answered, and no ramp is
  // rendered — a proposal before its question is exactly what §5.1 forbids.
  if (typeof ctx.confirm !== 'function') {
    out.push('Each of these is asked one at a time, and a no generates nothing for that token:');
    for (const offer of open) out.push(`  - ${primitiveQuestionFor(offer)}`);
    out.push('', 'Nothing has been written — Phyllum writes DESIGN-SYSTEM.md only when you accept.', '');
    return { out: out.join('\n'), code: 0 };
  }

  // The per-token gate, asked before anything is proposed for that token.
  const answers = {};
  for (const offer of open) {
    answers[offer.base] = await ctx.confirm(primitiveQuestionFor(offer));
    if (!isYes(answers[offer.base])) {
      out.push(`  ${offer.base} — no, so nothing is generated for it.`);
      continue;
    }
    out.push(...renderRamp(offer), '');
  }

  const walk = walkPrimitives(model, answers, { offers });
  if (walk.proposed.length === 0) {
    out.push('Nothing was accepted, so nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }

  // Any step may be edited before the gate (§5.2). Only the session has an
  // `ask`; without one the values stand as derived, which is what was shown.
  if (typeof ctx.ask === 'function') {
    for (;;) {
      const answer = await ctx.ask(
        'Accept these ramps, or edit one step (e.g. `accentRed400 #FF0000`)? [accept]',
        [],
      );
      const raw = String(answer ?? '').trim();
      if (raw === '' || /^(accept|ok|done|yes|y)$/i.test(raw)) break;
      const applied = applyEdit(raw, walk.proposed);
      out.push(applied ?? `  "${raw}" does not name a step in these ramps, so nothing changed.`);
    }
  }

  const rows = walk.proposed.flatMap((offer) => offer.missing);
  const accepted = await ctx.confirm(
    `Write ${rows.length} primitive row${rows.length === 1 ? '' : 's'} to DESIGN-SYSTEM.md?`,
  );
  if (!accepted) {
    out.push('Not accepted, so nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }

  const written = addPrimitives(model, rows);
  writeDesignSystem(root, render(model));
  out.push(
    `Wrote ${written.length} primitive row${written.length === 1 ? '' : 's'} into the Primitives subsection of Colours.`,
    '',
  );
  return { out: out.join('\n'), code: 0, wrote: true };
}

// ---------------------------------------------------------------------------
// Mode B — image (plan §3.1, §7.3: the vision lives in Claude Code)
// ---------------------------------------------------------------------------

/** The hand-over when this process has no eyes: the request, and who can serve it. */
function renderTraceHandover(relative, request) {
  return (
    `Image mode — ${relative}\n\n` +
    'Phyllum frames the trace and reads the result back; the measuring itself happens in\n' +
    'Claude Code, which can see the image. Here is the request it answers:\n\n' +
    `${indent(request, '  ')}\n`
  );
}

async function runImage(root, value, { model, ctx }) {
  const check = validateImage(root, value);
  if (!check.ok) return { out: check.message, code: 1 };

  const relative = path.relative(path.resolve(root), check.file) || path.basename(check.file);
  const request = traceRequest({ file: relative, archetype: ctx.archetype ?? null, model });

  const result =
    typeof ctx.trace === 'function'
      ? await ctx.trace({ file: check.file, relative, request, model })
      : null;

  if (!result) {
    const out = [
      renderTraceHandover(relative, request),
      'Nothing has been written — Phyllum writes DESIGN-SYSTEM.md only when you accept.',
      '',
    ];
    return withRoute(out, ctx);
  }

  const { draft, questions, refused } = ingestTrace(result, { now: ctx.today, file: relative });
  if (draft.unknownArchetype) {
    saveDraft(root, draft);
    return {
      out:
        `The trace of ${relative} does not say which kind of component this is, and Phyllum does not guess.\n` +
        `Name one of these and run it again: ${archetypes().map((a) => a.name).join(', ')}.\n`,
      code: 0,
    };
  }

  seedFromExisting(draft, model);
  resolveTokens(draft, model);
  saveDraft(root, draft);

  return finishDraft(root, draft, {
    model,
    ctx,
    traced: questions,
    header: renderTraceSummary({ draft, questions, refused }),
  });
}

// ---------------------------------------------------------------------------
// Mode C — pick (plan §3.1: archetypes, plus what the codebase already has)
// ---------------------------------------------------------------------------

/**
 * An image dropped on the dashboard is an image-mode `create` waiting to happen
 * (plan §5). Bare `create` is where it gets picked up: the entry leaves the
 * queue and the run continues exactly as if the path had been typed.
 */
export function takeQueuedImage(root) {
  const state = readState(root);
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const index = queue.findIndex(
    (entry) => entry && entry.kind === 'create-image' && entry.status !== 'done',
  );
  if (index === -1) return null;
  const [entry] = queue.splice(index, 1);
  writeState(root, { queue });
  return entry;
}

async function runPick(root, { model, ctx }) {
  const queued = takeQueuedImage(root);
  if (queued) {
    const result = await runImage(root, queued.file, { model, ctx });
    return {
      ...result,
      out: `Picking up the image you dropped on the dashboard (${queued.file}).\n\n${result.out}`,
    };
  }

  const picker = pickList(root, model);

  if (typeof ctx.ask !== 'function') {
    return withRoute(
      [
        renderPicker(picker),
        '',
        'Nothing has been written — Phyllum writes DESIGN-SYSTEM.md only when you accept.',
        '',
      ],
      ctx,
    );
  }

  const answer = await ctx.ask(
    `${renderPicker(picker)}\n\nWhich one?`,
    picker.choices.map((choice) => ({ source: choice.kind, value: choice.name, text: choice.name })),
  );
  const choice = resolvePick(answer, picker);
  if (!choice) {
    return {
      out: `${renderPicker(picker)}\n\nI could not match "${String(answer ?? '').trim()}" to anything on that list, so nothing was started.\n`,
      code: 0,
    };
  }

  // Custom is the one pick that cannot seed a name: there is no archetype to
  // build `Archetype/Variant` from, so the user is asked (§6.7).
  let name = null;
  if (choice.kind === 'custom') {
    name = String(
      (await ctx.ask('What is this component called? (e.g. `Hero/Landing`)', [])) ?? '',
    ).trim();
    if (name === '' || isNo(name)) {
      return {
        out: `${renderPicker(picker)}\n\nA custom component needs a name, and nothing was given, so nothing was started.\n`,
        code: 0,
      };
    }
  }

  const draft = seedFromPick(choice, { now: ctx.today, name });
  seedFromExisting(draft, model);
  resolveTokens(draft, model);
  saveDraft(root, draft);

  return finishDraft(root, draft, { model, ctx });
}

/**
 * Start a draft from a candidate somebody else found — `assess`'s component
 * track (v0.2.0 plan §5.1 step 5).
 *
 * It is the same door as pick mode, opened from the outside: the candidate seeds
 * a name and an archetype, and everything after that is `create`'s own machinery
 * — the follow-up loop, the review, the acceptance gate, the one write. `assess`
 * never invents a value from a scan, so there is nothing here for it to pass in.
 */
export async function createFromCandidate(root, candidate, { model, ctx = {} }) {
  const draft = seedFromPick({ kind: 'candidate', ...candidate }, { now: ctx.today });
  seedFromExisting(draft, model);
  resolveTokens(draft, model);
  saveDraft(root, draft);
  return finishDraft(root, draft, { model, ctx });
}

// ---------------------------------------------------------------------------
// The shared tail: follow-up loop, review, acceptance
// ---------------------------------------------------------------------------

/** Append the route notice to an output block, and pick the exit code. */
function withRoute(lines, ctx) {
  const route = intelligenceRoute(ctx.env ?? process.env);
  if (route === 'session') lines.push(renderSessionNotice('create'));
  else if (route === 'shell-out') lines.push(renderShellOutNotice('create'));
  else {
    lines.push(renderNoIntelligenceNotice('create'));
    return { out: lines.join('\n'), code: 1 };
  }
  return { out: lines.join('\n'), code: 0 };
}

async function finishDraft(root, draft, { model, ctx, traced = [], header = null }) {
  const evidence = gatherEvidence(root);
  const context = { model, evidence, archetype: draft.archetype };

  // A custom has no contract, so it has no gap list to walk. Its loop is
  // open-ended instead: name a slot, give it a value, say `done` (§6.7).
  if (isCustom(draft)) {
    await askCustomSlots(root, draft, { ctx, model });
  } else if (typeof ctx.ask === 'function') {
    // The follow-up loop, one question at a time, suggestions in priority order.
    for (const gap of openGaps(draft, { traced, model })) {
      const suggestions = suggestionsFor(gap, context);
      const answer = await ctx.ask(questionFor(gap, { mode: draft.source.mode }), suggestions);
      answerGap(draft, gap, resolveAnswer(answer, suggestions));
      saveDraft(root, draft);
    }
  }

  const gaps = openGaps(draft, { traced, model });
  const detection = detectProject(root);
  const blocks = renderCodeBlocks(draft, { model, framework: detection.framework });

  if (draft.status === 'drafting') advance(draft, 'review');
  saveDraft(root, draft);

  const out = [];
  if (header) out.push(header, '');
  out.push(renderReview(draft, { model, gaps, blocks, codeView: detection.codeView }), '');

  // Acceptance. Only this branch writes, and only on an explicit yes.
  if (typeof ctx.confirm === 'function') {
    const accepted = await ctx.confirm(`Write ${draft.name} to DESIGN-SYSTEM.md?`);
    if (accepted) {
      const { updated } = acceptDraft(root, draft, { model, framework: detection.framework });
      out.push(
        updated
          ? `Updated ${draft.name} in DESIGN-SYSTEM.md (in place — no duplicate entry).`
          : `Wrote ${draft.name} to DESIGN-SYSTEM.md.`,
        '',
      );
      // `wrote` is for callers that report on somebody else's behalf — `assess`'s
      // component track has to say whether the run touched the file, and asking
      // the acceptance branch beats parsing this text back out.
      return { out: `${out.join('\n')}`, code: 0, wrote: true };
    }
    out.push('Not accepted, so nothing was written. Your draft is kept in .phyllum/session.json.', '');
    return { out: `${out.join('\n')}`, code: 0 };
  }

  out.push('Nothing has been written — Phyllum writes DESIGN-SYSTEM.md only when you accept.', '');
  return withRoute(out, ctx);
}

/** The question text for one gap. */
export function questionFor(gap, { mode = 'prose' } = {}) {
  if (gap.kind === 'traced-low-confidence') {
    return (
      `The image reads ${gap.property} as about ${gap.reading}, but only at ${gap.confidence} confidence — ` +
      'too low to record. What is it? (or "skip")'
    );
  }
  if (gap.kind === 'traced-unmeasurable') {
    return `${gap.property} could not be measured from the image — what is it? (or "skip")`;
  }
  if (gap.kind === 'state') {
    return mode === 'image'
      ? `An image shows one state, so this one has to be asked: what changes on ${gap.slot}? (or "skip")`
      : `What changes on ${gap.slot}? (or "skip")`;
  }
  if (gap.kind === 'extrapolated') {
    return `Every component of this kind defines ${gap.slot} — set one? (or "skip")`;
  }
  return `What is the ${gap.slot}? (or "skip")`;
}

/** "1" picks the first suggestion; anything else is taken verbatim. */
export function resolveAnswer(answer, suggestions) {
  const raw = String(answer ?? '').trim();
  if (raw === '') return 'skip';
  const index = Number.parseInt(raw, 10);
  if (String(index) === raw && index >= 1 && index <= suggestions.length) {
    return suggestions[index - 1];
  }
  return raw;
}
