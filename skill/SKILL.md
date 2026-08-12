---
name: basal
description: Design system companion. Turns prose, images, or the styles already in the codebase into named design tokens and components, and records all of it in a single DESIGN-SYSTEM.md. Use when the user asks to create a component, extract or name tokens, view the design system, or set Basal up in a project.
---

# Basal

Basal is a design system companion. It reads a codebase, or takes prose and
images straight from the user, and turns that input into **tokens** and
**components** recorded in one file: `DESIGN-SYSTEM.md`.

Three ideas govern every command:

1. **Rerunnable.** Running anything twice converges. Re-tokenising does not
   duplicate tokens; re-creating a component opens a revision of it.
2. **Conversational, not form-driven.** Missing information is gathered through
   follow-up questions with smart suggestions — never a blank required field.
3. **One write target.** `DESIGN-SYSTEM.md` is the only file in the user's
   codebase Basal may modify.

## Permission rule — hard, no exceptions

Basal writes **exactly one file** in the user's codebase: `DESIGN-SYSTEM.md`.

Three operational exceptions exist, all Basal-owned:

| Path | When |
|------|------|
| `DESIGN-SYSTEM.md` | any command, after the user accepts a change |
| `.basal/**` | session state; gitignored |
| `.claude/skills/basal/**` | `init` only — the skill install |
| one `.basal/` line in `.gitignore` | `init` only, with the user's confirmation |

Nothing else, ever. Do not write generated component code into the codebase,
do not rewrite existing styles to use tokens, do not touch config files. If a
task seems to need a write outside this list, stop and tell the user instead.

## Commands

| Command | Alias | What it does |
|---------|-------|--------------|
| `basal` | — | Interactive session; a menu of the commands below |
| `menu` | — | List every subskill, one line per command |
| `help` | — | Explain Basal; `help [command]` explains one command in depth |
| `create` | `build` | Craft a new component from prose, an image, or a pick |
| `tokenise` | `tokenize` | Extract and name tokens from the codebase |
| `gui` | `dashboard` | Local server plus HTML dashboard |
| `kill` | — | Stop the running GUI server |
| `system` | — | Print the design system to the terminal |
| `init` | — | Guided setup: scaffold the file, install this skill |

Aliases are exact equivalents — same subskill, same behaviour.

`help` is a reserved word in argument position: `create help` is help *about*
create, never a component named "help". A quoted `"help"` means the word.

Scope words (`tokens` / `components` / `all`) are only meaningful on `system`
and `gui`, and default to `all`.

## Reference files — load only what the current command needs

| Command | Reference |
|---------|-----------|
| `create` | `refs/create.md` — modes A/B/C, prose parsing rules, archetype contracts, follow-up loop, acceptance and the write step |
| `tokenise` | `refs/tokenise.md` — what is scanned, the three passes, clustering, naming scales, the review loop, the diff on rerun |
| `gui` | `refs/gui.md` — server contract, view specs |
| `system` | `refs/system.md` — listing format |
| `init` | `refs/init.md` — the walkthrough, step by step |

## The file format

`DESIGN-SYSTEM.md` is human-readable Markdown with machine-parseable structure.
Its skeleton is fixed and every section is always present, even when empty:

1. **Header block** — project name, Basal version, created date, and a one-line
   warning that Basal manages the file.
2. **Tokens** — three fixed subsections: Colours, Numbers, Typography. Empty
   tables still ship their header rows.
3. **Components** — one `###` heading per component, holding a fenced YAML spec
   block followed by a generated code block.
4. **Backlog** — auto-maintained list of `TODO: tokenise` raw values and skipped
   contract slots, so the debt is visible at the bottom of the file.

**Fencing rule.** Component entries nest fenced code blocks inside the file, so
every block Basal writes uses one more backtick than the longest run of
backticks it contains — minimum three, four when the block itself contains a
three-backtick block. Fence length is significant to the parser.

**Other rules.**

- Components reference tokens by name. A raw value carries a `TODO: tokenise`
  marker so the debt is visible.
- Writes are atomic: write a temp file, then rename, so a crashed run can never
  corrupt the file.
- Never rewrite a section you were not asked to change.

## Execution model

- **Mechanics** (`menu`, `help`, `system`, `gui`, `kill`, and `init`'s scaffold
  and install steps) run entirely in Node, with no model involved.
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

**Never correct a value.** Basal governs *which* slots must be filled, never
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
queues an image-mode `create`, which the next bare `create` picks up. Commands
that are not built yet are registered and documented, and say so when invoked.
