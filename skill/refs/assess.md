# `assess`

Drop into a codebase and answer one question: **how much raw, un-systematised
styling is in here, and what should the design system look like?**

```
phyllum assess
```

`assess` reads your code. It never writes it:

| Command | Reads | Writes |
|---------|-------|--------|
| `assess` | your codebase | `DESIGN-SYSTEM.md` |
| `tokenise` | the sentence you typed | `DESIGN-SYSTEM.md` |
| `create` | your intent | `DESIGN-SYSTEM.md` |

The scan is read-only in the strongest available sense: the modules that do it
contain no write call at all, and the assertion suite diffs the whole directory
around every scan and demands that not one byte changed. A tool that reads your
codebase has to earn that trust before it asks to write a single line.

The tables in this file are the contract — the skill, the CLI
(`lib/tokenise-spec.js` parses them at run time) and the assertion suite read the
same rows. Editing a table changes the behaviour and changes what the tests
expect. There is no second copy of these rules in the code.

---

## The pipeline

Five steps, and the report is the pipeline read out loud: what Phyllum can see,
what it read, what the codebase uses, the map of it, and what it suggests you do.

| Step | What happens |
|------|--------------|
| 1. detect | work out the language and framework, and pick the scanners for the stack |
| 2. scan | read the project for raw styling — read-only, never a write |
| 3. aggregate | cluster near-identical values, count usage, rank by frequency |
| 4. map | present the inventory as a table: value · where and how often used · what it means · what covers it |
| 5. suggest | propose tokens for the raw values and components for the recurring patterns |

**Steps 1–4 are mechanical.** A scan and a rendering: no model, no conversation,
nothing to accept. The whole assessment — including the mapping table with the
name Phyllum would propose already in it — works in a plain terminal with nothing
installed, which is why the report is useful before you say yes to anything.

**Step 5 is the half that talks.** Naming a value and recording a component are
decisions, so they are asked one at a time. In an interactive session (or inside
Claude Code) the tracks are walked; in a one-shot terminal command they are
previewed, with the proposals named rather than withheld. Nothing about the
report changes either way — only whether anybody is there to answer.

### The split commitment

The two halves of the scan have deliberately different reach:

- **The values pass is language-agnostic.** Colours, lengths and typography are
  read out of *any* text file, whatever the stack, so token suggestions work in a
  Go service or a Swift app as much as in a React app.
- **Component detection is React only** in v0.2.0. Recognising an ad-hoc
  component pattern means reading markup, and reading markup means committing to
  a syntax. Vue, Svelte and the rest get the values pass and an honest note
  saying the component half did not run.

---

## What is scanned

A read-only sweep of the project. Files are read; nothing is opened for writing,
renamed, or created.

<!-- phyllum:sources -->

| Source | Extensions | Read for |
|--------|------------|----------|
| stylesheets | `.css`, `.scss`, `.sass`, `.less` | declarations grouped by rule block |
| markup | `.html`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.astro` | `<style>` blocks, inline `style="…"` attributes, and Tailwind arbitrary values |
| skipped | `node_modules`, `.git`, `dist`, `build`, `.next`, `.phyllum`, `coverage`, `.claude` | — |

Four shapes of evidence, all read the same way once extracted: **declarations**
in a stylesheet rule block (`border-radius: 12px;`), **`<style>` blocks** inside a
component file — which is where a `.vue`, `.svelte` or `.astro` file keeps most of
its styling — **inline styles** in markup (including the JSX object spelling), and
**Tailwind arbitrary values** (`bg-[#2563EB]`). Tailwind's own named scale (`px-4`, `text-sm`) is *not* read:
those are already tokens, just someone else's. A prefix that maps to two
properties is resolved by the shape of the value — `text-[#111827]` is a colour,
`text-[12px]` is a font size.

<!-- phyllum:tailwind -->

| Prefix | Property |
|--------|----------|
| bg | background |
| text | color, font-size |
| border | border-color, border-width |
| outline | outline-color, outline-width |
| fill | fill |
| stroke | stroke |
| rounded | border-radius |
| p | padding |
| px | padding-left |
| py | padding-top |
| pt | padding-top |
| pr | padding-right |
| pb | padding-bottom |
| pl | padding-left |
| m | margin |
| mt | margin-top |
| mr | margin-right |
| mb | margin-bottom |
| ml | margin-left |
| gap | gap |
| leading | line-height |
| font | font-weight |

Shorthands are split rather than skipped: `padding: 12px 16px` is two spacing
sightings, and `border: 1px solid #2563EB` is one border sighting and one colour
sighting.

## Every other text file

The table above is where a *stylesheet* is read as a stylesheet. The values pass
does not stop there, because raw styling does not stop there either: a theme file
in JSON, a constants file in Go, a Kotlin object of colours, a styled-components
template literal. Every other text file in the project is read too, for the one
shape that survives translation between languages: a **`property: value` pair**.

`"borderRadius": "12px"`, `border-radius: 12px;`, `borderRadius = 12.px` and
`border_radius: 12px` are all read as the same fact, because the property name is
what carries the meaning. The property still has to be one the tables recognise —
a colour property, a number role, or a typography property — so a `timeout: 30`
in a config file is not mistaken for a design decision.

<!-- phyllum:text-scan -->

| Source | Items | Read for |
|--------|-------|----------|
| data | any other text file | `property: value` pairs, in any language |
| skipped extensions | `.md`, `.markdown`, `.mdx`, `.txt`, `.csv`, `.tsv`, `.log`, `.lock`, `.map`, `.snap`, `.ico`, `.pdf` | — |
| skipped files | `DESIGN-SYSTEM.md`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` | — |

Three exclusions, each for its own reason. **Documentation and data dumps** are
skipped because prose *about* a colour is not a use of it, and counting a README's
examples would inflate every number in the report. **Lockfiles** are skipped
because they are machine output nobody styles anything with. And
**`DESIGN-SYSTEM.md` is skipped** because it is Phyllum's own record — reading it
as evidence would let the design system count as its own drift.

Two more limits keep the sweep bounded rather than exhaustive: anything
`.gitignore` ignores is not part of the codebase, and a file that reads as binary
or is larger than the size cap is skipped rather than parsed. Both are honest
limits, and the report says how many files were read so the number is never
implied.

A **bare** colour or length with no property attached is not a sighting. A hex
code sitting in a comment, a test fixture or a string is not evidence that
anything is styled with it, and a number with no property has no role — and
without a role, `12px` could be a corner or a padding. Phyllum does not guess
which.

### Seen, not read — the fourth bucket

A key Phyllum cannot map is not the same fact as no key at all. `AccentTint =
"#7C3AED"` in a Go file, or a length on a `box-shadow`, is plainly a design value
written against a property no table above gives a meaning to. Those used to be
dropped in silence, which made the report quietly understate the drift.

They are now a bucket of their own: **seen, not read**. The rules are narrow on
purpose.

| Rule | Why |
|------|-----|
| the value must be unmistakable — a colour literal, or a length with a unit | `timeout: 30` is a config number, not a design decision, and never becomes one |
| there must be a key — a bare literal in an array or a string still counts for nothing | a value nobody wrote a property for is not evidence that anything is styled |
| the row says `role unknown`, and is never proposed as a token | without a role, naming `18px` would be recording a corner radius as a padding |
| the review asks one question per row, and an unanswered question names nothing | the same way `tokenise` asks what a bare length applies to |
| a value the system already names never appears here | so an accepted answer makes the row disappear on the next run |

---

## Component detection — React in v0.2.0

The component half looks for markup patterns the codebase repeats and the design
system has never been told about: an element plus its class list, counted into a
signature, matched against the candidate signals in `refs/create.md`, and dropped
if `DESIGN-SYSTEM.md` already registers it. This is the same reader bare
`phyllum create` uses for its picker, so a candidate means the same thing in both
places.

A candidate seeds a **name and an archetype, never values**. Whatever CSS sits
around the pattern is evidence for the follow-up loop to offer, not a fact about
the component.

<!-- phyllum:component-stacks -->

| Framework | Component pass |
|-----------|----------------|
| react | yes |
| react-next | yes |
| vue | no |
| vue-nuxt | no |
| svelte | no |
| svelte-kit | no |
| html | no |
| unknown | no |

On a stack whose row says no, the values pass still runs in full and the report
says plainly that the component pass did not — never silently, and never by
pretending a Vue file is a React one.

---

## Clustering — before naming, never after

Near-identical values scanned out of a codebase are grouped and surfaced as
**one** proposal, so the system converges instead of mirroring the entropy
already in the code. The representative is the most-used member, never an
average — a value nobody wrote is never proposed. Clustering is deterministic.

<!-- phyllum:clustering -->

| Cluster | Compared on | Threshold | Also required |
|---------|-------------|-----------|---------------|
| colours | CIE76 ΔE, sRGB converted to Lab | 3 | — |
| numbers | absolute difference in px, `rem` read at 16px for comparison only | 1 | the same role |
| typography size | absolute difference in font-size, in px | 1 | the same weight |
| typography line-height | absolute difference in line-height | 0.1 | the same weight |

Frequency is the review order: most-used first, ties broken by value. A cluster
any of whose values is already the value of a token in that pass's section is
matched silently and never proposed again, which is what makes an accepted merge
stick and what makes an unchanged rerun propose nothing.

The naming scales that turn a cluster into a proposed token name — the colour
roles and ranks, the number ladders, the typography roles and bands — live in
`refs/tokenise.md`, because a name means the same thing whether the value came
out of a sentence or out of the code. One set of scales, two ways in.

---

## The map — step 4

One table, one ranking, every bucket in it. A row is a whole decision:

| Column | What it says |
|--------|--------------|
| value | the value as the code writes it — the cluster's most-used member, never an average |
| used | how many times it is written out across the project |
| where | the first file it was found in, and how many others there are |
| what it looks like | what the scan established: the properties a colour sits on, the role a length carries, or `role unknown` |
| coverage | the token that already names it, the name Phyllum would propose, or `ask` |

The ranking is frequency, most-used first, because the value the codebase leans on
hardest is the one worth naming first. Covered values are **on the same table** as
uncovered ones: "how far has this drifted?" is only answerable if what is already
named sits next to what is not. A truncated table always says how many rows it
left out, and a row that stands for several clustered values says so — an
inventory that hid the merge would look tidier than the codebase is.

## The two suggestion tracks — step 5

A token and a component are different decisions, so they are two tracks rather
than one flow.

**Tokens.** Every unnamed value, most-used first, walked one at a time. It is
`tokenise`'s review, not a second one: the same question, the same answer grammar
(confirm · rename · `merge <token>` · skip — the table in `refs/tokenise.md`), the
same naming scales, the same write. What `assess` adds is the number of them and
the codebase evidence behind each — an accepted token records how much of the code
it covers. One acceptance gate covers the batch, and a no there writes nothing.

**Components.** Every repeated pattern offered as a seed for `create`. The pick
carries a **name and an archetype, never a value**: whatever CSS sits around the
pattern is evidence for the follow-up loop to offer, not a fact about the
component. From the pick onwards it is `create`'s own machinery — the contract's
questions, the spec and code review, its own acceptance gate.

One component per run, deliberately. Recording a component is a conversation of
its own, and five of them queued behind one another is not a review. The patterns
not recorded are named in the report, and the next run picks up where you left off.

## Rerunnable

A second `assess` diffs against the tokens `DESIGN-SYSTEM.md` already holds.
Known values are matched to their token silently and reported as coverage; only
*new*, unmatched values are proposed. So the run after an accepted pass proposes
nothing, and a codebase that has drifted since proposes exactly what drifted.

---

## What `assess` must never do

- **Write to your codebase.** Not one file, not one byte. `assess` reads code;
  only `apply` writes it, and only through a reviewable PRD on its own branch.
- **Write anything before acceptance.** The scan and the report write nothing at
  all; a later accepted suggestion writes `DESIGN-SYSTEM.md` and nothing else.
- **Invent a value.** Every value in the report is a value the code contains. The
  representative of a cluster is its most-used member, never an average.
- **Rename or change a token you already have.** A value the system already names
  is reported as covered, not proposed again.
- **Pretend the component pass ran** on a stack it does not support, or imply it
  read files it skipped.
- **Guess a role.** A value it could see but could not read is a question. Skip
  the question and the value stays unnamed — that is the correct outcome, not a
  failure.
- **Seed a component with a scanned value.** A candidate is a name and an
  archetype; every value still comes from you.
- **Need a model to be useful.** The scan, the map and the proposed names are
  mechanical. Only the review is a conversation, and its absence is said plainly
  rather than dressed up as an error.
