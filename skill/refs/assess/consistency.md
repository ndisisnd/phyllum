## Consistency — one concept, one name; one component, one contract

Similarity asks whether two things are the *same thing*. Consistency asks the
question underneath it: when they are, are they **called** the same thing, and
are they **used** the same way? Two readings, and they fail differently, which
is why they are graded differently.

### Naming-convention drift

Every codebase has a house style for names, and almost every codebase has a few
names that missed it. Phyllum does not have an opinion about which style is
right — it reads the one the codebase already mostly uses, and reports what
strays from it.

<!-- phyllum:naming-conventions -->

| Convention | Written as | Example | Votes as |
|------------|------------|---------|----------|
| bem | a block, `__` before an element, `--` before a modifier | `card__title--large` | kebab |
| upper | upper case, underscores between words | `BUTTON_SMALL` | upper |
| pascal | every word capitalised, nothing between them | `ButtonSmall` | pascal |
| camel | the first word lower case, every one after it capitalised | `buttonSmall` | camel |
| snake | lower case, underscores between words | `button_small` | snake |
| kebab | lower case, hyphens between words | `button-small` | kebab |
| lower | one lower-case word, with nothing to separate | `button` | — |

Rows are tested in order and the first match wins, because the conventions
overlap by construction: BEM is kebab with two extra separators, and `Button` is
Pascal case and a single capitalised word at the same time. The order is also
the tie-break — when two conventions are used exactly as often, the one declared
first is the one Phyllum calls dominant, so a tie resolves the same way twice.

The `Votes as` column is where the two honesty rules of this reading live, and
both exist because the obvious version of the vote is unusable.

A name of one lower-case word votes for **nothing**. It carries no separator and
no capital, so it is evidence of no house style at all, and counting `button` as
a vote for kebab would let a codebase full of one-word class names elect a
convention nobody chose. Those names are still read and still reported; they
just do not get a say.

And a BEM name votes as **kebab**, because BEM is not a rival to kebab — it is
kebab with two more separators in it. Every BEM codebase has plain blocks
(`panel-header`) beside modified ones (`btn--primary`) by construction, so
counting the two apart would have a BEM codebase report half of its own names as
strays from itself. What the vote is really measuring is whether this project
writes names in lower case with hyphens, in camel case, in Pascal case, or in
snake case; `bem` is a spelling of the first of those, not a fifth answer.

<!-- phyllum:naming-rules -->

| Rule | Severity | Detects |
|------|----------|---------|
| naming-drift | warn | one concept spelled more than one way — the same words in a different order, or in a different case |
| naming-convention | warn | a name written in a convention that is not the one this codebase mostly uses |

Both are `warn`, and the reason is the same reason the hygiene rules are: a name
in the wrong case still works. Nothing here is broken, and only a person can say
whether `Button` and `btn` are one concept with two spellings or two concepts
that happen to rhyme. The `error` tier in this section belongs to the prop
checks below, where a mismatch means one of two call sites cannot be right.

**What counts as drift.** Two names drift when `wordsIn()` reads the same word
*set* out of both of them and they are still spelled differently — `btn--primary`
and `PrimaryBtn` are `{btn, primary}` twice, in two orders. That is the whole
test, and it is deliberately narrow: `btn` and `Button` are **not** reported,
because resolving abbreviations means a dictionary, and a dictionary means
guessing. Phyllum says what it can prove and leaves the rest alone.

Names are grouped **within their kind** — classes against classes, components
against components — because a component called `Card` rendering a class called
`card` is one concept spelled two ways *on purpose*, and reporting it would make
the check unusable in every React codebase there is. A class that is a known
spelling of a registered component is folded into that component for the same
reason: `button-primary` is what Phyllum itself calls `Button/Primary`.

**The suggestion is always the predictable form**: `Base + Qualifier`, spelled in
the dominant convention for that kind — `ButtonSmall`, `button-primary`. The base
is the word the codebase reuses most across its names, never a variant word
(`primary`, `small`, `ghost` — the list `create` already keeps), because a
qualifier is the part that changes and a base is the part that does not. Ties go
to the word that comes first in the most-used spelling. Renames are recorded as
suggestions against the design system; changing a line of code is `apply`'s work.

### Prop mismatches within a component

For each component the markup scan sees, its usages are compared against each
other. The reader is a **regex attribute scan**, not a JSX parser and not a type
checker — so what it cannot read, it says it cannot read.

<!-- phyllum:prop-rules -->

| Rule | Severity | Watches | Detects |
|------|----------|---------|---------|
| prop-synonym | error | — | one component given two names for the same prop across its usages |
| prop-type-conflict | error | — | one prop on one component given values of two different kinds |
| prop-style-bypass | warn | `style`, `css`, `sx` | a style-affecting prop on a component the design system already gives variants for |

The first two are errors because they contradict the component's own contract: a
component has one API, so `onPress` here and `onClick` there means one of the two
call sites is not talking to it, and `size="lg"` beside `size={3}` means one of
them is passing a value the prop cannot mean. Neither is a matter of taste. The
third is a `warn` because it is not a contradiction but an escape: an inline
style on a component that has variants is somebody stepping around the system,
and sometimes stepping around the system is the right call.

<!-- phyllum:prop-synonyms -->

| Meaning | Spellings |
|---------|-----------|
| press | `onClick`, `onPress`, `onTap` |
| change | `onChange`, `onInput` |
| dismiss | `onClose`, `onDismiss` |
| label | `label`, `caption` |
| variant | `variant`, `kind`, `appearance` |
| size | `size`, `scale` |
| disabled | `disabled`, `isDisabled` |
| loading | `loading`, `isLoading`, `busy` |

The table is short on purpose. Every pair added to it is a pair Phyllum will call
a mistake, so a word that has an honest second meaning on the same element —
`type`, which is a variant to one library and an HTML attribute to every browser,
or `title`, which is a label to one component and a tooltip to the platform —
stays out. A synonym table that is generous is a table that cries wolf.

<!-- phyllum:prop-kinds -->

| Kind | Written as | Comparable |
|------|------------|------------|
| boolean | a bare attribute, `{true}`, `{false}` | yes |
| number | `{3}`, `{1.5}`, `{-1}` | yes |
| string | `"lg"`, `{'lg'}`, a template with nothing interpolated | yes |
| object | `{{ background: '#2563EB' }}` | yes |
| array | `{['a', 'b']}` | yes |
| expression | `{handleClick}`, a call, anything with an operator in it | no |

`Comparable` is the honesty rule of this reading. An attribute scan can see that
`{size}` is an expression; it cannot see what that expression evaluates to
without becoming a type checker. So an expression is recorded, counted and
reported as unread — and never used to claim a conflict, because a conflict
between a string and something Phyllum did not read is not a finding, it is a
guess. Which kinds are the shapes of a value is a fact about the language and
lives in the reader; which of them may be compared is a decision and lives here.

Two more limits, both stated in the report rather than left to be discovered. A
spread (`{...props}`) can supply any prop at all, so a usage carrying one is read
for what it *does* say and never for what it does not — this pass reports things
that are present, never things that are missing. And the whole prop reading is
React-only in v0.2.1, exactly as the component pass is: on a stack whose markup
Phyllum does not read, the answer is that the question was not asked.

Which props are style-affecting is the `Watches` column above rather than a list
in the code, and a bypass is only reported for a component the design system
**registers with more than one variant** —
without a variant there is nothing to bypass, and telling somebody to use a
variant that does not exist is worse than saying nothing.

<!-- phyllum:consistency-limits -->

| Limit | Value | Why |
|-------|-------|-----|
| names | 300 | distinct names one naming pass reads, most-used first |
| convention evidence | 4 | names that have to carry a convention before one is called dominant |
| convention majority | 0.6 | the share the leading convention must hold before a stray is a finding |
| components | 60 | components one prop pass compares, most-used first |
| usages | 200 | usages of any one component the prop pass reads |

Sorted before capped, as everywhere else: the names and the components are the
most-used ones, so a cap drops the tail rather than an arbitrary three hundred.
The majority share is the difference between a convention and a coincidence — a
codebase split evenly between two styles has not chosen one, and Phyllum reports
that it could not find a dominant convention rather than picking a winner.

---
