## What is scanned

A read-only sweep of the project. Files are read; nothing is opened for writing,
renamed, or created.

<!-- phyllum:sources -->

| Source | Extensions | Read for |
|--------|------------|----------|
| stylesheets | `.css`, `.scss`, `.sass`, `.less` | declarations grouped by rule block |
| markup | `.html`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.astro` | `<style>` blocks, inline `style="…"` attributes, and Tailwind arbitrary values |
| skipped | `node_modules`, `.git`, `dist`, `build`, `.next`, `.phyllum`, `coverage`, `.claude` | — |

Four shapes of evidence, all read the same way once extracted: **declarations**
in a stylesheet rule block (`border-radius: 12px;`), **`<style>` blocks** inside a
component file — which is where a `.vue`, `.svelte` or `.astro` file keeps most of
its styling — **inline styles** in markup (including the JSX object spelling), and
**Tailwind arbitrary values** (`bg-[#2563EB]`). Tailwind's own named scale (`px-4`, `text-sm`) is *not* read:
those are already tokens, just someone else's. A prefix that maps to two
properties is resolved by the shape of the value — `text-[#111827]` is a colour,
`text-[12px]` is a font size.

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

Shorthands are split rather than skipped: `padding: 12px 16px` is two spacing
sightings, and `border: 1px solid #2563EB` is one border sighting and one colour
sighting.

## Every other text file

The table above is where a *stylesheet* is read as a stylesheet. The values pass
does not stop there, because raw styling does not stop there either: a theme file
in JSON, a constants file in Go, a Kotlin object of colours, a styled-components
template literal. Every other text file in the project is read too, for the one
shape that survives translation between languages: a **`property: value` pair**.

`"borderRadius": "12px"`, `border-radius: 12px;`, `borderRadius = 12.px` and
`border_radius: 12px` are all read as the same fact, because the property name is
what carries the meaning. The property still has to be one the tables recognise —
a colour property, a number role, or a typography property — so a `timeout: 30`
in a config file is not mistaken for a design decision.

<!-- phyllum:text-scan -->

| Source | Items | Read for |
|--------|-------|----------|
| data | any other text file | `property: value` pairs, in any language |
| skipped extensions | `.md`, `.markdown`, `.mdx`, `.txt`, `.csv`, `.tsv`, `.log`, `.lock`, `.map`, `.snap`, `.ico`, `.pdf` | — |
| skipped files | `DESIGN-SYSTEM.md`, `DESIGN-SYSTEM.md.bak`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` | — |

Three exclusions, each for its own reason. **Documentation and data dumps** are
skipped because prose *about* a colour is not a use of it, and counting a README's
examples would inflate every number in the report. **Lockfiles** are skipped
because they are machine output nobody styles anything with. And
**`DESIGN-SYSTEM.md` is skipped** because it is Phyllum's own record — reading it
as evidence would let the design system count as its own drift. Its `.bak` is
skipped for the same reason and one more: it is the same record, one edit ago, so
a project that has been edited twice would otherwise have every recorded value
counted twice. A `.gitignore` written by `phyllum init` already hides it; a
project that skipped that question deserves the same answer.

Two more limits keep the sweep bounded rather than exhaustive: anything
`.gitignore` ignores is not part of the codebase, and a file that reads as binary
or is larger than the size cap is skipped rather than parsed. Both are honest
limits, and the report says how many files were read so the number is never
implied.

A **bare** colour or length with no property attached is not a sighting. A hex
code sitting in a comment, a test fixture or a string is not evidence that
anything is styled with it, and a number with no property has no role — and
without a role, `12px` could be a corner or a padding. Phyllum does not guess
which.

### Seen, not read — the fourth bucket

A key Phyllum cannot map is not the same fact as no key at all. `AccentTint =
"#7C3AED"` in a Go file, or a length on a `box-shadow`, is plainly a design value
written against a property no table above gives a meaning to. Those used to be
dropped in silence, which made the report quietly understate the drift.

They are now a bucket of their own: **seen, not read**. The rules are narrow on
purpose.

| Rule | Why |
|------|-----|
| the value must be unmistakable — a colour literal, or a length with a unit | `timeout: 30` is a config number, not a design decision, and never becomes one |
| there must be a key — a bare literal in an array or a string still counts for nothing | a value nobody wrote a property for is not evidence that anything is styled |
| the row says `role unknown`, and is never proposed as a token | without a role, naming `18px` would be recording a corner radius as a padding |
| the review asks one question per row, and an unanswered question names nothing | the same way `tokenise` asks what a bare length applies to |
| a value the system already names never appears here | so an accepted answer makes the row disappear on the next run |

---

## Compound values — shadows and borders

A shadow is `0 2px 8px rgba(0,0,0,0.1)` and a border shorthand is `1px solid
#E5E7EB`. Neither is a length: the meaning is the whole list, so `toPx` has
nothing to take apart and the scalar path cannot read them. Until v0.2.1 they
fell into the bucket above — seen, not read — which was honest but unhelpful,
because a shadow written out forty times is the plainest drift there is.

They are read as wholes now, by the two passes in the `phyllum:compounds` table
in `refs/tokenise/passes.md`. The grammar is deterministic, and it is the same in every
language a `property: value` pair can be written in.

| Step | Rule |
|------|------|
| 1. layers | a comma at bracket depth zero separates layers — `box-shadow: a, b` is two shadows. Layers keep the order they were written in, because that order is the stacking |
| 2. parts | inside a layer, whitespace at bracket depth zero separates parts, so `rgba(0, 0, 0, 0.1)` stays one part rather than four |
| 3. lengths | a length is lowercased and a zero of any unit is written `0`, so `0px` and `0` are one value |
| 4. colours | a colour part is normalised the way every colour is — case-folded, `#abc` expanded |
| 5. functions | a part that is a function call other than a colour — `var(…)`, `calc(…)` — makes the whole declaration unreadable, and it goes back to the bucket above rather than being half-read |
| 6. order | the parts are rejoined in the order they were written, one space between them. The recorded value is the code's own value, tidied — never reordered into something nobody wrote |

Two rules keep the reading honest. A compound must carry **at least one length
or one colour** to be evidence at all, so `border: none` and `box-shadow: none`
record nothing. And a declaration read as a compound is **not also read as a
scalar length** — that would count one fact twice — while the colour inside it
*is* still a colour sighting, because the colours pass owns colours wherever
they sit.

---
