## Hygiene — what collides, and what nothing uses

Every rule above reads one value at a time. Two questions cannot be answered
that way, because they are about the project rather than about any value in it:
**what is fighting what**, and **what is here that nothing needs**.

<!-- phyllum:hygiene-rules -->

| Rule | Severity | Detects |
|------|----------|---------|
| framework-collision | warn | more than one UI framework in one repository, or two majors of one framework in the dependency tree |
| styling-collision | warn | more than one styling system live at once — Tailwind, CSS-in-JS, hand-written stylesheets |
| theme-source-collision | warn | more than one theme file declaring values, so no one file is the source of truth |
| unused-token | warn | a token in `DESIGN-SYSTEM.md` whose value and whose name were never seen in the scan |
| unused-component | warn | a registered component whose name, in any spelling, was never seen in the markup scan |

Every hygiene rule is a `warn`, and the severity is a column here rather than a
number in the code for the same reason the frequency threshold is. It is a
`warn` on purpose: unlike a raw value, none of these has an answer Phyllum could
apply. Two frameworks in one repository may be a migration halfway done; an
unused token may be the one the next screen is built on. So they are reported
with the evidence, and never demanded, never removed, never auto-accepted.

### Collisions — the evidence detection used to throw away

`detectProject` gathers six frameworks and three styling systems and returns one
winner, because `create` only ever needed a label. The evidence behind the
winner is kept now, and co-existence is reported from it.

| Reading | One repository, more than one of | Why it matters |
|---------|----------------------------------|----------------|
| frameworks | React and Vue; two majors of React in the dependency tree | two component models means two definitions of the same button |
| styling systems | Tailwind, styled-components/emotion, hand-written stylesheets | three places to write `#2563EB`, and no way for a token to reach all three |
| theme sources | `tailwind.config.js`, `tokens.json`, `theme.ts` | each file declares values, so none of them is *the* source of truth |

Next is React and Nuxt is Vue: matching both rows is one framework described
twice, not two frameworks, so families are counted rather than labels. Plain
HTML never collides with anything — it is the absence of a framework, not a
rival to one. And the Tailwind entry stylesheet does not count as a second
styling system, because a `globals.css` full of `@tailwind` directives is how
Tailwind is installed.

`DESIGN-SYSTEM.md` is never counted as a theme source. It is Phyllum's own
record, and counting it would make every project Phyllum manages collide with
itself.

### Unused — the coverage split, run backwards

Coverage reads codebase → system: which raw values does the system already name?
The unused check reads system → codebase, over exactly the same scan.

| Finding | Means |
|---------|-------|
| unused-token | no sighting carried its value, and no property carried its name or CSS-variable spelling |
| unused-component | no element, component tag or class name in the markup scan matched any spelling of its name |

The caveat is part of the finding, not a footnote: **the scan is bounded and
text-based**, so "not seen" means "not seen in what was read". A token used in a
file past the file cap, behind a computed class name, in a language the markup
pass does not read, or referenced only as `var(--name)` — which is a reference
rather than a value, and so is never a sighting — is not dead. It is unseen.
Phyllum reports the difference and never resolves it by deleting anything.

The name arm is what makes the check survive a value drifting: a `space-8` the
system records as `32px` and the code writes as `31px` is still *referenced* by
name, so it is reported as drift by the value rules and not as a stale token by
this one. Two findings about one token would be one finding too many.

Two consequences follow, and both are deliberate. Removal is offered through the
normal review loop, which edits `DESIGN-SYSTEM.md` and nothing else — there is
no auto-pruning at any severity, in any mode, including `assess update`. And the
component half does not run at all on a stack whose component pass did not run:
a Vue project would otherwise be told every component it has is unused, which is
a statement about the reader rather than about the project.

---
