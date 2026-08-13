# `update`

Move this install to the latest published version, in one command instead of an
`npm install` incantation the user has to remember.

`update` is mechanics — no model is involved. It is the one command that runs a
package manager, and the second (with `gui`) that starts a process at all.

## Step 1 — how was Phyllum installed?

The right update command depends entirely on the answer, so the answer is worked
out from evidence rather than assumed:

| Install | Recognised by | Update command |
|---------|---------------|----------------|
| npm, global | the package sits in a `node_modules` no project manifest depends on | `npm install --global phyllum@latest` |
| pnpm, global | the same, with pnpm in the path or the user agent | `pnpm add --global phyllum@latest` |
| npm, project dependency | the owning `package.json` lists `phyllum`; `package-lock.json` present | `npm install --save-dev phyllum@latest` (or `--save`) |
| pnpm, project dependency | the same, with `pnpm-lock.yaml` present | `pnpm add --save-dev phyllum@latest` |

Signals are read in this order: `npm_config_user_agent` (npm and pnpm both set
it), then the install path, then the project's lockfile. A dev dependency is
updated with the dev flag and a plain dependency without it, so the manifest ends
up as the user had it.

## Step 2 — refuse well, or act

v0.2.0 drives **npm and pnpm only**. Everything else is a refusal that names the
exact command to run instead — never a guess, and never a dead end:

| Situation | What `update` does |
|-----------|--------------------|
| one-off `npx` / `dlx` run | Explains there is nothing to update — the cache is thrown away and the next run fetches the latest anyway — and gives the two commands that install Phyllum permanently. |
| source checkout | Says a package manager cannot update a checkout, prints the path, and leaves it to git. |
| yarn, bun, or an unrecognised manager | Names the manager, prints its own `install phyllum@latest` line, changes nothing. |
| npm or pnpm missing from PATH | Prints the command to run when it is back. |
| the install command fails | Shows the tail of the error, states the version is unchanged, exits non-zero. |

A refusal exits non-zero: the job was not done. Nothing is installed, written or
removed on any refusal path.

## Step 3 — re-sync the skill

After a successful update, the skill copy `init` installed into
`.claude/skills/phyllum/` is rewritten from the freshly installed package, so the
CLI and the skill can never be two different versions.

- The files are read from disk *after* the install, which is why they are the new
  ones: the package manager replaces the package in place.
- If there is no skill copy in the project, nothing is created — `update` says so
  and points at `phyllum init`. Phyllum does not add files nobody asked for.
- The re-sync goes through the same write funnel as `init`, so it can only ever
  touch `.claude/skills/phyllum/**`.

## What `update` does not do

- **No registry call of its own.** `latest` is resolved by the package manager.
  Phyllum's own registry check lives on `phyllum version`, on demand, nowhere
  else.
- **No shell.** The package manager is spawned by resolved path with an argument
  array.
- **No confirmation prompt.** Typing `phyllum update` is the consent.
- **No design system needed.** Like `version`, it is about the install, so it
  works before `init`.
