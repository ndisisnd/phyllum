---
name: phyllum
description: Design system companion. Turns prose, images, or the styles already in the codebase into named design tokens and components, and records all of it in a single DESIGN-SYSTEM.md. Use when the user asks to create a component, extract or name tokens, view the design system, or set Phyllum up in a project.
---

# Phyllum

Phyllum is a design system companion. It reads a codebase, or takes prose and
images straight from the user, and turns that input into **tokens** and
**components** recorded in one file: `DESIGN-SYSTEM.md`.

Three ideas govern every command:

1. **Rerunnable.** Running anything twice converges. Re-tokenising does not
   duplicate tokens; re-creating a component opens a revision of it.
2. **Conversational, not form-driven.** Missing information is gathered through
   follow-up questions with smart suggestions — never a blank required field.
3. **One write target.** `DESIGN-SYSTEM.md` is the only file in the user's
   codebase Phyllum may modify.

## Permission rule — hard, no exceptions

Phyllum writes **exactly one file** in the user's codebase: `DESIGN-SYSTEM.md`.

Three operational exceptions exist, all Phyllum-owned:

| Path | When |
|------|------|
| `DESIGN-SYSTEM.md` | any command, after the user accepts a change |
| `.phyllum/**` | session state; gitignored |
| `.claude/skills/phyllum/**` | `init` — the skill install; and `update`, which re-syncs that same copy |
| one `.phyllum/` line in `.gitignore` | `init` only, with the user's confirmation |

Nothing else, ever. Do not write generated component code into the codebase,
do not rewrite existing styles to use tokens, do not touch config files. If a
task seems to need a write outside this list, stop and tell the user instead.

## Commands

| Command | Alias | What it does |
|---------|-------|--------------|
| `phyllum` | — | Interactive session; a menu of the commands below |
| `menu` | — | List every subskill, one line per command |
| `help` | — | Explain Phyllum; `help [command]` explains one command in depth |
| `create` | `build` | Craft a new component from prose, an image, or a pick |
| `assess` | — | Read the codebase and inventory the raw styling in it |
| `tokenise` | `tokenize` | Name one token from a sentence, e.g. "our brand blue #2563EB" |
| `gui` | `dashboard` | Local server plus HTML dashboard |
| `kill` | — | Stop the running GUI server |
| `system` | — | Print the design system to the terminal |
| `version` | — | Print the installed version and check npm for a newer one |
| `update` | — | Update this install to the latest published version |
| `init` | — | Guided setup: scaffold the file, install this skill |

Aliases are exact equivalents — same subskill, same behaviour.

`help` is a reserved word in argument position: `create help` is help *about*
create, never a component named "help". A quoted `"help"` means the word.

Scope words (`tokens` / `components` / `all`) are only meaningful on `system`
and `gui`, and default to `all`. `assess` reserves its own three words in
argument position — `tokens` / `components` / `update` — for its chained modes.

Which command reads what is the whole division of labour, and it is worth stating
plainly: `assess` reads your codebase, `tokenise` reads the sentence you typed,
`create` reads your intent. All three write only `DESIGN-SYSTEM.md`.

## Reference files — load only what the current command needs

| Command | Reference |
|---------|-----------|
| `create` | `refs/create.md` — modes A/B/C, prose parsing rules, archetype contracts, follow-up loop, acceptance and the write step |
| `assess` | `refs/assess.md` — the pipeline, what is scanned, the language-agnostic sweep, React-only component detection, clustering |
| `tokenise` | `refs/tokenise.md` — how a sentence is read, the three passes, the naming scales, the follow-up loop when a value or a name is missing, acceptance |
| `gui` | `refs/gui.md` — server contract, view specs |
| `system` | `refs/system.md` — listing format |
| `version` | `refs/version.md` — what is reported, the on-demand registry rule, offline behaviour |
| `update` | `refs/update.md` — install detection, the four supported cases, graceful refusals, skill re-sync |
| `init` | `refs/init.md` — the walkthrough, step by step |

## The file format

`DESIGN-SYSTEM.md` is human-readable Markdown with machine-parseable structure.
Its skeleton is fixed and every section is always present, even when empty:

1. **Header block** — project name, Phyllum version, created date, and a one-line
   warning that Phyllum manages the file.
2. **Tokens** — three fixed subsections: Colours, Numbers, Typography. Empty
   tables still ship their header rows.
3. **Components** — one `###` heading per component, holding a fenced YAML spec
   block followed by a generated code block.
4. **Backlog** — auto-maintained list of `TODO: tokenise` raw values and skipped
   contract slots, so the debt is visible at the bottom of the file.

**Fencing rule.** Component entries nest fenced code blocks inside the file, so
every block Phyllum writes uses one more backtick than the longest run of
backticks it contains — minimum three, four when the block itself contains a
three-backtick block. Fence length is significant to the parser.

**Other rules.**

- Components reference tokens by name. A raw value carries a `TODO: tokenise`
  marker so the debt is visible.
- Writes are atomic: write a temp file, then rename, so a crashed run can never
  corrupt the file.
- Never rewrite a section you were not asked to change.

## Execution model

- **Mechanics** (`menu`, `help`, `system`, `gui`, `kill`, `version`, `update`,
  `assess`'s scan, and `init`'s scaffold and install steps) run entirely in Node,
  with no model involved.
- **Intelligence** (`create`, `tokenise`, and `init`'s detection and seeding
  steps) is this skill. Inside a Claude Code session it runs natively; from a
  plain terminal the CLI shells out to `claude` with this skill loaded.
- If `claude` is not installed, the intelligent commands fail with a clear
  message naming the two options — install Claude Code, or run the skill from a
  Claude Code session. Mechanics keep working regardless.

## Two rules that outrank being helpful

**Never invent a value.** Everything in a component spec traces to the user's
input, an image you traced, an answered follow-up, or a token they picked. A
slot nobody filled is a question or a `TODO` — never a plausible guess, never a
value carried over from a neighbouring component without asking.

**Never correct a value.** Phyllum governs *which* slots must be filled, never
*what* goes in them. Four radii on one button, a gradient background, a 3px
font: record it exactly as given.

## Milestone status

M1 shipped `menu`, `help`, `system` and `init` (scaffold plus skill install).
M2 shipped `create` in prose mode: draft spec, gap list from the archetype
contract, follow-up loop, React + CSS code view, accept, write.
M3 shipped `tokenise`: the read-only scan, the three passes, clustering before
naming, the frequency-ranked review, the diff on rerun, and `init`'s step-4
seeding — which offers the scan and never names anything on the user's behalf.
M4 shipped `gui` / `dashboard` and `kill`: the localhost-only Python server, the
three-view page, the `/state` · `/system` · `/prompt` · `/upload` API, and the
PID-and-port lifecycle.
M5 ships `create`'s other two modes. **Image mode**: an argument that resolves
to an image file is validated, framed as a trace request, and the result is
ingested — measurements above their confidence bar become values, everything
else becomes a follow-up question, and a claim about something a still image
cannot show is refused. The measuring happens here, in the session, because this
is where the eyes are. **Pick mode**: bare `create` offers the archetypes plus
the components the codebase keeps repeating without ever naming, and a pick
seeds a name and an archetype — never values. An image dropped on the dashboard
queues an image-mode `create`, which the next bare `create` picks up.

v0.2.0 M1 ships `version` and `update`, the self-maintenance pair. `version`
reads the installed version from the package itself and asks npm what the latest
published version is — the only network call in the product, made only when the
user asks for it, with no passive update hints anywhere else. `update` detects
how Phyllum was installed (npm or pnpm, global or project dependency), runs that
manager's own update, and re-syncs the installed skill copy so the CLI and the
skill are never two versions; a one-off `npx` run, a source checkout or any other
package manager gets a graceful refusal naming the exact command to run instead.

v0.2.0 M2 reworks `tokenise` into a **prose-only** command: one sentence in, one
named token out. It no longer reads the codebase — scanning becomes `assess`'s
job — so `phyllum tokenise "our brand blue #2563EB"` is the whole input. A name
in the sentence is used verbatim; without one, Phyllum suggests a name off the
scales in `refs/tokenise.md` and confirms it. A sentence with no value ("add a
token for our brand blue") opens a follow-up question asking for the value, the
way `create` asks about a gap, and the token is written only once the answer
completes it — never a dead-end error. A length whose meaning the sentence does
not state is asked about too, because a 12px radius and a 12px padding are
different facts. `tokenize` stays the alias, and accepted tokens land in the same
token sections of `DESIGN-SYSTEM.md` as before.

v0.2.0 M3 ships `assess`'s scan engine — the read half of the command that picks
up what `tokenise` put down. It detects the stack, sweeps the project read-only,
and aggregates what it finds: near-identical values cluster into one decision,
usage is counted, and the result is ranked by how hard the code leans on each
value. Two commitments shape the reach of the scan. The **values pass is
language-agnostic**: stylesheets are read as stylesheets and markup as markup,
and every other text file is read for `property: value` pairs, so a theme file in
JSON, Go or Kotlin counts as much as a `.css` file does. **Component detection is
React only**, and on any other stack the report says the component pass did not
run rather than pretending it did. A value the design system already names is
reported as coverage, never proposed again, which is what makes a second `assess`
show only what has drifted. The mapping table and the two suggestion tracks read
this result rather than rescanning, and the scan itself writes nothing at all —
`refs/assess.md` is the contract.

Commands that are not built yet are registered and documented, and say so when
invoked.
