## Similarity — what is nearly the same as what

Every rule above reads one thing at a time: one value, one project. Similarity
is the only check that reads two things *against each other*, and it answers the
question a codebase cannot answer by counting — **is this the same component
twice?**

Three readings, one shape. Each one produces a **score in [0, 1]** computed from
structure alone: no model call, no heuristic that could answer differently on a
Tuesday. The same two things always score the same number, and the number is
what decides how loudly the finding is reported.

<!-- phyllum:similarity-rules -->

| Rule | Severity | Detects |
|------|----------|---------|
| component-clone | by band | two repeated markup signatures whose element and class words largely overlap |
| style-duplicate | by band | two named style blocks declaring materially the same `property: value` set |
| utility-overlap | warn | one utility-class bundle repeated across elements that no component was ever extracted from |

`by band` means the score decides, by the table below. `utility-overlap` is a
`warn` whatever its size, because a repeated utility bundle is a component
waiting to be extracted rather than a mistake — and extracting one is a decision
about the design system, not a defect to be fixed.

### The score

<!-- phyllum:similarity-weights -->

| Part | Weight | Compared on |
|------|--------|-------------|
| class words | 0.75 | Jaccard overlap of the words in both class lists, `btn--primary` read as `btn` + `primary` |
| element | 0.25 | 1 for the same tag; otherwise the Jaccard overlap of the words in the two tag names |
| declarations | 1 | Jaccard overlap of two blocks' normalised `property: value` pairs |

Class words rather than class names, because `btn--primary` and `PrimaryBtn` are
one pattern spelled twice, and comparing the spellings would say they have
nothing in common. The element part is a bonus rather than a gate: two different
tags carrying the same classes are still worth reporting, they are just worth
reporting more quietly — which is exactly what a 0.75 ceiling does to them.

The element part is scored by words too, so `Card` and `PrimaryCard` are read as
near rather than as unrelated. An exact tag match short-circuits to 1 so the
common case never depends on how a tag name happens to split.

<!-- phyllum:similarity-bands -->

| Band | Score | Severity | Means |
|------|-------|----------|-------|
| clone | >= 0.8 | error | the same thing twice — reported with a merge suggestion naming the more-used one as the survivor |
| similar | >= 0.5 | warn | a pattern similarity — reported, and nothing suggested |

Below 0.5 nothing is reported at all. Two components sharing one class word are
not evidence of anything, and a report that says so about every pair in a
codebase is a report nobody reads twice.

A merge suggestion is a **suggestion**, and it lands where every other Phyllum
suggestion lands: the review loop that edits `DESIGN-SYSTEM.md`. Nothing here
rewrites a component, renames a class or touches a line of code — merging two
components is `apply`'s PRD-gated work, and `assess` is read-only in the code as
well as in the promise.

### What counts as a block, and what counts as a bundle

A **style block** is a named group of declarations: a CSS rule and its selector,
a `styled.div` template and the constant it was assigned to, or a style object
literal and its variable name. A block is only compared when it holds at least
two declarations and at least one property the property tables recognise —
without that rule a configuration object of two strings would be a style
duplicate of another configuration object, which is a scanner reading a file it
does not understand.

A **utility bundle** is a class list long enough to be doing a component's job,
repeated often enough that somebody meant it. Both numbers are in the limits
table, and both are deliberately blunt: this check is a nudge, not a census.

### Bounded, and it says so

Comparing everything to everything else is quadratic, and a scan that reads a
big repository has to stay a scan. So the pass compares the most-used
signatures and the first blocks it read, up to a cap, and the report states the
cap rather than quietly truncating.

<!-- phyllum:similarity-limits -->

| Limit | Value | Why |
|-------|-------|-----|
| signatures | 40 | the most-used signatures compared to each other, the rest counted and not compared |
| blocks | 60 | style blocks compared, in the order they were read |
| pairs | 2000 | comparisons any one pass will make before it stops |
| bundle classes | 3 | classes a class list needs before it is a bundle rather than a class |
| bundle uses | 3 | elements a bundle has to appear on before it is worth extracting |

Sorted before capped, always: the signatures are the most-used ones, so the cap
drops the tail rather than an arbitrary forty. Both halves of the pass run on
markup, so both are React-only in v0.2.1 for the same reason the component pass
is — and both say so when they do not run. Style duplicates read stylesheets and
theme files, so they run on every stack.

---
