# Releases

What's new for you, release by release.

## v0.7.0 — 2026-08-22

> The dashboard is drawn light-first now — a neutral near-white canvas with white bordered panels, not a dark theme with light as the second option — and everything on it, from colour cards to number specimens, is checked against that surface rather than assumed. Panels, sections and the Backlog now wear one shared look: a bordered container with a count in the corner. And the Backlog panel itself is recut, grouped by the component each line is about, with an "Assess" button that hands your terminal session the word "assess" to run.

### ✨ New
- **An "Assess" button in the Backlog.** Click it and Phyllum queues the prompt "assess" for your terminal session, the same way typing it into the prompt box and hitting send would. The button shows "Queued…" for a moment so you know it went through. The page never runs anything itself — it only asks your session to.
- **The Backlog groups by component.** Instead of one long list, outstanding lines now sit in their own container per component, read from the name each line already carries. A line that doesn't name a component you've recorded collects in an "other" container at the end. The panel header shows the total count; each container shows its own.

### 📈 Improved
- **The dashboard is light-first.** The near-white surface is now the one the design is drawn for, not a fallback. Panels are white with a light border, ink is closer to black, and the accent colour is a shade darker so it reads clearly on white. Dark mode is the same palette read the other way, and both look intentional rather than one being an afterthought.
- **Panels, sections and counts share one look.** Every bordered container on the page — a panel, a Library section, a group of tokens — now uses the same border-and-fill idiom. Every count, badge and status reads as the same small chip wherever it appears.
- **Buttons now have a clear hierarchy.** One solid, filled button style for the primary action in a panel; a plain outlined one for anything secondary. The prompt box's send button and the new Assess button both use the solid style, since they are the one thing you'd do in that panel.

### Not in this release
- **Editing the Backlog from the page.** Grouping is read-only, the same as everywhere else on the dashboard. Nothing here writes to `DESIGN-SYSTEM.md`.
- **Running "assess" for you.** The button queues the prompt; your terminal session still runs it, the same as if you had typed it yourself.

Update with `phyllum upgrade`.

## v0.6.0 — 2026-08-22

> The dashboard's token panel reads like a design-system site now, not a printout of your file. "Numbers" is gone as a heading — every different thing your tokens apply to, radius, spacing, shadow and anything else your file names, gets its own section, in your file's own words. And a token no longer just names its value: where Phyllum recognises the reading, it draws it.

### ✨ New
- **Your number tokens draw themselves.** A radius token draws a tile with that exact corner rounded. A shadow token draws a card carrying that exact shadow. A spacing token draws a gap at that exact size. The name and the value still sit underneath as a caption — nothing is hidden, just shown as well as told. A reading Phyllum does not recognise still gets the plain name-and-value line it always had; nothing is guessed.
- **A sticky "On this page" rail.** The token panel now lists its own sections in a quiet rail on the margin, and highlights the one you're scrolled to. Click a section to jump straight to it. It only appears where there is something to list, and it steps aside on a narrower window rather than crowding the reading column.

### 📈 Improved
- **"Numbers" is gone as a single section.** What used to be one long list grouped under one heading is now one section per distinct thing your tokens apply to — the same first-class treatment Colours and Typography already had. Nothing is renamed or regrouped behind the scenes: the label is still your file's own words, and the order is still your file's own order.
- **The page reads like documentation, not a table dump.** A constrained column keeps lines a comfortable width to read. Every section now carries a one-line note under its heading saying what it shows. Spacing between sections is now clearly more generous than spacing within one, so the eye knows where a section ends without needing a rule drawn between them.
- **One card look, everywhere.** The rounded corner and the soft shadow that already marked a colour card now mark every surface on the page — including the new specimens — so nothing on the token panel looks like it arrived from a different design.

### Not in this release
- **Editing a token from the page.** Specimens and sections are still read-only, on localhost only. Nothing here writes to `DESIGN-SYSTEM.md`.
- **New number categories.** Radius, spacing and shadow are the readings Phyllum recognises today; a category it does not recognise still renders as a plain line rather than a guessed drawing.

Update with `phyllum upgrade`.

## v0.5.1 — 2026-08-17

> The dashboard gets a new look — simpler, softer, rounder — and you get to choose whether it is light or dark. The component preview gains a third row of controls: where your spec records a button's leading or trailing icon, you can flip that slot on and off and watch the drawing change. Nothing new is written, no new command exists, and the page still fetches nothing from the network.

### ✨ New
- **Pick your theme.** A light · dark · system control sits in the shell. `system` is the default and follows your OS, exactly as the page always has, so a dashboard you never touch looks the way it always did. Your choice is remembered by the browser between visits and applied before the page paints, so it never flashes the wrong theme at you. The server is never told — this is your browser's preference, not your project's.
- **Flip a component's icon slots in the preview.** If your spec records a `leading-icon` or `trailing-icon` for a button, the preview panel now shows a control for it. Turn it on and a placeholder appears in the drawing; turn it off and it goes. The controls come from your file: a slot you never recorded gets no control, and a slot still marked `TODO` stays in the unrendered list rather than becoming a switch that does nothing.
- **The placeholder is a plain dot, on purpose.** Phyllum records that an icon slot exists, not which icon fills it, so the preview draws a filled dot in the muted ink, sized from the component's own type. No icon font, no downloaded asset, no guessed glyph.

### 📈 Improved
- **The dashboard is restyled along Notion lines.** Rounded corners throughout, quieter borders, a soft shadow instead of an edge where a surface needs lifting, warm near-whites over soft greys in the light theme and soft charcoal rather than pure black in the dark one. The dark product header is gone and the left rail is calmer. It is an aesthetic, not a dependency: the stylesheet is still hand-written inside the one file.
- **Number tokens read as a list, sorted by what they apply to.** The measured bars are gone. The Numbers section now groups your tokens under the very words your file's `applies to` column uses — corner radius with corner radius, padding with padding — each token a plain name-and-value line. Tokens with nothing in that column gather under `other` at the end.
- **A better type stack, still with nothing to download.** The page asks for Geist and Geist Mono and falls back to your system faces if you do not have them — the same rule as before, which is that nothing is ever fetched.
- **Your components still wear only what you recorded.** The preview stage is rounded like the rest of the page; the component drawn on it is not. It is round only where its own `radius` slot says so, and flipping an icon control changes the drawing and nothing else — never your `DESIGN-SYSTEM.md`, and never the spec shown beside it.

### Not in this release
- **Editing the spec from the page.** The controls change what is drawn, not what is written. The dashboard stays read-only, on localhost only.
- **Real icons.** Phyllum does not record which icon fills a slot, so the preview does not draw one.
- **Controls beyond the icon pair.** Other configuration-shaped slots wait until this pattern has settled.

Update with `phyllum upgrade`.

## v0.5.0 — 2026-08-17

> There has never been a way to remove a component except editing the file by hand. There is now — and it arrives with the safety rail it needed first. Every component records whether your codebase is actually using it, worked out by `phyllum apply` from a read of your code, so `phyllum delete` can refuse on evidence rather than on a hunch. Deleting is the one thing Phyllum makes harder rather than easier: a warning, a refusal while the component is in use, your acceptance, and then the component's name typed back.

### ✨ New
- **`phyllum delete` removes a component.** It lists what you have recorded with each component's type and whether it is in use, takes your pick — or `phyllum delete Button/Primary` if you already know — and then slows down on purpose. It shows you exactly what goes: the component's entry and the backlog lines naming it, and nothing else in the file. The save takes a `.bak` first, and the report tells you that is your undo.
- **It warns you before it asks anything.** Deleting a component can be a breaking change: code generated from it stays in your codebase and stops matching anything your design system records. That sentence prints every time, before any question about proceeding — on a bare run and a pre-answered one alike.
- **It refuses while the component is still in use.** If your code is using the component, `delete` stops, tells you what it saw and where, and gives you the way out in order: remove the usage, re-run `phyllum apply` so the reading catches up, then delete. There is no flag, option or `--force` past that refusal, and a refusal is not an error — the run ends cleanly.
- **And then it asks you to type the name.** After the ordinary acceptance question, one more: type the component's name back. A `y` proves you agreed; a typed name proves you are looking at the right target. `--yes` cannot answer it, and neither can a run with nobody there — a non-interactive `delete` refuses and says why.
- **Your components now say whether they are applied.** Run `phyllum apply` and each component's spec block gains `applied: true` or `applied: false`: is this component adopted in your codebase right now? `display`, the dashboard and the JSON all show it. It is worked out from your code, not asked about and not settable — if you edit it by hand, the next `apply` puts the true reading back.

### 📈 Improved
- **`phyllum apply` now writes one line into `DESIGN-SYSTEM.md`.** It is the `applied:` line of each component and nothing else in the file, with the backup taken first as always, and a run that changes no line writes nothing at all. This is the one addition to what `apply` touches since it shipped, and it is written down in the permission rules rather than slipped in.
- **A design system written before 0.5.0 reads exactly as it did.** No `applied:` line means `phyllum apply` has never run here — which is deliberately *not* the same as "not in use" — so nothing shows a reading it does not have, and nothing behaves differently until you run `apply`.

### 🐛 Fixed
- An `applied:` line edited by hand into something that is neither `true` nor `false` used to be read as "not in use", which could let `delete` past the very check that exists to stop it. Phyllum now says it cannot read that line and goes and reads your codebase instead.
- Two components recorded under the same heading name used to have one reading between them, taken from one entry while a deletion took the other's lines. `delete` now says the name does not identify one entry, and changes nothing.
- If Phyllum's own shipped `delete` reference is damaged, the affected line is dropped with a message naming the file and the table, the same way its other reference tables already behave, instead of the flow quietly running with one of its rules missing.

### Not in this release
- **Deleting a token.** `phyllum delete token` is refused on purpose, with the reason: removing a token ripples through every component slot and backlog line naming it, which is a different risk story and deserves its own release.
- Batch deletion, `delete --force`, or any path around the second confirmation.

Update with `phyllum upgrade`.

## v0.4.1 — 2026-08-17

> The dashboard stops describing your components and starts drawing them. Click one in the Library and you see the component itself — built from the spec Phyllum recorded, with your own token values resolved into it — plus a row of buttons for its variants and another for its states. Anything the spec does not actually say is listed underneath rather than invented.

### ✨ New
- **Your components are drawn, not just printed.** The Library panel now opens with the component itself, above the spec and code blocks it already showed. It is drawn from what your file records: each recorded slot becomes a real style on a real element, and a token name is resolved against the tokens you named. Nothing is executed and nothing is fetched — the page still needs no install, no build step and no network.
- **A toggle for your variants.** `Button/Primary` and `Button/Ghost` are one family, so the panel shows a button per variant and swaps the drawing in place. A component with no siblings shows no toggle, because a picker with one option is not a picker.
- **A toggle for your states.** If the spec records `hover`, `disabled` or any other state, a second row switches to it — and a state is read as *your component with those slots applied*, not as a different component.
- **What could not be drawn is listed, never guessed.** A slot still recorded as `TODO`, a token name nothing holds, or a value Phyllum cannot classify contributes nothing at all and appears underneath as an unrendered slot with the reason. A preview that quietly invented a background would be the one place you would believe it.

### 📈 Improved
- **Phyllum reads less to answer you.** Every command's reference is a folder of small topic files now instead of one long file, so a conversation loads the part it actually needs. Nothing about what any command does has changed — the same contracts, on new shelves.

### 🐛 Fixed
- A component whose spec records a state literally called `default` no longer shows that state twice in the toggle while ignoring what it says. It is one option, and what you recorded is what is drawn.
- A hand-edited typography token with the wrong number of readings no longer blanks the component panel; it is reported as unresolved like any other value Phyllum cannot read.
- If Phyllum's own shipped reference files are missing or damaged, it now says which folder is wrong and that `phyllum upgrade` restores it, instead of failing with a bare technical line naming a path inside the install.

Update with `phyllum upgrade`.

## v0.4.0 — 2026-08-17

> `tokenise` stops needing you to know the sentence. Run it with nothing and it asks what kind of token you are recording, then asks the one thing that kind needs — and every question that wants a value now shows you the shape the answer takes. Gradients are colours Phyllum can name. `rgba()` finally counts as the same colour as the hex you already recorded. Your colours show up in the dashboard as cards you can actually look at. And there is a new verb for the thing there was never a good way to do: changing what your design system already says.

### ✨ New
- **`phyllum update` changes what is recorded.** Until now every command added something, read something, or pushed something outward, and the only way to change a recorded token or component was to edit `DESIGN-SYSTEM.md` by hand. `phyllum update` opens a menu; `update token` walks you type → the full list → pick one → a sentence describing the change; `update component` lists what you have recorded and revises the one you pick. You can also say it straight out — `phyllum update "make color-primary #1D4ED8"` — and Phyllum asks rather than guessing when a sentence could mean two things.
- **Renaming a token now takes its references with it.** Rename `color-primary` and every component slot and every backlog line naming it is rewritten in the same save, and you are told the count before you accept. Nothing is left pointing at a name that no longer exists.
- **`phyllum tokenise` with nothing is a guided start.** It offers to pick up an unfinished run first, as ever, then asks: a colour, typography, a border radius, spacing, or something else? Pick a colour and it asks one more thing — solid, or a gradient? You can still type the whole sentence at any question and it is read exactly as if you had typed it as the argument, and you can skip out at any point without anything being written.
- **Gradients are colours Phyllum can name.** `phyllum tokenise "hero backdrop linear-gradient(135deg, #2563EB, #10B981)"` records it exactly as you wrote it — stops, angle and all, never reordered — in the Colours table with everything else. Every name Phyllum suggests for a gradient has the word `gradient` in it, so you can tell one from a solid colour by name alone.
- **Every question that wants a value shows its shape.** `Write your colour as [HEX code / rgba value] [name]`. One line, the same everywhere it asks — the picker, a sentence missing its value, and `update`'s change question.

### 📈 Improved
- **`rgba()` is a first-class colour.** Paste what your CSS inspector gave you and it lands. More to the point, Phyllum now knows `rgba(37, 99, 235)` is the `#2563EB` you already recorded, so you cannot end up with the same blue named twice. Transparency counts as part of the colour, so a 50% black and a 90% black stay two different things — and, as always, the value is saved exactly the way you typed it.
- **Your colours are cards now.** The dashboard lays them out in a grid: a large rounded swatch, the token name underneath, and the value under that. Gradients paint themselves. Near-white swatches keep their border so they don't disappear. Primitive ramps still read as one nine-step strip, because a ramp is one thing.

### 🐛 Fixed
- A design-system file that has been hand-edited into a half-finished row — a token with no value, or a value with no token — is no longer offered to you as something to edit. It is left out of the list and Phyllum tells you how many rows it left out, instead of asking you to accept a change to nothing.
- Renaming a token can no longer quietly create two tokens with the same name, or hand one token every reference that belonged to another. Both cases now stop with an explanation and change nothing.
- Answering `update token`'s "what kind of token?" question with a sentence instead of a number no longer fails with a technical error.

### ⚠️ Breaking
- **`phyllum update` no longer means `phyllum apply`.** In 0.3.0 `update` was a second name for applying your design system to your code; from 0.4.0 it is its own command for editing the design system itself. **Applying to your code is `phyllum apply`**, under its own name, unchanged in every other respect — and for this release the `update` menu prints a one-line pointer to it for anyone who reaches for the old word. `update run` no longer exists; that is `apply run`. Updating your Phyllum install is still `phyllum upgrade`.

Update with `phyllum upgrade`.

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
