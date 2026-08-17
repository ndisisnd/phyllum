# `delete`

`delete` is the **removal verb** (v0.5.0 §4). It removes **one recorded
component** from `DESIGN-SYSTEM.md`, and it is the only destructive command in
the product.

Every other command adds (`tokenise`, `create`), reads (`assess`, `display`),
changes what is recorded (`update`) or pushes outward (`apply`). This one takes
something away, and taking something away is the first Phyllum action that can
**orphan** things: code generated from the component stays in the codebase and
stops matching anything recorded, a PRD phase may name it, its Backlog entries
name it.

So `delete` is built as the inverse of `create`'s ease. Every step slows down:

1. a **breaking-change warning**, always, before any question about proceeding;
2. a **hard block** when the component is in use in the codebase;
3. the standard acceptance gate, and then a **second confirmation** that asks
   the user to type the component's name back.

The flow, the copy contract, the in-use rule and the double confirmation are all
in `refs/delete/flow.md`. This file is the frame.

## The grammar (§4.2)

<!-- phyllum:delete-grammar -->

| Typed | Opens | Chain | Prose |
|-------|-------|-------|-------|
| `phyllum delete` | the list of recorded components, then the pick | — | — |
| `phyllum delete <name>` | the same flow, the pick pre-answered | — | yes |
| `phyllum delete token` | refused, with the reason | `token` | — |

A name that matches no recorded component **lists and asks** rather than
failing: a typo is a question, never an error, and never a near-miss guess.

`token` is a **reserved-and-refused** chain word. It is reserved so that
`phyllum delete token` cannot be read as "delete the component called token",
and refused because a token's removal ripples through every component slot and
every Backlog line naming it — that is `update`'s rename-ripple machinery
pointed at absence, and it deserves its own plan (§8). The refusal states that
reason rather than only saying no.

## What `delete` must never do (§4.4)

- **Delete a token.** Reserved and refused, with the reason above.
- **Delete more than one component per run.** One target, one run, one write.
- **Touch anything but `DESIGN-SYSTEM.md`.** Not the codebase, not
  `.phyllum/PRD.md`, not a config file. The PRD is `apply`'s, and the codebase is
  `apply run`'s alone.
- **Write anything before both confirmations have passed.** The acceptance gate
  and the typed-name confirmation are both prerequisites of the one write, and a
  skip at any depth writes nothing at all.
- **Proceed past an in-use block, under any flag or option.** There is no
  `--force`, and `--yes` does not reach the second confirmation either.
- **Guess a target.** An unknown name lists and asks; no prefix match, no
  substring match, no edit distance.

## What it does not clean up, and says so (§4.3)

`delete` does not edit an existing `.phyllum/PRD.md`, even when the plan names
the component that just went. That is not an oversight, it is the same division
of labour every other command keeps: the PRD is `apply`'s file, and `apply`'s
resume already drops criteria whose change has vanished and reports how many
(`refs/apply/run.md`). So `delete` says the next `phyllum apply` will do it,
when a PRD exists, and edits nothing.

The `applied` flag goes with the component, trivially — it lives in the spec
block that is being removed (`refs/apply/plan.md`).
