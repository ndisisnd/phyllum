## The component preview (v0.4.1 §4)

Clicking a component in the Library view has always shown its spec and its code.
Since v0.4.1 the panel shows the **component** first: an HTML rendering built
from the recorded spec, with the design system's own token values resolved into
it. The labelled `yaml` and `jsx` blocks stay exactly as they were, beneath it.

### Spec-projection, not code execution

The component entry holds two blocks: a YAML spec and a generated React + CSS
block. The preview renders from the **spec**, and never by executing the code.
Three reasons, and all three are rules the dashboard already lives by:

- **The code block is React source.** Running it in the page needs a JSX
  transform — a dependency, a build step, or a CDN fetch. All three are on the
  page's never-list, and no sandboxed-iframe-with-scripts buys its way past
  that.
- **It is content out of a file a person hand-edits.** The gate that keeps a
  hand-edited colour value out of a `style` attribute applies with more force to
  a script.
- **The spec is the recorded truth anyway.** "The dashboard shows the file." A
  mechanical projection of `properties` and `states` shows exactly what is
  recorded, *including what is not*: a `TODO` slot renders as a visible gap, not
  as a guess.

### Where the slots come from

The page parses no YAML. `GET /system` carries each component's spec **twice**:
`spec`, the block as the file spells it, and the parsed slots — `archetype`,
`custom`, `properties`, `states` — read by `parseSpecBlock`, the same reader
`create`, `update` and `assess` use. One parser, one truth, and no second
implementation of the file's strictest block living in a browser. No new server
route: `/system` already answered with every component, and it now answers with
the same components carrying their slots.

Since v0.5.0 the same payload carries `applied` — `true`, `false`, or `null` when
the file has no flag at all. It is read by the same parser and is never derived in
the page: the dashboard shows the file.

### The `applied` badge (v0.5.0 §3.4)

<!-- phyllum:applied-badge -->

| `applied` | Component list | Preview panel heading |
|-----------|----------------|-----------------------|
| `true` | the name, then a chip reading `applied` | the same chip, beside the component's name |
| `false` | the name alone | the name alone |
| absent (no flag yet) | the name alone | the name alone |

The badge is the page's existing chip — no new shape, no new colour, and the
quietest colour the page already uses, because a reading of the codebase is
neither a warning nor a highlight. It is drawn for `true` alone: `false` and "no
flag yet" are both *no evidence of adoption*, and neither earns a badge saying
there is some. The two readings are told apart in `phyllum display`, where there
is room for a sentence; a badge only has room to be right.

### One element per archetype

The preview draws **one** element, named by the "preview element" column of the
`phyllum:contracts` table in `refs/create/archetypes.md` — a `button` for
`button`, an `input` for the field archetypes, and so on. A `custom` component
has no contract and therefore no row: it is drawn as a generic `div` from
whatever slots it happens to carry, with the same honesty about the rest.

The element is drawn inert. A `select` would open a list and a link would
navigate, so both are drawn as boxes. The page lends the element three things
and no more — the inherited type stack, a 1px transparent edge for a recorded
border colour to paint, and the stage it sits on. Everything else it wears comes
from its own spec, inline.

### The projection map

Each recorded property projects into named declarations, and only after its
value passes the shape gate for that row. A row with no declaration is a slot
this preview cannot draw on one element — a thumb, an indicator or a scrim is a
second box — and it is listed as unrendered rather than approximated.

<!-- phyllum:preview-projection -->

| Property | Declarations | Shape |
|----------|--------------|-------|
| background | `background` | fill |
| text-colour | `color` | colour |
| border-colour | `border-color` | colour |
| border-width | `border-width` | length |
| radius | `border-radius` | lengths |
| radius-top-left | `border-top-left-radius` | length |
| radius-top-right | `border-top-right-radius` | length |
| radius-bottom-right | `border-bottom-right-radius` | length |
| radius-bottom-left | `border-bottom-left-radius` | length |
| padding | `padding` | lengths |
| padding-top | `padding-top` | length |
| padding-bottom | `padding-bottom` | length |
| padding-left | `padding-left` | length |
| padding-right | `padding-right` | length |
| font | `font-size`, `font-weight`, `line-height` | typography |
| font-size | `font-size` | length |
| font-weight | `font-weight` | weight |
| line-height | `line-height` | leading |
| shadow | `box-shadow` | shadow |
| gap | `gap` | length |
| size | `width`, `height` | length |
| track-colour | `background` | fill |
| overlay-colour | — | colour |
| focus-ring | — | colour |
| thumb-colour | — | colour |
| indicator-colour | — | colour |

This map is the `PREVIEW.projection` constant inside the page's region marked
`phyllum:preview-contract`, and the assertion suite reads both the table and the
constant, so the two cannot drift.

### The gate — the colour cards' rule, widened

A value reaches a `style` attribute only when the page can classify its shape.
That is the rule the colour cards have followed since v0.4.0 §5.1, applied to
every property rather than to fills alone, and it runs in two halves.

**The hard half** refuses a value whatever shape it otherwise wears: anything
carrying `;`, a quote, a backslash, `<`, `>`, `{`, `}`, a `/*` comment, or a
`url(`, `expression(`, `image-set(`, `attr(` or `element(` call. Those are the
shapes that end a declaration, close the attribute, or open a request.

**The shape half** is one gate per row of the map above:

<!-- phyllum:preview-shapes -->

| Shape | What passes |
|-------|-------------|
| fill | a hex colour, one of the six gradient functions, `transparent` or `currentColor` |
| colour | a hex colour, `transparent` or `currentColor` — a gradient is not an ink |
| length | `0`, or a number with `px`, `rem`, `em`, `pt` or `%` |
| lengths | one to four lengths, space-separated — the `12px 16px` shorthand |
| weight | `100`–`900`, `normal`, `bold`, `lighter`, `bolder` |
| leading | `normal`, or a number with an optional length unit |
| shadow | two to four lengths and one colour, optionally `inset`; a stack of shadows is not read |
| typography | a typography token name, never a written reading — `14px / 600 / 1.4` in a spec is prose |

### Unrendered slots — the honesty line

A slot that produces no declaration is printed under the preview as an
**unrendered slot**, with the reason. Nothing is substituted, softened or
guessed: a preview that silently invented a background would break the
no-invented-values rule in the one place a user would believe it.

<!-- phyllum:preview-unrendered -->

| Reason | When it is printed |
|--------|--------------------|
| `TODO` | the slot is recorded as `TODO`, or recorded empty |
| `unresolved` | a token name no token table holds, or a value the shape gate refused |
| `no preview element` | the property has no single-element projection, or none this page knows |

### The variant toggle

Component names are `Archetype/Variant`. The Library groups entries sharing a
base name — the part before the last `/` — and the preview panel for any member
shows a toggle row, one button per variant, the clicked one active. It swaps the
rendered spec in place without leaving the panel. **A component with no variant
siblings shows no toggle at all**, because a picker with one option is a label
wearing a button's clothes.

### The states toggle

The same mechanism, one layer up. A spec's `states:` block records a reading per
state, and the second toggle row picks between `default` and each recorded
state. A state's slots **overlay** the base properties: `hover` reads as the
component with its hover slots applied, not as a second component. A state
recorded as a bare word (`disabled: TODO`) is not a slot map, so it changes no
declaration and says so in the unrendered list. Switching variant returns the
state toggle to `default`, since the sibling records its own states.

A spec may record a state under the name `default`, which is the name the base
reading already carries. That is **one** option on the toggle, not two, and the
recorded state is overlaid like any other — the file says what `default` looks
like, and the dashboard shows the file. An option offered twice is a picker
nobody can read, and the copy that did nothing was the one the file recorded.

### Placement and treatment

The preview and its toggle rows are the panel's **first** section. The labelled
`yaml` and `jsx` blocks follow, unchanged — the panel gained a section, it did
not lose one.

| Element | Treatment |
|---------|-----------|
| Stage | the page's tile idiom: the `--bg` layer, a `--line` hairline, sharp corners |
| Toggle buttons | the existing `.tile-action` button, `aria-selected` marking the active one |
| Unrendered list | the existing raw-value chip, in the muted ink at the smallest type step |

No new colour, no new font, no new size outside the five-step ramp, and no
rounded corner: the colour-card swatch remains the page's one recorded
departure from sharp corners.
