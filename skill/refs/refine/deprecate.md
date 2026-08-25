## `refine deprecate` — mark it dying, and say what replaces it

This is the one mode of Refine that changes what `DESIGN-SYSTEM.md` records, and
the only one that is not a section of the gate. It answers a question the other
six cannot: **this thing is on its way out — what takes its place, and who is
still using it?**

Deprecation is not deletion and it is not a warning. It is a recorded state with
a named successor, and the state is what makes the eventual removal safe:
`delete` reads it, and refuses to remove a deprecated thing while anything is
still using it. A component marked dying with nothing named to move to is a note
to nobody.

| Property | Value |
|----------|-------|
| mode | `refine deprecate` |
| implemented in | `lib/refine-deprecate.js` |
| reads | `DESIGN-SYSTEM.md`, and the user's codebase for the usage list |
| writes | `DESIGN-SYSTEM.md` only, through the one funnel, behind the acceptance gate |
| kind | deterministic derivation; the acceptance is the skill's |

---

### The replacement is mandatory

**No replacement, no deprecation.** There is no flag, no prompt and no
"deprecated, successor to be decided" state. A deprecation without a successor
is a message that a component is bad and nothing about what to do instead, which
leaves every reader of the file with the same question and no answer — and it
leaves `delete` with nothing to point at when it refuses.

Four things are refused before anything is derived, each for its own reason:

| Refused | Why |
|---------|-----|
| no replacement named | the successor is the whole content of the record |
| the subject is not recorded | Refine never grades or edits something the design system does not record |
| the replacement is not recorded | naming a successor that does not exist records a dead end |
| the replacement is the subject | a thing cannot be its own successor |

A subject already marked deprecated is not a refusal. The existing record is
read back — what it names as the replacement, and when — and a run that would
change nothing writes nothing.

---

### Where the record goes

<!-- phyllum:deprecate-record -->

| Subject | Recorded in | Keys | Why there |
|---------|-------------|------|-----------|
| component | spec-block | `deprecated`, `replaced-by` | a component already has a record of its own, and the file already keeps a derived state line there — `applied:` |
| token | backlog | `backlog-line` | a token is a table row, and the token tables' columns are contract; the Backlog is where the file already keeps outstanding work that spans rows |

The split is not a compromise, it is the file's own shape read honestly. A
component's spec block is the place `lib/applied.js` writes to and the place
`delete` reads from, so a deprecation line sits with the other facts about the
component and travels with the entry when the entry finally goes.

A token has nowhere equivalent. Its columns are a contract every reader of the
file depends on, and Phyllum's never-drop-content rule forbids growing or
shrinking them to carry a state. So the deprecation of a token is written where
outstanding work already lives, in one fixed line the reader below parses back.

The component write is **surgical**, exactly as `applied:`'s is: the two lines
are placed after the block's header keys, or replaced in place when they are
already there. Nothing else in the file moves.

<!-- phyllum:deprecate-copy -->

| Line | Text |
|------|------|
| `backlog-line` | Deprecated: `{name}` — replaced by `{replacement}`. Move the usages, then remove it. |
| `no-replacement` | A deprecation names its replacement. `refine deprecate {name}` needs the thing that takes its place, and there is no state for "deprecated, successor undecided". |
| `unknown-subject` | Nothing in DESIGN-SYSTEM.md is called "{name}", and Phyllum never guesses a target. |
| `unknown-replacement` | Nothing in DESIGN-SYSTEM.md is called "{replacement}", so naming it as the replacement would record a dead end. |
| `self-replacement` | `{name}` cannot replace itself. |
| `already` | `{name}` is already recorded as deprecated, replaced by `{replacement}`. |
| `in-use` | `{name}` is deprecated and `{replacement}` replaces it, and {count} usage(s) still name it. |
| `way-out` | Move each usage to `{replacement}`, then `phyllum delete` will remove `{name}`. |
| `not-written` | Nothing has been written — Phyllum writes DESIGN-SYSTEM.md only when you accept. |

The lines live in a table for the reason every other copy table in Phyllum
exists: the skill, the CLI and the assertion suite read one source. The Backlog
line is read *back* out of this table too — the parser is built from the same
sentence rather than spelled a second time in the code, so a line edited here
stays a line the reader recognises.

---

### The usage list

A deprecation is only useful beside the answer to "who is still on it", so the
list is derived in the same pass and reported with the record.

| Subject | What is listed | Read from |
|---------|----------------|-----------|
| component | every markup site that already *is* this component | the `applied:` walk in `lib/applied.js` — the same evidence `apply` derives the flag from and `delete` blocks on |
| token | every component spec that names it as a slot value, and every file in the codebase that writes its name | the recorded spec blocks, and a bounded text scan over the source extensions `assess` reads |

There is no second detector on either side. A component's usages come from the
one predicate that decides what "this component is here" means anywhere in
Phyllum, so the deprecation list, the `applied:` flag and `delete`'s refusal can
never disagree about what they are looking at.

The token scan carries the same caveat every scan in Phyllum carries: it is
bounded and text-based, so an empty list means nothing was seen in what was
read, not that nothing exists.

---

### The removal block

The point of recording the state is what `delete` does with it. `refs/delete/flow.md`
step 3 already refuses to remove a component that is in use; a deprecated
component in use is refused **with the replacement named**, so the refusal
carries the way out rather than just the wall.

| The subject is | Still in use | `delete` does |
|----------------|--------------|---------------|
| not deprecated | yes | refuses, naming the sites — the rule that was already there |
| deprecated | yes | refuses, naming the sites **and** the replacement to move them to |
| deprecated | no | proceeds to the acceptance gate — deprecation is not itself a block |

The third row is the one worth stating out loud. Deprecation does not lock a
component in the file forever. It blocks removal *while usages remain*, which is
exactly as long as removal would break something.

---

### What is written, and when

Nothing is written by the derivation. `planDeprecation` reads the file, reads
the codebase, and returns the edit it *would* make alongside the usage list; it
holds no writer and reaches none. The write is a separate call, and it goes
through `lib/write.js` like every other write in Phyllum — the `.bak` copy
first, then the atomic swap.

The acceptance in between is the skill's, not the mechanical layer's, and it is
the same gate `update` and `delete` pass through: the proposal names exactly
what changes, one question is asked, and only that branch writes. A run that
would change no byte writes nothing at all — no file, no `.bak`.

---

### What this mode must never do

- **Record a deprecation with no replacement.** The successor is the record.
- **Deprecate something the design system does not record.** An unknown subject
  is a refusal, the same one the rest of the stage gives.
- **Remove anything.** Deprecation marks; `delete` removes, behind its own two
  gates. This mode has no path to a removal.
- **Write without acceptance.** The derivation writes nothing, and the write
  sits after the gate rather than beside it.
- **Widen the write.** Two lines in one spec block, or one line in the Backlog.
  The rest of `DESIGN-SYSTEM.md` is the file the user had.
- **Grow a token table to carry a state.** The columns are contract, and the
  never-drop-content rule does not bend for a column Phyllum wants.
- **Report an empty usage list as proof of nothing.** The scan is bounded, and
  the sentence saying so is part of the result rather than a footnote.

---
