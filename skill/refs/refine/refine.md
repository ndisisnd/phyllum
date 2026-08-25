# `refine` — the Refine stage, and the one command that runs it

Refine is stage four of the pipeline, and it answers the question a design
system exists to be able to answer twice: **is it ready for production?** Assess
reads a codebase and says what state it is in. Build makes something real.
Refine holds what was made against the bar it has to clear before anybody ships
it.

This file is the stage's frame, in the sense `refs/build/build.md` is Build's:
what the stage is, what it homes, what goes in, what comes out. It is not a
second rulebook. `refs/refine/protocol-refine.md` is the spine — the gate order,
the scopes, the report, the ship criteria — and each mode carries its own file
beside it. Where this file and one of those disagree, that file wins and this
one is wrong.

| Property | Value |
|----------|-------|
| stage | 4 — Refine |
| question | Is it ready for production? |
| command | `refine`, one command; `tests`, `lint`, `a11y`, `naming`, `coverage`, `deprecate` and `ship` are modes of it |
| input | the user's codebase and `DESIGN-SYSTEM.md`, over one component, one token, or the whole system |
| output | a numbered `refine-report-[n].md` under `.phyllum/`, ending in the ship verdict |
| character | judging — it reports a verdict, it never fixes |

---

## 1. One command, seven modes, and no siblings

**Everything Refine does is a mode of `refine`.** There is no `phyllum a11y`, no
`phyllum lint`, no sibling command for any section of the gate — exactly as
`score` and `drift` are modes of `assess` rather than commands beside it.

The reason is worth stating rather than assuming: a check that has to be asked
for makes the default answer quietly incomplete. If `a11y` were its own command,
a bare `refine` that skipped accessibility could still call itself a quality
gate, and it would be lying.

Six of the seven modes return **one section of the full gate on its own**, for
somebody working on one problem who does not want a whole report.
`refine deprecate` is the exception in two ways: it is not a gate section, and
bare `refine` does not run it. It is a mode because marking something deprecated
is a judgement about readiness, and because it shares the stage's subject, scope
words and posture.

`refs/refine/protocol-refine.md` §3 is the routing table; each mode's own file
is its specification.

---

## 2. The gate, and why the order is fixed

Bare `refine` runs all seven sections, always, in one order: **contract,
coverage, naming, a11y, lint, tests, ship verdict.**

The order is not alphabetical and it is not taste. **Deterministic checks run
first, so a mechanical failure surfaces before any judgement call is made.** A
missing contract, a raw `#2563EB` inside a built component, a token named off
the scale — all three are answerable by reading files and comparing strings, and
a subject that fails them is not ready whatever a judgement layer would have
said. Asking whether a button's focus ring reads well, on a button with no
recorded contract at all, is work spent on a question already answered.

Two rules hold the gate honest, and both are absolutes:

- **No section is skipped.** A section that could not run — no linter installed,
  a stack outside the component pass — reports that it could not run and says
  why. A section outside the subject's reach — coverage against a token, which is
  not a thing that gets built — reports that it does not apply and says why.
  Silence is the one answer a gate may not give.
- **The verdict re-runs nothing.** Every input to section 7 is a result one of
  the six above already produced. That is what makes a rerun after a fix
  meaningful: the verdict moves, or the work did not land.

---

## 3. The three scopes

`refine` runs over one component, one token, or the whole system, and the
subject is what the argument names. Whole-system is the default because it is the
question the stage exists to answer; a user who wanted one component named it.

A subject the design system does not record is a **refusal, never a guess**.
`refine card-hero` on a system with no `card-hero` says so and stops, and it
writes no report — grading an invention would produce an invented grade, and a
numbered report of one is worse than no report at all.

The scope table, with the word each scope is held by, is
`refs/refine/protocol-refine.md` §2.

---

## 4. What the stage leaves behind

Bare `refine` writes **`.phyllum/refine-report-[n].md`** and nothing else. Its
sections are the seven gate sections in gate order, under a date and a summary,
and it ends in a machine-readable `phyllum-refine-verdict` block for whatever
wants to read the answer rather than the prose.

The numbering is the one `.phyllum/assess-[n].md` and `build-report-[n].md`
already follow, because two numbering schemes in one directory is one scheme too
many: numeric ordering, the next number one past the highest that exists, a
deleted number never reused, a report never overwritten. The date is injected
rather than read from a clock inside render code, and it is **local time rather
than UTC** — a report is a working document somebody reads beside their own
calendar, and one dated a day off is one they have to second-guess.

**A mode writes no report.** That is `assess score` and `assess drift`'s rule and
it is here for the same reason: a numbered report names a full gate run, and a
file holding one section of one would make the numbering describe two different
things.

---

## 5. What `refine` must never do

- **Rewrite user code.** Not one file, not one byte. Refine grades; only `apply`
  writes source, through a plan the user has read, on its own branch.
- **Fix what it finds.** A linter with a fix flag is run without it. A gate that
  repaired what it was grading could not report what the grade was for.
- **Reorder the gate.** Determinism first is the reason the order exists.
- **Skip a section quietly.** It says so, and says why.
- **Grade something the design system does not record.**
- **Pass a criterion by absence.** Six criteria, all six met, or not shippable —
  the docs criterion included, which stays unmet until Governance ships.
- **Turn a section into its own command.**
- **Soften the verdict into a score.** Shippable is a conjunction. The drift
  score is Assess's, and one scale in the product is enough.
- **Reuse or renumber a report.** A number names a gate run.
- **Need a model to be useful.** Contract, coverage, naming, lint and tests are
  mechanical; judgement layers on top of them rather than in place of them.

---

## 6. Where the stage writes, and where it does not

`SKILL.md` opens with the hard rule: Phyllum writes `DESIGN-SYSTEM.md` and a
short enumerated list of Phyllum-owned exceptions, and the assertion suite diffs
the whole project directory around every command. Refine fits inside that rule
without widening it.

| What Refine touches | Status |
|---------------------|--------|
| the user's codebase | read only — components, styles, tests, linter config |
| `DESIGN-SYSTEM.md` | read only, except `refine deprecate`, which writes through the usual acceptance gate |
| `.phyllum/refine-report-[n].md` | written; `.phyllum/**` was already inside the permission model |

The stage adds **no new write target**. A numbered gate report is a new name for
a target Phyllum already had, exactly as `build-report-[n].md` was, and the write
goes through the single funnel in `lib/write.js`. Running a linter or a test
suite is running the project's own tooling, through `lib/run-command.js` under
its allow-list, in report mode or not at all.
