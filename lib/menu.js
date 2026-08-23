/**
 * `menu` (plan §2.2; v0.8.0 §1): one line per command, aliases included,
 * grouped under the pipeline stage that owns it. It is a pointer — no
 * explanation lives here, that is `help`'s job.
 */

import { COMMANDS, STAGES, SYSTEM_STAGE } from './registry.js';

/**
 * What a stage with no commands says (v0.8.0 §1).
 *
 * One sentence, in one place, because two listings print it: the menu below and
 * `pipeline`. An empty stage is a real stage, and the two surfaces saying it
 * differently would read as two different facts about the same release.
 */
export const EMPTY_STAGE_NOTE = '(nothing here yet — arrives in a later release)';

/** One command as a listing line: invocation, summary, aliases. Shared with `pipeline`. */
export function commandLine(command, width) {
  const alias =
    command.aliases.length > 0 ? ` (alias: ${command.aliases.join(', ')})` : '';
  return `  ${command.invocation.padEnd(width)}  ${command.summary}${alias}`;
}

export function renderMenu({ header = true } = {}) {
  const width = Math.max(...COMMANDS.map((c) => c.invocation.length));
  const lines = header ? ['Phyllum — design system companion', ''] : [];

  for (const stage of STAGES) {
    const commands = COMMANDS.filter((c) => c.stage === stage.id);
    lines.push(`${stage.label} — ${stage.question}`);
    if (commands.length === 0) {
      lines.push(`  ${EMPTY_STAGE_NOTE}`);
    } else {
      for (const command of commands) lines.push(commandLine(command, width));
    }
    lines.push('');
  }

  const systemCommands = COMMANDS.filter((c) => c.stage === SYSTEM_STAGE);
  lines.push('Tooling — running Phyllum itself, not part of the pipeline');
  for (const command of systemCommands) lines.push(commandLine(command, width));

  lines.push('');
  lines.push('Run `phyllum help [command]` for any command in depth.');
  return `${lines.join('\n')}\n`;
}
