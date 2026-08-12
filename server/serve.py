#!/usr/bin/env python3
"""
PLACEHOLDER — the real server lands in M4 (plan §5, §8 milestone 4).

Nothing here starts a server yet. The file exists so the package layout in
plan §7.2 is real from M1, and so the contract the GUI will be built against is
written down before anyone builds it.

Contract, when this is implemented:

  * Python 3 standard library only (http.server) — no extra dependencies.
  * Binds localhost only. External interfaces are refused, not merely unused.
  * Serves the static page in ../gui/index.html.
  * JSON API:
      GET  /state    the shared session state read from .basal/session.json
      GET  /system   tokens + components, parsed from DESIGN-SYSTEM.md
      POST /prompt   enqueue a prompt into the same session state the terminal reads
  * Writes only inside .basal/. It never calls a model; all reasoning stays in
    the Claude Code session.
  * `basal gui` records this process's PID and port in .basal/session.json;
    `basal kill` reads that record to stop it.
"""

import sys

MESSAGE = (
    "basal: the GUI server is not built yet — it lands in M4.\n"
    "Run `basal menu` to see what works today.\n"
)

if __name__ == "__main__":
    sys.stderr.write(MESSAGE)
    sys.exit(1)
