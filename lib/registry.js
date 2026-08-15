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
    name: 'phyllum',
    aliases: [],
    // The bare entry point is a row in the §2.2 table, so it appears in the
    // menu and has its own help page, but it is not dispatchable as a word.
    dispatchable: false,
    // `built` is what actually runs today; `milestone` is when it was planned.
    // Help and dispatch both read `built`, so a command can never claim to work
    // before it does, or claim to be missing after it lands.
    built: true,
    invocation: 'phyllum',
    summary: 'Interactive session; a menu of the commands below',
    milestone: 'M1',
    description: [
      'Running `phyllum` with no arguments opens an interactive session.',
      'The session prints the menu, then accepts the same commands you would type in the terminal.',
      'If the project has no DESIGN-SYSTEM.md yet, the session suggests `init` before anything else.',
    ],
    modes: [],
    args: ['(none)'],
    example: 'phyllum',
  },
  {
    name: 'menu',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'phyllum menu',
    summary: 'List every subskill (with aliases), one line per command',
    milestone: 'M1',
    description: [
      'Prints one line per command: what it is called, what it is aliased to, and what it does.',
      'It is a pointer, nothing more — no explanation, no arguments, no side effects.',
      'Use `help [command]` when you want the full story on one of them.',
    ],
    modes: [],
    args: ['(none)'],
    example: 'phyllum menu',
  },
  {
    name: 'help',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'phyllum help',
    summary: 'Explain what Phyllum is; `help [command]` explains one command in depth',
    milestone: 'M1',
    description: [
      'With no argument, `help` explains what Phyllum is in two or three lines and points you at per-command help.',
      'With a command name, it explains that one command in depth: modes, arguments and an example.',
      '`phyllum help [command]` and `phyllum [command] help` are the same thing — you never have to remember the word order.',
    ],
    modes: ['help', 'help [command]', '[command] help'],
    args: ['[command] — optional; the command to explain in depth'],
    example: 'phyllum help create',
  },
  {
    name: 'create',
    aliases: ['build'],
    dispatchable: true,
    built: true,
    invocation: 'phyllum create',
    summary: 'Craft a new component from your input',
    milestone: 'M2',
    description: [
      'Turns a description, an image, or a pick from a list into a component spec, then writes it to DESIGN-SYSTEM.md once you accept it.',
      'Whatever your input leaves out becomes a follow-up question, asked one at a time with suggestions drawn from your existing tokens first.',
      'Re-running `create` for a component that already exists opens a revision instead of duplicating it.',
      '`create primitives` is a different kind of run: it lays down primitive colour ramps (100–900) — the neutral ramp when you have no colour tokens, and a ramp per token when you do, each one asked about first.',
      'That mode is wholly mechanical — shipped constants and arithmetic, no model in the path — so it works in a plain terminal, and it never alters the value a token already records.',
    ],
    modes: [
      'prose — describe the component in a quoted argument',
      'image — pass a path to an image file and Phyllum traces it into a spec you can correct',
      'pick — pass nothing and choose from archetypes plus candidates found in your codebase',
      'primitives — generate primitive colour ramps into the Primitives subsection of Colours; wholly mechanical',
    ],
    args: [
      '"<prose>" — a quoted description, e.g. "button primary with 12px padding-top"',
      '<path/to/image> — an existing image file selects image mode',
      '(nothing) — pick mode',
      'primitives — reserved word: `phyllum create primitives` generates colour ramps. Quote it ("primitives") to mean the word itself.',
      'help — reserved word: `phyllum create help` shows this page. Quote it ("help") to mean the word itself.',
    ],
    example: 'phyllum create "button primary with 12px padding-top and 8px padding-bottom"',
  },
  {
    name: 'assess',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'phyllum assess',
    summary: 'Read the codebase, map the raw styling in it, and suggest tokens and components',
    milestone: 'v0.2.0 M3',
    description: [
      'Reads your codebase and answers one question: how much raw, un-systematised styling is in here?',
      'Colours, lengths and typography are read out of any text file whatever the language; patterns that look like components are read out of React markup.',
      'Near-identical values are clustered into one decision, counted, and ranked into one table: what is used, where, what it looks like it means, and whether a token already covers it.',
      'It then suggests — tokens for the unnamed values, one at a time, and components for the patterns your code repeats — and a value it could see but not read is asked about rather than guessed at.',
      'Every finding carries a severity, and the run ends in one drift score on a 1–21 scale plus a verdict of pass, pass w/ warnings, or fail — both derived from the findings, and the same on every run over the same codebase.',
      'The scan, the table, the proposed names and the score need no model; only the review is a conversation.',
      'It is strictly read-only — nothing in your codebase is written, renamed or created, and nothing is written anywhere until you accept a suggestion.',
    ],
    modes: [
      'assess — the full assessment: scan, the map, then both suggestion tracks; one component per run',
      'assess tokens — the same scan, fast-forwarded to the token review only',
      'assess components — the same scan, fast-forwarded to the component picks, looped one at a time with a consent gate each',
      'assess update — the same scan, with the answers supplied: every proposed token graded `error` accepted under the name in the map and written to DESIGN-SYSTEM.md, without the per-item loop; a `warn` finding is reported and never accepted for you',
      'assess --json [path] — any of the above written to a JSON file instead of reviewed, default .phyllum/assess.json; it writes that one file, walks no track and accepts nothing',
    ],
    args: [
      '(nothing) — the full assessment',
      'tokens — the token review on its own',
      'components — the component picks on its own, one candidate at a time',
      'update — accept the proposed tokens that are errors; a warning, a value whose role is unknown and a component pick are skipped, never guessed',
      '--json [path] — write the assessment to a file instead of reviewing it; refused together with `update`, which asks for the opposite',
      'help — reserved word: `phyllum assess help` shows this page',
    ],
    example: 'phyllum assess tokens',
  },
  {
    name: 'apply',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'phyllum apply',
    summary: 'Plan applying the design system to the codebase, then execute the plan on its own branch',
    milestone: 'v0.2.0 M7',
    description: [
      'Writes a plan for applying DESIGN-SYSTEM.md to your code: raw values become the tokens that already name them, ad-hoc patterns become the components you recorded.',
      'The plan lands in .phyllum/PRD.md and nothing else is touched — every change gets its own acceptance criterion naming the file, the literal, what it becomes and how to check it.',
      'It looks for an agent harness first (CLAUDE.md, AGENT.md, AGENTS.md or another recognisable agent config, then a .phyllum/ preference, then agent memory) and shapes the PRD so that harness can execute it natively; with none found, the PRD is a simple plan anybody can read.',
      'Changes are grouped into phases, and one phase is one future commit with its own verification: its criteria, plus your project’s own test suite when one is detected.',
      'Re-running it resumes: the change inventory is re-derived from your current design system and a fresh read of the code, while ticked criteria, completed phases and your notes are kept. `--fresh` throws all of that away and regenerates.',
      'Anything Phyllum cannot name is out of scope with a reason — an unnamed literal, a value whose role it could not read, a component whose spec still says TODO. A TODO means do not generate.',
      '`apply` writes the plan and executes nothing; `apply run` executes it — on a `phyllum/apply-<date>` branch, never the branch you are standing on, with one commit per phase.',
      '`apply run` re-checks the harness first: with one found it hands the plan over with precise instructions; with none, Phyllum orchestrates it itself (Fable driving Opus 4.8 by default, overridable in `.phyllum/config.json`).',
      'Exact-literal criteria are done mechanically in Node; anything needing generation goes to an agent, and the report says which criteria went which way. With no model reachable, agent phases stop and say which model they needed — mechanical phases still land.',
      'A phase commits only when its criteria verify, its diff touches only the files those criteria name, and your own test suite is green. A failing phase stops the run, keeps the completed commits, and records where it stopped; `apply run` resumes from there. Nothing is ever rolled back.',
    ],
    modes: [
      'apply — create or refresh the PRD; writes .phyllum/PRD.md and nothing else',
      'apply --fresh — regenerate the PRD from scratch, discarding ticks, completed phases and notes',
      'apply run — execute the PRD on its own branch, one commit per phase, a status report every 5 minutes',
    ],
    args: [
      '(nothing) — create or resume the PRD',
      '--fresh — regenerate from scratch instead of resuming',
      'run — execute the PRD; the only command that writes to your source files',
      'help — reserved word: `phyllum apply help` shows this page',
    ],
    example: 'phyllum apply',
  },
  {
    name: 'tokenise',
    aliases: ['tokenize'],
    dispatchable: true,
    built: true,
    invocation: 'phyllum tokenise "<prose>"',
    summary: 'Name one token from a sentence',
    milestone: 'M3',
    description: [
      'Turns a sentence into a named token: "our brand blue #2563EB" becomes one row in DESIGN-SYSTEM.md.',
      'If the sentence names the token, that name is used; if not, Phyllum suggests one from the naming scales and confirms it with you.',
      'A sentence with no value in it — "add a token for our brand blue" — asks for the missing value rather than failing.',
      'It does not read your codebase: scanning the styles you already have is `assess`.',
    ],
    modes: [
      'colours — hex/rgb/hsl values',
      'numbers — px/rem spacing, radii, borders',
      'typography — a size with its weight and line-height',
    ],
    args: [
      '"<prose>" — a quoted description of one value, e.g. "16px spacing called space-md"',
      '(nothing) — asks what to name',
    ],
    example: 'phyllum tokenise "our brand blue #2563EB"',
  },
  {
    name: 'gui',
    aliases: ['dashboard'],
    dispatchable: true,
    built: true,
    invocation: 'phyllum gui',
    summary: 'Start the local server and open the HTML dashboard',
    milestone: 'M4',
    description: [
      'Starts a local, localhost-only server and prints the URL of a single-page dashboard onto the same design system the terminal reads.',
      'The dashboard is a viewer and a prompt relay, not a second brain — all reasoning stays in your Claude Code session.',
      'The scope word picks the opening filter; you can still switch views inside the GUI. `phyllum kill` stops the server.',
    ],
    modes: ['scope: tokens · components · all (default)'],
    args: ['[tokens|components|all] — optional opening filter, defaults to all'],
    example: 'phyllum gui tokens',
  },
  {
    name: 'kill',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'phyllum kill',
    summary: 'Stop the running GUI server',
    milestone: 'M4',
    description: [
      'Stops the server started by `phyllum gui` and clears its record from the session state.',
      'Safe to run when nothing is up: it reports cleanly and clears any stale record rather than erroring.',
    ],
    modes: [],
    args: ['(none)'],
    example: 'phyllum kill',
  },
  {
    // v0.2.1 §6.5.3: `display` is the primary name and `system` is the alias.
    // The verb changed because the old one named the *thing* rather than the
    // *act* — "phyllum system" reads like a noun, and every other command here
    // is something you do. Nothing about the behaviour moved: the alias is
    // permanent, so every habit and every document that says `system` keeps
    // working, byte for byte.
    name: 'display',
    aliases: ['system'],
    dispatchable: true,
    built: true,
    invocation: 'phyllum display',
    summary: 'Print the design system to the terminal',
    milestone: 'M1',
    description: [
      'Prints the whole design system — token tables and component specs — straight to the terminal.',
      'It keeps no state of its own: it is a formatted read of DESIGN-SYSTEM.md, so it is always truthful to the source file.',
      'The optional scope word narrows what is shown; an unrecognised scope prints the valid ones instead of erroring.',
      '`phyllum system` is the same command under its older name, kept for good — same output, byte for byte.',
    ],
    modes: ['scope: tokens · components · all (default)'],
    args: ['[tokens|components|all] — optional, defaults to all'],
    example: 'phyllum display tokens',
  },
  {
    name: 'version',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'phyllum version',
    summary: 'Print the installed version and check npm for a newer one',
    milestone: 'v0.2.0 M1',
    description: [
      'Prints the version you have installed, read from the package itself, and asks npm which version is published as latest.',
      'It then says one of three things: up to date, a newer version exists (both versions shown), or the registry could not be reached.',
      'This is the only command that touches the network, and it only does so when you ask — nothing checks for updates in the background.',
    ],
    modes: [],
    args: ['(none)'],
    example: 'phyllum version',
  },
  {
    name: 'update',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'phyllum update',
    summary: 'Update this install to the latest published version',
    milestone: 'v0.2.0 M1',
    description: [
      'Works out how Phyllum was installed — npm or pnpm, globally or as a project dependency — and runs the right update command for it.',
      'If it cannot act safely, it refuses and prints the exact command to run instead: a one-off `npx` run has nothing to update, and a source checkout belongs to git.',
      'After a successful update it re-syncs the skill copy in .claude/skills/phyllum/, so the CLI and the skill are never two different versions.',
    ],
    modes: [],
    args: ['(none)'],
    example: 'phyllum update',
  },
  {
    name: 'init',
    aliases: [],
    dispatchable: true,
    built: true,
    invocation: 'phyllum init',
    summary: 'Guided walkthrough: scaffold DESIGN-SYSTEM.md and install the skill',
    milestone: 'M1',
    description: [
      'The first command to run in a project. It scaffolds DESIGN-SYSTEM.md from the canonical template and installs the Phyllum skill into .claude/skills/phyllum/.',
      'It never overwrites your file: on a rerun it validates the section structure and repairs anything missing, adding only, never dropping.',
      'It then offers to seed the system with a first tokenise pass or a first component, and finishes by orienting you with the menu.',
    ],
    modes: [],
    args: ['--yes — accept every prompt (assumed automatically when not attached to a terminal)'],
    example: 'phyllum init',
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

/** Resolve a word for help purposes — includes the non-dispatchable `phyllum` row. */
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
