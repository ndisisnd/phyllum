/**
 * `help` (plan §2.2).
 *
 * Bare help is three lines and a hint. Per-command help is one function, so
 * `basal help create` and `basal create help` are byte-identical by
 * construction rather than by discipline.
 */

import { displayName } from './registry.js';

export const OVERVIEW_LINES = [
  'Basal is a design system companion for your codebase.',
  'It turns prose, images, or the styles you already have into named tokens and components.',
  'Everything lands in DESIGN-SYSTEM.md — the only file in your codebase Basal ever writes.',
];

export const HELP_HINT =
  'Run `basal help [command]` (or `basal [command] help`) for any command in depth; `basal menu` lists them all.';

export function renderHelp() {
  return `${[...OVERVIEW_LINES, '', HELP_HINT].join('\n')}\n`;
}

export function renderCommandHelp(command) {
  const lines = [`basal ${displayName(command)}`, ''];
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

  lines.push('', 'Run `basal menu` to list every command.');
  return `${lines.join('\n')}\n`;
}

export function renderUnknownHelpTarget(word) {
  return (
    `Basal has no command called "${word}".\n` +
    'Run `basal menu` to see every command, or `basal help` for an overview.\n'
  );
}

export function renderUnknownCommand(word) {
  return (
    `Basal has no command called "${word}".\n` +
    'Run `basal menu` to see every command, or `basal help` for an overview.\n'
  );
}
