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
| `GET /system` | — | `{ header, columns, tokens: { colours, numbers, typography }, components, backlog, counts }`; each component carries `name`, `spec`, `blocks`, and its parsed slots `archetype`, `custom`, `properties`, `states` (see `refs/gui/component-preview.md`) |
| `GET /reports` | — | `{ reports, count, root }` — every `.phyllum/assess-[n].md`, newest first, each read back into `{ number, path, date, summary, drift: { columns, rows, note }, health: { score, scaleTop, means, verdict, detail }, schemaVersion, recommendations }`; a report that could not be read comes back as `{ number, path, error }` rather than blanking the list |
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

`GET /reports` follows the same rule for the numbered assessment reports: it
shells out to `node lib/reports-json.js <root>`, which reads the numbering, the
paths and the machine-readable recommendations block back through
`lib/assess-reports.js` — the module that wrote them. Both routes go through one
helper, `node_json`, so the server owns no reader of its own. Both scripts are
read-only, which is what lets this process — the one outside the Node write
funnel — call them at all: the dashboard renders `.phyllum/assess-[n].md` and
never writes one.

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
