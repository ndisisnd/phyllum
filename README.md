<div align="center"><pre>
   ___ _           _ _                 
  / _ \ |__  _   _| | |_   _ _ __ ___  
 / /_)/ '_ \| | | | | | | | | '_ ` _ \ 
/ ___/| | | | |_| | | | |_| | | | | | |
\/    |_| |_|\__, |_|_|\__,_|_| |_| |_|
             |___/                     
</pre></div>

<p align="center"><strong>A design system companion that turns prose, images, or the styles already in your codebase into named tokens and components, in one file.</strong></p>

<p align="center">
<a href="LICENSE.md"><img src="https://badgen.net/badge/license/Apache-2.0/blue" alt="License"></a>
<img src="https://badgen.net/badge/node/20+/green" alt="Node 20+">
<img src="https://badgen.net/badge/dependencies/0/green" alt="Zero dependencies">
<a href="https://github.com/ndisisnd/phyllum/commits"><img src="https://badgen.net/github/last-commit/ndisisnd/phyllum" alt="Last commit"></a>
</p>

<p align="center">
<a href="#what-it-is">What it is</a> ·
<a href="#install">Install</a> ·
<a href="#how-it-works">How it works</a> ·
<a href="#faq">FAQ</a> ·
<a href="llms.txt">llms.txt</a>
</p>

<p align="center"><sub>
<b>AI agents / LLMs:</b> read <a href="llms.txt"><code>llms.txt</code></a>.
</sub></p>

<!-- mkpub:release 0.12.0 -->
> [!NOTE]
> **🚀 New in 0.12.0 · Write down the rules your design system runs on**
>
> Governance states what correct use of a token or a component means, in one compliance
> protocol the other stages measure against. It also keeps an append-only record of every
> change in `DESIGN-SYSTEM-CHANGELOG.md`, writes a component's documentation from one
> fixed template, and installs the pre-commit hook or CI workflow that runs the check
> for you.
> Update with `phyllum upgrade` · [Release notes](RELEASES.md)
<!-- /mkpub:release -->

---

## What it is

Phyllum reads a codebase, or takes prose and images straight from you, and turns that
input into **tokens** and **components**. All of it lands in a single file:
`DESIGN-SYSTEM.md`. That file is human-readable Markdown with a fixed, machine-parseable
structure, and it is the only file in your codebase Phyllum ever writes.

Three ideas govern every command:

- **Rerunnable.** Running anything twice converges. Re-tokenising doesn't duplicate
  tokens; re-creating a component opens a revision of it.
- **Conversational, not form-driven.** When Phyllum is missing something, it asks a
  follow-up with a suggestion attached — never a blank required field.
- **One write target.** `DESIGN-SYSTEM.md` is the only file Phyllum touches, aside from
  the `DESIGN-SYSTEM.md.bak` it leaves one undo behind, its own gitignored `.phyllum/` —
  session state, settings, and `apply`'s plan — and, on `init`, the skill install. From
  0.12.0, `govern log` appends to `DESIGN-SYSTEM-CHANGELOG.md`, one entry at a time,
  oldest first — the file may only grow, and the one call that may shorten it needs a
  deletion grant minted from a reason you gave by name. Also from 0.12.0, and only when
  you ask for them by name, `govern init` writes `.git/hooks/pre-commit` and
  `.github/workflows/phyllum.yml` — those two filenames exactly, never a directory under
  either, never over a file Phyllum did not write, and neither one blocks a commit or
  fails a build. Two things are allowed past that
  line, and only when you ask for them by name: `assess --json <path>` writes the `.json`
  file you typed, and `apply run` edits source, from a plan you have read, on a branch of
  its own, one phase at a time. From 0.5.0 `phyllum apply` also writes one line back into
  `DESIGN-SYSTEM.md` — the `applied:` line of each component's spec block, and nothing
  else in the file — because that line is a reading of your codebase that only `apply` is
  in a position to take.

Two rules outrank being helpful. Phyllum never invents a value — a slot nobody filled is
a question or a `TODO`, never a plausible guess. And it never corrects a value — four
radii on one button or a 3px font gets recorded exactly as given. Phyllum governs *which*
slots must be filled, never *what* goes in them.

The commands:

| Command | What it does |
|---------|--------------|
| `create` | Craft a component from prose, an image you point at, or a pick from what your code repeats; `create primitives` lays down primitive colour ramps instead — wholly mechanical |
| `assess` | Read the codebase, map the raw styling already in it, and suggest tokens and components |
| `apply` | Plan applying the design system to the codebase; `apply run` executes the plan |
| `update` | Change what the design system already records — `update token` walks type → list → pick → a sentence, `update component` revises a recorded component |
| `delete` | Remove one recorded component — a breaking-change warning, a refusal while the codebase is still using it, and the component's name typed back on top of the acceptance gate before anything is written |
| `tokenise` | Name the values in a sentence, e.g. "our brand blue #2563EB", "our overlay rgba(0, 0, 0, 0.5)" or "hero backdrop linear-gradient(135deg, #2563EB, #10B981)" — several values are queued and asked about one at a time; with nothing at all it asks what kind of token you are recording |
| `display` | Print the design system to the terminal (`system` is the same command, kept as an alias) |
| `gui` | Start the local server and open the dashboard for browsing tokens and components |
| `kill` | Stop the dashboard server `gui` started |
| `init` | Guided setup — scaffold the file, install the skill |
| `version` | Print the installed version and check npm for a newer one |
| `upgrade` | Upgrade this install to the latest published version |
| `pipeline` | Print the four stages, the commands under each, and where this project currently sits — read-only, derived from the files on disk |
| `menu` / `help` | List the commands, or explain one in depth |

Every command belongs to a stage of one pipeline — Assess, Governance, Build, Refine —
and `phyllum pipeline` prints that model along with where your project currently sits.
**Build** is the stage where something actually gets made, and from 0.10.0 it formally
homes `create` (alias `build`), `tokenise` and `apply`, alongside `update` and `delete`,
which were already there. The rest of 0.10.0 gives that stage a defined input — the
recommendations of your latest drift report, unless you say something else in prose —
and a defined output: a numbered build report under `.phyllum/` that you read and
approve before anything is built.

## Install

Phyllum needs **Node 20 or newer** and has no dependencies to install.

Some commands are wholly mechanical and work on their own: `menu`, `help`, `display`,
`gui`, `kill`, `version`, `upgrade`, `create primitives` — shipped constants and
arithmetic, no model in the path — and `apply`, which only ever writes a plan.

Some want [Claude Code](https://www.claude.com/product/claude-code), and run natively
inside a Claude Code session or shell out to the `claude` CLI from a plain terminal.
`create` and `tokenise` need it for the whole of what they do. Three commands are split:
`assess` scans, maps and proposes names mechanically but needs it to review the
suggestions with you; `init` needs it to read your project and seed the file; and
`apply run` needs it for the criteria a substitution cannot settle. Every one of them
**degrades rather than failing** — it tells you what it could not do and stops, and
`apply run` still completes the criteria Node can do by itself.

The `gui` dashboard uses your system `python3`.

Install it globally:

```bash
npm install -g phyllum
```

Then, from inside the project you want a design system for, run the guided setup:

```bash
phyllum init
```

To check it's wired up, `phyllum menu` lists every command, and `phyllum help` prints an
overview. `init` scaffolds `DESIGN-SYSTEM.md` and installs the skill into
`.claude/skills/phyllum/` so it's available inside Claude Code too.

## How it works

Everything Phyllum learns — from prose, from an image, or from the code — flows through
three commands into one file. Which command reads what is the whole division of labour:
`assess` reads your codebase, `tokenise` reads the sentence you typed, `create` reads
your intent.

```mermaid
flowchart TD
  prose["Prose you type"] --> create
  image["An image you point at"] --> create
  sentence["A sentence about one or more values"] --> tokenise
  code["Styles already in the codebase"] --> assess
  create["<b>create</b><br/>craft a component"] --> file
  tokenise["<b>tokenise</b><br/>name the values you describe"] --> file
  assess["<b>assess</b><br/>inventory the raw styling"] --> file
  file["<b>DESIGN-SYSTEM.md</b><br/>the one file Phyllum writes"]
```

`create` runs in three modes. **Prose**: you describe a component and Phyllum drafts a
spec, lists the gaps the archetype contract still needs, and fills them through follow-up
questions. **Image**: you point at an image file; Phyllum traces it, turning confident
measurements into values and everything else into questions, and refuses to claim things a
still image can't show. **Pick**: bare `create` offers the archetypes plus the components
your codebase keeps repeating, and a pick seeds a name and an archetype — never values.

Fifteen archetypes ship with contracts — Button, Input, Card, Badge, Modal, Toggle,
Checkbox, Radio, Select, Tooltip, Toast, Tabs, Link, Avatar, Progress — and the picker's
last row is **custom**: a component that follows no contract at all. A custom has no
mandatory slots and no gap list; it records exactly what you describe, and it says so on
the page, so nothing downstream grades it against rules it never claimed.

`create primitives` is the odd one out: it writes no component at all. It lays down the
**primitive colour ramps** your semantic tokens sit on — nine steps, `100` (lightest) to
`900` (darkest), written under a `Primitives` heading inside the Colours table. With no
colour tokens recorded, you get the neutral grey ramp, which is nine constants Phyllum
ships and every install shares. With colour tokens recorded, you are asked about each one
in turn, and a yes derives that token's own ramp: its hue and saturation held, lightness
placed on a fixed scale, and **the value you recorded slotted in unchanged** at whichever
step it is nearest. Nothing is derived for a token you said no to, all nine values are
shown before you accept, and the same input gives the same ramp on every run and every
machine — there is no model anywhere in that path, which is why it works in a plain
terminal.

Names are the other half of that. Phyllum ships a **standard naming vocabulary** —
families like `neutral`, `interaction`, `success` and `danger`, ranks (`primary`,
`secondary`, `tertiary`), exception words like `subtle` and `inverse`, and state words
like `hover` and `pressed` — spelled in a fixed slot order, so `interaction-primary-hover`
is a name and `hover-interaction` is not. When your sentence says what a colour is *for*,
the suggestion comes from that vocabulary; when it doesn't, the older lightness-and-
saturation scales still answer. Either way it is only ever a suggestion, and **nothing you
already have is ever renamed**.

`assess` reads your codebase and tells you how much raw, un-systematised styling is in
there. Colours, lengths and typography are read out of text files in *any* language — a
theme file in JSON or Go counts as much as a `.css` file does — while component detection
reads React markup. The sweep is bounded on purpose: build output and dependency
directories, anything your `.gitignore` matches, files past a size cap, and files that
are not really text are skipped, and the report says how many files it read. Near-identical values (`#2563EB` and `#2564EC`,
`11px` and `12px`) cluster into one decision rather than two, usage is counted, and the
result is ranked by how hard your code leans on each value. The scan is strictly
read-only: nothing in your codebase is written, renamed or created. Run it again later
and anything your design system already names is reported as covered rather than
proposed again, so a rerun shows only what has drifted.

Five chained modes narrow the same scan. `assess tokens` walks the token suggestions
only; `assess components` walks the component suggestions only, one candidate at a time
with its own yes-or-no each; `assess update` skips the per-item review altogether and
accepts the proposed tokens the assessment graded as errors, under the names it showed
you. `assess update` still refuses to guess: a warning is reported and never accepted on
your behalf, a value it could see but not read stays unnamed, a component is never
recorded without its questions answered, and the only file of yours it writes is
`DESIGN-SYSTEM.md`. The last two narrow it further still: `assess score` returns the
health score and the verdict alone, and `assess drift` returns the comparison against
`DESIGN-SYSTEM.md` alone. Neither writes anything and neither asks anything.

A full run leaves the stage's output behind: **`.phyllum/assess-[n].md`**, a numbered,
dated report carrying the summary, the drift by family, the health score and a
machine-readable recommendations block. Numbering is one past the highest report already
there rather than one past the count, so a number is never reused and a deleted report
never causes a renumber — a number names a scan you may have quoted. The date is carried
by the report itself. `assess score`, `assess drift` and `assess --json` leave no
numbered report.

The report ends in one number and one word: a **drift score** on a seven-step
Fibonacci scale (1, 2, 3, 5, 8, 13, 21 — lower is better) for how much
un-systematised styling is in there, and a **verdict** of `pass`,
`pass w/ warnings` or `fail` derived from the findings' severities. Both are
deterministic, so a rerun after a cleanup shows the number moving down the scale.
Add `--json` and the whole assessment — every finding, the similarity groups, the
score — is written to `.phyllum/assess.json` (or a path you name) instead of the
interactive report: same object, byte-stable between runs, easy to diff in CI.

And every command that edits `DESIGN-SYSTEM.md` copies it to
`DESIGN-SYSTEM.md.bak` first, so the state before the last edit is always on
disk. A backup that cannot be written stops the edit rather than proceeding
without it.

`tokenise` names the values in a sentence: `phyllum tokenise "our brand blue #2563EB"`.
Any colour format works — `phyllum tokenise "our overlay rgba(0, 0, 0, 0.5)"`, `hsl()`,
`#rrggbbaa` — and the value is recorded exactly as you typed it, while **one colour
written two ways is one colour**: `rgba(37, 99, 235)` and `#2563EB` are compared by their
channels, so the same blue can never be named twice. Alpha is part of the fact, so
`rgba(0,0,0,0.5)` and `rgba(0,0,0,0.9)` stay two different colours.
A sentence carrying several — `phyllum tokenise "#2563EB #10B981 #F59E0B"` — becomes a
queue, walked one question at a time in the order you said them, and a value you skip
costs only itself. If the sentence names a token, that name is used; if not, Phyllum
suggests one — from the nomenclature vocabulary when your words say what a colour is for,
from the naming scales otherwise — and confirms it with you. It does not read your code —
that's `assess`.

**Gradients are colours too.** `phyllum tokenise "hero backdrop linear-gradient(135deg,
#2563EB, #10B981)"` names it, and so do `radial-gradient()`, `conic-gradient()` and their
`repeating-` forms. The whole function is the value — stops, angle and percentages exactly
as typed, never reordered — and it lands in the Colours table as an ordinary
`token | value` row. Every name Phyllum proposes for one carries the word `gradient`, so a
reader tells a gradient token from a solid one by name alone; with nothing else to go on
the fallback is `gradient-1`, `gradient-2`, and so on.

**`phyllum tokenise` with nothing to read is a guided start.** After the offer to resume an
unfinished queue, it asks what kind of token you are recording — a colour, typography, a
border radius, spacing, or something else — and then asks the one follow-up that kind
needs. Picking *a colour* asks one more: a solid colour, or a gradient? Each pick
pre-answers a question the parser would have asked, so `8px` under *a border radius* is
never asked what it applies to. Free text works at every step: type the whole sentence at
any question and it is read exactly as if it had been the argument, and a skip anywhere
writes nothing and ends the run. Every question that asks for a value **shows the shape its
answer takes** — `Write your colour as [HEX code / rgba value] [name]` — the same one line
across the picker, the missing-value question and `update`'s prose asks.

`apply` is the other direction: it takes the design system you have built and plans how to
get it into your code. Raw values become the tokens that already name them; ad-hoc patterns
become the components you recorded. **It plans it, and runs none of it.** `phyllum apply`
writes one file — `.phyllum/PRD.md` — where every single change has its own acceptance
criterion naming the file, the literal, what it becomes, and how to check it. Changes are
grouped into phases, and one phase is one future commit with its own verification: its
criteria, plus your project's own test suite when Phyllum can detect one. If your project
has an agent harness — a `CLAUDE.md`, an `AGENTS.md`, a Cursor or Windsurf config — the plan
is shaped so that harness can execute it natively; with none found, it is a plain plan
anybody can read. Everything Phyllum won't touch is listed with a reason: a literal no token
names, a length named for a different role, a component whose spec still says `TODO`. Re-run
`apply` any time and it resumes — your ticks, your completed phases and your notes survive,
while the change list is re-derived from scratch.

`apply` writes one other thing, and it is a line rather than a file. Since 0.5.0 every
recorded component's spec block carries **`applied: true`** or **`applied: false`**: is
this component adopted in your codebase right now? It is *derived, never declared* —
nothing lets you set it, and a hand-edit of it is overwritten the next time `apply` looks,
because the line is a reading of your code rather than an opinion about it. The evidence
is the one `apply` was already collecting: a place in your markup that already *is* the
component. **No `applied:` line at all means `apply` has never run**, which is not the
same as `false`, and a design system written before 0.5.0 reads exactly as it did. The
write touches that one line per component and nothing else in the file, `.bak` first, and
a run that changes no line writes nothing at all.

`phyllum apply run` executes that plan — the one command that writes to your source files.
It re-checks the harness first: if your project has one, Phyllum hands the plan over with
precise instructions rather than driving somebody else's agent harness itself. With none
found, Phyllum orchestrates the run — a Fable orchestrator driving Opus 4.8 agents by
default, and whatever `.phyllum/config.json` says instead. Either way the same guarantees
hold. Work happens on a `phyllum/apply-<date>` branch created from wherever you were
standing, so **the branch you are on is never written to**. Each phase lands as its own
commit containing only the files that phase's criteria name. Exact literals on the
properties a criterion names are replaced mechanically in Node, and the report says which
criteria went that way and which went to an agent — with no model reachable, mechanical
phases still land and the rest stop and say which model they needed. A phase commits only
when its criteria verify by reading the file, its diff stays inside those files, and your
own test suite is green. A failing phase stops the run, keeps the completed commits, and
records where it stopped in the plan; the next `apply run` resumes from there. Nothing is
ever rolled back. You get a status report every five minutes while it works.

`gui` opens a local dashboard onto the same file, and it **shows the values rather than
printing them**. Colour tokens are **cards in a responsive grid**: a large rounded swatch
on top, the token name beneath it, and the value on its own line under that — a border on
the swatch where a near-white would otherwise vanish against the page, and a gradient
painted as the swatch fill. A primitives ramp keeps its nine-step strip, because a ramp
reads as one thing rather than as nine cards; typography tokens render as live specimens in
their own size, weight and line-height; and number tokens no longer share one heading —
each distinct thing they apply to, in the file's own words, is its own section, and a
reading the page recognises draws as a **specimen** — a radius token as a rounded tile, a
spacing token as its own gap at scale, a shadow token as a card carrying that shadow — name
and value still underneath as the caption, an unrecognised reading falling back to the
plain line. Only a value
the page recognises as a colour or a gradient is ever painted — anything else is shown as
text on an unfilled swatch, so a hand-edited file can never write CSS into the page.

Clicking a component in the Library view **draws the component**, above the spec and code
the panel already showed. The drawing is a projection of the recorded spec — never the
stored React code run in the page — so what you see is what the file says: one element per
archetype, its inline styles built slot by slot, token names resolved against your own
token tables. A slot recorded as `TODO`, a token name nothing holds, or a value the page
cannot classify contributes nothing and is listed underneath as an **unrendered slot**,
because a preview that invented a background would break the no-invented-values rule in
the one place you would believe it. Components sharing a base name — `Button/Primary`,
`Button/Ghost` — get a **variant toggle**, and a spec recording states gets a second
toggle for `hover`, `disabled` and the rest; a state's slots overlay the base rather than
replacing it. A component with no variant siblings shows no toggle. A third row appears
where the spec records an icon slot — a **leading-icon** or **trailing-icon** control that
flips the slot in the drawing, with the placeholder drawn as a filled dot in the muted ink
because Phyllum records that an icon slot exists, not which icon fills it. The controls
are derived from the file: a slot the spec does not record gets no control, a `TODO` slot
stays in the unrendered list, and flipping one changes the projection only — never the
spec, never the served payload.

The page is drawn light-first, Notion-shaped: rounded corners throughout on one
two-step radius scale, 1px hairlines and low diffuse shadows on every raised
surface, a neutral near-white canvas over white panels in the light theme and a
neutral charcoal in the dark one, one calm surface with no dark product header.
You pick the theme yourself — **light, dark or system** — from a control in the
shell; `system` is the default and follows your OS, and your choice is
remembered in the browser and applied before the first paint, so the page
never flashes the wrong theme. It takes no dependency on Notion or anything else: the
stylesheet is hand-written in the one file, the type stack asks for Geist and falls back
to the system faces without fetching a webfont, and the page fetches nothing from the
network. It stays read-only, on localhost only. Writing is the CLI's job.

`delete` is the one destructive verb, and it is built as the inverse of `create`'s ease.
Deleting a component can break things — code generated from it stays in your codebase and
stops matching anything your design system records — so every step slows down. `phyllum
delete` lists what you have recorded, with each component's archetype and whether it is
applied, and takes a pick; `phyllum delete Button/Primary` pre-answers that, and a name
nothing matches lists and asks rather than failing. Then the **breaking-change warning**,
always, before any question about proceeding. Then the **in-use check**: if the component
is adopted in your code, `delete` refuses, names the evidence it saw, and tells you the
way out — remove the usage, re-run `phyllum apply` so the reading catches up, then delete.
There is no flag, option or `--force` past that refusal. Only then the proposal, showing
exactly what goes — the entry and the backlog lines naming it, and nothing else — your
acceptance, and then **one more question: type the component's name back**. A `y` proves
agreement; a typed name proves you are looking at the right target, which is why `--yes`
and a non-interactive run can never satisfy it. The write is one save with the `.bak`
taken first, and the report names that `.bak` as your undo. `delete token` is reserved and
refused with its reason: removing a token ripples through every component slot and backlog
line naming it, which is a different risk and its own release.

Writes are atomic — Phyllum writes a temp file and renames it, so a crashed run can't
corrupt `DESIGN-SYSTEM.md`.

## How to update

Five different things, and each has its own word:

- **Update Phyllum itself — `phyllum upgrade`** — `phyllum version` tells you whether you
  are current, showing both your version and the latest published one. `phyllum upgrade`
  then does the work: it detects how you installed Phyllum (npm or pnpm, globally or as a
  project dependency), runs the right command, and re-syncs the skill under
  `.claude/skills/phyllum/` so the CLI and the skill are never two versions. If it can't
  act safely — a one-off `npx` run has nothing to update, a source checkout belongs to git
  — it says so and prints the exact command to run instead. `version` is the only command
  that ever touches the network, and only when you ask: nothing checks for updates in the
  background. Up to 0.2.3 this command was called `phyllum update`; only the word changed.
- **Update what Phyllum produced** — re-run `assess`, `tokenise` or `create` any time. Because every
  command converges, a rerun refreshes `DESIGN-SYSTEM.md` without duplicating what's
  already there; `init` on an existing file adds back only missing sections and never drops
  your content.
- **Update your codebase from the design system — `phyllum apply`** — it writes the plan to
  `.phyllum/PRD.md` and runs nothing; `apply run` executes it. In 0.3.0 only, `phyllum update`
  was a second name for this; from 0.4.0 `apply` stands alone under its own name.
- **Change what the design system records — `phyllum update`** — the editing verb from 0.4.0,
  and the first sanctioned way to change a recorded thing without hand-editing the file.
  `phyllum update` opens a menu; `update token` walks type → the full list of that section →
  pick one → a sentence describing the change; `update component` lists the recorded
  components with their archetypes and lands your change as a **revision**, so what the
  sentence names changes and every slot it does not name stays exactly as recorded. Prose
  straight in — `phyllum update "make color-primary #1D4ED8"` — reads its target from the
  sentence, and asks rather than guessing when the sentence could mean two things. A rename
  rewrites every spec slot and every Backlog line naming the old token in the same write,
  and says so first; a new value is re-checked against every colour you already name, so an
  edit can never put two names on one value. Nothing is written until you accept, and the
  `.bak` is taken before the write, exactly as everywhere else.
- **Remove what the design system records — `phyllum delete`** — the removal verb from
  0.5.0, and the counterpart to the line above: `update` changes a recorded thing and
  reaches no deletion at all, `delete` removes one and reaches no edit. One component per
  run, behind a breaking-change warning, an in-use refusal and two confirmations. Removing
  a token is deliberately not offered.

## FAQ

**Does Phyllum write component code into my project?**
No. It writes the generated code into `DESIGN-SYSTEM.md` alongside the spec, and nowhere
else. It won't drop files into your source tree, rewrite existing styles to use tokens, or
touch config. If a task seems to need a write outside that one file, Phyllum stops and
tells you instead.

**What if I already have a `DESIGN-SYSTEM.md`?**
`init` won't overwrite it. It validates the section structure against the template and
offers to repair anything missing, adding headings back in their canonical position.
Nothing you wrote is dropped.

**Do I have to use Claude Code?**
For `create` and `tokenise`, yes — that's where the measuring and naming happen. If
`claude` isn't installed and you're not in a Claude Code session, those commands fail with
a message naming your two options. The mechanical commands keep working regardless, and
that includes `assess`: reading your codebase and aggregating what it finds is arithmetic,
so the scan runs in a plain terminal with nothing else installed.

**Does `assess` change my code?**
No. It reads. The modules that do the scanning contain no write call at all, and the test
suite diffs the entire directory around every scan and fails if one byte moved.

**Does `apply` change my code?**
`phyllum apply` does not. It writes a plan to `.phyllum/PRD.md`, plus the one derived
`applied:` line in each component's spec block, and nothing else — the test suite diffs
the whole project directory around every run and fails on a single other file, and diffs
`DESIGN-SYSTEM.md` line by line to prove no other line of it moved.
`phyllum apply run` is the one command allowed to write source, and only from that plan:
only on a `phyllum/apply-<date>` branch of its own, only the files the running phase's
criteria name, one commit per phase, stopping and reporting rather than pressing on when a
phase fails. Nothing it does is ever rolled back automatically — a stopped run keeps its
branch and its commits, and tells you where it stopped.

**What stops `apply run` from editing a file it was not asked to?**
The permission model, not good intentions. A phase opens a *grant* naming its branch and its
own file list, and every write re-checks both — the wrong branch, a file outside the phase,
or a closed grant is refused, and nothing else in Phyllum can open a grant at all. The
assertion suite asserts each of those refusals, and an edit that lands outside the phase's
criteria stops the phase instead of being committed.

**Why is there a Python server for the GUI?**
`gui` serves a local dashboard over `python3` bound to localhost only, with a
PID-and-port lifecycle you stop with `phyllum kill`. It's not reachable from other
machines.

## License

[Apache-2.0](LICENSE.md)

## Acknowledgments

This README was generated with [mkpub](https://github.com/ndisisnd/mkpub).
