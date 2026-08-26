## `govern init` — the enforcement plumbing, and only the pieces you ask for

This is the Governance stage's third mode with a file behind it, and the last
thing v0.12.0 ships. The other two modes write *into* the design system: `govern
log` records what changed, `govern docs` records what a component is. This one
writes **outside** it, into the two places a project runs checks from — the
pre-commit hook and the CI workflow — so that the compliance pre-flight in
`refs/govern/protocol-compliance.md` §2 has somewhere to run automatically.

| Property | Value |
|----------|-------|
| mode | `govern init` |
| implemented in | `lib/govern-init.js` |
| reads | which pieces the user asked for, and whatever is already at each piece's path |
| writes | `.git/hooks/pre-commit`, `.github/workflows/phyllum.yml`, or both — never anything else |
| kind | deterministic rendering; the choice and the acceptance are the user's |

---

### The user picks the pieces, and nothing is picked for them

**Nothing installs without a stated choice.** Not a default, not "both, since you
did not say", and not a helpful extra file alongside the one that was asked for.
A tool that writes a git hook nobody asked for has done the single most
surprising thing a design-system tool can do, and the surprise is discovered at
the next commit rather than now.

So the mode takes a choice, the choice names pieces from a closed list, and an
empty or unrecognised choice is refused rather than resolved.

<!-- phyllum:init-pieces -->

| Piece | Path | What it runs | Blocks | Why that and nothing else |
|-------|------|--------------|--------|---------------------------|
| `hook` | `.git/hooks/pre-commit` | `phyllum assess drift` — the codebase compared against `DESIGN-SYSTEM.md` | no | it is the one reading that is fast, read-only, and about the change being committed |
| `workflow` | `.github/workflows/phyllum.yml` | `phyllum assess score`, then `phyllum assess drift` | no | CI has room for the health score as well as the comparison, and neither writes anything |

`both` is the spelling for both rows, and it is a word in the copy table rather
than a third piece: there are two pieces, and asking for both is asking for two.

---

### Why neither piece fails anything

Both generated files report and then exit successfully. That is a decision, and
it is the same decision the stage frame makes twice over.

**Governance grades nothing.** `refs/govern/govern.md` §6 states it as a rule the
stage must never break, and a pre-commit hook that rejects a commit is a grader
with a veto. Refine is the stage that holds a subject against the bar, and
`refine gate` is where a verdict belongs.

**A hook that blocks is a hook that gets deleted.** A commit refused on the
strength of a read-only reading of raw styling teaches one lesson — `--no-verify`
— and after a week the plumbing is gone and so is the reading. A hook that prints
what drifted survives long enough to be read.

**Neither command has a failing exit anyway.** `assess score` and `assess drift`
both return zero by construction: they scan, print one section, and write
nothing. A generated file claiming to gate on them would be claiming an exit code
that does not exist, which is the never-invent rule applied to shell.

The two files therefore say what they run, run it, and exit zero. The hook adds
one guard for the case where Phyllum is not installed on the machine doing the
commit: it says so and steps aside, because a missing tool is not a reason to
stand between somebody and their own commit.

---

### The two files, line for line

The generated contents are this table, in row order, with each line indented by
the number of spaces its row states. An em dash in the `Line` column is a blank
line. The table is the file, so a change to what the plumbing runs is an edit
here rather than an edit inside a renderer nobody opens.

<!-- phyllum:init-files -->

| Piece | Indent | Line |
|-------|--------|------|
| `hook` | 0 | #!/bin/sh |
| `hook` | 0 | # Phyllum — the design-system pre-flight (`govern init`, v0.12.0). |
| `hook` | 0 | # |
| `hook` | 0 | # It reports, and it never blocks. Governance states the bar and Refine is |
| `hook` | 0 | # what grades against it, so a commit refused on a read-only reading would |
| `hook` | 0 | # teach one lesson: --no-verify. |
| `hook` | 0 | — |
| `hook` | 0 | if ! command -v phyllum >/dev/null 2>&1; then |
| `hook` | 2 | echo "phyllum: not on PATH — skipping the design-system reading." |
| `hook` | 2 | exit 0 |
| `hook` | 0 | fi |
| `hook` | 0 | — |
| `hook` | 0 | phyllum assess drift |
| `hook` | 0 | exit 0 |
| `workflow` | 0 | # Phyllum — the design-system reading (`govern init`, v0.12.0). |
| `workflow` | 0 | # |
| `workflow` | 0 | # It reports, and it never fails the build, for the reason the pre-commit |
| `workflow` | 0 | # hook does not block: Governance states the bar, Refine grades against it. |
| `workflow` | 0 | — |
| `workflow` | 0 | name: Phyllum design system |
| `workflow` | 0 | — |
| `workflow` | 0 | on: [push, pull_request] |
| `workflow` | 0 | — |
| `workflow` | 0 | jobs: |
| `workflow` | 2 | design-system: |
| `workflow` | 4 | runs-on: ubuntu-latest |
| `workflow` | 4 | steps: |
| `workflow` | 6 | - uses: actions/checkout@v4 |
| `workflow` | 6 | - uses: actions/setup-node@v4 |
| `workflow` | 8 | with: |
| `workflow` | 10 | node-version: '20' |
| `workflow` | 6 | - name: The health score |
| `workflow` | 8 | run: npx --yes phyllum assess score |
| `workflow` | 6 | - name: Drift against DESIGN-SYSTEM.md |
| `workflow` | 8 | run: npx --yes phyllum assess drift |

---

### Two new names on the write-target list, and why they are init-only

`SKILL.md` opens with the hard rule: Phyllum writes exactly one file in the
user's codebase, plus a short enumerated list of Phyllum-owned exceptions. This
mode adds two names to that list, and they are the first two names on it that
live outside the project's own working files.

| Lock | What it means |
|------|---------------|
| named in full | `.git/hooks/pre-commit` and `.github/workflows/phyllum.yml`, exactly. Not `.git/hooks/**`, not `.github/**` — a directory would have been a widening, and two filenames are two filenames |
| init only | the funnel admits them under the same flag that admits the skill install and the `.gitignore` line, so no ordinary command can reach them however it is called |
| never created from nothing | the hook needs a `.git/hooks/` that already exists, which means a repository the user already has. `govern init` does not make one |
| never overwritten in silence | a file already at either path that Phyllum did not write is left exactly where it is, and the plan says so. Replacing it needs the user to say so |
| never removed | the funnel's one remover reaches inside the skill install alone. Uninstalling the plumbing is `rm`, by the person who owns the repository |

The `.gitignore` precedent is the one this follows: a file outside the design
system, written once during a setup step, on a confirmation, by name.

---

### Rerunnability, and the file that is already there

Running anything twice converges, and this mode has three answers rather than
two, because the third one is somebody else's file.

- **Identical** — the path already holds exactly what `govern init` would write.
  Nothing is written, and the result says so rather than reporting a success.
- **Absent** — the path holds nothing. The piece is written.
- **Occupied** — the path holds something else. **Nothing is written**, the plan
  reports the conflict, and the write is refused until the user says to replace
  it. A project's own pre-commit hook is somebody's work, and a tool that
  overwrites it has destroyed something it was never asked about.

---

### What this mode must never do

- **Install a piece nobody asked for.** The choice is stated, or there is no run.
- **Block a commit or fail a build.** Governance states the bar; Refine grades.
- **Overwrite a hook or a workflow it did not write.** An occupied path is a
  question, never a merge and never a silent replacement.
- **Widen the two names.** Two files, spelled out. A directory allowance would be
  the write-target rule ending quietly.
- **Create a git repository, or a `.github` in a project that has no CI.** The
  workflow file's own directory is made on the way to the file it was asked for,
  and nothing else is set up on anybody's behalf.
- **Invent a check.** The generated files run commands the CLI ships today. A
  command that does not exist is a broken hook in somebody's repository, which
  is the never-invent rule with a shell prompt attached.
- **Claim to enforce.** The plumbing runs a reading and prints it. Enforcement is
  what a person does with what they read.
- **Write anywhere else.** Not the git config, not `package.json`, not a CI file
  under another name.

---

### The fixed lines

<!-- phyllum:init-copy -->

| Line | Text |
|------|------|
| `both` | both |
| `no-choice` | `govern init` installs the pieces you name and nothing else. Ask for {pieces}, or for both. |
| `unknown-piece` | "{piece}" is not a piece `govern init` installs. The pieces are {pieces}. |
| `not-a-repo` | This project has no `.git/hooks/` directory, so there is nowhere to put a pre-commit hook. `govern init` never creates a repository. |
| `unchanged` | {path} already holds exactly what `govern init` would write, so nothing was written. |
| `conflict` | {path} already exists and Phyllum did not write it. Nothing was written — say so explicitly to replace it, and what is there now is gone. |
| `no-replacement` | Phyllum refused to replace {path}. A file at that path that Phyllum did not write is replaced only when you say so by name. |
| `not-written` | Nothing has been written — Phyllum writes the plumbing only when you accept. |
| `installed` | Wrote {path}. It runs {runs}, and it never blocks. |
