# `sample`

`sample` works with the one worked example Phyllum ships:
`templates/SAMPLE-DESIGN-SYSTEM.md`. A new user opens `DESIGN-SYSTEM.md` on a
system that shows what one looks like, rather than on five empty tables, and
removes it once they have their own.

## What the sample holds

| Part | Contents |
|------|----------|
| Primitives | the shipped neutral ramp (`neutral-100`…`neutral-900`) and a blue ramp (`blue100`…`blue900`) derived from `#2563EB` by the `create primitives` arithmetic |
| Colours | surfaces, text, a border, an inverse, the interaction colour with its hover and disabled, and an accent pair for tags — every value is a ramp step or white |
| Numbers | three radii, five spacing steps, a hairline border and three shadows |
| Typography | `highlight-small`, `highlight` and `body` |
| Components | `Button/Primary`, `Accordion` (a custom), `Tag/Small`, `Tag/Large`, `Card` |

Every component slot names a token. The Backlog is empty, and no contract slot
is left as `TODO`. The code blocks are what `create` renders from those specs.

## What makes an entry sample

Nothing marks it. An entry is sample while it still reads **exactly** as
shipped:

- a token row: the same name and the same cells
- a component: the same spec block, ignoring the derived `applied:` line, and no
  block the sample did not ship (a `govern docs` entry is somebody's work)

An entry somebody edited is theirs from then on. `sample` never takes it back.

## The three words

| Typed | What it does | Writes |
|-------|--------------|--------|
| `sample` | says how many sample entries are as shipped, changed, or not there | nothing |
| `sample dispose` | removes every entry still as shipped | `DESIGN-SYSTEM.md`, after the gate |
| `sample restore` | adds back every entry whose name is not in the file | `DESIGN-SYSTEM.md`, after the gate |

## What `dispose` keeps, and why

| Kept | Why |
|------|-----|
| an edited entry | it is the user's now |
| a token a remaining component names | removing it leaves that component pointing at nothing |
| a component whose spec records `applied: true` | the codebase uses it; `delete` would refuse it too |

Components are decided first, then tokens, so a token under a kept component
is kept with it.

## What `restore` never does

- It never overwrites a name already in the file, even when the value differs.
  That name is the user's, and it is listed as left alone.
- It never re-adds an entry that is already there, so a second run adds nothing.

## The gates

- `restore` only adds. `--yes` answers its gate, as it does every gate that adds.
- `dispose` removes content. A person answers its gate, and `--yes` never does.
  Without a person to ask, it previews and writes nothing.

## `init`

`init` offers the sample only when it is creating `DESIGN-SYSTEM.md`. The sample
goes into that one write, so a fresh project gets no `.bak` of an empty file.
An existing file is never given the sample. `init` points at `sample restore`
instead.

## Never

- Never write anywhere but `DESIGN-SYSTEM.md`.
- Never remove or overwrite an entry the user changed.
- Never describe the sample's values as the user's decisions. They are shipped
  constants, the way the neutral ramp is.
