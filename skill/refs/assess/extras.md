## The smaller checks (v0.2.1 §8)

Six checks that do not belong to any of the families above, because each one
reads something the others do not: a pair of colours against each other, a dark
theme against a light one, `DESIGN-SYSTEM.md` against itself, a spacing value
against the scale it *nearly* sits on, and two kinds of literal — z-index and
breakpoint widths — that no property table gives a role to. They ship as one
family so the report has one place to put them, and each carries its own rule
name so a reader is never told "an extra finding" and left to guess which.

<!-- phyllum:extra-rules -->

| Rule | Severity | Detects |
|------|----------|---------|
| near-duplicate-colour | warn | two token-worthy colours close enough to each other that no eye can hold them apart |
| dark-mode-gap | warn | a colour the light theme names and the dark theme never restates — **only** in a codebase that demonstrably has a dark theme |
| token-alias-duplicate | warn | two tokens in `DESIGN-SYSTEM.md` holding the same value under different names |
| off-scale-spacing | error | a spacing length that misses the token scale by a hair — `15px` in an eight-point system |
| z-index-sprawl | warn | raw `z-index` literals, inventoried, once there are enough of them to be a stack nobody planned |
| hardcoded-breakpoint | warn | a media-query width written as a literal when a breakpoint token could name it |

Every one of them is silent when the evidence for it is missing, and silence is
the deliberate half of the design. A project with no dark theme is not nagged
about dark coverage; a project with no spacing tokens has no scale to be off;
two z-index values are a stack, not a sprawl. A check that fires on a healthy
project is a check people learn to skip.

<!-- phyllum:extra-limits -->

| Limit | Value | Why |
|-------|-------|-----|
| colour distance | 8 | how close two colours have to be, in ΔE, before they are one colour written twice |
| colour pairs | 400 | comparisons the colour check makes before it stops |
| off-scale tolerance | 3 | how many pixels from a rung of the scale still counts as aiming at that rung and missing |
| z-index values | 3 | distinct raw z-index values before an inventory is a sprawl |
| files | 400 | files the extras sweep reads |

**The colour distance is CIE76 ΔE, and it is an approximation on purpose.** It
is the same measure the colour clustering uses — sRGB converted to Lab, then a
straight-line distance between the two points — rather than CIEDE2000, which is
a colour-science library Phyllum does not have and will not vendor for one
check. CIE76 overstates distance in saturated blues and understates it in
near-neutrals, and neither error matters at this range: the question is whether
two greys are the same grey, and eight units of ΔE is comfortably inside "an eye
cannot hold these apart".

The check has a floor as well as a ceiling, and the floor is the clustering
threshold. Anything within ΔE 3 of another colour was already merged into one
cluster before this check ran, so a near-duplicate pair is by construction two
values the codebase keeps apart and a person cannot: **more than 3, no more than
8**. The number is printed in the finding so it can be argued with.

<!-- phyllum:dark-evidence -->

| Evidence | Written as | Read from |
|----------|------------|-----------|
| media query | `@media (prefers-color-scheme: dark)` | stylesheets, `<style>` blocks, any text file |
| class scheme | `.dark`, `[data-theme="dark"]`, `[data-mode=dark]` | selectors in stylesheets and style blocks |
| utility variant | `dark:` | class lists in markup — `dark:bg-slate-900` |
| config switch | `darkMode` | the theme config the detector already found — `tailwind.config.*` |

A **dark scope** is the body of a `prefers-color-scheme: dark` block, the body
of a rule whose selector carries the class scheme, or the value half of a
`dark:` utility. What counts as a **dark counterpart** inside one of those is
deliberately per-styling-system, because "the dark version of this colour" is
not a fact any single file format states:

| The codebase writes colour | A counterpart is | Why |
|----------------------------|------------------|-----|
| by name — CSS custom properties, a theme object, tokens | the token's name declared again inside a dark scope | `--color-ink: #F9FAFB` under a dark media query *is* `color-ink` having a dark value, said as plainly as a file will ever say it |
| by value — literals, utility classes | the property it sits on declared again inside a dark scope | a literal cannot be restated; its dark version is a different literal, and nothing in the text ties the two together. What can be read is whether the dark theme touches `background` at all |

One gate sits over both, and it is what keeps this from being a nag. If **no**
colour token is restated by name in any dark scope, this project does not
express dark values per token — and a check that then called every token a gap
would be reporting its own inability to read the convention. So it says that
instead, and grades only the raw half.

---
