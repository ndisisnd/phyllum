# `create` (alias: `build`)

*Prose mode (Mode A) ships in M2. Image mode (Mode B) and pick mode (Mode C)
are documented here so the contract is fixed before the code exists.*

Craft a component from user input and, on acceptance, write it into
`DESIGN-SYSTEM.md`. **Nothing is persisted before the user accepts.** The draft
lives in `.basal/session.json` — Basal's own state, gitignored — until then.

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
nothing unmeasurable is invented.

**Mode C — pick.** With no input, present a picker of (1) the archetypes in the
contract table below and (2) candidate components detected in the codebase —
recurring JSX patterns or repeated class clusters that are not in the system
yet. Selecting one seeds a draft and flows into the same follow-up loop.

---

## Prose parsing rules (Mode A)

Parsing is extraction, never invention. Four passes over the sentence, in order:

1. **Archetype.** Find an archetype word or one of its aliases (contract table
   below). If none is present, do not guess: the first follow-up question asks
   which kind of component this is, and no draft properties are recorded until
   it is answered. An unrecognised archetype is a question, not a default.
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

Values are copied **verbatim**. Basal never rounds `11px` to `12px`, never
converts `rem` to `px`, never normalises `#2563eb` to uppercase, and never
replaces a gradient with a flat colour. See "WHAT is free" below.

A value that cannot be attached to any property is dropped from the draft and
raised as a follow-up question ("you mentioned `#2563EB` — which slot is it
for?"). A property phrase with no value becomes a gap. Neither is guessed at.

---

## Archetype contracts — rules on WHICH properties, never on WHAT values

Each archetype maps to a contract: the mandatory property slots a component of
that kind must define, each slot expecting a token value. The contract is what
turns "a button" into a checklist:

> the user asked for a button → resolve to `Button/Primary` → primary buttons
> **must** define background colour, border colour, corner radius and
> typography, plus hover and disabled states.

<!-- basal:contracts -->

| Archetype | Aliases | Mandatory slots | States |
|-----------|---------|-----------------|--------|
| Button | button, btn, cta, action | `background`, `text-colour`, `border-colour`, `radius`, `typography`, `padding` | `hover`, `disabled` |
| Input | input, textfield, text field, field, textbox | `background`, `text-colour`, `border-colour`, `radius`, `typography`, `padding` | `focus`, `disabled`, `error` |
| Card | card, tile, panel | `background`, `border-colour`, `radius`, `padding`, `shadow` | — |
| Badge | badge, chip, pill, tag, label | `background`, `text-colour`, `radius`, `typography`, `padding` | — |
| Modal | modal, dialog, dialogue, sheet, drawer | `background`, `radius`, `padding`, `shadow`, `overlay-colour` | — |

Two rules, deliberately asymmetric:

- **WHICH is governed.** A component is incomplete until every mandatory slot is
  filled or explicitly skipped as `TODO`. The gap list *is* the unfilled part of
  the contract: `gaps = mandatory slots + mandatory states − slots the input
  filled − slots the user skipped`, plus any extrapolated slots (below).
- **WHAT is free.** There is no rule on values. Four different corner radii on
  one button, a gradient instead of a flat background colour, a 3px font size —
  accept all of it verbatim. Never "correct" a value for being unconventional,
  never warn about it, never substitute a token that is merely *close*. The only
  job is to make sure the slot was filled consciously.

### Slot vocabulary

The property keys Basal writes into a spec, the contract slot each one fills,
and the prose phrases that name it. A slot counts as filled when **any** of its
property keys is present — `padding-top: 12px` fills the `padding` slot.

<!-- basal:vocabulary -->

| Property | Slot | Prose phrases |
|----------|------|---------------|
| background | background | background, background colour, background color, bg, fill |
| text-colour | text-colour | text colour, text color, foreground, label colour, font colour |
| border-colour | border-colour | border colour, border color, stroke, outline colour |
| border-width | border-colour | border width, border thickness, stroke width |
| radius | radius | corner radius, border radius, radius, rounding, rounded corners |
| radius-top-left | radius | top-left radius, top left corner |
| radius-top-right | radius | top-right radius, top right corner |
| radius-bottom-right | radius | bottom-right radius, bottom right corner |
| radius-bottom-left | radius | bottom-left radius, bottom left corner |
| padding | padding | padding, inset |
| padding-top | padding | padding-top, padding top, top padding |
| padding-bottom | padding | padding-bottom, padding bottom, bottom padding |
| padding-left | padding | padding-left, padding left, left padding |
| padding-right | padding | padding-right, padding right, right padding |
| font | typography | typography, font, type style, text style |
| font-size | typography | font size, text size, type size |
| font-weight | typography | font weight, weight |
| line-height | typography | line height, leading |
| shadow | shadow | shadow, box shadow, drop shadow, elevation |
| overlay-colour | overlay-colour | overlay colour, overlay, scrim, backdrop |
| gap | gap | gap, spacing between, child spacing |
| focus-ring | focus-ring | focus ring, focus outline, focus state ring |

### Labelled defaults

Third-priority suggestions only (see the follow-up loop). A default is offered
as a **clearly labelled guess** and is only ever recorded because the user chose
it. A default that nobody picked never reaches the spec.

<!-- basal:defaults -->

| Archetype | Slot | Default guess |
|-----------|------|---------------|
| Button | background | #2563EB |
| Button | text-colour | #FFFFFF |
| Button | border-colour | transparent |
| Button | radius | 8px |
| Button | typography | 14px / 600 / 1.4 |
| Button | padding | 12px 16px |
| Button | hover | background 10% darker |
| Button | disabled | 40% opacity |
| Input | background | #FFFFFF |
| Input | text-colour | #111827 |
| Input | border-colour | #D1D5DB |
| Input | radius | 6px |
| Input | typography | 14px / 400 / 1.5 |
| Input | padding | 8px 12px |
| Input | focus | 2px ring, border colour |
| Input | disabled | 40% opacity |
| Input | error | border #DC2626 |
| Card | background | #FFFFFF |
| Card | border-colour | #E5E7EB |
| Card | radius | 12px |
| Card | padding | 16px |
| Card | shadow | 0 1px 2px rgba(0,0,0,0.06) |
| Badge | background | #EFF6FF |
| Badge | text-colour | #1D4ED8 |
| Badge | radius | 999px |
| Badge | typography | 12px / 700 / 1.3 |
| Badge | padding | 2px 8px |
| Modal | background | #FFFFFF |
| Modal | radius | 16px |
| Modal | padding | 24px |
| Modal | shadow | 0 20px 25px rgba(0,0,0,0.15) |
| Modal | overlay-colour | rgba(0,0,0,0.5) |

### Extrapolation from prior components

Contracts are the floor, not the whole answer. Before asking anything, read the
components already in `DESIGN-SYSTEM.md` and work out what this one should
probably contain:

- **Extrapolated slots.** A slot that is *not* in the contract but is defined by
  **every** existing component of the same archetype is proposed as a gap. If
  all three existing buttons define `focus-ring`, the fourth is asked about it.
  If only one of three does, it is not proposed — a single precedent is not a
  system.
- **Extrapolated values.** When existing components of the archetype agree on a
  value for a slot (all buttons use `highlight-small` typography), that value
  leads the suggestions for that slot, ahead of the generic token list.
- **Suggested, never imposed.** An extrapolated gap is skippable like any other,
  and skipping one records no `TODO` for a slot the contract never demanded — it
  simply drops out of the draft.

---

## The follow-up loop (all three modes)

Once a draft exists, compute the gaps and ask **one question at a time**. Every
question carries suggestions, sourced in this priority order:

1. **Existing tokens.** "Your system already has `rounded-md` (12px) — use it?"
   Token suggestions are matched to the slot by kind: colour slots read the
   Colours table, `radius`/`padding`/`gap` read Numbers, `typography` reads
   Typography. If a token matches the slot, it **must** be the first suggestion
   — never a raw value that happens to be the same number.
2. **Codebase evidence.** Values found in the code near similar components, with
   the file they came from: "`src/styles.css` uses `border-radius: 12px` on
   `.btn`". Evidence is read-only; `create` never edits code.
3. **Labelled defaults.** The archetype default from the table above, always
   marked as a guess: "8px (a sensible default — a guess, not from your code)".

The user answers by picking a suggestion, typing any value, or saying **skip**.

- A picked token is recorded by token name.
- A typed value is recorded verbatim, and carries `# TODO: tokenise` plus a
  Backlog entry, because a raw value is debt.
- A skipped mandatory slot is recorded as `TODO` in the spec block **and** as a
  Backlog entry, so nothing blocks acceptance and nothing is silently lost.

**Anti-fabrication invariant.** Every value in a draft traces to exactly one
origin: the user's prose, the traced image, an answered follow-up, or a token
the user picked. Nothing else may appear. Never fill a slot because it "usually"
looks a certain way, never carry a value over from another component without
asking, never invent a hover colour from a base colour. A slot with no origin is
a gap or a `TODO` — those are the only two honest outcomes.

---

## Output and acceptance

Render the finished draft two ways, every time round the loop:

- **Spec view** — the token-referenced YAML definition that would go into
  `DESIGN-SYSTEM.md`.
- **Code view** — the component in the codebase's language. Detection comes from
  the project (React, Vue, Svelte, plain HTML/CSS, Tailwind vs vanilla CSS);
  v1 emits **React + CSS**, and detection failure falls back to the same.

Then the user **accepts** or **edits**:

| State | Meaning | Leaves by |
|-------|---------|-----------|
| `drafting` | gaps are being answered | last gap answered or skipped → `review` |
| `review` | spec and code rendered, waiting on the user | `accept` → `accepted`; an edit prompt → `drafting` |
| `accepted` | written to `DESIGN-SYSTEM.md` | a new `create` run starts a new draft |
| `abandoned` | the user walked away | a new `create` run starts a new draft |

Edits are prompts — "make the radius larger", "use brand blue instead" — and
loop back through render → review. **Only the `review → accepted` transition
writes anything to `DESIGN-SYSTEM.md`.** The draft is persisted in
`.basal/session.json` at every step so a dropped session can be picked up.

---

## The write step

On acceptance, and only then:

1. Parse the current `DESIGN-SYSTEM.md`.
2. **Update in place.** If a component with this name already exists, replace
   its blocks; do not append a second entry. Component count is unchanged on a
   re-create — that is the rerunnable guarantee.
3. Write the spec block, then the code blocks, under `### <name>` in the
   Components section.
4. **Sync the Backlog.** Every raw value gets `TODO: tokenise \`<value>\`
   (<component> <property>)`; every skipped mandatory slot gets `TODO: fill
   contract slot \`<slot>\` (<component>)`. Re-creating a component replaces
   that component's Backlog entries rather than duplicating them, and a slot
   that has since been filled drops out.
5. Render the whole file through the one renderer and write it through the one
   funnel — atomically, and to no other path.

## Spec block shape

```yaml
name: Button/Primary
archetype: button
properties:
  background: color-primary
  radius: rounded-md
  font: highlight-small
  padding-top: 12px # TODO: tokenise
  border-colour: TODO
states:
  hover:
    background: color-primary-hover
  disabled: TODO
```

Raw values carry a `TODO: tokenise` marker and a matching Backlog entry. A
skipped slot is the literal `TODO`, and also appears in the Backlog.

## What `create` must never do

- Write any file other than `DESIGN-SYSTEM.md` (and Basal's own `.basal/`).
- Write anything at all before acceptance.
- Invent a value for a slot the user did not fill (see the invariant above).
- "Correct" a value the user gave, or reject one for being unconventional.
- Duplicate a component that already exists under the same name.
