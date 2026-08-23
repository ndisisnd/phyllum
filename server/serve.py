#!/usr/bin/env python3
"""
Phyllum's dashboard server (plan §5, §8 milestone 4).

What this is, in one line: a viewer and a prompt relay. It shows the design
system the terminal already reads, and it hands typed prompts back to the
Claude Code session. It never calls a model, and it never decides anything.

Contract:

  * Python 3 standard library only (http.server) — no extra dependencies.
  * Binds loopback only. A non-loopback --host is refused at startup, not
    merely unused, and requests arriving with a foreign Host header are
    rejected, so a DNS rebind cannot reach the API either.
  * Serves the static page in ../gui/index.html.
  * JSON API:
      GET  /state    the shared session state read from .phyllum/session.json,
                     including the workbench draft and the opening filter
      GET  /system   tokens + components of DESIGN-SYSTEM.md
      GET  /reports  the numbered assessment reports under .phyllum/, newest
                     first, read back into fields the page renders as tables
      POST /prompt   enqueue a prompt into the same session state the terminal
                     reads
      POST /upload   save an image into .phyllum/uploads/ and enqueue it as an
                     image-mode `create` input
  * One parse contract. This server parses nothing itself: it shells out to
    `node ../lib/system-json.js <root>` for DESIGN-SYSTEM.md, the same parser
    `phyllum system` uses, and to `node ../lib/reports-json.js <root>` for the
    numbered reports. Two parsers would be two truths about one file.
  * Writes only inside .phyllum/ — enforced by _write_under_state_dir below, not
    by convention. The Node write funnel (lib/write.js) stays the only path to
    DESIGN-SYSTEM.md; this process cannot reach it.

Usage:

  python3 serve.py --root /path/to/project --host 127.0.0.1 --port 8765 \
      --scope all --node /path/to/node
"""

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PACKAGE_ROOT = os.path.dirname(HERE)
GUI_DIR = os.path.join(PACKAGE_ROOT, "gui")
SYSTEM_JSON_SCRIPT = os.path.join(PACKAGE_ROOT, "lib", "system-json.js")
REPORTS_JSON_SCRIPT = os.path.join(PACKAGE_ROOT, "lib", "reports-json.js")

STATE_DIR = ".phyllum"
STATE_FILE = os.path.join(STATE_DIR, "session.json")
UPLOAD_DIR = os.path.join(STATE_DIR, "uploads")
STATE_VERSION = 1

LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")
ALLOWED_HOST_HEADERS = frozenset(["127.0.0.1", "localhost", "::1", "[::1]", ""])

IMAGE_EXTENSIONS = frozenset(
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg"]
)
MAX_BODY_BYTES = 25 * 1024 * 1024

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
}

_state_lock = threading.Lock()


# ---------------------------------------------------------------------------
# State — .phyllum/session.json, the file the terminal reads
# ---------------------------------------------------------------------------


def _state_path(root):
    return os.path.join(root, STATE_FILE)


def read_state(root):
    """The current session state, or an empty one. A corrupt file is not fatal."""
    try:
        with open(_state_path(root), "r", encoding="utf-8") as handle:
            parsed = json.load(handle)
    except (IOError, OSError, ValueError):
        return {"version": STATE_VERSION}
    if not isinstance(parsed, dict):
        return {"version": STATE_VERSION}
    return parsed


def _write_under_state_dir(root, rel_path, data):
    """
    Write one file inside .phyllum/, atomically, and refuse anything else.

    This is the whole of this process's write permission. DESIGN-SYSTEM.md is
    written by the Node funnel after the user accepts a change — never here.
    """
    root_abs = os.path.realpath(root)
    state_dir = os.path.join(root_abs, STATE_DIR)
    target = os.path.realpath(os.path.join(root_abs, rel_path))
    if target != state_dir and not target.startswith(state_dir + os.sep):
        raise PermissionError(
            "the Phyllum server writes only inside %s/ — refused %s" % (STATE_DIR, rel_path)
        )

    os.makedirs(os.path.dirname(target), exist_ok=True)
    temp = "%s.phyllum-tmp-%d" % (target, os.getpid())
    with open(temp, "wb") as handle:
        handle.write(data)
    os.replace(temp, target)
    return os.path.relpath(target, root_abs)


def write_state(root, patch):
    """Merge a patch into the state and write it back — merging, never replacing."""
    with _state_lock:
        state = read_state(root)
        state.update(patch)
        state["version"] = STATE_VERSION
        body = json.dumps(state, indent=2) + "\n"
        _write_under_state_dir(root, STATE_FILE, body.encode("utf-8"))
        return state


def enqueue(root, entry):
    """Append one item to the queue the terminal drains. Returns the item."""
    with _state_lock:
        state = read_state(root)
        queue = state.get("queue")
        if not isinstance(queue, list):
            queue = []
        queue.append(entry)
        state["queue"] = queue
        state["version"] = STATE_VERSION
        body = json.dumps(state, indent=2) + "\n"
        _write_under_state_dir(root, STATE_FILE, body.encode("utf-8"))
    return entry


def safe_upload_name(raw):
    """A filename that can only ever land inside .phyllum/uploads/."""
    base = os.path.basename(str(raw or "").replace("\\", "/")).strip()
    stem, ext = os.path.splitext(base)
    ext = ext.lower()
    if ext not in IMAGE_EXTENSIONS:
        ext = ".png"
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-.") or "upload"
    return "%s-%s%s" % (time.strftime("%Y%m%d-%H%M%S"), stem[:48], ext)


# ---------------------------------------------------------------------------
# The design system — one parse contract, borrowed from Node
# ---------------------------------------------------------------------------


def node_json(script, root, node_bin):
    """Run a read-only Node JSON view over the project and return its payload.

    The one parse contract, generalised: the server owns no reader of its own.
    DESIGN-SYSTEM.md is parsed by lib/system-json.js and the numbered reports
    under .phyllum/ are read by lib/reports-json.js, both of which are the
    modules the terminal already uses. Neither writes anything, which is why
    this process -- the one outside the Node write funnel -- may call them.
    """
    try:
        result = subprocess.run(
            [node_bin, script, root],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=20,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return 500, {
            "error": "parser-unavailable",
            "message": "could not run `%s %s`: %s" % (node_bin, script, error),
        }

    text = result.stdout.decode("utf-8", "replace").strip()
    if not text:
        return 500, {
            "error": "parser-failed",
            "message": result.stderr.decode("utf-8", "replace").strip() or "no output",
        }
    try:
        payload = json.loads(text)
    except ValueError:
        return 500, {"error": "parser-failed", "message": "the parser did not return JSON"}
    if isinstance(payload, dict) and payload.get("error"):
        return 404, payload
    return 200, payload


def system_json(root, node_bin):
    """Parse DESIGN-SYSTEM.md by asking the canonical Node parser."""
    return node_json(SYSTEM_JSON_SCRIPT, root, node_bin)


def reports_json(root, node_bin):
    """Read the numbered assessment reports under .phyllum/, newest first.

    Read-only, always. The dashboard renders `.phyllum/assess-[n].md`; only
    `phyllum assess` ever writes one.
    """
    return node_json(REPORTS_JSON_SCRIPT, root, node_bin)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


class PhyllumHandler(BaseHTTPRequestHandler):
    """The whole API. Small on purpose: it relays, it does not reason."""

    protocol_version = "HTTP/1.1"
    server_version = "Phyllum/1"
    sys_version = ""

    root = os.getcwd()
    scope = "all"
    node_bin = "node"
    verbose = False

    # -- plumbing ----------------------------------------------------------

    def log_message(self, fmt, *args):
        if self.verbose:
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, payload, status=200):
        body = (json.dumps(payload, indent=2) + "\n").encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _local_request(self):
        """Only a browser on this machine may talk to the API."""
        host = self.headers.get("Host", "")
        name = host.rsplit(":", 1)[0] if host.count(":") == 1 else host
        if name.startswith("[") and "]" in name:
            name = name[: name.index("]") + 1]
        return name in ALLOWED_HOST_HEADERS

    def _read_body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if length < 0 or length > MAX_BODY_BYTES:
            return None
        return self.rfile.read(length) if length else b""

    # -- routes ------------------------------------------------------------

    def do_GET(self):  # noqa: N802 (http.server's spelling)
        if not self._local_request():
            self._json({"error": "forbidden", "message": "localhost only"}, 403)
            return

        path = self.path.split("?", 1)[0]
        if path == "/state":
            self._json(self.state_payload())
            return
        if path == "/system":
            status, payload = system_json(self.root, self.node_bin)
            self._json(payload, status)
            return
        if path == "/reports":
            status, payload = reports_json(self.root, self.node_bin)
            self._json(payload, status)
            return
        self.serve_static(path)

    def do_HEAD(self):  # noqa: N802
        self.do_GET()

    def do_POST(self):  # noqa: N802
        if not self._local_request():
            self._json({"error": "forbidden", "message": "localhost only"}, 403)
            return

        path = self.path.split("?", 1)[0]
        if path == "/prompt":
            self.post_prompt()
            return
        if path == "/upload":
            self.post_upload()
            return
        self._json({"error": "not-found", "message": "no such endpoint: %s" % path}, 404)

    # -- handlers ----------------------------------------------------------

    def state_payload(self):
        state = read_state(self.root)
        gui = state.get("gui") if isinstance(state.get("gui"), dict) else None
        scope = gui.get("scope") if gui and gui.get("scope") else self.scope
        payload = dict(state)
        payload["scope"] = scope
        payload["root"] = self.root
        payload["designSystem"] = os.path.exists(os.path.join(self.root, "DESIGN-SYSTEM.md"))
        payload["draft"] = state.get("draft")
        payload["queue"] = state.get("queue") or []
        payload["readAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        return payload

    def post_prompt(self):
        body = self._read_body()
        if body is None:
            self._json({"error": "bad-request", "message": "unreadable body"}, 400)
            return
        try:
            data = json.loads(body.decode("utf-8")) if body else {}
        except (ValueError, UnicodeDecodeError):
            self._json({"error": "bad-request", "message": "body must be JSON"}, 400)
            return
        if not isinstance(data, dict):
            data = {}

        text = str(data.get("text") or "").strip()
        if not text:
            self._json({"error": "bad-request", "message": "a prompt needs text"}, 400)
            return

        entry = {
            "id": uuid.uuid4().hex[:12],
            "kind": "prompt",
            "text": text,
            "view": data.get("view") or "workbench",
            "source": "gui",
            "status": "pending",
            "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        enqueue(self.root, entry)
        self._json({"ok": True, "queued": entry}, 201)

    def post_upload(self):
        body = self._read_body()
        if body is None or len(body) == 0:
            self._json({"error": "bad-request", "message": "no file in the upload"}, 400)
            return

        name = safe_upload_name(self.headers.get("X-Phyllum-Filename"))
        rel = os.path.join(UPLOAD_DIR, name)
        try:
            written = _write_under_state_dir(self.root, rel, body)
        except (PermissionError, OSError) as error:
            self._json({"error": "refused", "message": str(error)}, 403)
            return

        note = str(self.headers.get("X-Phyllum-Prompt") or "").strip()
        entry = {
            "id": uuid.uuid4().hex[:12],
            "kind": "create-image",
            "file": written.replace(os.sep, "/"),
            "bytes": len(body),
            "text": note or "create from this image",
            "view": "workbench",
            "source": "gui",
            "status": "pending",
            "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        enqueue(self.root, entry)
        self._json({"ok": True, "queued": entry}, 201)

    def serve_static(self, path):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        target = os.path.realpath(os.path.join(GUI_DIR, rel))
        gui_dir = os.path.realpath(GUI_DIR)
        if not target.startswith(gui_dir + os.sep) or not os.path.isfile(target):
            self._json({"error": "not-found", "message": "no such path: %s" % path}, 404)
            return
        with open(target, "rb") as handle:
            body = handle.read()
        ext = os.path.splitext(target)[1].lower()
        self._send(200, body, CONTENT_TYPES.get(ext, "application/octet-stream"))


def main(argv=None):
    parser = argparse.ArgumentParser(description="Phyllum dashboard server (localhost only)")
    parser.add_argument("--root", default=os.getcwd(), help="project root")
    parser.add_argument("--host", default="127.0.0.1", help="loopback host only")
    parser.add_argument("--port", type=int, default=0, help="0 picks a free port")
    parser.add_argument("--scope", default="all", choices=["tokens", "components", "all"])
    parser.add_argument("--node", default="node", help="node binary used for the parse contract")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    if args.host not in LOOPBACK_HOSTS:
        sys.stderr.write(
            "phyllum: refusing to bind %s — the dashboard is localhost only.\n" % args.host
        )
        return 2

    PhyllumHandler.root = os.path.realpath(args.root)
    PhyllumHandler.scope = args.scope
    PhyllumHandler.node_bin = args.node
    PhyllumHandler.verbose = args.verbose

    httpd = ThreadingHTTPServer((args.host, args.port), PhyllumHandler)
    httpd.daemon_threads = True
    port = httpd.server_address[1]

    def stop(_signum, _frame):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    sys.stdout.write(
        json.dumps({"ready": True, "host": args.host, "port": port, "scope": args.scope}) + "\n"
    )
    try:
        sys.stdout.flush()
    except (IOError, OSError):
        pass

    try:
        httpd.serve_forever(poll_interval=0.2)
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
