## Custom components — create without a contract (v0.3.0 §6.7)

Some components genuinely fit no archetype: a bespoke chart frame, a hero block,
a composite widget. Forcing one into the nearest contract would ask five
questions nobody has an answer to and then record `TODO` five times. So `create`
has a mode with **no contract**.

**Two doors in, and only two:**

| From | When |
|------|------|
| the pick menu | **custom** is the last row, after every archetype and every candidate |
| prose | the description matches **no** archetype word or alias — then custom is *offered*, never assumed |

Prose that *does* match an archetype never lands in custom. "A button that…" is a
Button, and the way to say otherwise is to pick custom from the menu.

**What "no contract" means:**

- **No mandatory slots, no mandatory states, no gap list.** The spec records
  exactly the slots the description names, and nothing else is asked about.
- **Complete when you say so.** The loop asks for a slot and a value at a time —
  `background #2563EB` — and ends on `done`. There is no checklist to exhaust.
- **A name is asked for, because there is no archetype to build one from.**
  `Archetype/Variant` is a rule about archetypes; a custom is called whatever you
  call it.

**What still holds — everything else:**

- **No invented values.** A slot named without a value is a question, and a
  skipped question is a `TODO` in the spec and a line in the Backlog. The
  anti-fabrication invariant does not know what an archetype is.
- **The same file shape.** A custom is written as an ordinary component — spec
  block, code blocks, `### <name>` in Components — so `display`, the GUI, `apply`
  and Backlog reconciliation read it like any other.
- **Rerunnable.** `create` on a name the system already has opens a revision of
  it, custom or not.
- **One write target, one acceptance gate, `.bak` first, atomic write.**

### The custom marker

A custom records its own status, in the spec block, on two lines:

```yaml
name: Hero/Landing
archetype: custom
custom: true
properties:
  background: color-primary
  padding: 48px # TODO: tokenise
```

`custom` is a reserved word: it is not a row in the contract table and never
resolves through the aliases, so **every contract lookup for a custom comes back
empty** — which is the point. Anything that grades a component against a contract
reads the marker and skips:

| Reader | What it does with a custom |
|--------|----------------------------|
| the gap list | returns nothing at all — no slots, no states, no extrapolation |
| extrapolation | a custom is never counted as a prior component of any archetype |
| `assess` component matching | no contract, so nothing to grade it against; it is still a registered component, so its pattern is never re-proposed as a candidate |
| `apply` adoption | a custom claims no markup signature — adoption matches on archetype, and a custom has none |

Nothing else changes: naming drift, unused-component checks and the Backlog treat
a custom exactly like every other component, because those read names and
values, not contracts.

---
