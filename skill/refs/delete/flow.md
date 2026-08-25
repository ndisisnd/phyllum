## The flow (§4.2)

Six steps, in this order, every run. The frame and the never-list are in
`refs/delete/delete.md`; this file is the flow the command walks.

<!-- phyllum:delete-flow -->

| Step | What happens | Writes |
|------|--------------|--------|
| 1 | **List and pick.** Every `### <name>` in Components, numbered, with the archetype its spec block records and its `applied` state. `phyllum delete <name>` pre-answers this. | no |
| 2 | **The breaking-change warning.** Printed always, before any question about proceeding. | no |
| 3 | **The in-use check.** In use → refused, with the evidence and the way out, exit 0. | no |
| 4 | **The acceptance gate.** The proposal names exactly what goes: the `### <name>` entry and its Backlog lines. | no |
| 5 | **The second confirmation.** The component's name, typed back. A pick or a `y` is not enough. | no |
| 6 | **The write.** One funnel, `.bak` first, atomic: the entry and its Backlog lines removed, nothing else touched. | yes |

A skip at any depth, a declined gate, or a wrong name at step 5 writes nothing
at all — not a partial file, not a `.bak`.

## The copy contract

The lines below are the copy, and `{name}` is the component in hand. A line
lives here rather than in the renderer so the skill, the CLI and the assertions
read one source.

<!-- phyllum:delete-copy -->

| Line | Text |
|------|------|
| `warning` | Deleting a component can be a breaking change: code generated from `{name}` stays in your codebase, and it will no longer match anything the design system records. |
| `pick-question` | Which component are you deleting? |
| `escape` | (or "skip" — nothing is written) |
| `gate-question` | Delete `{name}` from DESIGN-SYSTEM.md? |
| `confirm-question` | Type the component's name to confirm this deletion: {name} |
| `confirm-refused` | That is not `{name}`, so nothing was written. |
| `in-use` | `{name}` is in use in this codebase right now, so it was not deleted. |
| `way-out` | Remove the usage from your code, run `phyllum apply` so the reading catches up, then run `phyllum delete` again. |
| `deprecated-in-use` | `{name}` is deprecated and `{replacement}` replaces it, and it is still in use in this codebase, so it was not deleted. |
| `deprecated-way-out` | Move each usage to `{replacement}`, run `phyllum apply` so the reading catches up, then run `phyllum delete` again. |
| `token-refused` | `delete token` is reserved and refused: removing a token ripples through every component slot and every Backlog line naming it, which is a different risk and its own release. |
| `no-components` | There are no components in DESIGN-SYSTEM.md yet, so there is nothing to delete. |
| `create-pointer` | `phyllum create "a primary button with 12px padding"` records the first one. |
| `unknown-name` | Nothing in DESIGN-SYSTEM.md is called "{name}", and Phyllum never guesses a target. |
| `prd-note` | .phyllum/PRD.md is not edited by delete. The next `phyllum apply` drops the criteria whose component has vanished, and reports how many. |
| `undo` | The file as it stood one moment ago is in DESIGN-SYSTEM.md.bak — that is the undo. |
| `non-interactive` | `delete` asks you to type the component's name back, and there is nobody here to ask. `--yes` never stands in for that answer. |
| `not-written` | Nothing has been written — Phyllum writes DESIGN-SYSTEM.md only when you accept. |

## The in-use rule (§4.2 step 3)

The block reads the `applied` flag when there is one, and runs a live adoption
check when there is not. Three readings, three answers:

| The spec block says | The block does |
|---------------------|----------------|
| `applied: true` | **refuse** — the flag is `apply`'s own reading of the codebase (`refs/apply/plan.md`) |
| no `applied:` line at all | run the adoption check live, **once, for this component**, and refuse if it finds a site |
| `applied: false` | proceed to the acceptance gate |
| an `applied:` line that is neither word | say the line cannot be read, then run the live check — an unreadable line is not a `false` (v0.5.0 M3) |
| the name is carried by two `### <name>` entries | say so and stop: the name does not identify one entry, so neither the reading nor the removal is about a known block (v0.5.0 M3) |

Absence of a flag means `apply` has never run here, so there is nothing to
read; it never means "not in use". The last two rows are the same argument
carried further. `applied: false` is a **finding** — `apply` looked and saw
nothing — and a line nobody can resolve is not a finding, so it is answered the
way absence is answered: by going and looking. Both are said out loud, naming
the file and the component, because a hand-edit and a duplicated heading are
things only the person holding the file can put right. The live check is the **same evidence**
`apply` derives the flag from — a markup site that already *is* this component,
its generated element or its generated class — reached through the same
predicate rather than a second detector, so the block and the flag can never
disagree about what "in use" means.

The refusal names the evidence (the sites, and the files they are in) and the
way out, and exits **0**. A refusal honoured is not an error: nothing went
wrong, the user asked and Phyllum answered.

### When the component is deprecated

`refine deprecate` (`refs/refine/deprecate.md`) records a component as
deprecated **with a named replacement**, in that component's own spec block. The
block above reads that record, and it changes the refusal rather than the rule:

| The component is | In use | The block does |
|------------------|--------|----------------|
| not deprecated | yes | refuses, naming the sites — the rule above, unchanged |
| deprecated | yes | refuses, naming the sites **and** the replacement to move them to |
| deprecated | no | proceeds to the acceptance gate |

The third row is the point of recording the state at all. Deprecation does not
lock a component in the file forever; it blocks removal *while usages remain*,
which is exactly as long as removal would break something. And the second row is
why a deprecation must name a successor: a refusal that can say "move these to
`Button/New`" is a refusal somebody can act on, and one that can only say "no"
is a wall.

## The double confirmation (§4.2 steps 4 and 5)

The acceptance gate is every other command's: the proposal on screen, then one
yes/no question, and only that branch writes.

The second confirmation is `delete`'s alone. It asks for the **component's
name, typed back** — not a `y`, and not the number that picked it. The reason
is that a `y` proves the user agreed to something, while typing `Button/Primary`
proves they are looking at the right target; the one destructive verb is where
that difference is worth a question. The answer is matched on the whole name,
case-insensitively, backticks stripped, and nothing else: a near miss is a miss,
and a miss writes nothing and says so.

**`--yes` and non-interactive runs never satisfy it.** A gate a flag can answer
is not a gate, and this is the same reasoning that keeps `--yes` from standing
in for a person on a stale plan (`refs/apply/run.md`). With nobody to ask,
`delete` refuses at the top and says why.

## The write (§4.2 step 6)

One write, through the one funnel: the `.bak` is taken first and the swap is
atomic, exactly as every other write in Phyllum. What goes is the `### <name>`
entry with its spec and code blocks, plus the Backlog lines naming that
component — in the **same** write, so the file is never on disk with Backlog
lines pointing at a component that no longer exists.

A Backlog line naming a *second* recorded component is left alone: it is not
this component's line to take. Removing the last component leaves the Components
section with its "no components yet" note rather than an empty heading, and the
report names the `.bak` as the undo.
