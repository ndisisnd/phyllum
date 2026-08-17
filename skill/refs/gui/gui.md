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
