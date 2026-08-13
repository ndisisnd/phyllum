# `assess-similarity` — what is nearly the same as what

**Threshold: 1.0.** Every claim here is a reading of structure over a pinned
fixture: which words two class lists share, which declarations two blocks share,
how many elements a bundle appears on. Nothing is asked of a model, and nothing
depends on a machine or a date — so there is no headroom in the threshold, for
the same reason `assess-severity` and `assess-hygiene` have none. A similarity
score is only worth printing if `0.813` means the same thing on every rerun, and
a threshold below 1.0 would be conceding that it might not (v0.2.1 plan §4).

## What it grades

1. **Component clones (§4.1).** Two repeated markup signatures scored on their
   class words and their tag, banded at 0.8 and 0.5, and — above 0.8 only — given
   a merge suggestion naming the more-used signature as the survivor.
2. **Style duplicates (§4.2).** Two *named* style blocks — a CSS rule, a
   `styled.div` template, a style object — declaring materially the same
   `property: value` set under different names.
3. **Utility overlaps (§4.3).** One long class bundle repeated across elements
   that no component was ever extracted from, reported as a `warn` whatever its
   size.
4. **Suggestion, never application (§4.4).** A survivor is named and nothing is
   renamed, rewritten or merged.

Three fixtures. `evals/fixtures/codebases/clone-pairs` is built pair by pair, so
each case turns exactly one claim true or false;
`evals/fixtures/codebases/react-css` is the ordinary project that must produce
nothing at all; `evals/fixtures/codebases/vue-app` is the stack whose markup
Phyllum cannot read.

## The claims, per case

| Case kind | Claims |
|-----------|--------|
| `clone` | the pair is reported · banded `clone` · an `error` · the more-used signature is named as the survivor |
| `similar` | the pair is reported · banded `similar` · a `warn` · no survivor is named |
| `not-similar` | the pair appears in no finding |
| `duplicate` | the two blocks are reported · banded `clone` · an `error` · the shared declarations are listed |
| `near-duplicate` | the two blocks are reported · banded `similar` · a `warn` |
| `no-duplicate` | the block appears in no pair |
| `overlap` | the bundle is reported · as a `warn` · with the number of elements it was written on |
| `no-overlap` | the class list is not reported as a bundle |
| `no-findings` | the project reports no similarity findings of any family |
| `not-checked` | no clones, no overlaps, a stated reason, and the style blocks still compared |
| `bounded` | every score is in [0, 1] · the caps are reported · what was compared is reported |

## Why the negative cases outrank the rest

- **The ordinary React project.** `react-css` has two button modifiers that
  differ by one nearly-identical colour. A pass that calls those a duplicate
  makes every codebase look like a clone of itself, and the finding stops
  meaning anything.
- **The bundle used twice.** Three utility classes on two elements is not yet a
  component, and reporting it would turn a nudge into noise on the first file
  anybody writes.
- **The two unrelated elements.** A `div.footer` and a `span.label` share
  nothing. Scoring them and reporting the score is how a quadratic pass floods a
  report.
- **The Vue project.** Its components are not clones of each other; they were
  never read. Reporting "no clones" there would answer a question that was never
  asked — the same honesty rule the component pass and the unused check follow.

## What the eval does not grade

Determinism across reruns, the exact wording of the report, the weights and
bands being read from `refs/assess.md` rather than restated in code, the caps
actually binding on a project bigger than the caps, and the read-only proof
around the whole pass. Those are assertions, in
`evals/assertions/assess-similarity.test.js`.
