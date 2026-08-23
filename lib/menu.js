/**
 * `menu` (plan §2.2; v0.8.0 §1): one line per command, aliases included,
 * grouped under the pipeline stage that owns it. It is a pointer — no
 * explanation lives here, that is `help`'s job.
 */

import { COMMANDS, STAGES, SYSTEM_STAGE } from './registry.js';

function commandLine(command, width) {
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
      lines.push('  (nothing here yet — arrives in a later release)');
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
