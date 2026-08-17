# `apply`

Apply the recorded design system to the codebase: raw values become the tokens
that already name them, ad-hoc patterns become the components already recorded.

```
phyllum apply          create or refresh the plan
phyllum apply --fresh  regenerate the plan from scratch
phyllum apply run      execute the plan, on its own branch, one commit per phase
```

**`apply` stands alone under its own name** (v0.4.0 §6.1). It held `update` as an
alias for one release; from v0.4.0 `update` is the design-system editing verb and
reaches nothing here, and `update run` no longer exists. Nothing about `apply`
changed with the alias: same name, same help, same three lines, same plan.
Moving the Phyllum install is `phyllum upgrade`. `refs/update/update.md` carries the
editing verb's contract.

`apply` is the first Phyllum command that will ever change source code, so the
crossing is controlled by design: **no source file changes without a reviewable
plan, a separate branch, and phased commits.** Plan before implementation is the
contract, not a suggestion.

| Step | Command | Writes | Runs |
|------|---------|--------|------|
| one | `phyllum apply` | `.phyllum/PRD.md`, plus the `applied:` line of each component's spec block — nothing else | nothing at all |
| two | `phyllum apply run` | the codebase, on its own branch; and the `applied:` line of a component whose adopt phase commits | the plan |

Step one is **entirely mechanical** — no model, no network, no conversation — so
the plan can be read, in full, in a plain terminal, before anybody approves it.
There is no `ask` and no `confirm` in that half of the command, because the PRD
*is* the consent gate. Step two is documented from "Step two" below.

---

## The permission rule, and its exceptions

`apply` writes `.phyllum/PRD.md`, and — since v0.5.0 — the `applied:` lines. In
particular **not one byte of the user's source code** — the assertion suite diffs
the whole project directory around every `apply` run and fails on a single other
changed file, and on a single other changed *line* of the design system.

### The amendment: `apply` writes the `applied:` lines too (v0.5.0 §3.2)

This ref said, from v0.2.0 to v0.4.1, that `apply` writes its plan and nothing
else. That is no longer the whole truth, and the change is recorded here rather
than slipped in.

<!-- phyllum:applied-write -->

| Question | Answer |
|----------|--------|
| What is written | the `applied:` line of each component's spec block in `DESIGN-SYSTEM.md`, and nothing else in the file — not a heading, not a table cell, not a code block, not the user's whitespace |
| Where it goes | the one funnel (`writeDesignSystem`), `.bak` taken first, temp file then atomic rename — the same path every other write in Phyllum takes |
| Who writes it | `phyllum apply`, after the PRD; and `phyllum apply run` when an `Adopt <Component>` phase commits. Nobody else, ever |
| Why it is allowed | `DESIGN-SYSTEM.md` was always the one file Phyllum may write. This adds no new *target* — it widens *which command* writes that target, from the recording commands to the one that reads the codebase |
| Why it is not hidden state | the ask is a property of the component, readable by anyone who opens the file. A flag in gitignored `.phyllum/` state would be invisible to the reader the file exists for |
| When nothing is written | when no line would change, and when no PRD was written at all — a run that planned nothing is not a run the flags can be a reading of |

The derivation itself, the flip table and the hand-off lag are in
`refs/apply/plan.md`, step 3b.

### `apply run`'s source writes

`apply run` is the one exception in Phyllum that reaches source code, and it is a
**grant**, not a permission: a phase opens one naming its work branch and its own
file list, and every write re-checks all four locks.

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
