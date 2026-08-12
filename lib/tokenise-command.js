/**
 * `basal tokenise` — the command flow (plan §4, §8.5).
 *
 * The half of `tokenise` that talks to a person: it shows what the scan found,
 * walks the proposals most-used first, takes confirm / rename / merge / skip on
 * each one, and — only on an explicit acceptance — writes.
 *
 * The same shape as `create`: tokens in, text out. Nothing here prints, nothing
 * reads `process`, and the only write is the one at the end, through the funnel.
 * The scan itself cannot write at all: `tokenise.js` has no write call in it.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parse, render } from './design-system.js';
import { applyAcceptance, tokenise } from './tokenise.js';
import { actionForAnswer } from './tokenise-spec.js';
import { writeState } from './state.js';
import { DESIGN_SYSTEM_FILE, writeDesignSystem } from './write.js';
import {
  intelligenceRoute,
  renderNoIntelligenceNotice,
  renderSessionNotice,
  renderShellOutNotice,
} from './claude-cli.js';

const PASS_LABEL = { colours: 'colour', numbers: 'number', typography: 'typography' };

/** One line per proposal, in the order the review will ask about them. */
export function renderProposals(proposals) {
  const lines = [];
  proposals.forEach((proposal, index) => {
    const where = `${proposal.count}× in ${proposal.files.length} file${proposal.files.length === 1 ? '' : 's'}`;
    lines.push(`  ${index + 1}. ${proposal.name}  ${proposal.value}  (${PASS_LABEL[proposal.pass]}, used ${where})`);
    if (proposal.merged) {
      const folded = proposal.members
        .slice(1)
        .map((member) => `${member.raw} ×${member.count}`)
        .join(', ');
      lines.push(`      merging ${folded} — these look like the same intent`);
    }
    lines.push(`      seen in ${proposal.files.slice(0, 3).join(', ')}`);
  });
  return lines;
}

/** The question asked about one proposal. */
export function questionFor(proposal) {
  return `Name ${proposal.value} as \`${proposal.name}\`? (y / a name of your own / "merge <token>" / skip)`;
}

/** The two suggestions a numbered picker offers; the rest is free text. */
export function suggestionsFor(proposal) {
  return [
    { action: 'confirm', text: `yes — add \`${proposal.name}\` (${proposal.value})` },
    { action: 'skip', text: 'skip — leave this value alone for now' },
  ];
}

/** Turn one typed answer into a decision about one proposal. */
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

function renderNothingToPropose(model) {
  const named =
    (model.tokens.colours?.length ?? 0) +
    (model.tokens.numbers?.length ?? 0) +
    (model.tokens.typography?.length ?? 0);
  return [
    'Scanned your codebase — nothing new to name.',
    named > 0
      ? `Every value it uses is already one of the ${named} tokens in ${DESIGN_SYSTEM_FILE}, so there is nothing to propose.`
      : `No colours, numbers or typography turned up in the files Basal reads, so there is nothing to propose.`,
    'Nothing was written — the scan is read-only.',
    '',
  ].join('\n');
}

/**
 * Run `tokenise`.
 *
 * ctx: { cwd, env, confirm, ask, today }
 *   ask(question, suggestions)   the review loop, one proposal at a time
 *   confirm(question)            the acceptance gate; without it nothing is
 *                                written, because nothing was accepted
 */
export async function runTokenise(args, ctx = {}) {
  const root = ctx.cwd;
  const file = path.join(root, DESIGN_SYSTEM_FILE);
  const text = fs.readFileSync(file, 'utf8');
  const model = parse(text);

  // Stage one: the read-only scan. Nothing below this line writes to the user's
  // codebase, and nothing at all writes until the acceptance branch.
  const { proposals } = tokenise(root, model);

  writeState(root, {
    tokenise: {
      scannedAt: 'this run',
      proposed: proposals.length,
      proposals: proposals.map((proposal) => ({
        name: proposal.name,
        pass: proposal.pass,
        value: proposal.value,
        count: proposal.count,
      })),
    },
  });

  if (proposals.length === 0) return { out: renderNothingToPropose(model), code: 0 };

  const out = [
    `Scanned your codebase, read-only — ${proposals.length} value${proposals.length === 1 ? '' : 's'} worth naming, most-used first.`,
    '',
    ...renderProposals(proposals),
    '',
  ];

  const names = [
    ...proposals.map((proposal) => proposal.name),
    ...['colours', 'numbers', 'typography'].flatMap((key) =>
      (model.tokens[key] ?? []).map((row) => row[0]),
    ),
  ];

  // The review loop: one proposal at a time, confirm / rename / merge / skip.
  const decisions = [];
  if (typeof ctx.ask === 'function') {
    for (const proposal of proposals) {
      const answer = await ctx.ask(questionFor(proposal), suggestionsFor(proposal));
      const decision = decide(proposal, answer, { names });
      if (decision.refused) {
        out.push(`  \`${decision.refused}\` is not a token or a proposal, so nothing was merged into it — skipped instead.`);
      }
      decisions.push(decision);
    }
  }

  const keep = accepted(decisions);

  // Acceptance. Only this branch writes, and only on an explicit yes.
  if (typeof ctx.confirm === 'function') {
    if (keep.length === 0) {
      out.push('Nothing accepted, so nothing was written.', '');
      return { out: out.join('\n'), code: 0 };
    }
    const yes = await ctx.confirm(
      `Write ${keep.length} token${keep.length === 1 ? '' : 's'} to ${DESIGN_SYSTEM_FILE}?`,
    );
    if (!yes) {
      out.push('Not accepted, so nothing was written.', '');
      return { out: out.join('\n'), code: 0 };
    }

    const result = applyAcceptance(model, keep);
    writeDesignSystem(root, render(model));
    out.push(
      `Wrote ${result.written.length} token${result.written.length === 1 ? '' : 's'} to ${DESIGN_SYSTEM_FILE}.`,
    );
    for (const item of result.reconciled) {
      out.push(`  ${item.component} now references \`${item.token}\` — its Backlog entry is cleared.`);
    }
    out.push('Your codebase is untouched: v1 names values, it never rewrites them.', '');
    return { out: out.join('\n'), code: 0 };
  }

  out.push('Nothing has been written — Basal writes DESIGN-SYSTEM.md only when you accept.', '');

  const route = intelligenceRoute(ctx.env ?? process.env);
  if (route === 'session') out.push(renderSessionNotice('tokenise'));
  else if (route === 'shell-out') out.push(renderShellOutNotice('tokenise'));
  else {
    out.push(renderNoIntelligenceNotice('tokenise'));
    return { out: out.join('\n'), code: 1 };
  }

  return { out: out.join('\n'), code: 0 };
}
