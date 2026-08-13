/**
 * Phyllum's default orchestration (v0.2.0 plan §6.5.2, decided).
 *
 * When no preferred harness is found, Phyllum drives execution itself: a **Fable
 * orchestrator** is spun up and orchestrates **Opus 4.8 agents** to execute the
 * PRD. Both model ids are defaults rather than hard-codings, overridable from
 * `.phyllum/config.json` (see `lib/apply-config.js`) — config only, no flags.
 *
 * The conventions are `lib/claude-cli.js`'s, because the problem is the same one
 * `create` and `tokenise` already solved: the mechanics run anywhere, and the part
 * that needs a model needs a route to one. There are two routes and no third.
 * With neither, the phase **stops and says which model it needed** — it never
 * pretends, and it never writes a line it could not have derived.
 *
 * One phase, one orchestrator, at most one agent per phase (plan's build order):
 * a phase is one commit, and a commit with two authors inside it is a commit
 * nobody can review as a unit.
 */

import { CLI_NAME, findClaudeCli, insideClaudeSession } from './claude-cli.js';
import { runCommand } from './run-command.js';

export const DEFAULT_TIMEOUT_MS = 900_000;

/**
 * Which route to a model is available for a run:
 *   'session'   — Phyllum is inside a Claude Code session; the skill orchestrates
 *   'shell-out' — the `claude` CLI is installed; Phyllum hands each phase to it
 *   'none'      — neither, so agent phases stop rather than pretending
 */
export function orchestrationRoute(env = process.env) {
  if (insideClaudeSession(env)) return 'session';
  if (findClaudeCli(env)) return 'shell-out';
  return 'none';
}

/** The stop reason a phase records when there is no model to reach. */
export function noModelReason(models) {
  return `needs ${models.agentModel} via the \`${CLI_NAME}\` CLI — no model was reachable, so this phase was not attempted`;
}

/** What the user is told when a run cannot reach a model at all. */
export function renderNoModelNotice(models) {
  return (
    `Phyllum's own orchestration needs a model: ${models.orchestratorModel} to orchestrate, ${models.agentModel} to do the work.\n` +
    'Two ways to give it one:\n' +
    `  1. Install Claude Code, so \`${CLI_NAME}\` is on your PATH.\n` +
    '  2. Run `phyllum apply run` from inside a Claude Code session.\n' +
    'Mechanical phases — exact literals on named properties — still run and still commit without either.\n'
  );
}

/**
 * The orchestrator's prompt: the phase's own PRD section, verbatim, plus the
 * guarantees it is being held to.
 *
 * Verbatim matters. The PRD is the artefact the user read and approved, and its
 * criteria are worded as checkable statements; paraphrasing the phase into a
 * fresh instruction would mean the agent works from something nobody signed off.
 * Everything Phyllum adds around it is a constraint, not a restatement.
 */
export function buildOrchestratorPrompt({
  phaseSection,
  guarantees,
  branch,
  files,
  agentModel,
  testCommand = null,
  designSystemFile = 'DESIGN-SYSTEM.md',
}) {
  const lines = [
    'You are orchestrating one phase of a Phyllum `apply run`.',
    `Spawn at most one agent, on ${agentModel}, and have it make the change described below.`,
    '',
    'The phase, copied from the plan the user approved (`.phyllum/PRD.md`) — this is the instruction:',
    '',
    phaseSection.trim(),
    '',
    'The execution guarantees this phase is held to, from the same plan:',
    '',
    guarantees.trim(),
    '',
    'Hard constraints for this phase:',
    `- You are on branch \`${branch}\`. Do not switch, create, merge or rebase branches, and do not commit — Phyllum makes the commit.`,
    `- Edit only these files: ${files.map((file) => `\`${file}\``).join(', ') || 'none'}. Anything else you change will be left out of the commit and reported.`,
    `- Every value you introduce must come from \`${designSystemFile}\`. Do not invent a token, a name, or a component spec; if something is missing, stop and say so.`,
    '- Do not delete or rewrite unrelated code, and do not reformat files you are not changing.',
    testCommand ? `- ${testCommand} must still be green when you are done.` : '- There is no host test suite here, so the criteria above are the whole bar.',
    '',
    'When you are done, state which acceptance criteria you satisfied, by id.',
  ];
  return lines.join('\n');
}

/**
 * Hand one phase to the `claude` CLI.
 *
 * By resolved path with an argument array, through the run funnel — the prompt is
 * an argument, never a command line. A missing CLI is reported rather than thrown,
 * because "no model here" is a supported answer.
 */
export function runOrchestrator({ root, model, prompt, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env }) {
  const result = runCommand(CLI_NAME, ['--model', model, '--print', prompt], {
    cwd: root,
    env,
    timeoutMs,
  });
  return {
    ran: !result.missing,
    ok: result.ok,
    missing: result.missing,
    timedOut: result.timedOut,
    output: `${result.stdout}${result.stderr}`.trim(),
  };
}
