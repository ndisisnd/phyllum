# Eval — does `tokenise` read the sentence it was given? (plan §6, §7)

**Status: runnable.** `node evals/run-evals.js` scores it. Prompts:
`evals/prompts/tokenise-prose-extraction.json`. Threshold **1.0**.

## Why this eval exists

`tokenise` changed shape in v0.2.0. In v0.1.0 it scanned the codebase; from M2 it
takes **prose only**, and codebase scanning became `assess`'s job. The two evals
that used to be filed under `tokenise-*` both scan a fixture codebase, so in M8
they were renamed `assess-clustering` and `assess-naming` — which left the
command as it exists today with no eval at all.

This is that eval: **one sentence in, one token out.** It is the whole of what
`tokenise` now does, and it is the thing a user experiences directly, because
they typed the sentence.

## What is graded

Every claim is a fact about a fixed sentence, so there is no responder and no
recording — `parseProse` and `suggestName` are pure functions over the sentence
and the recorded model. That is why the threshold is 1.0: a wrong answer here is
a wrong answer, not a judgement call.

Four things per case, where the case states them:

1. **The name, when the sentence gives one.** A backticked word, or the word
   after a naming word. `nameFromProse` must distinguish "the user named this"
   from "Phyllum suggested a name", because the follow-up loop asks differently
   in the two cases.
2. **The candidates** — which pass (colours / numbers / typography), and the
   value, verbatim. A sentence carrying two values must yield two candidates, so
   the command can ask which one the user meant rather than picking.
3. **The role of a length, and whether it was stated or assumed.**
   `roleFromProse` is the difference between "you said padding" and "Phyllum
   guessed spacing", and the second one has to be visible to the user.
4. **What typography implies.** "body text is 15px" is a complete typography
   token only because weight and line-height have documented defaults. The
   `implied` list is how the command tells the user what it filled in, so an
   empty `implied` on a fully-stated sentence matters as much as a full one on a
   bare sentence.

## The failure this exists to catch

Reading a name out of the sentence *wrongly* is worse than not finding one.
M8 found exactly that: "call it color-brand" recorded a token named `it`, because
the contract's rule is "the naming word takes the next word" and the next word
was a pronoun. Nothing failed, nothing warned — a wrong name went into the user's
design system silently. The `colour-named` case pins the fix.

## Anti-fabrication

`create-anti-fabrication` covers this for `create`; the same rule binds here.
A value that is not in the sentence must not appear in the candidate, and the
`no-value-is-a-follow-up` case is the load-bearing one: a sentence with no value
at all must come back `complete: false` so the command asks, rather than
inventing something plausible to record.
