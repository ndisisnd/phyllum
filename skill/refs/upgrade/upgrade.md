# `upgrade`

Move this install to the latest published version, in one command instead of an
`npm install` incantation the user has to remember.

`upgrade` is mechanics — no model is involved. It is the one command that runs a
package manager, and the second (with `gui`) that starts a process at all.

## Discovery (v0.7.1)

Nothing used to tell the user to run this command. `phyllum version` reported
the CLI version and stopped; the skill copy `init` put in
`.claude/skills/phyllum/` was not part of that conversation, so a package-manager
upgrade could leave it silently out of step for as long as nobody happened to
type `phyllum upgrade`. Discovery now lives on `version` (`refs/version/version.md`
§ The skill copy): it compares the copy's bytes against the freshly installed
package and, whenever they differ, names `upgrade` as the fix. `upgrade` itself
gained no new trigger — it is still typed by hand — but it is no longer a
command the user has to remember exists.

## Step 1 — how was Phyllum installed?

The right command depends entirely on the answer, so the answer is worked
out from evidence rather than assumed:

| Install | Recognised by | Upgrade command |
|---------|---------------|----------------|
| npm, global | the package sits in a `node_modules` no project manifest depends on | `npm install --global phyllum@latest` |
| pnpm, global | the same, with pnpm in the path or the user agent | `pnpm add --global phyllum@latest` |
| npm, project dependency | the owning `package.json` lists `phyllum`; `package-lock.json` present | `npm install --save-dev phyllum@latest` (or `--save`) |
| pnpm, project dependency | the same, with `pnpm-lock.yaml` present | `pnpm add --save-dev phyllum@latest` |

Signals are read in this order: `npm_config_user_agent` (npm and pnpm both set
it), then the install path, then the project's lockfile. A dev dependency is
upgraded with the dev flag and a plain dependency without it, so the manifest ends
up as the user had it.

## Step 2 — refuse well, or act

v0.2.0 drives **npm and pnpm only**. Everything else is a refusal that names the
exact command to run instead — never a guess, and never a dead end:

| Situation | What `upgrade` does |
|-----------|--------------------|
| one-off `npx` / `dlx` run | Explains there is nothing to upgrade — the cache is thrown away and the next run fetches the latest anyway — and gives the two commands that install Phyllum permanently. |
| source checkout | Says a package manager cannot update a checkout, prints the path, and leaves it to git. |
| yarn, bun, or an unrecognised manager | Names the manager, prints its own `install phyllum@latest` line, changes nothing. |
| npm or pnpm missing from PATH | Prints the command to run when it is back. |
| the install command fails | Shows the tail of the error, states the version is unchanged, exits non-zero. |

A refusal exits non-zero: the job was not done. Nothing is installed, written or
removed on any refusal path.

## Step 3 — re-sync the skill

After a successful upgrade, the skill copy `init` installed into
`.claude/skills/phyllum/` is rewritten from the freshly installed package, so the
CLI and the skill can never be two different versions.

- The files are read from disk *after* the install, which is why they are the new
  ones: the package manager replaces the package in place.
- If there is no skill copy in the project, nothing is created — `upgrade` says so
  and points at `phyllum init`. Phyllum does not add files nobody asked for.
- The re-sync goes through the same write funnel as `init`, so it can only ever
  touch `.claude/skills/phyllum/**`.

## Step 4 — prune the orphans (v0.7.1)

The re-sync in Step 3 only ever writes: it copies every enumerated file over
the top and deletes nothing, so a ref file an older version shipped and the
current one dropped survives every `upgrade` forever. Claude reads that orphan
as current guidance, and no amount of re-syncing clears it. After the re-sync,
`upgrade` looks again at what is left in `.claude/skills/phyllum/`. Anything
this version does not enumerate is listed by name, and one question is asked:

```
  extra      2 files in .claude/skills/phyllum/ this version does not ship:
               refs/apply/legacy-flow.txt
               refs/tokenise/old-passes.txt
Remove these 2 files from .claude/skills/phyllum/? (what they hold is lost)
```

- **One question, not one per file.** The whole list is on screen before the
  question, so the answer is given with every name in view.
- **`--yes` does not answer it.** The same rule governs `init`'s legacy-column
  removal: a gate that takes something away is answered by a person, or it is
  answered no. With no way to ask, the answer is no.
- **Declining changes nothing.** Every file stays exactly where it was, the
  re-sync still stands, and `upgrade` still exits 0 — a decline is reported, not
  treated as a failure.
- **Nothing is deleted outside `.claude/skills/phyllum/`.** The prune goes
  through the same write funnel as the re-sync, bounded to that directory and
  refusing the install root itself; a directory emptied by its last file being
  removed is removed along with it.

Phyllum still cannot tell an orphaned ref from a note the user added on
purpose — there is no manifest and no version stamp (§3.1 of the plan that
introduced the skill-copy check), and that limit was settled deliberately
rather than overlooked. So the prune never decides on its own: it lists, it
asks once, and it removes only on a yes.

## What `upgrade` does not do

- **No registry call of its own.** `latest` is resolved by the package manager.
  Phyllum's own registry check lives on `phyllum version`, on demand, nowhere
  else.
- **No shell.** The package manager is spawned by resolved path with an argument
  array.
- **No confirmation prompt for moving the version.** Typing `phyllum upgrade` is
  the consent for that part. The one confirmation `upgrade` does ask (v0.7.1) is
  Step 4's prune, and only because that step removes files.
- **No design system needed.** Like `version`, it is about the install, so it
  works before `init`.

## The name (v0.3.0 §6)

Up to v0.2.3 this command was called `update`. Nothing about it changed in
v0.3.0 except the word: the same detection, the same refusal table, the same
re-sync. The word moved because it was answering the wrong question — "update"
is what people type when they mean *update what Phyllum recorded*, not *update
Phyllum*. So `update` left and the install-moving job took the verb that only
ever meant one thing. `update` spent v0.3.0 as `apply`'s alias and became its own
editing command in v0.4.0 (`refs/update/update.md`); neither move touched anything here.

The switch is silent: no redirect notice, no acknowledgement gate. A
muscle-memory `phyllum update` now opens the editing menu and writes nothing
until an acceptance gate is passed, which is the harmless end of every possible
surprise. Discovery of `upgrade` belongs to `help`, `menu`, the README and the
release note, not to a warning printed on a command that did its job.
