# `govern` — the Governance stage, and what it is for

Governance is stage two of the pipeline, and it answers the question the other
three stages quietly assume somebody has answered: **what are the rules for using
it?** Assess reads a codebase and says what state it is in. Build makes something
real. Refine holds what was made against a bar. Governance is where that bar is
written down, along with the record of how the system got to where it is and the
documentation somebody has to read before they use any of it.

This file is the stage's frame, in the sense `refs/build/build.md` is Build's and
`refs/refine/refine.md` is Refine's: what the stage is, what it homes, what goes
in, what comes out. It is deliberately not a second rulebook.
`refs/govern/protocol-compliance.md` is the stage's compliance protocol, and
where this file and that one disagree, that one wins and this one is wrong.

| Property | Value |
|----------|-------|
| stage | 2 — Governance |
| question | What are the rules for using it? |
| command | `govern`, one word; `log`, `docs` and `init` are modes of it |
| input | `DESIGN-SYSTEM.md`, and the compliance rules in `refs/govern/protocol-compliance.md` |
| output | the compliance protocol, an append-only `DESIGN-SYSTEM-CHANGELOG.md`, a five-part documentation entry per component, and the enforcement plumbing — all three modes run |
| character | prescriptive — it states the rules and records what changed; it grades nothing |

---

## 1. Why the stage ships last, and sits second

Governance is second in pipeline order and last in delivery order, and the two
facts are not in tension. **Pipeline order is the order the stages are worked
through; delivery order is the order they were built** — Assess in v0.9.0, Build
in v0.10.0, Refine in v0.11.0, Governance in v0.12.0.

The reason Governance came last is worth stating rather than filed under
scheduling. Governance governs *artefacts* — tokens, components, docs entries,
changelog lines — and Build and Refine are the stages that produce them. A
compliance protocol written before there were components to comply would have
been a guess about a product that did not exist, and a changelog written before
there was anything to change would have recorded nothing. The rules are derived
from what shipped, which is what makes them describable rather than aspirational.

It sits second because it is second in the *work*. A person naming their first
token has already made a governance decision, and the honest place for the rules
is before the building rather than after it.

---

## 2. The audience is an agent

Every other stage in the pipeline is read by a person who then runs something.
This one is read by whatever is about to write.

Its rules are written to be followed by a session that has never seen the
project: read the file, look for the value you are about to introduce, read the
spec block, then write — and write only `DESIGN-SYSTEM.md`. The pre-flight in
`refs/govern/protocol-compliance.md` §2 is that sequence, in order, and it is
phrased as instructions rather than as advice on purpose.

The reason is the one Refine's usage contract already gives: a person who invents
a prop usually notices, while an agent that invents one will invent it
consistently, in every file it touches, and the result reads like a convention.
Rules an agent can follow mechanically are the only rules that survive contact
with one.

---

## 3. What the stage homes, and what exists today

This section is about honesty, and it is written the way `refs/build/build.md`
§4 is written and the way the `built:` flag in `lib/registry.js` is used: a claim
that something works is made only when it works. **A stage that overstates its
own output is worse than a stage that has none yet.**

v0.12.0 shipped in five phases. This file landed in the first of them, and all
five are in.

| What | Phase | State |
|------|-------|-------|
| the compliance protocol, and this frame | 1 | shipped |
| `govern log` — append-only entries to `DESIGN-SYSTEM-CHANGELOG.md` | 2 | shipped |
| `DESIGN-SYSTEM-CHANGELOG.md` declared by name as a write target | 3 | shipped |
| `govern docs` — the five-part documentation template | 4 | shipped |
| `govern init` — the pre-commit hook, the CI workflow, or both | 5 | shipped |

Each mode gained its own file in this folder **when its phase landed**, not
before, which is the pattern `refs/refine/` followed through v0.11.0: the
protocol was written first, and a file per mode arrived with the mode.
`refs/govern/log.md` arrived with phase 2, `refs/govern/docs.md` with phase 4 and
`refs/govern/init.md` with phase 5. A placeholder file describing a mode nobody
can run is a contract nobody can check, and this folder holds none — it never
did, and now it has no reason to.

What each mode is for, stated once here so the stage can be reasoned about
whole. All three rows are behaviour: they run, and `refs/govern/log.md`,
`refs/govern/docs.md` and `refs/govern/init.md` are their contracts.

| Mode | What it is for |
|------|----------------|
| `govern log` | record what changed in the design system, appended to `DESIGN-SYSTEM-CHANGELOG.md`; it appends and never deletes, and a deletion happens only on explicit permission |
| `govern docs` | write a component's documentation entry against one fixed five-part template — what it is, how to use it, where to use it, where it appears in the codebase with an example, and up to three "do not do" examples; the entry is one block under the component's own heading in `DESIGN-SYSTEM.md`, replaced in place rather than appended to |
| `govern init` | install the enforcement plumbing the user names: a pre-commit hook, a CI workflow, or both. Each generated file runs `phyllum assess drift` — the workflow runs `assess score` first — and neither one blocks a commit or fails a build, because Governance states the bar and Refine is what grades against it |

`govern docs` is also the thing Refine had been waiting on, and phase 4 closed
the handoff. Ship criterion 6 — docs exist — is the one criterion Refine cannot
satisfy on its own: Refine states the requirement, Governance supplies the thing
that meets it, and `refs/refine/ship.md` now reads the entry this stage writes
using `lib/govern-docs.js`, the parser that wrote it. A component with no entry
is still reported as unmet with its reason named rather than passed by absence.

---

## 4. Governance is driven from this skill, not from the CLI

There is no `phyllum govern` to type, and `lib/registry.js` records no `govern`
row. That is deliberate, and it is the same posture Refine holds: the registry
lists the words the CLI dispatches, and `govern` is not one of them.

The reason is what the stage actually is. Its first deliverable is a **protocol** —
a file a session reads before it writes — and a protocol has no terminal
invocation any more than the permission rule does. The later modes are work a
session does over a project, in the same way Refine's seven checks are libraries
a session calls rather than commands a user types.

So describe Governance as rules this skill reads and follows, never as a word the
user types at a terminal.

---

## 5. Where the stage writes

`SKILL.md` opens with the hard rule: Phyllum writes exactly one file in the
user's codebase, `DESIGN-SYSTEM.md`, plus a short enumerated list of
Phyllum-owned exceptions, and the assertion suite diffs the whole project
directory around every command and fails on anything outside that list.

| What Governance touches | Status |
|-------------------------|--------|
| `refs/govern/**` — this folder | Phyllum's own reference tree; reading it changes nothing in anybody's project |
| `DESIGN-SYSTEM.md` | read by every mode; written by `govern docs` since phase 4, and only the one documentation block under one component's own heading |
| the user's codebase | not touched at all |
| `DESIGN-SYSTEM-CHANGELOG.md` | written by `govern log` since phase 2, through the one funnel, and only ever by being made longer |
| `.git/hooks/pre-commit` and `.github/workflows/phyllum.yml` | written by `govern init` since phase 5, one or both, only on a choice the user stated, and never over a file Phyllum did not write |

**The stage added exactly three names to the write-target list across the
release: one in phase 2, and two in phase 5.** `govern docs` added none. It
writes the design system's own file, which every stage that records anything
already writes, and its write is surgical — one fenced block replaced or inserted
under one `###` heading, never the file re-rendered around it.
`refs/govern/docs.md` says why the entry is a block there rather than a document
of its own, and the short version is that the list of names Phyllum may write is
closed and a documentation file would have been another name on it.

Every name the stage did add arrived the loud way rather than the quiet one:
`lib/write.js` names each on the funnel's own list,
`evals/harness/fs-harness.js` enumerates each beside `DESIGN-SYSTEM.md.bak`, and
the assertion suite fails the run if anything else appears in a project diff.
Phase 3 declared the changelog by name in the permission table of `README.md` and
`SKILL.md`, beside `DESIGN-SYSTEM.md.bak` and `.phyllum/`; phase 5 declared the
hook and the workflow in the same two tables. All three may be offered as write
targets in conversation, the same as any other name on that list.

The one-write-target rule holds through all three additions because the list
stays closed, short and enumerated, and because each addition carries a lock of
its own.

The changelog's lock is one property no other target has: **the file may only
grow.** `lib/govern-log.js` checks every write against the bytes already on disk,
and the only call that may shorten it needs a grant minted from a reason a person
gave. `refs/govern/log.md` is where that contract is written down.

The plumbing's locks are four, and `refs/govern/init.md` is where they are
written down. The two paths are **filenames, not directories** — `.git/hooks/**`
and `.github/**` would have been a widening, and `.git/hooks/pre-push` is still a
violation. They are **init-only**, admitted under the same flag that admits the
skill install and the `.gitignore` line. They are **never created from nothing**:
a project with no `.git/hooks/` gets a stated reason rather than a repository
Phyllum made for it. And they are **never overwritten in silence** — a hook
somebody else wrote survives the run and is reported, and replacing it takes a
permission stated per piece.

---

## 6. What Governance must never do

- **Grade anything.** Governance states the bar; Refine holds subjects up against
  it. One stage doing both would grade its own output on the next run.
- **Rewrite user code to enforce a rule.** Only `apply` writes source, from a
  plan the user has read, on its own branch.
- **Delete a changelog entry.** `govern log` appends. A deletion needs explicit
  permission, asked for and given, and a log that can quietly lose a line is a
  log nobody can cite.
- **Invent a rule the shipped contracts do not carry.** Every compliance rule is
  derived from something that already exists, and a rule the product contradicts
  is a bug in the rule.
- **Claim a mode before its phase.** The table in §3 is the answer to "does it
  work yet", and `planned` is a complete answer. Every row reads `shipped` now,
  which is a fact about what landed rather than a licence to stop checking.
- **Write a placeholder file for a mode that does not run.** A contract nobody
  can check is worse than an absent one.
- **Widen the write target.** Three names, declared in the two phases that added
  them, on a list that stays closed.
- **Install plumbing nobody asked for.** `govern init` takes a stated choice —
  the hook, the workflow, or both — and a default would be the file somebody
  finds later and did not want.
- **Block a commit or fail a build.** The generated files report and exit zero.
  A hook with a veto is a grader, and Governance grades nothing.
- **Overwrite a hook or a workflow Phyllum did not write.** An occupied path is a
  question, and the answer belongs to the person whose work is at that path.
- **Document something the design system does not record.** An entry for an
  unrecorded component would document an invention.
- **Change the documentation template.** Five parts, in one order, in every
  entry, and at most three "do not do" examples. A set whose entries each choose
  their own shape is a set nobody reads twice, and `refs/govern/docs.md` is where
  both the order and the ceiling are written down.
- **Invent an example.** The fourth part is evidence from the codebase. A call
  composed to look plausible is the never-invent rule broken with syntax
  highlighting.
