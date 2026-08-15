# `update`

`update` is an **alias of `apply`** (v0.3.0 §6). There is no second command here
and no second behaviour: the word resolves to `apply`'s registry entry, reaches
`apply`'s one dispatch branch, and produces `apply`'s output byte for byte.

Read `refs/apply.md` for the contract. This file exists to record the rename and
to say what `update` no longer means.

## What the word means now

"Update" now means **update your codebase from the design system** — the
direction people reach for when they type it. So:

| Typed | Runs | Writes |
|-------|------|--------|
| `phyllum update` | `phyllum apply` | `.phyllum/PRD.md`, and nothing else |
| `phyllum update --fresh` | `phyllum apply --fresh` | the same file, regenerated |
| `phyllum update run` | `phyllum apply run` | source, on a `phyllum/apply-<date>` branch, one commit per phase |

`update run` chains to `apply run` the way `system`'s scope words chained to
`display`: the alias is resolved before any argument is read, so the scope word
lands in `apply`'s own grammar and nowhere else.

Everything `apply` guarantees holds unchanged under the alias — the plan is the
consent gate, planning executes nothing, and re-running resumes rather than
duplicating.

## What it no longer means

Up to v0.2.3, `phyllum update` moved the *install* to the latest published
version. That command still exists, unchanged in every respect but its name:
it is **`phyllum upgrade`**, and its contract is `refs/upgrade.md`.

## Leading with `apply`

Help, `menu` and the docs name `apply` first and list `update` as its alias, the
same way `display` leads and `system` follows. One command, two words, one page.

## The silent switch

The change lands with **no redirect notice and no acknowledgement gate**. The
risk allows it: `apply` only ever writes a plan, so the worst a muscle-memory
`phyllum update` can do is leave a `.phyllum/PRD.md` nobody asked for — no
install is touched, no code is touched, nothing is run.

Discovery of `upgrade` is the docs' job — `help`, `menu`, the README's "How to
update" section, `llms.txt` and the release note — never a warning printed on a
command that did exactly what it was asked to do.
