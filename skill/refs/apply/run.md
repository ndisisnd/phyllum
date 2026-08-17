## Re-running `apply` — resume, don't restart

A PRD already at `.phyllum/PRD.md` is **resumed**, not replaced. One sentence
covers it: **the inventory is regenerated, the marks are kept.**

| Regenerated every run | Kept every run |
|-----------------------|----------------|
| the change list, re-derived from the current `DESIGN-SYSTEM.md` and a fresh read of the code | every ticked criterion whose change is still in the plan |
| the phase grouping, and therefore every criterion **id** | every `- [x] Phase n complete` marker |
| the header counts, the out-of-scope lists, the verification blocks | `- Commit:` and `- Stopped:` records |
| | the whole `## Notes` section, verbatim |

**Ids renumber, so ticks are not carried by id.** They are carried by what the
criterion is *about* — the resume key is `file | literal-or-pattern | becomes`.
That is why you can edit the PRD, re-run `apply`, and keep your progress.

Two honest edge cases:

- A tick whose change has **disappeared** from the codebase is dropped, and the
  report says how many. Keeping it would be a plan claiming credit for work it no
  longer contains.
- A phase marked complete that has **gained a change** since is reopened, with a
  `- Reopened:` line saying why. A completed marker is otherwise kept exactly as
  written — Phyllum does not second-guess a phase somebody verified by hand.

`phyllum apply --fresh` discards all of it: ticks, completed phases and notes.
The report says so plainly, because that is the one destructive thing `apply` can
do to its own file.

---

## Step two — `apply run`

The write path. It happens in six steps, in this order, and each one can only
refuse or continue — **nothing is ever undone.**

### 1. The plan, or nothing

No `.phyllum/PRD.md` means no consent, so `apply run` names the command that
writes one and exits 0. A plan with no phases is the same answer.

### 2. Is the plan still about this codebase?

The criteria name literals. If the design system or the code has moved since the
plan was written, a criterion may name something that is no longer there — and
editing files against criteria nobody re-read is exactly what the plan-first
contract exists to prevent.

The check re-derives the plan and compares **resume keys** (`file |
literal-or-pattern | becomes`), the same identity the resume path uses. Only
**un-ticked** criteria count: a criterion this run already satisfied no longer
describes anything derivable *because it was done*, and treating that as staleness
would make every resume refuse itself. Work the plan does not contain is not
staleness either — that is what re-running `phyllum apply` is for.

A stale plan needs an **explicit continue**. Without one — including in CI, where
there is nobody to ask — the run refuses and points at `phyllum apply`. `--yes`
deliberately does not stand in for a person here.

### 3. Hand off, when the project has its own harness

Harness detection runs again, with the same precedence as step one. **Found → hand
off.** The PRD was already written in that harness's expected shape, so `apply run`
prints precise instructions pointing it at `.phyllum/PRD.md` — the branch rule, the
one-commit-per-phase rule, where values may come from, which markers to tick, the
verification bar, and what to record on failure — and then stops, having written
nothing and run nothing.

Phyllum **does not drive another vendor's harness process.** Doing so would mean
guessing at another product's contract, and it would hide who is actually writing
to the codebase.

**None found → Phyllum's own orchestration**, below.

### 4. Git, and a branch of its own

Five refusals, each with the fix in it: no `git`, not a repository, no commits to
branch from, no commit identity configured, and a **dirty working tree** — because
Phyllum will not fold somebody else's uncommitted work into its commits.

Then the branch: `phyllum/apply-<date>`, created from wherever the user was
standing. A branch of that name that already exists is **resumed onto**, not
recreated. The user's own branch is never checked out again and never written to.

### 5. One phase at a time

| Layer | Which criteria | How |
|-------|----------------|-----|
| **Mechanical** | an **exact** literal, on the properties the criterion names, in a stylesheet, becoming a colour or number token | Node does it: the declarations are found, the value is swapped for `var(--token)`, and the custom property is declared in that same file so the page still renders |
| **Agent** | everything else, with the reason recorded per criterion | one orchestrator, at most one agent per phase |

The four agent reasons, each stated in the report:

- **component adoption** — markup has to be written, and `create`'s recorded
  contract is what it has to satisfy: generation, not substitution;
- **a near-identical literal** — the rendered value changes, which is a judgement
  the plan flagged with a `note` and a mechanical pass must not make;
- **typography** — one token carries size, weight and line-height at once, so
  which declarations it replaces is not a single substitution;
- **a file that is not a stylesheet** — the literal may sit in markup, a script or
  a template.

**Default orchestration (decided):** a **Fable orchestrator** driving **Opus 4.8
agents**. The orchestrator's prompt is the phase's own PRD section **verbatim**
plus the execution guarantees, because the PRD is what the user approved — a
paraphrase would mean the agent works from something nobody signed off. Around it
Phyllum adds constraints only: the branch, the exact file list, invent nothing,
do not commit.

**No model reachable** — not inside a Claude Code session and no `claude` on PATH
— and an agent phase **stops**, recording `- Stopped: needs claude-opus-4-8 via the
claude CLI` on itself. Mechanical criteria already done in that phase are ticked (they
are in the working tree) but the phase does not commit, because a phase commits
when it is whole. Wholly mechanical phases still complete and still commit. It
never pretends, and it never writes a line it could not have derived.

### 6. Verification, then the commit

A phase commits only when all three hold:

1. **Every criterion verifies by reading the file.** Three answers, and the third
   is the important one: satisfied, not satisfied, and **cannot tell**. An
   unverifiable criterion stops the phase and says to check it by hand and tick it
   — ticking a box on an agent's word would make every tick in the PRD worthless.
2. **The diff touches only the files the criteria name.** A stray edit is left
   uncommitted and named in the report, which is what makes one-phase-one-commit
   true rather than aspirational.
3. **The host project's own test suite is green**, when one was detected. A suite
   Phyllum is not allowed to start (a runner outside its allowlist) is reported as
   not run rather than assumed green.

Then `git add` and `git commit` **with the pathspec repeated**, so the commit
contains exactly those files. The PRD gains its marks: `- [x]` on each criterion,
`- [x] Phase n complete`, and `- Commit: <sha>`.

**On failure: stop and report.** Completed phases stay as commits, `- Stopped:
<why>` lands on the phase that failed, the header `Status` is updated, and the
report says how to resume. `phyllum apply run` picks up from the first un-ticked
phase. **Nothing is rolled back, ever** — the git module physically cannot: its
subcommand allowlist has no `reset`, `revert`, `restore`, `clean`, `stash` or
`push` in it.

### Status reports, every five minutes

Wall clock, not phase boundaries (guarantee 3): a phase can run for half an hour,
and "still working" is the thing somebody watching a run needs to know.

```
phyllum apply run · Phase 2 of 4 — Number tokens · 3/7 criteria · elapsed 5m00s
```

The clock is injectable, so the assertion suite drives the cadence without waiting
a real second for it.

---

## `.phyllum/config.json` — the settings file

The only user-editable settings file, separate from `.phyllum/session.json`
because session state is machine-written and rewritten constantly while this is
hand-written and must survive untouched. Both are inside the `.phyllum/**`
exception the permission model already had.

```json
{
  "preferences": { "harness": "claude-code" },
  "apply": {
    "orchestratorModel": "claude-fable-5",
    "agentModel": "claude-opus-4-8",
    "statusIntervalMinutes": 5
  }
}
```

| Key | Default | Meaning |
|-----|---------|---------|
| `preferences.harness` | — | layer 2 of harness detection; `session.json` is still read for one recorded by `init` |
| `apply.orchestratorModel` | `claude-fable-5` | the orchestrator Phyllum spins up when it drives the run itself |
| `apply.agentModel` | `claude-opus-4-8` | the model the orchestrator's agent runs on |
| `apply.statusIntervalMinutes` | `5` | the status cadence |

**Config only — no CLI flags** for model selection in v0.2.0 (decided). A flag
would make "which models drive my codebase" a per-invocation accident; a file
makes it a project decision somebody can read and review in a diff.

Every key is optional, and a malformed one is **ignored with a reason printed in
the report** rather than being fatal or half-applied. A typo in a settings file
must not stop somebody running the plan they already approved — and a silently
ignored setting is worse than a rejected one.

---
