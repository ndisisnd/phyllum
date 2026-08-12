# Eval — per-command help stays accurate (plan §2.2, §8.5)

**Status: not runnable yet. The eval runner lands in M2.** The rubric and the
prompts are pinned now; nothing here fakes a model call.

## What is being graded

The per-command explanations printed by `basal help <command>` must stay
accurate to the §2.2 command table. This is the eval that fails when a
command's behaviour changes and its help text does not — stale help is a
failure, not a cosmetic issue.

The deterministic half of help — word-order byte-equality, the reserved-word
rule, unknown commands, the two-to-three-line overview — is covered by
assertions in `evals/assertions/help.test.js` and needs no model.

## Method

For each command in the table, the grader is given:

- the plan's §2.2 row for that command, and the relevant plan section (§3–§6.5),
- the current output of `basal help <command>`,

and asks: does the help text describe what the plan says this command does,
with its real modes and arguments, and nothing it does not do?

Prompts: `evals/prompts/help-accuracy.json`.

## Scoring

Each command is scored out of 3:

1. **Purpose matches** the §2.2 summary — same job, no drift.
2. **Modes and arguments match** the plan, including alias names and any
   reserved-word or scope behaviour.
3. **No overclaiming.** A command that is not built yet says so; no described
   capability is absent from the plan.

**Threshold: ≥ 90% of the available points, and no command scoring below 2 / 3.**

A command whose help describes behaviour the plan does not grant it fails the
run outright, whatever the total.
