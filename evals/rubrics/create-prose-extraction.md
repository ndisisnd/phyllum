# Eval — `create` reads a description the way it was meant (plan §3.1, §8.5)

**Status: runnable.** `node evals/run-evals.js` scores it; `--record` writes the
score into `evals/baseline.json`. Prompts: `evals/prompts/create-prose-extraction.json`.

## What is being graded

Prose mode turns a sentence into a draft spec. This eval grades the extraction:
the component name, the archetype, and every property/value pair the sentence
contains — including the canonical example from the plan, "button primary with
12px padding-top and 8px padding-bottom".

Two things joined it in v0.3.0 (plan §8):

- **The archetype joiners (§6.6).** A description that names one of the ten new
  archetypes — or one of their aliases, "a dropdown", "a snackbar", "progress
  bar" — resolves to *that* archetype and not to the nearest of the original
  five. Same scoring as every other case: the resolution is part of the reading.
- **Custom mode (§6.7).** A `custom` case is the contract-free mode, and it
  carries one extra claim: the draft's gap list must be **empty**. Recording
  only what was said is half the promise; never asking for a slot the
  description did not mention is the other half.

## Two responders

| Responder | What it grades | Needs a model? |
|-----------|----------------|----------------|
| `deterministic` | Phyllum's own extractor, running now | no |
| `recorded` | a real `claude` run following `skill/refs/create.md`, committed under `evals/fixtures/recordings/` | only to re-record |

Nothing here calls a model during a test run, and nothing invents what a model
would have said. A case with no recording is reported as unrecorded.

## Scoring

Per case, one point each for the name and the archetype, one point per expected
property whose value matches exactly, and one point of denominator (never
numerator) for any property extracted that was not expected — inventing a
property costs the same as missing one. A `custom` case scores one more point:
its gap list is empty.

**Threshold: ≥ 0.95 of the available points.** Raise it over time if you like;
lowering it needs a note in the change explaining why.
