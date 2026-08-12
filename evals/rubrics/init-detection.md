# Eval — `init` step 1, "look before asking" (plan §6.5, §8.5)

**Status: pinned, not scored yet.** The eval runner landed in M2
(`evals/run-evals.js`) and scores the `create` evals. This one is graded by a
model judge rather than by comparison to a pinned answer, so it waits for the
M6 eval harness. Nothing here fakes a model call in the meantime. The rubric, the
prompts and the fixture codebases are pinned here now so that when the runner
arrives it grades against a fixed target. Nothing in this directory fakes a
model call; an eval with no runner is simply not run.

## What is being graded

Given a fixture codebase, the skill's first walkthrough step must report the
framework and the existing design artefacts correctly, in prose the user can act
on. This is the judgement half of step 1 — the CLI already reports the
mechanical half (`lib/detect.js`), and the assertion suite covers that.

## Fixtures

| Fixture | Expected framework | Expected styling | Expected artefacts |
|---------|--------------------|------------------|--------------------|
| `evals/fixtures/codebases/react-css` | React | CSS | none |
| `evals/fixtures/codebases/tailwind` | React (Next.js) | Tailwind | `tailwind.config.js` |
| `evals/fixtures/codebases/plain-html` | none — plain HTML/CSS | CSS | none |

Prompts: `evals/prompts/init-detection.json`.

## Scoring

Each fixture is scored out of 3, one point per criterion:

1. **Framework named correctly.** Naming Next.js as well as React on the
   Tailwind fixture is correct, not extra. Claiming a framework the fixture does
   not contain scores zero for this criterion.
2. **Styling approach named correctly.** Tailwind must be recognised as
   Tailwind; the other two as plain CSS.
3. **Artefacts reported honestly.** Every existing artefact is listed, and no
   artefact is invented. Reporting "none found" when none exist scores the point.

**Threshold: ≥ 8 / 9 across the three fixtures, with no fixture below 2 / 3.**

Any invented file path is an automatic fail for the run regardless of score —
fabrication is the failure mode this eval exists to catch.
