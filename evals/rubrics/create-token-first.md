# Eval — suggestions lead with a token you already have (plan §3.2, §8.5)

**Status: runnable.** Prompts: `evals/prompts/create-token-first.json`.

## What is being graded

Follow-up questions carry suggestions in a fixed priority order: existing
tokens, then evidence from the codebase, then a clearly labelled guess. This
eval checks the first rung. Where the system already has a token that fits the
slot, the **first** suggestion must be that token — even when the raw value is
all over the codebase, and even when it is the same number.

The `radius-token-beats-raw-value` case hands the grader fourteen sightings of
`12px` in the code alongside the `rounded-md` token that names it. The token
still has to win.

## Scoring

One point per case where the first suggestion is a token suggestion naming the
expected token. Anything else — a raw value, a default, or the wrong token —
scores zero.

**Threshold: 1.0.** The order is a rule, not a tendency.
