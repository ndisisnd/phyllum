# Build's report — numbering, mapping, and the source block

`refs/build/build.md` §3 states the rule: Build's output is a numbered report
under `.phyllum/`, and every report is mapped back to what it answers. This
file is the mechanics, the way `refs/assess/protocol-assess.md` §5 is the
mechanics for the report Assess leaves behind. Load it when a question is
about `build-report-[n].md` itself — its numbering, what it says, or how a
later run reads it back — rather than about the stage as a whole.

The implementation is `lib/build-reports.js`, and it mirrors
`lib/assess-reports.js` closely enough that a reader of one already knows most
of the other. Where the two disagree, `lib/build-reports.js` is the one that
governs this file's own claims.

## Numbering

Reports are `build-report-1.md`, `build-report-2.md`, and so on, and the rule
is exactly Assess's rule for its own numbered reports:

- **Numeric, never lexicographic.** `build-report-10.md` follows
  `build-report-9.md`; a sorted directory listing would put it before
  `build-report-2.md` instead, and reading the numbers rather than the sort
  order is what avoids that.
- **The next number is one past the highest that exists**, not one past how
  many files are on disk. A project whose `build-report-2.md` was deleted
  still gets `build-report-4.md` next — 3 already named a report somebody may
  have quoted, and reusing 3 would let two different reports answer to one
  name.
- **Strangers are ignored.** `.phyllum/` holds `assess-[n].md`,
  `session.json`, `PRD.md`, `assess.json`, and now `build-report-[n].md`
  beside them. Anything that is not exactly `build-report-<digits>.md` — an
  `assess-*.md` report included — contributes nothing to the count.

`BUILD_REPORT_PATTERN` is the one regular expression that decides this, and
`listBuildReportNumbers`, `nextBuildReportNumber` and `latestBuildReportNumber`
are the only functions that should ever be asked "what number is next" or
"what is the most recent report" — never re-derive the answer by listing the
directory yourself.

## Dating

Every report carries a `Date:` line, injected the same way Assess's is: a
default parameter on the write function, never a bare `new Date()` inside the
renderer. `reportDate` itself is not reimplemented here — `lib/build-reports.js`
imports it from `lib/assess-reports.js`, so there is exactly one function in
the codebase that turns a clock reading into the `YYYY-MM-DD` a report shows,
and it reads local time, not UTC, for the reason `assess-reports.js` gives:
a report is a working document read beside the reader's own calendar, and a
UTC stamp can be a day behind it.

## The mapping — what a build report answers

A build report exists to answer something, and it says what in two places
that cannot disagree, because both are rendered from the same input.

**The Source section**, a sentence a person reads:

- `Answers: assess-3 (2026-08-24)` — built from the latest drift report's
  recommendations.
- `Answers your description: "button primary with 12px padding-top"` — built
  from a typed sentence, when there was no report to consult or the sentence
  overrode one that existed.
- `Answers neither a drift report nor a description — nothing was on record
  to build from.` — the accepted run had no Build input at all; rare, and
  honest about it rather than inventing a source.

**The `phyllum-build-source` block**, immediately below the Work section, the
same fact as JSON:

```phyllum-build-source
{
  "schemaVersion": 1,
  "source": "report",
  "assessReport": 3,
  "prose": null
}
```

`source` is one of `"report"`, `"prose"` or `"none"` — the three answers
above, in the same order. `assessReport` carries the drift report's number
when `source` is `"report"` and is `null` otherwise; `prose` carries the typed
sentence when `source` is `"prose"` and is `null` otherwise. Exactly one of
the two is non-null when a real input exists, and both are `null` for
`"none"`.

A declared info string, `phyllum-build-source` rather than plain `json`, finds
this block specifically — the same reasoning `RECOMMENDATIONS_FENCE` gives in
`assess-reports.js`, so a reader of one file already understands the other. A
`schemaVersion` inside the block, bumped only when a field changes meaning or
disappears, never when one is merely added — the report itself may be
reworded at will; the block is a contract and does not change shape silently.

`parseBuildSource(text)` reads the block back, with the same null-vs-throw
rule `parseRecommendations` uses: `null` when the report carries no block —
an absence of data, not a finding — and a thrown `SyntaxError` when the block
is present but broken, because proceeding as though a clean mapping had been
read is the one wrong answer available to a caller.

## The Work section

Below the Source section, the report carries what the run actually built
from, in the same wording Build's other surfaces already use:

- When `source` is `"report"`, one line per recommendation consumed —
  severity, rule, family, the finding count, and the suggested action when
  one exists — the same shape `renderBuildInput` shows above the picker in
  `lib/build-input.js`, so a user who saw the briefing recognises the report.
- When `source` is `"prose"`, the one line that names what was built: the
  sentence itself.
- When `source` is `"none"`, a plain statement that there was nothing to
  build from, mirroring the Source section rather than inventing content for
  a section that has none.

## Writing

The write goes through `lib/write.js`, exactly as every other write in the
CLI does. `BUILD_REPORT_PREFIX`, `buildReportFile(n)` and
`writeBuildReportFile(root, n, contents)` sit beside their `ASSESS_REPORT_*`
counterparts, and the path they produce is always inside `.phyllum/`, which
was already inside the permission model before this report existed — Build's
output adds no new write target, only a new name for one Phyllum already had.

## What phase 3 does not do

`refs/build/build.md` §4 states the phase table; the short version repeated
here because a report about a report needs it too. Phase 3 makes the
mechanics above real and wires them into `create`'s prose and pick doors: an
accepted component write now leaves a build report behind, mapped to what it
answered. It does **not** reorder the write around the report — the report is
still written after the design system is edited, not before it and read as
something to approve. That reordering, and splitting a large drift answer
into phases, is phase 4's job, and the call site in `lib/create-command.js`
says so at the point it will move. Image mode and a component seeded from an
`assess` candidate write no build report yet; only the two doors named above
do.
