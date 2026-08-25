## `refine naming` — is the name one the system could have proposed?

The third gate section. It reads names and nothing else: a token's name against
the scales Phyllum names tokens from, a component's name against the archetype
its own spec records.

| Property | Value |
|----------|-------|
| mode | `refine naming` |
| implemented in | `lib/refine-naming.js` |
| reads | `DESIGN-SYSTEM.md` only — the token tables and the component spec blocks |
| writes | nothing, and renames nothing |
| kind | deterministic; the scales are tables, and the check is a comparison |

---

### The standing rule this section runs under

`refs/nomenclature.md` opens with it: **a name is a proposal.** The library says
what a token *may* be called; it never renames a token somebody already has.

This section does not weaken that rule, and it is worth saying how. A name off
the scale is reported as a `warn`, never as a failure — and naming is not one of
the six ship criteria in `refs/refine/protocol-refine.md` §5, so an off-scale
name cannot block a ship on its own. What the section buys is that the drift is
*visible*: a system whose tokens are half on the scale and half not is a system
where the scale has quietly stopped being one, and nobody notices from inside.

The one `error` is the exception that proves it. An archetype the contract table
does not know is not a naming opinion — it is a spec that cannot be read.

---

### Token names — which scale applies to which table

A token is checked against the scale of the section it is recorded in, because
that is the scale it would have been named from.

| Section | On the scale when the name is | Read from |
|---------|-------------------------------|-----------|
| Colours | a library name (`family`-`rank`[-`exception`][-`state`]) or a colour-scale name (`color-primary`, `color-surface`, `gradient-1`) | `refs/nomenclature.md`, `refs/tokenise/naming.md` |
| Primitives | a base name on the Colours scale with a ramp step glued on (`neutral-100`, `color-primary500`) | `refs/nomenclature.md` ramp scale |
| Numbers | a rung of one of the ladders (`space-md`, `rounded-lg`, `border-sm`, `shadow-xl`) | the `phyllum:ladders` table |
| Typography | a type role with its band suffix (`body`, `body-small`, `highlight-display`) | the `phyllum:type-roles` and `phyllum:type-bands` tables |

Two spellings are allowed on top of any of those, because Phyllum's own naming
produces them:

- **The collision suffix.** `color-primary-2` is `color-primary` with the
  numeric suffix a taken name gets, and it is on the scale.
- **The gradient mark.** A gradient's name carries the mark word as its final
  suffix, so `danger-primary-gradient` is a library name plus one word.

<!-- phyllum:refine-naming-rules -->

| Rule | Subject | Severity | Detects |
|------|---------|----------|---------|
| token-off-scale | token | warn | a name no scale of any section could have produced |
| token-off-section | token | warn | a name on a scale, but not the scale of the table it sits in — `space-md` recorded as a colour |
| component-unknown-archetype | component | error | the spec records an archetype the contract table does not know |
| component-name-mismatch | component | warn | the name says nothing about the archetype the spec records — a `button` called `Widget` |
| component-name-shape | component | warn | the name is not `Base` or `Base/Variant` with a capitalised base |

---

### Component names — the archetype is the test

A component's name is graded against the archetype **its own spec records**, not
against what the markup looks like. The spec is the contract; the name is a
claim about the contract; a name that makes no such claim is a component two
readers will read two ways.

The match is by word: the base name is split at its case boundaries and the
words are compared against the archetype's key and its aliases, exactly the way
`lib/archetypes.js` reads an archetype word out of a sentence. So `Button`,
`IconButton` and `Button/Primary` all say `button`, and `Widget` does not.

Three subjects are left alone, each for a stated reason:

| Subject | Why it is not graded |
|---------|----------------------|
| a `custom` component | it claims no archetype contract, so there is no contract for its name to agree with — the same rule `adoptionMatch` follows |
| a component with no archetype recorded at all | that is the contract section's finding, and one fact reported twice is one finding too many |
| the variant word after the `/` | a variant is the user's vocabulary, not the archetype's |

---

### The verdict this section returns

The section reports every name it checked, each with a pass and — when it fails
— the rule it broke and the scale it was measured against. It does not propose a
replacement name and it does not rename anything: a proposal is `tokenise`'s to
make and a rename is `update`'s to carry out, each behind its own acceptance
gate.

---
