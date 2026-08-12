# `system`

Print the design system, fully listed out, to the terminal. `system` keeps no
state of its own: it is a formatted read of `DESIGN-SYSTEM.md`, so it is always
truthful to the source file. Running it writes nothing.

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
  Button/Primary
    name: Button/Primary
    properties:
      radius: rounded-md
    [jsx block: 12 lines — see DESIGN-SYSTEM.md]

Backlog (1)
  - TODO: tokenise 12px (Button/Primary padding-top)
```

Token rows are printed exactly as they appear in the file's tables. A component
prints its YAML spec in full; generated code blocks are summarised by language
and line count, because the file itself is the place to read code.

## Scope argument

| Invocation | Shows |
|------------|-------|
| `phyllum system tokens` | tokens only |
| `phyllum system components` | components only |
| `phyllum system all` | everything — identical to bare `phyllum system` |

`all` is the default, so `system` and `system all` produce byte-identical
output. An unrecognised scope word prints the valid scopes rather than erroring.
The same three scopes are the opening filter for `gui` / `dashboard`.

Flags are reserved for later (`--json`, `--component <name>`); v1 ships the
listing plus the three scopes.

## Before init

If there is no `DESIGN-SYSTEM.md`, `system` says so, points at `phyllum init`, and
exits cleanly. It never creates the file implicitly.
