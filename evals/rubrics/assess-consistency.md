# `assess-consistency` — one concept, one name; one component, one contract

**Threshold: 1.0.** Every claim here is a reading of structure over pinned
fixtures: which words two names are made of, which convention a name is written
in, which attribute names one component was handed, which shapes a prop's values
came in. Nothing is asked of a model and nothing depends on a machine or a date,
so there is no headroom in the threshold — for the same reason `assess-severity`,
`assess-hygiene` and `assess-similarity` have none (v0.2.1 plan §5).

The threshold matters more here than anywhere before it, because this is the
first family allowed to say `error` about somebody's markup. A false positive on
a naming stray is an annoyance; a false positive on a prop synonym is Phyllum
telling a developer their working code is broken.

## What it grades

1. **Naming drift (§5.1).** The same word set spelled two ways — a different
   word order (`SmallButton` / `ButtonSmall`) or a different case
   (`panel-header` / `panelHeader`) — reported with the predictable
   `Base + Qualifier` form as the suggestion.
2. **The dominant convention (§5.1).** Counted from the names that carry one,
   never assumed; a name that strays from it reported with the same suggestion
   shape, and a codebase that has not chosen one told so rather than given a
   winner.
3. **Prop synonyms (§5.2).** One component handed two names for one prop, as an
   `error`, because a component has one API.
4. **Prop type conflicts (§5.2).** One prop given values of two comparable
   shapes, as an `error`, with the value Phyllum could not read excluded from
   the comparison rather than guessed at.
5. **Style bypasses (§5.2).** A `style` on a component the design system already
   gives variants for, as a `warn` — an escape from the system, not a
   contradiction of it.

Four fixtures. `evals/fixtures/codebases/mixed-naming` is built case by case, so
each claim turns exactly one thing true or false;
`evals/fixtures/codebases/react-css` and `evals/fixtures/codebases/repeated-jsx`
are the ordinary projects that must produce nothing at all; and
`evals/fixtures/codebases/vue-app` is the stack whose markup Phyllum cannot read.

## The claims, per case

| Case kind | Claims |
|-----------|--------|
| `drift` | the group is reported · with every spelling in it · as the right shape of drift (`order` or `case`) · with the predictable form suggested · as a `warn` |
| `no-drift` | the name is in no drift group |
| `convention` | the dominant convention for that kind is the expected one, and it was decided |
| `no-convention` | no convention is called dominant, and a reason is given |
| `stray` | the name is reported · with its own convention named · with the predictable form suggested · as a `warn` |
| `no-stray` | the name is reported as no kind of naming finding |
| `synonym` | the component is reported · with both spellings · as an `error` |
| `conflict` | the prop is reported · with both shapes · as an `error` |
| `no-conflict` | the prop is reported as no conflict |
| `bypass` | the prop is reported · as a `warn` · naming the variants it bypassed |
| `unread` | the pass counted the values it could not read, and reported none of them as a conflict |
| `no-findings` | the project reports no naming and no prop findings at all |
| `not-checked` | no prop findings, a stated reason, and the pass admitting it did not run |

## Why the negative cases outrank the rest

- **The ordinary React projects.** `react-css` and `repeated-jsx` are normal
  codebases with a couple of class modifiers each. A pass that finds naming drift
  in them finds naming drift everywhere, and a report that flags every codebase
  is a report nobody reads twice.
- **The BEM modifier that is not a stray.** `btn--ghost` in a hyphen-cased
  codebase is evidence *for* the house style, not against it. Counting BEM apart
  from kebab would have every BEM codebase report half its own names as strays
  from itself — the single loudest failure mode this check has.
- **The prop given one shape twice.** `size="sm"` and `size="lg"` is a prop being
  used correctly. Reporting it would make the error tier meaningless.
- **The value that could not be read.** `title={heading}` is an expression, and
  an attribute scan cannot know what it evaluates to. Counting it against a
  string would be a guess wearing a finding's clothes.
- **The Vue project.** Its components are not called consistently; they were
  never read. Saying "no mismatches" there answers a question nobody asked.

## What the eval does not grade

Determinism across reruns, the exact wording of the report, the conventions and
severities being read from `refs/assess/` rather than restated in code, the
caps binding on a project bigger than the caps, the fold that keeps a registered
component's class spelling from being reported as drift against itself, and the
read-only proof around the whole pass. Those are assertions, in
`evals/assertions/assess-consistency.test.js`.
