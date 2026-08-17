## `create primitives` — the value layer (v0.3.0 §5)

A fourth mode, and the odd one out. The other three craft a *component*;
`primitives` lays down the primitive colour ramps a design system's semantic
tokens sit on — nine steps, `100` (lightest) to `900` (darkest).

`primitives` is a reserved word after `create`, the way `tokens` and
`components` chain under `assess`. Quoting it (`create "primitives"`) means the
word itself, and describes a component.

**Wholly mechanical.** No model, anywhere in this path. The neutral ramp is
shipped constants and a derived ramp is arithmetic, so this mode runs to
completion in a plain terminal with nothing installed — the same note `display`
and `apply` carry in the README. What it does need is a person, because nothing
here is generated unasked.

### Two behaviours, decided by what the system already holds

| The system has | What is offered |
|----------------|-----------------|
| no colour tokens | the neutral ramp only — the nine shipped constants in `refs/nomenclature.md`, identical for every Phyllum user |
| colour tokens | one ramp per colour token, **each asked about first**, plus the neutral ramp alongside when it is not already there |

**Asked first, always.** Every token gets its own yes/no *before* any ramp is
proposed for it, in the order the Colours table lists them, and a no generates
nothing for that token. There is no batch accept and no "generate them all".

A token whose value is not a colour Phyllum can read — `var(--brand)`, a
gradient, a word — is reported as skipped and never asked about. There is
nothing to derive from, and the anti-invention rule does not bend for a value
that merely looks close to one.

### Derivation without invention

The neutral ramp is **not computed**: it is the nine constants from the
`phyllum:neutral-ramp` table, shown in full before acceptance. A brand colour's
ramp cannot be shipped, so it is derived — deterministically, and disclosed:

1. Hold the token's **hue**.
2. Place **lightness** on the fixed nine-step scale (`phyllum:ramp-scale`).
3. Scale the token's own **saturation** by the step's multiplier, so a muted
   input stays muted and the extremes read as tint and shade.
4. Slot the **original value at its nearest step, unchanged** — nearest by
   lightness, ties to the lighter step. The token's own value is never altered,
   never re-spelled, never uppercased: `rgb(37, 99, 235)` stays exactly that.

Same input, same nine values, every run and every machine. All nine render
before the acceptance gate, and any step may be edited before accepting.

### Naming and placement

- **No hyphen before the step.** `accentRed` → `accentRed100`; the number
  appends directly whatever the base token's casing, so `brand-blue` →
  `brand-blue100`. Semantic names hyphenate at every slot boundary
  (`refs/nomenclature.md`), so a number welded to a name says "value layer" at a
  glance.
- **Inside Colours, under a nested `Primitives` subsection** — one `####`
  heading, ordinary inline rows beneath it, the same `token | value` columns as
  the rest of Colours. Semantic tokens stay readable above it. A file with no
  primitives has no subsection and is still valid; it appears when there is
  something to put under it.

### Rerunnable, and the write

- A ramp whose steps are all present is **reported as present**, never proposed
  again and never duplicated.
- A partial ramp offers **only the missing steps**.
- One acceptance gate, one write through the one funnel: `.bak` first, atomic,
  no other file. Refusing the gate writes nothing.

---
