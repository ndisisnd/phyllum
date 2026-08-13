# `apply`

Apply the recorded design system to the codebase: raw values become the tokens
that already name them, ad-hoc patterns become the components already recorded.

```
phyllum apply          create or refresh the plan
phyllum apply --fresh  regenerate the plan from scratch
phyllum apply run      execute the plan, on its own branch, one commit per phase
```

`apply` is the first Phyllum command that will ever change source code, so the
crossing is controlled by design: **no source file changes without a reviewable
plan, a separate branch, and phased commits.** Plan before implementation is the
contract, not a suggestion.

| Step | Command | Writes | Runs |
|------|---------|--------|------|
| one | `phyllum apply` | `.phyllum/PRD.md`, nothing else | nothing at all |
| two | `phyllum apply run` | the codebase, on its own branch | the plan |

Step one is **entirely mechanical** — no model, no network, no conversation — so
the plan can be read, in full, in a plain terminal, before anybody approves it.
There is no `ask` and no `confirm` in that half of the command, because the PRD
*is* the consent gate. Step two is documented from "Step two" below.

---

## Step one — creating the plan

Five things happen, in this order.

### 1. Read what to apply

`DESIGN-SYSTEM.md` is the source of truth for *what* to apply; the `assess` scan
is the source of truth for *where the raw literals are*. `apply` invents neither.

- **No `DESIGN-SYSTEM.md`** → the standard pre-`init` notice: run `phyllum init`.
- **An empty one** — no tokens, no components → `apply` says there is nothing to
  apply and names the commands that fill it (`assess`, `create`, `tokenise`).
  Exit code 0, nothing written.

### 2. Detect the harness

Who is going to execute this? The precedence is fixed, and the first layer wins:

| # | Layer | Evidence |
|---|-------|----------|
| 1 | the project's own agent config | `CLAUDE.md`, `AGENT.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `.cursor/rules`, `.windsurfrules`, `.github/copilot-instructions.md`, `.aider.conf.yml` |
| 2 | Phyllum's recorded preference | `preferences.harness` in `.phyllum/session.json` |
| 3 | agent memory | `.claude/CLAUDE.md`, `.claude/AGENTS.md`, then the user-level `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` |

**Harness files win.** A codebase that ships its own agent config has said which
agent it expects, and that outranks anything Phyllum recorded about the user.
Detection is *not* limited to Claude Code — any harness with a config file in the
table counts, and an unrecognised one is reported as no harness rather than
guessed at.

- **Harness found** → the PRD names it, and the phases are written as explicit
  per-phase instructions so that harness can execute them natively.
- **None found** → the **simple PRD**: the same plain Markdown, no assumptions
  about who executes it. This is a supported answer, not a failure.

### 3. Derive the changes

One acceptance criterion per change. Two kinds exist.

**Raw value → token.** Resolution is **per literal, not per cluster**. `assess`
clusters near-identical values into one decision, which is right for a review and
wrong for a plan: a criterion that named a cluster's representative would name a
value that is not in the file. So each literal is resolved on its own, in two
steps:

1. Its **own** token, matched on value *and* role. `12px` on `border-radius` is
   `rounded-md`; `12px` on `padding` is not, because a Numbers token records what
   it applies to and `apply` never repurposes a token across roles.
2. Failing that, the token naming a **near-identical sibling** in the same
   cluster. `#2564EC` beside a named `#2563EB` is drift, and closing it is the
   point — but the criterion carries a `note` saying the rendered value changes,
   because the reviewer is entitled to refuse.

Anything neither step resolves is out of scope, with the reason stated. It is
never named here — naming is `assess`'s and `tokenise`'s job.

**Pattern → component.** React only in v0.2.0, like all component detection. A
markup site matches a recorded component when `create`'s own signals table maps
the site to the same archetype *and*, when the component names a variant, the
site's words carry that variant word too — so `Button/Primary` claims
`btn btn--primary` and leaves `btn btn--ghost` to `Button/Ghost`. A site that
already *is* the component (its generated element or class) is skipped.

### 4. Group into phases

**One phase is one future commit.** Grouping is by kind, then one phase per
component:

| Order | Phase | Why |
|-------|-------|-----|
| 1 | Colour tokens | the safest edit — a named colour is the same colour |
| 2 | Number tokens | a length carries a role, so it deserves its own commit |
| 3 | Typography tokens | three facts at once, and the most visible mistake |
| 4… | Adopt `<Component>` — one phase each | changes markup as well as styling, so it is isolated and revertable alone |

Tokens precede components because a recorded component's properties reference
tokens: adopting a component after its tokens exist in the code is the only order
in which the second half can be verified. Grouping by *file* was considered and
rejected — a file-shaped commit mixes colour, length and markup edits, so a
failing phase would tell you which file broke rather than which kind of change
broke, which is the less useful half of the answer.

### 5. Write one file

`.phyllum/PRD.md`. That is the whole write surface. It sits inside `.phyllum/**`,
which is already gitignored and already inside the permission model, so Phyllum's
first write-to-code command still adds **no new write target**.

If there is nothing to apply — a populated design system whose values and
components appear nowhere in the code — **no PRD is written at all**. An empty
plan is worse than no plan, because it looks like work somebody has done.

---

## The PRD format — the contract `apply run` parses

The file is Markdown a human reads and a machine parses. Every marker below
exists because step two has to find it again.

### Sections, in order

| Section | Holds |
|---------|-------|
| `# Phyllum apply — PRD` | the title, then a one-line warning that nothing has been executed |
| header block | `- <Field>: <value>` lines (below) |
| `## Goal` | what applying the design system means for this codebase, in prose |
| `## Harness` | which harness was detected, from which evidence, or that none was |
| `## Execution guarantees` | the five guarantees, restated in the plan itself |
| `## Phases` | one `### Phase n — <title>` per phase |
| `## Out of scope` | four reasoned exclusion lists, plus what is always excluded |
| `## Notes` | **the user's section.** Phyllum seeds it once and never rewrites it |

### Header fields

| Field | Meaning |
|-------|---------|
| `Design system` | always `DESIGN-SYSTEM.md` |
| `Harness` | the detected harness's name, or `none detected` |
| `Harness config` | the config file that identified it, or `—` |
| `Harness evidence` | which layer of the precedence answered, in words |
| `Host test suite` | the detected command and the evidence for it, or `none detected` |
| `Generated` · `Phyllum version` | when, and by which version |
| `Changes` · `Phases` | the counts, so a diff of the file is readable |
| `Status` | `not started` · `in progress` · `complete` |

### Markers

| Marker | Written by | Shape |
|--------|-----------|-------|
| phase heading | `apply` | `### Phase 3 — Number tokens` |
| phase status | `apply`, ticked by `apply run` | `- [ ] Phase 3 complete` |
| criterion | `apply`, ticked by `apply run` | `- [ ] **AC-3.1** · file: … · literal: … · becomes: … · check: …` |
| commit record | `apply run` | `- Commit: 9f2c1ab` |
| stop record | `apply run` | `- Stopped: <why>` |
| reopen record | `apply` | `- Reopened: <n> changes appeared here after this phase was marked complete…` |
| verification block | `apply` | `#### Verification — Phase 3` |

**Criterion grammar.** After the id, fields are `key: value` pairs separated by
` · `. No value ever contains that separator. The keys are fixed:

| Kind | Keys |
|------|------|
| raw value → token | `file`, `literal`, `becomes`, `check`, and `note` when the literal is only *near*-identical to the token's value |
| pattern → component | `file`, `pattern`, `becomes`, `check` |

`becomes` is `token \`name\`` or `component \`Name/Variant\`` — that is how the
two kinds are told apart.

### Per-phase verification

Every phase ends with a `#### Verification — Phase n` block stating the same bar:

1. every criterion in the phase, ticked and checked as written;
2. `git diff` for the phase touching only the files the criteria name;
3. **the host project's own test suite, green** — when one was detected. Detected,
   not assumed: a project with no suite gets a phase that says the criteria are
   the whole bar, rather than a phase that fails on a command nobody wrote;
4. on failure: stop, keep the completed commits, record `- Stopped: <why>` on the
   phase, and report.

Detection order for the suite: a `test` script in `package.json` (the strongest
evidence there is — the project's author wrote that command down), then
`pytest.ini`, `Cargo.toml`, `go.mod`, `Gemfile`.

---

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

## The permission rule, and its one exception

`apply` writes `.phyllum/PRD.md`. Nothing else, and in particular **not one byte
of the user's codebase** — the assertion suite diffs the whole project directory
around every `apply` run and fails on a single changed file.

`apply run` is the one exception in Phyllum, and it is a **grant**, not a
permission: a phase opens one naming its work branch and its own file list, and
every write re-checks all four locks.

| Lock | Refused when |
|------|--------------|
| a grant, minted by a running phase | anything else calls the funnel — there is no path-only spelling |
| the work branch, re-read at write time | the repository is not standing on the `phyllum/apply-*` branch the grant names |
| the phase's file list | the path is not one the phase's criteria name |
| inside the project, and not state | the path escapes the root, or is under `.phyllum/` or `.git/` |

The grant closes when the phase ends, so the door is shut between phases as well
as between runs. `evals/assertions/permissions.test.js` asserts each refusal, and
greps the rest of `lib/` and `bin/` to prove no other module can open a grant.

One more structural rule comes with it: **one module starts processes** for a run
(`lib/run-command.js`), and it starts only allowlisted binaries — git, `claude`,
and the test runners `harness-detect.js` knows about — by resolved path, with an
argument array, never a shell, always with a timeout. A `test` script read out of
somebody's `package.json` is data, not a licence to run an arbitrary program.
