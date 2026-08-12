# Eval — `create` pick mode finds what the codebase already has (plan §3.1 Mode C, §8.5)

**Status: runnable.** Prompts: `evals/prompts/create-pick-candidates.json`.

## What is being graded

Bare `create` offers two lists: the archetypes in the contract, and the
components the codebase has been repeating without ever naming. The plan's own
case is the first one — "on a fixture codebase with a repeated unregistered JSX
pattern, that pattern appears in the candidate list" — and the three failure
modes around it are just as important:

- **Missing it.** A pattern used four times across two files is exactly what the
  picker exists to surface.
- **Proposing what is already registered.** `button-primary` is the class Basal
  itself generates for `Button/Primary`. Offering it again would invite a
  duplicate of a component the system already has.
- **Inventing a pattern.** One sighting is not a pattern. A picker padded with
  noise is worse than a short honest list.

The scan is deterministic — it reads markup and counts — so this eval needs no
model and grades the same on any machine.

## Scoring

For a case expecting a candidate: one point for the signature appearing, one for
the name Basal derives from it, one for the archetype it resolves to, and one
for the count being at least what the fixture repeats. For a case expecting
absence: one point for it being absent.

**Threshold: 1.0.** Every case here has one correct answer that follows from the
signals table in `skill/refs/create.md`; there is no judgement to be generous
about.
