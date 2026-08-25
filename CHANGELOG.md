# Changelog

All notable changes to this project will be documented here.

## 2026-08-25

### [42] — A build report is the thing you approve, not a receipt for a write

- `server/serve.py`: Fixed — `build_reports_json`'s docstring said a report is only written after approval. The gate writes the report first, because the report is what the user reads before deciding. A declined run keeps its report on disk as the record of what was proposed; only a yes edits `DESIGN-SYSTEM.md`

## 2026-08-24

### [41] — The dashboard offers a build entry that mirrors the terminal flow

- `gui/index.html`: Added — a Build view listing every `build-report-[n].md`, rendering the selected report, and mirroring the terminal build path so neither surface leads the other
- `lib/build-reports-json.js`: Added — the read-only feed the dashboard renders build reports from, shaped exactly as the assessment-report feed is
- `server/serve.py`: Added — the build-reports endpoint, read-only like `reports_json`; the server never writes a report
- `skill/refs/gui/gui.md`: Changed — documents the Build view and how it reaches the report feed
- `skill/refs/gui/server.md`: Changed — documents the new endpoint and its read-only contract
- `evals/assertions/gui-build-reports.test.js`: Added — the feed shape, the view's rendering, and the read-only guarantee

### [40] — Building never edits your codebase until you approve the report

- `skill/refs/build/gate.md`: Added — the approval gate: a build writes its report, then stops. Nothing reaches `DESIGN-SYSTEM.md` until the user says yes
- `lib/build-reports.js`: Changed — large drift now splits the report into ordered phases, so replacements happen one careful phase at a time rather than in one sweep
- `lib/create-command.js`: Changed — the command routes through the gate instead of writing straight through
- `lib/registry.js`: Changed — the Build commands declare the gate
- `skill/refs/build/build.md`, `skill/refs/build/report.md`, `skill/SKILL.md`: Changed — the gate and the phasing rule are written into the stage protocol
- `evals/assertions/build-reports.test.js`, `evals/assertions/create-pick.test.js`, `evals/assertions/create-write.test.js`: Changed — the gate holds, a decline writes nothing, and phases come out ordered

### [39] — Every build leaves a numbered report under `.phyllum/`

- `lib/build-reports.js`: Added — writes `build-report-[n].md`, numbered the way assessment reports are, and maps each report to the drift report it answers or the prose input it came from
- `lib/create-command.js`: Changed — emits a report on every build
- `lib/write.js`: Added — the report write path
- `skill/refs/build/report.md`: Added — the report's shape and its mapping rule
- `skill/refs/build/build.md`, `skill/SKILL.md`: Changed — the stage now names its output
- `evals/assertions/build-reports.test.js`, `evals/assertions/create-write.test.js`, `evals/assertions/session.test.js`: Added/Changed — numbering, mapping, and one report per build

### [38] — Build picks up where Assess left off, with no restating

- `lib/build-input.js`: Added — resolves Build's input from the latest drift report's recommendations, so Assess and Build chain without the user repeating themselves. Explicit prose input overrides the default
- `lib/assess-reports.js`: Added — finds the latest drift report to read from
- `lib/create-command.js`, `lib/registry.js`, `lib/reports-json.js`: Changed — the Build commands take their input through the resolver
- `skill/refs/build/input.md`: Added — the resolution order and the override rule
- `skill/refs/build/build.md`, `skill/SKILL.md`: Changed — the stage now names its input
- `evals/assertions/build-input.test.js`, `evals/assertions/create-pick.test.js`: Added — the drift-report default, the prose override, and the fallback when no report exists

### [37] — `create`/`build`, `tokenise` and `apply` now live under the Build stage

- `skill/SKILL.md`: Changed — the three commands are formally re-homed under Build instead of sitting in a flat menu
- `skill/refs/build/build.md`: Added — the Build stage protocol: what the stage takes in, what it puts out, and what it must never do on its own
- `lib/registry.js`: Changed — each command declares Build as its stage
- `README.md`: Changed — the pipeline section names Build
- `evals/assertions/refs-layout.test.js`: Changed — the new `refs/build/` layout is asserted
- Prose and image entry points are untouched

### [36] — The release script now moves the baseline's release stamps with the version

- `evals/release.js`: Added — `bumpGraders`, rewriting `MILESTONE` and `RELEASE` in `graders.js` before the recorder runs, so the manifest, the baseline's stamps and its scores move as one act. It throws when it matches nothing, because a silent no-op puts the stamp back out of step and says so nowhere
- `evals/graders.js`: Changed — the two stamps now read `v0.9.0`; v0.9.0's scores had been recorded under the name "v0.8.0 release", which is the stale-baseline failure the script exists to prevent, moved one field along
- `evals/run-evals.js`: Changed — `recordedAt` reads the local calendar rather than `toISOString()`, so a baseline is never dated a day behind whoever cut the release
- `evals/assertions/release-script.test.js`: Added — the four-step order, both stamps moving with a minor bump, and the refusal when neither constant is found

### [35] — A drift report is dated by the reader's calendar, not UTC's

- `lib/assess-reports.js`: Changed — `reportDate` reads local date parts instead of `toISOString()`. Run `assess` at 04:00 in +08 and the report used to say yesterday; a working document somebody reads beside their own calendar should not be a day they have to second-guess. Byte-stability is unaffected — the injection seam already supplies it
- `evals/assertions/assess-reports.test.js`: Changed — the existing date assertion was itself zone-dependent (a `Z`-suffixed literal) and is now built from local parts; a new assertion pins the local reading. The suite passes in UTC, +08, −07 and +14

### [34] — The dashboard gains a Reports view, rendering every assessment as tables

- `gui/index.html`: Added — a fourth view under the Assess stage listing every `.phyllum/assess-[n].md` newest first, and rendering one as tables: drift findings and recommendations as rows rather than a wall of prose
- `lib/reports-json.js`: Added — the GUI-only reader; numbering, paths and the recommendations block come back through `lib/assess-reports.js`, and it parses only the prose sections nothing else parses. No write path in it
- `server/serve.py`: Added — `GET /reports`, shaped exactly like the existing `GET /system`: the route shells out to a read-only Node view, so the server still owns no parser of its own
- `skill/refs/gui/gui.md`, `server.md`: Changed — "Three views" becomes four; the route row and the parse contract widen
- `evals/assertions/gui-reports.test.js`: Added — 15 assertions covering order, the empty case, the recommendations rows, and the four states told apart rather than flattened (no reports, no block, an empty block, an unreadable report)

### [33] — `assess` writes a numbered report, and gains `score` and `drift` modes

- `lib/assess-command.js`: Added — a full run now writes exactly one `.phyllum/assess-[n].md`, numbered one past the highest that exists so a deleted report is never written over. A failed write exits 1 rather than reporting success over a stale report
- `lib/assess-command.js`: Added — `score` prints the drift score and verdict alone, naming the rubric it was computed against; `drift` prints the comparison against `DESIGN-SYSTEM.md` alone. Neither writes a byte, and both run the same scan as a full run, so the number at a prompt and the number in a report cannot disagree
- `lib/registry.js`: Changed — the `assess` row grows to seven modes and eight args; a wrong word now lists all five reserved words rather than three
- `skill/refs/assess/report.md`, `protocol-assess-rubric.md`: Changed — the three parsed score markers move to the rubric, which is their subject. The parse is byte-identical, since `lib/refs.js` joins a folder before parsing
- `skill/refs/assess/modes.md`, `assess.md`, `README.md`, `llms.txt`, `skill/SKILL.md`: Changed — the two new modes and the new write target recorded on every surface that lists them
- `evals/assertions/assess-cli.test.js`, `assess-report.test.js`: Changed — the read-only assertions now name the report as the one thing a run adds, and still pin nothing changed and nothing removed

### [32] — The health score gets a written rubric

- `skill/refs/assess/protocol-assess-rubric.md`: Added — six metric families each tied to the module that produces it, points per family per severity, and the existing 1–21 scale and three verdicts restated rather than replaced. The determinism boundary is explicit: judgement may add prose, ordering and notes, and may never touch a count, a mass, a step or a verdict

### [31] — The Assess stage gets a protocol that names it end to end

- `skill/refs/assess/protocol-assess.md`: Added — scan, hardcoded-value detection, comparison against `DESIGN-SYSTEM.md`, score, report emission. Hardcoded-value detection is stated as a step inside the protocol, with the alternatives ruled out by name — no `assess hardcoded`, no `--lint`, no sibling command. A spine over the existing topic refs, not a second rulebook: where the two disagree, the topic file wins
- `skill/SKILL.md`: Changed — the `assess` ref row names both new protocol files

### [30] — Numbered, dated drift reports under `.phyllum/`

- `lib/assess-reports.js`: Added — numeric report numbering that is gap-safe and never renumbers, an injectable per-report date, a five-section lightweight template (date, summary, drift, health score, recommendations), and a fenced `phyllum-recommendations` JSON block carrying one entry per rule for v0.10.0 Build to consume without a model
- `lib/write.js`: Added — `ASSESS_REPORT_PREFIX`, `assessReportFile`, `writeAssessReportFile` beside the existing `assess --json` target, so the stage's output is on the list of things Phyllum may write
- `evals/assertions/assess-reports.test.js`: Added — numeric ordering, gap handling, strangers in `.phyllum/` ignored, date injectability, template shape, block parseability, prose/block agreement, and a whole-directory diff showing one file added and nothing else

### [29] — The README announces 0.8.0

- `README.md`: Changed — the header release blurb rewritten from 0.7.3 to 0.8.0 (the four-stage pipeline and the `pipeline` command)

### [28] — The dashboard's nav now reads as the pipeline: four stage labels over the same three views

- `gui/index.html`: Changed — the view rail's single "Dashboard" label becomes four stage labels (Assess holds Library, Build holds Workbench and Token view); Governance and Refine appear with a quiet "nothing yet" chip. No view added, removed or renamed; routes, polling and the self-contained-file rules untouched
- `skill/refs/gui/gui.md`: Added — "The view rail, grouped by pipeline stage (v0.8.0 §4)" section recording the stage-to-view mapping as the live contract

### [27] — A new `pipeline` command prints the four stages and reads where your project sits

- `lib/pipeline.js`: Added — the whole command: the stage listing generated from the registry, and a read-only derivation of the project's position from what is on disk (DESIGN-SYSTEM.md, its recorded tokens/components, `applied:` readings, `.phyllum/`). No model, no network, nothing written; an unreadable file is reported rather than guessed past
- `lib/registry.js`: Added — the `pipeline` row, `stage: system`, no aliases
- `lib/execute.js`: Added — the dispatch case, deliberately outside the needs-design-system gate: "no DESIGN-SYSTEM.md here" is one of the positions the command exists to report
- `lib/menu.js`: Changed — `EMPTY_STAGE_NOTE` and `commandLine` exported so the menu and `pipeline` cannot word the same fact two ways
- `evals/assertions/pipeline.test.js`: Added — 11 assertions: stage order, membership, the empty-stage line byte-for-byte, four position derivations, the unreadable-file refusal, no-writes
- `skill/SKILL.md`, `README.md`: Added — the command's row in each table

### [26] — The menu groups commands under their pipeline stage instead of a flat list

- `lib/menu.js`: Changed — `renderMenu()` iterates the registry's stages in pipeline order; each stage prints as `Label — question` with its commands beneath, an empty stage says "(nothing here yet — arrives in a later release)", and System commands group last under a Tooling heading. Both the `menu` command and the interactive session share this one funnel

### [25] — Phyllum's commands now declare which of four pipeline stages they belong to

- `lib/registry.js`: Added — `STAGES` (Assess, Governance, Build, Refine — each with id, label and the question it answers), `SYSTEM_STAGE`, `STAGE_IDS`, and a `stage` field on every command; Governance and Refine ship empty on purpose, because an empty stage is still a real stage
- `skill/SKILL.md`: Added — "The pipeline — four stages (v0.8.0)" section (pipeline order ≠ delivery order; each stage can run alone) and a Stage column on the Commands table

### [24] — The README announces 0.7.3

- `README.md`: Changed — the header release blurb rewritten from 0.7.2 to 0.7.3 (the widened typography readings)
- `llms.txt`: Changed — the same fact, one line


### [23] — 0.7.3: one new eval scores the questions, and the release bump is cut as one act

- `evals/prompts/tokenise-readings-conversation.json`, `evals/rubrics/tokenise-readings-conversation.md`, `evals/graders.js`, `evals/run.md`: Added — **the conversation eval**: thirteen cases scoring the two v0.7.3 behaviours that are judgement rather than pass-or-fail — the one follow-up asked after the three core readings, and the conflict questions. It runs on the deterministic responder and calls no model, walking `parseProse`, `readingsQuestion`, `followUpReadings`, `conflictQuestions`, `settleConflict` and `nearDuplicate` in the real order. Two cases are deliberate counter-cases — `underline` with `strikethrough` is never a question, and a plain repeat is still already-named — because an eval that only checks the questions get asked cannot tell a question from a habit
- `evals/graders.js`: Changed — `MILESTONE` and `RELEASE` move to `v0.7.3 M7` / `v0.7.3`, the milestone that cuts the release, so the recorded baseline stamps itself correctly
- `evals/baseline.json`: Changed — re-recorded as `release: v0.7.3`, 21 evals at 1.000, no threshold lowered
- `package.json`: version → 0.7.3, cut by `evals/release.js` so the bump and the re-record stay one act

### [22] — The cache-key separator stops making a source file look binary

- `lib/tokenise-readings.js`: Fixed — `keywordMatcher` joins its word list on a NUL to build a cache key, and the separator was written as a literal NUL byte inside the string. The code worked, but git read the whole 387-line module as binary: no diff, no blame, no review on any future change to it. The escape is the same character and keeps the file readable as text

### [21] — 0.7.3 phase 6: display, the JSON and the GUI specimen show what a token holds

- `gui/index.html`: Added — **the widened specimen**: a `phyllum:typography-contract` region mirroring the readings contract, held true by a parity test, as the theme, swatch, preview, rail, numbers and backlog regions already are. The specimen draws every reading the page's existing shape gate passes, so an underlined token draws underlined; a reading the gate refuses is listed beneath the specimen as unrendered with its reason and never reaches a `style` attribute — the rule the component preview already follows, applied to a second surface rather than reinvented for it
- `gui/index.html`: Added — the `font-family` note: a token recording a face carries a one-line note saying the page fetches no fonts, so an uninstalled face renders as a fallback. It appears whenever the reading is present, because the page cannot know which faces a reader has. The page stays self-contained — no webfont, no CDN, no `src=`, no external URL
- `lib/system.js`, `lib/system-json.js`: Changed — `display`, `system` and the JSON print every optional reading a typography token holds, through the shared reader rather than a second copy of the mapping, and say nothing where a token holds none
- `evals/assertions/gui-typography.test.js`, `evals/assertions/system.test.js`: Added — 13 assertions covering contract parity, the merge, the refused-reading list, the note in all three cases, markup and style injection from a table row, and the self-containment of the new region

### [20] — 0.7.3 phase 5: apply plans and rewrites the new typography literals

- `lib/prd.js`: Added — **the readings changes**: `typographyReadingChanges()` reads the scanner's readings pass where `assess` keeps it, rather than merging it back into the shared inventory, which is the separation phase 4 asked for. A covered row becomes a criterion naming the file, the literal and the token; an uncovered row goes to `Out of scope` with a reason
- `lib/prd.js`: Changed — the reading is named inside the criterion's `check` sentence rather than its `becomes` field, because `becomes` has a fixed grammar `apply run` parses back out. A name `assess` proposed is a proposal, not a token: an uncovered reading is listed out of scope with that proposal as the next step, never applied
- `lib/apply-mechanical.js`, `skill/refs/apply/run.md`, `skill/refs/apply/plan.md`: Changed — reading criteria land in the existing Typography phase, so no new phase is invented and one phase per commit still holds. Typography stays on the agent route — twenty-one readings make that more true, not less — so the reason was widened rather than a mechanical path opened
- `evals/assertions/apply-typography.test.js`: Added — 13 assertions, including that `alreadyAdopted` still reads identity and only identity, so a plan and an `applied:` flag can never disagree

### [19] — 0.7.3 phase 4: assess learns the eighteen new declarations

- `lib/assess-typography.js`: Added — **the readings pass**: its own bounded sweep, a per-declaration reading match, clustering, coverage and proposals, reported under the `raw-typography` family. The declaration the generator writes is the declaration the scanner reads, which is why this phase waited on phase 3. A raw value the design system already names is reported as coverage rather than proposed a second time, and the whole report stands up with no model attached
- `lib/assess.js`, `lib/assess-map.js`, `lib/assess-report.js`, `lib/assess-score.js`: Changed — the mapping table and the proposed names carry the new properties, reading rows live in `values.typography` rather than the shared arrays (which would break the mapping table's positional pairing), and the lint family is now three spreads rather than two
- `skill/refs/assess/detection.md`, `map.md`, `scan.md`, `severity.md`, `report.md`: Added — two rules the plan left open, recorded as table rows rather than as code: a reading cannot become a token on its own, because a Typography row needs a size, a weight and a line-height, and without them the coverage column says `ask`; and the reading threshold is zero, because a kerning a hair apart is a second decision rather than one that drifted
- `evals/assertions/assess-typography.test.js`, `evals/fixtures/codebases/type-readings/`: Added — 29 assertions and a fixture project writing covered readings, uncovered readings, an owner-less reading and two initial values that must record nothing

### [18] — 0.7.3 phase 3: the generated code reads the contract table, not a row position

- `lib/codegen.js`: Changed — **the last hand-mapping goes**: `renderCss` pulled size, weight and line-height off a token's row by fixed position and hand-mapped them to three properties. It was the last place in the codebase still treating Typography as three fixed columns. It now builds the set of readings a token records and hands it to the contract reader, so the mapping from reading to CSS exists in exactly one place. One declaration per recorded reading, in the contract table's row order, with the token named in a comment as before
- `evals/assertions/codegen-typography.test.js`: Added — 7 assertions, the first of them the regression gate: a token with no optional readings generates byte-identical CSS to what it generated before, asserted against captured output rather than by eye

### [17] — 0.7.3 phase 2: tokenise reads the new readings, and update can clear one

- `lib/tokenise-readings.js`, `lib/tokenise-prose.js`, `lib/tokenise-spec.js`, `skill/refs/tokenise/readings.md`: Added — **the bare keywords**: `tokenise` reads underlined, struck through, superscript, subscript and small caps straight out of a sentence. The enum and value readings are gathered in one follow-up asked after the three core readings, and a skipped follow-up records nothing. The sentence pass deliberately reads bare readings only — "measure", "case" and "face" are ordinary English, and reading them from free prose would invent values
- `lib/tokenise-command.js`: Added — **warn and ask, never refuse**: a token matching an existing one on all three core readings but differing in its optional ones is surfaced as a warning and asked about, never auto-refused as a duplicate and never silently written. The conflict rules become real questions on the same route, resolving nothing and dropping nothing
- `lib/tokenise.js`: Changed — an accepted typography token writes its readings block, and a token holding no optional reading writes no block at all
- `lib/update-command.js`, `lib/update-spec.js`, `skill/refs/update/token.md`: Added — `update token` changes or clears an optional reading, and a rename now carries the `#### <token>` block heading with the row. Leaving the heading behind would turn every renamed token's readings into a reported orphan
- `evals/assertions/tokenise-readings.test.js`: Added — 51 assertions, including the one that pins the naming scale: it hands the namer all eighteen new readings and asserts the proposed name does not move

### [16] — 0.7.3 phase 1: the typography token widens from three readings to twenty-one

- `skill/refs/typography.md`: Added — **the contract**: the twenty-one readings a type token can carry, the kind each is gathered as (bare, enum or value), and the CSS declaration each becomes — a table in the reference tree read by the skill, the CLI and the assertions alike, never a constant in code. A reading outside it is refused with a reason naming its file and its table. Three conflict rules sit beside it: `underline` with `strikethrough` merges into one `text-decoration-line` carrying both keywords, `superscript` with `subscript` is a contradiction, and `font-variant` over `small-caps` or `slashed-or-lining-zero` is a shorthand-over-longhand overlap. Every one takes the same route — warn and ask, never refuse
- `lib/typography.js`: Added — the reader for that contract, built as `lib/nomenclature.js` reads its own, raising `TypographyError` for a shipped table nobody can read
- `lib/design-system.js`: Added — **the block**: a typography token may carry a fenced YAML block of optional readings, under a `#### <token>` heading, directly beneath the Typography table, in the table's own row order. This module owns the block's shape and never looks inside one, so a block Phyllum cannot understand still round-trips. The four columns are unchanged and a token with no optional readings gets no block at all, which is what keeps every design system written before 0.7.3 byte-identical
- `lib/execute.js`: Added — `TypographyError` joins the four decisions caught at the dispatch boundary, so an unreadable shipped table gets a sentence naming the file and `phyllum upgrade`, not a stack trace
- `evals/assertions/typography.test.js`, `evals/fixtures/design-system/typography-readings.md`: Added — 31 assertions: back-compatibility asserted byte-for-byte across six pre-release fixtures, a round trip that survives commas, quotes and brackets, an orphan block preserved byte-identical and reported, and two blocks under one name yielding no reading at all

### [15] — The roadmap working file stays out of the repo

- `.gitignore`: Added — `/roadmap.md`, the in-flight pipeline roadmap, so a working note does not land in the history

## 2026-08-23

### [14] — The README header stops announcing 0.5.1

- `README.md`: Changed — the `mkpub:release` header blurb moves from 0.5.1 to 0.7.2, four versions of drift closed. It describes the 0.7 line rather than 0.7.2 alone, because 0.7.2's own changes are internal — the suite trim and the docs table — and name nothing a reader gains: the light-first dashboard, the Backlog cut by component, the Assess button, the skill-copy row in `version`, and the prune in `upgrade`. Saying "the 0.7 line" keeps the attribution honest, since no feature is credited to a release that did not ship it. The CTA stays `phyllum upgrade`, matching every `RELEASES.md` closing line
- `.gitignore`: Added — `*.bak`, so the pre-trim backups kept beside the eval suites stay on disk and out of the repo

### [13] — 0.7.2: the suite sheds its paperwork

- `evals/assertions/gui.test.js`, `evals/assertions/gui-preview.test.js`: Changed — **the GUI trim**: 31 assertions removed (1,219 -> 1,188), every one a presentation pin rather than a promise about user data — card/radius geometry, the near-white border threshold and its class names, ramp-vs-card treatment, ramp/type specimens. Kept whole: server lifecycle (localhost-only binding, PID/port record, reuse, `kill` on live and stale paths), the JSON API and its one parse contract, delivery (no webfont, no CDN, no `src=`, no external URL, no network call), the escape gates (the sixteen hostile values and the swatch's hex-literal-only contract), the page-vs-ref equalities (`PREVIEW` constants, projection map, `THEME` table), and the theme-persistence tests (the `localStorage` round-trip and the system-default fallback)
- `evals/run.md`: Changed — the ~200-line "What is covered today" per-file coverage table is gone; the test names are the coverage record now. The how-to-run half, the harness explanation, the two responders, recording, and the baseline rules are untouched
- `evals/run.md`: Changed — definition-of-done rule 1 narrows: every change ships its assertions; a new eval only when the change adds behaviour that must be scored rather than pass/failed. Rules 2–4 unchanged
- `evals/run.md`: Changed — the "count only grows" sentence is replaced: the assertions bar now reads "100% — no failures; a removed assertion is a visible, explained act, named in the change that removes it"
- `package.json`, `evals/release.js`, `evals/assertions/release-script.test.js`: Added — **`release:patch` and `release:minor`**: bump `package.json`'s version, run `npm run evals:record` so the baseline carries the new version, then `npm run check` so the coupled pair is proven green — one act instead of two, closing the gap where a forgotten re-record cost a diagnose-and-repair loop per release. Neither script nor the module it calls ever runs `git`; committing and tagging stay the orchestrator's decision, made after this exits
- `evals/baseline.json`: Changed — re-recorded as `release: v0.7.2`, 20 evals at 1.000, no threshold lowered
- `package.json`: version → 0.7.2

### [12] — 0.7.1: version learns to see the skill copy, and upgrade learns to prune

- `lib/skill-drift.js`, `evals/assertions/skill-drift.test.js`: Added — **the drift check**: `inspectSkillCopy(root)` compares the bytes of every file `init` would install in `.claude/skills/phyllum/` against the bytes on disk, and returns one of three findings — `in-step` (every file present and byte-identical), `differs` (one or more missing, changed, unreadable, or present but not enumerated by this install), or `none` (no copy in this directory); pure and read-only, in its own module, so the registry import graph stays untouched
- `lib/version-command.js`, `lib/execute.js`, `evals/assertions/version-cli.test.js`: Changed — **the third row**: `phyllum version` now always prints a `skill copy` row reporting the drift check's finding — `in step with this install`, a neutral `N of 46 files differ from this install`, or `none in this directory` — inspected before the registry is asked and separately from it, so the row is fully answered offline and under `--skip-registry`; the closing line names `phyllum upgrade` once when the CLI is outdated and the copy differs together, and on its own account when only the copy differs
- `lib/upgrade-command.js`, `lib/write.js`, `evals/assertions/upgrade-cli.test.js`: Added — **the prune**: after the re-sync, `upgrade` lists every file left in `.claude/skills/phyllum/` that this version does not enumerate, by name, and asks one question before removing any of them; `--yes` does not answer it, a decline is reported and changes nothing, and `upgrade` still exits 0 either way; the funnel gains its first delete, `removeGuarded`, bounded to inside the skill install and refusing the install root, reusing `isAllowedPath` rather than a second permission model — an emptied directory is removed with its last file
- `skill/refs/version/version.md`: Added — the skill-copy contract: the three findings, the neutral-count wording, and the bytes-not-a-stamp decision (no `.phyllum-version`, no manifest — the comparison reads what the file *is*, not what version was last written into it)
- `skill/refs/upgrade/upgrade.md`: Added — a Discovery section pointing at `version` as where drift now surfaces, and a Step 4 describing the prune, its one confirmation, and its refusal to decide on its own
- `skill/SKILL.md`: Changed — the permission table's `.claude/skills/phyllum/**` row now names the prune; the milestone narrative gains the four v0.7.1 phases
- `llms.txt`: Changed — the `version` and `upgrade` lines gain the skill-copy row and the prune step
- `evals/baseline.json`: Changed — re-recorded as `release: v0.7.1`, 20 evals at 1.000, no threshold lowered
- `evals/graders.js`: Changed — `MILESTONE` and `RELEASE` move to `v0.7.1 M4` / `v0.7.1`, with a note that the release adds no eval and removes none — the new assertions cover deterministic mechanics, not a conversational question
- `package.json`: version → 0.7.1

## 2026-08-22

### [11] — 0.7.0: the dashboard goes light-first, and the Backlog learns to ask

- `gui/index.html`, `evals/assertions/gui.test.js`, `README.md`, `skill/refs/gui/gui.md`: Changed — **the light-first surface**: the plain `:root` variable set stops being a second reading of the dark palette and becomes the one the design is drawn for — a neutral near-white canvas, white raised panels held by a 1px `--line` hairline, near-black ink with a mid-grey secondary — while the dark set moves to a neutral charcoal instead of the old warm tones, so both themes are drawn to the same temperament; `--accent` darkens from `#2383e2` to `#1a6fd4` to clear the 4.5:1 small-text floor on the white surfaces it is always drawn on now, and a new `--ink-hover` variable gives the primary button a hover reading without inventing a second hue; every colour card, primitives ramp, number specimen and typography specimen is re-verified viewable against the new light surface rather than assumed
- `gui/index.html`, `evals/assertions/gui.test.js`, `skill/refs/gui/gui.md`: Added — **the container idiom**: `.panel`, `.number-group` and `.container` share one rule — a 1px `--line` edge, `--radius-md`, the `--layer` fill on the `--bg` canvas — with `.panel` alone adding `--shadow` as the surface sitting directly on the page, `.panel--bare` for a container that only holds containers, and every Library section now its own container inside the token panel rather than a heading followed by open air
- `gui/index.html`, `evals/assertions/gui.test.js`, `skill/refs/gui/gui.md`: Added — **the chip idiom**: a section's count, a token's slot and the `applied` badge all move onto one `.chip` treatment — `--layer-accent` fill, `--muted` ink, a `--line` edge, `--radius-sm` — a label and never a control
- `gui/index.html`, `evals/assertions/gui.test.js`, `skill/refs/gui/gui.md`: Added — **the button pair**: `.btn--primary`, a single solid action filled with the page's own `--ink` and reading `--layer` as its text with `--ink-hover` on hover, and `.btn--ghost`, transparent until the pointer is on it; the prompt box's submit button becomes the shell's first `.btn--primary`
- `gui/index.html`, `evals/assertions/gui.test.js`, `skill/refs/gui/gui.md`: Changed — **the Backlog panel, cut by component**: the flat `<ul>` of every outstanding line is gone, replaced by one container per component parsed from the **last** `(...)` group each line carries, matched by the **longest leading run** of words inside that group against a recorded component name; a line naming no recorded component collects in a trailing `other` container instead of inventing a heading nobody wrote; containers follow first-appearance order, lines keep their own file order inside one, every line renders verbatim, and an empty Backlog still speaks — one container, `(none yet)`, a `0` count; the panel header now carries the **total** issue count as a chip. Parse settings live in the page's `BACKLOG` constant inside `phyllum:backlog-contract`, read by both the ref table and the assertion suite
- `gui/index.html`, `evals/assertions/gui.test.js`, `skill/refs/gui/gui.md`: Added — **the Assess button**: `#backlog-assess`, a `.btn--primary` in the Backlog header beside the total-count chip, posts the literal prompt `assess` to `POST /prompt` — the same relay `#prompt-form` already uses, the same payload shape and endpoint — so the terminal Claude Code session picks it up exactly as a typed prompt; the page enqueues and executes nothing itself, gives its own "Queued…" disable/restore feedback for about a second, and a failed request surfaces through the status line's existing "server gone" message the way the prompt box's does
- `evals/baseline.json`: Changed — re-recorded as `release: v0.7.0`, 20 evals at 1.000, no threshold lowered
- `package.json`: version → 0.7.0
- `llms.txt`, `skill/SKILL.md`, `RELEASES.md`, `README.md`: docs updated for the 0.7.0 surface, including every line that still described the palette as warm-toned or a hairline as the departure rather than the rule

### [10] — 0.6.0: the dashboard reads like a design system, not a printout

- `gui/index.html`, `evals/assertions/gui.test.js`, `skill/refs/gui/cards.md`: Changed — **the Numbers umbrella retires**: the one grouped list the v0.5.1 cut left behind is gone, and every distinct `applies to` reading in the file — `radius`, `spacing`, `shadow` today, whatever a file names tomorrow — becomes its own first-class section on the same single page, same heading tier as Colours and Typography; labels stay the file's own words verbatim, sections and tokens stay in file order, and a blank cell still falls to one trailing `other` section rather than inventing a reading nobody wrote; no section titled "Numbers" renders, and the bar and track `cards.md` had already dropped in v0.5.1 stay dropped — this release re-verifies that removal rather than re-doing it
- `gui/index.html`, `evals/assertions/gui.test.js`, `skill/refs/gui/cards.md`: Added — **specimens**: a recognised reading draws its value rather than printing it — a radius token as a tile carrying that corner radius, a shadow token as a card carrying that shadow, a spacing token as its own gap drawn at scale — with the token's name and mono value riding along underneath as the caption; every value reaches the page through the same shape gate the colour cards already used, widened rather than duplicated, so a category the page cannot classify falls back to the plain name-and-value line instead of guessing
- `gui/index.html`: Changed — the shape gate widens twice for the specimens: `isShadow` now accepts a bare `0` length (a real, if flat, shadow) instead of reading it as absent, and a new `isShadowList` reads a comma-joined stack of shadows so a token layering more than one still draws
- `gui/index.html`, `evals/assertions/gui.test.js`, `skill/refs/gui/cards.md`, `skill/refs/gui/gui.md`: Added — **documentation anatomy**: the Library view's token panel gets a `--measure` column (`68rem`) centred in whatever space is left, a `--space-1`…`--space-6` rhythm carried from the page's own scale that separates sections more than it separates the rows inside one, exactly three heading tiers, and a one-line `p.section__note` under every section heading naming what the section shows — a colour section says it draws cards, a number section builds its line from its own `applies to` reading; one card radius and one shadow now hold across every surface, colour and number token alike
- `gui/index.html`, `evals/assertions/gui.test.js`, `skill/refs/gui/gui.md`: Added — **the on-page rail**, GitBook's "On this page" pattern: a sticky `nav.rail-toc` on the margin outside the content column, rebuilt from the live `#tokens-body h3` headings on every render rather than a hard-coded list, so the rail always matches whatever sections the file produces; each id is a slug of its heading, deduplicated against every id already handed out in the same pass, the active section tracked with an `IntersectionObserver` that is disconnected and rebuilt rather than merely appended to, smooth scroll dropped to plain jumps under `prefers-reduced-motion: reduce`, and the whole rail degrading to working anchor links with no script at all; it hides below a `75rem` viewport and outside the Library view's token panel, where it would have nothing to list
- `evals/baseline.json`: Changed — re-recorded as `release: v0.6.0`, 20 evals at 1.000, no threshold lowered
- `package.json`: version → 0.6.0
- `llms.txt`, `skill/SKILL.md`, `RELEASES.md`: docs updated for the 0.6.0 surface, including every line that still described numbers as one list grouped under a shared heading rather than as first-class sections

## 2026-08-17

### [9] — 0.5.1: the dashboard softens, and the preview answers back

- `gui/index.html`, `skill/refs/gui/gui.md`: Changed — **the restyle, Notion-like and not Notion**: the Carbon-shaped look (flat tiles, sharp corners, a dark product header over a light body) gives way to simpler, softer, rounder — rounded corners as the default from a two-step scale carried in `--radius-sm` and `--radius-md` so the page rounds from one place, hairlines giving way where a background shift says the same thing, one low diffuse `--shadow` where a surface needs lifting, warm near-white over soft warm greys in the light theme and soft charcoal rather than pure black in the dark one, and one calm surface with a quieter left rail; the aesthetic is a direction and never a dependency, since there is no `@notion/*` to depend on in the first place
- `gui/index.html`, `skill/refs/gui/gui.md`: Changed — the type stack moves to **Geist-first** — `'Geist'` then system sans, `'Geist Mono'` then system mono — under exactly the rule Plex followed before it: used where it is already installed locally, nothing fetched, no webfont, no CDN, no external URL anywhere in the file, and the five-step type ramp untouched because simplicity is fewer surfaces rather than fewer sizes
- `skill/refs/gui/component-preview.md`, `skill/refs/gui/cards.md`: Changed — **the corner rule inverts**: the colour-card swatch was recorded as the page's one departure from sharp corners, and sharp corners are the departure that needs recording now; the preview stage takes the page's own `--radius-md` while the *specimen* takes none, so a previewed component is round only where its own `radius` slot says so
- `gui/index.html`, `skill/refs/gui/gui.md`: Added — **the theme control**: light · dark · system in the shell beside the connection status, with `system` the default and therefore the behaviour every existing page already had; the `data-theme` attribute on the root element picks a variable set outright and `system` carries no colour of its own and defers to `prefers-color-scheme`, one variable set per theme unchanged as the rule
- `gui/index.html`, `skill/refs/gui/gui.md`: Added — the choice persists in `localStorage` under `phyllum.theme` on the page's own origin, because a presentation preference belongs to the viewer and the browser rather than to `.phyllum/session.json`, which records what the *server* needs to know — the server is never told, no route changes and no new write path exists; an absent, denied or unreadable choice reads as `system` rather than as a broken page, and the stored choice is applied in the page's own inline `<head>` script before the body paints, so there is no flash of the wrong theme
- `gui/index.html`, `skill/refs/gui/component-preview.md`: Added — **the attribute controls**, the preview's third toggle row and the first that is not a picker: one on/off control per recorded icon slot, `aria-pressed` marking the shown one, under four rules — derived and never invented, so a spec with no `trailing-icon` shows no trailing-icon control; a `TODO` slot gets no control and keeps its line in the unrendered list, because a switch that does nothing is a worse answer than a stated gap; projection only, so flipping one changes the drawing and not the file, the `yaml` block or the served payload; and reset on switch, so a variant or state change returns every control to the spec's recorded reading
- `skill/refs/gui/component-preview.md`, `skill/refs/create/archetypes.md`: Added — the two tables the controls are read from rather than coded against: `phyllum:preview-attributes` naming the toggleable slots — `leading-icon` and `trailing-icon`, the whole attribute layer this release — beside `phyllum:preview-presence`, which reads a slot's recorded value as presence (`yes` / `true` / `required` shown, `no` / `false` / `optional` hidden, anything else `unresolved` in the unrendered list with the control starting hidden), and `phyllum:icon-slots` recording which archetypes may carry them at all, because a slot nobody wrote down is a slot nobody may invent
- `gui/index.html`, `skill/refs/gui/component-preview.md`: Added — **the icon placeholder and the one recorded rule-bend**: the projection has always drawn one inert element, and an archetype whose contract records icon slots may now draw one child box per shown slot inside it — a filled dot in the page's muted ink, sized in `em` from the component's own font size, carrying no inline style of its own because it is the page's mark and not the specimen's; Phyllum records that an icon slot exists and not which icon fills it, so there is no icon font, no asset fetch and no guessed glyph, and a void element such as an `input` lists its recorded icon slot as unrendered instead of drawing it
- `evals/assertions/gui.test.js`: Added — the restyle and theme assertions: both variable sets present with the root attribute selecting between them and `system` deferring to the media query, the stored choice round-tripping while an absent one reads as `system`, the theme applied before first paint, the `THEME` constant equal to the `phyllum:theme` table it is recorded in, and the page still self-contained — no webfont, no CDN, no external URL and no `src=` anywhere in the file
- `evals/assertions/gui-preview.test.js`: Added — the attribute-control assertions: the `PREVIEW.attributes` constant equal to `phyllum:preview-attributes` and the presence readings equal to `phyllum:preview-presence` so the page and the ref cannot drift, a spec without a given icon slot producing no control for it, a `TODO` slot producing no control and keeping its unrendered line, a flipped control changing the drawing while the `yaml` block and the served payload stay byte-identical, a variant switch resetting state and attribute controls together, a gated-out value staying out with its control present, and the placeholder reaching no `style` attribute
- `gui/index.html`, `skill/refs/gui/cards.md`: Changed — **the Numbers section stops drawing a measurement**: the proportional bar and its track are gone, CSS and sizing constant with them, because a `4px` radius beside a `64px` control size pictured a ratio nobody asked about; the section is now cut into one labelled group per distinct `applies to` reading, groups and tokens in file order, each token a plain line of its name in the page's ink and its value in the mono face, with every label the file's own words verbatim and a blank cell falling to one trailing `other` group recorded in the `phyllum:numbers` table
- `evals/assertions/gui.test.js`: Added — the grouped-list assertions, run against the page's own lifted `phyllum:numbers-contract` region: one group per distinct reading in file order with an oddly-cased label kept character for character, blanks collecting in the trailing group and no trailing group when every cell is filled, a missing third column reading as one ungrouped list, one escaped name-and-value line per token, the `NUMBERS.ungrouped` label equal to the table it is recorded in, and no bar, track, fill or inline width left anywhere in the page
- `evals/baseline.json`: Changed — re-recorded as `release: v0.5.1`, 20 evals at 1.000, no threshold lowered
- `package.json`: version → 0.5.1
- `README.md`, `llms.txt`, `skill/SKILL.md`, `evals/run.md`, `RELEASES.md`: docs updated for the 0.5.1 surface, including every line that still described the page as Carbon-shaped

### [8] — 0.5.0: the component knows it is used, and removal gets a verb

- `lib/applied.js`, `lib/apply-command.js`, `lib/apply-run.js`, `skill/refs/apply/`: Added — the **`applied` flag**: every recorded component's spec block carries `applied: true` or `applied: false` once `apply` has derived it, from the same `alreadyAdopted` predicate the adoption pass already skips on — one predicate, one meaning — with no flag at all meaning `apply` has never run rather than "not in use"
- `lib/applied.js`, `skill/refs/apply/apply.md`, `skill/SKILL.md`: Changed — **the recorded permission amendment**: `apply` and `apply run` write the `applied:` line of each component's spec block and not one other byte of `DESIGN-SYSTEM.md`, through the one funnel, `.bak` first; the permission table gains the row, the ref names the exact scope, and a run that changes no line writes nothing at all
- `lib/apply-run.js`: Added — a completed `Adopt <Component>` phase flips that one component to `true` in the same breath as the PRD tick, so the file stays honest between `apply` runs
- `lib/system.js`, `lib/system-json.js`, `gui/index.html`, `skill/refs/system/`, `skill/refs/gui/`: Changed — `display`, `system`, the JSON payload and the dashboard print the reading where a spec block records one and nothing at all where it does not, so every file written before 0.5.0 reads exactly as it did
- `lib/delete-command.js`, `lib/delete-spec.js`, `lib/registry.js`, `skill/refs/delete/`: Added — **`delete`**, the removal verb: list → pick → a breaking-change warning that always prints before any question about proceeding → a hard in-use block reading the flag when there is one and the codebase when there is not → the acceptance gate → a second confirmation requiring the component's **name typed back**, which `--yes` and a non-interactive run never satisfy → one surgical write removing the entry and its Backlog lines and nothing else
- `lib/delete-command.js`, `skill/refs/delete/delete.md`: Added — `delete token` is **reserved and refused** with its reason, `.phyllum/PRD.md` is left for the next `phyllum apply` to reconcile, and a Backlog line naming a second recorded component is left alone
- `skill/refs/update/`: Changed — the v0.4.0 never-list line "removal is a different verb" re-points at `phyllum delete` rather than at hand-editing the file
- `lib/applied.js`: Fixed — a hand-mangled `applied:` line read as `false`, which handed `delete`'s in-use block the silent yes the release is built to refuse; only `true` and `false` are readable now, unreadable is not `false`, and the block reads the codebase instead while naming the line it could not read
- `lib/applied.js`, `lib/delete-command.js`: Fixed — two components under one name gave the flag of the *last* block to a deletion that took the *first* block's lines; a duplicated name now carries no reading at all, and `delete` says the name does not identify one entry rather than picking one
- `lib/delete-spec.js`: Changed — the `delete` tables join the four tolerant contract files: an unreadable row is dropped with a notice naming its file as well as its table, and the notice prints before the flow asks anything
- `evals/assertions/fault-inputs.test.js`: Added — the v0.5.0 sweep: seven unreadable `applied:` spellings, the duplicated heading through both the reader and the command, and four hostile rows across `refs/delete/`'s three tables
- `evals/assertions/applied.test.js`: Added — the flip table's fourth row proved rather than promised: a spec block rewritten by `update component` comes back with no flag, absence reads as absence, and the next `phyllum apply` re-derives it
- `evals/graders.js`, `evals/prompts/delete-flow.json`, `evals/rubrics/delete-flow.md`: Added — `delete-flow`, the twentieth eval and the first added since v0.2.1 M5: the order a gated flow speaks in, graded over the six conversational ends `delete` has
- `evals/baseline.json`: Changed — re-recorded as `release: v0.5.0`, 20 evals at 1.000, no threshold lowered
- `package.json`: version → 0.5.0
- `README.md`, `llms.txt`, `skill/SKILL.md`, `evals/run.md`, `RELEASES.md`: docs updated for the 0.5.0 surface, including every claim that `apply` writes only its plan

### [7] — 0.4.1: the refs go lazy, and the dashboard draws the component

- `skill/refs/**`, `lib/refs.js`, `skill/SKILL.md`: Changed — every protocol's reference becomes a **folder** of per-topic files, the file named after the protocol being the frame and everything else a topic a moment can need alone; the reference table re-points per command with a one-line topical index, `nomenclature.md` stays flat as the one shared library loaded whole, marker names stay globally unique across the whole tree, and `lib/refs.js` becomes the one module that resolves a protocol to its files and a marker to the file it lives in
- `lib/md-tables.js` callers, `lib/template.js`, `evals/assertions/refs-layout.test.js`: Changed — every table reader, the skill install and re-sync, and the assertion suite re-point at the folder layout; the copy is recursive and the assertion that the installed copy equals the source widens to the folders
- `gui/index.html`, `lib/system-json.js`, `skill/refs/gui/component-preview.md`: Added — the Library panel draws the component: a **spec-projection** above the unchanged `yaml` and `jsx` blocks, `/system` carrying each component's parsed slots beside the raw block, one element per archetype from the new preview-element column, every value through the colour cards' shape gate widened from fills to every property, and a `TODO` or unresolvable slot listed as an **unrendered slot** rather than guessed at
- `gui/index.html`: Added — the variant toggle over entries sharing a base name, and the states toggle whose slots overlay the base; a component with no variant siblings shows no toggle at all
- `lib/archetypes.js`, `skill/refs/create/archetypes.md`: Added — the `phyllum:contracts` table gains a preview-element column, and becomes tolerant like the other four: an unreadable row is dropped with a notice naming its file as well as its table, while a row that predates the column reads as `null` rather than as a guess
- `lib/refs.js`, `lib/execute.js`: Fixed — a reference folder that is missing, is not a folder or cannot be read arrived as a raw `ENOENT` naming Phyllum's own install path; it is a named `RefsError` now, caught at the same dispatch boundary as a damaged `nomenclature.md` and answered with the folder and `phyllum upgrade`
- `lib/refs.js`: Fixed — a protocol name carrying a separator or a dot segment composed a path out of the reference tree and came back with files that were no reference at all; a name that is not a plain folder name is refused rather than resolved
- `gui/index.html`: Fixed — a spec recording a state called `default` offered that state twice on the toggle and applied it never, so the slots the file recorded were silently swallowed; it is one option now and the recorded state is drawn
- `gui/index.html`: Fixed — a typography token whose row is not three readings took the panel down mid-render; it is reported unresolved, like every other value the page cannot read
- `evals/assertions/fault-inputs.test.js`: Added — the v0.4.1 sweep: three missing reference folders and six protocol names that are paths, a nameless and a column-short row in `phyllum:contracts`, the base-state collision, and four typography rows of the wrong shape
- `evals/baseline.json`: Changed — re-recorded as `release: v0.4.1`, 19 evals at 1.000, no threshold lowered
- `package.json`: version → 0.4.1
- `README.md`, `llms.txt`, `skill/SKILL.md`, `evals/run.md`, `RELEASES.md`: docs updated for the 0.4.1 surface

### [6] — 0.4.0: `tokenise` meets you halfway, and `update` changes hands again

- `lib/tokenise.js`, `lib/tokenise-spec.js`, `skill/refs/tokenise/`: Changed — rgba is first-class: any value the colour reader can read is compared **by its channels**, alpha included, so `rgba(37, 99, 235, 1)` and `#2563EB` are one colour and can never be named twice, while `rgba(0,0,0,0.5)` and `rgba(0,0,0,0.9)` stay two facts; the recorded value is still byte-identical to what was typed
- `lib/tokenise.js`, `lib/tokenise-prose.js`, `skill/refs/tokenise/`: Added — gradients are a colours-pass value: the six `*-gradient()` shapes read as one value each, commas inside never splitting a batch sentence, recorded verbatim into Colours as `token | value`, named off a new `phyllum:gradient-names` scale whose mark word every proposed gradient name carries
- `lib/tokenise-command.js`, `lib/tokenise-spec.js`, `skill/refs/tokenise/`: Added — the kind picker an empty `tokenise` opens after the resume offer (colour / typography / border radius / spacing / something else), the solid-or-gradient fork under colour, and the prose each pick builds for the existing parser; plus the argument hint every value question now wears, read from its table row rather than spelled in the renderer
- `gui/index.html`, `skill/refs/gui/`: Changed — colour tokens render as cards in a responsive grid: a rounded swatch on top, the name and then the value beneath it, gradients painted as the swatch fill, near-white swatches still bordered, primitives ramps still nine-step strips
- `lib/update-command.js`, `lib/update-spec.js`, `lib/registry.js`, `skill/refs/update/`, `skill/refs/apply/`: Changed — **breaking**: `update` stops aliasing `apply` and becomes the design-system editing verb; `update run` is gone, `apply` carries no alias at all, and the empty-run menu prints one 0.4.x breadcrumb pointing at `apply`
- `lib/update-command.js`, `skill/refs/update/`: Added — `update token` (type → the full list of that section → pick → prose), the rename ripple over every referencing spec slot and every Backlog `TODO` line in one write, and the convergence re-check that stops a new value colliding with a token the system already names
- `lib/update-command.js`, `skill/refs/update/`: Added — `update component`: the recorded components with the archetype each spec block records, and the change landing as a revision through `create`'s own machinery, so what the sentence names changes and every other slot stays byte-identical
- `lib/update-command.js`: Fixed — a rename could put two values under one name: renaming onto a name the system already uses, or renaming a token whose name sits on two rows, is now surfaced and stopped, because a ripple that cannot tell which row a reference meant would hand the picked row every reference the other one owned
- `lib/update-command.js`: Fixed — a hand-mangled token row with no name or no value was listed and pickable, so a proposal reading `value undefined` could reach the acceptance gate; such a row is left out of the list now and the omission is said out loud
- `lib/tokenise-command.js`, `lib/update-spec.js`: Fixed — the `update token` type question threw a raw `TypeError` on any free-text answer, which made the one question that promises prose the only one that refused it; the type rows carry the cell the picker reads, and the picker reads every cell defensively
- `lib/tokenise-spec.js`, `lib/update-spec.js`, `lib/assess-report.js`: Fixed — the tables this release added were read without tolerance, so a hand-edited row with a blank key cell became a numbered menu option resolving to nothing, a question silently missing its hint, or cross-format comparison switched off with no message anywhere; every one of them drops the row and says so, and the notice names its file as well as its table
- `lib/tokenise-command.js`, `lib/update-command.js`: Changed — a dropped contract row is reported before the run starts, the way `assess` has reported one since v0.2.1 M6
- `evals/assertions/fault-inputs.test.js`: Added — the v0.4.0 sweep: twelve hostile contract rows across `refs/tokenise/` and `refs/update/`, a hand-mangled `DESIGN-SYSTEM.md` met by both `update` flows, the two rename refusals, sixteen picker runs against an answer stream that is at EOF, garbage, `null` or out of range, and the card renderer met by seven hostile gradient values
- `evals/assertions/assess-scan.test.js`: Added — an `assess` run against an rgba-recorded colour still reports it as covered, with the cross-format limit stated rather than left to be discovered
- `evals/baseline.json`: Changed — re-recorded as `release: v0.4.0`, 19 evals at 1.000, no threshold lowered
- `package.json`: version → 0.4.0
- `README.md`, `llms.txt`, `skill/SKILL.md`, `evals/run.md`, `RELEASES.md`: docs updated for the 0.4.0 surface, including every remaining claim that `update` was `apply`'s alias

## 2026-08-15

### [5] — 0.3.0: the vocabulary grows up, and the hardening sweep that closed the release

- `skill/refs/nomenclature.md`: Added — the standard token-naming vocabulary as spec tables: four slots in a fixed order, a strict word list each, the nine shipped neutral-ramp constants, and the lightness/saturation scale a derived ramp is placed on
- `lib/nomenclature.js`: Added — the reader for those tables, with a name walk that enforces slot order without a regexp and refuses a word claimed by two slots
- `lib/tokenise-prose.js`, `lib/tokenise-command.js`, `lib/tokenise-spec.js`: Changed — a sentence may carry several values; each becomes one entry in a proposal queue walked one question at a time, in sentence order, with names binding leftwards and duplicates collapsed
- `lib/primitives.js`, `lib/create-command.js`: Added — `create primitives`: the neutral ramp from shipped constants, a per-token derived ramp after a yes, the recorded value slotted back at its nearest step unchanged
- `lib/design-system.js`, `lib/init.js`, `templates/DESIGN-SYSTEM.md`: Changed — Colours drops its `notes` column and gains a nested `Primitives` subsection; a file still holding the legacy column is read as it stands
- `skill/refs/create/`, `lib/archetypes.js`, `lib/create.js`: Changed — ten more archetype contracts (Toggle, Checkbox, Radio, Select, Tooltip, Toast, Tabs, Link, Avatar, Progress) and a **custom** mode that follows no contract, marked as such so nothing downstream grades it against rules it never claimed
- `gui/index.html`, `skill/refs/gui/`: Changed — the dashboard restyled along Carbon lines, colours as filled/bordered swatches, primitives as nine-step strips, typography as live specimens, numbers as bars; still zero dependencies and no network fetch
- `lib/registry.js`, `lib/upgrade-command.js`, `skill/refs/update/`, `skill/refs/upgrade/`: Changed — `update` becomes an exact alias of `apply`; the self-maintenance behaviour moves unchanged to `upgrade`
- `lib/tokenise-command.js`: Fixed — a corrupt or half-written `.phyllum/session.json` queue was resumed into a proposal reading `value undefined` and put behind an acceptance gate; an entry whose shape no reader produces is now dropped, the loss is reported, and a queue with nothing readable left is no queue at all
- `lib/nomenclature.js`, `lib/execute.js`: Fixed — a malformed `phyllum:` table arrived as a bare detail naming no file and no fix; it is now a `NomenclatureError` caught at the dispatch boundary beside the backup and permission refusals, and answered with the file, the cause and `phyllum upgrade`
- `gui/index.html`: Fixed — a `/system` payload missing the shape it promised blanked the dashboard mid-render; every list the renderer walks is guarded, a shapeless payload is answered in a sentence, and a row that is not an object is skipped rather than thrown on
- `evals/assertions/fault-inputs.test.js`: Added — the v0.3.0 sweep: nine hostile queue-entry shapes, a truncated session file, five doctored vocabulary tables, six malformed design-system files through the dashboard's own renderer, and the swatch escape contract
- `evals/assertions/primitives.test.js`: Added — derivation at the ends of the scale: black, white and zero-saturation inputs, three- and eight-digit hex, a base name already ending in digits, and `nearestStep`'s totality
- `evals/baseline.json`: Changed — re-recorded as `release: v0.3.0`, 19 evals at 1.000, no threshold lowered
- `package.json`: version → 0.3.0
- `README.md`, `llms.txt`, `skill/SKILL.md`, `RELEASES.md`: docs updated for the 0.3.0 surface

## 2026-08-14

### [4] — Move the welcome out of a postinstall script and into the CLI greeting

- `scripts/postinstall.js`: Removed — a banner-only `postinstall` tripped supply-chain tooling (`@lavamoat/allow-scripts`) and never ran under `--ignore-scripts`/pnpm defaults anyway
- `package.json`: Changed — dropped the `postinstall` script and its entry in the published `files` list
- `lib/execute.js`: Changed — the bare-`phyllum` greeting now leads with the tagline, offers both `init` and `assess` start paths, and links the repo; guaranteed to run and trips no install-script guards
- `lib/menu.js`: Changed — `renderMenu` takes an optional `header` flag so the greeting embeds the command list without a duplicate title
- `evals/baseline.json`: Changed — bumped `phyllumVersion` to `0.2.2` to match the release bump the baseline test pins against

### [3] — A welcome banner after global install

- `scripts/postinstall.js`: Added — an npm `postinstall` banner that greets the user after `npm install -g phyllum`, points them at `phyllum init` and `phyllum assess`, and links the repo; it stays silent when npm's log level is `silent`/`error` (CI and quiet installs)
- `package.json`: Added — wired the `postinstall` script and shipped `scripts/postinstall.js` in the published `files` list

### [2] — 0.2.1: `assess` judges instead of inventorying, and the hardening sweep that closed the release

- `lib/write.js`: Fixed — `assess --json DESIGN-SYSTEM.md` overwrote the design system with the assessment of it and exited 0; the JSON rule is now the only rule that applies to a JSON write
- `lib/write.js`: Added — `BACKUP_STAGES` fault injection for the `.bak` path; a `BackupError` now says whether the read or the write failed
- `lib/write.js`: Changed — a refused `--json` path names the lock that closed instead of reciting the general permission model
- `lib/execute.js`: Fixed — a failed backup escaped as an uncaught throw with no exit code; it is now an answer, caught once at the dispatch boundary
- `lib/assess-json.js`: Changed — a failed `--json` write no longer leaks a raw errno or Phyllum's own temp path
- `lib/tokenise-spec.js`: Fixed — one unreadable row in a hand-edited spec table took the whole CLI down; rows are now dropped individually and reported
- `lib/assess-report.js`: Added — `renderSpecNotices`, so a dropped spec row is said out loud in the report and in the JSON
- `lib/tokenise.js`, `lib/assess.js`, `lib/assess-hygiene.js`: Fixed — a token spent only through `var(--name)` was reported as unused; custom-property names are now evidence, for that one check only
- `lib/assess-hygiene.js`: Fixed — `nameSeen` counted `color-ink` as used because `--color-ink-strong` existed
- `lib/candidates.js`, `lib/assess.js`: Changed — the markup tree is walked once per assessment instead of four times, with identical findings
- `lib/registry.js`: Fixed — `help assess` claimed `assess update` accepts every proposed token; it accepts only the errors, and now says so, alongside `--json` and the drift score
- `evals/assertions/fault-injection.test.js`, `fault-inputs.test.js`: Added — the backup path, the `--json` write path, hostile JSON targets and hostile spec rows
- `evals/prompts/help-accuracy.json`: Changed — re-pinned for v0.2.1's surface: `display`, `--json`, the score and verdict, and the `assess update` claim most likely to rot
- `evals/prompts/*.json`: Changed — every eval milestone is release-qualified, so a bare `M3` can never read as the wrong release again
- `evals/baseline.json`: Changed — re-recorded as `release: v0.2.1`, 19 evals at 1.000, no threshold lowered
- `package.json`: version → 0.2.1
- `README.md`, `llms.txt`, `skill/SKILL.md`, `evals/run.md`: docs updated for the 0.2.1 surface

## 2026-08-13

### [1] — The README now announces 0.2.0, and the repo tracks its own changelog and release notes

- `README.md`: Added — 0.2.0 release blurb (assess/apply/tokenise highlights, `phyllum update` CTA)
- `CHANGELOG.md`: Added — changelog created, backfilled with all 17 prior commits under History
- `RELEASES.md`: Added — empty user-facing release-notes scaffold
- `.claude/kermit/pref.json`: Added — kermit config (flash gate mode, changelog path)
- `.gitignore`: ignore volatile `.claude/kermit/state.json`

## History

- 2026-08-12 — ✨ feat(m1): skeleton, cli surface, template, init walkthrough, system reader
- 2026-08-12 — ✨ feat(m2): create prose mode — contracts, follow-up loop, codegen, eval runner
- 2026-08-12 — ✨ feat(m3): tokenise — three passes, clustering, naming scales, backlog reconciliation
- 2026-08-12 — ✨ feat(m4): gui — python stdlib server, three-view dashboard, lifecycle, kill
- 2026-08-12 — ✨ feat(m5): create image + pick modes — trace contract, candidate detector, upload drain
- 2026-08-12 — ✅ feat(m6): hardening — fs-diff harness, fault-injection sweep, detection, v1 baseline
- 2026-08-13 — ♻️ refactor: rename basal → phyllum across the product surface
- 2026-08-13 — 📝 docs: package docs + publish metadata — README, Apache-2.0, repository links
- 2026-08-13 — 🔧 chore: widen plan-file gitignore to basal-v*.md
- 2026-08-13 — ✨ feat(m1): self-maintenance — version + update commands
- 2026-08-13 — ✨ feat(m2): tokenise rework — prose-only, name suggestion, follow-up loop
- 2026-08-13 — ✨ feat(m3): assess scan engine — detect, scan, aggregate
- 2026-08-13 — ✨ feat(m4): assess mapping table + suggestion flows
- 2026-08-13 — ✨ feat(m5): assess chained modes — tokens · components · update
- 2026-08-13 — ✨ feat(m6): apply PRD engine — harness detection, plan generation, resume
- 2026-08-13 — ✨ feat(m7): apply run — phased execution, source-write funnel, orchestration
- 2026-08-13 — ✅ feat(m8): hardening — fault-injection sweep, eval hygiene, v0.2.0 baseline
