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

`evals/baseline.json` is stamped with the `"release"` it gates — the bar every
future change has to clear — and `"milestone"` records which change last
re-recorded it (v0.4.0 M7, which closed the release). The scores themselves
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

## What is covered today (v0.1.0 M1–M6, v0.2.0 M1–M8, v0.2.1 M1–M6, v0.3.0 M1–M7, v0.4.0 M1–M7)

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
| `evals/assertions/assess-scan.test.js` | `assess`'s engine: the read-only scan (proved by diffing the whole directory around it), the three passes, the language-agnostic sweep over every text file, what is never evidence — documentation, lockfiles, gitignored paths, Phyllum's own record — React-only component detection, clustering, the naming scales, coverage vs proposals, the rerun diff — and (v0.4.0 M1, locked in M7) an `assess` run against an rgba-recorded colour still reporting it as covered in every spelling a stylesheet writes it, with the cross-format limit stated rather than left to be discovered: `knownValues` holds both readings of a colour, `assess` asks with the string one, and widening it is a change to `assess`'s convergence rather than to `tokenise`'s |
| `evals/assertions/assess-suggest.test.js` | `assess` step 4 and step 5: the mapping table over its four buckets, the token review reusing `tokenise`'s, the component pick reusing `create`'s, the "seen but not read" bucket asked about rather than guessed, and one scan feeding both tracks |
| `evals/assertions/assess-severity.test.js` | The severity engine and the two compound passes (v0.2.1 §3): the threshold read from its table rather than restated in code and applied alike to every family, the six rule families with `raw-radius` findable by its own name, scanners and clustering staying neutral while aggregation does the judging, a covered value carrying a family but no severity and an unread one carrying a severity but no family, the summary derived from the rows so it cannot disagree with them, `assess update` writing the drift and declining the exceptions while the interactive review still offers both, and — for the compounds — the normalisation grammar (layers, zeroes, colour case, a `var()` making the whole value unreadable), clustering part for part but never across shapes, the shadow ladder, a shadow token owning `box-shadow` and not `border`, and the double-count that must not happen when a shorthand's width is read as a border |
| `evals/assertions/assess-hygiene.test.js` | The hygiene checks (v0.2.1 §6): detection keeping its single-winner contract while reporting the evidence behind it, families counted rather than labels so Next is not a second React, plain HTML never a rival to a framework, an `npm:` alias read as the package it aliases, a Tailwind entry stylesheet not counted as a second styling system, `DESIGN-SYSTEM.md` never a rival theme source, every hygiene severity read from its table, the coverage split run backwards over tokens and components, a token saved by its name after its value drifted, the bounded-scan caveat carried on every finding and printed next to the rows it applies to, a stack with no component pass told the question was not asked, and `assess update` leaving every stale row exactly where it found it |
| `evals/assertions/assess-similarity.test.js` | The similarity pass (v0.2.1 §4): every weight, band and cap read from its table rather than restated in code, the parts of a score summing to one so a score cannot leave [0, 1], both sides of both band boundaries, class *words* compared so `btn--primary` and `btnPrimary` meet, the tag a bonus and never a gate, a survivor chosen by use and by name only when use ties, a bare element never compared at all, a bundle needing both its thresholds and never one the system already registers, a styled-components template read out of a plain `.js` file, a configuration object refused as a style block, one rule read twice out of one file not counted as a duplicate, the cap stopping the comparison and the report saying so, a Vue project told its markup was not read while its stylesheets still were, an ordinary project told plainly that nothing is alike, the same codebase scoring byte-identically on every run, similarity counted beside the value findings and never folded into them, and — the promise the section rests on — a merge suggested, never made, with no write call anywhere in the module |
| `evals/assertions/assess-consistency.test.js` | The consistency checks (v0.2.1 §5): every convention, severity, synonym, value kind and cap read from its table rather than restated in code, drift being the same word set spelled twice and never an abbreviation resolved by guesswork, classes and components kept as separate populations so a `Card` rendering a `card` is not a finding, a registered component absorbing every spelling of itself, the dominant convention counted rather than assumed — earned by evidence, held by a majority, and a BEM name counted as the kebab it is a spelling of rather than as a rival to it — a codebase with no house style told so, a name reported as drift never reported again as a stray, the base of a suggestion being the reused word and never a variant word, the attribute reader getting a nested object whole and a lowercase tag not at all, two names for one prop and two shapes for one prop as errors while a style bypass with no variant to bypass is not a finding at all, a value the scan could not read counted and never compared, two ordinary React projects reporting nothing, a Vue project told the question was not asked, the same codebase reading identically on every run, consistency counted beside the other findings and never folded into them, and — the promise the section rests on — a rename suggested, never made, with no write call in either module |
| `evals/assertions/assess-report.test.js` | The report, the score and the smaller checks (v0.2.1 §7, §8): every extra rule read from its table with its own severity, near-duplicate colours bounded above by the distance row and below by the clustering threshold so a pair here is two values the code keeps apart and an eye cannot, a dark counterpart defined per styling system — by name where colour is written by name, by property where it is written by value — and the whole token half declining to run rather than calling every token a gap when no token is restated in a dark scope, a spacing value on the scale never reported and one a pixel off it reported as an error at any frequency, z-index a sprawl only past its threshold and a breakpoint a finding only while no token names it, the seven Fibonacci steps all reachable with no holes and monotonic in the mass, a family the weights table does not name unable to inflate anything, the family counts summing to the overall count, `clean` being exactly `verdict === 'pass'`, a small failure and a large pass both expressible because the verdict is never derived from the score, every rule having a suggested action and no rule inventing one, and every chained mode carrying the same findings, score and verdict |
| `evals/assertions/utilities.test.js` | The three utilities (v0.2.1 §6.5): `--json` in both spellings with a scope word after it read as a mode and never as a filename, the file parsing and holding the object the report renders from, two identical runs writing byte-identical files with no timestamp, no absolute path and no raw sightings in them, one file written and no question asked, a path of your own checked rather than trusted and refused without falling back to another, `assess update --json` refused non-zero with both halves of the reason, a first write taking no backup and every later one leaving a `.bak` equal to the pre-edit file, the backup being one undo ago rather than a history, a failed backup provably aborting the edit with the design system byte-identical afterwards, the backup taken in the funnel so no writer can skip it, and `display` and `system` byte-for-byte identical at every scope |
| `evals/assertions/assess-cli.test.js` | The `assess` command surface: registered and reachable, the report saying what it read, no model and no network needed, the codebase byte-identical afterwards, and the four chained modes — `tokens` and `components` walking one track each, `components` looping one candidate at a time with a consent gate each, bare `assess` recording one component per run, and `assess update` accepting the proposed tokens into `DESIGN-SYSTEM.md` alone while declining every question that would be a guess |
| `evals/assertions/apply-prd.test.js` | `apply`'s plan engine (v0.2.0 §6.5.1): harness detection and its precedence — config files beating the `.phyllum/` preference beating memory, and harnesses other than Claude Code — the host test suite detected rather than assumed, one criterion per literal per file, a token never repurposed across roles, a near-identical literal inheriting its cluster's token and saying the rendered value changes, a `TODO` component excluded by name, adoption honest about being React-only, phases grouped by kind with tokens before components, the render → parse round trip M7 depends on, and resume carrying ticks by what a criterion is about rather than by its id |
| `evals/assertions/apply-run.test.js` | `apply run`'s decision layer (v0.2.0 §6.5.2): the plan's own defaults driving a run with no config file and the two models read from the plan rather than hard-coded, `.phyllum/config.json` overriding both models and the cadence with a malformed setting ignored for a stated reason and a corrupt file answered in silence rather than a crash, the `init`-recorded `session.json` preference still honoured, the mechanical/agent split with a reason per criterion, a criterion with no properties never guessed at, a token the design system no longer records never invented, and the substitution touching only the properties its criterion names |
| `evals/assertions/apply-e2e.test.js` | `apply run` end to end against real git repositories (v0.2.0 §6.5.3, §7), with no model and no network reachable: a wholly mechanical plan running to completion one commit per phase on its own branch, a finished plan doing nothing and saying so, a mixed phase stopping and naming the model it needed, an orchestrated phase still verified by reading the file so an agent reporting success without doing the work gets no tick, an edit outside the phase's criteria stopping the phase uncommitted, a red host suite stopping before the commit and a resume finishing it, and the four refusals that come before any branch is made — a dirty tree, a directory that is not a repository, a repository with no commits, and one with no commit identity |
| `evals/assertions/apply-cli.test.js` | The `apply` command surface: `.phyllum/PRD.md` the only file written — proved by diffing the whole project directory before and after — no ask, confirm, model or network needed, a second run converging byte for byte, `run` reserved and honestly unbuilt, `--fresh` as the one destructive act and what it says about it, an empty design system answered with the command that fills it, nothing to apply writing no plan at all, and — from v0.4.0 §6.1 — `apply` carrying no alias at all, `phyllum update` writing no PRD under any argument, and `apply` reaching neither the upgrade path nor a child process |
| `evals/assertions/update-cli.test.js` | The `update` command surface (v0.4.0 §6): its own registry entry with `component` and `token` as reserved chain words read from `refs/update.md`, `update run` gone, no argument writing `.phyllum/PRD.md`, the empty-run menu printing both rows plus the 0.4.x `apply` breadcrumb — and nothing else printing it — the type picker, the full token list of the picked section with Numbers narrowed by its own role, an empty section pointing at `tokenise` rather than dead-ending, the change question rendering the hint its table row declares, prose matching a recorded name exactly or being asked about rather than guessed, a rename rewriting every referencing spec slot and every Backlog `TODO` line naming the old token in one write and nothing else, a cross-format value collision surfaced before the gate is ever reached, nothing written before the gate, the `.bak` taken before the one write, and — from M6 — `update component` listing every recorded component with the archetype its spec block records and inventing none for an entry that has no spec block, a system with no components pointing at `create` rather than dead-ending, the change landing as a revision through `create`'s own machinery so what the sentence names changes and every other slot stays byte-identical, a slot named without a value asked about and a skipped question recorded as a `TODO`, a custom keeping its marker through the revision, one component and its tokens in a sentence read as a component sentence while two components still ask |
| `evals/assertions/tokenise-write.test.js` | Nothing before acceptance, one file changes, tokens in the right section, Backlog reconciliation |
| `evals/assertions/tokenise-cli.test.js` | The spec tables as contract, `tokenise`/`tokenize` on a real flow, `init`'s step-4 seeding — and (v0.4.0 §4, §4.4) the kind picker an empty run opens: the resume offer still first, the five rows read from their table rather than spelled in the renderer, a number and a row's own word both picking, free text at any depth read as a full sentence, the solid/gradient fork under colour, the prose each pick builds so a pre-answered role question never fires, the bracketed hint every value question wears coming from its table row, and a `--no-input` run still printing usage and exiting 1 |
| `evals/assertions/tokenise-prose.test.js` | Reading one sentence: the batch queue and its splitting grammar, names binding to the value nearest them, duplicates collapsed — and (v0.4.0 §3, §5) channel-level comparison in both directions with alpha kept as a distinguishing fact, values recorded byte-identically for every format, and the six gradient shapes each read as one colours-pass value whose internal commas never split a batch sentence |
| `evals/assertions/gui.test.js` | The server lifecycle against a real process — localhost-only binding, PID + port record, a second `gui` reusing the first, `kill` on both the live and the stale path — plus the JSON API, the one parse contract, the scope word as opening filter, and (v0.3.0 §6.5) the swatch contract lifted out of the page and run against a fixture: every colour token a swatch element, near-white values bordered at the threshold `refs/gui.md` records, a primitives ramp rendered as one nine-step strip, and the page still self-contained — no webfont, no CDN, no network call of any kind — plus (v0.4.0 §5.5) the card contract: every colour token one card holding a swatch, a name node and a value node in that order, the cards inside a grid container, the rounded-corner departure recorded in `refs/gui.md` rather than in the stylesheet alone, a gradient value appearing as the swatch fill, and primitives ramps keeping their strip treatment rather than becoming cards |
| `evals/assertions/nomenclature.test.js` | The nomenclature library (v0.3.0 §4): the slots, their order and their strict word lists read from `refs/nomenclature.md` rather than restated in code, the word lists disjoint so a name is never ambiguous, the name walk enforcing slot order without a regexp — `interaction-primary-hover` well-formed and `hover-interaction` refused with a reason — composition going through the same table the checker reads so a suggestion can never be a name the checker rejects, and every failure in the reader naming the file and raising one error type |
| `evals/assertions/primitives.test.js` | `create primitives` (v0.3.0 §5, §5.5): the neutral ramp equal to the shipped table exactly, a derived ramp byte-identical across two runs, the recorded value slotted at its nearest step unchanged, nothing generated for a token answered no, a complete ramp reported rather than re-offered and a partial one offering only its missing steps, steps named with the number glued on, rows landing under `Primitives` inside Colours, Colours rendering `token \| value` with no `notes` cell anywhere — and (M7) the ends of the scale: black, white and a zero-saturation token deriving nine usable values, three- and eight-digit hex and a functional notation all kept as the file spells them, an unreadable value deriving nothing at all, a base name already ending in digits still making nine distinct steps, and `nearestStep` total over every lightness including past both ends |
| `evals/assertions/create-custom.test.js` | Custom components (v0.3.0 §6.7): no mandatory slots, no mandatory states and no gap list, the spec recording exactly what was described and complete when the user says so, the `archetype: custom` marker written into the spec block so every contract lookup comes back empty by design — and read by `assess`'s component matching, extrapolation and `apply`'s adoption, each skipping rather than grading it — custom last in the pick menu and never where prose that matches an archetype lands, and everything non-negotiable still holding: no invented values, the same file shape, rerunnable as a revision, one acceptance gate, one write |
| `evals/assertions/evals-baseline.test.js` | Every eval has a rubric, a prompt set and a baseline it has not slipped below; the baseline is the stamped v0.4.0 bar; an unscored eval says so |
| `evals/assertions/fs-harness.test.js` | The filesystem-diff harness is loaded, classifies the §1 enumeration correctly, fails a run that writes outside it or into the repo, and a whole session over a real codebase touches nothing else |
| `evals/assertions/fault-injection.test.js` | The atomic-write sweep — every stage of the write path interrupted, including a process killed outright, and the stale temp file the next write clears |
| `evals/assertions/fault-inputs.test.js` | The malformed-input sweep (v0.2.0 M8), the other half of the fault axis: a `DESIGN-SYSTEM.md` that exists and still cannot be read, fed to all six commands that read it; a `.phyllum/PRD.md` that is unreadable, a directory, stripped of its phases, or not a plan at all; every way of breaking the one file a user hand-writes, `.phyllum/config.json`, each ignored *out loud*; and the scan meeting NUL bytes, an oversized file, an unreadable file and a dangling symlink. The bar for every case is the same three-part one: no stack trace, a message naming the file and the fix, and nothing written. Extended in v0.3.0 M7 over the surfaces this release added: nine hostile shapes for a `.phyllum/session.json` queue entry plus a half-written file, none of them resumable and none of them reaching the user as a proposal about nothing; five doctored vocabulary tables, each one error type carrying the file and answered with the cause and `phyllum upgrade`; six malformed design-system files served and then walked by the dashboard's own renderer; and the swatch escape contract — only a hex literal is ever inlined into a `style` attribute. Extended again in v0.4.0 M7 over the three things this release made new: the **contract tables**, now tolerant in three files rather than one — twelve hostile rows across `refs/tokenise.md`'s picker, fork, value questions, gradient scale and comparison table and every one of `refs/update.md`'s seven, each dropped with a notice naming its file as well as its table, each leaving the rest of its table working, and none of them ever printed to a user as a numbered option resolving to nothing; a **hand-mangled `DESIGN-SYSTEM.md`** met by the editing verb — a token row with no value or no name left out of the list with the omission said out loud, a component heading with no spec block listed honestly and revised by nobody, and a rename ripple over a file with no Backlog and no Components section at all; the **two rename refusals** convergence did not cover, a new name already taken and an old name sitting on two rows, both surfaced before the gate with nothing written while a value change on the same duplicated name still edits its own row alone; sixteen **picker runs** across `tokenise` and all three `update` entry points against an answer stream that is at EOF, garbage, `null` or a number no row carries, every one ending rather than looping and writing nothing; and the card renderer met by seven hostile gradient values, none of which reaches a `style` attribute or survives as markup |
| `evals/assertions/detect.test.js` | Language and framework detection (§3.3): manifest first, files second, and the labelled React + CSS fallback for HTML, Vue, Svelte, unknown and empty projects |
| `evals/assertions/version-cli.test.js` | `version` (v0.2.0 §3): the installed version is read from package.json and hard-coded nowhere; up-to-date, outdated and ahead verdicts; every way the request can fail still exits 0; the registry is asked by this command only, once, and nothing else — no command, menu, help page or greeting — ever checks or hints |
| `evals/assertions/upgrade-cli.test.js` | `upgrade` (v0.2.0 §4, renamed in v0.3.0 §6): install detection over real sandbox layouts, the four install commands, the package manager spawned by resolved path with an argument array and never run in the tests, every refusal naming the exact command while running and writing nothing, and the skill re-sync that happens only where `init` installed a copy |

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

## The definition of done

1. Every feature ships its assertions and its evals in the same change.
2. A change passes only if the new checks *and* every prior check are green.
3. No green, no merge. A feature that has not passed the gate does not exist for
   release purposes; there is no waiver path in v1.
4. Thresholds may be raised over time, never silently lowered.
