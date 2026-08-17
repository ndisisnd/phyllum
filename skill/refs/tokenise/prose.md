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
