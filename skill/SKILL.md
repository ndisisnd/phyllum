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

A handful of operational exceptions exist, all Phyllum-owned, and each one is
enumerated rather than tolerated — the assertion suite diffs the whole project
directory around every command and fails on anything not in this list:

| Path | When |
|------|------|
| `DESIGN-SYSTEM.md` | any command, after the user accepts a change |
| `DESIGN-SYSTEM.md`, the `applied:` lines only | `apply` and `apply run`, with no question asked — a derived reading of the codebase, scoped to the `applied:` line of each component's spec block and nothing else in the file (v0.5.0 §3.2; `refs/apply/apply.md`) |
| `DESIGN-SYSTEM.md.bak` | the same write, one step earlier — the pre-edit copy the funnel always takes (v0.2.1 §6.5.2) |
| `.phyllum/**` | session state, `apply`'s plan at `.phyllum/PRD.md`, and `assess --json`'s default output; gitignored |
| `.claude/skills/phyllum/**` | `init` — the skill install; and `upgrade`, which re-syncs that same copy and, on confirmation, removes files this version no longer ships (v0.7.1) |
| Phyllum's two `.gitignore` lines | `init` only, with the user's confirmation |
| a JSON path you name | `assess --json <path>` only, and only a `.json` file inside the project |

Nothing else, ever. Do not write generated component code into the codebase,
do not rewrite existing styles to use tokens, do not touch config files. If a
task seems to need a write outside this list, stop and tell the user instead.

Exactly one command is allowed past that line, and only through a gate:
`apply run` (v0.2.0 M7) rewrites source styling to use tokens — but only from a
plan the user has read at `.phyllum/PRD.md`, only on a `phyllum/apply-<date>`
branch, only the files the running phase's criteria name, and only one phase per
commit. `phyllum apply` writes that plan, plus the one derived `applied:` line per
component (v0.5.0 §3.2), and changes nothing else — so the rule above holds
unchanged for every other command.

## The pipeline — four stages (v0.8.0)

Every command belongs to a stage of one pipeline. The stages are the four
questions a design system has to answer, in the order you would work through
them:

| # | Stage | Question it answers |
|---|-------|---------------------|
| 1 | Assess | "What state is my design system in?" |
| 2 | Governance | "What are the rules for using it?" |
| 3 | Build | "Make the thing real." |
| 4 | Refine | "Is it ready for production?" |

**Each stage can also run alone.** The pipeline is a shape, not a gate: a user
who only wants to name one token runs the Build command that does it, and never
touches the other three. Nothing checks that an earlier stage has been done.

**Pipeline order is not delivery order.** The table above is the order the
stages are worked through; the order the stages are *built* is a different list
entirely — Assess in v0.9, Build in v0.10, Refine in v0.11, Governance in v0.12.
v0.8.0 ships the model and nothing else, which is why two stages have no
commands yet. An empty stage is still a real stage: name it when the pipeline
comes up, and say the release it lands in rather than pretending it is missing.

`pipeline` (v0.8.0 M3) prints this model in the terminal — the four stages, the
commands under each, and a reading of where the project you are standing in
currently sits, derived from what is on disk and from nothing else. It never
offers a position it could not read: an unreadable file is reported as
unreadable, because a guessed position is an invented one.

Some commands belong to no stage at all. Running the tool — the menu, help, the
dashboard, printing the file, versions, installs — is grouped as **System**, and
System is a grouping, not a fifth stage. Do not offer it as a step of the
pipeline.

## Commands

The Stage column is the same field the CLI carries per command, so this table
and `lib/registry.js` can never say different things.

| Command | Stage | Alias | What it does |
|---------|-------|-------|--------------|
| `phyllum` | System | — | Interactive session; a menu of the commands below |
| `menu` | System | — | List every subskill, one line per command |
| `help` | System | — | Explain Phyllum; `help [command]` explains one command in depth |
| `pipeline` | System | — | Print the four stages, the commands under each, and where this project currently sits — read-only, derived from the files on disk |
| `create` | Build | `build` | Craft a new component from prose, an image, or a pick; `create primitives` lays down primitive colour ramps instead — wholly mechanical |
| `assess` | Assess | — | Read the codebase and inventory the raw styling in it; `--json [path]` writes the assessment to a file |
| `apply` | Build | — | Plan applying the design system to the codebase; `apply run` executes the plan |
| `update` | Build | — | Change a token or component the design system already records; `update token` walks type → list → pick → prose, `update component` lists the recorded components and revises the one you pick |
| `delete` | Build | — | Remove one component the design system records: the list, a breaking-change warning, a hard block when the codebase is using it, then the acceptance gate **and** the component's name typed back before the one write |
| `tokenise` | Build | `tokenize` | Name the values in a sentence, e.g. "our brand blue #2563EB", "our overlay rgba(0, 0, 0, 0.5)" or "hero backdrop linear-gradient(135deg, #2563EB, #10B981)" — several values become a queue, asked one at a time; with no sentence it asks what kind of token you are recording |
| `gui` | System | `dashboard` | Local server plus HTML dashboard |
| `kill` | System | — | Stop the running GUI server |
| `display` | System | `system` | Print the design system to the terminal |
| `version` | System | — | Print the installed version and check npm for a newer one |
| `upgrade` | System | — | Upgrade this install to the latest published version |
| `init` | System | — | Guided setup: scaffold the file, install this skill |

Governance and Refine hold no commands in this release. Every command that
edits what `DESIGN-SYSTEM.md` records — naming a token, creating a component,
revising one, removing one, applying the system outward — is Build, because all
of it is making the thing real. v0.10 re-homes those commands formally; the
stage they declare here is already the one they will keep.

Aliases are exact equivalents — same subskill, same behaviour.

`help` is a reserved word in argument position: `create help` is help *about*
create, never a component named "help". A quoted `"help"` means the word.

Scope words (`tokens` / `components` / `all`) are only meaningful on `display`
(and its alias `system`) and `gui`, and default to `all`. `assess` reserves its own three words in
argument position — `tokens` / `components` / `update` — for its chained modes,
`create` reserves one, `primitives`, and `apply` reserves one: `run`. `delete`
reserves one too, `token`, and reserves it in order to **refuse** it: removing a
token ripples through every component slot and Backlog line naming it, which is
a different risk and its own release.

Which command reads what is the whole division of labour, and it is worth stating
plainly: `assess` reads your codebase, `tokenise` reads the sentence you typed,
`create` reads your intent. All three write only `DESIGN-SYSTEM.md`. `apply`
reads the design system *and* the codebase, and writes its own plan plus the one
derived `applied:` line per component (v0.5.0 §3.2) — nothing else. `delete`
reads the design system, and reads the codebase only to answer one question:
is this component in use right now?

## Reference files — load only what the current command needs

Every protocol's reference is a **folder**, split into per-topic files (v0.4.1).
Load the one file the moment needs, not the folder: a `create` conversation in
prose mode never has to read the image-tracing rules, and a `tokenise` run that
already has a value never has to read the kind picker. The file named after the
protocol — `refs/create/create.md` — is the frame: what the command is for, and
what it must never do. Everything else is a topic.

| Command | Reference folder | Load which file |
|---------|------------------|-----------------|
| `create` | `refs/create/` | `create.md` the three input modes and Mode A's prose parsing · `archetypes.md` the fifteen contracts, slot vocabulary, labelled defaults, extrapolation · `image.md` Mode B tracing, the result shape, confidence bars, refusals · `pick.md` Mode C and candidate detection · `custom.md` create without a contract, and the marker that says so · `primitives.md` `create primitives`: the two ramp behaviours, derivation, naming, the `Primitives` subsection · `acceptance.md` the follow-up loop, acceptance, the write step, spec block shape, the never-list |
| `assess` | `refs/assess/` | `assess.md` the pipeline and the split commitment · `protocol-assess.md` the Assess stage end to end: scan, hardcoded-value detection, design-system comparison, score, report emission · `protocol-assess-rubric.md` the health score: metrics, weights, bands, the determinism boundary · `scan.md` what is scanned, the language-agnostic sweep, the fourth bucket, compounds · `severity.md` frequency decides, and which rule a finding belongs to · `hygiene.md` collisions and unused · `similarity.md` the three readings, the score, the bands, the caps · `consistency.md` naming-convention drift and prop mismatches · `extras.md` the six smaller checks · `report.md` the findings table, the drift score, the verdict · `detection.md` React-only component detection and clustering · `map.md` the mapping table and the two suggestion tracks · `modes.md` chained modes, `--json`, backups, rerunnable, the never-list |
| `apply` | `refs/apply/` | `apply.md` the frame, the permission rule with its exceptions, and the `applied:` write amendment · `plan.md` harness detection and its precedence, deriving changes per literal, deriving the `applied` flag and when it flips, phase grouping, the two writes · `prd-format.md` the PRD's exact sections, header fields, markers, per-phase verification · `run.md` resume vs `--fresh`, what `apply run` does step by step, status reports, `.phyllum/config.json` |
| `tokenise` | `refs/tokenise/` | `tokenise.md` the frame and the never-list · `prose.md` what a sentence is read for, and the words that carry meaning · `readings.md` several values in one sentence, the queue, the splitting grammar · `picker.md` the kind picker an empty run opens, its solid/gradient fork, and the argument hint every value question wears · `passes.md` the three passes, roles, compounds · `naming.md` the naming sources and every scale, colours and gradients included · `confirmation.md` the review actions, and a value the system already names with how each shape is compared · `acceptance.md` what gets written, and where |
| `gui` | `refs/gui/` | `gui.md` the three views, the look and feel, lifecycle and permissions · `cards.md` showing the values, the swatch thresholds, the colour-card anatomy and its grid · `component-preview.md` the Library panel's rendered component: spec-projection, the projection map and its gate, unrendered slots, the variant and states toggles · `server.md` the server contract, the JSON API, the parse contract |
| `display` | `refs/system/` | `system.md` the listing format; `system` is the same command under its older name |
| `version` | `refs/version/` | `version.md` what is reported, the on-demand registry rule, offline behaviour |
| `upgrade` | `refs/upgrade/` | `upgrade.md` install detection, the four supported cases, graceful refusals, skill re-sync |
| `update` | `refs/update/` | `update.md` the frame, the menu copy with its 0.4.x `apply` breadcrumb, the never-list · `grammar.md` menu, chains and prose, and reading a target out of prose · `token.md` `update token`: the type rows, the argument hints, the rename ripple, the convergence re-check · `component.md` `update component`: the recorded archetype, the pick, the revision |
| `delete` | `refs/delete/` | `delete.md` the frame, the grammar with its reserved-and-refused `token`, the never-list, and what `delete` leaves for `apply` to clean up · `flow.md` the six steps, the copy contract, the in-use rule with its flag-or-live-check split, the double confirmation and the one write |
| `init` | `refs/init/` | `init.md` the walkthrough, step by step |

Two references belong to no command and are the two that are still flat files,
because each is a shared library rather than a protocol. Both are loaded
**whole**, which is why neither is split, and nothing in either runs on its own.

- `refs/nomenclature.md` — the standard token-naming vocabulary (slots, strict
  word lists, slot order) and the shipped primitive grey ramp with its
  derivation scale. Load it when a naming or ramp question comes up.
- `refs/typography.md` — the twenty-one readings a typography token can carry,
  the kind each is gathered as, the CSS declaration each becomes, and the three
  conflict rules. Load it when a typography token is being read, written,
  generated, scanned or drawn.

## The file format

`DESIGN-SYSTEM.md` is human-readable Markdown with machine-parseable structure.
Its skeleton is fixed and every section is always present, even when empty:

1. **Header block** — project name, Phyllum version, created date, and a one-line
   warning that Phyllum manages the file.
2. **Tokens** — three fixed subsections: Colours (`token | value`), Numbers
   (`token | value | applies to`), Typography (`token | size | weight |
   line-height`). Empty tables still ship their header rows. Colours may hold one
   nested `#### Primitives` subsection, in the same columns, for the ramps
   `create primitives` writes; it appears only when there are ramps. Since
   v0.7.3 a typography token that records any of the eighteen **optional**
   readings carries a fenced YAML block beneath the Typography table, under a
   `#### <token>` heading, in the table's own row order — see
   `refs/typography.md`. Size, weight and line-height stay in the four-column
   table, and a token with no optional readings has no block at all, so a file
   written before v0.7.3 reads exactly as it did.
3. **Components** — one `###` heading per component, holding a fenced YAML spec
   block followed by a generated code block. Since v0.5.0 the spec block also
   carries `applied: true` / `applied: false` once `apply` has derived it — a
   reading of the codebase, never a setting. No `applied:` line means `apply`
   has never run, which is not the same as `false`, and a file whose components
   carry no flag reads exactly as it did before.
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

- **Mechanics** (`menu`, `help`, `display`, `gui`, `kill`, `version`, `upgrade`,
  `apply`, `assess`'s scan, mapping table and proposed names, and `init`'s
  scaffold and install steps) run entirely in Node, with no model involved.
- **Intelligence** (`create`, `tokenise`, `assess`'s suggestion review, and
  `init`'s detection and seeding steps) is this skill. Inside a Claude Code session it runs natively; from a
  plain terminal the CLI shells out to `claude` with this skill loaded.
- If `claude` is not installed, the intelligent commands fail with a clear
  message naming the two options — install Claude Code, or run the skill from a
  Claude Code session. Mechanics keep working regardless.
- `assess` is the one command that spans both halves, so it degrades instead of
  failing: the report, the map and the proposed names are printed in full, and
  only the review is left un-walked. It never pitches an install, because it did
  its mechanical job.

## Two rules that outrank being helpful

**Never invent a value.** Everything in a component spec traces to the user's
input, an image you traced, an answered follow-up, or a token they picked. A
slot nobody filled is a question or a `TODO` — never a plausible guess, never a
value carried over from a neighbouring component without asking.

**Never correct a value.** Phyllum governs *which* slots must be filled, never
*what* goes in them. Four radii on one button, a gradient background, a 3px
font: record it exactly as given.

## Milestone status

M1 shipped `menu`, `help`, `display` (then called `system`) and `init` (scaffold plus skill install).
M2 shipped `create` in prose mode: draft spec, gap list from the archetype
contract, follow-up loop, React + CSS code view, accept, write.
M3 shipped `tokenise`: the read-only scan, the three passes, clustering before
naming, the frequency-ranked review, the diff on rerun, and `init`'s step-4
seeding — which offers the scan and never names anything on the user's behalf.
(**Superseded in v0.2.0 M2**: the scan moved to `assess` and `tokenise` is
prose-only now. See "v0.2.0 M2" below — this line is release history, not the
current contract.)
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

v0.3.0 M1 ships the **nomenclature library** — a standard vocabulary for token
names, shipped as spec tables in `refs/nomenclature.md` rather than as code, the
same way the naming scales have always shipped. A standardised name is built
from four slots in a fixed order — `<family>-<rank>[-<exception>][-<state>]` —
where the *set of words* per slot is strict and *which* slots a name uses is
loose. Eight families (`neutral`, `interaction`, `accent`, `surface`, `success`,
`warning`, `danger`, `info`), three ranks, six exception words and seven state
words, each list drawn from what Carbon, Polaris, Atlassian, Material 3 and
Fluent all actually ship. Slot order is part of the strictness, so
`interaction-primary-hover` is a name and `hover-interaction` is not — state is
last in every surveyed system, and the walk that reads a name enforces it. The
same file carries the nine shipped neutral-ramp constants and the fixed
lightness-and-saturation scale a derived ramp is placed on. The library
**supersedes** the old `color-primary` scale as the default suggestion, which
becomes the fallback for a colour whose description signals no role; it is the
semantic layer, primitives are the value layer. Nothing existing is ever renamed
— the library changes proposals only.

v0.3.0 M2 teaches `tokenise` to read a sentence carrying **several values**. One
sentence in, a **proposal queue** out: `phyllum tokenise "#2563EB #10B981
#F59E0B"` becomes three entries, and `"heading 24px bold 1.2, body 16px regular
1.5"` becomes two typography readings. The queue is intake, not protocol — every
entry runs the same walk a lone value has always run, one question at a time, in
sentence order. Names bind leftwards, so "brand blue #2563EB and success green
#10B981" names both; duplicates inside one sentence collapse to one proposal;
the ranked colour scale counts earlier acceptances in the same run, so the first
colour ranks before the second. A skipped or declined entry costs only itself and
the queue moves on. The whole queue is kept in `.phyllum/session.json` as it
goes, so a run cut short is picked up where it stood rather than retyped, and the
`.bak` is taken before the *first* write of the run, so the undo it holds is the
file as it stood before the whole sentence.

v0.3.0 M3 ships **`create primitives`** and slims the Colours table. The command
lays down the primitive colour ramps semantic tokens sit on: nine steps, `100`
to `900`. With no colour tokens recorded it offers the neutral ramp alone — nine
constants read straight out of `refs/nomenclature.md`, identical for every user,
shown in full before acceptance. With colour tokens recorded it offers a ramp per
token, and **each token is asked about first**: a no generates nothing for it.
A derived ramp holds the token's hue and saturation, places lightness on the
fixed scale, and slots **the user's own value back at its nearest step
unchanged** — the never-correct rule has no exception at the ends of a scale.
It is arithmetic and table lookup end to end, no model in the path, so unlike the
rest of `create` it runs in a plain terminal. Steps glue the number to the base
name with no hyphen (`accentRed` → `accentRed100`), which is how a value-layer
name reads differently at a glance from a hyphenated semantic one. Ramps land
under a nested `#### Primitives` heading inside Colours, as ordinary rows; a ramp
already present is reported, never duplicated, and a half-present ramp offers
only its missing steps. The same milestone drops Colours' `notes` column —
provenance is history, not design system — so Colours is `token | value`, matching
every other section's value-only posture. A file still carrying the legacy column
is read and served as it stands; `init`'s repair offers the removal rather than
performing it.

v0.3.0 M4 widens `create`'s vocabulary and gives it a way out of it. The
archetype table grows from five contracts to **fifteen** — Toggle, Checkbox,
Radio, Select, Tooltip, Toast, Tabs, Link, Avatar and Progress join, each with
its own mandatory slots, states, labelled defaults and candidate signals, all in
`refs/create/archetypes.md` as rows rather than code. And the picker gains a last row:
**custom**, a component that follows no contract. A custom has no mandatory
slots, no mandatory states and no gap list — it records exactly the slots the
user describes and is complete when they say so. Prose that matches no archetype
is *offered* custom rather than forced into the nearest fit; prose that matches
one never lands in custom. Everything non-negotiable holds: no invented values,
the same spec-block file shape, rerunnable as a revision, one acceptance gate and
one write. A custom records its status in the spec block (`archetype: custom`
plus `custom: true`) so that every contract lookup for it comes back empty by
design — `assess`'s component matching, extrapolation and `apply`'s adoption all
read the marker and skip rather than grading it against rules it never claimed.

v0.3.0 M5 is a presentation release for the dashboard: it **shows the values**
instead of printing them. Every colour token renders as a filled swatch of its
own colour, with a bordered variant where a near-white would vanish against the
page and a label that flips to dark ink once the fill is light enough — both
thresholds are rows in `refs/gui/cards.md`, not constants in the page. A primitives
ramp renders as a nine-step strip, which is where the `Primitives` subsection
pays off visually. Typography tokens render as live specimens in their own size,
weight and line-height; numbers render as a plain list cut into one group per
`applies to` reading, labelled in the file's own words. The styling followed Carbon Design System *lines* at the time —
flat tiles, sharp corners, a disciplined type ramp, generous whitespace, a left
rail — restyled along Notion lines in v0.5.1 (`refs/gui/gui.md` is the live
contract). What has never changed is the delivery: no dependency on any design
system, a hand-written stylesheet in the one file, a type stack that falls back
to the system faces, and a page that fetches nothing, so it renders with no
network at all. Behaviour is
unchanged — read-only, live `DESIGN-SYSTEM.md`, localhost only, the same
`gui`/`kill` lifecycle. The dashboard shows the file; writing it stays the CLI's.

v0.4.0 M1 makes **rgba first-class**. The colours pass has read `rgb()`, `rgba()`,
`hsl()` and `hsla()` since the value-shape table was written; what this milestone
changes is everything around the parser that still assumed hex. Every prompt,
example and doc that said "a colour like #2563EB" gains an rgba one, so a user
pasting out of devtools knows the paste will land. And the comparison that
matters converges: `normaliseValue` compared strings, so `rgba(37, 99, 235, 1)`
and `#2563EB` were two colours and one blue could be named twice — the exact
thing convergence exists to prevent. Any value the colour reader can read now
compares **by its channels**, alpha included, so `rgba(0,0,0,0.5)` and
`rgba(0,0,0,0.9)` stay two facts. `phyllum:value-comparison` in
`refs/tokenise/confirmation.md` is where a shape says how it is compared; a shape the table
does not list keeps the older string reading, so an unknown value is never folded
into a colour it might not be. Comparison only — the **recorded** value stays
exactly as typed, never-correct rule.

v0.4.0 M2 makes a **gradient** a value the colours pass recognises: the six
shapes (`linear-`, `radial-`, `conic-gradient()` and their `repeating-` forms),
each read as one value wherever a colour is read, with the commas and brackets
inside never splitting a batch sentence. The whole function is the value — stops,
angle, percentages, exactly as typed, never reordered — and it lands in **Colours**
as an ordinary `token | value` row, because a gradient is a colour decision and a
fourth section would change every `DESIGN-SYSTEM.md`'s shape for no gain. Naming
has its own scale, `phyllum:gradient-names`, rather than a shape column on the
colour scale: every row of the colour scale is a lightness and a saturation test
and a gradient has neither. Every name Phyllum proposes for a gradient carries the
mark word `gradient` — a library-derived name takes it as its last part, and the
fallback `gradient-{n}` leads with it. What gradients do not touch is as much of
the contract: duplicate detection stays string-level, `create primitives` skips
them as it skips every value `toHsl` cannot read, and `assess` does not learn to
scan for them this release.

v0.4.0 M3 gives the **empty run** somewhere to go. `phyllum tokenise` with
nothing keeps its resume offer first, always, and then replaces the bare
free-text question with a numbered picker: a colour, typography, a border radius,
spacing, or something else. Each pick asks the one follow-up that kind needs and
hands the **assembled sentence** to the parser a typed sentence would have
reached — so the picker builds prose and no protocol lives in it. `8px` picked
under *a border radius* becomes `8px radius`, and the "what does this apply to?"
question never fires, because a question already answered is not worth asking
twice. Picking *a colour* asks one more: solid, or a gradient. Free text is
honoured at every step, a skip at any depth writes nothing, and a `--no-input`
run with nobody to ask still prints usage and exits — a picker with nobody to
pick is a wall. The same milestone lands **argument hints**: every question that
asks for a value shows the shape its answer takes, in brackets, in a fixed order
— `Write your colour as [HEX code / rgba value] [name]`. The hint text lives in
`phyllum:value-questions` beside the question it decorates, so the skill, the CLI
and the assertions read one source; a hint understates on purpose rather than
listing every shape and burying the common case.

v0.4.0 M4 turns the dashboard's colours into **cards in a grid**. Each colour
token is a card: a large filled swatch with rounded corners on top, and beneath
it — not on it — the token name, then the value on its own line. That supersedes
v0.3.0's "value and name sit on the swatch" rule; the bordered variant for
near-white swatches stays, since a white swatch off the page background still
needs an edge. The cards lay out in a responsive grid rather than one token per
row, and a gradient paints itself as the swatch fill for free. Primitives ramps
keep their nine-step strips inside the `Primitives` subsection — a ramp reads as
one thing, so the card grid is for the semantic Colours table. The card chrome
uses the page's own palette and type ramp; the rounded corner was the one
recorded departure from the then-sharp-cornered direction, and v0.5.1 inverted
that rule — rounded is the page's default now. Only a value the page recognises as a hex
literal or one of the six gradient shapes is ever inlined into a `style`
attribute, so a hand-edited value carrying CSS or markup renders as text on an
unfilled swatch. Behaviour is unchanged: read-only, live `DESIGN-SYSTEM.md`,
localhost only, zero dependencies, no network fetch.

v0.4.0 M5 makes `update` **its own command**: the design-system editing verb.
`phyllum update` no longer reaches `apply`, and `update run` no longer exists;
`apply` keeps its own name, help and behaviour, untouched, and moving the
*install* is still `upgrade`, which took that job in v0.3.0 M6. Empty `update` opens a menu — a component,
or a token — carrying one 0.4.x breadcrumb line pointing at `apply` for anyone
who typed it out of muscle memory. `update token` walks type → the full list of
that section → pick one → a sentence describing the change, with the same
argument hint every value question wears; the proposal shows old and new side by
side before the acceptance gate, and the write is the one funnel, `.bak` first.
A rename ripples in that same write — every component spec slot and every
Backlog `TODO` line naming the old token — and the run says so before you
accept. A new value re-runs convergence with the cross-format comparison, so an
edit can never put two names on one value. `refs/update/` carries the whole
contract, and §6.5 is the never-list: no codebase, no `.phyllum/PRD.md`, nothing
written before the gate or outside the one funnel, no guessed target, no changed
slot the prose never mentioned, no invented or corrected value, and no deletion —
removal is `phyllum delete` (v0.5.0 M2), a different verb carrying a different
risk, and `update` still reaches none of it.

v0.4.0 M6 adds the menu's other row. `update component` prints the recorded
components with the archetype each spec block **records** — never inferred, so an
entry with no spec block prints none and is answered with `create` rather than
revised out of a guess — takes a pick and a sentence, and lands the change as a
**revision**. The revision is `create`'s own: the same draft extraction reads the
sentence, the same carry-over keeps every slot the sentence never mentioned
byte-identical, the same token resolution names a raw value the system already
holds, and the same acceptance path is the only way to the file. `update
component` is a second door into that machinery rather than a second copy of it;
the only thing it owns is the conversation that gets a target and a sentence in
front of it. A slot named without a value is a question, a skipped question is a
`TODO`, and a custom keeps its marker through the revision.

v0.4.0 M7 closes the release: the docs sweep the un-aliasing made larger than
usual, the 0.4.0 baseline, and a hardening sweep over the surfaces this release
added. The **contract tables** grew from one tolerant file to three, so
the `tokenise` reference's new tables and all of `refs/update/` now drop an unreadable
row instead of taking the row's meaning silently — and the notice names its file
as well as its table, because a message naming the wrong file is worse than none.
A **rename** is now checked the way a value change already was: renaming onto a
name the system already uses, or renaming a token whose name sits on two rows, is
surfaced and stopped rather than written, because a ripple that cannot tell which
row a reference meant would hand the picked row every reference the other owned.
A **token row with no name or no value** is left out of the list and the omission
is said, so no proposal about nothing reaches the acceptance gate. And the type
question in `update token` no longer throws on a free-text answer — the one
question that promised prose was the one that refused it.

v0.4.1 M1 turns every protocol's reference into a **folder**. `refs/assess.md` was
1,068 lines and `refs/create.md` and `refs/tokenise.md` were around 750 each, so a
command that needed the naming scales loaded the image-tracing rules too. Each
reference is now a folder of per-topic files — the file named after the protocol is
the **frame** (what the command is for, what it must never do) and everything else is
a topic a moment can need alone, with no file split below the loading unit. The
reference table above re-points per command and carries a one-line topical index, which
is where the lazy loading actually happens: the session reads `refs/tokenise/naming.md`
rather than the protocol. `refs/nomenclature.md` stays flat, because a shared library
loaded whole is not lazy about anything. Nothing else moved: **marker names are still
globally unique across the whole tree**, so a marker still identifies one table in one
file, and `lib/refs.js` is the one module that knows where a protocol's files are and
which file a marker lives in — the tolerant-table notice from v0.4.0 M7 names the real
file rather than assuming the protocol's. The CLI is not lazy and never was; it reads a
protocol's folder whole on first use and caches it, so every contract means exactly what
it meant when the file was flat. A pure re-shelving: no command surface, no behaviour,
and no recorded contract changed.

v0.4.1 M2 makes the dashboard **draw the component**. Clicking an entry in the Library
view has always shown a spec block and a code block; the panel's first section is now
the component itself, with the labelled `yaml` and `jsx` blocks unchanged beneath it.
The drawing is a **spec-projection, never code execution** — the stored block is React
source, and running it would need a JSX transform (a dependency, a build step or a CDN
fetch, all three on the page's never-list) on content out of a file a person hand-edits.
So `/system` now carries each component's parsed slots — `archetype`, `custom`,
`properties`, `states`, read by `parseSpecBlock`, the same reader `create`, `update` and
`assess` use — beside the raw block, and the page projects those slots onto **one**
element per archetype, named by the new "preview element" column of `phyllum:contracts`
in `refs/create/archetypes.md`; a `custom` has no contract and no row, so it is drawn as
a generic box from whatever slots it carries. Every value passes the **shape gate** the
colour cards have used since v0.4.0 M4, widened from fills to every property, before it
reaches a `style` attribute. What cannot be drawn is said rather than approximated: a
`TODO` slot, a token name no table holds, a value the gate refused, and a property that
is a second box rather than a declaration are all printed underneath as **unrendered
slots** with their reason, because a preview that silently invented a background would
break the no-invented-values rule in the one place a user would believe it. Two toggle
rows sit with the preview. Entries sharing a base name — the part before the last `/` —
group into a **variant toggle** that swaps the rendered spec in place, and a component
with no siblings shows no toggle at all. A spec's recorded `states:` become a second
toggle whose slots **overlay** the base, so `hover` reads as the component with its hover
slots applied rather than as a second component. Read-only, live `DESIGN-SYSTEM.md`,
localhost only, zero dependencies, no network fetch and no new server route.

v0.4.1 M3 closes the release: the docs sweep, the 0.4.1 baseline, and a hardening
sweep over the two surfaces this release added. **The reference tree became a
tree**, so `lib/refs.js` turns a protocol name into files on disk — and a folder
that is missing, is not a folder or cannot be read used to arrive as a raw
`ENOENT` naming Phyllum's own install path, which is the shape v0.2.1 M6 ruled
out. It is a named `RefsError` now, caught at the same dispatch boundary as a
damaged `nomenclature.md` and answered with the folder and `phyllum upgrade`. A
protocol name that is not a plain folder name is **refused rather than
resolved**, because `refs/../..` walked out of the tree and came back with files
that were not references at all, and a traversal that returns files looks like a
success. **The archetype table grew a column** and a second reader, and it was
the last shipped contract table with no tolerance in it: one hand-mangled row
took every caller down with a `TypeError`. It drops the row and names its file
as well as its table now, which is v0.4.0 M7's argument applied to the fourth
file — while a row that merely predates the preview-element column stays, its
element reading as `null` rather than as a guess, because a table one column
short is still a table. And in the preview, a spec recording a state called
**`default`** offered that state twice on the toggle and applied it never; it is
one option now, and the recorded slots are drawn, because the copy that did
nothing was the one the file actually recorded. A typography token whose row is
not three readings is reported unresolved rather than throwing mid-panel.

v0.5.0 M1 teaches a component to know whether it is **used**. Once `phyllum
apply` has run, every recorded component's spec block carries `applied: true` or
`applied: false`: is this component adopted in this codebase right now? The
reading is **derived, never declared** — no command sets it, no question offers
it, and a hand-edit of it is overwritten by the next derivation, because the
flag is a reading of the codebase rather than an opinion about it. The evidence
is `apply`'s own and is not written twice: `alreadyAdopted`, the predicate the
adoption pass already skips on, is the one predicate, so a flag and a plan can
never disagree about what "already this component" means. It is an *identity*
test rather than a judgement — no archetype is graded — which is why it reads
the same on any stack and reads a `custom` component too. **No flag at all means
`apply` has never run here**, and absence is never `false`; that one distinction
is what `delete`'s in-use block rests on. Two writers exist and they agree:
`apply` re-derives every flag on every run, and a completed `Adopt <Component>`
phase of `apply run` flips that one component to `true` in the same breath as
the PRD tick. The write is the release's one recorded exception to "`apply`
writes only its plan", and it is recorded loudly rather than slipped in — the
permission table above carries the row, `refs/apply/apply.md` names its exact
scope, and the assertion that diffs the project around every `apply` run still
fails on any other change. It is **surgical**: only the `applied:` line of each
spec block moves, through the one funnel, `.bak` first, and a run that changes
no line writes nothing at all. `display`, `system`, the GUI and the JSON print
the reading when there is one and nothing when there is not, so every file
written before v0.5.0 reads exactly as it did.

v0.5.0 M2 builds the verb the never-list has pointed at since v0.4.0:
**`delete`** removes one recorded component, behind the loudest gate in the
product. The flow is six steps and only the last one writes. It lists every
`### <name>` in Components with the archetype its spec block records and its
`applied` reading, and takes a pick — `phyllum delete <name>` pre-answers that,
and an unknown name lists and asks rather than failing. Then a
**breaking-change warning prints, always**, before any question about
proceeding: code generated from the component stays in the codebase and stops
matching anything recorded. Then the **in-use block**, which reads the
`applied: true` flag when there is one and runs a **live** adoption check when
there is not — absence of a flag means `apply` has never run, never "not in
use" — and refuses with the evidence and the way out, at exit 0, because a
refusal honoured is not an error. There is no flag, option or `--force` past
that block. Then the acceptance gate shows exactly what goes, the entry and its
Backlog lines and nothing else; and then a **second confirmation** asks for the
component's **name, typed back**, because a `y` proves agreement while a typed
name proves the user is looking at the right target. `--yes` and a
non-interactive run never satisfy it, so a `delete` with nobody to ask refuses
and says why. The write is the one funnel — `.bak` first, atomic — and it is
**surgical**: the entry, its blocks and its Backlog lines go in one write, every
other byte of the file is the file the user had, and a Backlog line naming a
second recorded component is left alone. Removing the last component leaves the
section's "no components yet" note rather than a bare heading, and the report
names the `.bak` as the undo. `delete token` is **reserved and refused** with
its reason (a token's removal ripples through every slot and Backlog line naming
it), and `.phyllum/PRD.md` is not edited — the next `phyllum apply` drops the
criteria whose component has vanished and reports how many, which the report
says out loud when a PRD exists. The whole contract is `refs/delete/`, and
`delete` (v0.5.0 M2) is the only destructive verb Phyllum has.

v0.5.0 M3 closes the release: the docs sweep, the 0.5.0 baseline, and a hardening
sweep over the two surfaces this release added. Both of them are new *readings*
of a file a person hand-edits, which is where this sweep has always found the
holes. **The `applied:` line** is the first spec-block key read as a decision
rather than as text, and the decision it feeds is the one destructive verb's
in-use block — so `applied: maybe` was being read as `applied: false`, which is
the silent yes the whole release is built to refuse. Only `true` and `false` are
readable now; anything else is unreadable, unreadable is not `false`, and the
block goes and reads the codebase instead, saying out loud which line it could
not read. **Two components under one name** was the same fault wearing a
different coat: the flag came from the *last* block of that name while the
deletion took the *first* block's lines, so the reading and the bytes were about
different entries. A duplicated name now carries no reading at all, and `delete`
says the name does not identify one entry rather than picking one. And
**`refs/delete/`** is the fifth tolerant contract folder — v0.4.0 M7 made three,
v0.4.1 M3 made four — so a hand-mangled row is dropped with a notice naming its
file as well as its table, asserted here rather than assumed from the shape of
the code. The eval suite grows for the first time since v0.2.1 M5: `delete-flow`
was pinned and unscored through M2 on purpose and is scored now, because
`delete` is the first *gated* flow in the product and what rots in a gated flow
is the order it speaks in. Twenty evals, every one at 1.000, no threshold
lowered.

v0.5.1 M1 restyles the dashboard **along Notion lines, not on Notion**: simpler,
softer, rounder. Rounded corners become the default, drawn from a two-step scale
in `--radius-sm` and `--radius-md` so the page rounds from one place — which
inverts the standing rule, since sharp corners are the departure that needs
recording now rather than the swatch's roundness. Hairlines give way wherever a
background shift says the same thing, a surface that needs lifting takes one low
diffuse shadow instead of an edge, and the palettes move to warm near-white over
soft warm greys in the light theme and soft charcoal rather than pure black in
the dark one. The dark product header over a light body goes; the shell is one
calm surface with a quieter left rail. The type stack becomes Geist-first under
exactly the rule Plex followed — used where it is already installed, never
fetched. Beside the restyle comes **the theme control**: light · dark · system,
with `system` the default and therefore the behaviour every existing page
already had. The `data-theme` attribute on the root element picks a variable set
and `system` defers to `prefers-color-scheme`; the choice persists in
`localStorage` under `phyllum.theme`, because a presentation preference belongs
to the viewer's browser and not to `.phyllum/session.json`, which records what
the *server* needs to know. An absent or unreadable choice reads as `system`,
and the stored choice is applied in the page's own inline head script before the
body paints, so the page never flashes the wrong theme. Nothing about delivery
changes: no dependency, no webfont, no CDN, no external URL in the file.

v0.5.1 M2 gives the component preview **attribute controls** — its third toggle
row, and the first that is not a picker. Where the spec records an icon slot,
the panel shows an on/off control for it, and flipping one shows or hides the
slot in the drawing. Four rules hold it to the honesty the rest of the panel
keeps: derived and never invented, so a spec with no `trailing-icon` gets no
trailing-icon control; a `TODO` slot gets no control and keeps its line in the
unrendered list, because a switch that does nothing is a worse answer than a
stated gap; projection only, so the drawing changes and the file, the `yaml`
block and the served payload do not; and reset on switch, so changing variant or
state returns every control to the spec's recorded reading. The toggleable slots
are `leading-icon` and `trailing-icon` and nothing else this release —
`phyllum:preview-attributes` in `refs/gui/component-preview.md` carries them,
`phyllum:preview-presence` reads a slot's recorded value as shown, hidden or
unresolved, and `phyllum:icon-slots` in `refs/create/archetypes.md` records which
archetypes may carry them at all, because a slot nobody wrote down is a slot
nobody may invent. Drawing one bends the single-element rule by exactly one
recorded step: an archetype whose contract records icon slots may draw **one
child box per shown slot** — a filled dot in the page's muted ink, sized in `em`
from the component's own type, carrying no inline style of its own. Phyllum
records that an icon slot exists, not which icon fills it, so there is no icon
font, no asset fetch and no guessed glyph; a void element such as an `input`
lists its recorded icon slot as unrendered instead of drawing into it.

v0.5.1 M3 closes the release: the docs sweep, the 0.5.1 baseline, and a hardening
pass. The sweep's job this time is the *look* every doc still described — the
README, `llms.txt` and this file said Carbon, flat tiles and sharp corners, which
stopped being true in M1 — so each live claim is rewritten to the Notion-like
contract in `refs/gui/gui.md` while the historical lines stay as they were
written, because release history is a record and not a claim. The hardening pass
re-asserts what the restyle could quietly have broken: every marker table in the
reference tree resolving once and only once across the folders, and the page
still self-contained — no webfont, no CDN, no `src=` attribute and no external
URL anywhere in `gui/index.html`. Twenty evals, every one at 1.000, no threshold
lowered.

v0.6.0 M1 retires the **Numbers umbrella**. The dashboard used to cut the
Numbers table into groups under one shared heading; every distinct `applies to`
reading — `radius`, `spacing`, `shadow` today, whatever a file names tomorrow —
now renders as its own first-class section on the same single page, same
verbatim label, same file order, and the same trailing `other` group for a
blank cell. No section is titled "Numbers" any more, and the bar and track
`refs/gui/cards.md` had already dropped in v0.5.1 stay gone; this milestone
re-verifies rather than re-removes them. v0.6.0 M2 gives a recognised reading a
**specimen** instead of a bare value: a radius token draws a tile carrying that
corner radius, a shadow token draws a card carrying that shadow, a spacing
token draws its own gap at scale — the name and the mono value ride along as
the caption underneath. Every value reaches the specimen through the same
shape gate the colour cards already used, widened rather than duplicated, so an
unrecognised reading still falls back to the plain name-and-value line instead
of guessing. v0.6.0 M3 gives the page **documentation anatomy**: one
`--measure` column the content is centred in, three heading tiers and no more,
a one-line `section__note` under every section heading describing what it
shows, and a spacing rhythm that separates sections more than it separates the
rows inside one — all drawn from the page's own tokens, not a new scale
invented for the occasion. v0.6.0 M4 adds the **on-page rail**: a sticky
`nav.rail-toc` outside the content column, rebuilt from the live section
headings on every render rather than a hard-coded list, each id slugged and
deduplicated, the active section tracked with an `IntersectionObserver` and
degrading to plain anchors with reduced motion or no script at all; it hides
below `75rem` and outside the Library view's token panel, where there is
nothing yet for it to list. v0.6.0 M5 closes the release: the docs sweep,
`llms.txt` and this file rewritten wherever they still described numbers as one
grouped list rather than first-class sections, and the 0.6.0 baseline
re-recorded. Twenty evals, every one at 1.000, no threshold lowered.

v0.7.0 M1 flips the dashboard to a **light-first surface**. The plain `:root`
variable set stops being a second reading of the dark palette and becomes the
one the design is drawn for: a neutral near-white canvas (`--bg`), white raised
panels held by a 1px `--line` hairline, near-black ink with a mid-grey
secondary, and a low diffuse `--shadow` that lifts rather than replaces the
edge — on a dark page a background shift alone said "this is a surface", on a
light one that shift is a couple of percent of luminance, so the hairline does
the work now. `--accent` moves one step darker, from `#2383e2` to `#1a6fd4`,
because the old value read 3.9:1 on white and the small-text floor is 4.5:1;
`--ink-hover` is new, so the primary button gets a hover reading without
inventing a second hue. The dark set stops being warm-toned too and becomes a
neutral charcoal, so both themes are drawn to the same temperament rather than
the light one alone. Every rendered artefact is re-verified against the light
surface rather than assumed: the near-white swatch-border rule and the dark-ink
label rule in `refs/gui/cards.md` are read against the new values, and every
specimen — radius tile, spacing gap, shadow card — and every typography
specimen stays legible on `--bg`.

v0.7.0 M2 gives the page one **container idiom** instead of air alone. Every
group of content — `.panel`, `.number-group`, `.container` — shares one rule:
a 1px `--line` edge, `--radius-md`, the `--layer` fill on the `--bg` canvas,
`--space-3` of padding, with `.panel` alone adding `--shadow` because it is the
surface sitting directly on the page. A container that only holds containers
takes `.panel--bare` — no edge, no fill, no lift — because a border drawn
around borders says nothing, and each Library section becomes its own
container inside the token panel rather than a heading followed by open air.
Beside it comes one **chip idiom**: a section's count, a token's slot, and the
`applied` badge all move onto `.chip` — `--type-01`, the `--layer-accent` fill,
the `--muted` ink, a `--line` edge, `--radius-sm` — a label and never a
control, so a chip never takes the ink of one. And one **button hierarchy**:
`.btn--primary` is the single solid action a container may hold, filled with
the page's own `--ink` and reading `--layer` as its text, with `--ink-hover` on
hover and no hue invented for it; `.btn--ghost` stays transparent until the
pointer is on it. The prompt box's submit button becomes the shell's first
`.btn--primary`, so the hierarchy has a precedent before the Backlog needs one
in M4.

v0.7.0 M3 recuts the **Backlog panel by component**. It used to be one flat
`<ul>` of every outstanding line; every line already names the component it is
about, in the last `(...)` group the line carries, so the panel now renders one
container per component instead. Three rules keep the parse honest rather than
clever: the **last** parenthetical group in the line names the component, since
an earlier one may be a quoted value carrying brackets of its own; the
**longest leading run** of whitespace-separated words inside that group that
exactly matches a recorded component name wins, tolerating scope words such as
`background` or `selected font-weight` sitting in the same group; and anything
the file does not record as a component is not one, however much it looks like
one, and collects in one trailing `other` container instead of inventing a
heading nobody wrote. Containers appear in the order their first line appears
in the Backlog, lines keep their own file order inside a container, and every
line renders verbatim — no prefix stripped, no punctuation reworded. The
panel's own header carries the **total** issue count as a chip, counting every
line in the Backlog regardless of container, and an empty Backlog still speaks:
one container, a neutral label, a `0` count and a `(none yet)` line, the same
answer Colours and Typography give to emptiness. The parse settings live in the
page's `BACKLOG` constant, inside the region marked `phyllum:backlog-contract`,
so `refs/gui/gui.md`'s table and the code that runs cannot drift apart quietly.

v0.7.0 M4 puts an **Assess button** in the Backlog header, right of the count
chip: a `.btn--primary` reading "Assess", `#backlog-assess`. A click posts the
literal prompt `assess` to `POST /prompt` — the same relay `#prompt-form`
already uses, the same payload shape (`{ text, view }`), the same endpoint — so
the terminal Claude Code session picks it up exactly as it would a typed
prompt. The button enqueues and nothing more: the page stays a viewer and a
prompt relay, never an executor, and the queued item renders in the Workbench's
own Queue panel through the existing `GET /state` poll rather than growing the
Backlog a second queue of its own. The button gives its own feedback rather
than a new idiom — it disables itself and reads "Queued…" for about a second,
then both revert, because a click leaves no input to clear the way the prompt
box's does. A failed request fails exactly the way the prompt box's does too:
neither button wraps its `fetch` in error-specific UI, so a request that never
reaches the server surfaces through the status line's existing "server gone"
message once the next `poll()` runs, and the button's label reverts on its own
timer regardless.

v0.7.0 M5 closes the release: the docs sweep, the 0.7.0 baseline, and a
coupled version bump. The sweep's job this time is the palette wording every
doc still carried — "warm near-white", "soft warm greys", "a hairline gives
way" — which stopped being true in M1 once the surface went neutral and the
hairline became the rule rather than the exception; `README.md` and
`refs/gui/gui.md` are rewritten to the light-first, bordered contract while the
historical M1 lines under v0.5.1 stay exactly as they were written, because
release history is a record and not a claim. `llms.txt` and `SKILL.md` gain the
container, chip, button and Backlog-by-component facts this release adds.
Twenty evals, every one at 1.000, no threshold lowered.

v0.7.1 phase 1 commits `lib/skill-drift.js` as it stands: 170 lines carried over
untracked from the skipped v0.5.2 plan, complete and correct, wired to nothing.
Its own module, pure and read-only, so the registry import graph — and the
assertion pinning it — is unaffected. Twelve assertions cover the three
findings (in step, differs, none), missing/changed/extra files individually and
combined, a file that turned into a directory read as changed rather than
thrown, the differing count, and sorted lists. Fixtures are seeded with
`installSkill`, `init`'s own copier, so the comparison starts from byte-for-byte
what a real `init` would write.

v0.7.1 phase 2 wires that detector into `phyllum version` as a third row,
always printed, reporting the skill copy in the directory you are standing in —
`in step with this install`, a neutral `N of 46 files differ from this
install`, or `none in this directory` when no copy exists. The row costs no
network: it is inspected before the registry is asked, and separately from it,
so it is fully answered under `--skip-registry`. Two rules settle the closing
line — an outdated CLI and a differing copy share one sentence naming `upgrade`
once, and a current CLI with only the copy differing names `upgrade` on its own
account. The three-verdict tests now run in a temp directory rather than
asserting on the absence of `phyllum upgrade` while reading whatever tree the
suite happens to sit in, since the row makes that tree ambient to every test in
the file; the tests' intent is unchanged.

v0.7.1 phase 3 gives `upgrade` the behaviour that lets a user act on what phase
2 reports: a prune, after the re-sync. `installSkill` copies every enumerated
file over the top and deletes nothing, so a ref file an older version shipped
and this one dropped survives forever, and Claude reads the orphan as current
guidance. The write funnel gains its first delete, `removeGuarded` — a
narrower door than any writer above it, reusing `isAllowedPath` rather than a
second permission model, bounded to inside the skill install, and refusing the
install root itself so pruning can never become uninstalling. The prune never
decides on its own: every extra file is named, one question is asked with the
whole list in view, and nothing is removed without a yes. `--yes` does not
answer it — the same rule `init`'s legacy-column removal keeps, that a gate
taking something away is answered by a person or it is answered no. Declining
is reported, changes nothing, and `upgrade` still exits 0. An emptied directory
is removed along with its last file.

v0.7.1 phase 4 closes the release: the docs sweep and a coupled version bump.
`refs/version/version.md` gains the skill-copy contract — the three findings,
the neutral-count wording, and the bytes-not-a-stamp decision carried over from
the skipped v0.5.2 plan unchanged. `refs/upgrade/upgrade.md` gains a Discovery
section pointing at `version` as where drift surfaces, and a Step 4 for the
prune. The permission table above gains the one line pruning adds: `upgrade`
may now remove files under `.claude/skills/phyllum/`, on confirmation, never
elsewhere. No eval is added or removed — the release is graded by the existing
assertion suite, not a new conversational question — so twenty evals carry
forward, every one at 1.000, no threshold lowered.

v0.2.0 M1 ships `version` and `update` (now `upgrade`), the self-maintenance pair. `version`
reads the installed version from the package itself and asks npm what the latest
published version is — the only network call in the product, made only when the
user asks for it, with no passive update hints anywhere else. `upgrade` detects
how Phyllum was installed (npm or pnpm, global or project dependency), runs that
manager's own update, and re-syncs the installed skill copy so the CLI and the
skill are never two versions; a one-off `npx` run, a source checkout or any other
package manager gets a graceful refusal naming the exact command to run instead.

v0.2.0 M2 reworks `tokenise` into a **prose-only** command: one sentence in, one
named token out. It no longer reads the codebase — scanning becomes `assess`'s
job — so `phyllum tokenise "our brand blue #2563EB"` is the whole input, and any
colour format is as good as hex: `phyllum tokenise "our overlay rgba(0, 0, 0,
0.5)"` walks the identical path, records the value exactly as pasted, and is
recognised as the same colour a `#2563EB`-style spelling of it would be. A name
in the sentence is used verbatim; without one, Phyllum suggests a name off the
scales in `refs/tokenise/naming.md` and confirms it. A sentence with no value ("add a
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
JSON, Go or Kotlin counts as much as a `.css` file does. "Every other text file"
is bounded, and the bounds are part of the contract: build output and dependency
directories are skipped, anything the project's own `.gitignore` matches is
skipped, a file past the size cap is skipped, and a file carrying NUL bytes is
not text and is skipped. The report states how many files were read, so the
reach is visible rather than assumed. **Component detection is
React only**, and on any other stack the report says the component pass did not
run rather than pretending it did. A value the design system already names is
reported as coverage, never proposed again, which is what makes a second `assess`
show only what has drifted. The scan itself writes nothing at all.

v0.2.0 M4 turns that inventory into a product: the **mapping table** and the two
**suggestion tracks**, both reading the scan result rather than rescanning. The
table is one frequency-ranked page over four buckets — already named, not named
yet, seen but not read, and repeated patterns — with each row carrying where the
value is used, what it looks like it means, and either the token that covers it or
the name Phyllum would propose. The table and those names are mechanical, so the
report is complete with no model attached. The tracks are the conversation: the
token track is `tokenise`'s review with codebase evidence behind each proposal,
and the component track hands a candidate to `create`'s pick mode, which seeds a
name and an archetype and never a value. The fourth bucket is where `assess`
refuses to guess — a value whose property it could not read is asked about, and an
unanswered question leaves the value unnamed. `refs/assess/map.md` is the contract.

v0.2.0 M5 wires `assess`'s **chained modes** — one scan, read four ways, with no
second implementation of the review behind any of them. `assess tokens` walks the
token review alone; `assess components` walks the component picks alone and
**loops** through the candidates one at a time, each with its own consent, ending
the moment you skip; bare `assess` still records one component per run, because an
assessment that turned into five queued `create` conversations would stop being an
assessment. `assess update` is the fast-forward, and it fast-forwards on one rule:
a question whose answer is already on the page is answered, and a question whose
answer is only in your head is skipped. So every proposed token graded `error` is
accepted under the name the map showed and written in one go, while a `warn`
finding — a value written once or twice, which is what a deliberate exception
looks like — is reported and never accepted for you, and a value whose role
Phyllum could not read and a component pick are both declined and reported as
declined.
Anything unrecognised is declined too, which is what stops a later flow being
auto-accepted into by accident. `assess update` writes `DESIGN-SYSTEM.md` and
nothing else; the codebase remains `apply`'s alone to write.

v0.2.0 M6 ships `apply` — the plan half of Phyllum's first write-to-code command,
and only the plan half. `phyllum apply` reads `DESIGN-SYSTEM.md` for what to apply
and the `assess` scan for where the raw literals are, then writes one file:
`.phyllum/PRD.md`. Not one byte of the user's codebase is touched, so the command
that will eventually rewrite source can ship and be reviewed on its own. Four
things make the plan a contract rather than a report. **Harness detection comes
first**, and harness files win: the project's own agent config (`CLAUDE.md`,
`AGENT.md`, `AGENTS.md` or another recognisable config) outranks a `.phyllum/`
preference, which outranks agent memory — and with none found, the PRD takes the
simple shape any harness or person can execute. **Every change gets its own
acceptance criterion**, naming the file, the literal, the token or component it
becomes, and how to check it; resolution is per literal rather than per cluster,
because a criterion naming a cluster's representative would name a value that is
not in the file. **One phase is one future commit** — colours, then numbers, then
typography, then one phase per component, each with a verification block demanding
its own criteria plus the host project's own test suite when one is detected.
**What is not being done is listed with a reason**: an unnamed literal, a length
named for a different role, a value whose role could not be read, a component
whose spec still says `TODO`. A TODO means *do not generate*, so a TODO component
appears as a reasoned exclusion, never as a silently missing change. Re-running
`apply` resumes — the inventory is regenerated, ticks, completed phases and the
`Notes` section are kept, and ticks are carried by what a criterion is about
rather than by its id, because ids renumber. `--fresh` discards all three, and
says so.

v0.2.0 M7 ships the other half: `phyllum apply run`, in `apply`'s v0.2.0 M7
milestone, is the one command that writes source files. It re-checks the harness
first — found, and it hands the plan over with precise instructions rather than
driving another vendor's harness itself; none, and Phyllum orchestrates the run
itself, a Fable orchestrator driving Opus 4.8 agents by default and whatever
`.phyllum/config.json` says instead. Work happens on a `phyllum/apply-<date>`
branch created from wherever the user was standing, one commit per phase, with a
status report every five minutes. Exact literals on the properties a criterion
names are replaced mechanically in Node; anything needing generation goes to an
agent, and the report says which criteria went which way. A phase commits only
when its own criteria verify by reading the file, its diff touches only the files
those criteria name, and the host project's own suite is green. A failing phase
stops the run and records why in the PRD; completed phases stay committed and
nothing is ever rolled back. `refs/apply/` is the contract for both halves.

v0.2.1 M1 teaches `assess` to **judge** rather than only inventory. Two changes,
both in `refs/assess/severity.md` as tables rather than as constants in the code. Every
finding now carries a **severity** decided by one number — how often the value is
written across the whole codebase: three times or more is systematic drift and is
proposed as a token; once or twice looks like a deliberate exception, so it is
reported and counted but never accepted on your behalf. The interactive review
still asks about both, because a rare value can genuinely deserve a token and
only you know that; `assess update` is the one caller that declines a warning,
and it says so. Severity is assigned at aggregation and nowhere upstream — a
scanner reports what it saw in one file, and how much that matters is a question
about the whole project. Every finding also carries the **rule family** it
belongs to (`raw-colour`, `raw-spacing`, `raw-radius`, `raw-border`,
`raw-shadow`, `raw-typography`), so a report can say which half of the drift got
fixed; `raw-radius` is the split that costs nothing and changes the reading, a
corner radius having always been read correctly and always called a number.

The same milestone adds the two value shapes the scalar passes could never read.
A shadow (`0 2px 8px rgba(0,0,0,0.1)`) and a border shorthand (`1px solid
#E5E7EB`) are **compounds** — the meaning is the whole list — so they get a pass
each, their own normalisation, and clustering that compares part for part by the
thresholds a length and a colour already use. Both write into the Numbers
section, because a shadow and a border width are lengths with a job. Three rules
keep it honest: a declaration read as a compound is not *also* read as a scalar
length, so one decision is never reported twice; a compound with no length and no
colour (`border: none`) records nothing; and a compound with a part Phyllum
cannot name — a `var(…)` inside a shadow — is not half-read, it goes back to the
seen-but-not-read bucket where a question gets asked instead.

v0.2.1 M2 adds the two checks that are about the **project** rather than about
any value in it. **Collisions**: detection has always looked for six frameworks
and three styling systems and returned one winner, so the report now shows the
evidence behind the winner too, and says when more than one UI framework, more
than one major of one framework, more than one styling system or more than one
theme file is live at once. A design system cannot have a single source of truth
while three files each declare values. **Unused**: the coverage split run
backwards — which tokens and registered components does the codebase never
mention? Both are always warnings, because neither has an answer Phyllum could
apply: two frameworks may be a migration halfway done, and an unused token may
be the one the next screen is built on. And "unused" states its own limits every
time it is printed — the scan is bounded and text-based, so *not seen* means
"not seen in what was read", never "provably dead". Nothing is ever pruned, in
any mode, including `assess update`.

v0.2.1 M3 adds the first check that reads two things **against each other**:
**similarity**. Three readings, each scored in [0, 1] from structure alone.
**Component clones** — two repeated markup signatures compared on their class
words and their tag, so `btn--primary` and `PrimaryBtn` are recognised as one
pattern spelled twice. **Style duplicates** — two named style blocks (a CSS
rule, a `styled.div` template, a style object) declaring materially the same
`property: value` set, which is how a `.card` and a `.panel` end up identical
without anyone noticing. **Utility overlaps** — one long class bundle repeated
across elements that no component was ever extracted from. Above 0.8 is a
**clone**, reported as an error with a merge suggestion naming the more-used
signature as the survivor; 0.5 to 0.8 is a **pattern similarity**, reported as a
warning with nothing suggested; below 0.5 nothing is reported, because two
things sharing one word are not evidence. The weights, the bands and the caps
are all rows in `refs/assess/similarity.md`. Two properties make the number worth printing:
it is **deterministic** — no model call, explicit sort order, the same codebase
scoring byte-identically on every run — and the comparison is **bounded**, so
the report states the caps it ran under rather than truncating in silence. A
merge is a suggestion and lands where every other suggestion lands: nothing here
renames a class or rewrites a component, because writing code is `apply`'s job.

v0.2.1 M4 asks the question underneath similarity: when two things are the same
thing, are they **called** the same thing and **used** the same way?
**Naming-convention drift** reads the names — class names, component tags, the
components `DESIGN-SYSTEM.md` registers — and reports the same word set spelled
two ways (`SmallButton` / `ButtonSmall`, `btn--primary` / `primary-btn`) plus the
names that stray from the convention this codebase mostly uses. The dominant
convention is **counted, never assumed**, and a codebase that has not chosen one
is told so rather than given a winner; the suggestion is always the predictable
`Base + Qualifier` form, spelled in that convention. Both naming families are
warnings, because a name in the wrong case still works. **Prop mismatches** read
the *attributes* — a regex attribute scan, not a JSX parser — and report one
component handed two names for one prop (`onClick` here, `onPress` there) or one
prop given two shapes (`size="lg"` beside `size={3}`) as **errors**, because a
component has one API and one of those call sites cannot be right; an inline
`style` on a component that already has variants is a **warning**, because that
is an escape from the system rather than a contradiction of it. Three honesty
rules bound it: `btn` and `Button` are two concepts, because resolving
abbreviations means guessing; a value the scan cannot read is counted and never
compared; and the prop pass is React-only, so on any other stack the answer is
that the question was not asked. Nothing is renamed — a rename is a suggestion
against the design system, and editing a call site is `apply`'s job.

v0.2.1 M5 is the product surface over all four of them, plus the pieces that
move the results around.

**One row shape, one number.** The report now ends by saying everything twice on
purpose: first every finding in one table — **severity · finding · evidence ·
suggested action**, grouped by family — because a reader triaging work needs
them side by side rather than spread across six sections; then one **drift
score** and one **verdict**. The score is a step on a seven-step Fibonacci scale
(1, 2, 3, 5, 8, 13, 21, lower better), built by weighting every finding by family
and severity into a *drift mass* and dropping the mass onto a step. Fibonacci
because drift does not grow evenly: the widening gaps say "about twice as bad"
honestly where a 0–100 score implies a precision no scan has. The verdict is
`fail` / `pass w/ warnings` / `pass`, derived from **severities and never from
the score**, because the two answer different questions — how bad, and how much.
A codebase can fail at 1 and pass-with-warnings at 8, and both are true things.
`clean` in the summary is exactly `verdict === 'pass'`. Every chained mode
inherits all of it: one scan, read four ways.

**Six smaller checks (§8).** Two colours nobody can tell apart (CIE76 ΔE, above
the clustering floor and below the distance row, so a pair is by construction
two values the code keeps apart and an eye cannot); a **dark-mode gap**, but only
in a codebase that demonstrably has a dark theme, and read per styling system —
by token name where colour is written by name, by property where it is written
by value, and the whole token half declines to run rather than call every token
a gap when no token is restated in a dark scope; two tokens holding one value
under different names; a spacing value that misses your own scale by a hair,
which is an `error` at any frequency because a near miss reads as a mistake
rather than an exception; an inventory of raw z-index literals once there are
enough to be a sprawl; and media-query widths no breakpoint token names. All six
are silent without the evidence for them, and the silence is the design: a check
that fires on a healthy project is one people learn to skip.

**Three utilities (§6.5).** `assess --json [path]` writes the whole assessment
object — the same one the report renders from — to `.phyllum/assess.json` or a
path you name, with a `schemaVersion` and no timestamp, so two runs over an
unchanged codebase are byte-identical and diff cleanly in CI. It never enters
the review loop, and `assess update --json` is refused with the reason stated,
because one accepts on your behalf and the other promises to touch nothing.
Every edit to `DESIGN-SYSTEM.md` now copies the file to
**`DESIGN-SYSTEM.md.bak`** first — always one undo ago, taken in the single
write path so no writer can forget it, and a **failed backup aborts the edit**
rather than proceeding without the safety it claims to provide; `init`
gitignores it alongside `.phyllum/`. And **`display`** is the primary read verb,
with **`system` kept permanently as its alias** — same renderer, same dispatch
branch, byte-for-byte identical output at every scope.

Commands that are not built yet are registered and documented, and say so when
invoked.
