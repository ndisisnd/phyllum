## `refine ship` — six criteria, one conjunction

The seventh gate section, run on its own. It asks the question the whole stage
exists to answer — **is this component ready for production?** — and it answers
it the only way a gate can: by naming a bar, checking every part of it, and
refusing to average.

The bar is the six criteria stated in `refs/refine/protocol-refine.md` §5. This
file is how they are read, what each of the three answers means, and the two
rules that keep the verdict from softening.

| Property | Value |
|----------|-------|
| mode | `refine ship` |
| implemented in | `lib/refine-ship.js` |
| reads | the results the other sections already produced |
| writes | **nothing** — not a report, not `DESIGN-SYSTEM.md` |
| kind | derived; it re-runs nothing and invents nothing |

---

### It writes nothing, and that is deliberate

`refine deprecate` is the one mode in the stage that edits `DESIGN-SYSTEM.md`.
`refine ship` is not, and a shippable verdict is therefore **reported, never
recorded**.

The reason is the reason the stage is read-only at all. A verdict is true of a
codebase on the day it was derived, and a codebase changes the next commit. A
`shippable: true` line sitting in the file would keep saying yes long after the
last of the six criteria stopped holding, and a stale yes is worse than no
answer — it is an answer somebody quotes. The verdict is cheap to re-derive and
it re-runs nothing, so re-deriving it is always better than trusting a record of
it.

---

### The six criteria, and where each is read

<!-- phyllum:ship-checks -->

| Criterion | Reads | Satisfied when | Unmet when |
|-----------|-------|----------------|------------|
| contract-present | contract | the component's spec block yields at least one derivable usage-contract clause | the spec records no archetype and no slot a clause could be built from |
| coverage-clean | coverage | the component's own files carry no error-severity coverage finding | the component is not built, so there is nothing to grade |
| a11y-pass | a11y | the component's contrast, focus and ARIA readings carry no error-severity finding | the component claims no archetype contract, or the markup could not be read |
| lint-pass | lint | every configured linter ran and reported nothing against the subject | no linter is configured, or a configured linter could not be started |
| tests-exist | tests | the project already carries a usage-contract test file for the component | — |
| docs-exist | docs | the component's entry in `DESIGN-SYSTEM.md` records all five parts of the documentation template, none of them left open | no documentation entry is recorded for this component |

The `Reads` column is the section each answer comes from, and it is the whole
guarantee behind "the verdict re-runs nothing". Every value is a result one of
the six gate sections already produced, handed in rather than re-derived. The
`docs` row is the exception in shape rather than in principle: there is no docs
*section* in the gate, because documentation is Governance's stage and not one of
Refine's seven. What is read is the entry `govern docs` writes into the
component's own subsection of `DESIGN-SYSTEM.md`, read with Governance's own
parser in `lib/govern-docs.js` rather than a second one here. One file, one
reader, one answer to "is there an entry".

That entry has three states, and the criterion has three answers for exactly
that reason. No entry is `unmet` — nothing has documented this component, and
`govern docs` is what would. An entry with a part still recorded `TODO` is a
`fail` naming the part: the gap was stated, which is the honest thing to do with
it, and it is still a gap. Only the complete five-part entry passes.

The contract reading comes from `lib/refine-tests.js`'s derivation rather than
from a second parse of the spec block. A contract is what the usage-contract
clauses can be built out of, so **a contract with no derivable clause is an
absent contract**, whatever the spec block happens to contain otherwise.

---

### Three answers, not two

<!-- phyllum:ship-statuses -->

| Status | Means | Ships |
|--------|-------|-------|
| pass | the section ran, and the criterion is met | yes |
| fail | the section ran, and the criterion is not met | no |
| unmet | the section could not run, or the stage that satisfies the criterion does not exist yet | no |

`unmet` exists because `fail` would be a lie and `pass` would be a worse one.

"The linter reported an error against this component" and "no linter is
configured in this project" are different facts, and collapsing them loses the
one thing the reader needs to act. The first is a bug to fix; the second is a
tool to install. Both stop a ship, and only one of them is anybody's fault.

`unmet` never ships, and that is the rule `protocol-refine.md` states as **a
criterion that passes by absence is a criterion that was never checked**. The
docs criterion lived permanently in this column until `govern docs` shipped in
v0.12.0 phase 4; it now moves through all three answers like every other
criterion, and an undocumented component still lands here with the reason named
rather than quietly counting five criteria as six.

---

### The verdict is a conjunction

**Six pass, or not shippable.** Five of six is not a score of 83 and it is not
"nearly there"; it is a component with an open criterion, and the verdict names
which one.

Phyllum already has one scale — Assess's drift score — and one is enough. A
second, softer number here would let a failing gate read as a passing mood,
which is precisely the failure mode a gate is installed to prevent.

Not shippable is a normal outcome, and it is the *expected* one for a component
nobody has documented: `docs-exist` comes back unmet, and five green criteria do
not add up to a verdict. That is the honest answer, and the way to change it is
to run `govern docs` rather than to soften the bar.

---

### A deprecated component is never shippable

A component recorded as deprecated in `DESIGN-SYSTEM.md` (`refs/refine/deprecate.md`)
is **not shippable, whatever the six criteria say.**

It is not a seventh criterion, and the six are not quietly rewritten to include
it. The criteria are still read and still reported — a deprecated component can
be perfectly clean, and hiding that would make the report harder to read, not
easier. What changes is the conjunction on top: a thing the design system has
already recorded as on its way out is not a thing to put into production,
however well it scores on the way out.

The verdict names the deprecation and the replacement, so the reader is told
what to ship instead rather than only what not to ship.

---

### What the mode returns

One entry per component, and each entry carries the six criteria in table order
with a status and a reason each, plus the one verdict over them.

A reason is stated on every criterion that is not a plain `pass`, and it names a
fact rather than a judgement: which linter was missing, which section could not
run, which file the test would have been. A `fail` with no reason is a verdict
nobody can act on.

The mode writes no report. That is the stage-wide rule in
`refs/refine/protocol-refine.md` §4 — a numbered report names a full gate run,
and a file holding one section of one would make the numbering describe two
different things.

---

### What this mode must never do

- **Re-run a section.** Every input is a result a section already produced. A
  verdict that re-read the codebase could disagree with the report above it.
- **Pass a criterion by absence.** A section that could not run is `unmet`, and
  `unmet` never ships.
- **Average the six.** A conjunction, never a score, never a proportion.
- **Record the verdict.** Nothing is written. A stale yes is worse than no yes.
- **Ship a deprecated component.** The design system already recorded that this
  one is on the way out.
- **Hide the reason.** Every status that is not `pass` names what stopped it.

---
