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

## Compound values — shadows and borders

A shadow is `0 2px 8px rgba(0,0,0,0.1)` and a border shorthand is `1px solid
#E5E7EB`. Neither is a length: the meaning is the whole list, so `toPx` has
nothing to take apart and the scalar path cannot read them. Until v0.2.1 they
fell into the bucket above — seen, not read — which was honest but unhelpful,
because a shadow written out forty times is the plainest drift there is.

They are read as wholes now, by the two passes in the `phyllum:compounds` table
in `refs/tokenise.md`. The grammar is deterministic, and it is the same in every
language a `property: value` pair can be written in.

| Step | Rule |
|------|------|
| 1. layers | a comma at bracket depth zero separates layers — `box-shadow: a, b` is two shadows. Layers keep the order they were written in, because that order is the stacking |
| 2. parts | inside a layer, whitespace at bracket depth zero separates parts, so `rgba(0, 0, 0, 0.1)` stays one part rather than four |
| 3. lengths | a length is lowercased and a zero of any unit is written `0`, so `0px` and `0` are one value |
| 4. colours | a colour part is normalised the way every colour is — case-folded, `#abc` expanded |
| 5. functions | a part that is a function call other than a colour — `var(…)`, `calc(…)` — makes the whole declaration unreadable, and it goes back to the bucket above rather than being half-read |
| 6. order | the parts are rejoined in the order they were written, one space between them. The recorded value is the code's own value, tidied — never reordered into something nobody wrote |

Two rules keep the reading honest. A compound must carry **at least one length
or one colour** to be evidence at all, so `border: none` and `box-shadow: none`
record nothing. And a declaration read as a compound is **not also read as a
scalar length** — that would count one fact twice — while the colour inside it
*is* still a colour sighting, because the colours pass owns colours wherever
they sit.

---

## Severity — frequency decides, you dispose

Every uncovered value is a finding, and not every finding is the same size. A
colour written forty times is systematic drift; the same colour written once is
probably somebody's deliberate exception. Reporting both as "add a token" is how
a tool earns the habit of being ignored.

So each finding carries a severity, and the only input is how often the value is
used across the whole codebase.

<!-- phyllum:severity -->

| Severity | Used | Means |
|----------|------|-------|
| error | >= 3 | systematic drift — proposed as a token, and accepted by `assess update` |
| warn | <= 2 | looks like a deliberate exception — reported and counted, never accepted on your behalf |

One threshold for every value family, tested in order, first match wins. It is
one number on purpose: a per-family threshold is four more numbers to explain
and four more ways for two runs to disagree about the same codebase.

Severity is assigned **at aggregation**, once the clusters are counted — never by
a scanner. A scanner's job is to report what it saw; how much a sighting matters
is a question about the whole codebase, and it cannot be answered one file at a
time.

What the two severities change:

| | `error` | `warn` |
|---|---|---|
| in the report | counted and listed | counted and listed |
| in the review | asked, most-used first | asked, most-used first — you may promote it by hand |
| in `assess update` | accepted under the proposed name | **skipped**, and the report says so |

The interactive review treats both alike, because a rare value can still be
worth a token and only you know that. The fast-forward does not, because
accepting an exception nobody asked about is exactly the write `assess update`
promises never to make.

### Which rule a finding belongs to

The severity says how much; the rule says what kind. Rules are named so a report
can group by family and a later run can say "the shadows are fixed, the spacing
is not". Rows are tested in order, and a role of `—` matches any role.

<!-- phyllum:lint-rules -->

| Rule | Pass | Role | Detects |
|------|------|------|---------|
| raw-colour | colours | — | a hex, `rgb()` or `hsl()` literal no colour token names |
| raw-spacing | numbers | spacing | a padding, margin or gap length off the token scale |
| raw-radius | numbers | radius | a corner radius off the radius scale |
| raw-border | numbers | border | a border or outline width off the scale |
| raw-border | borders | — | a border shorthand — width, style and colour written out together |
| raw-shadow | shadows | — | a `box-shadow`, `text-shadow` or elevation literal |
| raw-typography | typography | — | a font size, weight and line-height written out together |

`raw-radius` is the one that used to have no name of its own: a corner radius was
read, clustered and named correctly, but the report called it a number like any
other. Splitting it out changes no behaviour and one thing about the reading — a
radius problem is now findable in the report by the word a designer would use.

A value the scan could see but **not** read has no rule. It still carries a
severity, because how often it is written is a fact; but naming its family would
mean guessing which family it is in, and that is the one thing the fourth bucket
exists not to do.

---

## Hygiene — what collides, and what nothing uses

Every rule above reads one value at a time. Two questions cannot be answered
that way, because they are about the project rather than about any value in it:
**what is fighting what**, and **what is here that nothing needs**.

<!-- phyllum:hygiene-rules -->

| Rule | Severity | Detects |
|------|----------|---------|
| framework-collision | warn | more than one UI framework in one repository, or two majors of one framework in the dependency tree |
| styling-collision | warn | more than one styling system live at once — Tailwind, CSS-in-JS, hand-written stylesheets |
| theme-source-collision | warn | more than one theme file declaring values, so no one file is the source of truth |
| unused-token | warn | a token in `DESIGN-SYSTEM.md` whose value and whose name were never seen in the scan |
| unused-component | warn | a registered component whose name, in any spelling, was never seen in the markup scan |

Every hygiene rule is a `warn`, and the severity is a column here rather than a
number in the code for the same reason the frequency threshold is. It is a
`warn` on purpose: unlike a raw value, none of these has an answer Phyllum could
apply. Two frameworks in one repository may be a migration halfway done; an
unused token may be the one the next screen is built on. So they are reported
with the evidence, and never demanded, never removed, never auto-accepted.

### Collisions — the evidence detection used to throw away

`detectProject` gathers six frameworks and three styling systems and returns one
winner, because `create` only ever needed a label. The evidence behind the
winner is kept now, and co-existence is reported from it.

| Reading | One repository, more than one of | Why it matters |
|---------|----------------------------------|----------------|
| frameworks | React and Vue; two majors of React in the dependency tree | two component models means two definitions of the same button |
| styling systems | Tailwind, styled-components/emotion, hand-written stylesheets | three places to write `#2563EB`, and no way for a token to reach all three |
| theme sources | `tailwind.config.js`, `tokens.json`, `theme.ts` | each file declares values, so none of them is *the* source of truth |

Next is React and Nuxt is Vue: matching both rows is one framework described
twice, not two frameworks, so families are counted rather than labels. Plain
HTML never collides with anything — it is the absence of a framework, not a
rival to one. And the Tailwind entry stylesheet does not count as a second
styling system, because a `globals.css` full of `@tailwind` directives is how
Tailwind is installed.

`DESIGN-SYSTEM.md` is never counted as a theme source. It is Phyllum's own
record, and counting it would make every project Phyllum manages collide with
itself.

### Unused — the coverage split, run backwards

Coverage reads codebase → system: which raw values does the system already name?
The unused check reads system → codebase, over exactly the same scan.

| Finding | Means |
|---------|-------|
| unused-token | no sighting carried its value, and no property carried its name or CSS-variable spelling |
| unused-component | no element, component tag or class name in the markup scan matched any spelling of its name |

The caveat is part of the finding, not a footnote: **the scan is bounded and
text-based**, so "not seen" means "not seen in what was read". A token used in a
file past the file cap, behind a computed class name, in a language the markup
pass does not read, or referenced only as `var(--name)` — which is a reference
rather than a value, and so is never a sighting — is not dead. It is unseen.
Phyllum reports the difference and never resolves it by deleting anything.

The name arm is what makes the check survive a value drifting: a `space-8` the
system records as `32px` and the code writes as `31px` is still *referenced* by
name, so it is reported as drift by the value rules and not as a stale token by
this one. Two findings about one token would be one finding too many.

Two consequences follow, and both are deliberate. Removal is offered through the
normal review loop, which edits `DESIGN-SYSTEM.md` and nothing else — there is
no auto-pruning at any severity, in any mode, including `assess update`. And the
component half does not run at all on a stack whose component pass did not run:
a Vue project would otherwise be told every component it has is unused, which is
a statement about the reader rather than about the project.

---

## Similarity — what is nearly the same as what

Every rule above reads one thing at a time: one value, one project. Similarity
is the only check that reads two things *against each other*, and it answers the
question a codebase cannot answer by counting — **is this the same component
twice?**

Three readings, one shape. Each one produces a **score in [0, 1]** computed from
structure alone: no model call, no heuristic that could answer differently on a
Tuesday. The same two things always score the same number, and the number is
what decides how loudly the finding is reported.

<!-- phyllum:similarity-rules -->

| Rule | Severity | Detects |
|------|----------|---------|
| component-clone | by band | two repeated markup signatures whose element and class words largely overlap |
| style-duplicate | by band | two named style blocks declaring materially the same `property: value` set |
| utility-overlap | warn | one utility-class bundle repeated across elements that no component was ever extracted from |

`by band` means the score decides, by the table below. `utility-overlap` is a
`warn` whatever its size, because a repeated utility bundle is a component
waiting to be extracted rather than a mistake — and extracting one is a decision
about the design system, not a defect to be fixed.

### The score

<!-- phyllum:similarity-weights -->

| Part | Weight | Compared on |
|------|--------|-------------|
| class words | 0.75 | Jaccard overlap of the words in both class lists, `btn--primary` read as `btn` + `primary` |
| element | 0.25 | 1 for the same tag; otherwise the Jaccard overlap of the words in the two tag names |
| declarations | 1 | Jaccard overlap of two blocks' normalised `property: value` pairs |

Class words rather than class names, because `btn--primary` and `PrimaryBtn` are
one pattern spelled twice, and comparing the spellings would say they have
nothing in common. The element part is a bonus rather than a gate: two different
tags carrying the same classes are still worth reporting, they are just worth
reporting more quietly — which is exactly what a 0.75 ceiling does to them.

The element part is scored by words too, so `Card` and `PrimaryCard` are read as
near rather than as unrelated. An exact tag match short-circuits to 1 so the
common case never depends on how a tag name happens to split.

<!-- phyllum:similarity-bands -->

| Band | Score | Severity | Means |
|------|-------|----------|-------|
| clone | >= 0.8 | error | the same thing twice — reported with a merge suggestion naming the more-used one as the survivor |
| similar | >= 0.5 | warn | a pattern similarity — reported, and nothing suggested |

Below 0.5 nothing is reported at all. Two components sharing one class word are
not evidence of anything, and a report that says so about every pair in a
codebase is a report nobody reads twice.

A merge suggestion is a **suggestion**, and it lands where every other Phyllum
suggestion lands: the review loop that edits `DESIGN-SYSTEM.md`. Nothing here
rewrites a component, renames a class or touches a line of code — merging two
components is `apply`'s PRD-gated work, and `assess` is read-only in the code as
well as in the promise.

### What counts as a block, and what counts as a bundle

A **style block** is a named group of declarations: a CSS rule and its selector,
a `styled.div` template and the constant it was assigned to, or a style object
literal and its variable name. A block is only compared when it holds at least
two declarations and at least one property the property tables recognise —
without that rule a configuration object of two strings would be a style
duplicate of another configuration object, which is a scanner reading a file it
does not understand.

A **utility bundle** is a class list long enough to be doing a component's job,
repeated often enough that somebody meant it. Both numbers are in the limits
table, and both are deliberately blunt: this check is a nudge, not a census.

### Bounded, and it says so

Comparing everything to everything else is quadratic, and a scan that reads a
big repository has to stay a scan. So the pass compares the most-used
signatures and the first blocks it read, up to a cap, and the report states the
cap rather than quietly truncating.

<!-- phyllum:similarity-limits -->

| Limit | Value | Why |
|-------|-------|-----|
| signatures | 40 | the most-used signatures compared to each other, the rest counted and not compared |
| blocks | 60 | style blocks compared, in the order they were read |
| pairs | 2000 | comparisons any one pass will make before it stops |
| bundle classes | 3 | classes a class list needs before it is a bundle rather than a class |
| bundle uses | 3 | elements a bundle has to appear on before it is worth extracting |

Sorted before capped, always: the signatures are the most-used ones, so the cap
drops the tail rather than an arbitrary forty. Both halves of the pass run on
markup, so both are React-only in v0.2.1 for the same reason the component pass
is — and both say so when they do not run. Style duplicates read stylesheets and
theme files, so they run on every stack.

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
| shadow length | absolute difference in px, part for part | 1 | the same layer count, the same keywords, the same number of lengths |
| shadow colour | CIE76 ΔE between two layers' colours | 3 | both layers have a colour, or neither does |
| border width | absolute difference in px, part for part | 1 | the same keywords |
| border colour | CIE76 ΔE between two borders' colours | 3 | both carry a colour, or neither does |

A compound clusters when **every part of it** clusters, by the same thresholds
the scalar passes use — a length is a length whether it stands alone or sits in
a shadow. Two shadows of different shapes never merge, however close their
numbers: `0 2px 8px` and `0 2px 8px 1px` are different shadows, and averaging
them would be inventing one.

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

One component per run in the **full** assessment, deliberately. Recording a
component is a conversation of its own, and five of them queued behind one another
is not a review — an assessment that turned into five `create` sessions would stop
being an assessment. The patterns not recorded are named in the report, and the
next run picks up where you left off. The focused `assess components` mode is the
exception, and the reason is consent: you asked for components specifically, so it
loops (below).

## Chained modes

Four commands, one scan. The scan, the clustering and the map are identical in all
four — the modes differ only in which tracks are walked and in who answers.

| Command | Tracks walked | Who answers |
|---------|---------------|-------------|
| `assess` | tokens, then components — **one** component recorded | you |
| `assess tokens` | the token review only | you |
| `assess components` | the component picks only, **looped** | you, once per candidate |
| `assess update` | tokens, then components | Phyllum, where the answer is already on the page |

`tokens`, `components` and `update` are reserved words in argument position after
`assess`. Any other word gets the list of valid ones rather than an error.

**`assess components` loops.** One candidate at a time, most-repeated first, each
with its own pick and its own acceptance gate. After each recording it asks about
the next. A skip, an empty answer, or an answer that matches nothing on the list
ends the run cleanly — nothing further is asked and nothing further is written.
Twenty components in one sitting is the cap; anything past it is named as left for
the next run.

**`assess update` fast-forwards on one rule:** a question whose answer is already
on the page is answered; a question whose answer is only in your head is skipped.

| Question | `assess update` | Why |
|----------|-----------------|-----|
| "Name `#2563EB` as `color-primary`?" | **accepted**, under the proposed name | the name was derived mechanically from the value and the naming scales — a review would add nothing to it |
| the one write to `DESIGN-SYSTEM.md` | **accepted**, once | the mode *is* that consent, given on the command line |
| "Name `#7C3AED` as `color-accent`?" (used twice) | **skipped**, value left unnamed | a `warn`-severity finding is a suspected exception, and accepting an exception nobody asked about is the write this mode promises not to make |
| "What does `18px` apply to?" (role unknown) | **skipped**, value left unnamed | the role is not in the codebase; guessing one is how a corner radius becomes a padding |
| "Record one of these as a component?" | **skipped**, patterns left in the report | the contract's questions have answers only you have, and unanswered slots would be written as TODOs nobody asked for |

Anything unrecognised is skipped, never accepted. That default is the safety
property worth stating: a question added by some later flow can only ever be
declined by the fast-forward, so no new conversation can be auto-accepted into by
accident.

So `assess update`'s output is exactly this: new token rows in `DESIGN-SYSTEM.md`,
under the names the map showed, and a report naming what it declined to answer.
It writes `DESIGN-SYSTEM.md` and nothing else — no components, no codebase files,
not one other byte.

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
  failure. This holds in `assess update` too: a fast-forward answers the questions
  whose answers are already on the page, and declines the rest.
- **Seed a component with a scanned value.** A candidate is a name and an
  archetype; every value still comes from you.
- **Need a model to be useful.** The scan, the map and the proposed names are
  mechanical. Only the review is a conversation, and its absence is said plainly
  rather than dressed up as an error.
