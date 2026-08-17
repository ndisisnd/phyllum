## `update token` (§6.4)

The flow, one question at a time:

**1. Ask the type.** The same rows the tokenise picker offers, plus the same
fifth row for everything with no named row of its own:

<!-- phyllum:update-types -->

| Type | Prints as | Section | Role | Follow-up |
|------|-----------|---------|------|-----------|
| `colour` | a colour | `colours` | — | — |
| `typography` | typography | `typography` | — | — |
| `radius` | a border radius | `numbers` | `radius` | — |
| `spacing` | spacing | `numbers` | `spacing` | — |
| `other` | something else | — | — | `free-text` |

The `Section` cell is the token section the type lists from. The `Role` cell
narrows the Numbers section by its "applies to" column, so *a border radius*
lists radii and not spacings. `other` has no section: it falls to the free-text
question, and what the user types is read as prose against **every** recorded
token — border widths, shadows and compounds keep a numbered path in without
earning a row each.

**2. Print the full list for that type.** Every row of the section, numbered,
token and value — and the "applies to" cell too, for numbers. Nothing is
elided, paged or truncated: the list is what makes picking by number possible.

```
Colours — 2 tokens:
  1. color-primary  #2563EB
  2. color-surface  #FFFFFF
```

An **empty section is not a dead end**: it says so, and points at `tokenise`,
which is the command that fills it.

**3. Pick one** — by number or by name.

**4. Ask for the change in prose**, with the argument hint every value question
wears (§4.4 — the hint copy lives in the ref tables, beside the question):

<!-- phyllum:update-questions -->

| Question | Asks | Hint | Example |
|----------|------|------|---------|
| `token-change` | What is changing about | `[new value] and/or [rename to <name>]` | `now rgba(37, 99, 235, 0.9)` |
| `component-change` | What are you updating about | `[slot becomes <value>] and/or [add a <state> state]` | `background becomes color-primary` |

One question is composed from one row, in a fixed order — the ask, the target,
the hint, an example, the escape:

```
<Asks> `<target>`? <Hint> — e.g. "<Example>". (or "skip")
```

so the `token-change` row prints as
``What is changing about `color-primary`? [new value] and/or [rename to <name>] — e.g. "now rgba(37, 99, 235, 0.9)". (or "skip")``

A change sentence can carry a new value, a new name, or both. A rename is
spelled with one of the phrases the table lists, and nothing else reads as one:

<!-- phyllum:update-rename -->

| Phrase | Written as |
|--------|------------|
| `rename` | `rename to`, `rename it to`, `renamed to` |
| `call` | `call it`, `called`, `name it` |

A change sentence joins a slot to its new value with a **change verb**, and
these are the words that count as one. They are glue: they are lifted out of the
sentence before it is read, so that `background becomes color-primary` is read
as the pair it plainly is.

<!-- phyllum:update-verbs -->

| Verb | Written as |
|------|------------|
| `become` | `becomes`, `become`, `becoming` |
| `change` | `changes to`, `change to`, `changed to` |
| `go` | `goes to`, `go to` |
| `be` | `should be`, `is now`, `now` |
| `set` | `set to` |

**5. Confirm and write.** The proposal shows old and new side by side, then the
acceptance gate, then the one write funnel — `.bak` first, atomic write, exactly
as every other write in Phyllum.

```
`color-primary` in Colours:
  value  #2563EB → #1D4ED8
  name   color-primary (unchanged)
```

### The rename rule sharpens, not breaks

The standing rule is "Phyllum never renames a token you already have — that edit
is yours". `update` **is** that edit, now mediated: a rename happens only
because the user asked for this token by name and typed the new name. Unasked
renaming stays on the never-list.

**A rename ripples, in the same write, and says so out loud:**

- every **component spec slot** whose value is the old token name is rewritten
  to the new one;
- every **Backlog `TODO` line** naming the old token is rewritten to the new one.

Both halves happen in the one write, so the file is never on disk with a
reference pointing at a name that no longer exists. Nothing else changes: a slot
whose value merely *contains* the old name as part of a longer word is not a
reference and is left alone, and a line that does not name the token is
byte-identical afterwards.

The ripple is reported before the gate, counted, so accepting is accepting all
of it:

```
  renaming also rewrites 1 spec slot (Button/Primary) and 1 Backlog line
```

### A value change re-runs convergence

The new value is checked against the tokens already recorded, using the
cross-format comparison of §3.1 (`refs/tokenise/confirmation.md` § a value the system already names): a colour
compares by its channels, alpha included, so `rgba(37, 99, 235, 1)` **is** the
`#2563EB` a system already names.

A collision is **surfaced, never written**. Changing `color-secondary` to the
value `color-primary` already holds stops the run and says which token holds it
— merge them by hand, or back out. Two names on one value is the exact thing
convergence exists to prevent, and an edit is not a licence to create one.

A number collides only inside its own "applies to" — a 12px radius and a 12px
padding are different facts, as they always were.
