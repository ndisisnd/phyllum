## `protocol-compliance` — what compliant use of a token or a component means

Governance is stage two of the pipeline, and it answers one question: **what are
the rules for using it?** Assess says what state a design system is in. Build
makes something real. Refine asks whether the result is ready. Governance is the
stage that says what "correct" meant all along, so that the other three are
measuring against something written down rather than against taste.

This file is that writing-down. It is the stage's compliance protocol: the rules
an agent reads **before** it touches a token or a component, stated once, in one
place, so that a session, a reviewer and a generated test are all holding the
same bar.

| Property | Value |
|----------|-------|
| stage | 2 — Governance |
| question | What are the rules for using it? |
| audience | agents first, people second |
| reads | `DESIGN-SYSTEM.md`, and the contracts the rest of the reference tree already records |
| writes | nothing — this file is a rulebook, not a command |
| character | prescriptive — it states the bar; Refine is what grades against it |

**Nothing here is new policy.** Every rule below is already carried somewhere in
the shipped product — in `create`'s acceptance rules, in `tokenise`'s naming
scales, in `refine coverage`'s finding table, in the usage contract Refine
derives per component. What this file adds is one address for them. A rule that
lives in six files is a rule an agent has to already know about in order to go
and read; a rule with an address is a rule it can be pointed at.

Where this file and a command's own reference disagree, **the command's
reference wins and this one is wrong**, exactly as the Build and Refine stage
frames say of theirs.

---

## 1. What compliance is, and what it is not

Compliance is not "the design system is finished". It is not a score, and it is
not the absence of outstanding work.

**Compliant use means every design decision reaches the codebase through
something the design system records, and every decision that does not is visible
as debt rather than hidden as styling.** That is the whole rule, and the two
halves matter equally. A component that carries three hardcoded hex values is not
compliant. A component that carries three `TODO: tokenise` markers *is*, because
the debt is written down where the next person reads it.

Three properties follow from that, and they are worth stating before the tables:

- **Compliance is about provenance, not about quality.** Phyllum governs *which*
  slots must be filled, never *what* goes in them. Four radii on one button is a
  compliant component if all four radii are named. A tasteful component styled
  with literals is not.
- **Compliance is checkable without a model.** Nearly every rule below is a file
  read and a string comparison, which is why Refine's deterministic sections run
  first and why this protocol can be handed to an agent as instructions rather
  than as advice.
- **Compliance is stated, then graded, and the two are different acts.**
  Governance writes the rule. Refine reads a subject and says whether it holds.
  A rule with no grader is still a rule; a grade with no written rule is an
  opinion.

---

## 2. What an agent reads before it touches anything

This is the pre-flight, in order. It exists because an agent that starts writing
before it reads the file will invent a name the system already holds, and it will
invent it consistently, in every file it touches, and the result will read like a
convention.

| # | Step | Why it is first |
|---|------|-----------------|
| 1 | read `DESIGN-SYSTEM.md` | it is the single source of the contract — the tables, the spec blocks, the Backlog |
| 2 | look for the value or the name you are about to introduce | a value the system already names has a name; introducing a second one is the exact thing convergence exists to prevent |
| 3 | read the component's spec block, if the subject is a component | the block records the archetype, the slots, the states and the variant, and those are the vocabulary |
| 4 | read the archetype's row in `refs/create/archetypes.md`, if one is recorded | the mandatory slots and states are the contract the component claimed |
| 5 | check the Backlog | it carries the outstanding `TODO: tokenise` debt and the deprecation record for tokens |
| 6 | only then write, and write only `DESIGN-SYSTEM.md` | the one write target, unchanged by this stage |

Step 2 is the one most often skipped and the one that costs most. `rgba(37, 99,
235, 1)` and `#2563EB` are one blue, and the comparison that decides so is by
channel rather than by string — `phyllum:value-comparison` in
`refs/tokenise/confirmation.md` records how each shape is compared.

---

## 3. Token compliance

<!-- phyllum:compliance-tokens -->

| Rule | What compliant use means | Already graded by |
|------|--------------------------|-------------------|
| named-not-valued | a design decision reaches the codebase through the token's **name**, never through the value the token holds | `refine coverage`, rule `bypassed-token` |
| one-value-one-name | a value the design system already names is not named a second time, whatever format it is written in | `tokenise`'s convergence re-check; `assess` hygiene collisions |
| on-the-scale | a new name is built from the nomenclature slots in slot order — `<family>-<rank>[-<exception>][-<state>]`, from the strict word lists | `refine naming` |
| value-as-given | the recorded value is the value the user gave, unrounded, unreordered and uncorrected | the never-correct rule; no grader, because there is nothing to grade against |
| role-carries-the-name | a name says what the token is *for*, not what it looks like; the semantic layer is what components bind to, and a primitive ramp step is the value that layer sits on | `refine naming`, as a warn for an off-scale name |
| declared-role | a number token records what it applies to — `radius`, `spacing`, `shadow` — because a length with no role has no reading and Phyllum does not guess one | `refine coverage`, rule `unreadable-value` |
| deprecated-not-adopted | a token the Backlog records as deprecated is not adopted anew; the replacement it names is what new work binds to | `refine deprecate`, and `delete`'s removal block |

Two of those rows deserve their reason spelled out rather than compressed into a
cell.

**`one-value-one-name` is the rule the whole product is shaped around.** Two names
on one value is not a cosmetic problem: it splits every future change in half, so
a colour updated in one place stays wrong in the other, and neither name is the
one that was wrong. Rerunnability — running anything twice converges — is this
rule enforced at the mechanism level.

**`value-as-given` is a rule about restraint, and it has no exception at the ends
of a scale.** A derived primitive ramp slots the user's own value back at its
nearest step unchanged rather than snapping it to the scale's constant. If the
value looks wrong, the compliant act is to say so and ask, not to fix it in
passing.

---

## 4. Component compliance

<!-- phyllum:compliance-components -->

| Rule | What compliant use means | Already graded by |
|------|--------------------------|-------------------|
| spec-is-the-vocabulary | only the props, slots, states and variants the spec block records are set; an invented one is not honoured | usage clause `agent-props-are-closed`; `variant-closed` |
| slots-hold-tokens | a contracted slot resolves to a token name the design system's own tables record, never to a literal | usage clause `slot-token-valued`; `refine coverage` |
| contract-honoured | the recorded archetype's mandatory slots and states are filled, or recorded as `TODO` — never quietly dropped | `refine`'s contract section, gate section 1 |
| styling-stays-in-the-system | a styling value handed in at the call site does not reach a contracted slot | usage clause `styling-not-passed-in` |
| content-from-the-caller | content is the one thing that legitimately comes from outside, and the content passed is the content that renders | usage clause `content-from-the-caller` |
| called-by-its-name | the component is imported and called under the name the spec records, not under a local alias that hides it from every scan | usage clauses `human-call-by-name`, `human-minimal-call` |
| one-source | the spec block in `DESIGN-SYSTEM.md` is the only place the contract is written down, and it is what a session reads before it calls anything | usage clause `agent-reads-one-source` |

The per-component form of these rules is **derived, never authored**:
`refs/refine/protocol-usage-contract.md` reads a component's own spec block and
its archetype row and states which clauses that particular component supports.
This table is the general rule; that file is the rule applied to one subject, and
it is also where the honest silences come from — a slot recorded `TODO` yields no
clause, and the silence is reported rather than filled in.

---

## 5. Debt is compliant when it is visible

The `TODO: tokenise` marker is not a failure state. It is the mechanism that
makes an incomplete design system honest, and using it correctly is itself a
compliance rule.

| Situation | The compliant act |
|-----------|-------------------|
| a raw value goes into a component spec because nobody has named it yet | record it with a `TODO: tokenise` marker, and let the Backlog carry the line |
| a contract slot is skipped because there is no answer for it | record `TODO`, which becomes a Backlog line — a skipped question is a stated gap |
| a value would be plausible to guess from a neighbouring component | ask, or record `TODO`; a carried-over value is an invented value wearing a neighbour's clothes |
| the Backlog has grown long | that is the design system telling the truth about itself, and shortening it by deletion is the one repair that is not one |

**Hiding debt is the failure, not having it.** A component that quietly styles
itself reads as finished and is not; a component carrying four `TODO` markers
reads as unfinished and is exactly as unfinished as it looks. The second is the
compliant one, and this is the same argument Refine makes about a criterion
passed by absence.

---

## 6. Exemptions, and what an exemption is not

An exemption is a statement that a rule does not *apply*, and it is never a
statement that a subject passed.

<!-- phyllum:compliance-exemptions -->

| Subject | Exempt from | Still bound by | Why |
|---------|-------------|----------------|-----|
| a `custom` component | every contract-derived rule — mandatory slots, states, archetype grading | every value rule: no invented values, no corrected values, slots hold tokens, debt is marked | a custom claims no contract, so grading it against one grades it against rules it never made |
| a component the codebase does not build | the coverage rules | nothing else — its spec is still graded | a component nobody built cannot fail a check about what it was built out of |
| a deprecated component or token | nothing at all | every rule, plus the rule that new work binds to the replacement instead | deprecation records a successor; it does not suspend the contract while usages remain |
| a value on a property no table gives a meaning to | being counted as a failure | being reported | it might be a design decision and it might be a timeout, and Phyllum will not decide which |

Two absolutes hold across all four rows.

**Unreadable is never `false`.** A spec line that cannot be read, a component
under a duplicated name, a scan that hit its file cap — each is reported as
unread, with the reason named, and never folded into the failing or the passing
side. This is the `applied:` line's rule (`applied: maybe` reads as unreadable,
not as `false`), and it is the rule here too.

**An empty result is not proof of nothing.** Every scan in Phyllum is bounded and
text-based, so "no raw values seen" means none were seen in what was read. The
sentence saying so travels with the result rather than sitting in a footnote.

---

## 7. Where Governance writes

`SKILL.md` opens with the hard rule: Phyllum writes exactly one file in the
user's codebase, `DESIGN-SYSTEM.md`, plus a short enumerated list of
Phyllum-owned exceptions, and the assertion suite diffs the whole project
directory around every command and fails on anything outside that list.

**This file adds no write target at all.** A protocol is a file in Phyllum's own
reference tree; reading it changes nothing in anybody's project.

The stage added three new names in the release, and it added each the loud way
rather than the quiet one.

`DESIGN-SYSTEM-CHANGELOG.md` is the first, appended to by `govern log`, written
in phase 2 of v0.12.0 and declared by name beside `DESIGN-SYSTEM.md.bak` and
`.phyllum/` in phase 3, in the permission tables of `README.md` and `SKILL.md`.
The one-write-target rule survives that because the list stays closed, stays
short and stays enumerated — and because that file may only ever be made longer,
which `refs/govern/log.md` states and `lib/govern-log.js` enforces on the bytes.

`.git/hooks/pre-commit` and `.github/workflows/phyllum.yml` are the other two,
written by `govern init` in phase 5 and declared in the same two tables. They are
two filenames rather than the directories they sit in, they are admitted only
under the setup flag, and neither is ever written over a file Phyllum did not
write. `refs/govern/init.md` carries the four locks in full.

`govern docs` writes since phase 4 and adds no name at all. A component's
documentation entry goes into `DESIGN-SYSTEM.md`, under that component's own
heading, as one fenced block — the same file every stage that records anything
already writes, through the same funnel and behind the same acceptance. A
documentation file of its own would have been a fourth name on a list that is
closed, and `refs/govern/docs.md` is where that reasoning is written down.

Compliance itself still writes nothing. A rule is read, not run, and this file's
write surface is: none.

---

## What compliance must never do

- **Grade a `custom` component against a contract it never claimed.** The marker
  is read and the contract lookup comes back empty by design.
- **Pass a rule by absence.** A check that could not run is unmet with its reason
  named, never quietly satisfied.
- **Correct a value in the name of compliance.** Phyllum governs which slots must
  be filled, never what goes in them.
- **Invent a rule.** Every rule here traces to a shipped contract, and a rule this
  file states that the product contradicts is a bug in this file.
- **Rewrite user code to make it compliant.** Only `apply` writes source, from a
  plan the user has read, on its own branch, one phase per commit.
- **Hide debt so a report reads clean.** A `TODO` removed without an answer is a
  design decision deleted.
- **Widen the write target.** The list is closed, and a rule about governance is
  not a licence to govern more files.
- **Read an unreadable answer as a failing one.** Unread is its own answer, and it
  is said out loud.
- **Turn into a grader.** Governance states the bar; Refine holds subjects up
  against it. One stage doing both would grade its own output on the next run.
