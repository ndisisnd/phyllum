# `tokenise` (alias: `tokenize`)

Turn **a sentence** into named tokens. One value, one name, one row in
`DESIGN-SYSTEM.md` — and a sentence may carry several values, each of which gets
its own turn through the same protocol:

```
phyllum tokenise "our brand blue #2563EB"
phyllum tokenise "our overlay rgba(0, 0, 0, 0.5)"
phyllum tokenise "hero backdrop linear-gradient(135deg, #2563EB, #10B981)"
phyllum tokenise "16px spacing called space-md"
phyllum tokenise "heading 24px bold 1.2"
phyllum tokenise "#2563EB #10B981 #F59E0B"
phyllum tokenise "heading 24px bold 1.2, body 16px regular 1.5"
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
  `rgba(37, 99, 235, 0.5)`, `rgb(37, 99, 235)`, `hsl(217, 91%, 60%)`,
  `linear-gradient(135deg, #2563EB, #10B981)`), a
  length (`12px`, `1rem`), or a
  typography reading (a size, optionally a weight and a line-height). A sentence
  may hold several; each one is read the same way and queued in turn.
- **The name** — if the sentence gives one, it is used verbatim. If it doesn't,
  Phyllum suggests one — from the nomenclature library where the sentence says
  what the colour is *for*, and from the naming scales below otherwise — and
  asks you to confirm.

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

## Several values in one sentence

A sentence may carry more than one value. Nothing about *naming* changes when it
does: every recognised value becomes one entry in a **proposal queue**, and each
entry runs the protocol a single-value sentence has always run — pass detection,
the naming scales, the already-named check, collision suffixing, the four-answer
confirmation, and the acceptance gate. The intake reads further; the protocol is
untouched.

The queue is asked about one entry at a time. A wall of questions is not a batch
mode, it is a form, and a form is the thing this command exists not to be.

<!-- phyllum:queue -->

| Rule | Setting | Reading |
|------|---------|---------|
| order | `sentence` | entries are settled in the order the sentence mentions them, left to right |
| duplicates | `collapse` | two mentions of one value are one entry — the first mention keeps its place, and a name carried by a later mention fills a survivor that has none |
| questions | `one` | one entry is settled before the next is raised |
| skip | `entry` | a skip writes nothing **for that entry** and the queue moves on |
| resume | `.phyllum/session.json` | the whole queue is held in the session file, so an interrupted run picks up where it stood |

Duplicates are compared the way the already-named check compares them:
case-folded, whitespace-stripped, `#abc` expanded to `#aabbcc`, a colour by its
channels whatever format it is written in, and a length only against a length in
the same role. So "our brand blue #2563EB and rgba(37, 99, 235, 1) again" is one
entry, not two. Convergence applies *inside* a run as well as between runs.

Ordering is not decoration. The ranked colour scale counts what the system
already names, and a token accepted earlier in the same run is something the
system already names — so the first colour in the sentence ranks ahead of the
second, exactly as two separate runs would have ranked them.

### Where one typography reading ends and the next begins

Colours and lengths are self-delimiting: a colour shape is a colour shape. A
typography reading is not — it is a size, a weight and a line-height scattered
across a clause — so the sentence has to be cut into readings before it can be
read at all.

<!-- phyllum:reading-splits -->

| Splitter | Written as | Opens a reading |
|----------|------------|-----------------|
| `role-word` | — | yes |
| `comma` | `,` | yes |
| `semicolon` | `;` | yes |
| `and` | `and` | yes |
| `slash` | `/` | no |

The em dash on the first row means "not a literal": the role words are the
`typography` row of the prose table above (`heading`, `body`, `title`,
`caption`, …), so adding a role word there adds a splitter here and nowhere else.

The slash is on the table precisely because it does **not** split: `16px/1.5` is
the CSS shorthand for one reading, and a delimiter set that says nothing about it
is a delimiter set with a hole in it. Nothing else splits — a full stop, a colon
and a dash all read as part of the clause they sit in.

<!-- phyllum:binding -->

| Fragment | Binds to | Direction |
|----------|----------|-----------|
| `reading` | the nearest typography reading on its left | left |
| `name` | the nearest value on its left | left |
| `stranded` | the first reading or value on its right, when it has none on its left | right |
| `restatement` | nothing — the first statement of a slot stands | — |

**A stranded weight word binds left.** "heading 24px, semibold" is a heading that
is semibold, not a semibold `body` still to come: a clause is read left to right
and a value is stated after the thing it describes. The one exception is a
fragment with nothing at all on its left — "bold heading 24px" — which binds
right, because there is no reading behind it to belong to. A fragment that would
fill a slot the reading already states changes nothing: the first statement
stands, and `tokenise` never overwrites a value the sentence already gave.

Everything the single-reading case does still happens per reading. The CSS
initial values — weight `400`, line-height `normal` — fill each reading's own
gaps, and each reading shows its own filled-in list on its own proposal.

**Names bind left too.** "#2563EB called brand-blue and #10B981 called
success-green" names both values, because each name is nearer to its own colour
than to the other. A name written ahead of every value — "brand-blue #2563EB" —
is the stranded case and binds right, to the first value it introduces. A
sentence with three values and one name leaves the other two to the naming
scales, exactly as it does today.

---

## The three passes

<!-- phyllum:passes -->

| Pass | Token section | Value shapes | Properties |
|------|---------------|--------------|------------|
| colours | Colours | `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, `linear-gradient()`, `radial-gradient()`, `conic-gradient()`, `repeating-linear-gradient()`, `repeating-radial-gradient()`, `repeating-conic-gradient()` | color, background, background-color, border, border-color, border-top-color, border-right-color, border-bottom-color, border-left-color, outline, outline-color, fill, stroke |
| numbers | Numbers | `px`, `rem` | (by role — see below) |
| typography | Typography | font-size + font-weight + line-height in one rule | font, font-size, font-weight, line-height |

**Alpha is recorded, never edited.** A `#rrggbbaa` hex and an `rgba()` alpha
survive into the written row exactly as typed — Phyllum does not drop the alpha,
round it, or rewrite the colour into another format. The naming scale reads the
colour *underneath* the alpha: lightness and saturation come from the red, green
and blue channels alone, so `rgba(0, 0, 0, 0.5)` is named as the black it is.
Alpha is still part of what makes two colours the same colour — see the
already-named section below.

**A gradient is one colour value.** The six gradient shapes on the colours row —
`linear-gradient()`, `radial-gradient()`, `conic-gradient()` and their
`repeating-` forms — are read the way every other colour shape is read, in the
picker's gradient branch and in any sentence that carries one. Three rules make
that whole:

- **Never split.** The brackets and commas inside a gradient are punctuation,
  not delimiters. `linear-gradient(135deg, #2563EB, #10B981)` is one entry in a
  batch sentence, exactly as `rgb(37, 99, 235)` is — the same masking rule, and
  the words inside a gradient (`to`, `right`, `linear-gradient` itself) are not
  read as role words or as names.
- **Recorded verbatim.** The whole function is the value: stops, angle and
  percentages exactly as typed. Phyllum never reorders stops or normalises an
  angle, for the reason it never edits a shadow — the meaning is the whole list.
- **Writes into Colours**, as an ordinary `token | value` row. A gradient is a
  colour decision, and a fourth token section would change the shape of every
  `DESIGN-SYSTEM.md` for no gain in what the file says.

What a gradient does **not** reach is as much of the contract as what it does:

- **Duplicate detection stays string-level** — case-folded and
  whitespace-stripped, per the `other` row of the comparison table below. Two
  gradients with reordered stops are two facts, not one; channel comparison is
  for single colours.
- **`create primitives` skips it.** `toHsl` cannot read a gradient, so the row
  is not a ramp candidate — reported as skipped, never refused loudly.
- **`assess` does not scan code for gradients.** Its compound story is shadows
  and borders.
- **Backlog reconciliation** pays off a `TODO: tokenise` entry for a gradient
  only on an exact value match and a colour-role property, per the standing
  guards.

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

**Where a colour name comes from.** Two sources, in a fixed order. The
nomenclature library (`refs/nomenclature.md`) is the **semantic** layer — it
names a colour by the job the sentence says it does — and it **supersedes** the
`color-primary` scale as the default suggestion. The scale below is the
**fallback**, for a colour whose sentence signals nothing the vocabulary covers.

<!-- phyllum:name-source -->

| Source | Applies to | When | Falls back to |
|--------|------------|------|---------------|
| `nomenclature` | colours | the sentence signals a family word the library knows, and that family still has an unused rank | `scale` |
| `scale` | colours, numbers, typography | always — the ranked colour scale, the number ladders and the typography bands below | — |

The library is consulted for **colours only**. Its families are colour roles;
a length and a type reading have their own scales below and no semantic layer to
read them against.

A family is the anchor, because `family` and `rank` are the library's two
mandatory slots and a rank alone names nothing — "our main blue" signals `main`
and no family, so it falls to the scale. When the sentence signals a family but
no rank, the rank is read off how many colours that family already names: the
first `danger` colour is `danger-primary`, the second `danger-secondary`, the
third `danger-tertiary`, and a fourth falls to the scale rather than inventing a
fourth rank word. Exception and state words are added when the sentence says
them and never otherwise — the library defines what a state *may* be called and
never generates one unasked.

<!-- phyllum:role-signals -->

| Words | Slot | Word |
|-------|------|------|
| `neutral`, `grey`, `gray`, `greyscale`, `grayscale` | family | `neutral` |
| `interactive`, `interaction`, `clickable`, `link`, `cta` | family | `interaction` |
| `accent`, `highlighting` | family | `accent` |
| `surface`, `canvas`, `sheet`, `page` | family | `surface` |
| `success`, `positive`, `confirmation` | family | `success` |
| `warning`, `caution`, `warn` | family | `warning` |
| `danger`, `destructive`, `error`, `critical`, `negative` | family | `danger` |
| `info`, `informational`, `information` | family | `info` |
| `main`, `primary`, `principal` | rank | `primary` |
| `secondary`, `supporting` | rank | `secondary` |
| `tertiary` | rank | `tertiary` |
| `lighter`, `tint` | exception | `lighter` |
| `darker`, `shade` | exception | `darker` |
| `subtle`, `subdued`, `muted` | exception | `subtle` |
| `inverse`, `inverted` | exception | `inverse` |
| `hover`, `hovered` | state | `hover` |
| `pressed`, `press` | state | `pressed` |
| `focused`, `focus` | state | `focused` |
| `selected` | state | `selected` |
| `disabled` | state | `disabled` |
| `inactive` | state | `inactive` |

The left column is what a person types; the right column is the one spelling the
library ships, so `hovered` and `hover` both propose `hover` and the vocabulary
stays one vocabulary. Words that already mean something else to the reader are
deliberately absent: `bold` and `light` are weight words in the table above, and
a word cannot mean two things in one sentence.

A name is still only a proposal, whichever source it came from, and rename is
still one keystroke away. Nothing here renames a token anybody already has.

**The colour scale (fallback).** A colour whose job is legible from the colour
itself gets a role name — near-white is a surface, near-black is text, grey is
muted. Everything else is ranked by how many chromatic colours the system already
names, so the first brand colour recorded is `color-primary` and the second is
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

**Gradients.** The lightness/saturation scale cannot read a gradient — `toHsl`
returns null for one, rightly — so a gradient is named off its own one-row
scale, and a gradient row is not counted as a chromatic colour by the scale
above. Ranking is by count: the first gradient the system names is `gradient-1`,
the second `gradient-2`.

<!-- phyllum:gradient-names -->

| Name | Rank | Mark |
|------|------|------|
| gradient-{n} | — | gradient |

Three readings come out of that table, and the `Mark` column is what ties them
together:

- **Every name Phyllum proposes for a gradient carries the mark word.** A reader
  tells a gradient token from a solid one by name alone. Your own name is still
  yours and still verbatim — Phyllum proposes, it does not correct.
- **The fallback leads with it.** `gradient-{n}` already starts with the mark, so
  the count scale satisfies the rule for free. Rows are read as the colour scale's
  are: a row with a rank number claims that rank, and a row spelling `{n}` takes
  every count above them.
- **A library name takes it as a final suffix** — "our danger gradient" is
  `danger-primary-gradient`. **Decided (2026-08-16): the mark is always the last
  part of the name**, after every slot the library filled, so
  `danger-primary-hover-gradient` and not `danger-gradient-primary-hover`. The
  mark is a shape mark rather than a slot, and one fixed position means its place
  never depends on which optional slots a sentence happened to signal. The
  library's own slot tables (`refs/nomenclature.md`) are untouched by this: a
  marked name is a well-formed library name with one word appended.

**Decided (2026-08-16): the gradient scale is its own table** —
`phyllum:gradient-names` — rather than a shape column bolted onto
`phyllum:colour-names`. Every row of the colour scale is a lightness and a
saturation test, and a gradient has neither; a shape column would put a row in
that table that the table's own comparators cannot judge, and would make every
existing row answer a question it was not written to answer. One table, one kind
of judgement, is the shape the rest of the spec reader already parses.

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

One queue entry means one question, and it is only asked when Phyllum chose the
name. A name that came from your own sentence is not put back to you for
approval. Several entries mean several questions, asked one after another — each
one settled, and written or not written, before the next is raised.

<!-- phyllum:review -->

| Action | Answer | Effect |
|--------|--------|--------|
| confirm | `y`, `yes`, `ok`, `<enter>` | accept the token under the proposed name |
| rename | any other text | accept it under the name you typed instead |
| merge | `merge <name>` | fold this value into that token; no second token is made |
| skip | `n`, `no`, `skip` | write nothing at all this run |

Merging into a name that does not exist is refused rather than guessed at.
After the name is settled there is still the acceptance gate — "write this to
DESIGN-SYSTEM.md?" — and a no there writes nothing. In a queue, a `skip` and a
no at the gate both mean the same thing and mean it locally: nothing is written
for *that* entry, and the next entry is raised as if it had never been asked.

---

## A value the system already names

If the value in your sentence is already the value of a token, `tokenise` says
which token names it and stops. It does not write a second row, and it does not
rename the one you have — that is your edit to make. Values are compared
normalised: case-folded, whitespace-stripped, `#abc` expanded to `#aabbcc`.

**A colour is compared by its channels, not by its spelling.** Any colour shape
the passes table lists is read into one canonical comparison form before it is
compared:

<!-- phyllum:value-comparison -->

| Shape | Written as | Compared as |
|-------|------------|-------------|
| hex | `#rgb`, `#rrggbb`, `#rgba`, `#rrggbbaa` | channels |
| rgb | `rgb()`, `rgba()` | channels |
| hsl | `hsl()`, `hsla()` | channels |
| other | anything else — a length, a compound, a gradient, a value Phyllum cannot read | string |

**channels** is `rgba(r,g,b,a)`: red, green and blue as integers 0–255 and alpha
as a number 0–1, which is the one spelling every colour shape above can be
written in. **string** is the normalised string described just above. So `rgba(37, 99, 235)` is the `#2563EB` the system already names, in either
direction, and a sentence carrying both spells one colour and gets one queue
entry.

Three rules keep that honest:

- **Alpha counts.** `rgba(0, 0, 0, 0.5)` and `rgba(0, 0, 0, 0.9)` are different
  facts and get different tokens. A colour that writes no alpha is fully opaque,
  so `#2563EB`, `#2563EBFF` and `rgba(37, 99, 235, 1)` are one colour.
- **No tolerance.** Two spellings either land on the same channels or they do
  not. Colours that are merely *near* each other are the clustering table's
  business (`refs/assess.md`), and a tolerance here would collapse two colours a
  reader can tell apart into one name.
- **Comparison only.** The value written into `DESIGN-SYSTEM.md` is byte for
  byte what you typed, in the format you typed it. Phyllum never converts a
  value it records.

---

## Acceptance — what gets written, and where

On acceptance, and only then:

1. The accepted token is appended to **its own** token subsection, in the
   column order that section's table declares:

   | Section | Columns |
   |---------|---------|
   | Colours | token, value |
   | Numbers | token, value, applies to |
   | Typography | token, size, weight, line-height |

   Colours is `token | value` as of v0.3.0 (§5.5). It used to carry a third
   `notes` cell recording the sentence you typed — provenance, which is history
   rather than design system, so it went. A file written before that keeps the
   column it has: the renderer writes back the shape it found, and `init` offers
   the one-time removal rather than taking it.

   The `applies to` cell records the role — `corner radius`, `spacing`,
   `border width` — which is what lets a later run tell a radius from a padding.

   Colours has one subsection, `Primitives`, holding the ramps
   `create primitives` writes (`refs/create.md`). `tokenise` never writes into
   it: a named value is a semantic token and goes in the Colours table itself.
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
   one funnel — atomically, and to no other path. One accepted token is one
   write; a queue of five acceptances is five writes through that same funnel,
   and `DESIGN-SYSTEM.md.bak` is taken **once, before the first write of the
   run**, so the undo it holds is the file as it stood before the whole
   sentence, not before its last value.

Nothing is written before acceptance. The queue — every entry, settled or still
pending — lives in `.phyllum/session.json`, Phyllum's own state, gitignored,
until then. That is also what makes a queue resumable: a run cut short leaves
its pending entries recorded, and the next `tokenise` with nothing to read
offers to pick them up.

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
