# Releases

What's new for you, release by release.

## v0.2.1 — 2026-08-14

> A hardening release: `assess` can no longer overwrite your design-system file by accident, a single bad row in a hand-edited spec can't crash an assessment, and usage detection stopped flagging tokens that are actually in use. Everything about this release is aimed at making assessments safe to run and safe to trust.

### 📈 Improved
- Assessments run noticeably faster — your files are scanned once instead of four times, with identical results.
- When a write is refused or fails, the message now tells you the actual reason in plain terms, instead of reciting the general permission rules or exposing internal details.
- The built-in help for `assess update` now matches what the command really does: it accepts only the flagged errors, and it mentions the JSON output and drift score.
- Various under-the-hood improvements to test coverage and release hygiene.

### 🐛 Fixed
- Running `assess --json` against your design-system file no longer overwrites that file with the assessment of it — your source of truth is protected.
- One unreadable row in a hand-edited spec table no longer takes the whole assessment down. The bad row is skipped, and the report tells you exactly which one and why.
- Tokens used only through CSS `var(...)` references are no longer falsely reported as unused.
- A token no longer counts as "used" just because a longer token with a similar name exists.
- A failed backup now stops cleanly with a clear message and a proper exit code, instead of crashing mid-run.

## v0.2.0 — 2026-08-13

> Phyllum now works on the codebase you already have, in both directions. `assess` reads your code, maps the raw styling in it, and proposes the tokens and components hiding there; `apply` takes your design system and rolls it back into the source, one reviewed phase at a time. This release also brings the Phyllum name, an open-source license, and a built-in updater.

### ✨ New
- Assess your codebase: Phyllum reads what's already styled, maps it, and suggests the tokens and components it finds — and can fold the ones you accept straight into your design system.
- Apply your design system back to the code: Phyllum writes a plan you can read first, then executes it phase by phase on its own branch, so nothing lands unreviewed.
- Keep Phyllum current from the command line: `phyllum version` tells you where you are, `phyllum update` brings you to the latest release.

### 📈 Improved
- Naming a token from a sentence now suggests the name for you and asks a follow-up when something is missing, instead of expecting you to fill in every detail.
- The project is now Apache-2.0 licensed, with proper published documentation.

### ⚠️ Breaking
- The tool is now called **phyllum** (previously *basal*) — invoke it by the new name.

## v0.1.0 — 2026-08-12

> The first release. Phyllum turns prose, images, or a pick from the styles your code already repeats into named tokens and components — all recorded in one human-readable file that doubles as your design system's source of truth.

### ✨ New
- Set up a design system from nothing: a guided walkthrough creates the one file Phyllum ever writes, and every command builds on it.
- Create a component by describing it in a sentence — Phyllum asks short follow-ups with suggestions attached when something's missing, and never invents a value you didn't give.
- Create a component from an image you point at, or pick one from the patterns your code already repeats.
- Turn scattered style values into named tokens, grouped and named on sensible scales, without duplicating anything on a re-run.
- Browse your tokens and components in a local dashboard with a single command — no install, no build step.
