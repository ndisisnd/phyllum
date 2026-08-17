## Showing the values (v0.3.0 §6.5)

A design system read as a table of hex strings is a list you have to imagine.
The Library view renders each token in the thing it describes:

| Section | Rendering |
|---------|-----------|
| Colours | one **card** per token — a filled, rounded swatch, with the token name and then its value printed *beneath* the swatch (v0.4.0 §5.5, below) |
| Colours — Primitives | **swatches** in **ramp strips**: one strip per base name, its steps side by side in file order, each step's label sitting on the swatch itself |
| Numbers | a **measured bar** per token, its length proportional to the largest number in the section; a value with no leading number reads as an empty track |
| Typography | a **live specimen** per token, set in that token's own size, weight and line-height |

Two rules decide how a swatch is drawn, and both are numbers rather than
judgement calls. `luminance` below is WCAG 2.x relative luminance, `0` for
black and `1` for white:

<!-- phyllum:swatches -->

| rule | value | meaning |
|------|-------|---------|
| near-white | `>= 0.85` | a colour this light vanishes against the page, so the swatch takes the **bordered** variant instead of relying on its fill |
| dark ink | `>= 0.5` | at or above this the name and value are set in dark ink (`#161616`); below it, light (`#ffffff`) |
| ramp steps | `9` | a primitives ramp strip is nine steps wide, `100`–`900` |

A value that is not a hex colour at all still renders as a swatch — bordered
and unfilled — because the dashboard shows the file, never an edit of it.

These numbers live in one place in the page (`SWATCH`, inside the region marked
`phyllum:swatch-contract`), and the assertion suite reads both this table and
that region so the two cannot drift.

## Colour cards in a grid (v0.4.0 §5.5)

A semantic colour token is a **card**, not a labelled block of colour. The name
and the value are printed beneath the fill rather than on it, so nothing has to
stay legible against an arbitrary background, and the cards wrap to the viewport
instead of stacking one to a row.

**Card anatomy — three nodes, in this order:**

1. **the swatch** — a filled block with rounded corners, carrying the token's
   own value as its `background`;
2. **the name** — the token, in the page's own ink;
3. **the value** — on its own line, in the mono face, in the muted ink.

The container is one `article.card` per token, carrying `data-token` and
`data-value`, holding `.card__swatch`, then `.card__name`, then `.card__value`.
Cards sit in one `.cards` grid container; the grid wraps, so the column count
follows the viewport width and never the token count.

The **near-white rule above still applies**: a fill at or over the near-white
luminance takes the bordered variant (`card--bordered`), because a white swatch
on a white layer still needs an edge. A value the page cannot read as a colour
is bordered and unfilled, as ever. The dark-ink rule no longer decides anything
on a card — the label is off the fill — and stays in force for ramp strips,
where the label is still on the swatch.

**Primitive ramps are not cards.** The nine-step strips (v0.3.0) stay exactly as
they are: a ramp reads as one thing, and cutting it into nine cards would lose
that. The card grid is the semantic Colours table only.

<!-- phyllum:cards -->

| dimension | value | meaning |
|-----------|-------|---------|
| swatch radius | `0.5rem` | the rounded corner on the swatch — the one recorded departure from the sharp-cornered Carbon direction |
| card min width | `13rem` | the narrowest a card gets before the grid drops a column |
| card max width | `20rem` | the widest one card grows to, so a wide viewport gains columns rather than billboards |
| grid gap | `1rem` | the space between cards, in the page's existing spacing scale |
| swatch height | `7rem` | the height of the fill itself, unchanged from the v0.3.0 swatch |

These are CSS custom properties (`--card-radius`, `--card-min`, `--card-max`,
`--card-gap`, `--card-swatch-height`) *and* entries in the page's `CARD`
constant, inside the same marked contract region; the assertion suite reads this
table, the constant and the stylesheet, so all three move together or not at
all.

**Colour style follows the page.** Card chrome — text colours, spacing,
background — is the dashboard's existing palette and type ramp. No font changes,
no new sizes outside the five-step ramp. The rounded swatch corner is the single
deliberate departure from "sharp corners everywhere"; every other element keeps
its square corner.

### Gradients in a card (v0.4.0 §5.1)

A gradient token is an ordinary Colours row, so it is an ordinary card. The
answer to the open question is **no: the swatch needs nothing beyond
`background: <value>`** — the browser paints a CSS gradient for free, at any
size, with no second element and no fallback layer.

Two consequences worth stating as contract:

- **The value is still gated before it is inlined.** `DESIGN-SYSTEM.md` is a
  file a person edits, so a value only reaches a `style` attribute when the page
  recognises its shape — a hex colour, or one of the gradient functions
  (`linear-gradient`, `radial-gradient`, `conic-gradient` and their
  `repeating-` forms) with no `;`, quote, comment or `url(` in it. Anything else
  renders bordered and unfilled, exactly as `var(--brand)` does today.
- **A gradient is never near-white.** It has no single luminance, so it takes
  the plain variant, and its label reads off the fill like every other card's.
