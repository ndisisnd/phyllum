# `create` (alias: `build`)

*All three input modes ship: prose (Mode A) in M2, image (Mode B) and pick
(Mode C) in M5. The tables below are the contract for every one of them. A
fourth mode, `create primitives` (v0.3.0 §5), lays down primitive colour ramps
rather than a component — it has its own section below.*

Craft a component from user input and, on acceptance, write it into
`DESIGN-SYSTEM.md`. **Nothing is persisted before the user accepts.** The draft
lives in `.phyllum/session.json` — Phyllum's own state, gitignored — until then.

The tables in this file are the contract, and they are machine-readable: the CLI
parses them at run time (`lib/archetypes.js`), and the assertion suite is driven
by them. Editing a table here changes behaviour and changes what the tests
expect. There is no second copy of these rules in the code.

---

## The three input modes

**Mode A — prose.** The user describes the component in natural language:

> "button primary with 12px padding-top and 8px padding-bottom"

Parse that into a draft spec — name `Button/Primary`, archetype `button`,
properties `padding-top: 12px`, `padding-bottom: 8px` — and log it as a new
draft.

**Mode B — image.** The user provides an image (a path in the terminal, or a
drag-drop in the GUI). Trace it precisely: colours, spacing, radii, typography
sizes and weights, borders, shadows. Output the traced result **as text** — a
spec the user can read, correct and accept. Tracing is best-effort and honest:
anything that cannot be measured confidently becomes a follow-up question, and
nothing unmeasurable is invented. The rules are in "Image tracing rules" below.

**Mode C — pick.** With no input, present a picker of (1) the archetypes in the
contract table below and (2) candidate components detected in the codebase —
recurring JSX patterns or repeated class clusters that are not in the system
yet. Selecting one seeds a draft and flows into the same follow-up loop.

---

## Prose parsing rules (Mode A)

Parsing is extraction, never invention. Four passes over the sentence, in order:

1. **Archetype.** Find an archetype word or one of its aliases (contract table
   below). If none is present, do not guess: the first follow-up question asks
   which kind of component this is — and offers **custom**, the contract-free
   mode below — and no draft properties are recorded until it is answered. An
   unrecognised archetype is a question, not a default, and never the nearest
   fit.
2. **Variant.** Find a variant word (`primary`, `secondary`, `ghost`, `danger`,
   …) next to the archetype word. The component name is
   `Archetype/Variant` — `Button/Primary`. With no variant word the name is
   `Archetype/Default`. An explicit `named X` or `called X` phrase wins over
   both.
3. **Property/value pairs.** A value is a literal in the sentence: a number with
   a unit (`12px`, `1.5rem`, `50%`), a bare number (`700`), a colour (`#2563EB`,
   `rgb(…)`, `hsl(…)`), a function value (`linear-gradient(…)`,
   `0 1px 2px rgba(…)`), or a quoted string. A property is a phrase from the
   vocabulary table. A pair is formed when the two are adjacent in either order
   — "12px padding-top", "padding-top 12px", "padding-top of 12px", "with a
   12px corner radius" — optionally separated by `:`, `of`, `is`, `=`, `a`,
   `an`, `the`.
4. **States.** A state word (`hover`, `disabled`, `focus`, `error`, …) scopes
   every pair that follows it in the same clause: "…with a darker #1D4ED8
   background on hover" records `states.hover.background: #1D4ED8`.

Values are copied **verbatim**. Phyllum never rounds `11px` to `12px`, never
converts `rem` to `px`, never normalises `#2563eb` to uppercase, and never
replaces a gradient with a flat colour. See "WHAT is free" below.

A value that cannot be attached to any property is dropped from the draft and
raised as a follow-up question ("you mentioned `#2563EB` — which slot is it
for?"). A property phrase with no value becomes a gap. Neither is guessed at.

---
