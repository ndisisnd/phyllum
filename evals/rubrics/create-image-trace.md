# Eval — `create` image mode traces honestly (plan §3.1 Mode B, §8.5)

**Status: runnable.** Prompts: `evals/prompts/create-image-trace.json`.

## What is being graded

The plan asks for reference images with known ground truth, traced to within
tolerance, with anything under confidence surfaced as a follow-up question and
nothing unmeasurable invented. This eval grades all three of those, and the
division of labour matters:

- **The measuring is not graded here.** Vision belongs to Claude Code (plan
  §7.3), and no eval in this repo calls a model. What is graded is the frame
  Phyllum puts around a trace: which measurements it lets become values, which it
  turns into questions, and what it refuses outright.
- **The input is a pinned trace result** under `evals/fixtures/traces/` — a
  plausible reply in the documented shape, deliberately including readings that
  are slightly off, readings below their confidence bar, and one claim about
  something a still image cannot show. Grading it is reproducible on a machine
  with no model on it.
- **The ground truth is the image itself.** `evals/fixtures/images/` is painted
  by `make-images.js` from the numbers in `ground-truth.json`, so the truth the
  tolerances are measured against is what is actually in the pixels.
- **The `recorded` responder** grades a real `claude` trace of the same image,
  committed under `evals/fixtures/recordings/create-image-trace/`. Missing
  recordings are reported as missing, never filled in.

## Scoring

One point per claim, and the claims are:

| Claim | Point |
|-------|-------|
| A measurement above its confidence bar is in the draft | 1 per property |
| …and is within the tolerance the contract table states — colour ΔE < 5, lengths ±1px | 1 per property |
| A reading below its bar is a question, and **not** a value | 1 per property |
| Something listed as unmeasurable is a question, and **not** a value | 1 per property |
| A claim about a property an image cannot show is refused | 1 per property |
| Every value in the draft traces back to a measurement in the trace result | 1 per case |
| Every state in the archetype's contract is asked about, never traced | 1 per case |

**Threshold: 0.95.** The tolerance-graded half of this eval is measurement, so a
single borderline reading should not fail a run outright. The invariant half —
questions, refusals, nothing invented — is what the recorded baseline of 1.0
holds in place: any drop there is a visible regression, not a rounding.
