# `version`

Answer one question: which Phyllum is installed here, and is it the current one?

`version` is mechanics — it runs entirely in Node, needs no model, and writes
nothing. It is the **only** command that touches the network.

## What it reports

```
phyllum 0.1.0 — a newer version has been published.
  installed         0.1.0
  latest published  0.2.0

Run `phyllum upgrade` to move to 0.2.0.
```

Two facts, then one sentence about what they mean together:

| Status | When | What it says |
|--------|------|--------------|
| up to date | installed = latest published | "Nothing to do." |
| a newer version has been published | installed < latest published | both versions, and `phyllum upgrade` |
| ahead of what is published | installed > latest published | an unreleased build; nothing to update to |
| installed version only | the registry could not be reached | the installed version, and why the check failed |

## Rules

- **The installed version is read, never written down.** It comes from the
  package's own `package.json`. There is no version string anywhere in the
  source, so the number can never drift from the code that is running.
- **The registry check is on demand, and only here.** No other command asks the
  registry, nothing is cached between runs, and no banner, menu or help page ever
  hints that an update is available. If the user did not ask, Phyllum does not
  check.
- **Offline is an answer, not an error.** A missing network, a timeout, an error
  from the registry or a reply in an unexpected shape all end the same way: the
  installed version is printed, the reason the check failed is stated plainly,
  and the exit code is 0. `version` never blocks and never crashes.
- **It works before `init`.** `version` is about the install, not about the
  project, so it needs no `DESIGN-SYSTEM.md`.

## What it asks

`GET https://registry.npmjs.org/phyllum/latest`, with a short timeout, reading
one field: `version`. Nothing is sent about the user or their project.

## The skill copy (v0.7.1)

`upgrade` exists to keep two things on the same version: the CLI, and the copy
of this skill that `init` put in `.claude/skills/phyllum/`. A package manager
replaces the CLI in place and has no business writing into a project, so a
habitual `npm install --global phyllum@latest` leaves that copy exactly where
it was. Nothing told the user their skill copy had fallen behind — until now.
`version` prints a third row, always, reporting the state of the copy in the
directory you are standing in:

```
phyllum 0.7.0 — a newer version has been published.
  installed         0.7.0
  latest published  0.7.1
  skill copy        3 of 46 files differ from this install

Run `phyllum upgrade` to move to 0.7.1 and re-sync the skill copy.
```

| Finding | Recognised by | Reported as |
|---------|---------------|-------------|
| in step | every file `init` would install is present and byte-identical | `in step with this install` |
| differs | one or more files missing, changed, unreadable, or present in the copy but not enumerated by this install | `N of 46 files differ from this install` |
| none here | `.claude/skills/phyllum/` does not exist | `none in this directory` |

An extra file — one sitting in the copy that this install does not enumerate —
counts as a difference, not as a match. It is usually a note the user added, or
a ref file an older version shipped and this one dropped; the second case is
exactly the drift this row exists to surface, because Claude reads whatever is
in that directory as current guidance. Ignoring it would be quieter and would
miss the case that matters most.

The row reads `differs`, never "out of date" and never "behind". Phyllum cannot
tell a stale copy from one the user edited on purpose, and a count is the only
part the comparison can prove — the recommendation lives in the closing line,
not in the row itself.

Two rules govern that closing line: when the CLI is outdated **and** the copy
differs, one sentence covers both, because `upgrade` does both jobs in one run
and naming it twice would misdescribe the work; when the CLI is current and
only the copy differs, the closing line names `upgrade` on its own account —
re-syncing is worth doing even with no new version to fetch.

**The signal is the bytes, not a stamp.** The row is answered by comparing the
files on disk in `.claude/skills/phyllum/` against the files the installed
package would write — the same enumeration `init` uses — never by writing or
reading a version marker. A stamped `.phyllum-version` file would be cheaper to
compare, and it was rejected on principle: it writes a file nobody asked for,
which `init` and `upgrade` both refuse to do, and it reintroduces the exact
thing `version` exists to avoid — a version string written down somewhere, free
to drift from the code it claims to describe. The bytes are the truer signal
anyway: a stamp says what version was *installed*, the bytes say what the file
*is*.

The comparison is a file read, so it costs no network and is fully answered
under `--skip-registry`, where the registry rows are not. It looks only in the
current working directory, mirroring `upgrade`, which re-syncs the project you
are standing in — a global install serving five projects still has five copies,
and `version` reports on the one in front of it. And it never fails the
command: an unreadable file is reported as `differs`, not thrown, and `version`
still exits 0 for every finding — a user with an edited skill copy has not done
anything wrong.
