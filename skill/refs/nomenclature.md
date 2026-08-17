# Nomenclature — the standard token vocabulary

A shared vocabulary for token *names*, and the shipped constants a primitive
colour ramp is built from. This file is a **library, not a command**: nothing
here runs, and no command changes behaviour by loading it. Other reference
files borrow from it — naming suggestions in `refs/tokenise/naming.md`, primitive
ramps in `refs/create/primitives.md`.

"Library" means **data Phyllum ships**, never an npm package. Phyllum has zero
dependencies and this file is why that stays true: the vocabulary is three
Markdown tables, parsed at run time by `lib/nomenclature.js`, read by the
assertion suite from the same rows. There is no second copy of these words in
the code.

Two standing rules apply to everything below:

- **A name is a proposal.** The library says what a token *may* be called. It
  never renames a token you already have, and rename stays one keystroke away.
- **No invented values.** The neutral ramp is nine fixed hex constants, shown
  in full before acceptance and identical for every Phyllum user. A derived
  ramp is deterministic — the same input gives the same nine values on every
  run, with no model in the path.

---

## The name format

A standardised name is built from slots, joined by hyphens:

```
<family>-<rank>[-<exception>][-<state>]
```

**Loose overall, strict parts.** Which slots a name uses is loose — most tokens
use two. The *set of words* per slot is strict, and so is the *order* the slots
appear in.

- One spelling per word. `hover`, never `hovered`; `focused`, never `focus`.
  There are no synonyms in the strict lists, because two spellings of one idea
  is how a vocabulary stops being one.
- Slot order is part of the strictness. `neutral-primary-hover` is well-formed;
  `hover-neutral` is not, and is not "fixed" into the right order — it is
  simply not a name this vocabulary knows.
- `family` and `rank` are mandatory; `exception` and `state` are optional. A
  name may skip an optional slot but may never reorder one.
- Matching is case-sensitive and lower-case: the words are the words.

<!-- phyllum:name-slots -->

| Slot | Order | Required | Words |
|------|-------|----------|-------|
| family | 1 | yes | `neutral`, `interaction`, `accent`, `surface`, `success`, `warning`, `danger`, `info` |
| rank | 2 | yes | `primary`, `secondary`, `tertiary` |
| exception | 3 | no | `lighter`, `darker`, `highlight`, `subtle`, `bold`, `inverse` |
| state | 4 | no | `active`, `inactive`, `hover`, `pressed`, `focused`, `selected`, `disabled` |

So `neutral-primary`, `interaction-secondary`, `interaction-primary-hover`,
`neutral-primary-darker` and `danger-primary-bold-pressed` are all well-formed.
`hover-neutral`, `primary-neutral`, `neutral`, `neutral-primary-hovered` and
`neutral-primary-hover-pressed` are not.

**Where the words come from.** The lists were drawn against the published
systems rather than invented. Atlassian's grammar —
`color.[property].[role].[emphasis].[state]`, e.g.
`color.background.brand.bold.hovered` — is the closest published cousin of this
format: role ≈ family, emphasis ≈ exception, state last. "State last" is the
one convention every surveyed system shares, which is why the slot order
enforces it.

| Slot | Grounding |
|------|-----------|
| family | Carbon `interactive` / `danger` / layer greys; Polaris `surface` / `interactive`; Atlassian `brand` / `danger` / `warning` / `success` / `information` / neutral; Material `primary` / `error` / `surface` |
| rank | Material 3 names all three ranks |
| exception | the lighter/darker/highlight trio, plus Atlassian's emphasis pair (`subtle` / `bold`) and `inverse` (Atlassian `text.inverse`; Polaris's `subdued` is the same idea) |
| state | Atlassian's state set (`hovered` / `pressed` / `selected` / `focused` / `disabled`), respelled to one form each, plus `active` / `inactive` |

Deliberate omissions: `visited` (link-specific), `dragged` (gesture-specific,
Material only). The feedback intents ship as four separate families
(`success`, `warning`, `danger`, `info`) rather than one `feedback` family,
because that is how every surveyed system names them and a `feedback-primary`
token would tell a reader nothing.

**States are defined, not generated.** The library says what a state *may* be
called. It never proposes a state row that was not asked for — the failure mode
worth avoiding is the 347-token system where 200 rows were hover and pressed
variants nobody wanted.

---

## The neutral ramp

Nine **shipped constants** — the primitive grey ramp, spanning near-white to
near-black. These values are not computed at run time and not derived from
anything in your project, so every Phyllum user's neutral ramp is byte-identical.
They are the widely used pure-grey neutral scale popularised by Tailwind CSS's
`neutral` palette: zero saturation, so the ramp carries no hue of its own.

`#FFFFFF` sits conceptually past the light end and `#000000` past the dark end;
neither is a step, because pure white and pure black are not design decisions.

The ramp ships under the token names in the middle column.

<!-- phyllum:neutral-ramp -->

| Step | Token | Value |
|------|-------|-------|
| 100 | `neutral-100` | `#F5F5F5` |
| 200 | `neutral-200` | `#E5E5E5` |
| 300 | `neutral-300` | `#D4D4D4` |
| 400 | `neutral-400` | `#A3A3A3` |
| 500 | `neutral-500` | `#737373` |
| 600 | `neutral-600` | `#525252` |
| 700 | `neutral-700` | `#404040` |
| 800 | `neutral-800` | `#262626` |
| 900 | `neutral-900` | `#171717` |

---

## Ramp derivation

A brand colour's ramp cannot be shipped constants — it has to be derived from
the colour. The derivation is **deterministic and disclosed**: hold the token's
hue, place lightness on the fixed nine-step scale below, scale the token's
saturation by the step's multiplier, and slot the original value at its nearest
step **unchanged**. The token's own value is never altered; all nine values
render before the acceptance gate, and any step may be edited before accepting.

**The lightness column is the neutral ramp's own lightness**, step for step
(HSL lightness of the constants above, to the nearest percent). That is the
point of stating it here rather than picking a second set of numbers: a derived
ramp lines up with the neutral ramp rung by rung, so `accentRed400` and
`neutral-400` are the same brightness.

**Nearest is nearest by lightness**, and a tie goes to the lighter step. Ties are
rare and the two candidates are exactly as far away as each other, so the rule
only has to be *fixed*, not clever — a derivation that depended on which way an
array was walked would not be one users could predict.

**Saturation tapers at the extremes**, as published ramps do: the lightest and
darkest steps read as tint and shade rather than as the colour itself, and
holding full saturation there makes them look muddy. The multiplier is applied
to the token's own saturation — a muted input stays muted.

<!-- phyllum:ramp-scale -->

| Step | Lightness | Saturation |
|------|-----------|------------|
| 100 | 96 | 0.60 |
| 200 | 90 | 0.80 |
| 300 | 83 | 0.90 |
| 400 | 64 | 1.00 |
| 500 | 45 | 1.00 |
| 600 | 32 | 1.00 |
| 700 | 25 | 0.95 |
| 800 | 15 | 0.85 |
| 900 | 9 | 0.75 |

---

## Never

- Never rename an existing token to this vocabulary. The library changes
  proposals, never records.
- Never generate a state variant that was not asked for.
- Never compute the neutral ramp. It is nine constants; a computed grey ramp
  would differ between users for no reason.
- Never put a model in the ramp path. Derivation is arithmetic.
