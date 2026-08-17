/**
 * `phyllum delete` — the removal verb (v0.5.0 plan §4).
 *
 * This is the one destructive command in the product, and everything about it
 * is built as the inverse of `create`'s ease. A component that goes leaves
 * generated code behind in the codebase with nothing recorded to match it, so
 * the flow slows down three times before it writes: a breaking-change warning
 * that always prints, a hard block when the component is in use, and a second
 * confirmation on top of the ordinary acceptance gate that asks for the
 * component's **name, typed back**.
 *
 * The shape is `update`'s, deliberately: tokens in, text out, nothing printed
 * here, nothing read from `process`, and the one write funnel at the end of the
 * one branch that writes. The conversation is `update component`'s posture too —
 * numbers or words both pick, and a skip at any depth writes nothing.
 *
 * Three of the never-list items (§4.4) are structural rather than remembered: it
 * holds no path but `DESIGN-SYSTEM.md`, it reaches no writer but
 * `writeDesignSystem`, and the only call to it sits after **both** gates.
 *
 * The write is **surgical**, not a re-render. Only the lines of the removed
 * entry and its Backlog lines go; every other byte of the file — the user's
 * prose, their whitespace, their column shapes, the other components' code
 * blocks — is the file they had. That is `lib/applied.js`'s posture applied to a
 * removal, and it is what makes "nothing else is touched" a fact about the diff
 * rather than a promise in the report.
 */

import fs from 'node:fs';
import path from 'node:path';

import { APPLIED_WORDS, appliedEvidence, appliedNotices, readAppliedFlags } from './applied.js';
import {
  EMPTY_BACKLOG_NOTE,
  EMPTY_COMPONENTS_NOTE,
  HEADING_BACKLOG,
  HEADING_COMPONENTS,
  HEADING_TOKENS,
  parse,
} from './design-system.js';
import { componentEntries } from './update-command.js';
import { deleteCopy, deleteGrammar, deleteSpecNotices, isDeleteChainWord } from './delete-spec.js';
import { renderSpecNotices } from './assess-report.js';
import { resolvePick } from './tokenise-command.js';
import { DESIGN_SYSTEM_FILE, BACKUP_FILE, PRD_FILE, writeDesignSystem } from './write.js';

// ---------------------------------------------------------------------------
// What the user reads
// ---------------------------------------------------------------------------

/** `delete` with no way to ask: what it takes, in the grammar table's words. */
export function renderUsage() {
  return [
    '`delete` removes one component your design system records:',
    ...deleteGrammar().map((row) => `  ${row.typed.padEnd(30)}${row.opens}`),
    '',
    `It edits ${DESIGN_SYSTEM_FILE} and nothing else — never your codebase, never ${PRD_FILE}.`,
  ].join('\n');
}

/** The numbered list: every recorded component, its archetype and its reading. */
export function renderComponentList(entries) {
  const width = Math.max(...entries.map((entry) => entry.name.length));
  const archetypes = Math.max(
    ...entries.map((entry) => (entry.archetype ?? '(no spec block)').length),
  );
  return [
    `Components — ${entries.length} recorded:`,
    ...entries.map((entry, index) => {
      const archetype = (entry.archetype ?? '(no spec block)').padEnd(archetypes);
      const reading = entry.applied === null ? '' : `  ${APPLIED_WORDS[String(entry.applied)]}`;
      return `  ${index + 1}. ${entry.name.padEnd(width)}  ${archetype}${reading}`.trimEnd();
    }),
    deleteCopy('escape'),
  ].join('\n');
}

/** One scanned site, as evidence a person can go and look at. */
export function renderSite(site) {
  const where = site.files.slice(0, 3).join(', ');
  const more = site.files.length > 3 ? `, +${site.files.length - 3} more` : '';
  return `    ${site.signature}  ×${site.count}  (${where}${more})`;
}

/** What the proposal names before the gate: exactly what goes, and nothing more. */
export function renderProposal(entry, plan) {
  const blocks = entry.component?.blocks ?? [];
  const lines = [
    `Deleting \`${entry.name}\` removes exactly this from ${DESIGN_SYSTEM_FILE}:`,
    `  the \`### ${entry.name}\` entry — ${plural(blocks.length, 'block')}` +
      `${blocks.length > 0 ? ` (${blocks.map((block) => block.lang || 'text').join(', ')})` : ''}` +
      `, ${plural(plan.entryLines, 'line')} in all`,
  ];
  if (plan.backlog.length === 0) {
    lines.push('  no Backlog line names it, so no Backlog line changes');
  } else {
    lines.push(`  ${plural(plan.backlog.length, 'Backlog line')}:`);
    for (const line of plan.backlog) lines.push(`    - ${line.text}`);
  }
  lines.push('  nothing else in the file is touched.');
  return lines.join('\n');
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------
// Reading the file — where an entry sits, and which Backlog lines are its own
// ---------------------------------------------------------------------------

/**
 * Where each component entry sits in the raw text, heading included.
 *
 * The walk mirrors `lib/design-system.js`'s parser line for line — same fencing
 * rule, same "a fence only opens inside a component" rule — because a second
 * reader that disagreed with the first about where an entry ends would delete
 * somebody's prose. The range runs from the `###` heading to the line before the
 * next heading, so the blank line that separates two entries goes with the one
 * above it and the file keeps its shape.
 */
export function componentRanges(text) {
  const lines = String(text).split('\n');
  const found = [];
  let section = 'header';
  let fence = null;
  let current = null;

  const close = (end) => {
    if (!current) return;
    current.end = end;
    found.push(current);
    current = null;
  };

  lines.forEach((line, index) => {
    if (fence) {
      const closing = line.match(/^(`{3,})\s*$/);
      if (closing && closing[1].length >= fence.length) fence = null;
      return;
    }

    const open = line.match(/^(`{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
    if (open && section === 'components' && current) {
      fence = open[1];
      return;
    }

    const trimmed = line.trim();
    if (trimmed === HEADING_TOKENS || trimmed === HEADING_COMPONENTS || trimmed === HEADING_BACKLOG) {
      close(index);
      section = trimmed === HEADING_TOKENS ? 'tokens' : trimmed === HEADING_COMPONENTS ? 'components' : 'backlog';
      return;
    }
    if (section !== 'components') return;
    const heading = trimmed.match(/^###\s+(.+)$/);
    if (heading) {
      close(index);
      current = { name: heading[1].trim(), start: index };
    }
  });

  close(lines.length);
  return found;
}

/** Every Backlog item, with the line it is written on. */
export function backlogLines(text) {
  const lines = String(text).split('\n');
  const out = [];
  let section = 'header';
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === HEADING_TOKENS || trimmed === HEADING_COMPONENTS || trimmed === HEADING_BACKLOG) {
      section = trimmed === HEADING_BACKLOG ? 'backlog' : 'other';
      return;
    }
    if (section !== 'backlog') return;
    const item = trimmed.match(/^-\s+(.*)$/);
    if (item) out.push({ index, text: item[1] });
  });
  return out;
}

const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** Does this line name that component, whole and on its own? `update`'s rule. */
export function namesComponent(line, name) {
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9_\`-])\`?${escapeRe(name)}\`?($|[^A-Za-z0-9_\`-])`,
    'i',
  );
  return pattern.test(String(line ?? ''));
}

/**
 * The Backlog lines that belong to this component, and only to it.
 *
 * A line naming a *second* recorded component is left alone. `Button` and
 * `Button/Primary` are two entries, and a line about the second is not the
 * first's to take with it — the alternative is a deletion quietly widening past
 * the thing that was accepted, which is the one thing a destructive verb may
 * never do.
 */
export function backlogFor(text, name, names = []) {
  const others = names.filter((other) => other !== name);
  return backlogLines(text).filter(
    (line) =>
      namesComponent(line.text, name) &&
      !others.some((other) => namesComponent(line.text, other)),
  );
}

/** Everything one deletion removes, worked out before anything is written. */
export function planDelete(text, name) {
  const ranges = componentRanges(text);
  const range = ranges.find((item) => item.name === name) ?? null;
  const backlog = backlogFor(text, name, ranges.map((item) => item.name));
  return {
    name,
    range,
    entryLines: range ? range.end - range.start : 0,
    backlog,
    lastComponent: ranges.length === 1,
    backlogEmptied: backlog.length > 0 && backlogLines(text).length === backlog.length,
  };
}

/**
 * The file with that entry and its Backlog lines gone, and nothing else changed.
 *
 * Two notes go back in when a section empties, because `DESIGN-SYSTEM.md`'s
 * shape is a contract: an empty Components section carries its "no components
 * yet" line, and an empty Backlog carries "nothing outstanding". Removing the
 * last component must leave a file `init` would recognise, not a bare heading.
 */
export function applyDelete(text, plan) {
  if (!plan.range) return String(text);
  const lines = String(text).split('\n');
  const drop = new Set();
  for (let i = plan.range.start; i < plan.range.end; i += 1) drop.add(i);
  for (const line of plan.backlog) drop.add(line.index);

  const out = [];
  lines.forEach((line, index) => {
    if (!drop.has(index)) {
      out.push(line);
      return;
    }
    if (index === plan.range.start && plan.lastComponent) out.push(EMPTY_COMPONENTS_NOTE, '');
    if (plan.backlogEmptied && index === plan.backlog[0].index) out.push(EMPTY_BACKLOG_NOTE);
  });
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// The in-use block (§4.2 step 3)
// ---------------------------------------------------------------------------

/**
 * Is this component in use, and what says so?
 *
 * The flag when there is one, a live check when there is not. Absence of a flag
 * means `apply` has never run here, so there is nothing to read — it never means
 * "not in use", and reading it as `false` is exactly the silent yes a
 * destructive verb must not have.
 */
export function inUseCheck(root, entry, { signatures = null } = {}) {
  if (entry.applied === true) {
    return { inUse: true, source: 'flag', sites: [] };
  }
  if (entry.applied === false) {
    return { inUse: false, source: 'flag', sites: [] };
  }
  const sites = appliedEvidence(root, entry.component, { signatures });
  return { inUse: sites.length > 0, source: 'live', sites };
}

/** The refusal: what was seen, and the way out. */
export function renderRefusal(entry, check) {
  const lines = [deleteCopy('in-use', { name: entry.name })];
  if (check.source === 'flag') {
    lines.push(
      `  its spec block records \`applied: true\`, which \`phyllum apply\` derived from a read of this codebase.`,
    );
  } else {
    lines.push(
      `  no \`applied:\` line is recorded, so the codebase was read now — ` +
        `${plural(check.sites.length, 'site')} already ${check.sites.length === 1 ? 'is' : 'are'} this component:`,
      ...check.sites.map(renderSite),
    );
  }
  lines.push(deleteCopy('way-out'));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * Run `delete`.
 *
 * ctx: { cwd, ask, confirm }
 *   ask(question)      the pick, and the second confirmation — the typed name
 *   confirm(question)  the acceptance gate; without it nothing is written,
 *                      because nothing was accepted
 *
 * `ctx.yes` is deliberately never read here. `--yes` answers the acceptance gate
 * the way it answers every other one, and it can never answer the second
 * confirmation, because that answer is a name only a person can type (§4.3).
 */
export async function runDelete(args = [], ctx = {}) {
  const root = ctx.cwd;
  const file = path.join(root, DESIGN_SYSTEM_FILE);
  const text = fs.readFileSync(file, 'utf8');
  const model = parse(text);
  const out = [];

  // A row the contract reader had to drop is said before anything is asked. It
  // is empty on every shipped copy of `refs/delete/`; when it is not, this run
  // is being conducted with one of its own rules missing.
  const notices = renderSpecNotices(deleteSpecNotices(), { ran: 'this run' });
  if (notices.length > 0) out.push(...notices, '');

  // And a reading of the user's own file that nobody can vouch for — a
  // hand-mangled `applied:` line, or one name over two entries. Neither is
  // fatal and neither is silent: the run says so, then goes and looks.
  const fileNotices = appliedNotices(text);
  if (fileNotices.length > 0) out.push(...fileNotices, '');

  // ---- the chain word: reserved, and refused with the reason ---------------
  const first = args[0];
  const chained = first && !first.quoted && isDeleteChainWord(String(first.value ?? ''));
  if (chained) {
    out.push(deleteCopy('token-refused'), '', deleteCopy('not-written'), '');
    return { out: out.join('\n'), code: 0 };
  }

  const typed = args
    .map((argument) => String(argument?.value ?? argument ?? ''))
    .join(' ')
    .trim();

  // ---- the recorded components, with their readings ------------------------
  const flags = readAppliedFlags(text);
  const entries = componentEntries(model).map((entry) => ({
    ...entry,
    applied: flags.has(entry.name) ? flags.get(entry.name) : null,
  }));

  // Nothing to delete is not a dead end, and it is not a question either — so
  // it is answered before the run asks whether anybody is here to ask.
  if (entries.length === 0) {
    out.push(deleteCopy('no-components'), deleteCopy('create-pointer'), '');
    return { out: out.join('\n'), code: 0 };
  }

  // ---- somebody has to be here to type the name back (§4.3) ---------------
  if (typeof ctx.ask !== 'function') {
    out.push(renderUsage(), '', deleteCopy('non-interactive'), '', deleteCopy('not-written'), '');
    return { out: out.join('\n'), code: 1 };
  }

  // ---- step 1: the pick, pre-answered or asked ----------------------------
  let target = null;
  if (typed !== '') {
    target = entries.find((entry) => entry.name.toLowerCase() === typed.toLowerCase()) ?? null;
    // An unknown name lists and asks rather than failing: a typo is a question.
    if (!target) out.push(deleteCopy('unknown-name', { name: typed }), '');
  }

  if (!target) {
    out.push(renderComponentList(entries), '');
    const chosen = resolvePick(
      await ctx.ask(deleteCopy('pick-question'), []),
      entries.map((entry) => ({ pick: entry.name, printsAs: entry.name, entry })),
    );
    if (chosen.action === 'skip') {
      out.push(deleteCopy('not-written'), '');
      return { out: out.join('\n'), code: 0 };
    }
    if (chosen.action === 'pick') target = chosen.row.entry;
    else {
      const found = entries.find(
        (entry) => entry.name.toLowerCase() === chosen.prose.trim().toLowerCase(),
      );
      if (!found) {
        out.push(
          deleteCopy('unknown-name', { name: chosen.prose }),
          '',
          deleteCopy('not-written'),
          '',
        );
        return { out: out.join('\n'), code: 0 };
      }
      target = found;
    }
  }

  // ---- the name has to identify one entry -------------------------------
  // Two `### <name>` headings under one name make the pick ambiguous: the
  // reading would come from one block and the removed lines from the other. A
  // destructive verb does not resolve that by picking the first one.
  const carrying = componentRanges(text).filter((range) => range.name === target.name);
  if (carrying.length > 1) {
    out.push(
      `\`${target.name}\` is recorded twice in ${DESIGN_SYSTEM_FILE}, so the name does not say ` +
        `which entry to delete. Give the two entries different names, then run \`phyllum delete\` again.`,
      '',
      deleteCopy('not-written'),
      '',
    );
    return { out: out.join('\n'), code: 0 };
  }

  // ---- step 2: the warning, always, before any question about proceeding ---
  out.push(deleteCopy('warning', { name: target.name }), '');

  // ---- step 3: the in-use block -------------------------------------------
  const check = inUseCheck(root, target, { signatures: ctx.signatures ?? null });
  if (check.inUse) {
    out.push(renderRefusal(target, check), '', deleteCopy('not-written'), '');
    // A refusal honoured is not an error.
    return { out: out.join('\n'), code: 0 };
  }

  // ---- step 4: the proposal, then the acceptance gate ----------------------
  const plan = planDelete(text, target.name);
  out.push(renderProposal(target, plan), '');

  if (typeof ctx.confirm !== 'function') {
    out.push(deleteCopy('not-written'), '');
    return { out: out.join('\n'), code: 0 };
  }
  const accepted = await ctx.confirm(deleteCopy('gate-question', { name: target.name }));
  if (!accepted) {
    out.push('Not accepted, so nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }

  // ---- step 5: the second confirmation — the name, typed back -------------
  const answer = String(await ctx.ask(deleteCopy('confirm-question', { name: target.name }), []));
  const said = answer.trim().replace(/`/g, '').trim();
  if (said.toLowerCase() !== target.name.toLowerCase()) {
    out.push(deleteCopy('confirm-refused', { name: target.name }), '', deleteCopy('not-written'), '');
    return { out: out.join('\n'), code: 0 };
  }

  // ---- step 6: the one write ----------------------------------------------
  writeDesignSystem(root, applyDelete(text, plan));

  out.push(`Deleted \`${target.name}\` from ${DESIGN_SYSTEM_FILE}.`);
  out.push(`  the entry went — ${plural(plan.entryLines, 'line')}, spec block and code block`);
  out.push(
    plan.backlog.length === 0
      ? '  no Backlog line named it, so none was removed'
      : `  ${plural(plan.backlog.length, 'Backlog line')} went with it, in the same write`,
  );
  out.push(deleteCopy('undo'));
  if (fs.existsSync(path.join(root, PRD_FILE))) out.push(deleteCopy('prd-note'));
  out.push('');
  return { out: out.join('\n'), code: 0 };
}
