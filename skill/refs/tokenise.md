# `tokenise` (alias: `tokenize`)

Scan the codebase **read-only** and propose named tokens for the values it keeps
finding. The scan never writes. Only accepted tokens are written, and only into
`DESIGN-SYSTEM.md`.

The tables in this file are the contract — for the skill, for the CLI
(`lib/tokenise-spec.js` parses them at run time) and for the assertion suite
alike. Editing a table here changes behaviour and changes what the tests expect.
There is no second copy of these rules in the code.

---

## What is scanned

A read-only sweep of the project. Files are read; nothing is opened for writing,
renamed, or created, and no value is ever changed in place — that is a codemod,
and it is out of scope in v1 (see the bottom of this file).

<!-- phyllum:sources -->

| Source | Extensions | Read for |
|--------|------------|----------|
| stylesheets | `.css`, `.scss`, `.sass`, `.less` | declarations grouped by rule block |
| markup | `.html`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.astro` | inline `style="…"` attributes and Tailwind arbitrary values |
| skipped | `node_modules`, `.git`, `dist`, `build`, `.next`, `.phyllum`, `coverage`, `.claude` | — |

Three shapes of evidence, all read the same way once extracted:

- **Declarations** in a stylesheet rule block — `border-radius: 12px;`.
- **Inline styles** in markup — `style="background: #2563EB; padding: 12px"`,
  including the JSX object spelling `style={{ background: '#2563EB' }}`.
- **Tailwind arbitrary values** — `bg-[#2563EB]`, `rounded-[12px]`,
  `text-[12px]`. The prefix before the bracket names the property; the bracket
  holds the value. Tailwind's own named scale (`px-4`, `text-sm`) is *not* read:
  those are already tokens, just someone else's.

A prefix that maps to two properties is resolved by the shape of the value —
`text-[#111827]` is a colour, `text-[12px]` is a font size.

<!-- phyllum:tailwind -->

| Prefix | Property |
|--------|----------|
| bg | background |
| text | color, font-size |
| border | border-color, border-width |
| outline | outline-color, outline-width |
| fill | fill |
| stroke | stroke |
| rounded | border-radius |
| p | padding |
| px | padding-left |
| py | padding-top |
| pt | padding-top |
| pr | padding-right |
| pb | padding-bottom |
| pl | padding-left |
| m | margin |
| mt | margin-top |
| mr | margin-right |
| mb | margin-bottom |
| ml | margin-left |
| gap | gap |
| leading | line-height |
| font | font-weight |

Every sighting is recorded with its value, the property it filled, the file it
came from, and how many times it occurred. Frequency is the whole basis of the
review order, so a value seen once is kept and counted, not dropped.

---

## The three passes

<!-- phyllum:passes -->

| Pass | Token section | Value shapes | Properties |
|------|---------------|--------------|------------|
| colours | Colours | `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()` | color, background, background-color, border, border-color, border-top-color, border-right-color, border-bottom-color, border-left-color, outline, outline-color, fill, stroke |
| numbers | Numbers | `px`, `rem` | (by role — see below) |
| typography | Typography | font-size + font-weight + line-height in one rule | font, font-size, font-weight, line-height |

The numbers pass does not treat every length alike. A 12px corner radius and a
12px padding are the same number and different facts, so each length carries a
**role**, and clustering and naming both happen inside a role.

<!-- phyllum:roles -->

| Role | Properties | Applies to | Ladder |
|------|------------|------------|--------|
| radius | border-radius, border-top-left-radius, border-top-right-radius, border-bottom-right-radius, border-bottom-left-radius, rounded, radius, radius-top-left, radius-top-right, radius-bottom-right, radius-bottom-left | corner radius | rounded |
| spacing | padding, padding-top, padding-right, padding-bottom, padding-left, margin, margin-top, margin-right, margin-bottom, margin-left, gap, row-gap, column-gap, p, px, py, pt, pr, pb, pl, m, mt, mr, mb, ml | spacing | spacing |
| border | border, border-width, border-top-width, border-right-width, border-bottom-width, border-left-width, outline-width | border width | border |

The last few spellings in each row are Phyllum's own spec keys rather than CSS
properties. They are here because the same table answers both questions: which
sighting in the code belongs to which role, and which slot in a component spec a
newly named token is allowed to replace. A `rounded-md` token may fill a
`radius`, never a `padding-top` that happens to be the same number.

Shorthands are split rather than skipped: `padding: 12px 16px` is two spacing
sightings, and `border: 1px solid #2563EB` is one border sighting and one colour
sighting. The `font:` shorthand is read the same way — `font: 700 12px/1.3
system-ui` is one typography sighting.

A rule that sets a `font-size` is a typography sighting. A missing weight reads
as `400` and a missing line-height is recorded as `normal`; neither is invented,
both are the CSS initial value and both are visible on the proposal.

---

## Clustering — before naming, never after

Near-identical values are grouped and surfaced as **one** proposal — "these look
like the same intent, merge?" — so the system converges instead of mirroring the
entropy already in the code. Sixteen sightings of a blue that is `#2563EB`
fourteen times and `#2564EC` twice is one token with a merge note, not two
tokens.

<!-- phyllum:clustering -->

| Cluster | Compared on | Threshold | Also required |
|---------|-------------|-----------|---------------|
| colours | CIE76 ΔE, sRGB converted to Lab | 3 | — |
| numbers | absolute difference in px, `rem` read at 16px for comparison only | 1 | the same role |
| typography size | absolute difference in font-size, in px | 1 | the same weight |
| typography line-height | absolute difference in line-height | 0.1 | the same weight |

Rules that keep clustering honest:

- **The representative is the most-used member**, ties broken by the value that
  sorts first. It is never an average: Phyllum proposes a value that actually
  exists in the code, never a number nobody wrote.
- **Grouping is not rewriting.** The members that were folded in are listed on
  the proposal so the user can see exactly what they are agreeing to, and
  `rem` is compared at 16px but recorded exactly as written.
- **Clustering is deterministic.** The same codebase produces the same clusters
  in the same order on every machine.

---

## Frequency-ranked review

Proposals are ordered by total sightings across the cluster, most-used first,
ties broken by value. The user is asked about one proposal at a time.

<!-- phyllum:review -->

| Action | Answer | Effect |
|--------|--------|--------|
| confirm | `y`, `yes`, `ok`, `<enter>` | accept the token under the proposed name |
| rename | any other text | accept it under the name you typed instead |
| merge | `merge <name>` | fold this proposal into that token or proposal; no second token is made |
| skip | `n`, `no`, `skip` | leave the value alone this run; it is proposed again next time |

A skip is not a rejection forever — it records nothing, so the next run proposes
the value again. Merging into a name that does not exist is refused rather than
guessed at.

---

## Naming scales

Suggestions follow conventions a designer would recognise. Names are proposals,
and rename is one keystroke away — the scale exists so the *common* case needs no
typing at all.

**Colours.** A colour whose job is legible from the colour itself gets a role
name — near-white is a surface, near-black is text, grey is muted. Everything
else is ranked by how much the codebase leans on it. Rows are tested in order
and the first match wins; lightness and saturation are HSL percentages.

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

**Numbers.** Each role has a ladder. The clusters in a role are sorted smallest
to largest and laid onto the ladder so that the middle one lands on the ladder's
centre — a codebase with exactly one radius gets `rounded-md`, not `rounded-xs`.
Roles with more clusters than rungs number the overflow (`rounded-6`, `rounded-7`).

<!-- phyllum:ladders -->

| Ladder | Rungs | Centre |
|--------|-------|--------|
| rounded | rounded-xs, rounded-sm, rounded-md, rounded-lg, rounded-xl, rounded-2xl | rounded-md |
| spacing | space-xs, space-sm, space-md, space-lg, space-xl, space-2xl | space-md |
| border | border-hairline, border-sm, border-md, border-lg | border-sm |

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

**Collisions.** A proposed name already taken by a token, or by an earlier
proposal in the same run, gets a numeric suffix (`color-primary-2`). Phyllum never
silently reuses a name for a second value.

---

## Rerunnable — the diff on a second run

The second run diffs against the tokens already in `DESIGN-SYSTEM.md`:

- A cluster **any** of whose values is already the value of a token in that
  pass's section is **known**. It is matched silently and never proposed again —
  including the near-identical members that clustered with it, which is what
  makes an accepted merge stick.
- Only genuinely new, unmatched values are proposed.
- An immediate rerun with nothing changed therefore proposes **zero** tokens.
  Adding one new colour to the codebase and rerunning proposes **exactly one**.
- Values are compared normalised — case-folded, whitespace-stripped, `#abc`
  expanded to `#aabbcc` — and recorded exactly as the code spells them.

---

## Acceptance — what gets written, and where

On acceptance, and only then:

1. Each accepted token is appended to **its own** token subsection, in the
   column order that section's table declares:

   | Section | Columns |
   |---------|---------|
   | Colours | token, value, notes |
   | Numbers | token, value, applies to |
   | Typography | token, size, weight, line-height |

   The `notes` cell records the sightings and any merged members; the
   `applies to` cell records the role — `corner radius`, `spacing`,
   `border width` — which is what lets a later run tell a radius from a padding.
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
   one funnel — atomically, and to no other path.

Nothing is written before acceptance. Proposals live in `.phyllum/session.json` —
Phyllum's own state, gitignored — until then.

---

## What `tokenise` must never do

- **Rewrite the codebase to use the tokens it names.** That is a codemod, it is
  v1's most tempting boundary, and crossing it would break the permission model.
  The values in the code stay exactly as they are.
- Write any file other than `DESIGN-SYSTEM.md` (and Phyllum's own `.phyllum/`).
- Write anything at all before acceptance.
- Propose a value that is not in the codebase — no averaged colours, no rounded
  numbers, no "tidied" scale with rungs nobody uses.
- Propose a value the system has already named, or name one value twice.
- Change a token the user already has. `tokenise` adds; renaming an existing
  token is the user's edit to make.
