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
