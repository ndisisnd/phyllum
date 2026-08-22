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
constrained column, a section that says what it shows, and one grouping idiom
used everywhere. Until v0.7.0 that grouping was air alone; since v0.7.0 §2 it is
a container — an edge and a fill — with the air kept around it.

| Part | The rule |
|------|----------|
| Content column | one reading measure, `--measure` (`68rem`), carried by `main`, which is centred in whatever is left of the window. Content wider than the column — a ramp strip, a long line of code — scrolls inside its own container rather than widening the column for everything else |
| Section description | every token section carries **one muted line** under its heading, in a `p.section__note`, saying what the section shows. It describes the *rendering*, never the reader's system: `Semantic colours, drawn as cards.` A number section builds its line from its own reading — `Number tokens that apply to corner radius.` — and the trailing group says it has no reading of its own. The label inside the sentence is the file's own words, escaped like the heading above it |
| Spacing scale | `--space-1` … `--space-6`, 8-based (`0.5rem` a step), and the page spaces from there alone. The step **between** sections is `--space-3` and the steps **inside** one are `--space-1` and `--space-2`, so a section is still set apart by several times the step between its own lines. Since v0.7.0 §2 a section also carries an edge of its own, so the air and the border share the work the air used to do alone |
| Heading tiers | **three, and no more.** Tier one is the panel title (`h2`, `--type-04`; the page title in a `.lede` takes `--type-05`). Tier two is the section heading (`h3`, `--type-03`), one size for every section — Colours, each `applies to` reading, Typography. Tier three is the small muted group label at `--type-01`: the rail label, a ramp's base name, a specimen's meta line. A card title sits at `--type-02`, under tier two, so it never reads as a section of its own |
| Card idiom | one corner and one shadow across the page. Every *surface* — the panel, the colour card's swatch, the preview stage, the shadow specimen's card — takes `--radius-md`; the small parts inside one — chips, buttons, inputs, the spacing specimen's bars — take `--radius-sm`. Lift is `--shadow` and nothing else |
| Container idiom (v0.7.0 §2) | every group of content is a **container**: a 1px `--line` edge, `--radius-md`, the `--layer` fill on the `--bg` canvas, `--space-3` of padding. `.panel` is a container sitting on the page, so it also takes `--shadow`; `.container` and `.number-group` are containers inside one or in a stack of their own, and stay flat. A container that only holds containers is `.panel--bare` — no edge, no fill, no lift — because a border drawn around borders says nothing. The header row is the heading itself (`h2`/`h3` are flex rows), or `.panel__header` where the row also holds a button: title left, count chip and action right |
| Chip idiom (v0.7.0 §2) | one chip for everything small the page says *about* something else — a section's count (`.count`), a token's slot (`.chip.token`, `.chip.raw`), the `applied` badge (`.chip.applied`), and any status added later. `--type-01`, the `--layer-accent` fill, the `--muted` ink, a `--line` edge and `--radius-sm`. A chip is a label, never a control, so it never takes the ink of one |
| Button hierarchy (v0.7.0 §2) | one base (`.btn`, shared with `button.tile-action`) and three readings. `.btn--primary` is the single solid action a container may hold: the page's own `--ink` as the fill, `--layer` as the text, `--ink-hover` on hover, and no hue invented for it. `.btn--ghost` is transparent until the pointer is on it. `button.tile-action` is the base plus a `--line` edge, wearing `--accent` while `aria-selected` or `aria-pressed` is true |

Both themes hold throughout: every colour named above is a theme variable, so
the dark set moves the whole anatomy without a second stylesheet.

## The Backlog, cut by component (v0.7.0 §3)

The Backlog panel used to be one flat `<ul>` of every outstanding line. Every
line already names the component it is about, so since v0.7.0 §3 the panel is
**one container per component** instead — the same container idiom the token
sections wear, with the component's name in the header and the count of the
lines it still owes as that header's chip. The panel's own header carries the
**total** count beside the word "Backlog", in the same chip.

The lines come from `lib/create.js`, which writes them in exactly two shapes:

```
TODO: tokenise `transparent` (Button/Rail background)
TODO: fill contract slot `disabled` (Button/Rail)
```

The parse rule is stated rather than guessed at, and it is three steps:

- **The last `(...)` group in the line names the component.** The scope words
  that follow the name — `background`, `selected font-weight` — sit inside that
  same group, and a value quoted earlier in the line may carry brackets of its
  own, so it is the last group that is read.
- **The longest leading run of words that matches a recorded component wins.**
  What is inside the group is split on whitespace, and the longest run taken
  from the front that exactly matches a component in `DESIGN-SYSTEM.md` is the
  component. Recorded names carry no whitespace today, so in practice that is
  the first word; the run is written that way so a name that grows one keeps
  working.
- **Anything else is unparsed.** A word the file does not record as a component
  is not one, however much it looks like one — the dashboard shows the file, and
  heading a container with a name nobody declared would be the page speaking
  over it. Those lines collect in the one trailing container below.

And three rules keep the rendering honest:

- **File order, twice over.** Containers appear in the order their first line
  appears in the Backlog, and the lines inside a container keep their own file
  order. The unparsed container is always last.
- **The line is rendered verbatim.** Nothing is stripped, split, re-worded or
  re-punctuated — not the `TODO:` prefix, not the backticks, not the
  parenthetical. It is escaped like every other string a hand-edited file
  supplies, and that is all.
- **An empty Backlog still speaks.** With no lines at all the panel renders one
  container wearing the neutral label, a count of `0` and a `(none yet)` line —
  the way Colours, Typography and the number sections answer emptiness — and the
  header chip reads `0`.

<!-- phyllum:backlog -->

| setting | value | meaning |
|---------|-------|---------|
| ungrouped label | `other` | the label of the one trailing container holding every line that names no recorded component, and of the one empty container shown when the Backlog is empty |
| empty line | `(none yet)` | what the one empty container says when there is no Backlog at all |
| group source | `last (...) group` | the parenthetical read for a component name is the last bracketed group in the line, never an earlier one |
| name match | `exact, against recorded components` | the longest leading run of whitespace-separated words inside that group that exactly matches a component name in `DESIGN-SYSTEM.md`; no normalising, lower-casing or stemming |
| group order | `first appearance` | containers follow the order their first line appears in the Backlog, with the ungrouped container last |
| line order | `file order` | lines keep the Backlog's own order inside their container |
| line text | `verbatim` | the whole line as the file wrote it, escaped and otherwise untouched |
| counts | `per container and total` | each container's header chip counts its own lines; the panel header's chip counts every line in the Backlog |

Those settings are the page's `BACKLOG` constant, inside the region marked
`phyllum:backlog-contract`, and the assertion suite reads both this table and
that region — so the ref and the page cannot drift apart quietly.

## The on-page rail (v0.6.0 §4)

GitBook's "On this page" pattern: a second, quieter rail — `nav.rail-toc`,
`aria-label="On this page"` — sitting on the margin outside the content
column rather than beside `nav#views`, so the two rails never compete for the
same attention. It lists the token panel's own section headings and tracks
which one is in view.

<!-- phyllum:rail -->

| Fact | The rule |
|------|----------|
| Source | never a hard-coded list — `buildRail` reads `#tokens-body h3` after every `renderLibrary()` render, because the sections themselves come and go with the file (v0.6.0 §1) |
| Labels | each heading's own text, count excluded — the same string `heading()` escaped when it built the section, read back off the live DOM |
| Ids | a slug of the label (`slugify`), deduplicated against every id already handed out in the same pass (`dedupeId`) — two sections sharing a label still get two working anchors, `foo` and `foo-2` |
| Links | plain `<a href="#…">` per heading, inside one `<ul>`; the anchor itself is the fallback — remove every script on the page and the links still scroll |
| Scroll | CSS `scroll-behavior: smooth`, disabled under `prefers-reduced-motion: reduce` in its own media query rather than a scroll handler |
| Active link | `IntersectionObserver`, disconnected and rebuilt on every `buildRail()` call rather than merely appended to, so it never tracks a heading a previous render already replaced |
| Visibility | shown only while the token panel is on screen — the Library view, with the token filter on — hidden for the Workbench view and for the Components-only filter |
| Placement | sticky, `top: 3rem`, on the margin outside `--measure`; it steps aside below `75rem` viewport width rather than squeezing the reading column |

The two pure facts an id rests on — `slugify` and `dedupeId` — live in the
page's `phyllum:rail-contract` region, kept free of DOM and fetch exactly like
`phyllum:swatch-contract` and `phyllum:numbers-contract` before it, so the
suite lifts and runs the same code the browser runs rather than a restatement
of it.

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
