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

Both rules are protocol from v0.10.0 phase 2 onward, and the protocol is
`refs/build/input.md`: the order the three sources are consulted in, the five
different ways there is no report to read, and what to say for each. Load that
file when a run starts with no subject; this section is the reason it exists,
not a substitute for it.

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
break the chain the numbering exists to keep. The mechanics — numbering, the
source block, what the mapping says for each of Build's inputs — are
`refs/build/report.md`.

**The gate is the point.** Building never changes the codebase in the same
breath as deciding what to change. The user reads the report first and approves
it, and only then does anything happen — the same posture `apply` has held
since v0.2.0, where `.phyllum/PRD.md` is written and `apply run` is a separate
word the user has to type.

When the drift a report answers is large, the report **splits into phases**, so
replacements land one careful phase at a time rather than in one sweep. A phase
is a unit a person can read, approve and verify; a hundred replacements in one
block is a unit nobody reads.

Both of those are mechanism from v0.10.0 phase 4 onward, and the protocol is
`refs/build/gate.md`: the order the report, the question and the write happen
in, what a declined run leaves behind, the threshold a split starts at, and why
a phase is a reading unit rather than an execution queue. Load that file before
asking a user to accept anything in this stage.

---

## 4. What exists today

This section is about honesty, and it is written the way the `built:` flag in
`lib/registry.js` is used: a claim that something works is made only when it
works. v0.10.0 ships in phases, and this file lands in the first of them.

| What | Phase | State |
|------|-------|-------|
| the stage named, its commands homed, this reference | 1 | shipped |
| input resolved from the latest drift report, prose overriding | 2 | shipped |
| `build-report-[n].md` emitted and mapped to its source | 3 | shipped |
| approval gate and phased replacement | 4 | shipped |
| the dashboard's build entry, mirroring the terminal flow | 5 | shipped |

Phase 2 changed one flow and no others. Bare `phyllum create` now leads with
the latest drift report's recommendations when a readable one exists; prose,
image, custom and primitives read exactly the input they have always read, and
a project with no report sees exactly the picker it saw before.

Phase 3 makes the report mechanics real: `create`'s prose and pick doors write
`.phyllum/build-report-[n].md`, mapped back to the drift report or the sentence
it answered. Image mode and a component seeded from an `assess` candidate write
no build report; only prose `create` and a bare `create` that consumed the
latest drift report do.

Phase 4 puts the report where §3 always claimed it was. The report is written
**before** the acceptance question, the question names it, and only a yes edits
`DESIGN-SYSTEM.md` — so the report is the thing being approved rather than a
receipt for a write that already happened. A declined run keeps its report, as
the record of what was proposed. When the drift answered is large the Work
section splits into ordered `## Phase n` sections by a mechanical rule, and the
source block gains a `phases` field describing the split. `refs/build/gate.md`
is the protocol for all of it, including the boundary that keeps phases a
reading and approval structure rather than an execution queue.

What phase 4 does **not** do is change any flow that carries no Build input.
A pick in a project with no drift report, an image, `create primitives`: same
question, same order, no report. And it does not add a per-phase acceptance —
one report, one yes; executing outward one phase at a time is `apply`'s.
