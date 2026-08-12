/**
 * The command table (plan §2.2) as data.
 *
 * This module is the single source of truth for command names, aliases,
 * summaries and per-command help. `menu`, `help`, argument parsing and the
 * assertion suite all read from here, so the three can never drift apart.
 */

export const SCOPES = ['tokens', 'components', 'all'];

export const COMMANDS = [
  {
    name: 'basal',
    aliases: [],
    // The bare entry point is a row in the §2.2 table, so it appears in the
    // menu and has its own help page, but it is not dispatchable as a word.
    dispatchable: false,
    // `built` is what actually runs today; `milestone` is when it was planned.
    // Help and dispatch both read `built`, so a command can never claim to work
    // before it does, or claim to be missing after it lands.
    built: true,
    invocation: 'basal',
    summary: 'Interactive session; a menu of the commands below',
    milestone: 'M1',
    description: [
      'Running `basal` with no arguments opens an interactive session.',
      'The session prints the menu, then accepts the same commands you would type in the terminal.',
      'If the project has no DESIGN-SYSTEM.md yet, the session suggests `init` before anything else.',
    ],
    modes: [],
    args: ['(none)'],
    example: 'basal',
  },
  {
    name: 'menu',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'basal menu',
    summary: 'List every subskill (with aliases), one line per command',
    milestone: 'M1',
    description: [
      'Prints one line per command: what it is called, what it is aliased to, and what it does.',
      'It is a pointer, nothing more — no explanation, no arguments, no side effects.',
      'Use `help [command]` when you want the full story on one of them.',
    ],
    modes: [],
    args: ['(none)'],
    example: 'basal menu',
  },
  {
    name: 'help',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'basal help',
    summary: 'Explain what Basal is; `help [command]` explains one command in depth',
    milestone: 'M1',
    description: [
      'With no argument, `help` explains what Basal is in two or three lines and points you at per-command help.',
      'With a command name, it explains that one command in depth: modes, arguments and an example.',
      '`basal help [command]` and `basal [command] help` are the same thing — you never have to remember the word order.',
    ],
    modes: ['help', 'help [command]', '[command] help'],
    args: ['[command] — optional; the command to explain in depth'],
    example: 'basal help create',
  },
  {
    name: 'create',
    aliases: ['build'],
    dispatchable: true,
    built: true,
    invocation: 'basal create',
    summary: 'Craft a new component from your input',
    milestone: 'M2',
    description: [
      'Turns a description, an image, or a pick from a list into a component spec, then writes it to DESIGN-SYSTEM.md once you accept it.',
      'Whatever your input leaves out becomes a follow-up question, asked one at a time with suggestions drawn from your existing tokens first.',
      'Re-running `create` for a component that already exists opens a revision instead of duplicating it.',
    ],
    modes: [
      'prose — describe the component in a quoted argument (works today)',
      'image — pass a path to an image file and Basal traces it (M4)',
      'pick — pass nothing and choose from archetypes plus candidates found in your codebase (M4)',
    ],
    args: [
      '"<prose>" — a quoted description, e.g. "button primary with 12px padding-top"',
      '<path/to/image> — an existing image file selects image mode',
      '(nothing) — pick mode',
      'help — reserved word: `basal create help` shows this page. Quote it ("help") to mean the word itself.',
    ],
    example: 'basal create "button primary with 12px padding-top and 8px padding-bottom"',
  },
  {
    name: 'tokenise',
    aliases: ['tokenize'],
    dispatchable: true,
    built: true,
    invocation: 'basal tokenise',
    summary: 'Extract and name tokens from your codebase',
    milestone: 'M3',
    description: [
      'Reads your codebase without changing it, and proposes named tokens for the values it keeps finding.',
      'Near-identical values are clustered and offered as one merge proposal, so the system converges instead of mirroring the mess.',
      'Re-running only proposes values that are new since last time; accepted tokens land in DESIGN-SYSTEM.md.',
    ],
    modes: [
      'colours — hex/rgb/hsl values',
      'numbers — px/rem spacing, radii, borders',
      'typography — font-size, weight and line-height clusters',
    ],
    args: ['(none in v1 — all three passes run)'],
    example: 'basal tokenise',
  },
  {
    name: 'gui',
    aliases: ['dashboard'],
    dispatchable: true,
    built: false,
    invocation: 'basal gui',
    summary: 'Start the local server and open the HTML dashboard',
    milestone: 'M4',
    description: [
      'Starts a local, localhost-only server and opens a single-page dashboard onto the same design system the terminal reads.',
      'The dashboard is a viewer and a prompt relay, not a second brain — all reasoning stays in your Claude Code session.',
      'The scope word picks the opening filter; you can still switch views inside the GUI. `basal kill` stops the server.',
    ],
    modes: ['scope: tokens · components · all (default)'],
    args: ['[tokens|components|all] — optional opening filter, defaults to all'],
    example: 'basal gui tokens',
  },
  {
    name: 'kill',
    aliases: [],
    dispatchable: true,
    built: false,
    invocation: 'basal kill',
    summary: 'Stop the running GUI server',
    milestone: 'M4',
    description: [
      'Stops the server started by `basal gui` and clears its record from the session state.',
      'Safe to run when nothing is up: it reports cleanly and clears any stale record rather than erroring.',
    ],
    modes: [],
    args: ['(none)'],
    example: 'basal kill',
  },
  {
    name: 'system',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'basal system',
    summary: 'Print the design system to the terminal',
    milestone: 'M1',
    description: [
      'Prints the whole design system — token tables and component specs — straight to the terminal.',
      'It keeps no state of its own: it is a formatted read of DESIGN-SYSTEM.md, so it is always truthful to the source file.',
      'The optional scope word narrows what is shown; an unrecognised scope prints the valid ones instead of erroring.',
    ],
    modes: ['scope: tokens · components · all (default)'],
    args: ['[tokens|components|all] — optional, defaults to all'],
    example: 'basal system tokens',
  },
  {
    name: 'init',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'basal init',
    summary: 'Guided walkthrough: scaffold DESIGN-SYSTEM.md and install the skill',
    milestone: 'M1',
    description: [
      'The first command to run in a project. It scaffolds DESIGN-SYSTEM.md from the canonical template and installs the Basal skill into .claude/skills/basal/.',
      'It never overwrites your file: on a rerun it validates the section structure and repairs anything missing, adding only, never dropping.',
      'It then offers to seed the system with a first tokenise pass or a first component, and finishes by orienting you with the menu.',
    ],
    modes: [],
    args: ['--yes — accept every prompt (assumed automatically when not attached to a terminal)'],
    example: 'basal init',
  },
];

/** Every command that can actually be typed as a word. */
export const DISPATCHABLE = COMMANDS.filter((c) => c.dispatchable);

const BY_WORD = new Map();
for (const command of COMMANDS) {
  if (!command.dispatchable) continue;
  BY_WORD.set(command.name, command);
  for (const alias of command.aliases) BY_WORD.set(alias, command);
}

/** Resolve a typed word (canonical name or alias) to its command, or null. */
export function resolveCommand(word) {
  if (typeof word !== 'string') return null;
  return BY_WORD.get(word.toLowerCase()) ?? null;
}

/** Resolve a word for help purposes — includes the non-dispatchable `basal` row. */
export function resolveHelpTarget(word) {
  if (typeof word !== 'string') return null;
  const lower = word.toLowerCase();
  const direct = resolveCommand(lower);
  if (direct) return direct;
  return COMMANDS.find((c) => c.name === lower) ?? null;
}

/** "create" -> "create  (alias: build)" */
export function displayName(command) {
  if (command.aliases.length === 0) return command.name;
  const label = command.aliases.length === 1 ? 'alias' : 'aliases';
  return `${command.name}  (${label}: ${command.aliases.join(', ')})`;
}
