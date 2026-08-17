## `update component` (§6.3)

The flow, one question at a time. It is the token flow's shape without the type
step, because components do not live in typed sections:

**1. Print the recorded components.** Every `### <name>` in the Components
section, numbered, with the archetype its spec block records:

```
Components — 2 recorded:
  1. Button/Primary  button
  2. Card/Basic      card
```

The archetype is **read, never inferred**. A `custom: true` marker prints as
`custom` (`refs/create/custom.md`). An entry with no spec block
under it has no archetype to print and prints none — and picking it says so, and
points at `create`, rather than guessing a contract for it.

A system with **no components is not a dead end**: it says so, and points at
`phyllum create`, which is the command that records the first one.

**2. Pick one** — by number or by name.

**3. Ask for the change in prose**, with the `component-change` row's hint from
the question table above:

``What are you updating about `Button/Primary`? [slot becomes <value>] and/or [add a <state> state] — e.g. "background becomes color-primary". (or "skip")``

**4. The change lands as a revision.** Not a parallel flow — the *same* revision
machinery `create` opens when a name it is given already exists
(`refs/create/custom.md` § "Rerunnable"). `update component` is a second door into it:

| Step | Shared with `create` |
|------|----------------------|
| read the sentence into a draft | the same prose extractor, with the archetype taken from the record rather than hunted for in the sentence |
| carry over everything untouched | the same seed-from-existing pass — recorded values verbatim, recorded `TODO`s still `TODO` |
| name a raw value the system already holds a token for | the same token resolution, which is convergence and not correction |
| render the spec and the code blocks | the same renderers |
| write | the same one funnel — `.bak` first, atomic, in place, never a duplicate entry |

The one thing `update component` does not share is the session: `create` keeps
its draft in `.phyllum/session.json` because a draft is a thing you come back to,
and `update` keeps none, because it edits `DESIGN-SYSTEM.md` and nothing else.

**What the prose names is changed. Every slot it does not name is left exactly
as recorded** — same value, same line, same order. A slot the sentence
**mentions without a value** ("add a disabled state") is neither invented nor
ignored: it becomes a question, and a skipped question becomes a `TODO`, exactly
as a contract gap does in `create`.

A skip means **leave it as it is**, never blank it. Skipping a question about a
slot the file already fills leaves the recorded value standing — and if that was
the only thing the sentence touched, the run ends before the gate with nothing
to write.

**5. Confirm and write.** The proposal shows what changed and counts what did
not, then the acceptance gate, then the one funnel:

```
`Button/Primary` (button) in Components:
  background  color-primary → color-surface
  every other slot is left exactly as recorded (1 of them)
```

A sentence that changes nothing the component records stops before the gate and
says so, with the shape of a sentence that would work.

The Backlog is reconciled from the accepted spec, as it is on every `create` —
this component's `TODO` lines are rewritten to match what the spec now says, and
no other component's lines are touched.

### Reading the target for a component sentence

The exact-match rule above holds, with one sharpening the component flow needs.
A sentence naming **one component and any number of tokens** is a component
sentence: the component is the thing being changed and the tokens are the values
it is changed to. `Button/Primary background becomes color-primary` resolves to
`Button/Primary`, and asks nothing.

What still asks: **two components** in one sentence, and **two tokens with no
component**. Those are genuine forks, and Phyllum never picks a side of one.

Inside `update component` the *kind* is already settled by the chain word, so
only component names are matched at all.
