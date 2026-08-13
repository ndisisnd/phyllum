# `tokenise` (alias: `tokenize`)

Turn **a sentence** into a named token. One value, one name, one row in
`DESIGN-SYSTEM.md`:

```
phyllum tokenise "our brand blue #2563EB"
phyllum tokenise "16px spacing called space-md"
phyllum tokenise "heading 24px bold 1.2"
```

`tokenise` reads prose. It does **not** read the codebase — as of v0.2.0 that is
`assess`'s job. The division is clean:

| Command | Reads | Writes |
|---------|-------|--------|
| `assess` | your codebase | `DESIGN-SYSTEM.md` |
| `tokenise` | the sentence you typed | `DESIGN-SYSTEM.md` |
| `create` | your intent | `DESIGN-SYSTEM.md` |

Only accepted tokens are written, and only into `DESIGN-SYSTEM.md`.

The tables in this file are the contract — for the skill, for the CLI
(`lib/tokenise-spec.js` parses them at run time) and for the assertion suite
alike. Editing a table here changes behaviour and changes what the tests expect.
There is no second copy of these rules in the code.

---

## What the prose is read for

Two facts, and one of them is optional:

- **The value** — the concrete thing being named. A colour (`#2563EB`,
  `rgb(37, 99, 235)`, `hsl(217, 91%, 60%)`), a length (`12px`, `1rem`), or a
  typography reading (a size, optionally a weight and a line-height).
- **The name** — if the sentence gives one, it is used verbatim. If it doesn't,
  Phyllum suggests one from the naming scales below and asks you to confirm.

Prose with **no value at all** — "add a token for our brand blue" — is not an
error. It opens a follow-up question asking for the missing value, the same way
`create` asks about a gap it cannot fill, and the token is written only once the
answer completes it. `tokenise` never dead-ends on an incomplete sentence.

### Which pass a value belongs to

- A colour shape is always the **colours** pass.
- A length is the **numbers** pass, unless the sentence also carries a
  typography word — then the size, the weight and the line-height are read
  together as one **typography** reading.
- A bare number between `100` and `900` in hundreds reads as a font weight; a
  bare number of `4` or less reads as a line-height. Neither is invented from
  nothing: a typography reading with no weight records `400` and one with no
  line-height records `normal`, both the CSS initial value, and both visible on
  the proposal before you accept it.

### The words that carry meaning

Role words tell a `12px` corner from a `12px` padding. Typography words move a
length out of the numbers pass. Naming words introduce the name you chose.
Matching is word-by-word and case-insensitive.

<!-- phyllum:prose-hints -->

| Words | Means |
|-------|-------|
| `radius`, `radii`, `corner`, `corners`, `rounded`, `rounding` | radius |
| `spacing`, `space`, `padding`, `margin`, `gap`, `inset`, `gutter` | spacing |
| `border`, `borders`, `outline`, `stroke`, `hairline` | border |
| `font`, `fonts`, `type`, `typography`, `text`, `heading`, `title`, `body`, `label`, `caption`, `line-height`, `leading`, `weight` | typography |
| `called`, `named`, `name`, `call`, `as` | name |

A naming word takes the next word in the sentence as the name — "16px spacing
called `space-md`" names `space-md`. A backticked word is read as a name
wherever it appears, and so is a bare hyphenated identifier (`brand-blue`),
because those are what a design system's names look like.

<!-- phyllum:prose-weights -->

| Words | Weight |
|-------|--------|
| `thin`, `hairline` | 100 |
| `extralight`, `ultralight` | 200 |
| `light` | 300 |
| `regular`, `normal`, `book` | 400 |
| `medium` | 500 |
| `semibold`, `demibold` | 600 |
| `bold` | 700 |
| `extrabold`, `heavy` | 800 |
| `black`, `ultra` | 900 |

---

## The three passes

<!-- phyllum:passes -->

| Pass | Token section | Value shapes | Properties |
|------|---------------|--------------|------------|
| colours | Colours | `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()` | color, background, background-color, border, border-color, border-top-color, border-right-color, border-bottom-color, border-left-color, outline, outline-color, fill, stroke |
| numbers | Numbers | `px`, `rem` | (by role — see below) |
| typography | Typography | font-size + font-weight + line-height in one rule | font, font-size, font-weight, line-height |

The numbers pass does not treat every length alike. A 12px corner radius and a
12px padding are the same number and different facts, so each length carries a
**role**, and naming happens inside a role.

<!-- phyllum:roles -->

| Role | Properties | Applies to | Ladder |
|------|------------|------------|--------|
| radius | border-radius, border-top-left-radius, border-top-right-radius, border-bottom-right-radius, border-bottom-left-radius, rounded, radius, radius-top-left, radius-top-right, radius-bottom-right, radius-bottom-left | corner radius | rounded |
| spacing | padding, padding-top, padding-right, padding-bottom, padding-left, margin, margin-top, margin-right, margin-bottom, margin-left, gap, row-gap, column-gap, p, px, py, pt, pr, pb, pl, m, mt, mr, mb, ml | spacing | spacing |
| border | border, border-width, border-top-width, border-right-width, border-bottom-width, border-left-width, outline-width | border width | border |

Two value shapes are not a single length at all. A shadow is `0 2px 8px
rgba(0,0,0,0.1)` and a border shorthand is `1px solid #E5E7EB`: the meaning is
the whole list, not any part of it, so neither can be read by the scalar path a
role uses. They get a pass each. Both still write into the **Numbers** section,
because a shadow and a border width are lengths with a job — inventing a fourth
token section to hold them would change the shape of every `DESIGN-SYSTEM.md`
for no gain in what the file says.

<!-- phyllum:compounds -->

| Pass | Token section | Properties | Applies to | Ladder | Shorthand keywords |
|------|---------------|------------|------------|--------|--------------------|
| shadows | Numbers | box-shadow, text-shadow, shadow, drop-shadow, elevation | shadow | shadow | — |
| borders | Numbers | border, border-top, border-right, border-bottom, border-left, outline | border | border | solid, dashed, dotted, double, groove, ridge, inset, outset, none, hidden |

The **shorthand keywords** column is the trigger, and it is what keeps one
declaration from being counted twice. `border: 1px solid #E5E7EB` carries a style
keyword, so it is one border sighting; `border-width: 1px` carries none, so it
stays the scalar `border` role above. A pass with no keywords listed — shadows —
reads every declaration on its properties as a compound. How a compound is
normalised and clustered is in `refs/assess.md`, with the rest of the scanning
contract.

The last few spellings in each row are Phyllum's own spec keys rather than CSS
properties. They are here because the same table answers both questions: which
value belongs to which role, and which slot in a component spec a newly named
token is allowed to replace. A `rounded-md` token may fill a `radius`, never a
`padding-top` that happens to be the same number.

A length whose sentence names **no** role opens a follow-up question rather than
a guess — `spacing` is the suggestion, because it is the commonest, but the
question is asked.

---

## Naming scales

Suggestions follow conventions a designer would recognise. Names are proposals,
and rename is one keystroke away — the scale exists so the *common* case needs no
typing at all.

**Colours.** A colour whose job is legible from the colour itself gets a role
name — near-white is a surface, near-black is text, grey is muted. Everything
else is ranked by how many chromatic colours the system already names, so the
first brand colour recorded is `color-primary` and the second is
`color-secondary`. Rows are tested in order and the first match wins; lightness
and saturation are HSL percentages.

<!-- phyllum:colour-names -->

| Name | Lightness | Saturation | Rank |
|------|-----------|------------|------|
| color-surface | >= 90 | <= 20 | — |
| color-text | <= 20 | — | — |
| color-muted | — | <= 15 | — |
| color-primary | — | — | 1 |
| color-secondary | — | — | 2 |
| color-accent | — | — | 3 |
| color-{n} | — | — | 4 |

**Numbers.** Each role has a ladder, and a value is placed on it relative to
what the system already names in that role. A system with no radius at all gets
`rounded-md` — the centre rung, because one radius is neither large nor small. A
value bigger than every radius already named takes the next rung up; one smaller
than all of them takes the next rung down.

<!-- phyllum:ladders -->

| Ladder | Rungs | Centre |
|--------|-------|--------|
| rounded | rounded-xs, rounded-sm, rounded-md, rounded-lg, rounded-xl, rounded-2xl | rounded-md |
| spacing | space-xs, space-sm, space-md, space-lg, space-xl, space-2xl | space-md |
| border | border-hairline, border-sm, border-md, border-lg | border-sm |
| shadow | shadow-xs, shadow-sm, shadow-md, shadow-lg, shadow-xl | shadow-md |

A compound is laid on its ladder by size, the same as a scalar: borders by their
width, shadows by the sum of their lengths. A shadow with a bigger spread is a
bigger shadow, and that is the only ordering a reader would predict.

**Typography.** A name is a role plus a size band: weight decides the role, size
decides the band, and `12px / 700` therefore comes out as `highlight-small` —
the plan's own example. Both tables are tested in order, first match wins.

<!-- phyllum:type-roles -->

| Role | Weight |
|------|--------|
| subtle | <= 300 |
| highlight | >= 600 |
| body | — |

<!-- phyllum:type-bands -->

| Band | Size | Suffix |
|------|------|--------|
| small | <= 12 | -small |
| base | <= 17 | — |
| large | <= 23 | -large |
| display | — | -display |

**Collisions.** A proposed name already taken by a token gets a numeric suffix
(`color-primary-2`). Phyllum never silently reuses a name for a second value,
and never renames a token you already have.

---

## The confirmation

One value means one question, and it is only asked when Phyllum chose the name.
A name that came from your own sentence is not put back to you for approval.

<!-- phyllum:review -->

| Action | Answer | Effect |
|--------|--------|--------|
| confirm | `y`, `yes`, `ok`, `<enter>` | accept the token under the proposed name |
| rename | any other text | accept it under the name you typed instead |
| merge | `merge <name>` | fold this value into that token; no second token is made |
| skip | `n`, `no`, `skip` | write nothing at all this run |

Merging into a name that does not exist is refused rather than guessed at.
After the name is settled there is still the acceptance gate — "write this to
DESIGN-SYSTEM.md?" — and a no there writes nothing.

---

## A value the system already names

If the value in your sentence is already the value of a token, `tokenise` says
which token names it and stops. It does not write a second row, and it does not
rename the one you have — that is your edit to make. Values are compared
normalised: case-folded, whitespace-stripped, `#abc` expanded to `#aabbcc`.

---

## Acceptance — what gets written, and where

On acceptance, and only then:

1. The accepted token is appended to **its own** token subsection, in the
   column order that section's table declares:

   | Section | Columns |
   |---------|---------|
   | Colours | token, value, notes |
   | Numbers | token, value, applies to |
   | Typography | token, size, weight, line-height |

   The `notes` cell records where the token came from — the sentence you typed.
   The `applies to` cell records the role — `corner radius`, `spacing`,
   `border width` — which is what lets a later run tell a radius from a padding.
2. **Backlog reconciliation.** When an accepted token's value matches a
   `TODO: tokenise \`<value>\` (<Component> <property>)` entry, the referencing
   component's spec block is updated — the raw value becomes the token name and
   the `# TODO: tokenise` marker goes — and that Backlog entry is removed.

   Two guards keep that from being over-eager. The property has to be one the
   token's role is about, per the role table above: a `rounded-md` never pays off
   a `padding-top` that happens to be `12px`. And only lines still carrying the
   `# TODO: tokenise` marker are rewritten, so a slot that already names a token
   is left exactly as the user left it.

   Everything else in the Backlog stays. A skipped contract slot is a different
   debt and stays until the slot is filled.
3. The whole file is rendered through the one renderer and written through the
   one funnel — atomically, and to no other path.

Nothing is written before acceptance. The proposal lives in
`.phyllum/session.json` — Phyllum's own state, gitignored — until then.

---

## The codebase-scanning contract lives with `assess`

`tokenise` used to carry the scanning tables too — which files are read, how
Tailwind arbitrary values map to properties, how near two values have to be
before they cluster. They describe reading a codebase, which is `assess`'s job
as of v0.2.0, so they moved with the behaviour: they now live in
`refs/assess.md`, unchanged in meaning.

What stayed here is what a *name* is made of — the passes, the role table, the
colour scale, the ladders, the typography bands — because a name means the same
thing whether the value came out of a sentence or out of the code. One set of
scales, two ways in.

---

## What `tokenise` must never do

- **Read the codebase.** Not one file. A sentence is the whole input; scanning
  is `assess`, and writing to code is `apply`.
- **Rewrite the codebase to use the tokens it names.** The values in the code
  stay exactly as they are.
- Write any file other than `DESIGN-SYSTEM.md` (and Phyllum's own `.phyllum/`).
- Write anything at all before acceptance.
- Invent a value. A sentence with no value gets a question, never a guess.
- Record a value the system has already named, or name one value twice.
- Change a token the user already has. `tokenise` adds; renaming an existing
  token is the user's edit to make.
- Dead-end. Every incomplete sentence has a next question.
