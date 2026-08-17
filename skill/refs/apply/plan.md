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

### 3b. Derive the `applied` flag (v0.5.0 §3)

That last sentence — the skipped site — is the whole evidence behind a second
thing the same read produces: **every recorded component learns whether it is
adopted in this codebase right now.**

<!-- phyllum:applied-readings -->

| Spec block says | Means | Written when |
|-----------------|-------|--------------|
| `applied: true` | a markup site in this project already *is* this component: its generated element `<ButtonPrimary>` or its generated class `button-primary` | `apply` found such a site |
| `applied: false` | `apply` looked for such a site and found none | `apply` looked and found nothing |
| no `applied:` line at all | `apply` has never run here | never — absence is what a file starts with, and it is **not** a `false` |
| an `applied:` line saying anything else | the line was hand-edited and cannot be read | never — every reader treats it as absence and the next `apply` replaces it in place (v0.5.0 M3) |
| the same `### <name>` twice | the name identifies no one block, so there is no reading | never — a duplicated heading is answered by naming it, not by picking one (v0.5.0 M3) |

The check is the adoption pass's own skip, reused rather than rewritten: one
predicate (`alreadyAdopted`), one meaning. It is an **identity** test, not a
judgement — no archetype is compared, so it reads the same on any stack and it
reads a `custom` component too. A custom claims no contract to be graded against
and still gets no adoption *change* proposed for it; it has a name all the same,
and the name is what the evidence is about.

**Derived, never declared.** No command sets the flag, no question offers it, and
a hand-edited flag is overwritten by the next derivation. The flag is a *reading*
of the codebase, not an opinion about it, so there is nothing for a user to be
right about. `assess` neither reads nor writes it: one writer, one meaning.

<!-- phyllum:applied-flips -->

| Moment | Effect |
|--------|--------|
| `phyllum apply`, every run | every recorded component's flag is re-derived from that run's fresh read of the code; the first run creates the flags |
| `phyllum apply run` — an `Adopt <Component>` phase commits | that component flips to `true` immediately, through the same funnel and on the same one line. The next `apply` would say so anyway; saying it now keeps the file honest in between |
| a harness executes the PRD instead | Phyllum was not watching, so the flags do not move. They catch up on the next `phyllum apply` — the lag is **contract, not surprise**, and it is the reason the flag is a reading of the last run rather than a live fact |
| any other command rewrites a spec block | the flag is not carried by hand; the next `phyllum apply` re-derives it, exactly as it re-derives a hand-edit |

Tolerance, as everywhere the spec block is read: a file whose components carry no
flag — every file written before v0.5.0 — parses exactly as it did, at every
scope, and `display`, the GUI and the JSON all say nothing rather than inventing
a reading for it.

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

### 5. Write the plan, then the flags

`.phyllum/PRD.md` first. It sits inside `.phyllum/**`, which is already gitignored
and already inside the permission model, so Phyllum's first write-to-code command
still adds **no new write target**.

Then, since v0.5.0, one more write: the `applied:` line of each component's spec
block in `DESIGN-SYSTEM.md` — *that line and nothing else in the file*, through
the one funnel, `.bak` first, atomically. The scope and the reasoning are in
`refs/apply/apply.md` under the permission rule. A run that changes no line writes
nothing at all, which is what keeps a re-run byte-identical.

Order matters and is fixed: the plan is the artefact the user consents to, so it
lands first. A flag write that failed would leave the plan standing.

If there is nothing to apply — a populated design system whose values and
components appear nowhere in the code — **no PRD is written at all**. An empty
plan is worse than no plan, because it looks like work somebody has done. No plan
means no flags either: that run wrote nothing, so it is not a run the flags can
be a reading of.

---
