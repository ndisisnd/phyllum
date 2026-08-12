/**
 * `help` (plan §2.2).
 *
 * Bare help is three lines and a hint. Per-command help is one function, so
 * `phyllum help create` and `phyllum create help` are byte-identical by
 * construction rather than by discipline.
 */

import { displayName } from './registry.js';

export const OVERVIEW_LINES = [
  'Phyllum is a design system companion for your codebase.',
  'It turns prose, images, or the styles you already have into named tokens and components.',
  'Everything lands in DESIGN-SYSTEM.md — the only file in your codebase Phyllum ever writes.',
];

export const HELP_HINT =
  'Run `phyllum help [command]` (or `phyllum [command] help`) for any command in depth; `phyllum menu` lists them all.';

export function renderHelp() {
  return `${[...OVERVIEW_LINES, '', HELP_HINT].join('\n')}\n`;
}

export function renderCommandHelp(command) {
  const lines = [`phyllum ${displayName(command)}`, ''];
  lines.push(...command.description);

  if (command.modes.length > 0) {
    lines.push('', 'Modes');
    for (const mode of command.modes) lines.push(`  ${mode}`);
  }

  lines.push('', 'Arguments');
  for (const arg of command.args) lines.push(`  ${arg}`);

  lines.push('', 'Example', `  ${command.example}`);

  if (!command.built) {
    lines.push(
      '',
      `Status: not built yet — \`${command.name}\` is coming in a later milestone (${command.milestone}).`,
    );
  }

  lines.push('', 'Run `phyllum menu` to list every command.');
  return `${lines.join('\n')}\n`;
}

export function renderUnknownHelpTarget(word) {
  return (
    `Phyllum has no command called "${word}".\n` +
    'Run `phyllum menu` to see every command, or `phyllum help` for an overview.\n'
  );
}

export function renderUnknownCommand(word) {
  return (
    `Phyllum has no command called "${word}".\n` +
    'Run `phyllum menu` to see every command, or `phyllum help` for an overview.\n'
  );
}
