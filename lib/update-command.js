/**
 * `phyllum update` — the design-system editing verb (v0.4.0 plan §6).
 *
 * Every other command adds, reads, or pushes outward. This one **changes what is
 * already recorded**, and it is the second time the word has changed hands in two
 * releases: up to v0.2.3 `update` moved the install (that is `upgrade` now), in
 * v0.3.0 it was `apply`'s alias (that is `apply`, under its own name), and from
 * v0.4.0 it is its own command with its own contract in `skill/refs/update.md`.
 *
 * The shape is `tokenise`'s, deliberately: tokens in, text out, nothing printed
 * here, nothing read from `process`, and the one write funnel at the end of the
 * one branch that writes. The conversation is the tokenise kind picker's posture
 * too — numbers or words both pick, free text is honoured everywhere and read as
 * prose, and a skip at any depth writes nothing.
 *
 * What it never does is the whole of §6.5, and three of them are structural
 * rather than remembered: it holds no path but `DESIGN-SYSTEM.md`, it reaches no
 * writer but `writeDesignSystem`, and the only call to it sits after the
 * acceptance gate.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parse, render } from './design-system.js';
import { comparisonValue, normaliseValue, toPx } from './tokenise.js';
import { valuesInProse } from './tokenise-prose.js';
import { appliesToFor } from './tokenise-spec.js';
import { pickLabel, resolvePick } from './tokenise-command.js';
import {
  isChainWord,
  renamePhrases,
  updateCopy,
  updateGrammar,
  updateMenuOptions,
  updateQuestionFor,
  updateTypeOptions,
} from './update-spec.js';
import { DESIGN_SYSTEM_FILE, writeDesignSystem } from './write.js';

const NOT_WRITTEN = `Nothing has been written — Phyllum writes ${DESIGN_SYSTEM_FILE} only when you accept.`;

/** The section headings, as the proposal names them. */
const SECTION_LABEL = { colours: 'Colours', numbers: 'Numbers', typography: 'Typography' };

/** How many times a question is put again before the run gives up saying so. */
const MAX_FOLLOW_UPS = 2;

// ---------------------------------------------------------------------------
// What the user reads
// ---------------------------------------------------------------------------

/** `update` with no way to ask: what it takes, in the grammar table's words. */
export function renderUsage() {
  return [
    '`update` changes something your design system already records:',
    ...updateGrammar().map((row) => `  ${row.typed.padEnd(36)}${row.opens}`),
    '',
    'It edits DESIGN-SYSTEM.md and nothing else. Applying the design system to your',
    'code is `phyllum apply`, under its own name.',
  ].join('\n');
}

/** One picker block: the question, its numbered rows, the escape line. */
function renderPick(question, rows) {
  return [
    question,
    ...rows.map((row, index) => `  ${index + 1}. ${row.printsAs}`),
    updateCopy('escape'),
  ].join('\n');
}

/**
 * The empty run's menu — the one place the `apply` breadcrumb prints.
 *
 * It prints here and nowhere else on purpose (§6.1): a user who typed `update
 * token` did not mistype anything, and a pointer on every question would be a
 * command apologising for its own name.
 */
export function renderMenu() {
  return [renderPick(updateCopy('menu-question'), updateMenuOptions()), '', updateCopy('breadcrumb')].join(
    '\n',
  );
}

/** The type question `update token` opens with. */
export function renderTypePicker() {
  return renderPick(updateCopy('type-question'), updateTypeOptions());
}

/**
 * One prose question, composed from its table row: the ask, the target, the
 * hint, an example, the escape. Nothing here is spelled in the code — a question
 * whose copy lived in two places would drift out of one of them.
 */
export function changeQuestion(question, target) {
  const row = updateQuestionFor(question);
  if (!row) return `What is changing about \`${target}\`? (or "skip")`;
  return `${row.asks} \`${target}\`? ${row.hint} — e.g. "${row.example}". (or "skip")`;
}

// ---------------------------------------------------------------------------
// The recorded things, as rows
// ---------------------------------------------------------------------------

/** The value of one token row, in the terms its section uses. */
export function describeToken(entry) {
  if (entry.section === 'typography') {
    return `${entry.row[1]} / ${entry.row[2]} / ${entry.row[3]}`;
  }
  if (entry.section === 'numbers') return `${entry.row[1]}  (${entry.row[2]})`;
  return entry.row[1];
}

/**
 * Every token of one type, in file order.
 *
 * The `Role` cell narrows Numbers by its "applies to" column, so *a border
 * radius* lists radii and not spacings — the same column that keeps a 12px
 * radius and a 12px padding two different facts everywhere else.
 */
export function tokensOfType(model, type) {
  if (!type.section) return allTokens(model);
  const rows = model?.tokens?.[type.section] ?? [];
  const label = type.role ? appliesToFor(type.role) : null;
  const out = [];
  rows.forEach((row, index) => {
    if (label !== null && row[2] !== label) return;
    out.push({ section: type.section, index, row, name: row[0] });
  });
  return out;
}

/** Every recorded token, whatever its section — what `something else` lists. */
export function allTokens(model) {
  const out = [];
  for (const section of ['colours', 'numbers', 'typography']) {
    (model?.tokens?.[section] ?? []).forEach((row, index) => {
      out.push({ section, index, row, name: row[0] });
    });
  }
  return out;
}

/** The numbered list of a type's tokens — every row of the section, never elided. */
export function renderTokenList(type, entries) {
  const width = Math.max(...entries.map((entry) => entry.name.length));
  return [
    `${type.section ? SECTION_LABEL[type.section] : 'Every token'} — ${entries.length} token${entries.length === 1 ? '' : 's'}:`,
    ...entries.map(
      (entry, index) => `  ${index + 1}. ${entry.name.padEnd(width)}  ${describeToken(entry)}`,
    ),
  ].join('\n');
}

/** An empty section says so and points at the command that fills it. */
export function renderEmptySection(type) {
  const what = pickLabel(type);
  return [
    `There are no ${what} tokens in ${DESIGN_SYSTEM_FILE} yet, so there is nothing to update.`,
    '`phyllum tokenise "our brand blue #2563EB"` names the first one.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Reading a target out of prose (§6.2)
// ---------------------------------------------------------------------------

const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** Does this sentence name that recorded thing, whole and on its own? */
export function namesTarget(prose, name) {
  const text = String(prose ?? '');
  const pattern = new RegExp(`(^|[^A-Za-z0-9_\`-])\`?${escapeRe(name)}\`?($|[^A-Za-z0-9_\`-])`, 'i');
  return pattern.test(text);
}

/**
 * What a sentence is about — exactly, or not at all.
 *
 * The rule is narrow because the never-list forbids a guess: an **exact** whole
 * name, backticked or bare, resolves; two different names resolve to nothing and
 * get the disambiguation question; no name at all resolves to nothing and gets
 * the menu. There is no prefix match, no substring match and no edit distance,
 * so a sentence about `color-primar` is asked about rather than quietly applied
 * to `color-primary`.
 */
export function matchTarget(prose, model) {
  const found = [];
  for (const entry of allTokens(model)) {
    if (namesTarget(prose, entry.name)) found.push({ kind: 'token', name: entry.name, entry });
  }
  for (const component of model?.components ?? []) {
    if (namesTarget(prose, component.name)) found.push({ kind: 'component', name: component.name });
  }
  const names = [...new Set(found.map((item) => item.name))];
  if (names.length === 1) return { matched: found[0], candidates: found };
  return { matched: null, candidates: found };
}

// ---------------------------------------------------------------------------
// Reading a change out of prose (§6.4)
// ---------------------------------------------------------------------------

/** The new name a change sentence spells, or null. Only the table's phrases count. */
export function renameInProse(prose) {
  const text = String(prose ?? '');
  for (const phrase of renamePhrases()) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9-])${escapeRe(phrase)}\\s+\`?([A-Za-z][A-Za-z0-9-]*)\`?`, 'i');
    const match = text.match(pattern);
    if (match) return match[2];
  }
  return null;
}

/**
 * What one change sentence says, against the token it is about.
 *
 * Only what the sentence mentions comes back. A typography reading whose weight
 * the sentence never stated keeps the weight it had — the CSS defaults fill a
 * *new* token's gaps, and filling an existing token's from them would change a
 * slot the prose did not mention, which is on the never-list.
 */
export function readChange(prose, entry) {
  const { candidates } = valuesInProse(prose);
  const name = renameInProse(prose);
  const row = [...entry.row];
  let changedValue = false;

  const colour = candidates.find((item) => item.pass === 'colours');
  const length = candidates.find((item) => item.pass === 'numbers');
  const reading = candidates.find((item) => item.pass === 'typography');

  if (entry.section === 'colours' && colour) {
    row[1] = colour.value;
    changedValue = true;
  }
  if (entry.section === 'numbers' && (length || reading)) {
    row[1] = (length ?? reading).value;
    changedValue = true;
  }
  if (entry.section === 'typography' && (reading || length)) {
    if (reading) {
      const implied = reading.implied ?? [];
      row[1] = reading.size;
      if (!implied.some((item) => item.startsWith('font-weight'))) row[2] = String(reading.weight);
      if (!implied.some((item) => item.startsWith('line-height'))) row[3] = String(reading.lineHeight);
    } else {
      row[1] = length.value;
    }
    changedValue = true;
  }

  if (name) row[0] = name;
  return { row, name: name ?? null, changedValue, changed: changedValue || Boolean(name) };
}

// ---------------------------------------------------------------------------
// Convergence, re-run on an edit (§6.4)
// ---------------------------------------------------------------------------

/**
 * The token that already holds this value, or null.
 *
 * The comparison is §3.1's, so a colour compares by its channels and
 * `rgba(37, 99, 235, 1)` **is** the `#2563EB` a system already names. A number
 * collides only inside its own "applies to", because a 12px radius and a 12px
 * padding are different facts.
 */
export function collisionFor(model, entry, row) {
  const rows = model?.tokens?.[entry.section] ?? [];
  const value = row[1];
  for (const [index, other] of rows.entries()) {
    if (index === entry.index) continue;
    if (entry.section === 'colours') {
      if (comparisonValue(other[1]) === comparisonValue(value)) return other[0];
      continue;
    }
    if (entry.section === 'numbers') {
      if (other[2] !== row[2]) continue;
      const px = toPx(value);
      const same =
        normaliseValue(other[1]) === normaliseValue(value) ||
        (px !== null && toPx(other[1]) !== null && toPx(other[1]) === px);
      if (same) return other[0];
      continue;
    }
    if (normaliseValue(other[1]) === normaliseValue(value)) return other[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// The rename ripple (§6.4)
// ---------------------------------------------------------------------------

/**
 * Everything a rename has to rewrite, worked out before anything is written.
 *
 * Two kinds of reference and no third: a **spec slot** whose value is the old
 * name, and a **Backlog line** naming it. Both are rewritten in the same write
 * as the token row itself, so the file is never on disk with a reference
 * pointing at a name that no longer exists — a rename that silently orphaned its
 * references would be a lie of omission.
 *
 * The plan is computed first and applied after the gate, because it is also what
 * the proposal *reports*: accepting a rename is accepting all of it, and that is
 * only true if the count was on screen before the question.
 */
export function planRename(model, oldName, newName) {
  const slot = new RegExp(`^(\\s*[A-Za-z0-9_.\\/-]+:\\s*)\`?${escapeRe(oldName)}\`?(\\s*)(#.*)?$`);
  const word = new RegExp(`(^|[^A-Za-z0-9_-])(\`?)${escapeRe(oldName)}(\`?)($|[^A-Za-z0-9_-])`, 'g');

  const slots = [];
  for (const component of model?.components ?? []) {
    for (const [blockIndex, block] of (component.blocks ?? []).entries()) {
      const lines = block.content.split('\n');
      lines.forEach((line, lineIndex) => {
        const match = line.match(slot);
        if (!match) return;
        slots.push({
          component: component.name,
          block: blockIndex,
          line: lineIndex,
          text: `${match[1]}${newName}${match[2] ?? ''}${match[3] ?? ''}`,
          slot: match[1].trim().replace(/:$/, ''),
        });
      });
    }
  }

  const backlog = [];
  (model?.backlog ?? []).forEach((line, index) => {
    word.lastIndex = 0;
    if (!word.test(line)) return;
    word.lastIndex = 0;
    backlog.push({ index, text: line.replace(word, `$1$2${newName}$3$4`) });
  });

  return { oldName, newName, slots, backlog };
}

/** Apply a rename plan to the model. Called once, after the gate. */
export function applyRename(model, plan) {
  for (const entry of plan.slots) {
    const component = model.components.find((item) => item.name === entry.component);
    const block = component.blocks[entry.block];
    const lines = block.content.split('\n');
    lines[entry.line] = entry.text;
    block.content = lines.join('\n');
  }
  for (const entry of plan.backlog) model.backlog[entry.index] = entry.text;
  return model;
}

/** What the ripple says out loud, before the gate. */
export function renderRipple(plan) {
  if (plan.slots.length === 0 && plan.backlog.length === 0) {
    return `  nothing else references \`${plan.oldName}\`, so nothing else changes`;
  }
  const parts = [];
  if (plan.slots.length > 0) {
    const where = [...new Set(plan.slots.map((entry) => entry.component))].join(', ');
    parts.push(`${plan.slots.length} spec slot${plan.slots.length === 1 ? '' : 's'} (${where})`);
  }
  if (plan.backlog.length > 0) {
    parts.push(`${plan.backlog.length} Backlog line${plan.backlog.length === 1 ? '' : 's'}`);
  }
  return `  renaming also rewrites ${parts.join(' and ')} — in the same write, and nothing else`;
}

// ---------------------------------------------------------------------------
// The proposal
// ---------------------------------------------------------------------------

/** Old and new, side by side. */
export function renderProposal(entry, next) {
  const before = describeToken(entry);
  const after = describeToken({ ...entry, row: next });
  const lines = [`\`${entry.name}\` in ${SECTION_LABEL[entry.section]}:`];
  lines.push(
    before === after ? `  value  ${before} (unchanged)` : `  value  ${before} → ${after}`,
  );
  lines.push(
    entry.name === next[0]
      ? `  name   ${entry.name} (unchanged)`
      : `  name   ${entry.name} → ${next[0]}`,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * Run `update`.
 *
 * ctx: { cwd, ask, confirm }
 *   ask(question, suggestions)  the menu, the type question, the pick, the change
 *   confirm(question)           the acceptance gate; without it nothing is
 *                               written, because nothing was accepted
 */
export async function runUpdate(args = [], ctx = {}) {
  const root = ctx.cwd;
  const model = parse(fs.readFileSync(path.join(root, DESIGN_SYSTEM_FILE), 'utf8'));
  const canAsk = typeof ctx.ask === 'function';

  // ---- the chain word, then the sentence ----------------------------------
  const first = args[0];
  const chained = first && !first.quoted && isChainWord(String(first.value ?? ''));
  const chain = chained ? String(first.value).toLowerCase() : null;
  const prose = (chained ? args.slice(1) : args)
    .map((argument) => String(argument?.value ?? argument ?? ''))
    .join(' ')
    .trim();

  // A menu with nobody to pick is a wall, so a run with no way to ask prints the
  // grammar and stops — the same posture the tokenise picker keeps.
  if (!canAsk) return { out: `${renderUsage()}\n\n${NOT_WRITTEN}\n`, code: 1 };

  const out = [];

  if (chain === 'component') return componentSeam(out, prose);
  if (chain === 'token') return updateToken(out, { ctx, root, model, prose });

  // ---- a sentence with no chain word: read it for its target ---------------
  if (prose !== '') {
    const { matched, candidates } = matchTarget(prose, model);
    if (matched?.kind === 'component') return componentSeam(out, prose);
    if (matched?.kind === 'token') {
      return updateToken(out, { ctx, root, model, prose, entry: matched.entry });
    }
    if (candidates.length > 0) {
      const picked = await disambiguate(ctx, candidates, prose, out);
      if (!picked) return { out: `${out.join('\n')}\n${NOT_WRITTEN}\n`, code: 0 };
      if (picked.kind === 'component') return componentSeam(out, prose);
      return updateToken(out, { ctx, root, model, prose, entry: picked.entry });
    }
    out.push(
      `Nothing in ${DESIGN_SYSTEM_FILE} is named in "${prose}", and Phyllum never guesses a target.`,
      '',
    );
  }

  // ---- the menu ------------------------------------------------------------
  const picked = resolvePick(await ctx.ask(renderMenu(), []), updateMenuOptions());
  if (picked.action === 'skip') return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };
  if (picked.action === 'prose') {
    const { matched } = matchTarget(picked.prose, model);
    if (matched?.kind === 'component') return componentSeam(out, picked.prose);
    if (matched?.kind === 'token') {
      return updateToken(out, { ctx, root, model, prose: picked.prose, entry: matched.entry });
    }
    out.push(
      `Nothing in ${DESIGN_SYSTEM_FILE} is named in "${picked.prose}", and Phyllum never guesses a target.`,
      '',
    );
    return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };
  }

  if (picked.row.chain === 'component') return componentSeam(out, prose);
  return updateToken(out, { ctx, root, model, prose: '' });
}

/** The disambiguation question — never a guess, and never a dead end. */
async function disambiguate(ctx, candidates, prose, out) {
  const rows = candidates.map((item) => ({
    pick: item.name,
    printsAs: `${item.name} — the recorded ${item.kind}`,
    item,
  }));
  out.push(`"${prose}" could mean ${rows.length} recorded things, so I am not guessing.`, '');
  const answer = resolvePick(
    await ctx.ask(renderPick('Which one are you updating?', rows), []),
    rows,
  );
  if (answer.action === 'pick') return answer.row.item;
  return null;
}

/**
 * `update component`, until M6 (§6.3).
 *
 * The chain word resolves, the menu row is live, and the seam says plainly what
 * is not built yet and which door exists today. A row that silently did nothing
 * would be the dead end the never-list forbids.
 */
function componentSeam(out, prose) {
  out.push(
    '`update component` is not built yet — it lands in v0.4.0 M6, riding the revision flow `create` already opens.',
    'Today that door is open under its own name:',
    `  phyllum create "${prose || '<the component and what changes about it>'}"`,
    'naming a component you already have opens a revision rather than a duplicate.',
    '',
    NOT_WRITTEN,
    '',
  );
  return { out: out.join('\n'), code: 0 };
}

/**
 * `update token` — type, list, pick, prose, proposal, gate, one write (§6.4).
 *
 * `entry` is set when the target was already read out of a sentence; without it
 * the flow opens at the type question, which is where an empty run starts.
 */
async function updateToken(out, { ctx, root, model, prose, entry = null }) {
  let target = entry;
  let sentence = prose;

  if (!target) {
    // A chained run whose sentence already names a token skips the picker: the
    // target is read, and asking for it again would be asking twice.
    if (sentence !== '') {
      const { matched } = matchTarget(sentence, model);
      if (matched?.kind === 'token') target = matched.entry;
    }
  }

  if (!target) {
    const picked = resolvePick(await ctx.ask(renderTypePicker(), []), updateTypeOptions());
    if (picked.action === 'skip') return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };

    let type = null;
    if (picked.action === 'prose') {
      sentence = picked.prose;
      const { matched } = matchTarget(sentence, model);
      if (matched?.kind === 'token') target = matched.entry;
      // A sentence that named nothing recorded still has somewhere to go: the
      // full list of every token, which is what `something else` lists.
      if (!target) type = updateTypeOptions().find((row) => row.section === null) ?? null;
    } else {
      type = picked.row;
    }

    if (!target && type) {
      const entries = tokensOfType(model, type);
      if (entries.length === 0) {
        out.push(renderEmptySection(type), '', NOT_WRITTEN, '');
        return { out: out.join('\n'), code: 0 };
      }
      out.push(renderTokenList(type, entries), '');
      const chosen = resolvePick(
        await ctx.ask('Which one are you updating?', []),
        entries.map((item) => ({ pick: item.name, printsAs: item.name, entry: item })),
      );
      if (chosen.action === 'skip') return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };
      if (chosen.action === 'pick') target = chosen.row.entry;
      else {
        const { matched } = matchTarget(chosen.prose, model);
        if (!matched || matched.kind !== 'token') {
          out.push(
            `Nothing in that list is called "${chosen.prose}", and Phyllum never guesses a target.`,
            '',
            NOT_WRITTEN,
            '',
          );
          return { out: out.join('\n'), code: 0 };
        }
        target = matched.entry;
        sentence = chosen.prose;
      }
    }
  }

  // ---- the change, in prose ------------------------------------------------
  let change = sentence === '' ? { changed: false } : readChange(sentence, target);
  for (let round = 0; !change.changed; round += 1) {
    if (round >= MAX_FOLLOW_UPS) {
      out.push(
        `Nothing in "${sentence}" says what changes about \`${target.name}\`, and Phyllum never invents a value.`,
        '',
        NOT_WRITTEN,
        '',
      );
      return { out: out.join('\n'), code: 0 };
    }
    const answer = await ctx.ask(changeQuestion('token-change', target.name), [
      { action: 'skip', text: 'skip — leave this token as it is' },
    ]);
    const raw = String(answer ?? '').trim();
    if (raw === '' || resolvePick(raw, []).action === 'skip') {
      return { out: `${out.join('\n')}${NOT_WRITTEN}\n`, code: 0 };
    }
    sentence = raw;
    change = readChange(sentence, target);
  }

  // ---- convergence, re-run on the new value --------------------------------
  if (change.changedValue) {
    const holder = collisionFor(model, target, change.row);
    if (holder) {
      out.push(
        `${change.row[1]} is already \`${holder}\` in ${DESIGN_SYSTEM_FILE}.`,
        'Two names on one value is what convergence exists to prevent, so this edit stopped here —',
        `merge \`${target.name}\` and \`${holder}\` by hand, or run this again with a different value.`,
        '',
        NOT_WRITTEN,
        '',
      );
      return { out: out.join('\n'), code: 0 };
    }
  }

  // ---- the proposal, and what a rename drags with it -----------------------
  const renaming = change.name !== null && change.name !== target.name;
  const plan = renaming ? planRename(model, target.name, change.name) : null;
  out.push(renderProposal(target, change.row));
  if (plan) out.push(renderRipple(plan));
  out.push('');

  // ---- the acceptance gate. Only this branch writes. -----------------------
  if (typeof ctx.confirm !== 'function') {
    out.push(NOT_WRITTEN, '');
    return { out: out.join('\n'), code: 0 };
  }
  const yes = await ctx.confirm(`Write \`${change.row[0]}\` to ${DESIGN_SYSTEM_FILE}?`);
  if (!yes) {
    out.push('Not accepted, so nothing was written.', '');
    return { out: out.join('\n'), code: 0 };
  }

  model.tokens[target.section][target.index] = change.row;
  if (plan) applyRename(model, plan);
  writeDesignSystem(root, render(model));

  out.push(`Wrote \`${change.row[0]}\` to ${DESIGN_SYSTEM_FILE}.`);
  if (plan) {
    for (const slot of plan.slots) {
      out.push(`  ${slot.component}'s \`${slot.slot}\` now references \`${plan.newName}\`.`);
    }
    for (const line of plan.backlog) out.push(`  Backlog: ${line.text}`);
  }
  out.push('');
  return { out: out.join('\n'), code: 0 };
}
