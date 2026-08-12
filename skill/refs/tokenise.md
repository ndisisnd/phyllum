# `tokenise` (alias: `tokenize`)

*Lands in M3. Documented here so the contract is fixed before the code exists.*

Scan the codebase read-only and propose named tokens for the values it keeps
finding. The scan itself never writes; only accepted tokens are written, and
only into `DESIGN-SYSTEM.md`.

## Three passes

| Pass | What it looks for | Example |
|------|-------------------|---------|
| Colours | hex / rgb / hsl values in CSS, and arbitrary colour values | `#2563EB` (used 14×) → `color-primary` |
| Numbers | px / rem values for spacing, corner radius, borders | `border-radius: 12px` → `rounded-md` |
| Typography | font-size + weight + line-height clusters | `12px bold` → `highlight-small` |

## Mechanics

- **Cluster before naming.** Near-identical values (`#2563EB` vs `#2564EC`,
  `11px` vs `12px`) are grouped and surfaced as one proposal — "these look like
  the same intent, merge?" — so the system converges instead of mirroring the
  entropy already in the code.
- **Frequency-ranked review.** Most-used values first. For each proposal the
  user confirms, renames, merges or skips.
- **Naming scales.** Suggestions follow conventions a designer would recognise:
  colours `primary` / `secondary` / `surface` / `muted`; radii `sm` / `md` /
  `lg`; type semantic, like `highlight-small`.
- **Rerunnable.** A second run diffs against the existing tokens: known values
  match their token silently, and only genuinely new values are proposed. An
  immediate rerun therefore proposes nothing.
- Accepted tokens are written into the matching token subsection of
  `DESIGN-SYSTEM.md`.

## Out of scope in v1

Basal does **not** rewrite the codebase to use the tokens it names. That is a
codemod, and it would violate the permission model. When a newly accepted token
matches a `TODO: tokenise` value already recorded in a component spec, update
that spec to reference the token by name and remove the matching Backlog entry —
inside `DESIGN-SYSTEM.md` only.
