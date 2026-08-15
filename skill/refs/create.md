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

Values are copied **verbatim**. Phyllum never rounds `11px` to `12px`, never
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

<!-- phyllum:contracts -->

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

The property keys Phyllum writes into a spec, the contract slot each one fills,
and the prose phrases that name it. A slot counts as filled when **any** of its
property keys is present — `padding-top: 12px` fills the `padding` slot.

<!-- phyllum:vocabulary -->

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

<!-- phyllum:defaults -->

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

## Image tracing rules (Mode B)

The CLI owns the frame; the model owns the eyes. Phyllum validates the file,
builds the **trace request**, and ingests the **trace result** — the measuring
itself happens where the vision is (a Claude Code session, or the `claude` CLI
the terminal shells out to). Phyllum never guesses a pixel, and never asks a model
to guess one either.

Four steps, in order:

1. **Validate the file.** The argument must resolve to a file that exists, is
   readable, and carries one of `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`,
   `.avif`, `.bmp`, `.svg`. Anything else is an error with the reason named —
   never a silent fall back to prose.
2. **Build the trace request.** One instruction listing exactly what to measure
   (the table below), the archetype contract to fill, and the reply shape. The
   request is text; the image is handed over as a path.
3. **Trace.** The model measures what it can see and reports each measurement
   with a confidence between 0 and 1. A property it cannot see is *omitted* or
   listed under `unmeasurable` — never given a plausible value.
4. **Ingest.** Phyllum turns the result into a draft: measurements at or above the
   property's minimum confidence become draft properties with origin `image`;
   everything else becomes a follow-up question. Ingestion is the anti-fabrication
   gate, so it is deliberately strict — see "What ingestion refuses".

### The trace result shape

```json
{
  "name": "Button/Primary",
  "archetype": "button",
  "measurements": [
    { "property": "background", "value": "#2563EB", "confidence": 0.97 },
    { "property": "radius", "value": "8px", "confidence": 0.91 },
    { "property": "font-weight", "value": "600", "confidence": 0.44, "note": "small sample" }
  ],
  "unmeasurable": ["shadow"]
}
```

### What can be measured, and how sure is sure enough

Every row is a property key from the slot vocabulary above, so a traced
measurement fills a contract slot exactly like a prose one. **Min confidence**
is the bar a measurement must clear to enter the draft; below it the reading
becomes a question that quotes the reading rather than recording it.
**Tolerance** is what the eval holds a trace to against known ground truth.

<!-- phyllum:trace -->

| Property | Measured as | Min confidence | Tolerance |
|----------|-------------|----------------|-----------|
| background | colour | 0.8 | ΔE < 5 |
| text-colour | colour | 0.8 | ΔE < 5 |
| border-colour | colour | 0.8 | ΔE < 5 |
| overlay-colour | colour | 0.8 | ΔE < 5 |
| border-width | length | 0.8 | ±1px |
| radius | length | 0.8 | ±1px |
| radius-top-left | length | 0.8 | ±1px |
| radius-top-right | length | 0.8 | ±1px |
| radius-bottom-right | length | 0.8 | ±1px |
| radius-bottom-left | length | 0.8 | ±1px |
| padding | length | 0.8 | ±1px |
| padding-top | length | 0.8 | ±1px |
| padding-bottom | length | 0.8 | ±1px |
| padding-left | length | 0.8 | ±1px |
| padding-right | length | 0.8 | ±1px |
| gap | length | 0.8 | ±1px |
| font-size | length | 0.8 | ±1px |
| line-height | length | 0.85 | ±1px |
| font-weight | weight | 0.9 | exact |
| shadow | shadow | 0.9 | — |

### What ingestion refuses

- **A property not in that table.** A still image cannot show it, so a claim
  about it is not a measurement. It is dropped, and reported as dropped.
- **A measurement with no value, or no confidence.** An unquantified claim is an
  opinion; opinions do not enter drafts.
- **Anything under `unmeasurable`.** It becomes a follow-up question, never a
  value, however confident the surrounding prose sounds.
- **Every state in the contract.** A still image shows one state. `hover`,
  `focus`, `disabled` and `error` are always follow-up questions in image mode,
  even when the image "obviously" implies them.

A low-confidence reading is still useful as a *suggestion*: the question quotes
it — "the radius reads about 8px, confidence 0.44" — and it is recorded only if
the user picks it. That is the difference between showing your working and
inventing a value.

---

## Pick rules (Mode C)

With no input, present a picker in two parts:

1. **Archetypes** — every row of the contract table above, in table order.
2. **Found in your codebase** — recurring element/class patterns that are not in
   `DESIGN-SYSTEM.md` yet, most-used first, each with its count and a file it
   was seen in.

Selecting either one seeds a draft — archetype, and a name — and drops into the
same follow-up loop as the other two modes. **A candidate seeds a name and an
archetype, never values.** The values found around it are offered as codebase
evidence in the follow-up loop, where the user can accept or refuse them one at
a time.

### Candidate detection

The scan is read-only and looks at markup: JSX and HTML elements, their class
lists, and custom component names. A signature is one element plus its classes
(`button.btn.btn--primary`); a signature seen at least **Minimum** times is a
candidate. A row's archetype of `—` means "resolve the matched word through the
archetype aliases" — a `Chip` is a Badge, a `Dialog` is a Modal.

<!-- phyllum:candidates -->

| Signal | Matches | Archetype | Minimum |
|--------|---------|-----------|---------|
| element | `button` | Button | 2 |
| element | `input`, `textarea`, `select` | Input | 2 |
| element | `dialog` | Modal | 2 |
| class | `btn`, `button`, `cta`, `action` | Button | 2 |
| class | `input`, `field`, `textbox` | Input | 2 |
| class | `card`, `tile`, `panel` | Card | 2 |
| class | `badge`, `chip`, `pill`, `tag` | Badge | 2 |
| class | `modal`, `dialog`, `sheet`, `drawer` | Modal | 2 |
| component | `button`, `input`, `card`, `badge`, `chip`, `modal`, `dialog` | — | 2 |

**The dashboard's queue comes first.** An image dropped on the GUI enqueues a
`create-image` entry (see `refs/gui.md`). A bare `create` takes the oldest
pending one, removes it from the queue, and runs image mode on that file instead
of showing the picker — the drop *was* the pick.

**Already in the system drops out.** A signature whose class or component name
matches a component already in `DESIGN-SYSTEM.md` (by name or by the class name
Phyllum would generate for it) is not a candidate — it is a component, and
`create` on it opens a revision instead.

---

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
  When the project is *not* React — Vue, Svelte, plain HTML, or nothing
  recognisable — say so beside the code view rather than letting the default
  pass for a detection. The CLI prints that line itself; match it, do not
  contradict it. Vue and Svelte emitters are v2 (plan §9).

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
`.phyllum/session.json` at every step so a dropped session can be picked up.

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

- Write any file other than `DESIGN-SYSTEM.md` (and Phyllum's own `.phyllum/`).
- Write anything at all before acceptance.
- Invent a value for a slot the user did not fill (see the invariant above).
- "Correct" a value the user gave, or reject one for being unconventional.
- Duplicate a component that already exists under the same name.
- Generate a primitive ramp for a token nobody said yes to, or a step the file
  already has.
- Alter the value a token already records in order to fit it onto a ramp.
