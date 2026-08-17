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

## What `update` must never do (§6.5)

- Touch the codebase, or `.phyllum/PRD.md`. Outward is `apply`'s job.
- Write anything before the acceptance gate, or outside the one write funnel.
- Guess a target. An ambiguous sentence gets a question.
- Change a slot, a value or a name the prose did not mention.
- Invent a value, or correct one. What you typed is what is recorded.
- Delete anything. Removal is **`phyllum delete`** (`refs/delete/delete.md`) —
  a different verb carrying a different risk, with a breaking-change warning, an
  in-use block and a second confirmation `update` has no need of. `update` does
  not reach it, and it does not reach `update`.
- Dead-end. An empty section, an unmatched sentence and a skip all end with
  something to do next.

## What it no longer means

Up to v0.2.3, `phyllum update` moved the *install* to the latest published
version. That is **`phyllum upgrade`** (`refs/upgrade/upgrade.md`).

In v0.3.0 only, `phyllum update` was an alias of `apply`. That is **`phyllum
apply`** (`refs/apply/apply.md`), under its own name, unchanged.
