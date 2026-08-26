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
| output | delivered across the phases of v0.12.0 — §3 says which phase brings which, and nothing is claimed before its phase |
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

v0.12.0 ships in five phases. This file landed in the first of them, and phase 2
is in.

| What | Phase | State |
|------|-------|-------|
| the compliance protocol, and this frame | 1 | shipped |
| `govern log` — append-only entries to `DESIGN-SYSTEM-CHANGELOG.md` | 2 | shipped |
| `DESIGN-SYSTEM-CHANGELOG.md` declared by name as a write target | 3 | planned |
| `govern docs` — the five-part documentation template | 4 | planned |
| `govern init` — the pre-commit hook, the CI workflow, or both | 5 | planned |

Each mode gains its own file in this folder **when its phase lands**, not before,
which is the pattern `refs/refine/` followed through v0.11.0: the protocol was
written first, and a file per mode arrived with the mode. `refs/govern/log.md`
arrived with phase 2 and is the folder's first mode file. A placeholder file
describing a mode nobody can run is a contract nobody can check, and this folder
holds none.

What each mode is for, stated once here so the stage can be reasoned about
whole. The first row is behaviour — it runs, and `refs/govern/log.md` is its
contract. The other two are still intent, and stay written as intent until their
phases land:

| Mode | What it is for |
|------|----------------|
| `govern log` | record what changed in the design system, appended to `DESIGN-SYSTEM-CHANGELOG.md`; it appends and never deletes, and a deletion happens only on explicit permission |
| `govern docs` | write a component's documentation entry against one fixed five-part template — what it is, how to use it, where to use it, where it appears in the codebase with an example, and up to three "do not do" examples |
| `govern init` | set up the enforcement plumbing the user asks for: a pre-commit hook, a CI workflow, or both |

`govern docs` is also the thing Refine has been waiting on. Ship criterion 6 —
docs exist — is the one criterion Refine cannot satisfy on its own, and
`refs/refine/ship.md` reports it as unmet with its reason named rather than
passing it by absence. Refine states the requirement; Governance supplies the
thing that meets it. That handoff closes when phase 4 lands, and not before.

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
| `DESIGN-SYSTEM.md` | read only — no mode of this stage writes it |
| the user's codebase | not touched at all |
| `DESIGN-SYSTEM-CHANGELOG.md` | written by `govern log` since phase 2, through the one funnel, and only ever by being made longer |

**The stage has exactly one write target, and it is the one phase 2 added.** It
arrived the loud way rather than the quiet one: `lib/write.js` names it on the
funnel's own list, `evals/harness/fs-harness.js` enumerates it beside
`DESIGN-SYSTEM.md.bak`, and the assertion suite fails the run if anything else
appears in a project diff. Phase 3 is what declares it by name in the permission
table of `README.md` and `SKILL.md`, so **do not offer it as a write target in
conversation until that phase lands.**

The one-write-target rule holds through the addition because the list stays
closed, short and enumerated, because the changelog's own history stays tracked
in git, and because of one property no other target on the list has: **the file
may only grow.** `lib/govern-log.js` checks every write against the bytes already
on disk, and the only call that may shorten it needs a grant minted from a reason
a person gave. `refs/govern/log.md` is where that contract is written down.

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
  work yet", and `planned` is a complete answer.
- **Write a placeholder file for a mode that does not run.** A contract nobody
  can check is worse than an absent one.
- **Widen the write target.** One new name, declared in one phase, on a list that
  stays closed.
- **Document something the design system does not record.** An entry for an
  unrecorded component would document an invention.
