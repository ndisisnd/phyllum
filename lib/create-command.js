/**
 * `basal create` — the command flow (plan §3, §8.5).
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
 * lives in `.basal/session.json` until then.
 */

import fs from 'node:fs';
import path from 'node:path';

import { archetypes, contractFor } from './archetypes.js';
import {
  extractDraft,
  gapsFor,
  gatherEvidence,
  renderSpecBlock,
  resolveTokens,
  seedFromExisting,
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
    `I could not tell which kind of component "${prose}" describes, and Basal does not guess.\n` +
    `Name one of these archetypes and run it again: ${names}.\n` +
    'Example: `basal create "button primary with 12px padding-top"`.\n'
  );
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
  if (gaps.length === 0) {
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
  if (!argument.quoted && looksLikeImagePath(argument.value)) {
    return runImage(root, argument.value, { model, ctx });
  }

  const prose = argument.value;
  const draft = extractDraft(prose, { now: ctx.today, tokenNames: tokenNamesOf(model) });
  if (draft.unknownArchetype) {
    saveDraft(root, draft);
    return { out: renderUnknownArchetype(prose), code: 0 };
  }

  // A name Basal already knows opens a revision of it, never a second entry.
  seedFromExisting(draft, model);
  resolveTokens(draft, model);
  saveDraft(root, draft);

  return finishDraft(root, draft, { model, ctx });
}

// ---------------------------------------------------------------------------
// Mode B — image (plan §3.1, §7.3: the vision lives in Claude Code)
// ---------------------------------------------------------------------------

/** The hand-over when this process has no eyes: the request, and who can serve it. */
function renderTraceHandover(relative, request) {
  return (
    `Image mode — ${relative}\n\n` +
    'Basal frames the trace and reads the result back; the measuring itself happens in\n' +
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
      'Nothing has been written — Basal writes DESIGN-SYSTEM.md only when you accept.',
      '',
    ];
    return withRoute(out, ctx);
  }

  const { draft, questions, refused } = ingestTrace(result, { now: ctx.today, file: relative });
  if (draft.unknownArchetype) {
    saveDraft(root, draft);
    return {
      out:
        `The trace of ${relative} does not say which kind of component this is, and Basal does not guess.\n` +
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
        'Nothing has been written — Basal writes DESIGN-SYSTEM.md only when you accept.',
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

  const draft = seedFromPick(choice, { now: ctx.today });
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

  // The follow-up loop, one question at a time, suggestions in priority order.
  if (typeof ctx.ask === 'function') {
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
      return { out: `${out.join('\n')}`, code: 0 };
    }
    out.push('Not accepted, so nothing was written. Your draft is kept in .basal/session.json.', '');
    return { out: `${out.join('\n')}`, code: 0 };
  }

  out.push('Nothing has been written — Basal writes DESIGN-SYSTEM.md only when you accept.', '');
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
