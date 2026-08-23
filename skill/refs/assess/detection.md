## Component detection — React in v0.2.0

The component half looks for markup patterns the codebase repeats and the design
system has never been told about: an element plus its class list, counted into a
signature, matched against the candidate signals in `refs/create/pick.md`, and dropped
if `DESIGN-SYSTEM.md` already registers it. This is the same reader bare
`phyllum create` uses for its picker, so a candidate means the same thing in both
places.

A candidate seeds a **name and an archetype, never values**. Whatever CSS sits
around the pattern is evidence for the follow-up loop to offer, not a fact about
the component.

**A custom component is skipped by this match, and only by this match**
(v0.3.0 §6.7). A custom records `custom: true` in its spec block because it
follows no archetype contract, and the match above is an archetype comparison —
so there is nothing to compare it against and Phyllum says nothing rather than
guessing which markup a bespoke component was meant to be. Nothing else changes:
a custom is still a registered component, so its own pattern is never re-proposed
as a candidate, and the naming, unused and prop passes read it exactly like every
other component, because those read names and values rather than contracts.

<!-- phyllum:component-stacks -->

| Framework | Component pass |
|-----------|----------------|
| react | yes |
| react-next | yes |
| vue | no |
| vue-nuxt | no |
| svelte | no |
| svelte-kit | no |
| html | no |
| unknown | no |

On a stack whose row says no, the values pass still runs in full and the report
says plainly that the component pass did not — never silently, and never by
pretending a Vue file is a React one.

---

## Clustering — before naming, never after

Near-identical values scanned out of a codebase are grouped and surfaced as
**one** proposal, so the system converges instead of mirroring the entropy
already in the code. The representative is the most-used member, never an
average — a value nobody wrote is never proposed. Clustering is deterministic.

<!-- phyllum:clustering -->

| Cluster | Compared on | Threshold | Also required |
|---------|-------------|-----------|---------------|
| colours | CIE76 ΔE, sRGB converted to Lab | 3 | — |
| numbers | absolute difference in px, `rem` read at 16px for comparison only | 1 | the same role |
| typography size | absolute difference in font-size, in px | 1 | the same weight |
| typography line-height | absolute difference in line-height | 0.1 | the same weight |
| typography reading | absolute difference in px, `rem` read at 16px for comparison only | 0 | the same reading |
| shadow length | absolute difference in px, part for part | 1 | the same layer count, the same keywords, the same number of lengths |
| shadow colour | CIE76 ΔE between two layers' colours | 3 | both layers have a colour, or neither does |
| border width | absolute difference in px, part for part | 1 | the same keywords |
| border colour | CIE76 ΔE between two borders' colours | 3 | both carry a colour, or neither does |

A compound clusters when **every part of it** clusters, by the same thresholds
the scalar passes use — a length is a length whether it stands alone or sits in
a shadow. Two shadows of different shapes never merge, however close their
numbers: `0 2px 8px` and `0 2px 8px 1px` are different shadows, and averaging
them would be inventing one.

The **typography reading** row is the one added by v0.7.3, and its threshold is
`0` on purpose. A size and a corner radius are measurements, and two of them a
pixel apart are the same decision written twice. A kerning, a word-spacing or a
text-indent is a typographic setting, and `0.02em` and `0.03em` are two settings
rather than one that drifted — so two reading values merge only when they are
the same value, with `16px` and `1rem` counted as the same value because they
are. A reading whose value is a word rather than a measurement — `uppercase`,
`italic`, a font stack — never merges with anything but itself.

Frequency is the review order: most-used first, ties broken by value. A cluster
any of whose values is already the value of a token in that pass's section is
matched silently and never proposed again, which is what makes an accepted merge
stick and what makes an unchanged rerun propose nothing.

The naming scales that turn a cluster into a proposed token name — the colour
roles and ranks, the number ladders, the typography roles and bands — live in
`refs/tokenise/naming.md`, because a name means the same thing whether the value came
out of a sentence or out of the code. One set of scales, two ways in.

---
