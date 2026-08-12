# `apply-run-execution` — how `apply run` decides, substitutes and verifies

**Threshold: 1.00.** Every point must score. This eval grades the decisions that
sit either side of the one thing a deterministic runner cannot grade — what an
agent writes — so a partial score here means Phyllum either edited something it
should have delegated, delegated something it could have done itself, or called a
criterion done without evidence. None of those may pass.

Responder: **deterministic**. No model is involved, and none is needed: routing,
substitution and verification are pure functions over pinned fixtures.

## What is scored

| Criterion | What it asks | Why it is the bar |
|-----------|--------------|-------------------|
| `routing` | For every criterion in a pinned plan: mechanical or agent, and for an agent, which of the four reasons | The report tells the user "Phyllum did this by hand, an agent did that". If routing drifts, that sentence becomes false — and a mechanical pass reaching into a near-identical value or a typography token would change what the page renders without anybody judging it |
| `substitution` | The edit lands on the properties the criterion names and nowhere else; the literal matches however it is cased; a longer literal that merely starts the same is untouched; the token the file now reads is declared in that file; a criterion with nothing to replace reports zero rather than claiming success | This is the code that edits somebody's stylesheet. `12px` on `border-radius` and `12px` on `padding` are different facts, and a `var(--x)` nothing declares is a broken page |
| `verification` | Three answers, told apart: satisfied, not satisfied, and **cannot tell** | "Cannot tell" is the point. A run that treats an agent's word as evidence makes every tick in the PRD worthless, so an unverifiable criterion must come back `null` — which stops the phase — rather than `true` |

## What is not scored

What an agent writes. No deterministic runner can judge whether generated markup
satisfies a recorded component contract, so that is left to the run's own
verification pass — whose behaviour *is* scored above, and whose refusal to guess
is the reason the unscored half cannot quietly pass.

## Fixtures

`evals/prompts/apply-run-execution.json` pins every case: two whole codebases for
routing (`react-css`, which contains all four agent reasons, and `plain-html`,
which contains one), and inline sources for substitution and verification so the
edge cases are readable next to their expectations. The design system is
`evals/fixtures/design-system/apply-target.md`, the same one `apply-prd-contract`
uses — one target, both halves of the command.
