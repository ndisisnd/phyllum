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
 * As of v0.3.0 (plan §3) a sentence may carry several values, and the command
 * walks them as a **queue**: one entry at a time, in sentence order, each one
 * running all three of those conversations for itself. Nothing downstream
 * changed — the queue is intake, not protocol — and a skipped entry costs only
 * itself. The queue is kept in `.phyllum/session.json` as it goes, so a run cut
 * short can be picked up rather than retyped.
 *
 * The same shape as `create`: tokens in, text out. Nothing here prints, nothing
 * reads `process`, and every write goes through the one funnel.
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
import { STATE_FILE, readState, writeState } from './state.js';
import { DESIGN_SYSTEM_FILE, writeDesignSystem } from './write.js';
import {
  intelligenceRoute,
  renderNoIntelligenceNotice,
  renderSessionNotice,
  renderShellOutNotice,
} from './claude-cli.js';

const PASS_LABEL = { colours: 'colour', numbers: 'number', typography: 'typography' };
/**
 * The roles the "what does this apply to?" question offers, in the order the
 * numbered picker uses. `assess` asks the same question about a value it scanned
 * but could not read, so the list is shared rather than spelled twice.
 */
export const ROLES = ['spacing', 'radius', 'border'];
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
export function renderProposal(proposal, { prose, suggestion = null, lead = '' }) {
  const kind =
    proposal.pass === 'numbers'
      ? `${PASS_LABEL.numbers}, ${proposal.appliesTo}`
      : PASS_LABEL[proposal.pass];
  const lines = [
    `${lead}Read from "${prose}":`,
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
    '`tokenise` names the values in a sentence, one question at a time:',
    `  ${EXAMPLE}`,
    '  phyllum tokenise "16px spacing called space-md"',
    '  phyllum tokenise "heading 24px bold 1.2"',
    '  phyllum tokenise "#2563EB #10B981 #F59E0B"',
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

/**
 * The entries of the last queue nobody finished, or null.
 *
 * `pending` is an entry nobody has been asked about and `proposed` is one that
 * was asked and never answered — a run interrupted mid-question. Both are still
 * open; `written`, `merged`, `skipped`, `declined` and `already-named` are all
 * settled, and a settled entry is never raised twice.
 */
export const RESUMABLE = ['pending', 'proposed'];

/** The three passes a candidate can belong to; anything else is not one. */
export const PASSES = ['colours', 'numbers', 'typography'];

/**
 * Is this shape a candidate the queue can actually walk? (v0.3.0 M7)
 *
 * `.phyllum/session.json` is Phyllum's own file, but it is a *file* — a crash
 * mid-write leaves it truncated, and a curious user can edit it. `readState`
 * already survives JSON that does not parse; this is the other half, because an
 * entry that parses is not an entry that means anything. A candidate carries a
 * pass and a value, and the resumed run asks about *that* — so a candidate
 * missing either would be resumed into a proposal reading `value undefined`,
 * put to the user behind an acceptance gate, and written as nothing. A question
 * about nothing is worse than no question, so the shape is checked where the
 * queue is read rather than trusted all the way down to the proposal.
 */
export function isResumableCandidate(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  if (!PASSES.includes(candidate.pass)) return false;
  if (String(candidate.value ?? '').trim() === '') return false;
  // A typography reading is a size first; the rest of it fills from the CSS
  // defaults, visibly, exactly as a fresh reading does.
  if (candidate.pass === 'typography' && String(candidate.size ?? '').trim() === '') return false;
  return true;
}

export function unfinishedQueue(root) {
  const record = readState(root)?.tokenise;
  const entries = Array.isArray(record?.queue) ? record.queue : [];
  const open = entries.filter((entry) => RESUMABLE.includes(entry?.status));
  const pending = open.map((entry) => entry?.candidate).filter(isResumableCandidate);
  // A queue with nothing left to walk is no queue at all — including a queue
  // whose every open entry was unreadable. Returning null there is what sends
  // the run down the ordinary "what should I name?" path instead of resuming
  // into gibberish.
  if (pending.length === 0) return null;
  return {
    input: String(record.input ?? ''),
    pending,
    entries,
    // Said out loud rather than swallowed: a dropped entry is a value the user
    // typed that Phyllum can no longer account for.
    dropped: open.length - pending.length,
  };
}

export function resumeQuestion({ input, pending }) {
  const values = pending.map(describeValue).join(', ');
  return `"${input}" left ${pending.length} value${pending.length === 1 ? '' : 's'} unsettled — ${values}. Pick the queue up where it stood?`;
}

/** What the run says about entries the session file could not account for. */
export function renderDroppedNotice(dropped) {
  if (!dropped) return null;
  return (
    `${dropped} unfinished ${dropped === 1 ? 'entry' : 'entries'} in ${STATE_FILE} could not be read and ${dropped === 1 ? 'was' : 'were'} left out — ` +
    'tokenise the value again to pick it up.'
  );
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
    // A queue that was cut short is picked up where it stood, before anything
    // else is asked: the values are already read, and asking for them again is
    // asking the user to retype a sentence they already typed (§3.3).
    const unfinished = unfinishedQueue(root);
    if (unfinished && canAsk) {
      const answer = await ctx.ask(resumeQuestion(unfinished), [
        { action: 'resume', text: `resume — ${unfinished.pending.length} still to settle` },
        { action: 'skip', text: 'skip — leave the queue where it is' },
      ]);
      if (!isStop(answer)) {
        const out = [`Resuming "${unfinished.input}" — ${unfinished.pending.length} left.`];
        const dropped = renderDroppedNotice(unfinished.dropped);
        if (dropped) out.push(dropped);
        out.push('');
        const run = await runQueue(unfinished.pending, {
          ctx,
          root,
          model,
          input: unfinished.input,
          out,
          canAsk,
        });
        if (run.halted) return withRoute(out, ctx);
        if (run.written > 0 || run.merged > 0) {
          out.push('Your codebase was never read: `tokenise` reads the sentence, `assess` reads the code.', '');
        }
        return { out: out.join('\n'), code: 0 };
      }
    }

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

  // ---- the queue: one entry per value, in sentence order ------------------
  const out = [];
  const run = await runQueue(parsed.candidates, {
    ctx,
    root,
    model,
    input: parsed.input,
    out,
    canAsk,
  });

  if (run.halted) return withRoute(out, ctx);
  if (run.written === 0 && run.merged === 0) return { out: out.join('\n'), code: 0 };

  out.push('Your codebase was never read: `tokenise` reads the sentence, `assess` reads the code.', '');
  return { out: out.join('\n'), code: 0 };
}

/**
 * Walk the proposal queue, one entry at a time (v0.3.0 plan §3).
 *
 * The loop is the whole of what batch mode is. Every entry runs the protocol a
 * single-value sentence has always run — the role question, the already-named
 * check, the naming scales, collision suffixing, the confirmation, the
 * acceptance gate, the one write — and the only thing the queue adds is that
 * there is a next one. A skip or a refusal is local to its entry: nothing is
 * written for it and the queue moves on, which is what makes an interrupted
 * batch harmless rather than half-applied.
 */
async function runQueue(queue, { ctx, root, model, input, out, canAsk }) {
  const batch = queue.length > 1;
  let written = 0;
  let merged = 0;
  let backedUp = false;

  if (batch) {
    out.push(
      `Read ${queue.length} values from "${input}", one at a time and in that order:`,
      ...queue.map((item, index) => `  ${index + 1}. ${describeValue(item)}`),
      '',
    );
  }

  // One row per entry, from "nobody has been asked yet" to what became of it.
  const states = queue.map(() => ({ status: 'pending', name: null }));
  const mark = (index, status, name = null) => {
    states[index] = { status, name: name ?? states[index].name };
    saveQueue(root, input, queue, states);
  };
  saveQueue(root, input, queue, states);

  for (const [index, item] of queue.entries()) {
    let candidate = item;
    const lead = batch ? `(${index + 1} of ${queue.length}) ` : '';

    // ---- what a length applies to, when the sentence did not say ----------
    if (candidate.pass === 'numbers' && !candidate.roleFromProse) {
      if (canAsk) {
        const answer = await ctx.ask(
          `${lead}${roleQuestion(candidate)}`,
          ROLES.map((role) => ({ action: 'role', text: appliesToFor(role) })),
        );
        candidate = { ...candidate, role: resolveRole(answer), roleFromProse: true };
      } else {
        out.push(
          `"${input}" does not say what ${candidate.value} applies to, so I am reading it as ${appliesToFor(candidate.role)}.`,
          '',
        );
      }
    }

    // ---- a value the system already names ---------------------------------
    // Re-read per entry rather than once per run: a token accepted two entries
    // ago is a token the system already names, and naming it twice is the one
    // thing convergence exists to prevent.
    const existing = existingTokenFor(candidate, model);
    if (existing) {
      out.push(renderAlreadyNamed(candidate, existing));
      mark(index, 'already-named', existing.name);
      continue;
    }

    // ---- the name ----------------------------------------------------------
    const suggestion = candidate.nameFromProse ? null : suggestName(candidate, model);
    const proposal = proposalFrom(candidate, {
      name: candidate.name ?? suggestion.name,
      model,
      suggested: suggestion?.name ?? null,
    });

    mark(index, 'proposed', proposal.name);
    out.push(renderProposal(proposal, { prose: input, suggestion, lead }), '');

    // ---- confirming the name Phyllum chose --------------------------------
    const names = [...takenNames(model)];
    let decision = { proposal, action: 'confirm' };
    if (suggestion && canAsk) {
      const answer = await ctx.ask(`${lead}${questionFor(proposal)}`, suggestionsFor(proposal));
      decision = decide(proposal, answer, { names });
      if (decision.refused) {
        out.push(`  \`${decision.refused}\` is not a token or a proposal, so nothing was merged.`, '');
      }
    }

    const keep = accepted([decision]);
    if (keep.length === 0) {
      out.push(
        batch
          ? `Skipped ${describeValue(candidate)} — nothing written for it, and the rest of the queue stands.`
          : 'Nothing accepted, so nothing was written.',
        '',
      );
      mark(index, 'skipped');
      continue;
    }

    // ---- the acceptance gate. Only this branch writes. --------------------
    if (typeof ctx.confirm !== 'function') {
      out.push(NOT_WRITTEN, '');
      return { written, merged, halted: true };
    }

    const yes = await ctx.confirm(`Write \`${keep[0].name}\` to ${DESIGN_SYSTEM_FILE}?`);
    if (!yes) {
      out.push('Not accepted, so nothing was written.', '');
      mark(index, 'declined');
      continue;
    }

    const result = applyAcceptance(model, keep);
    // One accepted token, one write, through the one funnel. The `.bak` is taken
    // before the *first* write of the run only, so the undo it holds is the file
    // as it stood before the whole sentence rather than before its last value.
    writeDesignSystem(root, render(model), { backup: !backedUp });
    backedUp = true;

    if (result.written.length === 0) {
      merged += 1;
      out.push(`Merged into \`${keep[0].mergedInto}\` — no second token was made.`);
      mark(index, 'merged', keep[0].mergedInto);
    } else {
      written += 1;
      out.push(`Wrote \`${result.written[0].name}\` to ${DESIGN_SYSTEM_FILE}.`);
      mark(index, 'written', result.written[0].name);
    }
    for (const entry of result.reconciled) {
      out.push(`  ${entry.component} now references \`${entry.token}\` — its Backlog entry is cleared.`);
    }
    out.push('');
  }

  return { written, merged, halted: false };
}

/**
 * The queue, in `.phyllum/session.json` — every entry, settled or still pending.
 *
 * Written after each entry rather than at the end, because the point of it is
 * the run that does not reach the end: a batch cut short leaves an honest record
 * of what was written, what was skipped, and what nobody was asked about yet.
 */
function saveQueue(root, input, queue, states) {
  const entries = queue.map((item, index) => ({
    value: describeValue(item),
    pass: item.pass,
    name: states[index]?.name ?? item.name ?? null,
    status: states[index]?.status ?? 'pending',
    // The entry as the reader produced it, so a resumed run asks the same
    // questions about the same value rather than re-reading a sentence that may
    // no longer be anywhere.
    candidate: item,
  }));
  return writeState(root, {
    tokenise: {
      readAt: 'this run',
      source: 'prose',
      input,
      proposed: entries.length,
      queue: entries,
      // The proposals key predates the queue and still says what it always said:
      // what this run is about, by name.
      proposals: entries.map((entry) => ({
        name: entry.name ?? entry.value,
        pass: entry.pass,
        value: entry.value,
        count: 1,
      })),
    },
  });
}
