# `display` (alias: `system`)

Print the design system, fully listed out, to the terminal. `display` keeps no
state of its own: it is a formatted read of `DESIGN-SYSTEM.md`, so it is always
truthful to the source file. Running it writes nothing.

**`display` is the primary name; `system` is a permanent alias** (v0.2.1
§6.5.3). The verb changed because the old one named the thing rather than the
act — every other command here is something you do, and "display" is what this
one does. Nothing about the behaviour changed with it: both words reach the same
renderer through the same branch of the dispatch, so their output is
byte-for-byte identical at every scope, and `system` is kept indefinitely so no
habit and no document has to be rewritten.

## Listing format

```
Design System — <project name>
(read from DESIGN-SYSTEM.md — Phyllum keeps no state of its own)

Tokens
  Colours (1)
    color-primary  #2563EB  main brand blue
  Numbers (0)
    (none yet)
  Typography (1)
    highlight-small  12px  700  1.3

Components (1)
  Button/Primary — applied
    name: Button/Primary
    applied: true
    properties:
      radius: rounded-md
    [jsx block: 12 lines — see DESIGN-SYSTEM.md]

Backlog (1)
  - TODO: tokenise 12px (Button/Primary padding-top)
```

Token rows are printed exactly as they appear in the file's tables. A component
prints its YAML spec in full; generated code blocks are summarised by language
and line count, because the file itself is the place to read code.

## The `applied` reading (v0.5.0 §3.4)

A component's name line carries its adoption reading when the spec block has one.

<!-- phyllum:applied-listing -->

| Spec block | Name line reads | Why |
|------------|-----------------|-----|
| `applied: true` | `Button/Primary — applied` | the codebase is using it right now |
| `applied: false` | `Button/Primary — not applied` | `phyllum apply` looked and found no site |
| no `applied:` line | `Button/Primary` — nothing added | `apply` has never run here, and silence is the honest reading of absence |

`display` derives nothing and writes nothing, here as everywhere: it prints the
flag the file carries. `phyllum apply` is what puts one there.

## Scope argument

| Invocation | Shows |
|------------|-------|
| `phyllum display tokens` | tokens only |
| `phyllum display components` | components only |
| `phyllum display all` | everything — identical to bare `phyllum display` |

`all` is the default, so `display` and `display all` produce byte-identical
output, and so do `system` and `system all`. An unrecognised scope word prints
the valid scopes rather than erroring, naming the word you typed so the
correction matches the command you ran. The same three scopes are the opening
filter for `gui` / `dashboard`.

Flags are reserved for later (`--component <name>`); the listing plus the three
scopes is the whole surface. `--json` belongs to `assess`, which has a whole
assessment object worth serialising — a formatted read of a Markdown file you
can already open is not one.

## Before init

If there is no `DESIGN-SYSTEM.md`, `display` says so, points at `phyllum init`,
and exits cleanly. It never creates the file implicitly.
