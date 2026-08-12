# `gui` (alias: `dashboard`) and `kill`

*Lands in M4. Documented here so the contract is fixed before the code exists.*

`basal gui` starts a local Python HTTP server (stdlib `http.server`, zero extra
dependencies) serving a static HTML/JS single page, and prints or opens
`http://localhost:<port>`.

## Three views

1. **Library** — every component and token, read live from `DESIGN-SYSTEM.md`.
   Clicking a component shows its spec and its code. The scope argument picks
   the opening filter: `tokens`, `components`, or `all` (the default). The user
   can still switch views inside the GUI.
2. **Create** — the same `create` flow as the terminal, including the follow-up
   loop and drag-drop image input.
3. **Token view** — a component rendered with its token usage highlighted:
   which tokens it consumes, and which values are still raw and therefore
   candidates for the next `tokenise` run.

## Architecture

- The GUI is a **viewer and prompt relay**, not a second brain. Terminal and GUI
  share one session state file in `.basal/`. The server exposes a small JSON API
  — `GET /state`, `GET /system`, `POST /prompt` — and the page polls `/state`.
  All reasoning stays in the Claude Code session; the server never calls a model.
- Image upload drops the file into `.basal/` and enqueues an image-mode `create`.
- The server binds localhost only. No external network access, ever.

## Lifecycle

- `basal gui` records the server's PID and port in `.basal/session.json`.
- A second `basal gui` while one is running reprints the URL rather than
  starting a second process.
- `basal kill` reads the record, stops the server and clears the entry. With
  nothing running, or a stale PID left by a crash, it reports cleanly and clears
  the stale record rather than erroring.
