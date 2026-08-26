## `govern docs` — one template, five parts, in one order

This is the Governance stage's second mode with a file behind it, and it answers
the question a design system stops being usable without: **what is this
component, and how is somebody meant to use it?** `DESIGN-SYSTEM.md` records the
contract. A contract is not documentation — it says what the slots are, not what
the thing is for — and a component whose only description is its own spec block
is a component every reader has to reverse-engineer.

So the documentation lives beside the contract, in the same file, under the
component's own heading, and it has exactly one shape.

| Property | Value |
|----------|-------|
| mode | `govern docs` |
| implemented in | `lib/govern-docs.js` |
| reads | the component's `### heading` in `DESIGN-SYSTEM.md`, and the five parts the caller states |
| writes | `DESIGN-SYSTEM.md` only, through the one funnel, and only the one block under that heading |
| kind | deterministic rendering; the acceptance is the skill's |

---

### The template is fixed, and that is the whole point

**Five parts, in this order, every time.** Not "at least these five", not "these
five where they apply", and not "these five in whatever order the writer found
natural."

A documentation set whose entries each choose their own shape is a set nobody can
read twice. The reader of the second entry has to find the section they already
found in the first, and the reader of the twentieth has given up. Worse, an entry
free to omit a part omits the same part every time — the one that was hardest to
write — and the gap is invisible because nothing said the part was owed.

So the order is the table's order, the renderer walks the table, and a part the
caller did not state is recorded as `TODO` rather than dropped. That is the same
posture `protocol-compliance.md` §5 takes on debt: a stated gap is compliant, and
a quiet one is not.

<!-- phyllum:docs-parts -->

| Part | Heading | Answers | Most |
|------|---------|---------|------|
| `what-it-is` | What it is | what the thing is, in one or two sentences a reader who has never seen it can hold | 1 |
| `how-to-use` | How to use it | the props, slots and states the caller sets, and what each one is for | 1 |
| `where-to-use` | Where to use it | the situations this component is the right answer to, and the nearest one it is not | 1 |
| `in-the-codebase` | Where it appears in the codebase | where the component already is, with one example of it being called | 1 |
| `do-not` | Do not do | the ways of using it that look reasonable and are not | 3 |

The `Most` column is read by the code rather than described by it. Four parts
hold one body each. The fifth holds up to three items, and a fourth is refused at
the point the entry is built rather than trimmed away silently.

---

### Why "do not do" is capped at three

The cap is a decision about what a reader will actually carry, not a formatting
preference.

A list of three anti-patterns is a list somebody remembers. A list of eleven is a
policy document, and the three that mattered are now indistinguishable from the
eight that were merely true. Every design system that has ever grown a long
"don'ts" section grew it by adding whatever the last review caught, and the
result is read by nobody.

So three is the ceiling, and the discipline is choosing which three. A fourth
anti-pattern worth stating is a signal that one of the first three has stopped
being the most important one — replace it, and say why in the entry.

**A cap is not a quota.** An entry with one "do not do" example is complete. An
entry with none is not, because a component with no way of being misused has not
been thought about yet.

---

### Where each part's content comes from

Nothing here writes prose out of nothing. `govern docs` renders what it is
handed and refuses what it is not, exactly as `govern log` records a change
somebody else made. This table is where the skill goes to fill each part, and
the last column is what it does when that source is silent.

<!-- phyllum:docs-sources -->

| Part | Where the content comes from | When the source is silent |
|------|------------------------------|---------------------------|
| `what-it-is` | the recorded archetype and the component's own name — what the design system already says it is | ask; a component nobody can describe is a component nobody agreed on |
| `how-to-use` | the spec block's slots, states and variant, and the clauses `refs/refine/protocol-usage-contract.md` derives from them | record `TODO` — a spec too silent to yield a clause is a stated gap |
| `where-to-use` | the user; the design system records no intent, and intent is what this part is | ask, then record `TODO` if there is no answer yet |
| `in-the-codebase` | the adoption evidence behind the `applied:` flag — the files that already are this component — and one real call from one of them | say that no usage was seen, with the bounded-scan caveat, rather than inventing an example |
| `do-not` | the negative clauses of the component's usage contract: styling passed in at the call site, an invented prop, an unrecorded variant | record `TODO`; three invented anti-patterns are worse than none |

**Never write an example the codebase does not contain.** The fourth part is
evidence, and an example composed to look plausible is the exact failure the
never-invent rule exists to stop. An empty result is stated as an empty result:
the scan is bounded and text-based, so "no usage seen" means none was seen in
what was read.

---

### Where the entry lives, and why it is a block rather than prose

The entry is one fenced `markdown` block inside the component's own `###`
subsection of `DESIGN-SYSTEM.md`, beside the `yaml` spec block and any code
block already there. It is not a new file, and it is not loose prose under the
heading.

| Choice | Why |
|--------|-----|
| inside `DESIGN-SYSTEM.md` | it is design-system content, and the write-target list is closed — phase 3 closed it, and a documentation file would be the fourth name on a list that holds three |
| a fenced block, not prose | the file's own reader keeps a component's heading and its fenced blocks and nothing between them, so prose written under the heading is prose the next write loses |
| its own block, not the spec block | the spec block is the component's machine vocabulary — its keys are slots, and every reader of that block reads them as slots. Five paragraphs of prose in there would be read as five slots, one of them containing the word `TODO` |
| `markdown` as the block's language | it is the one language no other block under a component heading uses, so the entry is found by what it is rather than by counting blocks |

The block opens with a fixed title line naming the component, and the reader is
built from that same line — so an entry is recognised by the template that wrote
it, the way `govern log` parses the changelog with its own heading template.

**One entry per component, replaced in place.** A second run rewrites the block
rather than appending a second one, which is the one respect in which this mode
is unlike `govern log`: a changelog is a history and documentation is a state.

---

### The fixed lines

<!-- phyllum:docs-copy -->

| Line | Text |
|------|------|
| `title` | # {name} — documentation |
| `part-heading` | ## {heading} |
| `item` | - {item} |
| `todo` | TODO |
| `unknown-part` | "{part}" is not a part of a documentation entry. The five parts are {parts}. |
| `empty-part` | A documentation entry's "{part}" is empty, and an empty part is not a part. Record TODO instead, and the gap is stated rather than hidden. |
| `over-cap` | A documentation entry records at most {most} "{part}" example(s), and {count} were given. Choose which ones matter. |
| `unrecorded` | The design system records no component called "{name}", so there is nothing to document. `govern docs` documents what DESIGN-SYSTEM.md already records. |
| `unchanged` | `{name}`'s documentation entry is already what `govern docs` would write, so nothing was written. |
| `incomplete` | `{name}`'s documentation entry records "{parts}" as TODO, so the entry is stated but not finished. |
| `not-written` | Nothing has been written — Phyllum writes DESIGN-SYSTEM.md only when you accept. |

The lines live in a table for the reason every other copy table in Phyllum
exists: the skill, the CLI and the assertion suite read one source. Two of them
are read *back* as well as printed — the title and the part heading are what the
entry parser recognises when it reads a block again — so a line edited here stays
a line the reader recognises.

---

### Rerunnability

Running anything twice converges, and this mode is no exception. An entry that
renders to exactly the block already under the component's heading writes
nothing at all, and the result says so rather than reporting a success.

An entry that renders differently replaces the block. That is not a loss: the
documentation is a statement about the component as it is now, and the previous
statement is in git, which is where a history belongs.

---

### What Refine reads, and what it does not

`refine ship`'s sixth criterion — docs exist — reads this block. It reads it
with this module's own parser rather than a second one of its own, so there is
one answer to "is there an entry" and not two.

The three answers it can give follow from the entry rather than from taste:

- **pass** — the five parts are present, in order, and none of them is `TODO`.
- **fail** — the entry is there and a part is `TODO`, and the reason names which.
  A stated gap is honest, and it is still a gap.
- **unmet** — there is no entry at all, and `govern docs` is what writes one.

Refine checks the entry. It never writes one, and Governance never grades one.
That split is the stage boundary, and both sides of it are stated in
`refs/refine/ship.md` and in `refs/govern/govern.md` §6.

---

### What this mode must never do

- **Change the template.** Five parts, in the table's order, in every entry. A
  per-component shape is a documentation set nobody can read twice.
- **Drop a part it has no content for.** `TODO` is the answer, and the gap is
  stated where the next reader sees it.
- **Record more than the cap.** Three "do not do" examples is the ceiling, and a
  fourth is refused rather than quietly trimmed.
- **Invent a part.** Not a description, not a use case, and above all not a code
  example. An example the codebase does not contain is a lie with syntax
  highlighting.
- **Document a component the design system does not record.** There would be
  nothing to document and nowhere to put it.
- **Write anywhere but the component's own block.** Not a new file, not the spec
  block, not loose prose under the heading.
- **Grade the component it is documenting.** Governance states; Refine grades.
  An entry that scored its own subject would be marking its own homework.
- **Append a second entry.** Documentation is a state, and two states are one
  contradiction.
