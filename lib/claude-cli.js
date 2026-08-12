/**
 * The route from a plain terminal to the intelligence (plan §7.3).
 *
 * Mechanics run in Node and work everywhere. The intelligent part of `create`
 * — reading the prose the way a person would, judging which suggestion fits,
 * running the follow-up conversation — is the skill, and the skill needs a
 * model. There are exactly two ways to reach one:
 *
 *   1. Basal is already running inside a Claude Code session: the skill runs
 *      natively and there is nothing to shell out to.
 *   2. The `claude` CLI is installed: Basal hands the draft to it with the
 *      skill loaded, and the conversation continues there.
 *
 * With neither, the intelligent commands fail with a message naming both
 * options — they never pretend, and they never fabricate a model's answer.
 * This module only *finds* the route; nothing here spawns a process, so the
 * assertion suite can cover every branch without ever invoking a model.
 */

import fs from 'node:fs';
import path from 'node:path';

export const CLI_NAME = 'claude';

/** Are we running inside a Claude Code session already? */
export function insideClaudeSession(env = process.env) {
  return Boolean(env.CLAUDECODE === '1' || env.CLAUDE_CODE === '1' || env.CLAUDE_CODE_ENTRYPOINT);
}

/** The `claude` binary on PATH, or null. A lookup, not an invocation. */
export function findClaudeCli(env = process.env) {
  const raw = env.PATH ?? '';
  for (const dir of raw.split(path.delimiter)) {
    if (dir === '') continue;
    const candidate = path.join(dir, CLI_NAME);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

/**
 * Which route to the intelligence is available:
 *   'session'  — already inside Claude Code
 *   'shell-out'— the `claude` CLI is installed
 *   'none'     — neither
 */
export function intelligenceRoute(env = process.env) {
  if (insideClaudeSession(env)) return 'session';
  if (findClaudeCli(env)) return 'shell-out';
  return 'none';
}

export function renderSessionNotice(command = 'create') {
  return (
    `You are inside a Claude Code session, so the Basal skill takes \`${command}\` from here:\n` +
    '  it asks the follow-up questions, and writes only once you accept.\n'
  );
}

export function renderShellOutNotice(command = 'create') {
  return (
    `\`claude\` is installed, so \`basal ${command}\` continues the follow-up loop there\n` +
    '  with the Basal skill loaded. Nothing is written until you accept.\n'
  );
}

/** The two-option failure the plan asks for, word for word in spirit. */
export function renderNoIntelligenceNotice(command = 'create') {
  return (
    `\`${command}\` needs a model for the parts a program cannot do — reading your\n` +
    'description the way a person would, and judging which suggestion fits.\n' +
    'Two ways to give it one:\n' +
    '  1. Install Claude Code, so `claude` is on your PATH.\n' +
    '  2. Run the Basal skill from inside a Claude Code session.\n' +
    'Everything mechanical — `menu`, `help`, `system`, `init` — keeps working either way.\n'
  );
}

/** The prompt handed to `claude` when Basal shells out. */
export function buildHandoffPrompt(draft, gaps) {
  const lines = [
    'Continue a Basal `create` run. Load the Basal skill and follow skill/refs/create.md.',
    `The user described: ${JSON.stringify(draft.source.input)}`,
    `Draft so far: ${JSON.stringify({ name: draft.name, archetype: draft.archetype, properties: draft.properties, states: draft.states })}`,
    `Open gaps: ${gaps.map((gap) => gap.slot).join(', ') || 'none'}`,
    'Ask one question at a time, suggest existing tokens first, and write nothing until the user accepts.',
  ];
  return lines.join('\n');
}
