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
   each token *shown* rather than merely printed (see "Showing the values"
   below). Clicking a component shows its spec and its code. The scope argument
   picks the opening filter: `tokens`, `components`, or `all` (the default). The
   user can still switch filters inside the GUI.
2. **Workbench** — the active `create` session: the user's input on one side,
   the draft the terminal is building on the other, refreshed as the follow-up
   loop progresses. An input box relays edits from the page, and an image
   dropped on it becomes an image-mode `create` input.
3. **Token view** — a component's token usage: which tokens it consumes, and
   which values are still raw and therefore candidates for the next `tokenise`
   run.

## Showing the values (v0.3.0 §6.5)

A design system read as a table of hex strings is a list you have to imagine.
The Library view renders each token in the thing it describes:

| Section | Rendering |
|---------|-----------|
| Colours | one **card** per token — a filled, rounded swatch, with the token name and then its value printed *beneath* the swatch (v0.4.0 §5.5, below) |
| Colours — Primitives | **swatches** in **ramp strips**: one strip per base name, its steps side by side in file order, each step's label sitting on the swatch itself |
| Numbers | a **measured bar** per token, its length proportional to the largest number in the section; a value with no leading number reads as an empty track |
| Typography | a **live specimen** per token, set in that token's own size, weight and line-height |

Two rules decide how a swatch is drawn, and both are numbers rather than
judgement calls. `luminance` below is WCAG 2.x relative luminance, `0` for
black and `1` for white:

<!-- phyllum:swatches -->

| rule | value | meaning |
|------|-------|---------|
| near-white | `>= 0.85` | a colour this light vanishes against the page, so the swatch takes the **bordered** variant instead of relying on its fill |
| dark ink | `>= 0.5` | at or above this the name and value are set in dark ink (`#161616`); below it, light (`#ffffff`) |
| ramp steps | `9` | a primitives ramp strip is nine steps wide, `100`–`900` |

A value that is not a hex colour at all still renders as a swatch — bordered
and unfilled — because the dashboard shows the file, never an edit of it.

These numbers live in one place in the page (`SWATCH`, inside the region marked
`phyllum:swatch-contract`), and the assertion suite reads both this table and
that region so the two cannot drift.

## Colour cards in a grid (v0.4.0 §5.5)

A semantic colour token is a **card**, not a labelled block of colour. The name
and the value are printed beneath the fill rather than on it, so nothing has to
stay legible against an arbitrary background, and the cards wrap to the viewport
instead of stacking one to a row.

**Card anatomy — three nodes, in this order:**

1. **the swatch** — a filled block with rounded corners, carrying the token's
   own value as its `background`;
2. **the name** — the token, in the page's own ink;
3. **the value** — on its own line, in the mono face, in the muted ink.

The container is one `article.card` per token, carrying `data-token` and
`data-value`, holding `.card__swatch`, then `.card__name`, then `.card__value`.
Cards sit in one `.cards` grid container; the grid wraps, so the column count
follows the viewport width and never the token count.

The **near-white rule above still applies**: a fill at or over the near-white
luminance takes the bordered variant (`card--bordered`), because a white swatch
on a white layer still needs an edge. A value the page cannot read as a colour
is bordered and unfilled, as ever. The dark-ink rule no longer decides anything
on a card — the label is off the fill — and stays in force for ramp strips,
where the label is still on the swatch.

**Primitive ramps are not cards.** The nine-step strips (v0.3.0) stay exactly as
they are: a ramp reads as one thing, and cutting it into nine cards would lose
that. The card grid is the semantic Colours table only.

<!-- phyllum:cards -->

| dimension | value | meaning |
|-----------|-------|---------|
| swatch radius | `0.5rem` | the rounded corner on the swatch — the one recorded departure from the sharp-cornered Carbon direction |
| card min width | `13rem` | the narrowest a card gets before the grid drops a column |
| card max width | `20rem` | the widest one card grows to, so a wide viewport gains columns rather than billboards |
| grid gap | `1rem` | the space between cards, in the page's existing spacing scale |
| swatch height | `7rem` | the height of the fill itself, unchanged from the v0.3.0 swatch |

These are CSS custom properties (`--card-radius`, `--card-min`, `--card-max`,
`--card-gap`, `--card-swatch-height`) *and* entries in the page's `CARD`
constant, inside the same marked contract region; the assertion suite reads this
table, the constant and the stylesheet, so all three move together or not at
all.

**Colour style follows the page.** Card chrome — text colours, spacing,
background — is the dashboard's existing palette and type ramp. No font changes,
no new sizes outside the five-step ramp. The rounded swatch corner is the single
deliberate departure from "sharp corners everywhere"; every other element keeps
its square corner.

### Gradients in a card (v0.4.0 §5.1)

A gradient token is an ordinary Colours row, so it is an ordinary card. The
answer to the open question is **no: the swatch needs nothing beyond
`background: <value>`** — the browser paints a CSS gradient for free, at any
size, with no second element and no fallback layer.

Two consequences worth stating as contract:

- **The value is still gated before it is inlined.** `DESIGN-SYSTEM.md` is a
  file a person edits, so a value only reaches a `style` attribute when the page
  recognises its shape — a hex colour, or one of the gradient functions
  (`linear-gradient`, `radial-gradient`, `conic-gradient` and their
  `repeating-` forms) with no `;`, quote, comment or `url(` in it. Anything else
  renders bordered and unfilled, exactly as `var(--brand)` does today.
- **A gradient is never near-white.** It has no single luminance, so it takes
  the plain variant, and its label reads off the fill like every other card's.

## Look and feel — Carbon-like, not Carbon

The dashboard is styled along Carbon Design System lines: flat tiles, sharp
corners (with one recorded exception — the colour-card swatch, above), a
five-step type ramp, generous whitespace, and a left-rail shell under a dark
product header. It is an aesthetic, not a
dependency — no `@carbon/*` package, no CDN, no build step.

| Property | Value |
|----------|-------|
| Stylesheet | hand-written, inline in `gui/index.html` — one file, no second asset |
| Type stack | `'IBM Plex Sans'` first, then system sans; mono is `'IBM Plex Mono'` then system mono |
| Webfont | **none** — Plex is used where it is already installed locally and nothing is fetched |
| Network | the page makes same-origin requests to its own server only (`/state`, `/system`, `/prompt`, `/upload`); no external URL appears anywhere in the file |
| Themes | a Carbon-shaped white theme, and a g100-shaped dark theme under `prefers-color-scheme` |

## Server contract

| Property | Value |
|----------|-------|
| Runtime | Python 3 standard library only (`http.server`), no dependencies |
| File | `server/serve.py` |
| Bind | `127.0.0.1` only — a non-loopback `--host` exits 2 rather than binding |
| Host header | requests naming anything but `localhost` / `127.0.0.1` / `::1` get 403, so a DNS rebind cannot reach the API |
| Port | chosen free by the CLI and passed with `--port` |
| Writes | only inside `.phyllum/`, enforced in `_write_under_state_dir` |
| Model calls | none, ever |

Arguments: `--root <project> --host 127.0.0.1 --port <n> --scope <scope>
--node <node binary> [--verbose]`.

## JSON API

| Route | Body | Returns |
|-------|------|---------|
| `GET /` | — | the dashboard page (`gui/index.html`) |
| `GET /state` | — | `.phyllum/session.json` verbatim, plus `scope` (the opening filter), `draft`, `queue`, `designSystem`, `root`, `readAt` |
| `GET /system` | — | `{ header, columns, tokens: { colours, numbers, typography }, components, backlog, counts }` |
| `POST /prompt` | `{ text, view? }` | `201 { ok, queued }`; empty text is `400` |
| `POST /upload` | raw file bytes, `X-Phyllum-Filename` header (optional `X-Phyllum-Prompt`) | `201 { ok, queued }` |

Queue entries are appended to `state.queue` and look like:

```json
{ "id": "9e790c684acb", "kind": "prompt", "text": "make the radius 8px",
  "view": "workbench", "source": "gui", "status": "pending", "at": "…" }
```

An upload writes the file to `.phyllum/uploads/<date>-<name><ext>` — the filename
is sanitised to a basename with a known image extension, so nothing can escape
the directory — and enqueues `{ "kind": "create-image", "file": "…" }`. M4
shipped the plumbing; since M5 the queue is drained: a bare `phyllum create` takes
the oldest pending `create-image` entry, removes it from the queue, and runs
image mode on that file exactly as if the path had been typed in the terminal.

## The parse contract — one parser, decided

`GET /system` does **not** parse `DESIGN-SYSTEM.md` in Python. The server shells
out to `node lib/system-json.js <root>`, which is a thin JSON view over
`lib/design-system.js` — the same parser `phyllum system`, `create` and `tokenise`
use.

Why this way, over a minimal Python reader with a round-trip test:

- The file's structure is a contract with real corners (the four-backtick
  fencing rule, header rows that are structure rather than data, empty sections
  that must stay). A second implementation would have to re-learn all of it.
- A round-trip test proves two parsers agree *on the fixtures*. Reusing one
  parser makes them agree by construction, which is what "the GUI and the
  terminal are one truth" has to mean.
- Node is already present whenever the server is: `phyllum gui` starts it, and
  passes its own `process.execPath` on `--node`.

The cost is one subprocess per `/system` request. The page fetches `/system`
occasionally and polls the cheap `/state`, so it is not on the hot path.

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
