## `protocol-assess-rubric` — the health score, end to end

The drift report opens with two numbers, and this file is how they are produced.
It is the protocol behind `assess score`, and behind the health-score section of
`.phyllum/assess-[n].md`.

There is exactly one scale and exactly one verdict, and both already exist:

| Reading | Answers | Range | Derived from |
|---------|---------|-------|--------------|
| drift score | how much of it is there? | 1, 2, 3, 5, 8, 13, 21 — lower better | the weighted count of findings |
| verdict | is any of this systematic? | `fail`, `pass w/ warnings`, `pass` | severities alone, never the score |

This rubric formalises that scheme. It does not add a second one. A percentage,
a letter grade, a five-star rating or a "score out of 100" anywhere in a report
is a bug, not a presentation choice.

### Where the numbers are kept

The rows this rubric computes with are parsed at run time out of `report.md`
(`score-weights`, `score-steps`, `verdicts`) and out of `severity.md`
(`severity`). Those markers live in one file each — `lib/refs.js` refuses a
marker that appears twice — so the tables below are restated for a reader, and
`report.md` stays the copy the code reads. When the two disagree, `report.md`
wins and this file is wrong.

---

## 1. Metrics

A metric is a count, not a measurement. Every one of them is a number of
findings already produced by a family during the scan; the rubric re-reads
nothing and re-scans nothing. That is what makes the score deterministic for
free — the same codebase produces the same findings, and the same findings
produce the same score.

Six families, and the names here are the names the weights table uses, because a
family that scores under one name and reports under another is a family somebody
will eventually mis-weight.

| Metric | Counts | Findings it draws from | Module | Severity decided by |
|--------|--------|------------------------|--------|---------------------|
| lint | raw styling the design system does not name | uncovered values, uncovered typography readings, values seen but not read | `assess.js`, `assess-typography.js` | frequency — `severity.md` |
| similarity | two things that are one thing | `component-clone`, `style-duplicate`, `utility-overlap` | `assess-similarity.js` | similarity band, then rule table |
| props | one component's own API contradicting itself | `prop-synonym`, `prop-type-conflict`, `prop-style-bypass` | `assess-props.js` | rule table |
| naming | one concept spelled more than one way | `naming-drift`, `naming-convention` | `assess-naming.js` | rule table — both `warn` |
| hygiene | what collides, and what nothing uses | `framework-collision`, `styling-collision`, `theme-source-collision`, `unused-token`, `unused-component` | `assess-hygiene.js` | rule table — all `warn` |
| extras | the six smaller checks | `near-duplicate-colour`, `dark-mode-gap`, `token-alias-duplicate`, `off-scale-spacing`, `z-index-sprawl`, `hardcoded-breakpoint` | `assess-extras.js` | rule table |

Two consequences of that last column are worth saying out loud rather than
leaving a reader to derive:

- **Only three families can raise an `error`.** Lint raises one when a value is
  written three times or more; similarity and props and one extras rule raise one
  from their own tables. Naming and hygiene are `warn` in every row by design — a
  name in the wrong case still works.
- **A family the weights table does not name contributes nothing.** That is the
  safe direction for a default to point: a check added later cannot silently
  inflate every project's score before somebody decides what it is worth.

---

## 2. Weights

Counting findings alone would say a stale token and a prop contradiction are the
same amount of wrong. They are not: one costs a reader a moment of confusion,
the other means two call sites of the same component disagree about what it
takes. So each family carries a point value per severity, and the sum is the
**drift mass** the scale reads.

| Family | Points per `error` | Points per `warn` |
|--------|--------------------|-------------------|
| lint | 3 | 1 |
| similarity | 3 | 1 |
| props | 3 | 1 |
| naming | 2 | 1 |
| hygiene | 2 | 1 |
| extras | 2 | 1 |

Lint, similarity and props weigh heaviest at `error` because each is a
contradiction inside the code. Naming, hygiene and the extras weigh less because
they are untidiness rather than contradiction. Every `warn` is worth one point in
every family, which is the point of a warning: it counts, and it never counts as
much as the thing somebody has to fix.

The arithmetic, in full:

```
drift mass = Σ over families ( errors × error weight + warns × warn weight )
```

Nothing else enters the sum. Not file count, not project size, not how long the
scan took, not how many values were covered. The mass is an absolute quantity of
drift, and a large project with real drift is meant to score worse than a small
one with none.

### Worked example

A reader must be able to reach the same score by hand from a findings list. This
one:

| Family | `error` findings | `warn` findings | Arithmetic | Points |
|--------|------------------|-----------------|------------|--------|
| lint | 4 | 3 | 4×3 + 3×1 | 15 |
| similarity | 1 | 0 | 1×3 | 3 |
| props | 2 | 1 | 2×3 + 1×1 | 7 |
| naming | 0 | 2 | 2×1 | 2 |
| hygiene | 0 | 3 | 3×1 | 3 |
| extras | 1 | 1 | 1×2 + 1×1 | 3 |
| **total** | **8** | **10** | | **33** |

Drift mass 33 falls in the `<= 40` row, so the score is **8**. Eight errors exist
anywhere in the assessment, so the verdict is **fail**. Both readings are printed;
neither is derived from the other.

---

## 3. Score bands

The mass falls into one step of a seven-step Fibonacci scale. The cut-points
double, so each step means "about twice as much as the one below". A row with an
em dash in the mass column always matches, which is how the table spells "and
everything above this".

| Step | Drift mass | Means |
|------|------------|-------|
| 1 | <= 2 | essentially systematised — what is here is named |
| 2 | <= 5 | a handful of exceptions, and nothing systematic |
| 3 | <= 10 | drift has started; it is still a morning's work |
| 5 | <= 20 | a real backlog of unnamed values and untidy names |
| 8 | <= 40 | the design system describes some of this codebase |
| 13 | <= 80 | the codebase and the design system are two different systems |
| 21 | — | untamed — the tokens are a document, not a contract |

Fibonacci on purpose. Drift does not grow evenly and neither does the work of
fixing it; a 0–100 scale would imply that 61 and 64 are different states of a
project, and no scan is precise enough to claim they are. The widening gaps are
the honest part.

Rows are tested in the order the table writes them, and the first match wins.
Reordering the rows changes the scale, which is the intended way for a project
that wants a harsher one to get it — edit a table, not a file of code.

### The verdict band

| Verdict | When |
|---------|------|
| fail | one or more `error` findings anywhere in the assessment |
| pass w/ warnings | no errors, and one or more warnings |
| pass | nothing found at all |

The verdict reads severities and never the score, and the two answer different
questions on purpose. A codebase can fail at a score of 1 — one value written
three times, and nothing else — and pass with warnings at 8, with a hundred
deliberate exceptions. Both readings are true and neither is derivable from the
other. A report where they cannot disagree is a report that lost information.

`clean` in the summary is exactly `verdict === 'pass'`, stated once so one word
cannot disagree with the other.

### Rerun meaning

Same codebase and same `DESIGN-SYSTEM.md` produce the same mass, the same step
and the same verdict. That is what makes a rerun after a fix meaningful: the
number moves down the scale, or the work did not land. A rubric whose output
moved on its own would make every comparison between two reports worthless.

---

## 4. The determinism boundary

Determinism comes first. Every check that can be mechanical is mechanical, and
LLM judgement layers on top of the result — it never replaces it and never
overrides it.

| Stage | Kind | Who decides |
|-------|------|-------------|
| detect the stack and pick scanners | mechanical | `detect.js` |
| scan for raw styling | mechanical | the scanners, read-only |
| cluster and count | mechanical | aggregation |
| assign severity | mechanical | frequency threshold and the rule tables |
| count findings per family | mechanical | `assess-score.js` |
| weight and sum into drift mass | mechanical | the weights table |
| pick the step | mechanical | the steps table |
| pick the verdict | mechanical | the verdicts table |
| write the report's prose summary | judgement | a model, or a maintainer |
| order the recommendations | judgement | a model, or a maintainer |
| note something the scan cannot see | judgement | a model, or a maintainer |

Everything above the line runs in a plain terminal with no model installed and no
network. The score and the verdict are complete before any model is asked
anything, which is why the health section of a drift report is useful before you
say yes to anything.

What judgement is allowed to add:

- **Prose.** A reading of what a score of 8 means for this project in particular.
- **Order.** Which of the recommendations is worth doing first, given what the
  findings are about. The set of recommendations is mechanical; the ranking of
  them is a call.
- **Observations.** A note that a family is silent because the evidence was
  missing rather than because the codebase is clean.

What judgement may never touch: the mass, the step, the verdict, a finding's
severity, or the count in any row. If a model believes a `warn` should be an
`error`, that is a request to edit `severity.md`, not a licence to re-grade one
report. The tables are the place where an opinion becomes durable; a report is
not.

### How `assess score` uses this

`assess score` runs the scan, computes the mass, prints the step and the verdict,
and stops. It writes nothing and asks nothing. It is the same computation the
full `assess` run does — one code path, so the score in a report and the score at
a prompt can never be two different numbers.

---

## What the rubric must never do

- **Invent a second scale.** There is one drift score, 1 to 21, and one verdict.
  No percentage, no grade, no rating out of ten, no "overall health" number
  computed some other way.
- **Let a model override a mechanical result.** A score computed from counts is
  final. Judgement layers on top of it, never in place of it.
- **Derive the verdict from the score, or the score from the verdict.** They read
  different inputs and they are allowed to disagree.
- **Normalise by project size.** No per-file average, no per-thousand-lines rate.
  Drift mass is an absolute quantity and a big project with real drift scores
  worse than a small clean one, correctly.
- **Score a family the weights table does not name.** An unnamed family
  contributes zero until somebody decides what it is worth.
- **Re-scan anything.** Every input is a count already produced by the family
  that made the findings. A rubric that looked at code again would be a second
  scanner with a second set of answers.
- **Move a number to make a report read better.** A score that is not reproducible
  from the findings list is not a score.
- **Change the codebase.** This is a reading of an assessment, and an assessment
  writes nothing at all.
