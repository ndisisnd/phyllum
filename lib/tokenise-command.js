/**
 * `phyllum tokenise` — the command flow (v0.2.0 plan §6).
 *
 * The half of `tokenise` that talks to a person. As of v0.2.0 the input is a
 * sentence, never the codebase: "our brand blue #2563EB" in, one named token in
 * `DESIGN-SYSTEM.md` out. Reading code is `assess`'s job, writing code is
 * `apply`'s, and this command does neither.
 *
 * Three conversations can happen, and none of them is a dead end:
 *
 *   1. **No value in the sentence** — "add a token for our brand blue" — asks
 *      for the missing value, exactly as `create` asks about a gap, and writes
 *      only once the answer completes the token.
 *   2. **No name in the sentence** — Phyllum suggests one from the naming
 *      scales and confirms it. A name the user typed is never put back to them.
 *   3. **A length with no stated meaning** — asks what it applies to, because a
 *      12px radius and a 12px padding are different facts.
 *
 * The same shape as `create`: tokens in, text out. Nothing here prints, nothing
 * reads `process`, and the only write is the one at the end, through the funnel.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parse, render } from './design-system.js';
import { applyAcceptance } from './tokenise.js';
import { actionForAnswer, appliesToFor } from './tokenise-spec.js';
import {
  existingTokenFor,
  parseProse,
  proposalFrom,
  suggestName,
  takenNames,
} from './tokenise-prose.js';
import { writeState } from './state.js';
import { DESIGN_SYSTEM_FILE, writeDesignSystem } from './write.js';
import {
  intelligenceRoute,
  renderNoIntelligenceNotice,
  renderSessionNotice,
  renderShellOutNotice,
} from './claude-cli.js';

const PASS_LABEL = { colours: 'colour', numbers: 'number', typography: 'typography' };
const ROLES = ['spacing', 'radius', 'border'];
const MAX_FOLLOW_UPS = 3;
const EXAMPLE = 'phyllum tokenise "our brand blue #2563EB"';

const NOT_WRITTEN = `Nothing has been written — Phyllum writes ${DESIGN_SYSTEM_FILE} only when you accept.`;

/** Did the user answer "no" / "skip" / nothing at all? */
const isStop = (answer) => {
  const raw = String(answer ?? '').trim();
  return raw === '' || actionForAnswer(raw).action === 'skip';
};

// ---------------------------------------------------------------------------
// What the user reads
// ---------------------------------------------------------------------------

/** The one-line description of a value, in the terms its pass uses. */
export function describeValue(candidate) {
  if (candidate.pass === 'typography') {
    return `${candidate.size} / ${candidate.weight} / ${candidate.lineHeight}`;
  }
  return candidate.value;
}

/** What Phyllum understood, and where the name came from. */
export function renderProposal(proposal, { prose, suggestion = null }) {
  const kind =
    proposal.pass === 'numbers'
      ? `${PASS_LABEL.numbers}, ${proposal.appliesTo}`
      : PASS_LABEL[proposal.pass];
  const lines = [
    `Read from "${prose}":`,
    `  value  ${proposal.value}  (${kind})`,
    suggestion
      ? `  name   ${proposal.name}  (suggested — ${suggestion.why})`
      : `  name   ${proposal.name}  (yours, from the description)`,
  ];
  if (proposal.implied.length > 0) {
    lines.push(`  the description did not say, so these are the CSS defaults: ${proposal.implied.join(', ')}`);
  }
  return lines.join('\n');
}

/** `tokenise` with nothing to read: what it takes now, and what took over. */
export function renderUsage() {
  return [
    '`tokenise` names one value at a time, from a sentence:',
    `  ${EXAMPLE}`,
    '  phyllum tokenise "16px spacing called space-md"',
    '  phyllum tokenise "heading 24px bold 1.2"',
    '',
    'It does not read your codebase. `assess` does that — it scans the raw styling',
    'you already have and proposes tokens for all of it in one pass.',
  ].join('\n');
}

function renderMissingValue(parsed) {
  return [
    `I can tell you want a token${parsed.name ? ` called \`${parsed.name}\`` : ''}, but "${parsed.input}" does not say what its value is.`,
    parsed.name
      ? `Run it again with the value in the sentence and \`${parsed.name}\` gets written:`
      : 'Run it again with the value in the sentence:',
    `  ${EXAMPLE}`,
  ].join('\n');
}

function renderAlreadyNamed(candidate, existing) {
  return [
    `${describeValue(candidate)} is already \`${existing.name}\` in ${DESIGN_SYSTEM_FILE}.`,
    'Nothing to add — and Phyllum never renames a token you already have; that edit is yours.',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// The questions
// ---------------------------------------------------------------------------

export function missingValueQuestion(parsed) {
  const subject = parsed.name ? `\`${parsed.name}\`` : 'it';
  return `What is ${subject}? Give me the value — a colour like #2563EB, or a length like 12px. (or "skip")`;
}

export function whatQuestion() {
  return 'What should I name? Describe it, e.g. "our brand blue #2563EB". (or "skip")';
}

/** The question asked about one proposal's name. */
export function questionFor(proposal) {
  return `Name ${proposal.value} as \`${proposal.name}\`? (y / a name of your own / "merge <token>" / skip)`;
}

/** The two suggestions a numbered picker offers; the rest is free text. */
export function suggestionsFor(proposal) {
  return [
    { action: 'confirm', text: `yes — add \`${proposal.name}\` (${proposal.value})` },
    { action: 'skip', text: 'skip — write nothing this run' },
  ];
}

export function roleQuestion(candidate) {
  return `What does ${candidate.value} apply to? (${ROLES.map((role) => appliesToFor(role)).join(' / ')})`;
}

/** An answer to the role question, mapped back onto a role, or null. */
export function resolveRole(answer, { fallback = 'spacing' } = {}) {
  const raw = String(answer ?? '').trim().toLowerCase();
  if (raw === '') return fallback;
  const index = Number.parseInt(raw, 10);
  if (String(index) === raw && index >= 1 && index <= ROLES.length) return ROLES[index - 1];
  for (const role of ROLES) {
    if (raw === role || raw === appliesToFor(role).toLowerCase()) return role;
    if (appliesToFor(role).toLowerCase().includes(raw) || raw.includes(role)) return role;
  }
  return fallback;
}

/** Which candidate the user picked when the sentence carried more than one. */
export function resolveCandidate(answer, candidates) {
  const raw = String(answer ?? '').trim().toLowerCase();
  if (raw === '') return candidates[0];
  const index = Number.parseInt(raw, 10);
  if (String(index) === raw && index >= 1 && index <= candidates.length) return candidates[index - 1];
  return (
    candidates.find((candidate) => describeValue(candidate).toLowerCase().includes(raw)) ??
    candidates[0]
  );
}

// ---------------------------------------------------------------------------
// The decision, and what it means for the write
// ---------------------------------------------------------------------------

/** Turn one typed answer into a decision about the proposal. */
export function decide(proposal, answer, { names = [] } = {}) {
  const raw = String(answer ?? '').trim();
  const suggestions = suggestionsFor(proposal);
  const index = Number.parseInt(raw, 10);
  if (String(index) === raw && index >= 1 && index <= suggestions.length) {
    return { proposal, action: suggestions[index - 1].action };
  }

  const parsed = actionForAnswer(raw);
  if (parsed.action === 'merge') {
    const target = parsed.target;
    if (!target || !names.includes(target)) {
      return { proposal, action: 'skip', refused: target ?? '(nothing)' };
    }
    return { proposal, action: 'merge', target };
  }
  if (parsed.action === 'rename') return { proposal, action: 'rename', name: parsed.name };
  return { proposal, action: parsed.action };
}

/** Apply the decisions to the proposals, ready for the write step. */
export function accepted(decisions) {
  const out = [];
  for (const decision of decisions) {
    if (decision.action === 'skip') continue;
    if (decision.action === 'rename') out.push({ ...decision.proposal, name: decision.name });
    else if (decision.action === 'merge') {
      out.push({ ...decision.proposal, mergedInto: decision.target });
    } else out.push(decision.proposal);
  }
  return out;
}

/** Append the route notice to an output block, and pick the exit code. */
function withRoute(lines, ctx) {
  const route = intelligenceRoute(ctx.env ?? process.env);
  if (route === 'session') lines.push(renderSessionNotice('tokenise'));
  else if (route === 'shell-out') lines.push(renderShellOutNotice('tokenise'));
  else {
    lines.push(renderNoIntelligenceNotice('tokenise'));
    return { out: lines.join('\n'), code: 1 };
  }
  return { out: lines.join('\n'), code: 0 };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * Run `tokenise`.
 *
 * ctx: { cwd, env, confirm, ask, today }
 *   ask(question, suggestions)     the follow-up loop: the missing value, what a
 *                                  length applies to, and the proposed name
 *   confirm(question)              the acceptance gate; without it nothing is
 *                                  written, because nothing was accepted
 */
export async function runTokenise(args, ctx = {}) {
  const root = ctx.cwd;
  const file = path.join(root, DESIGN_SYSTEM_FILE);
  const model = parse(fs.readFileSync(file, 'utf8'));
  const canAsk = typeof ctx.ask === 'function';

  // ---- the sentence -------------------------------------------------------
  let prose = args
    .map((argument) => String(argument?.value ?? argument ?? ''))
    .join(' ')
    .trim();

  if (prose === '') {
    if (!canAsk) return withRoute([renderUsage(), '', NOT_WRITTEN, ''], ctx);
    const answer = await ctx.ask(whatQuestion(), [
      { action: 'skip', text: 'skip — nothing to name right now' },
    ]);
    if (isStop(answer)) return { out: `${NOT_WRITTEN}\n`, code: 0 };
    prose = String(answer).trim();
  }

  // ---- the value, asked for until it exists -------------------------------
  let parsed = parseProse(prose);
  for (let round = 0; !parsed.complete; round += 1) {
    if (!canAsk) return withRoute([renderMissingValue(parsed), '', NOT_WRITTEN, ''], ctx);
    if (round >= MAX_FOLLOW_UPS) {
      return { out: `${renderMissingValue(parsed)}\n\n${NOT_WRITTEN}\n`, code: 0 };
    }
    const answer = await ctx.ask(missingValueQuestion(parsed), [
      { action: 'skip', text: 'skip — leave this for later' },
    ]);
    if (isStop(answer)) return { out: `${NOT_WRITTEN}\n`, code: 0 };
    prose = `${prose} ${String(answer).trim()}`;
    parsed = parseProse(prose);
  }

  // ---- one token per run --------------------------------------------------
  const out = [];
  let candidate = parsed.candidates[0];
  if (parsed.candidates.length > 1) {
    const others = parsed.candidates.slice(1).map(describeValue);
    if (canAsk) {
      const answer = await ctx.ask(
        `That sentence names ${parsed.candidates.length} values, and \`tokenise\` records one at a time. Which one?`,
        parsed.candidates.map((item) => ({ action: 'pick', text: describeValue(item) })),
      );
      candidate = resolveCandidate(answer, parsed.candidates);
    }
    const left = parsed.candidates.filter((item) => item !== candidate).map(describeValue);
    out.push(
      `Naming ${describeValue(candidate)} this run; ${left.join(', ') || others.join(', ')} needs its own run.`,
      '',
    );
  }

  // ---- what a length applies to, when the sentence did not say ------------
  if (candidate.pass === 'numbers' && !candidate.roleFromProse) {
    if (canAsk) {
      const answer = await ctx.ask(
        roleQuestion(candidate),
        ROLES.map((role) => ({ action: 'role', text: appliesToFor(role) })),
      );
      candidate = { ...candidate, role: resolveRole(answer), roleFromProse: true };
    } else {
      out.push(
        `"${parsed.input}" does not say what ${candidate.value} applies to, so I am reading it as ${appliesToFor(candidate.role)}.`,
        '',
      );
    }
  }

  // ---- a value the system already names -----------------------------------
  const existing = existingTokenFor(candidate, model);
  if (existing) return { out: `${out.join('\n')}${renderAlreadyNamed(candidate, existing)}`, code: 0 };

  // ---- the name ------------------------------------------------------------
  const suggestion = parsed.nameFromProse ? null : suggestName(candidate, model);
  const proposal = proposalFrom(candidate, {
    name: parsed.name ?? suggestion.name,
    model,
    prose: parsed.input,
    suggested: suggestion?.name ?? null,
  });

  writeState(root, {
    tokenise: {
      readAt: 'this run',
      source: 'prose',
      input: parsed.input,
      proposed: 1,
      proposals: [
        { name: proposal.name, pass: proposal.pass, value: proposal.value, count: proposal.count },
      ],
    },
  });

  out.push(renderProposal(proposal, { prose: parsed.input, suggestion }), '');

  // ---- confirming the name Phyllum chose ----------------------------------
  const names = [...takenNames(model)];
  let decision = { proposal, action: 'confirm' };
  if (suggestion && canAsk) {
    const answer = await ctx.ask(questionFor(proposal), suggestionsFor(proposal));
    decision = decide(proposal, answer, { names });
    if (decision.refused) {
      out.push(`  \`${decision.refused}\` is not a token or a proposal, so nothing was merged.`, '');
    }
  }

  const keep = accepted([decision]);
  if (keep.length === 0) {
    out.push('Nothing accepted, so nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }

  // ---- the acceptance gate. Only this branch writes. ----------------------
  if (typeof ctx.confirm !== 'function') {
    out.push(NOT_WRITTEN, '');
    return withRoute(out, ctx);
  }

  const yes = await ctx.confirm(`Write \`${keep[0].name}\` to ${DESIGN_SYSTEM_FILE}?`);
  if (!yes) {
    out.push('Not accepted, so nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }

  const result = applyAcceptance(model, keep);
  writeDesignSystem(root, render(model));
  out.push(
    result.written.length === 0
      ? `Merged into \`${keep[0].mergedInto}\` — no second token was made.`
      : `Wrote \`${result.written[0].name}\` to ${DESIGN_SYSTEM_FILE}.`,
  );
  for (const item of result.reconciled) {
    out.push(`  ${item.component} now references \`${item.token}\` — its Backlog entry is cleared.`);
  }
  out.push('Your codebase was never read: `tokenise` reads the sentence, `assess` reads the code.', '');
  return { out: out.join('\n'), code: 0 };
}
