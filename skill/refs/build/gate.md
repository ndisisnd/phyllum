# Build's approval gate, and phasing a large answer

`refs/build/build.md` §3 states the posture: Build never changes the codebase
in the same breath as deciding what to change. This file is the protocol that
follows from it — what is written when, what the user is actually approving,
what a "no" leaves behind, and how a large drift answer is split so a person
can read it.

Load this file when a Build run is about to ask for acceptance, when a user
asks what they are approving, or when a build report comes back split into
phases. `refs/build/report.md` is the report's own mechanics; this file is the
order events happen in around it.

## The order, and why it is that order

<!-- phyllum:build-gate -->

| Step | What happens | What has changed on disk |
|------|--------------|--------------------------|
| 1 | the draft is reviewed, gaps asked and answered | `.phyllum/session.json` only |
| 2 | the build report is written | `.phyllum/build-report-[n].md` |
| 3 | the user is told where the report is and asked to accept | nothing further |
| 4a | the user says yes | `DESIGN-SYSTEM.md`, plus its `.bak` |
| 4b | the user says no | nothing further — the report stays |

**The report is the thing being approved.** Written after the write, it would
be a receipt for a decision already taken; written before the question, it is
the proposal the question is about. That is the whole point of the release, and
it is the same posture `apply` has held since v0.2.0, where `.phyllum/PRD.md`
is written and `apply run` is a separate word a person has to type.

Two consequences follow, and neither is a bug:

- **A declined run leaves a build report behind.** It records what was
  proposed, not what was done. Say so when a user asks — deleting it would
  erase the proposal along with the refusal, and a numbered report that
  vanished would break the numbering the whole pipeline reads.
- **Only `DESIGN-SYSTEM.md` is behind the gate.** Everything written before
  the question is inside `.phyllum/`, which is Phyllum's own state and was
  already inside the permission model (`SKILL.md`). The gate adds no write
  target; it reorders two writes that both already existed.

## What a "no" means, and what it does not

A refusal is not an error and not a queue. Nothing is retried, nothing is
half-applied, and the draft stays open in `.phyllum/session.json` so the same
run can be picked up and answered differently. Do not offer to write
`DESIGN-SYSTEM.md` "just this once" without a yes, and do not treat a skipped
question as one.

A run with no Build input at all — a pick made in a project with no drift
report, an image, `create primitives` — writes no build report, and its gate
reads exactly as it always has. Do not tell a user a build report is waiting
for them when none was written.

## Phasing a large answer

<!-- phyllum:build-phases -->

| Rule | Value | Why |
|------|-------|-----|
| split above | 7 or more work items | six families exist, so six or fewer items average one per family and grouping them yields one-line phases |
| group by | severity, then family | severity first because a phase is meant to be done before the next; family second because one family is one kind of edit |
| cap | 5 items per phase | a phase is a unit a person reads, approves and verifies in one sitting |
| overflow | consecutive phases, marked `(continued)` | a group over the cap is still one kind of work, split for reading |
| order | worst severity first, then the assessment's own ranking | `assess` already sorted by severity, finding count and id; the split never re-sorts inside a group |

The split is deterministic and model-free — a group-by, a stable sort and a
chunk in `lib/build-reports.js`. Never re-derive phases yourself, never ask a
model to regroup them, and never renumber them in conversation: `## Phase 2` in
the report is phase 2 everywhere.

A phased report carries a `phases` field in its `phyllum-build-source` block,
listing each phase's number, title and item ids. The field was **added** in
v0.10.0 phase 4, so the block's schema version is unchanged and a reader
written against the earlier shape still works. `null` there means the report is
not phased, which is also what a small report says.

## Phases are reading structure, not an execution queue

This is the boundary that keeps the stage honest, and it is easy to blur.

- **Approval is per report.** A `create` run builds one component, so there is
  one report and one yes. There is no per-phase acceptance question, and
  offering one would invent a gate the mechanism does not have.
- **Execution outward is `apply`'s.** Phase-by-phase execution — one phase,
  one commit, criteria per phase — is `refs/apply/plan.md`, and `apply run` is
  what performs it. Build's phases are how the proposed work is read,
  approved and handed on.
- **So the handoff is the point.** A phased build report says what should
  happen in what order; `apply` is where that order is carried out against a
  codebase. Do not promise a user that approving a build report will apply
  anything.

---
