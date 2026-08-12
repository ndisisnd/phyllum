# `create` (alias: `build`)

*Lands in M2 (prose mode) and M4 (image mode in the GUI). Documented here so
the contract is fixed before the code exists.*

Craft a new component from user input and, on acceptance, write it into
`DESIGN-SYSTEM.md`. Nothing is persisted before the user accepts.

## The three input modes

**Mode A — prose.** The user describes the component in natural language:

> "button primary with 12px padding-top and 8px padding-bottom"

Parse that into a draft spec — name `Button/Primary`, properties
`padding-top: 12px`, `padding-bottom: 8px` — and log it as a new draft.

**Mode B — image.** The user provides an image (a path in the terminal, or a
drag-drop in the GUI). Trace it precisely: colours, spacing, radii, typography
sizes and weights, borders, shadows. Output the traced result **as text** — a
spec the user can read, correct and accept. Tracing is best-effort and honest:
anything that cannot be measured confidently becomes a follow-up question, and
nothing unmeasurable is invented.

**Mode C — pick.** With no input, present a picker of (1) common archetypes and
(2) candidate components detected in the codebase — recurring JSX patterns or
repeated class clusters that are not in the system yet. Selecting one seeds a
draft and flows into the same follow-up loop.

## Archetype contracts — rules on WHICH properties, never on WHAT values

Each archetype maps to a contract: the mandatory property slots a component of
that kind must define, each slot expecting a token value.

| Archetype | Mandatory slots | States |
|-----------|-----------------|--------|
| Button | background colour, text colour, border colour, corner radius, typography, padding | hover, disabled |
| Input | background colour, text colour, border colour, corner radius, typography, padding | focus, disabled, error |
| Card | background colour, border colour, corner radius, padding, shadow | — |
| Badge | background colour, text colour, corner radius, typography, padding | — |
| Modal | background colour, corner radius, padding, shadow, overlay colour | — |

Two rules, deliberately asymmetric:

- **WHICH is governed.** A component is incomplete until every mandatory slot is
  filled or explicitly skipped as `TODO`. The gap list *is* the unfilled part of
  the contract.
- **WHAT is free.** There is no rule on values. Four different corner radii on
  one button, a gradient instead of a flat background — accept it verbatim.
  Never "correct" a value for being unconventional; only ensure the slot was
  filled consciously.

**Extrapolation from prior components.** Contracts are the floor, not the whole
answer. Before asking anything, read the components already in
`DESIGN-SYSTEM.md` and work out what this one should probably contain. If every
existing button defines `focus-ring` and uses `highlight-small` typography, lead
with those — and propose slots beyond the contract when the existing system
consistently uses them. Suggested, never imposed: the user can decline any
extrapolated slot.

## The follow-up loop (all three modes)

Once a draft exists, identify the gaps — mandatory slots the input did not
cover, plus extrapolated slots — and ask one question at a time. Every question
carries suggestions, sourced in this priority order:

1. **Existing tokens** — "Your system already has `radius-md` (8px) — use it?"
2. **Codebase evidence** — values found in code near similar components.
3. **Sensible defaults** — archetype defaults, clearly labelled as guesses.

The user answers by picking a suggestion, typing a value, or saying "skip". A
skipped gap is recorded as `TODO` in the spec and in the Backlog section, so
nothing blocks acceptance.

## Output and acceptance

Render the finished spec two ways:

- **Spec view** — the token-referenced definition that goes into
  `DESIGN-SYSTEM.md`.
- **Code view** — the component written in the codebase's language. Default is
  React + CSS; detection failure falls back to React + CSS.

The user then accepts or edits. Edits are prompts ("make the radius larger",
"use brand blue instead") and loop back through render → review. Only on
acceptance is anything written.

Re-running `create` for an existing component name opens a revision rather than
duplicating it.

## Spec block shape

```yaml
name: Button/Primary
archetype: button
properties:
  background: color-primary
  radius: rounded-md
  font: highlight-small
  padding-top: 12px # TODO: tokenise
states:
  hover:
    background: color-primary-hover
```

Raw values carry a `TODO: tokenise` marker and a matching Backlog entry.
