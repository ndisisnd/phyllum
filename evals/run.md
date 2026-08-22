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
that governs the eval — `skill/refs/create/` for the `create` evals,
`skill/refs/tokenise/` plus `skill/refs/assess/` for the `tokenise-*` ones,
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

`evals/baseline.json` is stamped with the `"release"` it gates — the bar every
future change has to clear — and `"milestone"` records which change last
re-recorded it (v0.5.1 M3, which closed the release). The scores themselves
only ever go up. The bar has two halves:

| | Bar |
|---|---|
| Assertions | `npm test`, run under the filesystem-diff harness, **100% — no failures; a removed assertion is a visible, explained act, named in the change that removes it** (the GUI tests skip only when there is no `python3` on PATH) |
| Evals | every eval at or above **both** its threshold **and** the score recorded in `evals/baseline.json` |

The second half is what makes "never quietly worse" mechanical rather than
remembered: `evals/assertions/evals-baseline.test.js` re-runs every eval and
fails if a score is below its threshold *or* below the recorded number, and it
also fails if an eval disappears from the baseline — a deleted eval is a
lowered bar by another name.

Rules that go with the baseline (plan §8.5):

1. Every change ships its assertions; a new eval only when the change adds
   behaviour that must be scored rather than pass/failed.
2. A change passes only when its new checks and every prior check are green.
3. No green, no merge. There is no waiver path in v1.
4. Thresholds may be raised at any time and **never silently lowered**. Lowering
   one means editing `evals/baseline.json` and the rubric, and writing down in
   the change why — a visible, reviewable act.

Re-record with `npm run evals:record` only when the change legitimately moves a
score, and commit the new baseline with that change.

The coverage record is the test names themselves, not a hand-maintained table:
run a suite file with `node --test <file>` and it prints every test name, which
is the same information this table used to restate by hand.

### Evals

| Eval | Grades | Threshold |
|------|--------|-----------|
| `init-detection` | the framework, styling, artefacts and code-view fallback reported for six pinned codebases | 1.0 |
| `apply-prd-contract` | `apply`'s plan over pinned fixtures: which harness will execute it and from which layer, the exact set of acceptance criteria, the exclusions told apart by *reason* (unnamed vs named-for-another-role vs `TODO` spec), the phase grouping, adoption honest about not running off React, and — the criterion that outranks the rest — every criterion naming a file and a literal that are really there | 1.0 |
| `apply-run-execution` | `apply run`'s decisions either side of the agent: which criteria Node does itself and which need a model (with which of the four reasons for each), what the substitution leaves behind — role-respecting, case-insensitive, tokens declared where they are read — and whether verification can tell satisfied from not-satisfied from **cannot tell**, which is the answer that stops a phase instead of trusting an agent's word | 1.0 |
| `update-install-detection` | how Phyllum was installed, and the exact upgrade command (the id keeps the old word so baselines stay comparable), over ten pinned install layouts — npm and pnpm, global and project, one-off caches and a source checkout | 1.0 |
| `create-prose-extraction` | name, archetype and properties pulled out of a description | ≥ 0.95 |
| `create-anti-fabrication` | no value in a draft that the input did not supply | 1.0 |
| `create-token-first` | an existing token leads the suggestions for its slot | 1.0 |
| `create-extrapolation` | propose what every prior component of the kind defines, and nothing less unanimous | 1.0 |
| `create-values-free` | unconventional values recorded verbatim, never corrected | 1.0 |
| `create-image-trace` | a traced image lands within tolerance (colour ΔE < 5, lengths ±1px), unsure readings become questions, and nothing unmeasurable is invented | ≥ 0.95 |
| `create-pick-candidates` | a repeated unregistered pattern appears in the picker; a registered one and a one-off do not | 1.0 |
| `assess-clustering` | one brand blue written two ways is one token; genuinely different values stay apart; and both hold in a codebase with no stylesheet at all, because the values pass is language-agnostic | 1.0 |
| `assess-naming` | proposed names are on the documented scales, and on the right rung | 0.9 |
| `assess-severity` | v0.2.1's lint path over one pinned codebase: which rule family each finding belongs to (`raw-radius` split out from `raw-spacing`, and the two new compound families), whether it is systematic drift or a likely exception at the one documented threshold, and — the cases that outrank the rest — that `box-shadow: none` proposes nothing, that the width inside a border shorthand is not counted a second time as a length, and that a shadow with a `var()` in it goes back to seen-but-not-read rather than being half-read into a token | 1.0 |
| `assess-hygiene` | v0.2.1's hygiene checks over two pinned projects: a repository mid-migration reporting its colliding frameworks, framework majors, styling systems and theme sources with the evidence for each, a design system richer than its codebase reporting the tokens and components nothing uses, and — the cases that outrank the rest — an ordinary Tailwind app, a Next.js app, a token whose name is written though its value drifted, and a Vue project told its components were not read rather than that they are all unused | 1.0 |
| `assess-similarity` | v0.2.1's similarity pass over three pinned projects: a codebase built pair by pair, where one class apart on one tag is a clone with the more-used signature named as survivor, the same classes on a different tag is only a pattern similarity, two names for one rule and two `styled.div` templates are style duplicates, and a four-class bundle on three elements is a component nobody extracted — and, the cases that outrank the rest, an ordinary React project reporting nothing at all, a bundle repeated only twice, two unrelated elements, and a Vue project told its markup was never read | 1.0 |
| `assess-consistency` | v0.2.1's consistency checks over four pinned projects: a codebase that never agreed on how to spell anything, where the same two words in two orders and the same two words in two cases are drift with the predictable `Base + Qualifier` form suggested, the dominant convention is counted separately for classes and for components, and one camel name with no kebab twin is a stray — plus the prop half, where two names for one prop and two shapes for one prop are errors and an inline style on a component with variants is a warning — and, the cases that outrank the rest, two ordinary React projects reporting nothing at all, a BEM modifier that is evidence for the house style rather than a stray from it, a prop given one shape twice, a value the attribute scan could not read, and a Vue project told its props were never compared | 1.0 |
| `assess-report` | v0.2.1's report, score and smaller checks over five pinned projects: a codebase with all six of the smaller problems at once — two brand blues six ΔE apart, two greys four apart, a dark theme that restates two colours out of four, two tokens holding one value under different names, a `15px` padding one pixel off an eight-point scale, five unplanned z-index layers and two hardcoded breakpoints — scoring 8 of 21 and failing, an empty project scoring 1 and passing, a stale design system passing with warnings, and — the cases that outrank the rest — a light-only project never nagged about dark values, a project with no spacing tokens never told its spacing is off a scale it does not have, two ordinary projects reporting no extras at all, one error failing at the bottom of the scale while forty exceptions pass with warnings near the top, the family counts summing to the total, and every rule carrying a suggested action | 1.0 |
| `tokenise-prose-extraction` | one sentence in, the tokens out: the name when the sentence gives one, which pass and which value, whether a length's role was stated or assumed, what typography implies, and a sentence with no value coming back as a question rather than a guess — plus, from v0.3.0, the batch intake (N values are N queue entries in sentence order, several typography readings per sentence, a stranded weight word bound left, names bound to the value nearest them, duplicates collapsed) and where a name came from (the nomenclature library when the sentence signals a role, the old `color-*` scale when it does not), and three queue-loop cases that walk the conversation itself — one question per entry, in order, surviving a mid-queue skip | 1.0 |
| `delete-flow` | the order the one gated flow speaks in, over the six conversational ends `delete` has (v0.5.0 §4.2): every recorded component listed, numbered, with its archetype and its `applied` reading; the breaking-change warning arriving between the pick and the proposal rather than merely appearing somewhere; the proposal naming the entry and its Backlog lines and claiming nothing else; one acceptance gate and then the name typed back; the refusal reading the recorded flag, naming where it came from and stating the way out in order; the refusal with no flag going and reading the codebase for that one component and naming the site and its file; a skip at all three depths writing nothing and saying so, a wrong name saying so rather than asking again; the empty system pointing at `phyllum create`; and `delete token` refused with its reason, with no conversation opened | 1.0 |

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

v0.2.1 M1 does the same thing again for the same reason. `assess-severity` joins
at 1.0 — it is deterministic end to end, so there is no model variation to leave
headroom for — which makes it thirteen of fifteen at 1.0, and the three evals
below 1.0 are still the same three model-dependent ones.

And v0.2.1 M2 again, with `assess-hygiene` at 1.0 for the same reason: which
packages a manifest declares and which strings a scan saw are facts, not
judgements. Fourteen of sixteen sit at 1.0 now, and the two thresholds below it
are still the same model-dependent two.

And v0.2.1 M3 again, with `assess-similarity` at 1.0 for the third time and the
same reason, sharpened: a similarity score is set arithmetic over structure, so
`0.813` has to mean one thing on every run — a threshold below 1.0 would be
conceding that it might not. Fifteen of seventeen sit at 1.0 now, and the two
below are still the same model-dependent two.

And v0.2.1 M4 again, with `assess-consistency` at 1.0 for the fourth time —
and the threshold matters more here than anywhere before it. This is the first
family allowed to say `error` about somebody's markup, so a false positive is
not a slightly worse report, it is Phyllum telling a developer that working
code is broken. Sixteen of eighteen sit at 1.0 now, and the two below are
still the same model-dependent two.

And v0.2.1 M5 again, with `assess-report` at 1.0 for the fifth time, and for
the plainest reason yet: the score is arithmetic over counts that are themselves
arithmetic. A threshold below 1.0 would be saying that the same codebase might
score 5 on one run and 8 on the next, which would make the number worth nothing
— the whole point of a headline is that it is the same number tomorrow.
Seventeen of nineteen sit at 1.0 now, and the two below are still the same
model-dependent two.

And v0.2.1 M6, which adds no eval and moves the release stamp instead. Five
milestones kept `release` at `v0.2.0` on purpose: until a release is cut, the bar
a change has to clear is the last *released* one, and moving the stamp early
would have let each milestone measure itself against the milestone before it
rather than against the last thing anyone could install. M6 cuts v0.2.1, so the
baseline is re-recorded as `release: v0.2.1` and that becomes the bar the next
release inherits. Nineteen evals, every score met or beaten, no threshold
lowered — and none ever has been.

The two below 1.0 are still the same two, and still deliberately so. They are the
model-dependent ones, where the responder's wording is part of what is graded;
holding them at 1.0 would be pinning a model's phrasing rather than Phyllum's
behaviour, and the first model update would break a suite that had found no bug.
The headroom is the honest reading of what those two evals can actually promise.

M1 pinned two rubrics that no runner could score. M6 splits them honestly:

- **`init-detection` is scored now.** Its deterministic core — framework,
  styling, artefacts, and whether the code view is a detection or a labelled
  fallback — is a fact about a pinned fixture, and `lib/detect.js` answers it,
  so the runner grades it at threshold 1.0. The prose half of step 1 (what those
  artefacts *mean* for this project) still needs a model judge and stays with
  the rubric, unscored.
- **`help-accuracy` stays pinned and unscored, and was re-pinned again in
  v0.2.1 M6.** v0.2.0 M8 re-pinned it for the six commands that release added.
  v0.2.1 added no command at all — it is a depth release — so a case list that
  only grows when a command appears would have missed it entirely, which is
  exactly what happened between v0.1.0 M1 and v0.2.0 M8. M6 therefore pins the
  three *pages that changed*: `display` as the primary read verb with `system`
  as its alias, `assess --json`, and the drift score and verdict the assessment
  now ends in. The claim most likely to rot is pinned by name: `assess update`
  no longer accepts every proposed token, only the `error`-severity ones, and
  the old sentence read true for a whole release after it stopped being so.
  It still also pins that `tokenise` must *not* be described as scanning the
  codebase, and that `apply run` is the only command that edits source files.
  Judging whether a help text is
  still accurate to a plan section is free-text judgement end to end, and there
  is no way to score it without a model judge. It is left with a number nobody
  computed rather than given a fabricated one; the byte-level parts of `help`
  are covered by assertions instead. `evals/assertions/evals-baseline.test.js`
  enforces the honesty: an eval with no runner must say so in its prompt file
  and must not appear in the baseline.
- **`delete-flow` was pinned through M2 and is scored from v0.5.0 M3.** Every
  case in `evals/prompts/delete-flow.json` is deterministic — the flow is
  mechanical end to end, so a runner can grade it without a responder. What it
  waited on was a line in `evals/baseline.json`, and the baseline is re-recorded
  once per release, in the milestone that bumps the version. Registering the
  runner in M2 would have meant either a scored eval with no recorded bar or a
  baseline recorded against the wrong version, and both are worse than a rubric
  that says what it is. M3 registered it and recorded it in the same pass as the
  0.5.0 bump, at 1.000 over 24 checks.

  It is the twentieth eval and the first added since v0.2.1 M5, and the reason
  the list grew rather than a case being added to an existing eval is worth
  stating: `delete` is the first **gated** flow in the product, and what rots in
  a gated flow is the order it speaks in — a warning that arrives after the
  question it was meant to precede, a refusal that cannot say what it saw, a
  skip that costs something. No eval the suite already had asks that question of
  any command. The grader walks `delete`'s own pieces in `delete`'s own order,
  the way `walkQueue` has walked `tokenise`'s since v0.3.0; the bytes that move
  are `evals/assertions/delete-cli.test.js`'s to prove, and they are not
  regraded here.

## The definition of done

1. Every change ships its assertions; a new eval only when the change adds
   behaviour that must be scored rather than pass/failed.
2. A change passes only if the new checks *and* every prior check are green.
3. No green, no merge. A feature that has not passed the gate does not exist for
   release purposes; there is no waiver path in v1.
4. Thresholds may be raised over time, never silently lowered.
