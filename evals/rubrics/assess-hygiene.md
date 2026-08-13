# `assess-hygiene` — what collides, and what nothing uses

**Threshold: 1.0.** Deterministic end to end. Every claim is a fact about a
pinned fixture — which packages a manifest declares, which files exist, which
strings a scan saw — so there is nothing here a model could answer differently
and nothing that varies between two runs on the same project (v0.2.1 §6).

## What this grades

Every other check `assess` runs reads one value at a time. The two checks graded
here are about the project instead, and both were already visible in evidence
Phyllum was throwing away.

1. **Collisions (§6.1).** `detectProject` looks for six frameworks and three
   styling systems and returns one winner, because `create` only ever needed a
   label. The evidence behind the winner is now reported beside it, and
   co-existence is a finding: more than one UI framework, more than one major of
   one framework, more than one styling system live at once, more than one theme
   file declaring values.
2. **Unused (§6.2).** Coverage runs codebase → system. Run it backwards over the
   same scan and it answers the opposite question: which tokens and components
   does the codebase never mention?

Two fixtures carry it. `evals/fixtures/codebases/collisions` is a repository
mid-migration — React and Vue, two majors of React, Tailwind and
styled-components and hand-written CSS, and three theme files. And
`evals/fixtures/codebases/stale-system` is the reverse case: a design system
richer than the code that is supposed to be using it.

## The claims, per case

| Case kind | Claims |
|-----------|--------|
| `collision` | a finding of that family exists · it names what collided · it is a `warn` · its evidence lists where each thing was seen |
| `no-collision` | the project reports no collisions at all |
| `unused-token` | the token is reported unused, as a `warn`, carrying the bounded-scan caveat |
| `used-token` | the token is **not** reported unused |
| `unused-component` | the component is reported unused, with the spellings that were looked for |
| `used-component` | the component is **not** reported unused |
| `not-checked` | the component half did not run, says why, and names nothing |

## Why the negative cases outrank the rest

Six of the fourteen cases assert that something is **not** reported, and they are
the ones worth failing over. A hygiene check that fires on healthy projects is
worse than no hygiene check, because every finding it produces is a warning
somebody has to read and dismiss.

- **The ordinary Tailwind app.** A `globals.css` of `@tailwind` directives is how
  Tailwind is installed, not a second styling system competing with it.
- **The Next.js app.** Next *is* React, so matching both rows is one framework
  described twice. Families are counted, never labels.
- **The token whose value drifted.** `space-8` is `32px` in the system and `31px`
  in the code. That is drift, and the value rules already report it; reporting it
  again as a stale token would be one finding too many about one token.
- **The Vue project.** Its components were never read, so it is told the question
  was not asked. Telling it every component it has is unused would be a statement
  about the reader rather than about the project.

## What this eval does not grade

What a user does about any of it — because there is nothing Phyllum could do for
them. Every hygiene finding is a `warn`: two frameworks may be a migration
halfway done, and an unused token may be the one the next screen is built on. No
mode removes anything, and the assertions in
`evals/assertions/assess-hygiene.test.js` cover that directly, including
`assess update` leaving every stale row exactly where it found it.
