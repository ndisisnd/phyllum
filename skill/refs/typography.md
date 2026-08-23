# Typography — the twenty-one readings a type token carries

A shared vocabulary for what a typography token *records*, and the CSS each
recording becomes. This file is a **library, not a command**: nothing here runs,
and no command changes behaviour by loading it. Other reference files borrow
from it — the prose reader in `refs/tokenise/passes.md`, the generated code, the
codebase scan in `refs/assess/map.md`, and the specimen the GUI draws.

"Library" means **data Phyllum ships**, never an npm package. Phyllum has zero
dependencies and this file is why that stays true: the contract is two Markdown
tables, parsed at run time by `lib/typography.js`, read by the assertion suite
from the same rows. There is no second copy of these readings in the code.

Two standing rules apply to everything below:

- **Never invent a reading.** A reading the user did not state is *absent*, and
  absent means "not decided". It never means a default, and no reading is ever
  filled in from a neighbouring token.
- **Never correct a value.** Phyllum governs *which* readings exist, never what
  goes in them. A kerning of `0.42em`, a face nobody has installed, a
  feature-settings string with quotes and commas in it: record it exactly as
  given.

---

## The twenty-one readings

A typography token records three readings today — size, weight and line-height —
and those three stay **mandatory**. They are the four-column Typography table's
own columns, so they are recorded there and nowhere else.

The other eighteen are **optional**. A token that records none of them has no
YAML block at all, which is what keeps every design system written before
v0.7.3 byte-identical.

`Kind` decides how a reading is gathered.

- **bare** carries no value. It is read straight out of a sentence keyword, and
  it is written into the block as `<reading>: true`. That is the only spelling
  a bare reading has.
- **enum** takes one word. The words the CSS declaration lists are the ones
  Phyllum suggests; the word the user gives is the word that is recorded.
- **value** takes a measurement or a string, and is asked for in the follow-up.

`CSS declaration` is read two ways. A cell holding only a property name means
the recorded value is the declaration's value. A cell holding `property: value`
means the reading *is* that whole declaration, which is what a bare reading is.
A `/` separates the alternative values of one property, so
`font-style: italic` / `oblique` is one property with two words.

<!-- phyllum:type-readings -->

| Reading | Kind | CSS declaration |
|---|---|---|
| size | value | `font-size` |
| weight | value | `font-weight` |
| line-height | value | `line-height` |
| kerning | value | `letter-spacing` |
| underline | bare | `text-decoration-line: underline` |
| strikethrough | bare | `text-decoration-line: line-through` |
| superscript | bare | `font-variant-position: super` |
| subscript | bare | `font-variant-position: sub` |
| word-spacing | value | `word-spacing` |
| text-indent | value | `text-indent` |
| measure | value | `max-width` |
| text-transform | enum | `text-transform` |
| font-variant | value | `font-variant` |
| small-caps | bare | `font-variant-caps: small-caps` |
| slashed-or-lining-zero | enum | `font-variant-numeric: slashed-zero` / `lining-nums` |
| font-family | value | `font-family` |
| font-stretch | value | `font-stretch` |
| italic-or-oblique | enum | `font-style: italic` / `oblique` |
| font-feature-settings | value | `font-feature-settings` |
| font-optical-sizing | enum | `font-optical-sizing` |
| text-rendering | enum | `text-rendering` |

Five readings are bare, five are enums, eleven take a value. The order of the
rows is the order declarations are emitted in, so two tokens recording the same
readings generate the same CSS in the same sequence.

A reading outside this table is **refused with a reason**, the way every other
shipped table refuses a word it does not hold. It is never recorded silently and
the block it was written in is never edited: the line stays exactly where the
user put it and Phyllum says why it read nothing from it.

## The three conflict rules

Twenty-one readings do not map onto twenty-one properties. Three rows collide,
and each collision has one settled answer.

**Two readings can share one declaration.** `underline` and `strikethrough` both
write `text-decoration-line`. A token recording both emits **one** declaration
carrying both keywords — `underline line-through`, in the order the readings
table declares them — rather than two declarations where the second silently
overwrites the first.

**Two readings can contradict.** `superscript` and `subscript` both write
`font-variant-position`, and no value of that property means both. A token
recording both is a **conflict**: neither is dropped, neither wins by default,
and Phyllum asks.

**A shorthand can swallow a longhand.** `font-variant` is the shorthand over
`font-variant-caps` and `font-variant-numeric`, so it reaches what `small-caps`
and `slashed-or-lining-zero` reach. A token recording the shorthand alongside
either longhand is an **overlap**: Phyllum says which reading covers which, and
asks.

Every conflict takes the same route, and it is the route a near-duplicate token
takes too: **warn and ask, never refuse**. Phyllum shows what it read, says why
the readings collide, and asks what to do. Nothing is auto-resolved, nothing is
silently dropped, and the never-correct rule is untouched.

In the table below, `readings` lists the colliding readings in the order they
matter. For an `overlap` the **first** reading is the shorthand and the rest are
the longhands it reaches; for a `shared` the order is the order the merged
keywords are written in.

<!-- phyllum:type-conflicts -->

| Rule | Kind | Readings | Declaration | Outcome |
|---|---|---|---|---|
| decoration | shared | `underline`, `strikethrough` | `text-decoration-line` | merge into one declaration, keywords in the listed order |
| position | contradiction | `superscript`, `subscript` | `font-variant-position` | ask — neither is dropped and neither wins |
| variant | overlap | `font-variant`, `small-caps`, `slashed-or-lining-zero` | `font-variant` | ask — the first reading is the shorthand over the rest |

## Where the readings live in the file

The Typography table keeps its four columns — `token | size | weight |
line-height` — and nothing about an existing row changes meaning. The optional
readings live in a fenced YAML block per token, which is also what keeps a value
carrying commas, quotes or brackets safe: a Markdown cell cannot hold one
without being escaped, and an escaped value is a corrected value.

The placement rules are exact, because a parser and a person have to agree on
where a block is:

- Blocks sit **directly beneath the Typography table**, before `## Components`.
- One block per token, under a `#### <token>` heading.
- Blocks appear in the **table's own row order**, so the file reads top to
  bottom the way the table does.
- A token with no optional readings gets **no block at all**. It is not an empty
  block and not a block of comments.

````
### Typography

| token | size | weight | line-height |
| --- | --- | --- | --- |
| highlight-small | 12px | 700 | 1.3 |

#### highlight-small

```yaml
underline: true
kerning: 0.02em
font-family: "Inter", system-ui, sans-serif
```
````

Two rules keep the block tolerant rather than destructive, and both are the
rules the rest of the file already follows:

- **A block naming a token the Typography table does not hold is preserved
  byte-identical and reported.** Nothing is ever pruned. A token may be renamed
  or a table row hand-edited, and the readings someone wrote are not Phyllum's
  to throw away.
- **Two blocks under one token name yield no reading at all**, and the report
  says the name does not identify one block — the same answer a component name
  carried by two `### <name>` entries already gets (`refs/delete/flow.md`).
  Reading from one block and writing to the other is the failure that rule
  exists to prevent.
