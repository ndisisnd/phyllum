# Running the checks

Phyllum has two kinds of behaviour, so it has two kinds of check (plan §8.5).

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

### The filesystem-diff harness

`npm test` runs the whole suite under `evals/harness/fs-harness.js`, loaded with
`--import` so Node passes it to every test child process. It is not optional and
not per-file: one test asserts the harness is loaded, so a bare `node --test`
fails immediately. `npm run test:bare` is that bare run, kept for debugging a
harness problem — it fails the two harness-presence checks by design, and is
never the run that certifies anything.

Two guards run for the length of every run:

| Guard | What it catches |
|-------|-----------------|
| Write interception | Every mutating call in `node:fs` and `node:fs/promises`. A call made from `lib/` or `bin/` must land on an enumerated path — `DESIGN-SYSTEM.md`, `.phyllum/**`, `.claude/skills/phyllum/**`, `.gitignore` — inside a temp sandbox. Anything else fails the run it happened in. |
| Repository snapshot | The repo tree is recorded at start and compared at exit. One file added, changed or removed in the package fails the run. |

The harness is checked in `evals/assertions/fs-harness.test.js`, which also
proves it bites: a miniature package with a deliberately misbehaving module is
run under it and must exit non-zero. On top of that sits a whole-project sweep —
a real fixture codebase driven through `init`, `create`, `tokenise` and `system`
with the entire tree diffed before and after.

One file needs more than Node: `gui.test.js` starts the real Python server on an
ephemeral port inside a temp directory, talks HTTP to it, and stops it again in
a `finally` so a failure never leaves a process behind. Without a `python3` on
PATH those tests skip with a plain message rather than fail — the GUI is the one
part of Phyllum that needs something beyond Node.

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
| `deterministic` (default) | Phyllum's own answer, running now | no |
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
`skill/refs/tokenise.md` plus `skill/refs/assess.md` for the `tokenise-*` ones,
since the naming scales and the scanning contract now live in one file each —
plus the case's fixture, and
commits the reply verbatim along with the model name and the date. It is a
deliberate act, never part of a test run.

A prose `create` recording holds a draft, an image one holds a trace (the
measurements as they came back, with their confidences), and a `tokenise`
recording holds the names it proposed. All three are graded exactly as they came
back.

Image mode is the one eval where the deterministic responder does not run the
model's half of the job at all: what it grades is Phyllum's *ingestion* of a
pinned trace result from `evals/fixtures/traces/`, against the ground truth in
`evals/fixtures/images/ground-truth.json`. The images themselves are painted
from that ground truth by `evals/fixtures/images/make-images.js`, so the numbers
the tolerances are measured against are the numbers in the pixels.

**Re-record when** the prompt set changes, a reference file changes the rules, or
you move to a newer model. Commit the recordings with the change that caused
them, and re-run `npm run evals:record` so the baseline matches.

## The v1 regression baseline (M6)

`evals/baseline.json` is stamped `"release": "v1"` — the bar every future change
has to clear — and `"milestone"` records which change last re-recorded it
(v0.2.0 M6, which added `apply-prd-contract`). The v1 scores themselves
only ever go up. The bar has two halves:

| | Bar |
|---|---|
| Assertions | `npm test`, run under the filesystem-diff harness, **100% — no failures, and the count only grows** (the GUI tests skip only when there is no `python3` on PATH) |
| Evals | every eval at or above **both** its threshold **and** the score recorded in `evals/baseline.json` |

The second half is what makes "never quietly worse" mechanical rather than
remembered: `evals/assertions/evals-baseline.test.js` re-runs every eval and
fails if a score is below its threshold *or* below the recorded number, and it
also fails if an eval disappears from the baseline — a deleted eval is a
lowered bar by another name.

Rules that go with the baseline (plan §8.5):

1. Every future change ships its own assertions and evals in the same change.
2. A change passes only when its new checks and every prior check are green.
3. No green, no merge. There is no waiver path in v1.
4. Thresholds may be raised at any time and **never silently lowered**. Lowering
   one means editing `evals/baseline.json` and the rubric, and writing down in
   the change why — a visible, reviewable act.

Re-record with `npm run evals:record` only when the change legitimately moves a
score, and commit the new baseline with that change.

## What is covered today (v0.1.0 M1–M6, then v0.2.0 M1–M8)

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
| `evals/assertions/assess-scan.test.js` | `assess`'s engine: the read-only scan (proved by diffing the whole directory around it), the three passes, the language-agnostic sweep over every text file, what is never evidence — documentation, lockfiles, gitignored paths, Phyllum's own record — React-only component detection, clustering, the naming scales, coverage vs proposals, the rerun diff |
| `evals/assertions/assess-suggest.test.js` | `assess` step 4 and step 5: the mapping table over its four buckets, the token review reusing `tokenise`'s, the component pick reusing `create`'s, the "seen but not read" bucket asked about rather than guessed, and one scan feeding both tracks |
| `evals/assertions/assess-cli.test.js` | The `assess` command surface: registered and reachable, the report saying what it read, no model and no network needed, the codebase byte-identical afterwards, and the four chained modes — `tokens` and `components` walking one track each, `components` looping one candidate at a time with a consent gate each, bare `assess` recording one component per run, and `assess update` accepting the proposed tokens into `DESIGN-SYSTEM.md` alone while declining every question that would be a guess |
| `evals/assertions/apply-prd.test.js` | `apply`'s plan engine (v0.2.0 §6.5.1): harness detection and its precedence — config files beating the `.phyllum/` preference beating memory, and harnesses other than Claude Code — the host test suite detected rather than assumed, one criterion per literal per file, a token never repurposed across roles, a near-identical literal inheriting its cluster's token and saying the rendered value changes, a `TODO` component excluded by name, adoption honest about being React-only, phases grouped by kind with tokens before components, the render → parse round trip M7 depends on, and resume carrying ticks by what a criterion is about rather than by its id |
| `evals/assertions/apply-cli.test.js` | The `apply` command surface: `.phyllum/PRD.md` the only file written — proved by diffing the whole project directory before and after — no ask, confirm, model or network needed, a second run converging byte for byte, `run` reserved and honestly unbuilt, `--fresh` as the one destructive act and what it says about it, an empty design system answered with the command that fills it, and nothing to apply writing no plan at all |
| `evals/assertions/tokenise-write.test.js` | Nothing before acceptance, one file changes, tokens in the right section, Backlog reconciliation |
| `evals/assertions/tokenise-cli.test.js` | The spec tables as contract, `tokenise`/`tokenize` on a real flow, `init`'s step-4 seeding |
| `evals/assertions/gui.test.js` | The server lifecycle against a real process — localhost-only binding, PID + port record, a second `gui` reusing the first, `kill` on both the live and the stale path — plus the JSON API, the one parse contract, and the scope word as opening filter |
| `evals/assertions/evals-baseline.test.js` | Every eval has a rubric, a prompt set and a baseline it has not slipped below; the baseline is the stamped v0.2.0 bar; an unscored eval says so |
| `evals/assertions/fs-harness.test.js` | The filesystem-diff harness is loaded, classifies the §1 enumeration correctly, fails a run that writes outside it or into the repo, and a whole session over a real codebase touches nothing else |
| `evals/assertions/fault-injection.test.js` | The atomic-write sweep — every stage of the write path interrupted, including a process killed outright, and the stale temp file the next write clears |
| `evals/assertions/fault-inputs.test.js` | The malformed-input sweep (v0.2.0 M8), the other half of the fault axis: a `DESIGN-SYSTEM.md` that exists and still cannot be read, fed to all six commands that read it; a `.phyllum/PRD.md` that is unreadable, a directory, stripped of its phases, or not a plan at all; every way of breaking the one file a user hand-writes, `.phyllum/config.json`, each ignored *out loud*; and the scan meeting NUL bytes, an oversized file, an unreadable file and a dangling symlink. The bar for every case is the same three-part one: no stack trace, a message naming the file and the fix, and nothing written |
| `evals/assertions/detect.test.js` | Language and framework detection (§3.3): manifest first, files second, and the labelled React + CSS fallback for HTML, Vue, Svelte, unknown and empty projects |
| `evals/assertions/version-cli.test.js` | `version` (v0.2.0 §3): the installed version is read from package.json and hard-coded nowhere; up-to-date, outdated and ahead verdicts; every way the request can fail still exits 0; the registry is asked by this command only, once, and nothing else — no command, menu, help page or greeting — ever checks or hints |
| `evals/assertions/update-cli.test.js` | `update` (v0.2.0 §4): install detection over real sandbox layouts, the four update commands, the package manager spawned by resolved path with an argument array and never run in the tests, every refusal naming the exact command while running and writing nothing, and the skill re-sync that happens only where `init` installed a copy |

### Evals

| Eval | Grades | Threshold |
|------|--------|-----------|
| `init-detection` | the framework, styling, artefacts and code-view fallback reported for six pinned codebases | 1.0 |
| `apply-prd-contract` | `apply`'s plan over pinned fixtures: which harness will execute it and from which layer, the exact set of acceptance criteria, the exclusions told apart by *reason* (unnamed vs named-for-another-role vs `TODO` spec), the phase grouping, adoption honest about not running off React, and — the criterion that outranks the rest — every criterion naming a file and a literal that are really there | 1.0 |
| `apply-run-execution` | `apply run`'s decisions either side of the agent: which criteria Node does itself and which need a model (with which of the four reasons for each), what the substitution leaves behind — role-respecting, case-insensitive, tokens declared where they are read — and whether verification can tell satisfied from not-satisfied from **cannot tell**, which is the answer that stops a phase instead of trusting an agent's word | 1.0 |
| `update-install-detection` | how Phyllum was installed, and the exact update command, over ten pinned install layouts — npm and pnpm, global and project, one-off caches and a source checkout | 1.0 |
| `create-prose-extraction` | name, archetype and properties pulled out of a description | ≥ 0.95 |
| `create-anti-fabrication` | no value in a draft that the input did not supply | 1.0 |
| `create-token-first` | an existing token leads the suggestions for its slot | 1.0 |
| `create-extrapolation` | propose what every prior component of the kind defines, and nothing less unanimous | 1.0 |
| `create-values-free` | unconventional values recorded verbatim, never corrected | 1.0 |
| `create-image-trace` | a traced image lands within tolerance (colour ΔE < 5, lengths ±1px), unsure readings become questions, and nothing unmeasurable is invented | ≥ 0.95 |
| `create-pick-candidates` | a repeated unregistered pattern appears in the picker; a registered one and a one-off do not | 1.0 |
| `assess-clustering` | one brand blue written two ways is one token; genuinely different values stay apart; and both hold in a codebase with no stylesheet at all, because the values pass is language-agnostic | 1.0 |
| `assess-naming` | proposed names are on the documented scales, and on the right rung | 0.9 |
| `tokenise-prose-extraction` | one sentence in, one token out: the name when the sentence gives one, which pass and which value, whether a length's role was stated or assumed, what typography implies, and a sentence with no value coming back as a question rather than a guess | 1.0 |

### The two evals renamed in v0.2.0 M8

`tokenise-clustering` and `tokenise-naming` are `assess-clustering` and
`assess-naming` now. Nothing about what they grade changed — both of them scan a
fixture *codebase*, and reading the codebase has been `assess`'s job since M3,
while `tokenise` has been prose-only since M2. The ids were simply describing the
wrong command. An id is part of the recorded baseline, so renaming one is only
honest in a release that re-records the whole file, which is why it waited for M8.

The consequence worth naming: before the rename, `assess` — the centrepiece of
v0.2.0, three milestones of it — appeared to have no evals, and `tokenise`
appeared to have two that no longer described it. Both halves of that were
misfiled labels rather than missing coverage. `tokenise-prose-extraction`, added
in the same pass, is the coverage that was genuinely absent.

### Thresholds below 1.0, and why none of them rose in M8

Three thresholds sit below 1.0, and all three belong to **model-dependent** evals:
`create-prose-extraction` (0.95), `create-image-trace` (0.95) and `assess-naming`
(0.90). Every one of them scores a clean 1.000 on the deterministic responder
today, so raising them would pass — and would be a mistake.

The threshold is shared between the two responders, and the assertion suite grades
the *recorded* model runs against it too. The headroom is not slack in Phyllum's
extractor; it is the allowance for a real model's answer varying between
recordings, which is the thing these evals exist to measure. `assess-naming`'s
0.90 is the clearest case: naming is judgement, each case accepts several right
answers, and the rubric says so. Raising it to 1.0 would gate the release on one
model run choosing one accepted answer out of several.

So M8 raised no threshold. The bar rose anyway, in the way that costs nothing:
`tokenise-prose-extraction` joins at 1.0, and twelve of the fourteen evals now
sit at 1.0.

M1 pinned two rubrics that no runner could score. M6 splits them honestly:

- **`init-detection` is scored now.** Its deterministic core — framework,
  styling, artefacts, and whether the code view is a detection or a labelled
  fallback — is a fact about a pinned fixture, and `lib/detect.js` answers it,
  so the runner grades it at threshold 1.0. The prose half of step 1 (what those
  artefacts *mean* for this project) still needs a model judge and stays with
  the rubric, unscored.
- **`help-accuracy` stays pinned and unscored, and was re-pinned in M8.** Its
  case list had not moved since v0.1.0 M1, so the one eval that checks help text
  against the plan carried no case for any of the six commands v0.2.0 added.
  It now pins `version`, `update`, `assess` with its three scope words, `apply`
  and `apply run` — including the two claims most likely to rot: that `tokenise`
  must *not* be described as scanning the codebase, and that `apply run` is the
  only command that edits source files. Judging whether a help text is
  still accurate to a plan section is free-text judgement end to end, and there
  is no way to score it without a model judge. It is left with a number nobody
  computed rather than given a fabricated one; the byte-level parts of `help`
  are covered by assertions instead. `evals/assertions/evals-baseline.test.js`
  enforces the honesty: an eval with no runner must say so in its prompt file
  and must not appear in the baseline.

## The definition of done

1. Every feature ships its assertions and its evals in the same change.
2. A change passes only if the new checks *and* every prior check are green.
3. No green, no merge. A feature that has not passed the gate does not exist for
   release purposes; there is no waiver path in v1.
4. Thresholds may be raised over time, never silently lowered.
