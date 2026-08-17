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
normalised and clustered is in `refs/assess/scan.md`, with the rest of the scanning
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
