# Releases

What's new for you, release by release.

## v0.3.0 — 2026-08-15

> Naming gets a vocabulary. One sentence can now carry several values, and each one is queued and asked about in turn. Phyllum ships a standard set of token names, so a suggestion can say what a colour is *for* and not only what it looks like. A new `create primitives` lays down the colour ramps your tokens sit on. `create` learns ten more component types plus one that follows no rules at all, the dashboard shows your colours instead of listing them, and `update` now means what most people expect it to.

### ✨ New
- Name several values in one go: `phyllum tokenise "#2563EB #10B981 #F59E0B"` reads all three and walks them one question at a time, in the order you said them. Skipping one costs only that one, and a run you cut short is picked up where it stood rather than retyped.
- A standard naming vocabulary now ships with Phyllum. When your sentence says what a colour is for — "our main interactive blue" — the suggested name says so too (`interaction-primary`), instead of describing its lightness. Nothing you already have is ever renamed.
- `phyllum create primitives` builds the primitive colour ramps underneath your design system: nine steps from light to dark, either the shipped neutral greys or a ramp derived from a colour token you already recorded. You are asked about every token first, all nine values are shown before you accept, and the value you recorded is kept exactly as you wrote it.
- Ten more component types understand their own contracts — Toggle, Checkbox, Radio, Select, Tooltip, Toast, Tabs, Link, Avatar and Progress — so describing one gets you the right questions rather than the nearest guess.
- And for the components that fit no mould, `create` gains **custom**: no required slots, no gap list, no contract. It records exactly what you describe and is finished when you say it is.

### 📈 Improved
- The dashboard now shows your design system rather than listing it. Colours are swatches you can actually see, near-white ones get a border so they don't vanish, primitive ramps render as strips, type shows as live specimens in its own font settings, and numbers show as measured bars. It has been restyled throughout, and still needs no install, no build step and no network.
- The Colours table is simpler: just the token and its value. The old notes column recorded how a value got there, which is history rather than design system.
- `create primitives` needs no AI at all — it is shipped values and arithmetic, so it works in a plain terminal like `display` and `apply` do.

### 🐛 Fixed
- A design-system file that has been hand-edited into a shape Phyllum doesn't recognise no longer blanks the dashboard — you get a message saying so.
- An interrupted `tokenise` whose session file was left half-written no longer offers to resume a value it can't actually read. The unreadable part is reported and left out, and the rest of the queue carries on.
- If Phyllum's own shipped naming tables are damaged, it now says which file is wrong and that `phyllum upgrade` restores it, instead of failing with a bare technical line.

### ⚠️ Breaking
- **`phyllum update` now means "update my codebase from the design system"** — it is an alias of `phyllum apply`, so it writes a plan to `.phyllum/PRD.md` and runs nothing. Updating your Phyllum install is **`phyllum upgrade`** now; nothing about that behaviour changed except the word.

Update with `phyllum upgrade`.

## v0.2.3 — 2026-08-14

> Run `phyllum` in a fresh project and it now greets you with both ways to begin and a link to learn more. The install-time banner that some security setups warned about is gone — its welcome lives in the CLI now, where it always shows.

### 📈 Improved
- Running `phyllum` in a project with no design system yet now shows both ways to start — build one from scratch with `phyllum init`, or turn your existing code into components with `phyllum assess` — along with a link to the project.

### 🐛 Fixed
- Installing Phyllum no longer prints a warning in projects that screen install scripts, and the welcome now shows reliably instead of being silently skipped by strict or automated installs.

## v0.2.2 — 2026-08-14

> Install Phyllum globally and it now greets you, pointing you straight at the two ways to begin — start a design system from scratch, or hand it your existing codebase.

### ✨ New
- After `npm install -g phyllum`, you now see a short welcome that points you at `phyllum init` to start a fresh design system and `phyllum assess` to read your existing codebase into components, with a link to the project on GitHub. Automated and quiet installs stay silent, so it never clutters your CI logs.

## v0.2.1 — 2026-08-14

> `assess` stops inventorying and starts judging. Every finding now carries a severity, near-identical components and styles are scored as clones, naming drift and prop mismatches are called out, and the whole run ends in one drift score and one verdict. A hardening sweep rides along: `assess` can no longer overwrite your design-system file by accident, and bad input can't crash an assessment.

### ✨ New
- Every finding now carries a severity, so you can tell at a glance what needs fixing now and what can wait.
- Near-identical components and styles are detected and scored as clones — including duplicated styles and overlapping utilities you didn't know you had.
- Naming drift and prop mismatches are called out, so components that disagree with your own conventions no longer hide.
- Unused tokens and components are found by running coverage backwards: anything your design system declares but your code never touches gets surfaced.
- An assessment now ends in one drift score and one verdict, so you can track whether your codebase is converging on the design system or drifting away.
- `assess --json <path>` writes the whole assessment to a file of your choosing — ready to feed into CI.
- A new `display` command prints your design system to the terminal (`system` still works as an alias).
- Every edit to your design-system file now leaves a `.bak` behind — one undo, always available.

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
