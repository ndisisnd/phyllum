## Archetype contracts — rules on WHICH properties, never on WHAT values

Each archetype maps to a contract: the mandatory property slots a component of
that kind must define, each slot expecting a token value. The contract is what
turns "a button" into a checklist:

> the user asked for a button → resolve to `Button/Primary` → primary buttons
> **must** define background colour, border colour, corner radius and
> typography, plus hover and disabled states.

<!-- phyllum:contracts -->

| Archetype | Aliases | Mandatory slots | States | Preview element |
|-----------|---------|-----------------|--------|-----------------|
| Button | button, btn, cta, action | `background`, `text-colour`, `border-colour`, `radius`, `typography`, `padding` | `hover`, `disabled` | `button` |
| Input | input, textfield, text field, field, textbox | `background`, `text-colour`, `border-colour`, `radius`, `typography`, `padding` | `focus`, `disabled`, `error` | `input` |
| Card | card, tile, panel | `background`, `border-colour`, `radius`, `padding`, `shadow` | — | `div` |
| Badge | badge, chip, pill, tag, label | `background`, `text-colour`, `radius`, `typography`, `padding` | — | `span` |
| Modal | modal, dialog, dialogue, sheet, drawer | `background`, `radius`, `padding`, `shadow`, `overlay-colour` | — | `div` |
| Toggle | toggle, switch, toggle switch | `track-colour`, `thumb-colour`, `radius`, `size` | `checked`, `focus`, `disabled` | `span` |
| Checkbox | checkbox, check, tickbox | `background`, `border-colour`, `radius`, `size`, `indicator-colour` | `checked`, `focus`, `disabled` | `span` |
| Radio | radio, radio button, option button | `background`, `border-colour`, `size`, `indicator-colour` | `checked`, `focus`, `disabled` | `span` |
| Select | select, dropdown, combobox, menu, picker | `background`, `text-colour`, `border-colour`, `radius`, `typography`, `padding` | `focus`, `disabled`, `error` | `div` |
| Tooltip | tooltip, hint | `background`, `text-colour`, `radius`, `padding`, `typography` | — | `span` |
| Toast | toast, notification, snackbar, alert, banner | `background`, `text-colour`, `radius`, `padding`, `typography`, `shadow` | — | `div` |
| Tabs | tabs, tab, tab bar, segmented control | `background`, `text-colour`, `indicator-colour`, `typography`, `padding`, `gap` | `active`, `hover` | `div` |
| Link | link, anchor, hyperlink | `text-colour`, `typography` | `hover` | `span` |
| Avatar | avatar, profile picture, profile photo | `background`, `text-colour`, `radius`, `size` | — | `span` |
| Progress | progress, progress bar, loader, spinner | `track-colour`, `indicator-colour`, `radius`, `size` | — | `div` |

The **preview element** column is the dashboard's, not `create`'s: it names the
one HTML element the Library view's component preview projects a spec of that
archetype into (v0.4.1 §4.1, contract in `refs/gui/component-preview.md`). Three
rules kept the column short:

- **One element, never a widget.** A toggle is a `span`, not a track with a
  thumb inside it. The preview shows the recorded slots on one box; it is not a
  reimplementation of the component.
- **The element carries no behaviour.** A `select` would open a list and a link
  would navigate, so both are drawn as inert boxes (`div`, `span`) instead. Only
  `button` and `input` keep their own tag, because both are inert until clicked
  and both read as themselves at a glance.
- **A `custom` component has no row here**, because it has no contract. It is
  previewed as a generic `div` from whatever slots it happens to carry.

The first five are the plan's originals; the ten below them joined in v0.3.0 §6.6,
because every surveyed system (Carbon, Polaris, Atlassian, Material 3, Fluent)
ships them and a design system that cannot describe its own switch is not
describing itself. Two things kept the rows lean:

- **A slot is mandatory only where the surveyed systems all decide it.** A
  tooltip's shadow varies; its background, text colour, radius, padding and type
  do not. Anything else a user wants recorded is still recordable — it is simply
  not a gap Phyllum asks about.
- **Link is deliberately the smallest contract in the set** — colour and type,
  and one state. A link that also wants an underline offset records one; nobody
  is asked for it.

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

### Icon slots (v0.5.1 §5.3)

Some archetypes carry a slot that is a **configuration** of the component rather
than a colour or a length: a button records whether it has a leading icon, a
trailing icon, or neither. These are **optional** slots — they are not in the
mandatory list above, `create` never asks for one, and a component without them
is complete. They are recorded here because the dashboard's preview needs to
know which archetype may draw one, and because a slot nobody wrote down is a
slot nobody may invent.

<!-- phyllum:icon-slots -->

| Archetype | Icon slots |
|-----------|------------|
| Button | `leading-icon`, `trailing-icon` |

An icon slot records **presence, not artwork**. Phyllum stores that the slot
exists — `yes`, `no`, `required`, `optional`, `true`, `false` — and never which
icon fills it, because a design system that names an asset is describing a file
rather than a decision. The preview draws that much and no more: a placeholder
dot per shown slot (`refs/gui/component-preview.md` § The attribute controls).

An archetype absent from this table records no icon slot. A spec of that
archetype that carries one anyway is listed as an unrendered slot in the
preview, never drawn — the contract says which slots an archetype has, and the
preview shows the contract. A `custom` component has no contract, so it draws
whatever icon slots it actually carries, exactly as it does with every other
slot.

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
| size | size | size, control size, dimensions, diameter, track height |
| track-colour | track-colour | track colour, track color, rail, rail colour, groove |
| thumb-colour | thumb-colour | thumb colour, thumb color, handle, handle colour, knob |
| indicator-colour | indicator-colour | indicator colour, indicator color, indicator, tick colour, dot colour, selected underline |

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
| Toggle | track-colour | #D1D5DB |
| Toggle | thumb-colour | #FFFFFF |
| Toggle | radius | 999px |
| Toggle | size | 44px × 24px |
| Toggle | checked | track #2563EB |
| Toggle | focus | 2px ring, 2px offset |
| Toggle | disabled | 40% opacity |
| Checkbox | background | #FFFFFF |
| Checkbox | border-colour | #D1D5DB |
| Checkbox | radius | 4px |
| Checkbox | size | 16px |
| Checkbox | indicator-colour | #FFFFFF |
| Checkbox | checked | background #2563EB, border #2563EB |
| Checkbox | focus | 2px ring, 2px offset |
| Checkbox | disabled | 40% opacity |
| Radio | background | #FFFFFF |
| Radio | border-colour | #D1D5DB |
| Radio | size | 16px |
| Radio | indicator-colour | #2563EB |
| Radio | checked | border #2563EB |
| Radio | focus | 2px ring, 2px offset |
| Radio | disabled | 40% opacity |
| Select | background | #FFFFFF |
| Select | text-colour | #111827 |
| Select | border-colour | #D1D5DB |
| Select | radius | 6px |
| Select | typography | 14px / 400 / 1.5 |
| Select | padding | 8px 12px |
| Select | focus | 2px ring, border colour |
| Select | disabled | 40% opacity |
| Select | error | border #DC2626 |
| Tooltip | background | #111827 |
| Tooltip | text-colour | #FFFFFF |
| Tooltip | radius | 6px |
| Tooltip | padding | 6px 8px |
| Tooltip | typography | 12px / 400 / 1.4 |
| Toast | background | #FFFFFF |
| Toast | text-colour | #111827 |
| Toast | radius | 8px |
| Toast | padding | 12px 16px |
| Toast | typography | 14px / 400 / 1.5 |
| Toast | shadow | 0 10px 15px rgba(0,0,0,0.1) |
| Tabs | background | transparent |
| Tabs | text-colour | #6B7280 |
| Tabs | indicator-colour | #2563EB |
| Tabs | typography | 14px / 600 / 1.4 |
| Tabs | padding | 8px 12px |
| Tabs | gap | 16px |
| Tabs | active | text #111827, indicator shown |
| Tabs | hover | text #111827 |
| Link | text-colour | #2563EB |
| Link | typography | inherited size / 500 / inherited |
| Link | hover | underlined |
| Avatar | background | #E5E7EB |
| Avatar | text-colour | #374151 |
| Avatar | radius | 999px |
| Avatar | size | 32px |
| Progress | track-colour | #E5E7EB |
| Progress | indicator-colour | #2563EB |
| Progress | radius | 999px |
| Progress | size | 4px |

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
