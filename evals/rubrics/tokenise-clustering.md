# Eval — near-identical values become one token (plan §4, §8.5)

**Status: runnable.** `node evals/run-evals.js` scores it. Prompts:
`evals/prompts/tokenise-clustering.json`. Fixtures:
`evals/fixtures/codebases/tokenise-mixed` and
`evals/fixtures/codebases/polyglot-theme`.

*Whose eval this is:* clustering became `assess`'s behaviour in v0.2.0 (§5.3) —
`tokenise` reads prose now. The eval keeps its `tokenise-` id because renaming an
eval means re-recording the baseline, which is M8's job. The id is stale; the
coverage is not.

## What is being graded

The reason `tokenise` clusters at all is that a codebase is messier than the
system it deserves. One brand blue gets typed two ways; one corner radius drifts
by a pixel. If Phyllum proposed a token per distinct string, it would mirror the
entropy instead of converging it, and the user would end up hand-merging the
mess they came here to escape.

So this eval grades the plan's own case directly: `#2563EB` used fourteen times
beside `#2564EC` used twice has to come out as **one** proposal, and `11px`
beside `12px` likewise.

It grades the opposite failure just as hard. Clustering that flattens genuinely
different values is worse than no clustering: `#2563EB` and `#FFFFFF` must stay
two proposals, and an 8px padding must never merge into a 12px radius just
because both are lengths — roles are clustered separately for exactly that
reason.

### Clustering has to hold in every language

v0.2.0 committed the values pass to being **language-agnostic** (§5.1): raw
styling lives in a JSON theme file, a Go constants file or a Kotlin object as much
as it lives in `.css`, and all of it is read. Widening the reach of a scan is only
worth anything if the rules that follow it hold unchanged, so three cases run
against `polyglot-theme` — a project with no stylesheet and no markup at all.

They grade the same three claims as above, in a codebase where nothing is CSS: a
blue written two ways still clusters once, a corner radius written in JSON and in
Go is still one decision, and a spacing still does not merge into a radius. The
fixture also carries its own controls — a `timeout: 30` that is not a design
decision, a `BrandBlue` constant whose key names a colour Phyllum will not guess
at, and documentation whose examples must never be counted as sightings.

## Scoring

Per case:

- **1 point** — the number of proposals covering the pinned values is the
  expected number.
- **1 point** (single-cluster cases only) — the cluster is represented by the
  most-used member. The representative must be a value that exists in the code:
  an average would be a value nobody wrote.
- **1 point per pinned count** — each member's sighting count matches. This is
  what keeps the fixture and the eval honest with each other: edit the fixture
  and these numbers have to move with it.

**Threshold: 1.0.** Clustering is a rule, not a tendency, and every claim here
is a deterministic fact about a pinned fixture. There is no model in this eval,
so a machine with no `claude` on it scores exactly the same.
