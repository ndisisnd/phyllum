# Changelog

All notable changes to this project will be documented here.

## 2026-08-14

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
