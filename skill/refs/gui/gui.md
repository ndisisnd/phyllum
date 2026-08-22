# `gui` (alias: `dashboard`) and `kill`

`phyllum gui` starts a local Python HTTP server (stdlib `http.server`, zero extra
dependencies) serving a static HTML/JS single page, and prints
`http://localhost:<port>`. `phyllum kill` stops it again.

The dashboard is a **viewer and a prompt relay**, not a second brain. It shows
the design system the terminal already reads, and hands prompts typed in the
page back to the Claude Code session. The server never calls a model, and never
decides anything.

## Three views

1. **Library** — every component and token, read live from `DESIGN-SYSTEM.md`,
   each token *shown* rather than merely printed (see "Showing the values" in
   `refs/gui/cards.md`). Clicking a component shows the component itself — an
   HTML rendering projected from its recorded spec, with a variant toggle and a
   states toggle (`refs/gui/component-preview.md`) — and then its spec and its
   code. The scope argument picks the opening filter: `tokens`, `components`, or
   `all` (the default). The user can still switch filters inside the GUI.
2. **Workbench** — the active `create` session: the user's input on one side,
   the draft the terminal is building on the other, refreshed as the follow-up
   loop progresses. An input box relays edits from the page, and an image
   dropped on it becomes an image-mode `create` input.
3. **Token view** — a component's token usage: which tokens it consumes, and
   which values are still raw and therefore candidates for the next `tokenise`
   run.

## Look and feel — Notion-like, not Notion

The dashboard is styled along Notion lines: **simpler, softer, rounder**. It is
an aesthetic followed as a direction, never as a dependency — there is no
`@notion/*` package to take, no CDN, and no build step, which makes the point
cleanly.

- **Rounder** — rounded corners are the default: tiles, chips, buttons, inputs,
  the preview stage, the colour-card swatch. Two CSS variables carry the whole
  scale (`--radius-sm`, `--radius-md`), so the page rounds from one place. Sharp
  corners are the departure that needs recording now, not the rule.
- **Softer** — a hairline gives way wherever a background shift says the same
  thing; where a surface needs lifting it takes one low, diffuse shadow
  (`--shadow`) instead of an edge. The light palette is warm near-white over
  soft warm greys with ink slightly off-black; the dark palette is soft
  charcoal, not pure black. Both themes are drawn to the same temperament.
- **Simpler** — one calm surface: no dark product header over a light body, and
  a quieter left rail on the page's own background with the selected view
  reading as a rounded resting place rather than a stripe. The five-step type
  ramp survives untouched — simplicity is fewer surfaces, not fewer sizes — and
  so do the three views and their navigation.

| Property | Value |
|----------|-------|
| Stylesheet | hand-written, inline in `gui/index.html` — one file, no second asset |
| Type stack | `'Geist'` first, then system sans; mono is `'Geist Mono'` then system mono |
| Webfont | **none** — Geist is used where it is already installed locally and nothing is fetched |
| Network | the page makes same-origin requests to its own server only (`/state`, `/system`, `/prompt`, `/upload`); no external URL appears anywhere in the file |
| Radius | two steps, `--radius-sm` and `--radius-md`; every rounded corner on the page reads one of them |
| Themes | a warm near-white light theme and a soft-charcoal dark one, one CSS variable set each, picked by the theme control below |

## Page anatomy (v0.6.0 §3)

The Library view is a documentation page, so it is laid out like one: a
constrained column, a section that says what it shows, and grouping by air
rather than by rules.

| Part | The rule |
|------|----------|
| Content column | one reading measure, `--measure` (`68rem`), carried by `main`, which is centred in whatever is left of the window. Content wider than the column — a ramp strip, a long line of code — scrolls inside its own container rather than widening the column for everything else |
| Section description | every token section carries **one muted line** under its heading, in a `p.section__note`, saying what the section shows. It describes the *rendering*, never the reader's system: `Semantic colours, drawn as cards.` A number section builds its line from its own reading — `Number tokens that apply to corner radius.` — and the trailing group says it has no reading of its own. The label inside the sentence is the file's own words, escaped like the heading above it |
| Spacing scale | `--space-1` … `--space-6`, 8-based (`0.5rem` a step), and the page spaces from there alone. The step **between** sections is `--space-6`; the steps **inside** one are `--space-1` and `--space-2`. Negative space is the grouping tool — the page draws no rule between sections |
| Heading tiers | **three, and no more.** Tier one is the panel title (`h2`, `--type-04`; the page title in a `.lede` takes `--type-05`). Tier two is the section heading (`h3`, `--type-03`), one size for every section — Colours, each `applies to` reading, Typography. Tier three is the small muted group label at `--type-01`: the rail label, a ramp's base name, a specimen's meta line. A card title sits at `--type-02`, under tier two, so it never reads as a section of its own |
| Card idiom | one corner and one shadow across the page. Every *surface* — the panel, the colour card's swatch, the preview stage, the shadow specimen's card — takes `--radius-md`; the small parts inside one — chips, buttons, inputs, the spacing specimen's bars — take `--radius-sm`. Lift is `--shadow` and nothing else |

Both themes hold throughout: every colour named above is a theme variable, so
the dark set moves the whole anatomy without a second stylesheet.

## The theme control (v0.5.1 §4)

The page ships both themes, and the viewer picks between them. Three choices and
no more, in the shell beside the connection status:

<!-- phyllum:theme -->

| Choice | What it means |
|--------|---------------|
| `light` | the light variable set, whatever the OS asks for |
| `dark` | the dark variable set, whatever the OS asks for |
| `system` | **the default** — defer to `prefers-color-scheme`, which is the behaviour the page had before v0.5.1 |

The mechanics, all of them page-local:

- **The attribute picks the set.** Theme selection is the `data-theme` attribute
  on the root element. `light` and `dark` each select their variable set
  outright; `system` carries no colour of its own and defers to the
  `prefers-color-scheme` media query. One variable set per theme stays the rule.
- **Persistence is `localStorage`**, under the key `phyllum.theme`, on the
  page's own origin. A presentation preference belongs to the viewer and the
  browser, not to `.phyllum/session.json`, which records what the *server* needs
  to know. The server is never told, no route changes, and no new write path
  exists.
- **An absent or unreadable choice reads as `system`.** A store that is missing,
  denied or holding a word the page does not know falls back to the default
  rather than to a broken page; with storage denied, the clicked theme still
  holds for the life of the page and only the remembering is lost.
- **No flash of the wrong theme.** The stored choice is applied in the page's
  own inline `<head>` script, before the body paints. It is the page's own
  script in its own file, so the no-external-script rule is untouched.

These are the `THEME` constant inside the page's region marked
`phyllum:theme-contract`, and the assertion suite reads both this table and that
region, so the two cannot drift.

## Lifecycle

- `phyllum gui` picks a free port, starts the server detached, waits until it
  actually answers, and records `{ pid, port, host, url, scope, startedAt }`
  under `gui` in `.phyllum/session.json`.
- A second `phyllum gui` while one is running reprints the URL rather than
  starting a second process. A new scope word updates the recorded opening
  filter, which the page picks up on its next poll — still one server.
- A recorded server that no longer answers is treated as stale: the record is
  cleared and a fresh one started.
- `phyllum kill` reads the record, sends `SIGTERM`, and clears the entry. With
  nothing running, or a stale PID left by a crash, it reports that cleanly and
  clears the record rather than erroring. `kill` is never a command you have to
  run twice, and never exits non-zero.
- No `python3` on PATH: `gui` says so and points at `phyllum system`, which shows
  the same design system with no server at all.

## Permission model

The Node write funnel (`lib/write.js`) remains the only path to
`DESIGN-SYSTEM.md`. The server is outside that funnel and is therefore confined
to `.phyllum/` in code, not by convention — an attempt to write anywhere else
raises `PermissionError` before touching the disk.
