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
| `DESIGN-SYSTEM.md.bak` | the same write, one step earlier — the pre-edit copy the funnel always takes (v0.2.1 §6.5.2) |
| `.phyllum/**` | session state, `apply`'s plan at `.phyllum/PRD.md`, and `assess --json`'s default output; gitignored |
| `.claude/skills/phyllum/**` | `init` — the skill install; and `update`, which re-syncs that same copy |
| Phyllum's two `.gitignore` lines | `init` only, with the user's confirmation |
| a JSON path you name | `assess --json <path>` only, and only a `.json` file inside the project |

Nothing else, ever. Do not write generated component code into the codebase,
do not rewrite existing styles to use tokens, do not touch config files. If a
task seems to need a write outside this list, stop and tell the user instead.

Exactly one command is allowed past that line, and only through a gate:
`apply run` (v0.2.0 M7) rewrites source styling to use tokens — but only from a
plan the user has read at `.phyllum/PRD.md`, only on a `phyllum/apply-<date>`
branch, only the files the running phase's criteria name, and only one phase per
commit. `phyllum apply` writes that plan and changes nothing else, so the rule
above holds unchanged for every other command.

## Commands

| Command | Alias | What it does |
|---------|-------|--------------|
| `phyllum` | — | Interactive session; a menu of the commands below |
| `menu` | — | List every subskill, one line per command |
| `help` | — | Explain Phyllum; `help [command]` explains one command in depth |
| `create` | `build` | Craft a new component from prose, an image, or a pick; `create primitives` lays down primitive colour ramps instead — wholly mechanical |
| `assess` | — | Read the codebase and inventory the raw styling in it; `--json [path]` writes the assessment to a file |
| `apply` | — | Plan applying the design system to the codebase; `apply run` executes the plan |
| `tokenise` | `tokenize` | Name the values in a sentence, e.g. "our brand blue #2563EB" — several values become a queue, asked one at a time |
| `gui` | `dashboard` | Local server plus HTML dashboard |
| `kill` | — | Stop the running GUI server |
| `display` | `system` | Print the design system to the terminal |
| `version` | — | Print the installed version and check npm for a newer one |
| `update` | — | Update this install to the latest published version |
| `init` | — | Guided setup: scaffold the file, install this skill |

Aliases are exact equivalents — same subskill, same behaviour.

`help` is a reserved word in argument position: `create help` is help *about*
create, never a component named "help". A quoted `"help"` means the word.

Scope words (`tokens` / `components` / `all`) are only meaningful on `display`
(and its alias `system`) and `gui`, and default to `all`. `assess` reserves its own three words in
argument position — `tokens` / `components` / `update` — for its chained modes,
`create` reserves one, `primitives`, and `apply` reserves one: `run`.

Which command reads what is the whole division of labour, and it is worth stating
plainly: `assess` reads your codebase, `tokenise` reads the sentence you typed,
`create` reads your intent. All three write only `DESIGN-SYSTEM.md`. `apply`
reads the design system *and* the codebase, and writes only its own plan.

## Reference files — load only what the current command needs

| Command | Reference |
|---------|-----------|
| `create` | `refs/create.md` — modes A/B/C, prose parsing rules, the fifteen archetype contracts, custom mode (no contract, and the marker that says so), follow-up loop, acceptance and the write step, plus `create primitives`: the two ramp behaviours, the derivation, naming and the `Primitives` subsection |
| `assess` | `refs/assess.md` — the pipeline, what is scanned, the language-agnostic sweep, React-only component detection, clustering, the mapping table, the token and component suggestion tracks |
| `apply` | `refs/apply.md` — harness detection and its precedence, how changes are derived per literal, phase grouping, the PRD's exact section and marker contract, resume vs `--fresh`, and what `apply run` will do |
| `tokenise` | `refs/tokenise.md` — how a sentence is read, the batch queue and its splitting grammar, the three passes, the naming sources (the nomenclature library first, the scales as fallback), the follow-up loop when a value or a name is missing, acceptance |
| `gui` | `refs/gui.md` — server contract, view specs |
| `display` | `refs/system.md` — listing format; `system` is the same command under its older name |
| `version` | `refs/version.md` — what is reported, the on-demand registry rule, offline behaviour |
| `update` | `refs/update.md` — install detection, the four supported cases, graceful refusals, skill re-sync |
| `init` | `refs/init.md` — the walkthrough, step by step |

One reference file belongs to no command: `refs/nomenclature.md` is a shared
library — the standard token-naming vocabulary (slots, strict word lists, slot
order) and the shipped primitive grey ramp with its derivation scale. Load it
only when a naming or ramp question comes up; nothing in it runs on its own.

## The file format

`DESIGN-SYSTEM.md` is human-readable Markdown with machine-parseable structure.
Its skeleton is fixed and every section is always present, even when empty:

1. **Header block** — project name, Phyllum version, created date, and a one-line
   warning that Phyllum manages the file.
2. **Tokens** — three fixed subsections: Colours (`token | value`), Numbers
   (`token | value | applies to`), Typography (`token | size | weight |
   line-height`). Empty tables still ship their header rows. Colours may hold one
   nested `#### Primitives` subsection, in the same columns, for the ramps
   `create primitives` writes; it appears only when there are ramps.
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

- **Mechanics** (`menu`, `help`, `display`, `gui`, `kill`, `version`, `update`,
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

v0.3.0 M4 widens `create`'s vocabulary and gives it a way out of it. The
archetype table grows from five contracts to **fifteen** — Toggle, Checkbox,
Radio, Select, Tooltip, Toast, Tabs, Link, Avatar and Progress join, each with
its own mandatory slots, states, labelled defaults and candidate signals, all in
`refs/create.md` as rows rather than code. And the picker gains a last row:
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
unanswered question leaves the value unnamed. `refs/assess.md` is the contract.

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
nothing is ever rolled back. `refs/apply.md` is the contract for both halves.

v0.2.1 M1 teaches `assess` to **judge** rather than only inventory. Two changes,
both in `refs/assess.md` as tables rather than as constants in the code. Every
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
are all rows in `refs/assess.md`. Two properties make the number worth printing:
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
