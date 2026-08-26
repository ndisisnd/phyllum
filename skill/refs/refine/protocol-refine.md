## `protocol-refine` — the Refine stage, end to end

Refine is stage four of the pipeline, and it answers one question: **is it ready
for production?** Assess reads a codebase and reports what state it is in. Build
makes something real. Refine is where what was made is held up against the bar
it has to clear before anybody ships it.

This file is the spine of that answer, the way `refs/assess/protocol-assess.md`
is the spine of Assess's. It names the gate sections in order, says what the
stage reads and leaves behind, names the modes of the one command, and states
the ship criteria. Where a mode's own reference and this file disagree, the
mode's file wins and this one is wrong.

| Property | Value |
|----------|-------|
| stage | 4 — Refine |
| question | Is it ready for production? |
| command | `refine`, one command; `tests`, `lint`, `a11y`, `naming`, `coverage`, `deprecate` and `ship` are modes of it |
| scope | one component, one token, or the whole system |
| reads | the user's codebase, and `DESIGN-SYSTEM.md` |
| writes | `.phyllum/refine-report-[n].md`, and nothing else — except `refine deprecate`, which edits `DESIGN-SYSTEM.md` behind the usual acceptance gate (§3, §6) |
| character | judging — it reports a verdict, it never fixes |

Refine is **report-only**. It is the second read-only stage in the pipeline, and
it is read-only for the same reason Assess is: a quality gate that quietly
edited the thing it was grading would leave nobody able to say what the grade
was measuring.

---

## 1. The gate order

<!-- phyllum:refine-gate -->

Bare `refine` runs the full gate. The sections run in this order, always, and
the report is these sections read back in the same order.

| # | Section | What it asks | Kind |
|---|---------|--------------|------|
| 1 | contract | does the subject have a recorded spec — an archetype and its slots for a component, a role and a value for a token? | deterministic |
| 2 | coverage | does the built component use named tokens throughout, or does it still carry raw values? | deterministic |
| 3 | naming | is the name on the scale — a token against `refs/nomenclature.md`, a component against its recorded archetype? | deterministic |
| 4 | a11y | do the token pairs meet contrast, are focus states present, does the archetype's ARIA expectation hold? | mixed |
| 5 | lint | what do the project's own linters say about the subject? | deterministic |
| 6 | tests | do usage-contract tests exist for the subject, and do they pass? | deterministic |
| 7 | ship verdict | given the six sections above, is this shippable? | derived |

### Determinism first

The order is not arbitrary and it is not alphabetical. **Deterministic checks
run first, so a mechanical failure surfaces before any judgement call is made.**

A missing contract, a raw `#2563EB` inside a built component, a token named off
the scale — these are answerable by reading files and comparing strings. They
need no model, no network and no opinion. Sections 1 to 3 are that, and they run
first because a subject that fails them is not ready regardless of what a
judgement layer would have said about it. Asking whether a button's focus ring
reads well, on a button that has no recorded contract at all, is work spent on a
question that was already answered.

Section 4 is the one mixed section: contrast ratios and focus-state presence are
arithmetic and file reading, while an archetype's ARIA expectation is a
judgement bounded by a table. Section 5 delegates entirely to tools the project
already installed. Section 6 asks whether tests exist and pass, which is a fact.

Section 7 derives. It re-reads nothing, re-runs nothing, and invents nothing:
every input to the ship verdict is a result one of the six sections above
already produced. That is what makes a rerun after a fix meaningful — the
verdict moves, or the work did not land.

**No section is skipped in the full gate.** A section that could not run — no
linter installed, a stack outside the component pass — reports that it could not
run, and says why. Silence is the one answer a gate may not give.

---

## 2. Scope — what `refine` is pointed at

`refine` runs over one of three subjects, and the subject is what the argument
names.

<!-- phyllum:refine-scopes -->

| Scope | Subject | Invocation | What the gate covers |
|-------|---------|------------|----------------------|
| `component` | one component | `refine <component>` | that component's contract, its token coverage, its name, its a11y, its lint findings, its tests |
| `token` | one token | `refine <token>` | that token's role and value, its name against the scale, its contrast pairings, and where it is used |
| `system` | the whole system | `refine` with no subject | every recorded component and token, section by section, rolled into one report |

The first column is the word the code holds a scope by, and it is in the table
rather than in the code for the reason every other table here is: a scope
spelled one way in the reference and another in the reader is a scope the
reference stops describing.

Two rules keep the scope honest:

- **A subject that is not recorded is a refusal, never a guess.** `refine
  card-hero` on a design system with no `card-hero` says so and stops. Grading
  something the design system does not record would grade an invention.
- **A section that does not apply to the subject says so.** A token has no
  archetype, so the contract section reads a token's role and value instead of
  slots; it does not report a component finding against a token.

Whole-system scope is the default because it is the question the stage exists to
answer. A user who wants one component named it.

---

## 3. Modes — one command, one stage

<!-- phyllum:refine-modes -->

**Everything Refine does is a mode of `refine`.** There is no `phyllum a11y`, no
`phyllum lint`, no sibling command for any section of the gate. One stage, one
command, exactly as `score` and `drift` are modes of `assess` rather than
commands beside it.

The reason is the one Assess gives for hardcoded-value detection: a check that
had to be asked for makes the default answer quietly incomplete. If `a11y` were
its own command, a bare `refine` that skipped accessibility would still be able
to call itself a quality gate, and it would be lying.

| Mode | One line |
|------|----------|
| `refine tests` | generate usage-contract tests for the subject: type strictness, where data may live, correct usage by agents and by humans |
| `refine lint` | run the project's existing linters over the subject and report what they say — report, never rewrite |
| `refine a11y` | audit accessibility: contrast of token pairs, focus states, and the ARIA expectation the component's archetype carries |
| `refine naming` | check nomenclature: token names against the scale, component names against their recorded archetypes |
| `refine coverage` | check token coverage inside built components — a built component may not carry hardcoded values |
| `refine deprecate` | mark a component or token deprecated: name the replacement, list the usages, and block removal while usages remain |
| `refine ship` | run the ship-readiness checklist alone and return its verdict |

Six of the seven return **one section of the full gate on its own**, the way
`assess drift` returns the drift section. They exist so a person working on one
problem can ask about that problem without reading a whole report.

`deprecate` is the exception, and it is worth stating plainly: it is not a gate
section, and bare `refine` does not run it. It is a mode because marking
something deprecated is a Refine-shaped act — a judgement about readiness — and
because it belongs to the same subject, the same scope words and the same
read-only posture as the rest of the stage.

The modes are implemented across the phases of v0.11.0. This section names them
and what each is for; the protocol each mode follows is its own file in
`refs/refine/`, and this list is a routing table rather than a specification.

---

## 4. Report emission

The stage leaves something behind, for the reason Assess and Build do: a
terminal verdict is read once and lost when the scrollback rolls, and a stage
output is a dated file that says what the system looked like on the day it was
graded.

Bare `refine` writes **`.phyllum/refine-report-[n].md`**. Its sections are the
seven gate sections, in gate order, plus a date and a summary above them.

### The number

The numbering rule is the one `.phyllum/assess-[n].md` and
`.phyllum/build-report-[n].md` already follow, and it is the same rule because
two numbering schemes in one directory is one scheme too many. The
implementations to mirror are `lib/assess-reports.js` and `lib/build-reports.js`.

| Rule | Meaning |
|------|---------|
| ordering is numeric, never lexicographic | `refine-report-10.md` follows `refine-report-9.md`, which a sorted listing would deny |
| the next number is one past the highest that exists | not one past the count — a deleted `refine-report-2.md` still yields `refine-report-4.md` next |
| a deleted number is never reused | that number already named a gate run somebody may have quoted |
| a report is never overwritten | a rerun writes the next number; the previous verdict stays on disk as the record of what was true before the fix |
| anything that is not `refine-report-<digits>.md` is ignored | `.phyllum/` also holds `assess-[n].md`, `build-report-[n].md`, `session.json`, `assess.json` and `PRD.md` |

### The date

The date is **injected, never read from the clock inside render code**, and it
reads local time rather than UTC. Both rules are Assess's, stated in
`refs/assess/protocol-assess.md` §5 and implemented once in
`lib/assess-reports.js`: the same inputs must produce the same bytes, and a
report is a working document read beside the reader's own calendar.

### What a mode writes

A mode returns its section and writes no report. This is `assess score` and
`assess drift`'s rule, and it is here for the same reason — a numbered report
names a full gate run, and a file that held one section of one would make the
numbering describe two different things.

`refine deprecate` is the one mode that changes what `DESIGN-SYSTEM.md` records,
and it does so through the same acceptance gate every other write in Phyllum
passes through. It writes no numbered report either.

---

## 5. The ship criteria

<!-- phyllum:ship-criteria -->

The seventh section is a verdict, and a verdict needs a stated bar. **A
component is shippable only when all six of these hold.**

| # | Criterion | Read from | Fails when |
|---|-----------|-----------|------------|
| 1 | contract present | section 1 | the component has no recorded archetype and slots |
| 2 | coverage clean | section 2 | the built component still carries a value the design system does not name |
| 3 | a11y pass | section 4 | a contrast pair falls short, a focus state is missing, or the archetype's ARIA expectation is unmet |
| 4 | lint pass | section 5 | the project's own linters report an error against the component |
| 5 | tests exist | section 6 | no usage-contract test covers the component |
| 6 | docs exist | Governance | the component has no documentation entry |

Three rules govern the verdict:

- **It is a conjunction, not a score.** Five of six is not "nearly shippable";
  it is not shippable, and the report names which one is open. Refine already
  has a scale — `assess` has the drift score — and a second, softer number here
  would let a failing gate read as a passing mood.
- **Every criterion is read from a section that already ran.** The verdict
  re-runs nothing. If a section could not run, its criterion is unmet and the
  report says the section could not run, rather than passing it by default.
- **Not shippable is a normal outcome.** It is the answer the stage exists to
  be able to give. A gate that never fails is a gate nobody installed.

### The sixth criterion, and the Governance handoff

Criterion 6 is the one Refine cannot satisfy on its own, and it is stated here
anyway rather than left out until it can be.

Documentation is Governance's, stage two of the pipeline and v0.12.0's release:
`govern docs` writes a component's entry against a fixed template — what it is,
how to use it, where to use it, where it appears in the codebase with an example,
and up to three "do not do" examples. Refine's job is to check that the entry
exists, not to write it.

That is the tie forward, and phase 4 of v0.12.0 closed it. Refine states the
requirement; Governance supplies the thing that meets it, and
`refs/govern/docs.md` is the contract for what a satisfying entry looks like. A
component with no entry is still reported as unmet with its reason named, and it
is never quietly passed, because a criterion that passes by absence is a
criterion that was never checked.

---

## 6. The permission posture

`SKILL.md` opens with the hard rule: Phyllum writes exactly one file in the
user's codebase, `DESIGN-SYSTEM.md`, with a short enumerated list of
Phyllum-owned exceptions, and the assertion suite diffs the whole project
directory around every command and fails on anything outside that list.

Refine fits inside that rule without widening it.

| What Refine touches | Status |
|---------------------|--------|
| the user's codebase | read only — components, styles, tests, linter config |
| `DESIGN-SYSTEM.md` | read only, except `refine deprecate`, which writes through the usual acceptance gate |
| `.phyllum/refine-report-[n].md` | written; `.phyllum/**` was already inside the permission model |

**The stage adds no new write target.** `.phyllum/` was enumerated before this
report existed, so a numbered refine report is a new name for a target Phyllum
already had — the same thing that was true of `build-report-[n].md`. The write
goes through the single write funnel in `lib/write.js`, like every other write
in the CLI.

Running a linter or a test suite is running the project's own tooling, and it
goes through `lib/run-command.js` under its allow-list. A tool that would fix
what it found is run in report mode or not at all.

---

## What this protocol must never do

- **Rewrite user code.** Not one file, not one byte. Refine grades; only `apply`
  writes source, and only through a plan the user has read, on its own branch.
- **Fix what it finds.** A linter with a fix flag is run without it. A gate that
  repaired the thing it was grading could not report what the grade was for.
- **Reorder the gate.** Contract, coverage, naming, a11y, lint, tests, verdict —
  in that order, every run. Determinism first is the reason the order exists.
- **Skip a section quietly.** A section that could not run says so and says why.
  A missing section is reported, never omitted.
- **Grade something the design system does not record.** An unknown subject is a
  refusal. Grading an invention produces an invented grade.
- **Pass a criterion by absence.** Six criteria, all six met, or not shippable.
  A check that could not run is unmet, including the docs check until Governance
  ships.
- **Turn a section into its own command.** Every check is a mode of `refine`.
  One stage, one command; a check that had to be asked for would make the
  default gate incomplete.
- **Soften the verdict into a score.** Shippable is a conjunction. The drift
  score is Assess's, and one scale in the product is enough.
- **Reuse or renumber a report.** A number names a gate run. Two runs under one
  name makes somebody's quote wrong.
- **Need a model to be useful.** Contract, coverage, naming, lint and tests are
  mechanical, and judgement layers on top of them rather than in place of them.
