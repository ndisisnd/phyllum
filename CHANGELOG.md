# Changelog

All notable changes to this project will be documented here.

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
