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
- **Proposing what is already registered.** `button-primary` is the class Phyllum
  itself generates for `Button/Primary`. Offering it again would invite a
  duplicate of a component the system already has.
- **Inventing a pattern.** One sighting is not a pattern. A picker padded with
  noise is worse than a short honest list.

The scan is deterministic — it reads markup and counts — so this eval needs no
model and grades the same on any machine.

## `create primitives` — the same claim, one mode over (v0.3.0 §5.1)

`create primitives` offers ramps the way pick mode offers candidates, and the
rule it has to keep is stricter: **each colour token gets its own yes/no before
any ramp is proposed for it, and a no generates nothing for that token.** A ramp
proposed unasked is the same failure as a candidate invented — Phyllum putting
something in front of you that nobody asked for, in a place where it is easy to
say yes by reflex.

Four cases pin it, and each one is a way the rule could quietly stop holding:
tokens asked about in file order with a no honoured; no colour tokens at all, so
the shipped neutral ramp is the whole offer; a value that is not a colour, which
is reported rather than asked about, because there is nothing to derive from; and
a ramp already in the file, which is reported rather than offered twice.

These cases walk the command's own loop with the answers pinned, so what is
graded is the conversation's order rather than a re-description of it.

## Scoring

For a case expecting a candidate: one point for the signature appearing, one for
the name Phyllum derives from it, one for the archetype it resolves to, and one
for the count being at least what the fixture repeats. For a case expecting
absence: one point for it being absent. For a `primitives` case: one point for
the questions asked and their order, one for what was proposed, and one for
nothing being proposed that was never asked about.

**Threshold: 1.0.** Every case here has one correct answer that follows from the
signals table in `skill/refs/create/`; there is no judgement to be generous
about.
