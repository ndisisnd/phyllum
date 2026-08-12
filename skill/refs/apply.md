# `apply`

Apply the recorded design system to the codebase: raw values become the tokens
that already name them, ad-hoc patterns become the components already recorded.

```
phyllum apply          create or refresh the plan
phyllum apply --fresh  regenerate the plan from scratch
phyllum apply run      execute the plan   (registered, not built: v0.2.0 M7)
```

`apply` is the first Phyllum command that will ever change source code, so the
crossing is controlled by design: **no source file changes without a reviewable
plan, a separate branch, and phased commits.** Plan before implementation is the
contract, not a suggestion.

| Step | Command | Writes | Runs |
|------|---------|--------|------|
| one | `phyllum apply` | `.phyllum/PRD.md`, nothing else | nothing at all |
| two | `phyllum apply run` | the codebase, on its own branch | the plan |

Step one is what exists today. It is **entirely mechanical** — no model, no
network, no conversation — so the plan can be read, in full, in a plain terminal,
before anybody approves it. There is no `ask` and no `confirm` in the command,
because the PRD *is* the consent gate.

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

## Step two — `apply run` (v0.2.0 M7, not built)

Registered and documented so nothing pretends otherwise. When it lands it will
re-check the harness, hand the PRD over if one is found, and otherwise run
Phyllum's own orchestration. The five guarantees the PRD already states are its
contract:

1. **A separate branch, always.** The branch the user is standing on is never
   written to.
2. **One phase, one commit**, tied to the criteria it satisfies.
3. **A status report every 5 minutes** while running.
4. **Per-phase verification** — the phase's criteria *and* the host project's own
   test suite when one was detected.
5. **Stop and report on failure.** Completed phases stay committed on the work
   branch, the PRD records where execution stopped, and `apply run` resumes from
   that phase. Nothing is rolled back.

---

## The permission rule, unchanged

`apply` writes `.phyllum/PRD.md`. Nothing else, and in particular **not one byte
of the user's codebase** — the assertion suite diffs the whole project directory
around every `apply` run and fails on a single changed file. `apply run` will be
the first command allowed to write source, on its own branch, from this plan.
