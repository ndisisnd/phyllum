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
(confirm · rename · `merge <token>` · skip — the table in `refs/tokenise/confirmation.md`), the
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
