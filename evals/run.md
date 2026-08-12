# Running the checks

Basal has two kinds of behaviour, so it has two kinds of check (plan §8.5).

| | **Assertions** | **Evals** |
|---|---|---|
| What they cover | Deterministic mechanics — files written, output text, parsing round-trips | Behaviour you can only score — understanding prose, suggesting well, refusing to invent |
| How they are graded | Pass / fail | Scored against a rubric, each with a threshold |
| Model involved | No | Only when recording; never during a run |
| Bar | **100%, always** | Every score at or above its recorded threshold |

Nothing here fakes a model call. An eval with no way to grade itself says so and
is not counted.

## Assertions

```
node --test "evals/assertions/**/*.test.js"
```

or, equivalently:

```
npm test
```

No test framework is installed: the suite uses `node:test` from the standard
library, so there is nothing to install before running it. Node 20 or newer.

Every test that writes anything works inside a throwaway temp directory. The
repository is never a test subject — `init` and `create` in particular only ever
run against a sandbox.

One file needs more than Node: `gui.test.js` starts the real Python server on an
ephemeral port inside a temp directory, talks HTTP to it, and stops it again in
a `finally` so a failure never leaves a process behind. Without a `python3` on
PATH those tests skip with a plain message rather than fail — the GUI is the one
part of Basal that needs something beyond Node.

## Evals

```
npm run evals            # score every eval and print the table
npm run evals:record     # the same, and write evals/baseline.json
```

The runner exits non-zero if any eval is below its threshold. `evals/baseline.json`
is the committed record of what each score was: the assertion suite reads it and
fails if a score drops below the threshold **or** below the last recorded number,
which is what makes "never quietly worse" checkable rather than remembered.
Thresholds may be raised at any time; lowering one is a visible edit to the
baseline and the rubric, and needs a note in the change explaining why.

### The two responders

Each judgement eval — `create`'s three, and `tokenise`'s naming — can be graded
against either of two answers to the same pinned prompt:

| Responder | What it grades | Needs a model? |
|-----------|----------------|----------------|
| `deterministic` (default) | Basal's own answer, running now | no |
| `recorded` | a real `claude` run following the same reference file the skill follows, committed under `evals/fixtures/recordings/` | only to record |

```
node evals/run-evals.js --responder recorded
```

Recordings are committed files, so grading them is as reproducible as anything
else in the suite, and the whole suite still runs on a machine with no model on
it. A case with no recording is reported as unrecorded — never filled in with
what a model "would have" said.

### Recording and re-recording

```
npm run evals:record-model                       # every model-dependent eval
node evals/record-model.js create-values-free    # one of them
node evals/record-model.js --model haiku         # pin the model
```

This shells out to the `claude` CLI once per case, hands it the reference file
that governs the eval — `skill/refs/create.md` for the `create` evals,
`skill/refs/tokenise.md` for `tokenise-naming` — plus the case's fixture, and
commits the reply verbatim along with the model name and the date. It is a
deliberate act, never part of a test run.

A prose `create` recording holds a draft, an image one holds a trace (the
measurements as they came back, with their confidences), and a `tokenise`
recording holds the names it proposed. All three are graded exactly as they came
back.

Image mode is the one eval where the deterministic responder does not run the
model's half of the job at all: what it grades is Basal's *ingestion* of a
pinned trace result from `evals/fixtures/traces/`, against the ground truth in
`evals/fixtures/images/ground-truth.json`. The images themselves are painted
from that ground truth by `evals/fixtures/images/make-images.js`, so the numbers
the tolerances are measured against are the numbers in the pixels.

**Re-record when** the prompt set changes, a reference file changes the rules, or
you move to a newer model. Commit the recordings with the change that caused
them, and re-run `npm run evals:record` so the baseline matches.

## What is covered today (M1 + M2 + M3 + M4 + M5)

| File | Covers |
|------|--------|
| `evals/assertions/menu.test.js` | Every subskill listed exactly once, aliases included |
| `evals/assertions/help.test.js` | The 2–3 line overview, word-order byte-equality, the reserved `help` word, built vs unbuilt status |
| `evals/assertions/system.test.js` | Fixture round-trip counts, zero writes, three scopes, `all` ≡ bare, unrecognised scopes |
| `evals/assertions/init.test.js` | Template scaffold, skill install, the `.gitignore` line, rerun repair with no content lost |
| `evals/assertions/design-system.test.js` | Template integrity, the fencing rule, parse → render → parse |
| `evals/assertions/permissions.test.js` | The permission model, the write funnel, atomic writes |
| `evals/assertions/cli.test.js` | Entry point, pre-init behaviour, alias equivalence, unbuilt commands |
| `evals/assertions/session.test.js` | The interactive loop, including quoting |
| `evals/assertions/package-layout.test.js` | The §7.2 layout, the skill's permission rule, the eval assets |
| `evals/assertions/create-draft.test.js` | Prose → draft spec, values verbatim, no value without an origin |
| `evals/assertions/create-contract.test.js` | Gap lists table-driven from `refs/create.md`, suggestion priority, extrapolation |
| `evals/assertions/create-write.test.js` | Nothing before acceptance, one file changes, update in place, TODOs in the block and the Backlog |
| `evals/assertions/create-cli.test.js` | The `create` command surface and the route to the intelligence |
| `evals/assertions/create-image.test.js` | Image mode: file validation, the trace request, ingestion (values vs questions vs refusals), output as text, the write funnel staying shut, and the dashboard's image queue being drained |
| `evals/assertions/create-pick.test.js` | Pick mode: the read-only markup scan, archetypes plus candidates, registered components dropping out, a pick seeding no values, and the follow-up loop it enters |
| `evals/assertions/tokenise-scan.test.js` | The read-only scan, the three passes, clustering, the naming scales, the rerun diff |
| `evals/assertions/tokenise-write.test.js` | Nothing before acceptance, one file changes, tokens in the right section, Backlog reconciliation |
| `evals/assertions/tokenise-cli.test.js` | The spec tables as contract, `tokenise`/`tokenize` on a real flow, `init`'s step-4 seeding |
| `evals/assertions/gui.test.js` | The server lifecycle against a real process — localhost-only binding, PID + port record, a second `gui` reusing the first, `kill` on both the live and the stale path — plus the JSON API, the one parse contract, and the scope word as opening filter |
| `evals/assertions/evals-baseline.test.js` | Every eval has a rubric, a prompt set and a baseline it has not slipped below |

### Evals

| Eval | Grades | Threshold |
|------|--------|-----------|
| `create-prose-extraction` | name, archetype and properties pulled out of a description | ≥ 0.95 |
| `create-anti-fabrication` | no value in a draft that the input did not supply | 1.0 |
| `create-token-first` | an existing token leads the suggestions for its slot | 1.0 |
| `create-extrapolation` | propose what every prior component of the kind defines, and nothing less unanimous | 1.0 |
| `create-values-free` | unconventional values recorded verbatim, never corrected | 1.0 |
| `create-image-trace` | a traced image lands within tolerance (colour ΔE < 5, lengths ±1px), unsure readings become questions, and nothing unmeasurable is invented | ≥ 0.95 |
| `create-pick-candidates` | a repeated unregistered pattern appears in the picker; a registered one and a one-off do not | 1.0 |
| `tokenise-clustering` | one brand blue written two ways is one token; genuinely different values stay apart | 1.0 |
| `tokenise-naming` | proposed names are on the documented scales, and on the right rung | 0.9 |

`tokenise-naming` is the one threshold below 1.0, deliberately: naming is
judgement, each case accepts more than one right answer, and the rubric says why.

M1's two rubrics — `init-detection` and `help-accuracy` — stay pinned but are not
scored: both need a model judging free text rather than a comparison to a pinned
answer, which is the M6 eval harness's job.

## The definition of done

1. Every feature ships its assertions and its evals in the same change.
2. A change passes only if the new checks *and* every prior check are green.
3. No green, no merge. A feature that has not passed the gate does not exist for
   release purposes; there is no waiver path in v1.
4. Thresholds may be raised over time, never silently lowered.
