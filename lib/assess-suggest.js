/**
 * The two suggestion tracks — `assess` step 5 (v0.2.0 plan §5.1, §5.2).
 *
 * Step 4 leaves a table: this is where a table becomes a design system. Two
 * tracks, and they are deliberately not one flow, because a token and a component
 * are different decisions:
 *
 *   tokens      every unnamed value walked one at a time — confirm, rename, merge
 *               or skip — and the accepted ones written to DESIGN-SYSTEM.md
 *   components  every repeated pattern offered as a seed for `create`, which then
 *               runs its own follow-up loop and its own acceptance gate
 *
 * Neither track rescans anything. Both read the assessment the engine already
 * produced (`lib/assess.js`), which is why `assess`, `assess tokens` and
 * `assess components` can all be one scan and three ways of reading it.
 *
 * Three rules hold across both:
 *
 * 1. **Nothing is invented.** The token review reuses `tokenise`'s review — the
 *    same answer grammar, the same naming scales, the same write funnel. The
 *    component track reuses `create`'s pick mode, which seeds a name and an
 *    archetype and never a value.
 * 2. **Nothing is written before acceptance**, and only `DESIGN-SYSTEM.md` is
 *    ever written. The codebase is what `assess` read; `apply` is the only
 *    command that may write it.
 * 3. **Nothing is guessed.** A value the scan could see but not read is a
 *    question, not a proposal: skip the question and the value stays unnamed.
 *
 * v0.2.1 adds one fact to the token question and changes nothing else about it:
 * the **severity** of the finding, which the engine worked out from how often
 * the value is used. The interactive review treats an `error` and a `warn`
 * alike — a rare value can still be worth a token, and only you know that — so
 * the severity travels beside the question rather than filtering it. The one
 * caller it changes is the fast-forward, which declines a warning (§3.2).
 */

import { render } from './design-system.js';
import { createFromCandidate } from './create-command.js';
import { renderCandidate } from './assess-map.js';
import { accepted, decide, questionFor, suggestionsFor, ROLES } from './tokenise-command.js';
import { cell, suggestName, takenNames } from './tokenise-prose.js';
import { actionForAnswer, appliesToFor } from './tokenise-spec.js';
import { applyAcceptance, uniqueName } from './tokenise.js';
import { DESIGN_SYSTEM_FILE, writeDesignSystem } from './write.js';

const NOT_WRITTEN = `Nothing has been written — Phyllum writes ${DESIGN_SYSTEM_FILE} only when you accept.`;

/** How many unreadable values one run asks about before it stops asking. */
const MAX_QUESTIONS = 5;

/** Did the answer mean "no, leave it"? */
const isStop = (answer) => {
  const raw = String(answer ?? '').trim();
  return raw === '' || actionForAnswer(raw).action === 'skip';
};

// ---------------------------------------------------------------------------
// The fourth bucket — seen, not read
// ---------------------------------------------------------------------------

/** The question asked about a value whose property meant nothing to Phyllum. */
export function unreadableQuestion(row) {
  const where = row.properties.length > 0 ? `\`${row.properties[0]}\`` : 'a property I do not know';
  if (row.kind === 'colour') {
    return `${row.value} is written on ${where}, which no table names — is it a colour worth a token? (y / skip)`;
  }
  return `${row.value} is written on ${where}, so I cannot tell what it applies to. Which is it? (${ROLES.map((role) => appliesToFor(role)).join(' / ')} / skip)`;
}

/**
 * Turn an answered unreadable row into a proposal, in the shape the review and
 * the write step already understand.
 *
 * The proposal is built from the row's own evidence — the count, the files, the
 * properties it was written against — so an accepted token records how much of
 * the codebase it covers, exactly as a clustered proposal does.
 */
export function proposalForUnreadable(row, { role = null, model, taken }) {
  const candidate =
    row.kind === 'colour' ? { pass: 'colours', value: row.value } : { pass: 'numbers', value: row.value, role };
  const suggestion = suggestName(candidate, model);
  const name = uniqueName(suggestion.name, taken);

  const properties = row.properties.length > 0 ? `; property ${row.properties.join(', ')} is not one Phyllum reads` : '';
  return {
    pass: candidate.pass,
    section: candidate.pass === 'colours' ? 'colours' : 'numbers',
    role: candidate.pass === 'numbers' ? role : null,
    name,
    suggestedName: suggestion.name,
    value: row.value,
    size: null,
    weight: null,
    lineHeight: null,
    appliesTo: candidate.pass === 'numbers' ? appliesToFor(role) : '',
    notes: cell(`used ${row.count}×${properties}`),
    count: row.count,
    files: row.files,
    properties: row.properties,
    members: [{ value: row.value, raw: row.value, count: row.count }],
    merged: false,
    // The row already carries the severity the engine gave it; an answered
    // question does not make a value used more often than it is.
    severity: row.severity ?? null,
    rule: null,
    source: 'assess-unread',
  };
}

/**
 * Ask about the values the scan could see but not read, and return the ones that
 * came back with an answer as proposals.
 *
 * A skipped question produces nothing at all. That is the whole point of the
 * bucket: Phyllum would rather leave `12px` unnamed than record a corner radius
 * as a padding.
 */
export async function askUnreadable(rows, { model, ctx, taken, limit = MAX_QUESTIONS }) {
  const out = { proposals: [], lines: [], asked: 0 };
  if (rows.length === 0 || typeof ctx.ask !== 'function') return out;

  for (const row of rows.slice(0, limit)) {
    const suggestions =
      row.kind === 'colour'
        ? [{ action: 'confirm', text: 'yes — it is a colour, propose a name for it' }]
        : ROLES.map((role) => ({ action: 'role', text: appliesToFor(role) }));
    const answer = await ctx.ask(unreadableQuestion(row), suggestions);
    out.asked += 1;

    if (isStop(answer)) {
      out.lines.push(`  ${row.value} left unnamed — you did not say what it applies to, and Phyllum does not guess.`);
      continue;
    }

    if (row.kind === 'colour') {
      out.proposals.push(proposalForUnreadable(row, { model, taken }));
      continue;
    }
    const role = resolveRoleAnswer(answer);
    if (!role) {
      out.lines.push(`  ${row.value} left unnamed — "${String(answer).trim()}" is not one of the roles.`);
      continue;
    }
    out.proposals.push(proposalForUnreadable(row, { role, model, taken }));
  }

  if (rows.length > limit) {
    out.lines.push(`  ${rows.length - limit} more unread value${rows.length - limit === 1 ? '' : 's'} left for the next run.`);
  }
  return out;
}

/**
 * An answer to the role question, or null. Unlike `tokenise`'s resolver this one
 * has no fallback: `assess` is reading somebody else's code, so an answer it
 * cannot place is a question left open, never a default applied.
 */
export function resolveRoleAnswer(answer) {
  const raw = String(answer ?? '').trim().toLowerCase();
  const index = Number.parseInt(raw, 10);
  if (String(index) === raw && index >= 1 && index <= ROLES.length) return ROLES[index - 1];
  return (
    ROLES.find((role) => role === raw) ??
    ROLES.find((role) => appliesToFor(role).toLowerCase() === raw) ??
    ROLES.find((role) => raw.includes(role)) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Track one — tokens
// ---------------------------------------------------------------------------

/**
 * The proposals as a plain terminal reads them: the name, the value, the weight
 * of it, and — for the rare ones — that Phyllum suspects an exception rather
 * than drift. The marker is on the warnings and not on the errors on purpose: a
 * label on every row is a label nobody reads.
 */
export function renderProposalList(proposals) {
  return proposals.map((proposal) => {
    const exception = proposal.severity === 'warn' ? '  — used rarely; likely an exception' : '';
    return (
      `  ${proposal.name.padEnd(20)} ${String(proposal.value).padEnd(22)} ` +
      `${proposal.count} sighting${proposal.count === 1 ? '' : 's'}${exception}`
    );
  });
}

/**
 * Walk the token proposals with the user and write the accepted ones.
 *
 * The loop is `tokenise`'s, not a second one: the same question, the same answer
 * grammar (confirm / rename / `merge <token>` / skip), the same acceptance gate,
 * the same `applyAcceptance` write. What `assess` adds is the number of them and
 * the codebase evidence behind each.
 */
export async function runTokenTrack(root, { result, model, ctx = {} }) {
  const lines = ['Tokens'];
  const taken = new Set(takenNames(model));
  for (const proposal of result.values.proposals) taken.add(proposal.name);

  const canAsk = typeof ctx.ask === 'function';
  const unread = await askUnreadable(result.values.unreadable, { model, ctx, taken });
  const proposals = [...result.values.proposals, ...unread.proposals].sort((a, b) => b.count - a.count);

  if (proposals.length === 0) {
    lines.push(
      result.values.unreadable.length > 0 && !canAsk
        ? `  Nothing to propose yet — ${result.values.unreadable.length} value${result.values.unreadable.length === 1 ? '' : 's'} needs a question answered first.`
        : '  Nothing to propose — every raw value in here already maps to a token you have.',
    );
    return { lines: [...lines, ...unread.lines], written: [], accepted: [] };
  }

  if (!canAsk) {
    lines.push(`  ${proposals.length} token${proposals.length === 1 ? '' : 's'} Phyllum would propose, most-used first:`);
    lines.push(...renderProposalList(proposals));
    const unreadable = result.values.unreadable.length;
    if (unreadable > 0) {
      lines.push(
        `  ${unreadable} more value${unreadable === 1 ? ' was' : 's were'} seen but not read — the review asks what each one applies to.`,
      );
    }
    return { lines, written: [], accepted: [], needsConversation: true };
  }

  lines.push(`  ${proposals.length} value${proposals.length === 1 ? '' : 's'} to name, most-used first.`);
  lines.push(...unread.lines);

  const names = [...taken];
  const decisions = [];
  for (const proposal of proposals) {
    const answer = await ctx.ask(questionFor(proposal), suggestionsFor(proposal), {
      severity: proposal.severity ?? null,
    });
    const decision = decide(proposal, answer, { names });
    if (decision.refused) {
      lines.push(`  \`${decision.refused}\` is not a token or a proposal, so ${proposal.value} was skipped rather than guessed at.`);
    }
    decisions.push(decision);
  }

  const keep = accepted(decisions);
  if (keep.length === 0) {
    lines.push('  Nothing accepted, so nothing was written.');
    return { lines, written: [], accepted: [] };
  }

  if (typeof ctx.confirm !== 'function') {
    lines.push(`  ${NOT_WRITTEN}`);
    return { lines, written: [], accepted: keep };
  }

  const yes = await ctx.confirm(
    `Write ${keep.length} token${keep.length === 1 ? '' : 's'} to ${DESIGN_SYSTEM_FILE}?`,
  );
  if (!yes) {
    lines.push('  Not accepted, so nothing was written.');
    return { lines, written: [], accepted: keep };
  }

  const applied = applyAcceptance(model, keep);
  writeDesignSystem(root, render(model));
  lines.push(
    `  Wrote ${applied.written.length} token${applied.written.length === 1 ? '' : 's'} to ${DESIGN_SYSTEM_FILE}: ${applied.written.map((proposal) => `\`${proposal.name}\``).join(', ') || 'none'}.`,
  );
  for (const merged of keep.filter((proposal) => proposal.mergedInto)) {
    lines.push(`  ${merged.value} folded into \`${merged.mergedInto}\` — no second token made.`);
  }
  for (const item of applied.reconciled) {
    lines.push(`  ${item.component} now references \`${item.token}\` — a Backlog entry cleared.`);
  }
  lines.push('  Your codebase was not touched: `assess` reads code, only `apply` writes it.');
  return { lines, written: applied.written, accepted: keep, reconciled: applied.reconciled };
}

// ---------------------------------------------------------------------------
// Track two — components
// ---------------------------------------------------------------------------

/** The candidate list as a numbered picker over what the scan actually found. */
export function renderCandidatePicker(candidates) {
  const lines = ['  Patterns your code repeats that the design system has never been told about:'];
  candidates.forEach((candidate, index) => {
    lines.push(`  ${index + 1}.${renderCandidate(candidate)}`);
  });
  return lines;
}

/** "2" picks the second candidate; a name picks by name or signature. */
export function resolveCandidate(answer, candidates) {
  const raw = String(answer ?? '').trim();
  if (raw === '') return null;
  const index = Number.parseInt(raw, 10);
  if (String(index) === raw) {
    return index >= 1 && index <= candidates.length ? candidates[index - 1] : null;
  }
  const lower = raw.toLowerCase();
  return (
    candidates.find((candidate) => candidate.name.toLowerCase() === lower) ??
    candidates.find((candidate) => candidate.signature?.toLowerCase() === lower) ??
    null
  );
}

/**
 * Walk the component candidates into `create`'s pick mode.
 *
 * A candidate carries a name and an archetype and nothing else — whatever CSS
 * sits around the pattern is evidence for the follow-up loop to offer, never a
 * fact about the component. So this track hands the pick to `create` and lets
 * `create` do what it already does: ask the contract's questions one at a time,
 * show the spec and the code, and write only on acceptance.
 *
 * One component per call, on purpose. Recording a component is a conversation of
 * its own, and five of them queued behind one another is not a review — it is an
 * endurance test. The rest stay in the report, and `assess components` (or bare
 * `phyllum create`) picks up the next one.
 *
 * `looping` is the one thing the focused `assess components` mode changes, and it
 * changes a sentence rather than a behaviour: that mode asks again itself, so the
 * tail says "the next one now" instead of telling you to rerun the command.
 */
export async function runComponentTrack(root, { result, model, ctx = {}, looping = false }) {
  const lines = ['Components'];
  const { components } = result;

  if (!components.ran) {
    lines.push(`  Not run — ${components.reason}.`);
    return { lines, created: null };
  }
  if (components.candidates.length === 0) {
    lines.push('  Nothing repeated often enough to look like a component the system is missing.');
    return { lines, created: null };
  }

  if (typeof ctx.ask !== 'function') {
    lines.push(...renderCandidatePicker(components.candidates));
    lines.push('  Recording one is a conversation: `phyllum create` opens the same picker and asks the contract’s questions.');
    return { lines, created: null, needsConversation: true };
  }

  const answer = await ctx.ask(
    `${renderCandidatePicker(components.candidates).join('\n')}\n\nRecord one of these as a component? (number / name / skip)`,
    components.candidates.map((candidate) => ({
      source: 'candidate',
      value: candidate.name,
      text: `${candidate.name} — \`${candidate.signature}\` repeated ${candidate.count}×`,
    })),
  );

  if (isStop(answer)) {
    lines.push('  None recorded this run — the patterns stay in the report.');
    return { lines, created: null };
  }

  const choice = resolveCandidate(answer, components.candidates);
  if (!choice) {
    lines.push(`  "${String(answer).trim()}" matched nothing on that list, so nothing was started.`);
    return { lines, created: null };
  }

  const created = await createFromCandidate(root, choice, { model, ctx });
  lines.push(created.out.trimEnd());
  const left = components.candidates.filter((candidate) => candidate !== choice);
  if (left.length > 0) {
    lines.push(
      `  ${left.length} other pattern${left.length === 1 ? '' : 's'} still unrecorded: ${left.map((candidate) => candidate.name).join(', ')}. ${looping ? 'Asking about the next one now.' : 'Run `assess components` again for the next one.'}`,
    );
  }
  return { lines, created: choice, result: created, written: created.wrote ? 1 : 0 };
}
