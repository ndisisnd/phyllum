# `build` — the Build stage, and what it is for

Build is stage three of the pipeline, and it answers the shortest question of
the four: **make the thing real.** Assess reads a codebase and reports on it.
Governance says what the rules are. Refine asks whether the result is ready.
Build is the stage where something is actually written down — a token gets a
name, a component gets a spec, the design system gets applied outward.

This file is the stage's frame, in the sense `refs/create/create.md` and
`refs/tokenise/tokenise.md` are their commands' frames: what the stage is, what
it homes, what goes in, what comes out. It is deliberately not a second
rulebook. Every command under Build already carries its own reference folder,
and where this file and one of those folders disagree, the command's folder
wins and this one is wrong.

| Property | Value |
|----------|-------|
| stage | 3 — Build |
| question | Make the thing real. |
| commands | `create` (alias `build`), `tokenise`, `apply`, `update`, `delete` |
| input | the latest drift report's recommendations, unless explicit prose overrides them |
| output | a numbered build report under `.phyllum/`, read and approved before anything is written outward |
| character | constructive — it proposes, and only builds what a person has said yes to |

---

## 1. What Build homes

Five commands sit in this stage, and they have sat here since v0.8.0 named the
pipeline: every command that changes what `DESIGN-SYSTEM.md` records is Build,
because all of it is making the thing real.

| Command | Reference | What it makes real |
|---------|-----------|--------------------|
| `create` (alias `build`) | `refs/create/create.md` | a component, from prose, an image, or a pick; `create primitives` lays down colour ramps |
| `tokenise` | `refs/tokenise/tokenise.md` | a name for a value you described in a sentence |
| `apply` | `refs/apply/apply.md` | the design system applied outward, as a plan; `apply run` executes it |
| `update` | `refs/update/update.md` | a change to a token or a component already recorded |
| `delete` | `refs/delete/delete.md` | the removal of one recorded component, behind a double confirmation |

v0.10.0 formally re-homes the first three. `update` and `delete` were already
here and are not moved by this release; they are listed because a stage that
named three of its five commands would be a stage nobody could reason about.

**The re-home is a statement about the model, not a rewrite of the commands.**
Every one of them keeps its own name, its own arguments, its own reference
folder and its own behaviour. What changes is that the stage above them now has
a defined input and a defined output, which it did not have while it was a flat
menu of five verbs.

The `stage` field each command carries in `lib/registry.js` has read `build`
since v0.8.0, so the CLI, `phyllum pipeline`, `SKILL.md` and this file have
never disagreed about which commands these are. The grouping was mechanical
first and formal second, which is the order that leaves no drift behind.

---

## 2. The stage's input

Build's default input is **the recommendations of the latest drift report** —
the `phyllum-recommendations` block at the end of `.phyllum/assess-[n].md`,
written by Assess and specified in `refs/assess/protocol-assess.md` §5.

That is the whole point of two stages in a row. Assess ends by saying what
should be built; Build begins by reading it. A user who has just run `phyllum
assess` should not have to restate any of its findings in prose, and a Build
run that ignored a report sitting two files away would make the pipeline a
diagram rather than a mechanism.

Two rules bound the default:

- **Explicit prose wins.** `phyllum create "button primary with 12px
  padding-top"` and `phyllum tokenise "our brand blue #2563EB"` mean exactly
  what they say. A sentence the user typed is a decision, and a decision is
  never overridden by a file. The drift report is the input when there is no
  other input, not a filter applied on top of one.
- **Prose and images stay entry points into the stage.** Every mode `create`
  has ever had — prose, image, pick, custom, primitives — is still a way in.
  Reading the drift report is a *default*, added beside those doors; it does
  not become a door they have to pass through.

---

## 3. The stage's output

Build's output is a **numbered build report** under `.phyllum/`, named
`build-report-[n].md`, numbered the way Assess's reports are numbered:
numerically, one past the highest that exists, so a number is never reused and
a deleted report never renumbers its neighbours (`lib/assess-reports.js`
carries that reasoning in full).

Each report is **mapped back to what it answers**: the drift report whose
recommendations it was built from, or the prose input it was built from when
there was no report. Numbered reports are how this product records what
happened on a day, and a report that could not say what it was answering would
break the chain the numbering exists to keep.

**The gate is the point.** Building never changes the codebase in the same
breath as deciding what to change. The user reads the report first and approves
it, and only then does anything happen — the same posture `apply` has held
since v0.2.0, where `.phyllum/PRD.md` is written and `apply run` is a separate
word the user has to type.

When the drift a report answers is large, the report **splits into phases**, so
replacements land one careful phase at a time rather than in one sweep. A phase
is a unit a person can read, approve and verify; a hundred replacements in one
block is a unit nobody reads.

---

## 4. What exists today

This section is about honesty, and it is written the way the `built:` flag in
`lib/registry.js` is used: a claim that something works is made only when it
works. v0.10.0 ships in phases, and this file lands in the first of them.

| What | Phase | State |
|------|-------|-------|
| the stage named, its commands homed, this reference | 1 | shipped |
| input resolved from the latest drift report, prose overriding | 2 | not built yet |
| `build-report-[n].md` emitted and mapped to its source | 3 | not built yet |
| approval gate and phased replacement | 4 | not built yet |
| the dashboard's build entry, mirroring the terminal flow | 5 | not built yet |

Until phase 2 lands, every Build command reads exactly the input it has always
read. Until phase 3 lands, no build report is written. Do not describe either
as current behaviour, and do not tell a user a report is waiting for them when
nothing wrote one — a stage that overstates its own output is worse than a
stage that has none yet.
