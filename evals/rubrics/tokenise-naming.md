# Eval — would a designer recognise the name? (plan §4, §8.5)

**Status: runnable.** `node evals/run-evals.js` scores it. Prompts:
`evals/prompts/tokenise-naming.json`. Fixture:
`evals/fixtures/codebases/tokenise-mixed`.

## What is being graded

A proposed name is the whole difference between a review the user clicks
through and a review they have to retype. The plan sets the bar as a question a
person can answer: *would a designer recognise `rounded-md` and
`highlight-small`?* This eval turns that question into two checks per cluster,
because a name can fail in two different ways.

- **On the scale.** `rounded-md` is on the radius ladder; `radius12` and
  `blueish` are not. A name off the documented scale is wrong however apt it
  sounds, because the scale is what makes the *next* name predictable.
- **The right rung.** Being on the ladder is not the same as being in the right
  place on it. A codebase with one radius should get the middle rung, not the
  smallest — `rounded-md`, which is the plan's own example.

The pinned cases cover all three scales: the colour roles and ranks
(`color-primary`, `color-surface`, `color-text`), the number ladders
(`rounded-md`, `space-md`), and the typography role-plus-band names
(`highlight-small`).

## Two responders

| Responder | What it grades | Needs a model? |
|-----------|----------------|----------------|
| `deterministic` | Phyllum's own naming, from the scales in `skill/refs/tokenise.md` | no |
| `recorded` | a real `claude` run following the same reference file, committed under `evals/fixtures/recordings/` | only to record |

Nothing here calls a model during a test run, and nothing invents what a model
would have said. A case with no recording is reported as unrecorded — it is
never counted as a pass or a failure.

## Scoring

Per case, out of two:

- **1 point** — the name matches the scale's shape (a pinned pattern).
- **1 point** — the name is one of the accepted names for that cluster. Each
  case accepts more than one, because "the name a designer would recognise" has
  more than one right answer: `color-primary` and `color-brand` are both fine
  for the blue the codebase leans on hardest.

**Threshold: 0.9.** Deliberately below 1.0, and this is the one eval in the
suite where that is the honest number: naming is judgement, the accepted lists
are not exhaustive, and a run that gets every name on-scale and one rung
debatable should be a pass rather than a failure. Raise it as the accepted lists
grow; lowering it needs a note in the change explaining why.
