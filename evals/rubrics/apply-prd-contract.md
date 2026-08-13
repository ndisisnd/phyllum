# Eval — `apply`, the PRD contract (v0.2.0 plan §6.5.1, §7)

**Status: scored from v0.2.0 M6.** Unusually for this suite, there is no
unscored half. `apply` step one is mechanical from end to end — it reads
`DESIGN-SYSTEM.md`, reads the codebase, and writes a plan — so every claim it
makes is a fact about a pinned fixture and every one of them is graded here. No
model is involved and the score is reproducible on any machine.

The plan §7 note asks for exactly one thing from `apply`'s evals: fixture
codebases, and proof that **every acceptance criterion maps to a verifiable
change.** That is the last criterion below, and it outranks the others — a plan
full of correctly-counted changes nobody can check is not a plan.

Branch isolation and one-commit-per-phase are asserted by M7's evals, because
they are properties of *executing* the plan and nothing executes yet.

## What the runner scores

### Harness cases — one point each

A pinned project directory, and the question that decides the PRD's whole shape:
which harness will execute this, and from which layer of the precedence? The
point is scored only when the harness id, the layer and the config file all
match. Precedence is the thing under test:

| Fixture | Expected | Why it is in the set |
|---------|----------|----------------------|
| `harnesses/claude-code` | `claude-code` via `config` (`CLAUDE.md`) | the named case in the plan |
| `harnesses/agents-md` | `agents-md` via `config` (`AGENTS.md`) | the other convention, equally valid |
| `harnesses/cursor` | `cursor` via `config` (`.cursorrules`) | **detection is not Claude-Code-only** |
| `harnesses/memory` | `claude-code` via `memory` (`.claude/CLAUDE.md`) | the weakest layer still answers |
| `harnesses/none` | none, via `none` | "no harness" is a supported answer, not a failure |

The `.phyllum/` preference layer is covered by the assertion suite rather than
here, for a mundane reason: a committed fixture inside `.phyllum/` would be
caught by the project's own `.gitignore` and never reach another machine.

### PRD cases — seven points each

For each fixture codebase, against one pinned design system
(`evals/fixtures/design-system/apply-target.md`):

1. **The criteria are exactly right.** The set of `file | literal-or-pattern |
   becomes` triples must match the expectation exactly — no missing change, and
   no invented one. Scoring is set-based, so ordering is free but membership is
   not.
2. **The phases are exactly right.** Titles in order: colours, numbers,
   typography, then one phase per component. A phase for an empty pass is a
   failure, and so is a component sharing a phase with another.
3. **Unnamed literals are excluded, and say they are unnamed.**
4. **A literal named for another role is excluded, and says *that*.** This is a
   separate point from the one above on purpose: `12px` named for `corner radius`
   and used as `padding` is a different fact from `16px` nobody named, and
   collapsing the two would be the dishonest answer that scores well.
5. **A component whose spec still says `TODO` is excluded by name.** A `TODO`
   means *do not generate* — so it appears as a reasoned exclusion, never as a
   silently missing change and never as a half-specified adoption.
6. **The adoption pass is honest about running.** React only in v0.2.0: on a Vue
   or plain-HTML fixture the pass must report that it did not run, rather than
   implying it ran and found nothing.
7. **Every criterion is verifiable.** For each one, the file it names must exist
   in the fixture, and the literal (or the pattern's distinguishing class) must
   actually appear in that file. This is the criterion the plan asks for by name.

## Fixtures

| Fixture | What it tests |
|---------|---------------|
| `codebases/react-css` | the full path: colours, a near-identical colour, a radius, a typography size, and one component adoption |
| `codebases/plain-html` | the values pass on a stack with no components — adoption must not run |
| `codebases/vue-app` | a non-React stack: one colour, and an adoption pass that says it did not run |
| `codebases/empty-project` | nothing to apply: no criteria, no phases, and the TODO component still excluded by name |

Prompts: `evals/prompts/apply-prd-contract.json`.

## Scoring

Five harness points plus seven per PRD case — 33 in total.

**Threshold: 1.0.** Every criterion here is a fact about a pinned fixture rather
than a judgement, so anything less than every point is a regression rather than a
bad day.

An invented change is an automatic fail for the run regardless of score: a plan
that proposes a replacement in a file that does not contain the literal would
send an executor to rewrite something nobody asked about, and that is the failure
mode this eval exists to catch.
