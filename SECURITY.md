# Security policy

## Reporting a vulnerability

Please don't open a public issue for a security problem. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/ndisisnd/phyllum/security/advisories/new)
— it goes straight to the maintainer and stays closed until there's a fix.

Include what you can: what the issue is, how to reproduce it, and what an attacker could
do with it. A rough report is more useful than no report.

You'll get an acknowledgment once the maintainer sees it. If a fix ships, you'll be
credited in the advisory unless you'd rather not be.

Private reporting has to be enabled in the repository settings before that link works —
it's off by default, so a maintainer needs to turn it on first.

## Supported versions

Phyllum is pre-1.0 and ships from the `main` branch. Fixes land there; there is no
back-port to older tags. Run the latest `main` to stay current.

## Scope

Phyllum runs locally. It writes exactly one file into the repository you point it at —
`DESIGN-SYSTEM.md` — plus its own session state under `.phyllum/` and, on `init`, a skill
install under `.claude/skills/phyllum/`. It has no server that listens to the outside
world, holds no credentials, and sends no repository data anywhere.

Two behaviours are worth naming because they are the real surface:

- The intelligent commands (`create`, `tokenise`) shell out to the `claude` CLI when run
  from a plain terminal, so anything you feed them is passed to that process.
- The `gui` command starts a Python web server bound to localhost only, to serve a local
  dashboard. It is not reachable from other machines.

If you find a way for Phyllum to write outside that one file, reach the network beyond a
localhost GUI, or execute input it shouldn't, that's in scope — please report it.
