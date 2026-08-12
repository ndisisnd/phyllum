/**
 * `basal create` — the command flow (plan §3, §8.5).
 *
 * This is the part of `create` that talks to a person: it turns a description
 * into a draft, shows the spec and the code, walks the gaps, and — only on an
 * explicit acceptance — writes. It keeps the M1 shape: no printing, no reading
 * of `process`, just tokens in and text out, so the assertion suite can drive
 * every branch without spawning anything.
 *
 * The one rule that governs the whole file: nothing reaches DESIGN-SYSTEM.md
 * before the user accepts. The draft lives in `.basal/session.json` until then.
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
import { renderCodeBlocks } from './codegen.js';
import { parse, render } from './design-system.js';
import { detectProject } from './detect.js';
import { advance, saveDraft } from './state.js';
import { writeDesignSystem } from './write.js';
import {
  intelligenceRoute,
  renderNoIntelligenceNotice,
  renderSessionNotice,
  renderShellOutNotice,
} from './claude-cli.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg']);

const indent = (text, prefix = '  ') =>
  String(text)
    .split('\n')
    .map((line) => (line === '' ? '' : `${prefix}${line}`))
    .join('\n');

/** Mode C, and Mode B, land later; say so rather than half-doing them. */
function laterModeNotice(mode, milestone) {
  return (
    `\`create\` ${mode} is not built yet — it lands in ${milestone}.\n` +
    'Prose mode works today: `basal create "button primary with 12px padding-top"`.\n'
  );
}

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
    const note = gap.kind === 'extrapolated' ? ' (every component of this kind defines it)' : '';
    const [first] = suggestionsFor(gap, context);
    lines.push(`  - ${label}${note}`);
    if (first) lines.push(`      ${first.text}`);
  }
  return lines;
}

/** The review the user reads before deciding (plan §3.3). */
export function renderReview(draft, { model, gaps, blocks }) {
  const lines = [
    draft.revisionOf
      ? `Revision — ${draft.name}  (${draft.archetype}, already in your system)`
      : `Draft — ${draft.name}  (${draft.archetype})`,
    `From your description: "${draft.source.input}"`,
    '',
    'Spec view',
    indent(renderSpecBlock(draft, { model }), '  '),
    '',
    'Code view (React + CSS)',
  ];
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
 * Run `create`.
 *
 * ctx: { cwd, args, env, confirm, ask, today }
 *   confirm(question) -> boolean   the acceptance gate; without it nothing is
 *                                  written, because nothing was accepted
 *   ask(question, suggestions)     the follow-up loop, when a terminal is
 *                                  attached; without it the gaps are printed
 */
export async function runCreate(args, ctx = {}) {
  const root = ctx.cwd;
  const file = path.join(root, 'DESIGN-SYSTEM.md');
  const text = fs.readFileSync(file, 'utf8');
  const model = parse(text);

  if (args.length === 0) return { out: laterModeNotice('pick mode (no input)', 'M5'), code: 0 };

  const argument = args[0];
  const looksLikeImage =
    !argument.quoted && IMAGE_EXTENSIONS.has(path.extname(argument.value).toLowerCase());
  if (looksLikeImage) return { out: laterModeNotice('image mode', 'M5'), code: 0 };

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

  const evidence = gatherEvidence(root);
  const context = { model, evidence, archetype: draft.archetype };

  // The follow-up loop, one question at a time, suggestions in priority order.
  if (typeof ctx.ask === 'function') {
    for (const gap of gapsFor(draft, { model })) {
      const suggestions = suggestionsFor(gap, context);
      const answer = await ctx.ask(questionFor(gap), suggestions);
      answerGap(draft, gap, resolveAnswer(answer, suggestions));
      saveDraft(root, draft);
    }
  }

  const gaps = gapsFor(draft, { model });
  const detection = detectProject(root);
  const blocks = renderCodeBlocks(draft, { model, framework: detection.framework });

  if (draft.status === 'drafting') advance(draft, 'review');
  saveDraft(root, draft);

  const out = [renderReview(draft, { model, gaps, blocks }), ''];

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

  const route = intelligenceRoute(ctx.env ?? process.env);
  if (route === 'session') out.push(renderSessionNotice('create'));
  else if (route === 'shell-out') out.push(renderShellOutNotice('create'));
  else {
    out.push(renderNoIntelligenceNotice('create'));
    return { out: out.join('\n'), code: 1 };
  }

  return { out: out.join('\n'), code: 0 };
}

/** The question text for one gap. */
export function questionFor(gap) {
  if (gap.kind === 'state') return `What changes on ${gap.slot}? (or "skip")`;
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
