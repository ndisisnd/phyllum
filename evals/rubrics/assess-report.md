# `assess-report` — the findings, the score and the verdict

**Threshold: 1.0.** Deterministic end to end. Every claim is arithmetic over a
pinned fixture — how many findings of which severity, in which family, weighted
by a table into one number — so there is nothing here a model could answer
differently and nothing that varies between two runs on the same project
(v0.2.1 §7, §8).

## What this grades

The four milestones before this one each added a way of judging. M5 adds the two
things a person actually reads, and six checks that did not belong to any family.

1. **The smaller checks (§8).** Six rules, each reading something no other pass
   reads: two colours against each other, a dark theme against a light one,
   `DESIGN-SYSTEM.md` against itself, a spacing value against the scale it
   nearly sits on, and the two kinds of literal no property table gives a role
   to — z-index and media-query widths.
2. **The score and the verdict (§7.1).** One step on a seven-step Fibonacci
   scale for *how much*, and one of three verdicts for *how bad*. Derived
   separately on purpose, from the same findings.
3. **The report (§7).** Every finding in one row shape — severity · finding ·
   evidence · suggested action — grouped by family, then the headline.

Two fixtures carry most of it. `evals/fixtures/codebases/dark-drift` is a
project with all six of the smaller problems at once: two brand blues six ΔE
apart, two greys four apart, a dark theme that restates two colours out of four,
two spacing tokens holding the same value under different names, a `15px`
padding one pixel off an eight-point scale, five unplanned z-index layers and
two breakpoints written as literals. `evals/fixtures/codebases/empty-project` is
its opposite, and scores the bottom of the scale.

## The cases that outrank the rest

**The four absences.** `no-dark-theme-is-silence`, `no-scale-is-silence` and the
two `no-extras` cases assert that six checks stay quiet on projects that do not
have these problems. This is the property that decides whether the section is
read or folded: a light-only product told it is missing dark values, or a
project with no spacing scale told its spacing is off one, is a report that
teaches people to skip a section. Silence without evidence is the design, not a
gap in it.

**`score-and-verdict-are-independent`.** One error and nothing else fails near
the bottom of the scale; forty exceptions and no errors passes with warnings
near the top. If the verdict were derived from the score, or the score from the
verdict, one of those two sentences would become unsayable — and both of them
are true things about real codebases.

**`families-are-counted-once-each`.** The six family counts sum to the overall
count, and the drift mass is exactly the weighted sum of those counts. Nobody
adds up a table by hand, so a summary that disagrees with the rows above it
would go unnoticed for a long time.

**`every-rule-has-an-action`.** Every rule any family can report has a row in
the action table, and a rule nobody wrote has none. The action column is the
only part of the report a reader acts on; a missing one leaves a finding with
nothing to do about it, and an invented one eventually suggests something wrong.

## How the score is built, and why it is Fibonacci

Every finding is worth points by family and severity (`phyllum:score-weights`),
the points sum into a **drift mass**, and the mass falls on a step
(`phyllum:score-steps`). Lint, similarity and props weigh heaviest at `error`
because each is a contradiction inside the code; naming, hygiene and the extras
weigh less because they are untidiness rather than contradiction.

The steps are 1, 2, 3, 5, 8, 13, 21 and the cut-points double, so each step
means about twice the previous one. Drift does not grow evenly and neither does
the work of fixing it; a 0–100 score would imply a precision no scan has, and
would invite arguing about whether a project is a 61 or a 64.

## Scoring

One point per claim, no partial credit. A finding reported in the wrong family,
at the wrong severity, or with a score off by one step is a wrong answer here
rather than a near miss — the number and the verdict are what somebody pastes
into a message, and 5 and 8 mean different things on purpose.
