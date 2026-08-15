# Changelog

All notable changes to this project will be documented here.

## 2026-08-15

### [5] — 0.3.0: the vocabulary grows up, and the hardening sweep that closed the release

- `skill/refs/nomenclature.md`: Added — the standard token-naming vocabulary as spec tables: four slots in a fixed order, a strict word list each, the nine shipped neutral-ramp constants, and the lightness/saturation scale a derived ramp is placed on
- `lib/nomenclature.js`: Added — the reader for those tables, with a name walk that enforces slot order without a regexp and refuses a word claimed by two slots
- `lib/tokenise-prose.js`, `lib/tokenise-command.js`, `lib/tokenise-spec.js`: Changed — a sentence may carry several values; each becomes one entry in a proposal queue walked one question at a time, in sentence order, with names binding leftwards and duplicates collapsed
- `lib/primitives.js`, `lib/create-command.js`: Added — `create primitives`: the neutral ramp from shipped constants, a per-token derived ramp after a yes, the recorded value slotted back at its nearest step unchanged
- `lib/design-system.js`, `lib/init.js`, `templates/DESIGN-SYSTEM.md`: Changed — Colours drops its `notes` column and gains a nested `Primitives` subsection; a file still holding the legacy column is read as it stands
- `skill/refs/create.md`, `lib/archetypes.js`, `lib/create.js`: Changed — ten more archetype contracts (Toggle, Checkbox, Radio, Select, Tooltip, Toast, Tabs, Link, Avatar, Progress) and a **custom** mode that follows no contract, marked as such so nothing downstream grades it against rules it never claimed
- `gui/index.html`, `skill/refs/gui.md`: Changed — the dashboard restyled along Carbon lines, colours as filled/bordered swatches, primitives as nine-step strips, typography as live specimens, numbers as bars; still zero dependencies and no network fetch
- `lib/registry.js`, `lib/upgrade-command.js`, `skill/refs/update.md`, `skill/refs/upgrade.md`: Changed — `update` becomes an exact alias of `apply`; the self-maintenance behaviour moves unchanged to `upgrade`
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
