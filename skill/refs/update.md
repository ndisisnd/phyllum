# `update`

`update` is the **design-system editing verb** (v0.4.0 §6). Every other command
adds (`tokenise`, `create`), reads (`assess`, `display`) or pushes outward
(`apply`). `update` changes what is already recorded, as a mediated
conversation with the same gates every other write has.

It edits `DESIGN-SYSTEM.md` and nothing else. It never touches your codebase and
never touches `.phyllum/PRD.md` — outward is `apply`'s job, under `apply`'s name.

## The word changes hands — again (§6.1)

v0.3.0 made `update` an **alias of `apply`**. v0.4.0 takes it back: **`phyllum
update` no longer reaches `apply`.** `update run` no longer exists. `apply`
keeps its own name, its own help and its own behaviour, untouched.

The reasoning that gave `apply` the word was "update means the direction people
reach for". With an editing verb on the table, the thing people reach for when
they type `update` is *changing what is recorded*. The alias was the best owner
of the word only while nothing better existed.

The break is safe in the same way the last one was, inverted. A muscle-memory
`phyllum update` now opens a menu that writes nothing until an acceptance gate
is passed: no plan file appears, no code is touched, and quitting the menu costs
nothing.

**The breadcrumb prints.** The empty-run menu carries one pointer line, and only
the empty-run menu:

<!-- phyllum:update-copy -->

| Line | Text |
|------|------|
| `menu-question` | What are you updating? |
| `type-question` | What kind of token are you updating? |
| `escape` | (or just describe it — "make color-primary #1D4ED8" — or "skip") |
| `breadcrumb` | Looking to apply the design system to your code? That is `phyllum apply`. |

The breadcrumb is a **0.4.x line only**. Two renames in two releases earned it;
the release after 0.4.x removes it. Nothing else about `update` prints it — a
chained run, a prose run and every follow-up question are silent about `apply`,
because a user who typed `update token` did not mistype anything.

## The grammar: chain, prose, or menu (§6.2)

<!-- phyllum:update-grammar -->

| Typed | Opens | Chain | Prose |
|-------|-------|-------|-------|
| `phyllum update` | the menu | — | — |
| `phyllum update component` | the component flow, from its list | `component` | — |
| `phyllum update token` | the token flow, from its type question | `token` | — |
| `phyllum update "<prose>"` | the target read from the sentence | — | yes |
| `phyllum update component "<prose>"` | the component flow, sentence already read | `component` | yes |
| `phyllum update token "<prose>"` | the token flow, sentence already read | `token` | yes |

`component` and `token` are **reserved chain words**, the way `tokens` and
`components` are reserved under `assess`. Quote one ("token") to mean the word
itself, and it is read as prose.

The empty run opens the menu:

<!-- phyllum:update-menu -->

| Pick | Prints as | Chain | Flow |
|------|-----------|-------|------|
| `component` | a component — change a recorded component | `component` | `component` |
| `token` | a token — change a recorded token's value or name | `token` | `token` |

printed as

```
What are you updating?
  1. a component — change a recorded component
  2. a token — change a recorded token's value or name
(or just describe it — "make color-primary #1D4ED8" — or "skip")

Looking to apply the design system to your code? That is `phyllum apply`.
```

The posture is the tokenise kind picker's, exactly (`refs/tokenise.md` § with
nothing to read): **numbers or words** both pick a row, **free text is honoured**
at every step and read as prose, and **skip is always available and always
writes nothing**. Row order is the printed order, and the number a user types is
the row's place in the table.

## Reading a target out of prose (§6.2)

Prose given anywhere — as the argument, or typed at any question — is read for
the thing it is about. The rule is deliberately narrow, because the never-list
forbids a guess:

| The sentence carries | Resolves |
|----------------------|----------|
| a backticked name that is exactly a recorded token or component name | that target |
| a bare word that is exactly a recorded token or component name | that target |
| two or more different recorded names | nothing — the disambiguation question, listing what it matched |
| no recorded name at all | nothing — the menu, so the run is not a dead end |

Matching is **exact on the whole name**, case-insensitively, and nothing else.
No prefixes, no substrings, no edit distance, no "did you mean". A sentence
about `color-primar` matches nothing and gets asked; it never quietly edits
`color-primary`. A component name is matched whole, slash included
(`Button/Primary`), so a sentence naming `Button/Primary` resolves and a
sentence naming `Button` does not.

One target per run. A sentence naming three tokens is three runs (§10).

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
cross-format comparison of §3.1 (`refs/tokenise.md` § already named): a colour
compares by its channels, alpha included, so `rgba(37, 99, 235, 1)` **is** the
`#2563EB` a system already names.

A collision is **surfaced, never written**. Changing `color-secondary` to the
value `color-primary` already holds stops the run and says which token holds it
— merge them by hand, or back out. Two names on one value is the exact thing
convergence exists to prevent, and an edit is not a licence to create one.

A number collides only inside its own "applies to" — a 12px radius and a 12px
padding are different facts, as they always were.

## `update component` (§6.3)

Reserved and reachable — the chain word resolves, and the menu's first row is
live — but the flow itself lands in **v0.4.0 M6**. Until then, picking it says
so plainly and points at the door that exists today: `phyllum create "<prose>"`
naming a recorded component opens the revision flow (`refs/create.md` §
revisions), which is the machinery `update component` will ride rather than
duplicate.

When it lands, the flow is: print the recorded components with their archetypes,
numbered → pick one → ask for the change in prose (the `component-change` row
above) → the revision flow → the acceptance gate → the one funnel. What the
prose names is changed; every slot it does not name is left exactly as recorded.

## What `update` must never do (§6.5)

- Touch the codebase, or `.phyllum/PRD.md`. Outward is `apply`'s job.
- Write anything before the acceptance gate, or outside the one write funnel.
- Guess a target. An ambiguous sentence gets a question.
- Change a slot, a value or a name the prose did not mention.
- Invent a value, or correct one. What you typed is what is recorded.
- Dead-end. An empty section, an unmatched sentence and a skip all end with
  something to do next.

## What it no longer means

Up to v0.2.3, `phyllum update` moved the *install* to the latest published
version. That is **`phyllum upgrade`** (`refs/upgrade.md`).

In v0.3.0 only, `phyllum update` was an alias of `apply`. That is **`phyllum
apply`** (`refs/apply.md`), under its own name, unchanged.
