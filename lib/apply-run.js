/**
 * `phyllum apply run` — the write path (v0.2.0 plan §6.5.2, §6.5.3).
 *
 * This is the first code path in Phyllum's history that changes a file somebody
 * else wrote, so almost all of it is the machinery that makes that safe. The
 * order below is the safety argument, and each step can only refuse or continue —
 * nothing is ever undone:
 *
 *   1. **The plan, or nothing.** No `.phyllum/PRD.md` means no consent, so the
 *      command points at `phyllum apply` and exits cleanly.
 *   2. **A plan that still describes this codebase.** If the design system or the
 *      code has moved since the plan was written, the criteria may name literals
 *      that are no longer there. That is a warning and an explicit
 *      continue — never a silent run against a stale plan.
 *   3. **Hand off to the harness that owns this project.** If the codebase ships
 *      its own agent config, the PRD was already shaped for it: Phyllum prints
 *      precise instructions pointing that harness at the plan and stops. Phyllum
 *      does not drive another vendor's harness process.
 *   4. **Git, then a branch of its own.** A clean tree, a real repository, and a
 *      `phyllum/apply-<date>` branch created from wherever the user is standing —
 *      never the user's branch. A branch that already exists is *resumed onto*.
 *   5. **One phase at a time.** Mechanical criteria are done in Node; the rest go
 *      to an orchestrated agent, or stop honestly when no model is reachable.
 *      A phase commits only when its own criteria verify, the diff touches only
 *      the files those criteria name, and the host suite (when detected) is green.
 *   6. **Stop and report.** A failing phase halts the run. Completed phases stay
 *      as commits, the PRD records where execution stopped, and the next
 *      `apply run` resumes from that phase. Nothing is rolled back, ever.
 *
 * Every source write goes through the grant funnel in `lib/write.js`, which
 * re-checks the branch and the phase's file list on each call. The clock is
 * injected, so the five-minute status cadence is testable without waiting.
 */

import fs from 'node:fs';
import path from 'node:path';

import { loadAssessment } from './assess-command.js';
import { noModelReason, buildOrchestratorPrompt, orchestrationRoute, renderNoModelNotice, runOrchestrator } from './agent-cli.js';
import { readApplyConfig } from './apply-config.js';
import { applyFile, classifyCriterion, propertiesFrom, rawLiteralRemains, readBecomes, isStylesheet } from './apply-mechanical.js';
import {
  branchExists,
  branchNameFor,
  checkoutBranch,
  changedPaths,
  commitFiles,
  createBranch,
  currentBranch,
  gitAvailable,
  hasCommits,
  hasIdentity,
  isRepo,
} from './git.js';
import { detectHarness, detectTestSuite } from './harness-detect.js';
import { runHostTests } from './host-tests.js';
import {
  HEADING_GUARANTEES,
  buildPrd,
  changeResumeKey,
  parsePrd,
} from './prd.js';
import {
  markPhaseComplete,
  clearStopped,
  phaseSection,
  recordCommit,
  recordStopped,
  sectionBody,
  setStatus,
  statusFor,
  tickCriteria,
} from './prd-marks.js';
import { packageVersion } from './template.js';
import { flipApplied } from './applied.js';
import {
  BACKUP_FILE,
  DESIGN_SYSTEM_FILE,
  PRD_FILE,
  closeSourceGrant,
  openSourceGrant,
  writePrd,
  writeSourceGuarded,
} from './write.js';

/**
 * The files a run never blames anybody for, and never commits: Phyllum's own
 * record and the one-undo-ago copy beside it (v0.5.0 §3.2).
 */
const PHYLLUM_OWN = new Set([DESIGN_SYSTEM_FILE, BACKUP_FILE]);

const unbacktick = (value) => String(value ?? '').replace(/^`|`$/g, '').trim();

/** Irregular plurals included, because "3 criterions" reads like a bug. */
const PLURALS = { criterion: 'criteria' };
const plural = (count, word) =>
  `${count} ${count === 1 ? word : PLURALS[word] ?? `${word}s`}`;

// ---------------------------------------------------------------------------
// Refusals — each one exits 0, having changed nothing
// ---------------------------------------------------------------------------

export function renderNoPrd() {
  return (
    `There is no ${PRD_FILE} here, so there is no plan for \`apply run\` to execute.\n\n` +
    'Run `phyllum apply` first — it writes the plan, and nothing else. Read it, edit it if you want to,\n' +
    'and then `phyllum apply run` executes exactly what it says.\n'
  );
}

export function renderEmptyPlan() {
  return (
    `${PRD_FILE} has no phases, so there is nothing to execute.\n` +
    'Re-run `phyllum apply` to refresh the plan from your current design system and codebase.\n'
  );
}

export function renderAlreadyComplete(prd) {
  return (
    `Every phase in ${PRD_FILE} is already marked complete, so there is nothing left to run.\n` +
    `${plural(prd.phases.length, 'phase')} landed as ${plural(prd.phases.filter((phase) => phase.commit).length, 'commit')} on the work branch.\n` +
    'Re-run `phyllum apply` to plan the next round of changes.\n'
  );
}

/**
 * The hand-off (decided): a preferred harness owns execution.
 *
 * The PRD was already shaped for this harness when it was generated, so the
 * hand-off is instructions, not a process. Phyllum will not drive somebody else's
 * agent harness — it would be guessing at another product's contract, and it
 * would hide who is actually writing to the codebase.
 */
export function renderHandOff(harness, { models, tests }) {
  const out = [
    'phyllum apply run — handing over to your harness',
    '',
    `This project uses ${harness.name}, from ${harness.source}.`,
    'The PRD was written in that harness\'s expected shape, so the harness executes it — not Phyllum.',
    '',
    'Point it at the plan:',
    '',
    `  ${PRD_FILE}`,
    '',
    'Tell it, in these terms:',
    '',
    `  Execute ${PRD_FILE} phase by phase, in order.`,
    '  Work on a new branch — never the branch I am standing on.',
    '  Land each phase as its own commit, naming the criteria it satisfies.',
    `  Every value comes from ${DESIGN_SYSTEM_FILE}; invent nothing.`,
    '  Tick each criterion in the PRD as you satisfy it, and mark each phase complete.',
    tests?.found
      ? `  A phase lands only when its criteria pass and \`${tests.command}\` is green.`
      : '  A phase lands only when its criteria pass; no test suite was detected here.',
    '  On failure: stop, keep the completed commits, and record `- Stopped: <why>` on the phase.',
    '',
    'Nothing was executed and nothing was written by this command.',
    '',
    `If you would rather Phyllum drove it (${models.orchestratorModel} orchestrating ${models.agentModel}), remove or rename`,
    'that harness config, or record a different preference in `.phyllum/config.json`.',
  ];
  return `${out.join('\n')}\n`;
}

export function renderStale(stale) {
  const out = [
    'phyllum apply run — the plan no longer matches this codebase',
    '',
    `${PRD_FILE} was generated on ${stale.generated ?? 'an earlier run'}, and re-deriving it now gives a different`,
    'set of changes:',
    '',
  ];
  if (stale.gone.length > 0) {
    out.push(`  ${plural(stale.gone.length, 'criterion')} in the plan no longer describe${stale.gone.length === 1 ? 's' : ''} anything in the code:`);
    for (const key of stale.gone.slice(0, 5)) out.push(`    ${key}`);
  }
  if (stale.fresh.length > 0) {
    out.push(`  ${plural(stale.fresh.length, 'change')} exist${stale.fresh.length === 1 ? 's' : ''} now that the plan does not contain:`);
    for (const key of stale.fresh.slice(0, 5)) out.push(`    ${key}`);
  }
  out.push(
    '',
    'Running a stale plan would edit files against criteria nobody re-read, so Phyllum stopped.',
    '',
    '  `phyllum apply`        refresh the plan — your ticks, completed phases and notes survive',
    '  `phyllum apply run`    then execute the refreshed plan',
    '',
    'Nothing was written and nothing was executed.',
  );
  return `${out.join('\n')}\n`;
}

export function renderGitRefusal(reason, detail = []) {
  const out = ['phyllum apply run — git is not ready', '', reason, ''];
  for (const line of detail) out.push(`  ${line}`);
  if (detail.length > 0) out.push('');
  out.push('Phyllum works on its own branch and commits each phase, so it needs a repository it can do that in.');
  out.push('Nothing was written and nothing was executed.');
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Staleness — is the plan still about this codebase?
// ---------------------------------------------------------------------------

/**
 * Compare the plan's criteria against a fresh derivation.
 *
 * The comparison is on resume keys (`file | literal-or-pattern | becomes`), the
 * same identity `apply`'s resume path uses, so "the same change" means the same
 * thing in both halves of the command. A difference in either direction is worth
 * warning about: a criterion whose literal is gone would edit nothing, and a
 * change the plan lacks would be silently skipped.
 */
export function stalenessOf(root, prd, ctx = {}) {
  let fresh;
  try {
    const { model, result } = loadAssessment({ ...ctx, cwd: root });
    fresh = buildPrd({
      root,
      model,
      assessment: result,
      harness: { found: false, name: null, config: null, source: null, layer: 'none', candidates: [] },
      tests: { found: false, command: null, name: null, evidence: null },
      version: packageVersion(),
      today: ctx.today,
    });
  } catch {
    // A design system that cannot be read is a different problem, and the plan is
    // not the thing to blame for it. Treat it as "cannot tell", not as stale.
    return { stale: false, gone: [], fresh: [], generated: prd.header?.Generated ?? null };
  }

  const freshKeys = new Set();
  for (const phase of fresh.phases) for (const change of phase.changes) freshKeys.add(changeResumeKey(change));
  const planKeys = new Set();
  const pendingKeys = new Set();
  for (const phase of prd.phases) {
    for (const criterion of phase.criteria) {
      planKeys.add(criterion.key);
      // Only *un-ticked* criteria can be stale. A criterion this run already
      // satisfied no longer describes anything derivable — because it was done —
      // and treating that as staleness would make every resume refuse itself.
      if (!criterion.done) pendingKeys.add(criterion.key);
    }
  }

  const gone = [...pendingKeys].filter((key) => !freshKeys.has(key));
  const extra = [...freshKeys].filter((key) => !planKeys.has(key));
  return {
    // Work the plan does not contain is not a reason to refuse the plan — that is
    // what re-running `phyllum apply` is for. A criterion that no longer matches
    // the code is, because executing it would edit against something nobody read.
    stale: gone.length > 0,
    gone,
    fresh: extra,
    generated: prd.header?.Generated ?? null,
  };
}

// ---------------------------------------------------------------------------
// Status reports — guarantee 3, on a wall clock
// ---------------------------------------------------------------------------

const pad = (value) => String(value).padStart(2, '0');

export function formatElapsed(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}m${pad(seconds)}s`;
}

/**
 * The five-minute cadence (guarantee 3).
 *
 * A report every five minutes of **wall clock**, not one per phase: a phase can
 * run for half an hour, and "still working" is exactly the thing somebody
 * watching a run needs to know. `tick()` is called at every checkpoint inside the
 * run and emits only when the interval has actually elapsed, so the cadence is a
 * property of the clock rather than of how the phases happen to be shaped.
 *
 * `now` and `emit` are injected: the assertion suite advances a fake clock and
 * reads the reports back, without a single second of waiting.
 */
export class StatusReporter {
  constructor({ now, emit, intervalMs, totalPhases }) {
    this.now = typeof now === 'function' ? now : () => Date.now();
    this.emit = typeof emit === 'function' ? emit : () => {};
    this.intervalMs = intervalMs;
    this.totalPhases = totalPhases;
    this.startedAt = this.now();
    this.lastAt = this.startedAt;
    this.reports = [];
    this.current = null;
  }

  phase(phase) {
    this.current = {
      number: phase.number,
      title: phase.title,
      done: phase.criteria.filter((criterion) => criterion.done).length,
      total: phase.criteria.length,
    };
    this.tick();
  }

  criterion() {
    if (this.current) this.current.done += 1;
    this.tick();
  }

  /** Emit if — and only if — the interval has elapsed. */
  tick() {
    const at = this.now();
    if (at - this.lastAt < this.intervalMs) return null;
    this.lastAt = at;
    return this.report(at);
  }

  report(at = this.now()) {
    const elapsed = formatElapsed(at - this.startedAt);
    const where = this.current
      ? `Phase ${this.current.number} of ${this.totalPhases} — ${this.current.title} · ${this.current.done}/${this.current.total} criteria`
      : 'starting up';
    const line = `phyllum apply run · ${where} · elapsed ${elapsed}`;
    this.reports.push(line);
    this.emit(line);
    return line;
  }
}

// ---------------------------------------------------------------------------
// Verification — a criterion is done only when the file says so
// ---------------------------------------------------------------------------

/** The element and class names a component criterion's `check` sentence names. */
export function adoptionMarkers(check) {
  const text = String(check ?? '');
  const element = text.match(/its element `<([^`>]+)>`/)?.[1] ?? null;
  const className = text.match(/its class `([^`]+)`/)?.[1] ?? null;
  return { element, className };
}

/**
 * Why Phyllum cannot read this one, and what to look at instead.
 *
 * "Cannot tell" stops the phase, so the sentence it stops on has to be worth
 * reading. Naming the shape of the problem ("this is not a stylesheet") is only
 * half of that; the other half is the check the user is now doing by hand, stated
 * concretely enough to do it without opening the plan — which literal, which
 * token reference, in which file. Each of the three ways verification runs out of
 * grip gets its own sentence, because each one is a different hand-check.
 */
export function unverifiableReason({ file, literal, becomes }) {
  const reference = becomes?.name ? `\`var(--${becomes.name})\`` : 'the token';
  const target = `\`${file}\``;
  if (literal === '') {
    return (
      `the criterion names no literal to look for, so there is nothing to search ${target} for — ` +
      `confirm by eye that ${target} reads ${reference} where it used to carry a raw value`
    );
  }
  if (!isStylesheet(file)) {
    return (
      `${target} is not a stylesheet, so the \`${literal}\` may sit in markup, a script or a template ` +
      `rather than in a declaration Phyllum can parse — open ${target} and confirm every \`${literal}\` ` +
      `that meant ${reference} now reads ${reference}`
    );
  }
  return (
    `the criterion says "every affected value" without naming the properties, so Phyllum does not know ` +
    `which declarations to read — open ${target} and confirm no raw \`${literal}\` is left where ` +
    `${reference} belongs`
  );
}

/**
 * Is this criterion satisfied by what is on disk?
 *
 * Three answers, and the third one matters most: `null` means *Phyllum cannot
 * tell*, which is neither pass nor fail. An unverifiable criterion stops the
 * phase with an explanation and a hand-verification path, because ticking a box
 * on an agent's word would make the PRD's ticks worthless.
 */
export function verifyCriterion(root, criterion, model) {
  const fields = criterion.fields ?? {};
  const file = unbacktick(fields.file);
  const abs = path.join(path.resolve(root), file);
  if (!fs.existsSync(abs)) {
    return { satisfied: false, why: `${file} does not exist` };
  }
  const source = fs.readFileSync(abs, 'utf8');
  const becomes = readBecomes(fields.becomes);
  if (!becomes) return { satisfied: null, why: 'its `becomes` field cannot be read' };

  if (becomes.kind === 'component') {
    const { element, className } = adoptionMarkers(fields.check);
    if (!element && !className) return { satisfied: null, why: 'its `check` names no element or class to look for' };
    const adopted =
      (element && source.includes(`<${element}`)) || (className && new RegExp(`\\b${className}\\b`).test(source));
    return adopted
      ? { satisfied: true, why: null }
      : { satisfied: false, why: `${file} does not render ${element ? `<${element}>` : className} yet` };
  }

  const literal = unbacktick(fields.literal);
  const properties = propertiesFrom(fields.check);
  if (!isStylesheet(file) || properties.length === 0 || literal === '') {
    return { satisfied: null, why: unverifiableReason({ file, literal, becomes }) };
  }
  const reference = `var(--${becomes.name})`;
  if (rawLiteralRemains(source, { literal, properties })) {
    return { satisfied: false, why: `a raw ${literal} is still on ${properties.join(', ')} in ${file}` };
  }
  if (!source.includes(reference) && !source.includes(becomes.name)) {
    return { satisfied: false, why: `nothing in ${file} reads the ${becomes.name} token` };
  }
  return { satisfied: true, why: null };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const PHASE_SUMMARY = (phase) => `Phase ${phase.number} — ${phase.title}`;

/**
 * The plan's text, or `null` when there is not one to read.
 *
 * `existsSync` and *readable* are two different questions, and only asking the
 * first one is how a stack trace gets in front of a user (v0.2.0 M8). A plan that
 * is a directory, or whose permissions have been stripped, is not a crash —
 * `apply` already treats an unreadable plan as "no usable plan, regenerate it",
 * and this is the same answer on the other side of the pair.
 */
function readPrdText(root) {
  const file = path.join(path.resolve(root), PRD_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Files a phase's criteria name — the only paths its grant will allow. */
export function filesOfPhase(phase) {
  const files = new Set();
  for (const criterion of phase.criteria) {
    const file = unbacktick(criterion.fields?.file);
    if (file !== '') files.add(file);
  }
  return [...files];
}

/**
 * Run the plan.
 *
 * ctx: { cwd, env, today, home, confirm, now, onReport, runAgent, runTests, scanOptions, timeoutMs }
 *
 * `confirm` gates the stale-plan continue. `runAgent` and `runTests` are
 * injectable so the assertion suite can drive every branch — including the honest
 * degradation when no model is reachable — without ever invoking a model.
 */
export async function runApplyRun(ctx = {}) {
  const root = path.resolve(ctx.cwd ?? process.cwd());
  const models = readApplyConfig(root);

  // 1 — the plan, or nothing.
  const original = readPrdText(root);
  if (original === null) return { out: renderNoPrd(), code: 0, ran: false };
  const prd = parsePrd(original);
  if (prd.phases.length === 0) return { out: renderEmptyPlan(), code: 0, ran: false };

  const tests = detectTestSuite(root);

  // 2 — hand off when the project has its own harness.
  const harness = detectHarness(root, { home: ctx.home ?? null });
  if (harness.found) {
    return { out: renderHandOff(harness, { models, tests }), code: 0, ran: false, handedOff: true, harness };
  }

  if (prd.phases.every((phase) => phase.done)) {
    return { out: renderAlreadyComplete(prd), code: 0, ran: false };
  }

  // 3 — is the plan still about this codebase?
  const stale = stalenessOf(root, prd, ctx);
  if (stale.stale) {
    const answer =
      typeof ctx.confirm === 'function'
        ? await ctx.confirm('The plan no longer matches this codebase. Execute it anyway?')
        : false;
    if (!answer) return { out: renderStale(stale), code: 0, ran: false, stale };
  }

  // 4 — git, and a branch of Phyllum's own.
  if (!gitAvailable(root)) {
    return { out: renderGitRefusal('`git` is not installed here, and Phyllum needs it for the branch and the commits.'), code: 0, ran: false };
  }
  if (!isRepo(root)) {
    return {
      out: renderGitRefusal('This project is not a git repository, so there is nowhere to make a branch.', [
        '`git init` and one commit are enough to get started.',
      ]),
      code: 0,
      ran: false,
    };
  }
  if (!hasCommits(root)) {
    return {
      out: renderGitRefusal('This repository has no commits yet, so a branch has nothing to start from.', [
        'Commit what you have first — Phyllum branches from wherever you are standing.',
      ]),
      code: 0,
      ran: false,
    };
  }
  if (!hasIdentity(root)) {
    return {
      out: renderGitRefusal('git has no commit identity here, so a phase could not be committed.', [
        'git config user.email you@example.com',
        'git config user.name "Your Name"',
      ]),
      code: 0,
      ran: false,
    };
  }

  const branch = branchNameFor(ctx.today);
  const standingOn = currentBranch(root);
  // Asked before anything moves: after the checkout the branch always exists, so
  // "resumed onto a stopped run's branch" is only knowable from here.
  const existed = standingOn === branch || branchExists(root, branch);
  if (standingOn !== branch) {
    // Phyllum's own two files are not "somebody else's work" (v0.5.0 §3.2). The
    // `phyllum apply` that wrote this plan also wrote the `applied:` lines, so
    // the step that is *supposed* to precede this one leaves the design system
    // and its `.bak` changed. No criterion can name either file — the scan skips
    // both — so neither can be folded into a phase's commit, and refusing the
    // run over them would refuse the ordinary flow.
    const dirty = changedPaths(root).filter((rel) => !PHYLLUM_OWN.has(rel));
    if (dirty.length > 0) {
      return {
        out: renderGitRefusal(
          'Your working tree has uncommitted changes, and Phyllum will not fold somebody else\'s work into its commits.',
          dirty.slice(0, 10),
        ),
        code: 0,
        ran: false,
      };
    }
    const moved = branchExists(root, branch) ? checkoutBranch(root, branch) : createBranch(root, branch);
    if (!moved.ok) {
      return {
        out: renderGitRefusal(`Phyllum could not stand on \`${branch}\`.`, [moved.stderr.trim() || 'git gave no reason']),
        code: 0,
        ran: false,
      };
    }
  }
  if (currentBranch(root) !== branch) {
    return { out: renderGitRefusal(`Phyllum is not on \`${branch}\`, so it will not write anything.`), code: 0, ran: false };
  }

  /**
   * What was already changed before this run started (v0.2.0 M8).
   *
   * The refusal above only fires when Phyllum has to *move* onto its branch. A
   * resume starts already standing on it, and the tree is legitimately dirty then
   * — a stopped run leaves its own mechanical work uncommitted on purpose. So the
   * resume path cannot simply refuse a dirty tree, and it also cannot pretend the
   * dirt is all Phyllum's. This snapshot is what tells the two apart afterwards,
   * and it is taken for every run so the reasoning is the same on both paths.
   *
   * Two consequences, both about not blaming a user for their own work:
   *
   *   1. A file that was already changed is not counted as a *stray* edit by the
   *      phase that runs next (5c). Before this, somebody who edited an unrelated
   *      file while a run was stopped saw the next phase refuse to commit and
   *      blame itself for their edit.
   *   2. A file that was already changed **and** is named by a criterion still to
   *      run is *reported*, not refused. Once Phyllum edits that file too the two
   *      changes are one diff, and no pathspec can separate them — so the phase's
   *      commit will carry both. Refusing is not available: a resume's own leftover
   *      mechanical work looks exactly like this and is the normal case. What is
   *      available, and what was missing, is saying so out loud.
   */
  const preexisting = new Set(changedPaths(root));
  const plannedFiles = new Set(
    prd.phases.filter((phase) => !phase.done).flatMap((phase) => filesOfPhase(phase)),
  );
  // Phyllum's own two files stay in `preexisting` — so no phase is blamed for
  // them — but they are not *reported* as work somebody left lying around. The
  // `applied:` write that dirtied them was Phyllum's, one command ago.
  const carried = [...preexisting].filter((rel) => plannedFiles.has(rel)).sort();
  const untouched = [...preexisting]
    .filter((rel) => !plannedFiles.has(rel) && !PHYLLUM_OWN.has(rel))
    .sort();

  // 5 — the phases.
  const reporter = new StatusReporter({
    now: ctx.now,
    emit: ctx.onReport,
    intervalMs: models.statusIntervalMs,
    totalPhases: prd.phases.length,
  });
  const route = orchestrationRoute(ctx.env ?? process.env);
  const runAgent = ctx.runAgent ?? null;
  const runTests = ctx.runTests ?? runHostTests;
  const { model } = loadAssessmentSafely(root, ctx);
  const guarantees = sectionBody(original, HEADING_GUARANTEES);

  let text = original;
  const outcome = {
    branch,
    resumed: existed,
    phases: [],
    stopped: null,
    mechanical: 0,
    agent: 0,
    models,
    route,
    tests,
    // The pre-run dirt, split by whether the plan is going to touch it too.
    carried,
    untouched,
  };

  for (const phase of prd.phases) {
    if (phase.done) {
      outcome.phases.push({ number: phase.number, title: phase.title, state: 'already complete', commit: phase.commit });
      continue;
    }

    const files = filesOfPhase(phase);
    const pending = phase.criteria.filter((criterion) => !criterion.done);
    reporter.phase(phase);

    const classified = pending.map((criterion) => ({ criterion, ...classifyCriterion(criterion, model) }));
    const mechanical = classified.filter((entry) => entry.route === 'mechanical');
    const agentic = classified.filter((entry) => entry.route === 'agent');

    const record = {
      number: phase.number,
      title: phase.title,
      state: 'stopped',
      mechanical: mechanical.length,
      agent: agentic.length,
      reasons: agentic.map((entry) => ({ id: entry.criterion.id, why: entry.reason })),
      files,
      commit: null,
      stray: [],
      why: null,
    };

    // 5a — the mechanical layer, in Node, one write per file.
    const grant = openSourceGrant({ branch, phase: phase.number, files, head: () => currentBranch(root) });
    let mechanicalFailure = null;
    try {
      const byFile = new Map();
      for (const entry of mechanical) {
        const file = entry.plan.file;
        if (!byFile.has(file)) byFile.set(file, []);
        byFile.get(file).push({ id: entry.criterion.id, plan: entry.plan });
      }
      for (const [file, entries] of byFile) {
        const abs = path.join(root, file);
        if (!fs.existsSync(abs)) {
          mechanicalFailure = `${file} is named by ${plural(entries.length, 'criterion')} but does not exist`;
          break;
        }
        const before = fs.readFileSync(abs, 'utf8');
        const applied = applyFile(before, entries);
        if (applied.text !== before) writeSourceGuarded(root, file, applied.text, grant);
        outcome.mechanical += applied.results.filter((result) => result.satisfied).length;
        const failed = applied.results.find((result) => !result.satisfied);
        if (failed) {
          mechanicalFailure = `${failed.id} could not be completed mechanically — ${failed.why}`;
          break;
        }
        // The count is kept in one place — the verification pass below — so a
        // criterion is only ever reported done once, and only once it verifies.
        reporter.tick();
      }
    } catch (error) {
      mechanicalFailure = `the write funnel refused an edit — ${error.message}`;
    } finally {
      closeSourceGrant(grant);
    }

    if (mechanicalFailure) {
      record.why = mechanicalFailure;
      text = stopHere(text, phase, mechanicalFailure, prd);
      outcome.phases.push(record);
      outcome.stopped = { phase: phase.number, why: mechanicalFailure };
      break;
    }

    // 5b — the agent layer, or an honest stop.
    if (agentic.length > 0) {
      if (route === 'none' && typeof runAgent !== 'function') {
        const why = noModelReason(models);
        record.why = why;
        record.state = 'stopped';
        // The mechanical criteria in this phase are done and in the working tree,
        // so their ticks are recorded before the stop. The phase does not commit —
        // a phase commits when it is whole — but the plan tells the truth about
        // what is already there, which is what makes the resume path work.
        const partial = mechanical
          .filter((entry) => verifyCriterion(root, entry.criterion, model).satisfied === true)
          .map((entry) => entry.criterion.id);
        text = tickCriteria(text, partial);
        for (const entry of mechanical) {
          if (partial.includes(entry.criterion.id)) entry.criterion.done = true;
        }
        record.partial = partial;
        text = stopHere(text, phase, why, prd);
        writePrd(root, text);
        outcome.phases.push(record);
        outcome.stopped = { phase: phase.number, why, noModel: true };
        break;
      }
      const prompt = buildOrchestratorPrompt({
        phaseSection: phaseSection(original, phase.number),
        guarantees,
        branch,
        files,
        agentModel: models.agentModel,
        testCommand: tests.found ? `\`${tests.command}\`` : null,
        designSystemFile: DESIGN_SYSTEM_FILE,
      });
      const result =
        typeof runAgent === 'function'
          ? await runAgent({ prompt, models, phase: phase.number, files, root, route })
          : runOrchestrator({ root, model: models.orchestratorModel, prompt, timeoutMs: ctx.timeoutMs, env: ctx.env });
      outcome.agent += agentic.length;
      reporter.tick();
      if (!result?.ok) {
        const why = result?.missing
          ? noModelReason(models)
          : `the orchestrated phase did not finish — ${String(result?.output ?? 'no output').split('\n').slice(-1)[0] || 'no output'}`;
        record.why = why;
        text = stopHere(text, phase, why, prd);
        outcome.phases.push(record);
        outcome.stopped = { phase: phase.number, why, noModel: Boolean(result?.missing) };
        break;
      }
    }

    // 5c — verification: every criterion, then the diff, then the host suite.
    const verified = [];
    let failure = null;
    for (const criterion of phase.criteria) {
      if (criterion.done) {
        verified.push(criterion.id);
        continue;
      }
      const check = verifyCriterion(root, criterion, model);
      if (check.satisfied === true) {
        verified.push(criterion.id);
        reporter.criterion();
        continue;
      }
      failure =
        check.satisfied === null
          ? `${criterion.id} cannot be verified by reading the file: ${check.why}. Then tick ${criterion.id} in ${PRD_FILE} and re-run \`phyllum apply run\` — it resumes at this phase.`
          : `${criterion.id} is not satisfied — ${check.why}`;
      break;
    }

    // A stray is a file *this phase* changed and its criteria do not name. A file
    // that was already dirty when the run started is somebody else's edit — or a
    // stopped run's own leftover — and blaming this phase for it would stop a run
    // over work Phyllum never did (v0.2.0 M8). The commit's pathspec excludes it
    // either way, so exempting it here costs nothing and it is still reported.
    const stray = changedPaths(root).filter((rel) => !files.includes(rel) && !preexisting.has(rel));
    record.stray = stray;
    if (!failure && stray.length > 0) {
      failure = `this phase changed ${plural(stray.length, 'file')} its criteria do not name (${stray.slice(0, 5).join(', ')}), so its commit would not be reviewable as one change`;
    }

    if (!failure) {
      const suite = runTests(root, tests, { timeoutMs: ctx.timeoutMs });
      record.suite = suite;
      if (suite.ran && !suite.ok) {
        failure = `\`${suite.command}\` — this project's own test suite — is not green${suite.why ? ` (${suite.why})` : ''}`;
      }
    }

    if (failure) {
      record.why = failure;
      text = tickCriteria(text, verified);
      text = stopHere(text, phase, failure, prd);
      outcome.phases.push(record);
      outcome.stopped = { phase: phase.number, why: failure };
      break;
    }

    // 5d — the commit. Only the files the criteria name.
    text = tickCriteria(text, verified);
    text = clearStopped(text, phase.number);
    const touched = files.filter((rel) => fs.existsSync(path.join(root, rel)));
    const commit =
      touched.length > 0
        ? commitFiles(root, touched, `phyllum apply: ${PHASE_SUMMARY(phase)}`)
        : { ok: true, sha: null, stderr: '' };
    if (!commit.ok && !/nothing to commit/i.test(`${commit.stdout ?? ''}${commit.stderr ?? ''}`)) {
      const why = `the commit for this phase failed — ${commit.stderr.trim() || 'git gave no reason'}`;
      record.why = why;
      text = stopHere(text, phase, why, prd);
      outcome.phases.push(record);
      outcome.stopped = { phase: phase.number, why };
      break;
    }

    record.state = 'complete';
    record.commit = commit.sha ?? null;

    // An `Adopt <Component>` phase that commits has just made the component true
    // (v0.5.0 §3.3). The next `phyllum apply` would derive the same answer from
    // the code later; saying it now keeps the file honest in between, and it goes
    // through the same funnel and touches the same one line.
    //
    // The design system and its `.bak` join the pre-existing set afterwards, so
    // the *next* phase's stray check does not blame the user — or itself — for a
    // write Phyllum made on purpose between the two.
    const adopted = phase.title.match(/^Adopt\s+(.+?)\s*$/);
    if (adopted) {
      try {
        const flip = flipApplied(root, adopted[1]);
        record.applied = flip.written ? adopted[1] : null;
      } catch (error) {
        // A flag that could not be written is not a reason to unwind a landed
        // commit: the next `phyllum apply` re-derives it. It is said, not hidden.
        record.appliedWhy = error.message;
      }
      preexisting.add(DESIGN_SYSTEM_FILE);
      preexisting.add(BACKUP_FILE);
    }

    text = markPhaseComplete(text, phase.number);
    if (record.commit) text = recordCommit(text, phase.number, record.commit);
    phase.done = true;
    for (const criterion of phase.criteria) criterion.done = true;
    text = setStatus(text, statusFor(prd.phases));
    writePrd(root, text);
    outcome.phases.push(record);
    reporter.tick();
  }

  text = setStatus(text, statusFor(prd.phases));
  writePrd(root, text);

  return { out: renderRunReport(outcome, reporter), code: 0, ran: true, outcome, reports: reporter.reports };
}

/** Mark a phase as where execution stopped, and say why, in the plan itself. */
function stopHere(text, phase, why, prd) {
  const marked = recordStopped(text, phase.number, why);
  return setStatus(marked, statusFor(prd.phases));
}

/** The design system, or an empty model — staleness already reported the problem. */
function loadAssessmentSafely(root, ctx) {
  try {
    return loadAssessment({ ...ctx, cwd: root });
  } catch {
    return { model: { tokens: { colours: [], numbers: [], typography: [] }, components: [] }, result: null };
  }
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * What the run did, in the order it did it.
 *
 * The two things this has to be honest about are the ones a user cannot see for
 * themselves: **which criteria were done mechanically and which by an agent**, and
 * **where execution stopped and how to resume**. Both are stated per phase.
 */
export function renderRunReport(outcome, reporter) {
  const out = ['phyllum apply run', ''];

  out.push('Branch');
  out.push(
    `  ${outcome.branch}${outcome.resumed ? ' — resumed, not recreated' : ' — created from where you were standing'}.`,
  );
  out.push('  Your own branch was not written to, and nothing was rolled back.');
  // Work that was already in the tree when the run started. Stated here because
  // it changes how the commits below should be read, and because a user who left
  // an edit lying around deserves to be told Phyllum noticed rather than to
  // discover it inside a commit message they did not expect.
  if ((outcome.untouched ?? []).length > 0) {
    out.push(
      `  Already changed before this run and left alone: ${outcome.untouched.join(', ')} — ` +
        'no phase names these, so no commit contains them.',
    );
  }
  if ((outcome.carried ?? []).length > 0) {
    out.push(
      `  Already changed before this run and also named by the plan: ${outcome.carried.join(', ')} — ` +
        'a phase committing one of these carries whatever was already in it, because the two edits ' +
        'are one diff. Review those commits with that in mind.',
    );
  }
  out.push('');

  out.push('Who did what');
  const orchestration =
    outcome.route === 'none'
      ? 'no model was reachable, so only mechanical criteria were attempted'
      : `${outcome.models.orchestratorModel} orchestrating ${outcome.models.agentModel} (${outcome.route === 'session' ? 'inside this Claude Code session' : 'via the `claude` CLI'})`;
  out.push(`  Mechanical, in Node: ${plural(outcome.mechanical, 'criterion')} — exact literals on the properties the plan names.`);
  out.push(`  Orchestrated: ${plural(outcome.agent, 'criterion')} — ${orchestration}.`);
  for (const source of ['orchestratorModel', 'agentModel', 'statusIntervalMs']) {
    if (outcome.models.sources[source] === 'config') out.push(`  \`${source}\` came from \`${outcome.models.file}\`.`);
  }
  for (const ignored of outcome.models.ignored) out.push(`  Ignored: ${ignored}`);
  out.push('');

  out.push('Phases');
  for (const phase of outcome.phases) {
    const commit = phase.commit ? ` · commit ${phase.commit}` : '';
    out.push(`  Phase ${phase.number} — ${phase.title}: ${phase.state}${commit}`);
    if (phase.mechanical || phase.agent) {
      out.push(`    ${plural(phase.mechanical ?? 0, 'criterion')} mechanical, ${plural(phase.agent ?? 0, 'criterion')} for an agent`);
    }
    for (const reason of phase.reasons ?? []) out.push(`      ${reason.id} needs an agent: ${reason.why}`);
    if ((phase.partial ?? []).length > 0) {
      out.push(
        `    done and ticked, but uncommitted because the phase is not whole: ${phase.partial.join(', ')}`,
      );
    }
    if (phase.applied) {
      out.push(
        `    ${phase.applied} now reads \`applied: true\` in ${DESIGN_SYSTEM_FILE} — the one line, nothing else`,
      );
    }
    if (phase.appliedWhy) {
      out.push(
        `    the \`applied\` flag for this component could not be written (${phase.appliedWhy}); the next \`phyllum apply\` re-derives it`,
      );
    }
    if (phase.suite?.ran) out.push(`    \`${phase.suite.command}\` ran and was green`);
    else if (phase.suite && phase.suite.why) out.push(`    the host suite did not run: ${phase.suite.why}`);
    if ((phase.stray ?? []).length > 0) {
      out.push(`    left uncommitted, outside this phase's criteria: ${phase.stray.join(', ')}`);
    }
    if (phase.why) out.push(`    stopped: ${phase.why}`);
  }
  out.push('');

  if (outcome.stopped) {
    out.push('Stopped, and what to do next');
    out.push(`  Execution stopped at phase ${outcome.stopped.phase}, and that is recorded in ${PRD_FILE}.`);
    out.push('  Completed phases are still committed on the work branch. Nothing was rolled back or thrown away.');
    if (outcome.stopped.noModel) {
      out.push('');
      for (const line of renderNoModelNotice(outcome.models).trimEnd().split('\n')) out.push(`  ${line}`);
    }
    out.push('');
    out.push('  Fix what stopped it, then `phyllum apply run` again — it picks up from the first un-ticked phase.');
  } else {
    out.push('Complete');
    out.push(`  Every phase landed as its own commit on ${outcome.branch}. Review them, then merge as you would any branch.`);
  }
  out.push('');

  const cadence = reporter.reports.length;
  out.push(
    cadence > 0
      ? `Status reports: ${plural(cadence, 'report')} emitted on the ${formatElapsed(outcome.models.statusIntervalMs)} cadence.`
      : `The run finished inside one ${formatElapsed(outcome.models.statusIntervalMs)} window, so no interim status report was due.`,
  );
  return `${out.join('\n')}\n`;
}
