# Eval — `delete` holds its gates (plan v0.5.0 §4, §6)

**Status: scored, from v0.5.0 M3.** The cases in
`evals/prompts/delete-flow.json` are deterministic and a runner can grade them;
what they waited on was a line in `evals/baseline.json`, and re-recording the
baseline belongs to the milestone that bumps the version. M2 pinned the cases
and this rubric and faked no score in the meantime —
`evals/assertions/evals-baseline.test.js` enforces that: an eval with no runner
must say so in its prompt file and must not appear in the baseline. M3
registered the runner in `evals/graders.js` and recorded the score.

**Threshold: 1.0**, met at 24 of 24. Every case here is a fact about a pinned
fixture and a scripted conversation, so anything less than every point is a
behaviour that changed.

## What is being graded

`delete` is the only destructive verb in the product, and the assertions already
prove which bytes moved. This eval grades the half they cannot reach: whether
the **conversation** keeps its shape. Four things rot quietly in a gated flow,
and each one is a case:

1. **Order.** The breaking-change warning has to arrive *before* any question
   about proceeding — on a bare `phyllum delete` and on a pre-answered
   `phyllum delete <name>` alike. A warning printed after the gate is a warning
   nobody read in time.
2. **The refusal is useful.** An in-use component is refused, and the refusal
   has to say **what was seen** — the recorded `applied: true`, or the markup
   site and the file it is in — and **the way out**, in order: remove the usage,
   re-run `phyllum apply` so the reading catches up, then delete. It ends at
   exit 0, because a refusal honoured is not an error.
3. **A skip is free at every depth.** At the pick, at the acceptance gate, and
   at the second confirmation. Each one ends the run cleanly, says nothing was
   written, and leaves the project byte for byte as it was.
4. **No dead ends.** A system with no components says so and points at
   `phyllum create`. A reserved `delete token` refuses **with its reason**, not
   with a bare no.

## What is not being graded

- Which bytes moved. That is the assertion suite's
  (`evals/assertions/delete-cli.test.js`): the entry, its Backlog lines, the
  `.bak`, and the whole-project diff.
- The wording of any line. The copy is a contract table in
  `skill/refs/delete/flow.md`, so a copy change is a contract change and is
  asserted there, not judged here.
- Anything a model would have to write. Nothing in `delete` is generated: the
  flow is wholly mechanical, which is why every case can be scored without a
  responder.

## Scoring

One point per bullet in each case's `expects` list. A case scores only what it
demonstrably does; an expectation that cannot be observed in the run's output
scores zero rather than being credited as "probably fine".
