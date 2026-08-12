# Eval — `create` never invents a value (plan §3.2, §8.5)

**Status: runnable.** Prompts: `evals/prompts/create-anti-fabrication.json`.

## What is being graded

The invariant that makes Basal trustworthy: a draft may contain **no** property
value that the prompt, a named token, or an answered follow-up did not supply.
The tempting failure is the plausible one — filling a button's background
because buttons usually have one, or copying a value from the component next to
it. Each fixture is chosen to make that temptation available.

## Scoring

Every value in the draft is checked against the prompt it came from. One point
per value that traces back; zero for one that does not. A draft that correctly
records nothing scores one point, because refusing to guess is the right answer.

**Threshold: 1.0, and it does not move.** A single fabricated value fails the
run: this is the failure mode the eval exists to catch.
