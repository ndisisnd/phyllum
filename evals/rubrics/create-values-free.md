# Eval — values are free (plan §3.1.1, §8.5)

**Status: runnable.** Prompts: `evals/prompts/create-values-free.json`.

## What is being graded

Basal governs **which** slots a component must fill, never **what** goes in
them. Four different corner radii on one button, a gradient where a flat colour
was expected, a 3px font size, a lowercase hex — every one of them must land in
the draft exactly as typed. No rounding, no unit conversion, no case fixing, no
"did you mean" substitution, and no warning.

## Scoring

One point per expected property whose value matches the prompt **character for
character**. A helpfully corrected value scores zero, which is the point.

**Threshold: 1.0.**
