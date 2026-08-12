# Eval — extrapolating from prior components (plan §3.1.1, §8.5)

**Status: runnable.** Prompts: `evals/prompts/create-extrapolation.json`.

## What is being graded

Contracts are the floor. If every button already in the system defines a
`focus-ring`, the next button should be asked about it too — and if they do not,
nothing extra should be proposed. Both directions are graded, because a skill
that always proposes extras is as wrong as one that never does.

| Fixture | Buttons defining `focus-ring` | Expected |
|---------|-------------------------------|----------|
| `buttons-with-focus-ring.md` | 3 of 3 | proposed |
| `buttons-without-focus-ring.md` | 1 of 3 | not proposed |
| `empty.md` | no buttons at all | not proposed |

One precedent out of three is not a system; unanimity is the bar.

## Scoring

One point per fixture whose gap list matches the expectation.

**Threshold: 1.0.**
