# Eval — `init` step 1, "look before asking" (plan §6.5, §3.3, §8.5)

**Status: scored from M6.** Step 1 has two halves and they are graded
differently, because only one of them can be graded without a model:

- **The deterministic core — scored here.** What framework is this, what is the
  styling approach, which design artefacts exist, and what will the code view
  therefore be? `lib/detect.js` answers all four, so the runner compares its
  answer to the pinned expectation for each fixture. No model is involved, and
  the score is reproducible on any machine.
- **The judgement half — graded by this rubric, not by the runner.** Reading
  those artefacts and summarising *what they mean for this project* is free
  text, and free text needs a model judge. It stays unscored rather than being
  given a number nothing computed. Nothing here fakes a model call.

## What the runner scores

Given a fixture codebase, four claims per fixture, one point each:

1. **Framework named correctly.** Naming Next.js as well as React on the
   Tailwind fixture is correct, not extra. Claiming a framework the fixture does
   not contain scores zero for this criterion.
2. **Styling approach named correctly.** Tailwind must be recognised as
   Tailwind; the others as plain CSS.
3. **Artefacts reported honestly.** Every existing artefact is listed, and no
   artefact is invented. Reporting "none found" when none exist scores the point.
4. **The code view is right about itself (plan §3.3).** v1 always emits React +
   CSS. The point is scored when the code view says React + CSS *and* marks
   itself a fallback exactly when the project is not React — a silent default on
   a Vue codebase is the failure this criterion exists to catch.

## Fixtures

| Fixture | Expected framework | Expected styling | Expected artefacts | Code view |
|---------|--------------------|------------------|--------------------|-----------|
| `evals/fixtures/codebases/react-css` | React | CSS | none | React + CSS (detected) |
| `evals/fixtures/codebases/tailwind` | React (Next.js) | Tailwind | `tailwind.config.js` | React + CSS (detected) |
| `evals/fixtures/codebases/plain-html` | none — plain HTML and CSS | CSS | none | React + CSS (fallback) |
| `evals/fixtures/codebases/vue-app` | Vue | CSS | none | React + CSS (fallback, §9) |
| `evals/fixtures/codebases/unknown-lang` | unknown | CSS | none | React + CSS (fallback) |
| `evals/fixtures/codebases/empty-project` | unknown | CSS | none | React + CSS (fallback) |

Prompts: `evals/prompts/init-detection.json`.

## Scoring

Four points per fixture, 24 in total.

**Threshold: 1.0.** Detection over pinned fixtures is a fact, not a judgement,
so anything less than every point is a regression rather than a bad day.

Any invented file path is an automatic fail for the run regardless of score —
fabrication is the failure mode this eval exists to catch.

## The half a model judge still owns

The prose summary — "you already have a Tailwind config, so your tokens
probably live there" — is not scored by the runner. When a model judge lands,
it grades that summary against the same fixtures and this rubric gains a second
threshold. Until then the summary is reviewed by a human reading the run, and no
number is recorded for it.
