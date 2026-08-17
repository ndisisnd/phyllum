# `assess-severity` — how much a finding matters, and what kind it is

**Threshold: 1.0.** Deterministic end to end, so every claim is a fact about a
pinned fixture rather than a judgement. There is nothing here a model could
answer differently, and nothing that varies between two runs on the same
codebase — which is the property the whole lint path is built on (v0.2.1 §3.1).

## What this grades

v0.2.1's assessment stopped treating every raw value alike. Two changes made
that possible, and this eval grades both, because neither is worth much without
the other:

1. **Severity.** A value written three times or more is systematic drift and is
   proposed as a token; a value written once or twice looks like a deliberate
   exception, and is reported without being demanded. One threshold for every
   family, and it lives in the `phyllum:severity` table in `refs/assess/`.
2. **Rule families.** Every finding says which kind of value it is —
   `raw-colour`, `raw-spacing`, `raw-radius`, `raw-border`, `raw-shadow`,
   `raw-typography` — so a report can say which half of the drift got fixed.
   `raw-radius` and the two compound families are new here; the others are old
   behaviour finally given a name.

The fixture, `evals/fixtures/codebases/shadow-border`, is written for exactly
this: the same value families at both frequencies, and the two shapes the scalar
passes cannot read.

## The claims, per case

| Case kind | Claims |
|-----------|--------|
| `finding` | the rule family · the severity · the usage count · the "applies to" label · the proposed name is on the documented ladder |
| `absent` | the value is not proposed at all, under any family |
| `unread` | the value is in the fourth bucket, and carries a severity but no rule |

## Why the negative cases outrank the rest

Two of the eleven cases assert that something is **not** there, and they are the
ones worth failing over.

`box-shadow: none` must record nothing: a compound with neither a length nor a
colour is a decision to have no shadow, and proposing a token for it would be
the tool inventing work. And the fixture's only `1px` sits inside a border
shorthand — reading it as a border *and* as a length would report one decision
as two findings, which is the exact failure mode the compound passes introduce
if the scalar reading is not stood down.

The `unread` case is the third of that kind. A shadow with a `var(…)` in it is
not half-read into a shadow token; it goes back to seen-but-not-read, where a
question gets asked instead. A compound read in part is worse than one left as a
question, because a part-read compound looks like a fact.

## What this eval does not grade

The interactive review, and what a user does with a warning. Promoting a
`warn` to a token by hand is a decision, not a finding, and the assertions in
`evals/assertions/assess-severity.test.js` cover the mechanics of both that and
the `assess update` fast-forward declining one.
