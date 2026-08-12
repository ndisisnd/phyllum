/**
 * `menu` (plan §2.2): one line per command, aliases included, nothing more.
 * It is a pointer — no explanation lives here, that is `help`'s job.
 */

import { COMMANDS } from './registry.js';

export function renderMenu() {
  const width = Math.max(...COMMANDS.map((c) => c.invocation.length));
  const lines = ['Basal — design system companion', ''];
  for (const command of COMMANDS) {
    const alias =
      command.aliases.length > 0 ? ` (alias: ${command.aliases.join(', ')})` : '';
    lines.push(`  ${command.invocation.padEnd(width)}  ${command.summary}${alias}`);
  }
  lines.push('');
  lines.push('Run `basal help [command]` for any command in depth.');
  return `${lines.join('\n')}\n`;
}
