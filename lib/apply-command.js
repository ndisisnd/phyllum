/**
 * `phyllum apply` — the command surface (v0.2.0 plan §6.5.1).
 *
 * `apply` is the command that will eventually write to somebody's source code,
 * and this milestone builds the half that does not: **it writes a plan, and
 * nothing else.** One file, `.phyllum/PRD.md`, inside the permission model
 * Phyllum already had. Not one line of the user's codebase is touched by this
 * command — that is `apply run`'s job, and `apply run` is registered, documented
 * and not built yet.
 *
 * The whole command is mechanical: read `DESIGN-SYSTEM.md`, read the codebase
 * through `assess`, work out which raw literals the design system already names,
 * write the plan. No model, no network, no conversation — so it works in a plain
 * terminal with nothing installed, which matters because a plan the user cannot
 * read before approving it would defeat the point of having one.
 *
 * Three refusals shape it, and each one exits cleanly rather than failing:
 *
 *   - **No design system, or an empty one.** There is nothing to apply, so
 *     `apply` says which command fills it and stops.
 *   - **Nothing in the codebase matches.** No PRD is written. An empty plan is
 *     worse than no plan, because it looks like work that has been done.
 *   - **A value the design system does not name.** Out of scope with a reason,
 *     never named on the user's behalf.
 *
 * Same shape as every other command here: arguments in, text out. Nothing prints
 * and nothing reads `process`.
 */

import fs from 'node:fs';
import path from 'node:path';

import { loadAssessment } from './assess-command.js';
import { detectHarness, detectTestSuite } from './harness-detect.js';
import {
  buildPrd,
  mergePrd,
  parsePrd,
  renderPrd,
  withVerification,
} from './prd.js';
import { packageVersion } from './template.js';
import { DESIGN_SYSTEM_FILE, PRD_FILE, writePrd } from './write.js';

/** The reserved scope word after `apply` (plan §2.2 argument grammar). */
export const APPLY_SCOPES = ['run'];

/** The milestone `apply run` lands in. Registered here so nothing pretends. */
export const RUN_MILESTONE = 'v0.2.0 M7';

const FRESH_FLAG = '--fresh';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const isApplyScope = (word) => APPLY_SCOPES.includes(String(word ?? '').toLowerCase());

/** A word that is not a scope at all — the valid ones, rather than an error. */
export function renderInvalidScope(word) {
  return (
    `\`${word}\` is not something \`apply\` takes.\n` +
    `The only scope word is \`run\` — or nothing at all to create the PRD, plus \`${FRESH_FLAG}\` to regenerate it from scratch.\n`
  );
}

/**
 * `apply run` — registered, documented, not built.
 *
 * The repo's convention for an unbuilt command, said in the command's own voice:
 * which milestone it lands in, and where to read what it will do. Nothing about
 * the plan is executed, and the plan is not touched either.
 */
export function renderRunStub() {
  return (
    `\`apply run\` is registered but not built yet — it is coming in a later milestone (${RUN_MILESTONE}).\n` +
    `\`phyllum apply\` writes the plan today; \`apply run\` is what executes it.\n` +
    `Run \`phyllum help apply\` to see what it will do, or read \`${PRD_FILE}\` for the plan it will read.\n`
  );
}

/**
 * An empty design system: the honest refusal.
 *
 * `apply` applies what is recorded, so an empty record means there is nothing to
 * apply — and the fix is a different command, named.
 */
export function renderEmptySystem() {
  return (
    `Your ${DESIGN_SYSTEM_FILE} has no tokens and no components yet, so there is nothing for \`apply\` to apply.\n\n` +
    'Fill it first:\n' +
    '  `phyllum assess`     read your codebase and name the raw values it already uses\n' +
    '  `phyllum create`     record a component\n' +
    '  `phyllum tokenise "our brand blue #2563EB"`   name one token from one sentence\n\n' +
    'Then run `phyllum apply` again. Nothing was written.\n'
  );
}

/** The design system is populated, but nothing in the code matches it. */
export function renderNothingToApply(prd) {
  const scope = prd.outOfScope;
  const out = [
    'phyllum apply — nothing to apply',
    '',
    `Your ${DESIGN_SYSTEM_FILE} is populated, but no raw value in this codebase matches a token it`,
    'names, and no pattern matches a component it records. So there is no change to plan, and no PRD',
    'was written — an empty plan would look like work somebody had done.',
    '',
  ];

  if (scope.unnamed.length > 0) {
    out.push(
      `${plural(scope.unnamed.length, 'raw value')} in here ${scope.unnamed.length === 1 ? 'is' : 'are'} not named by any token yet — \`phyllum assess\` names them, then re-run \`apply\`.`,
    );
  }
  if (scope.unreadable.length > 0) {
    out.push(
      `${plural(scope.unreadable.length, 'value')} ${scope.unreadable.length === 1 ? 'is' : 'are'} plainly a colour or a length but written on a property no table names — asked about by \`assess\`, never guessed here.`,
    );
  }
  if (scope.todoComponents.length > 0) {
    out.push(
      `${plural(scope.todoComponents.length, 'recorded component')} still ${scope.todoComponents.length === 1 ? 'has' : 'have'} a TODO in its spec, and a TODO means do not generate — finish ${scope.todoComponents.length === 1 ? 'it' : 'them'} with \`phyllum create\`.`,
    );
  }
  if (out[out.length - 1] !== '') out.push('');
  out.push('Nothing in your codebase was changed, and nothing was written.');
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * What `apply` says it did, in the order the pipeline did it.
 *
 * The report's one job is that the user knows a plan exists, where it is, what
 * shape it took and what it left out — and that nothing has run. On a re-run it
 * also has to say, plainly, what was kept and what was regenerated, because that
 * is the promise resume makes.
 */
export function renderReport(prd, { root, kept, fresh, discarded }) {
  const { header } = prd;
  const out = ['phyllum apply — the plan only, nothing executed', ''];

  out.push('Step 1 — who will execute it');
  if (header.harnessConfig || header.harnessLayer !== 'none') {
    out.push(`  Harness: ${header.harness}, from ${header.harnessSource}.`);
    out.push('  The PRD is shaped as explicit per-phase instructions so it can be handed over natively.');
  } else {
    out.push('  No agent harness detected — no `CLAUDE.md`, `AGENT.md`, `AGENTS.md` or other recognisable');
    out.push('  agent config, no `.phyllum/` preference, no agent memory.');
    out.push('  So the PRD is the simple shape: plain Markdown any harness, or a person, can execute.');
  }
  out.push('');

  out.push('Step 2 — what will change');
  out.push(
    `  ${plural(header.changes, 'change')} across ${plural(header.phases, 'phase')}, each with its own acceptance criterion naming the file,`,
  );
  out.push('  the literal, the token or component it becomes, and how to check it.');
  for (const phase of prd.phases) {
    const done = phase.done ? ' — complete' : '';
    out.push(`    Phase ${phase.number} — ${phase.title}: ${plural(phase.changes.length, 'change')}${done}`);
  }
  out.push('');

  out.push('Step 3 — what will not change');
  const scope = prd.outOfScope;
  out.push(
    `  ${plural(scope.unnamed.length, 'value')} no token names yet · ${plural(scope.unreadable.length, 'value')} seen but not read · ${plural(scope.todoComponents.length, 'component')} with an unfilled spec · ${plural(scope.unrecordedPatterns.length, 'unrecorded pattern')}.`,
  );
  out.push('  Every one of them is listed in the PRD with its reason. None of them is guessed at.');
  out.push('');

  out.push('Step 4 — verification, per phase');
  out.push('  Each phase must pass its own criteria before its commit lands.');
  out.push(
    header.tests?.found
      ? `  This project's own suite was detected (${header.tests.evidence}), so \`${header.tests.command}\` must be green too.`
      : '  No test suite was detected here, so the criteria are the whole bar — the PRD says so rather than assuming a command.',
  );
  out.push('');

  if (kept) {
    out.push('Step 5 — resumed, not restarted');
    out.push(`  Kept: ${plural(kept.ticks, 'ticked criterion')}, ${plural(kept.completedPhases, 'completed phase')} marked complete${kept.notes ? ', and your `Notes` section verbatim' : ''}.`);
    out.push('  Regenerated: the change inventory, the phase grouping and every criterion, re-derived from');
    out.push(`  your current ${DESIGN_SYSTEM_FILE} and a fresh read of the codebase.`);
    if (kept.reopenedPhases > 0) {
      out.push(
        `  Reopened: ${plural(kept.reopenedPhases, 'phase')} marked complete gained a change that was not in the plan when it was marked, so the marker was cleared and the PRD says why.`,
      );
    }
    if (kept.droppedTicks > 0) {
      out.push(
        `  Dropped: ${plural(kept.droppedTicks, 'tick')} whose change is no longer in the plan — a plan should not claim credit for work it no longer contains.`,
      );
    }
    out.push('');
  } else if (discarded) {
    out.push('Step 5 — regenerated from scratch');
    out.push(`  \`${FRESH_FLAG}\` was passed, so the previous PRD was replaced: ticks, completed phases and`);
    out.push('  your notes are gone. Without the flag, a re-run keeps all three.');
    out.push('');
  }

  out.push(`Written: ${path.join(path.basename(path.resolve(root)), PRD_FILE)}`);
  out.push('');
  out.push('Nothing in your codebase was changed. `apply` writes the plan; `apply run` executes it, and');
  out.push(`\`apply run\` is not built yet (${RUN_MILESTONE}). Read the plan, edit it, then re-run \`phyllum apply\``);
  out.push('to refresh it — your ticks and notes survive.');
  if (fresh === false) {
    out.push(`Pass \`${FRESH_FLAG}\` to throw the plan away and regenerate it instead.`);
  }
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

const isEmptyModel = (model) =>
  (model?.components ?? []).length === 0 &&
  ['colours', 'numbers', 'typography'].every((key) => (model?.tokens?.[key] ?? []).length === 0);

export function prdPath(root) {
  return path.join(path.resolve(root), PRD_FILE);
}

export function readExistingPrd(root) {
  const file = prdPath(root);
  if (!fs.existsSync(file)) return null;
  try {
    return parsePrd(fs.readFileSync(file, 'utf8'));
  } catch {
    return null; // an unreadable plan is regenerated, never a crash
  }
}

/**
 * Run `apply`.
 *
 * ctx: { cwd, env, today, home, scanOptions }
 *
 * There is no `ask` and no `confirm` in that list, and that is the design: the
 * PRD **is** the consent gate. Nothing is asked because nothing is being done to
 * the codebase — the user reads the plan and runs `apply run` when they mean it.
 */
export async function runApply(args, ctx = {}) {
  const words = args.map((arg) => String(arg?.value ?? arg ?? ''));
  const fresh = words.some((word) => word.toLowerCase() === FRESH_FLAG);
  const rest = words.filter((word) => !word.startsWith('--'));

  if (rest.length > 0) {
    const word = rest[0];
    if (isApplyScope(word)) return { out: renderRunStub(), code: 0 };
    return { out: renderInvalidScope(word), code: 0 };
  }

  const { root, model, result } = loadAssessment(ctx);
  if (isEmptyModel(model)) return { out: renderEmptySystem(), code: 0 };

  const harness = detectHarness(root, { home: ctx.home ?? null });
  const tests = detectTestSuite(root);
  const built = buildPrd({
    root,
    model,
    assessment: result,
    harness,
    tests,
    version: packageVersion(),
    today: ctx.today,
  });

  if (built.header.changes === 0) {
    return { out: renderNothingToApply(built), code: 0, prd: built, written: false };
  }

  // Asked before the write, because after it the file always exists: `--fresh`
  // only "discarded" something if there was something there to discard.
  const hadPrd = fs.existsSync(prdPath(root));
  const existing = fresh ? null : readExistingPrd(root);
  const { prd, kept } = mergePrd(built, existing);
  const final = withVerification(prd);
  writePrd(root, renderPrd(final));

  return {
    out: renderReport(final, {
      root,
      kept,
      fresh,
      discarded: fresh && hadPrd,
    }),
    code: 0,
    prd: final,
    written: true,
    harness,
    tests,
  };
}
