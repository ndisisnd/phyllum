## The map — step 4

One table, one ranking, every bucket in it. A row is a whole decision:

| Column | What it says |
|--------|--------------|
| value | the value as the code writes it — the cluster's most-used member, never an average |
| used | how many times it is written out across the project |
| where | the first file it was found in, and how many others there are |
| what it looks like | what the scan established: the properties a colour sits on, the role a length carries, the typography reading a declaration is, or `role unknown` |
| coverage | the token that already names it, the name Phyllum would propose, or `ask` |

The ranking is frequency, most-used first, because the value the codebase leans on
hardest is the one worth naming first. Covered values are **on the same table** as
uncovered ones: "how far has this drifted?" is only answerable if what is already
named sits next to what is not. A truncated table always says how many rows it
left out, and a row that stands for several clustered values says so — an
inventory that hid the merge would look tidier than the codebase is.

### The typography readings on the table

The eighteen optional typography readings sit on this table like every other
value, because they are every other value: a `letter-spacing: 0.06em` written
three times is three sightings of one decision the design system does not name.
Two columns read differently for them, and both differences are the same fact —
a reading is recorded *on* a token rather than *as* one.

- **what it looks like** names the reading and the declaration it was written
  as, in that order: `kerning on letter-spacing`. The reading is the word a
  designer would use; the property is the word the code used. A reading whose
  name is already its property — `word-spacing`, `text-transform`,
  `font-family` — prints once rather than twice.
- **coverage** names the token the reading would be recorded on. A Typography
  row needs a size, a weight and a line-height, so a reading can only be
  proposed onto a type the code actually stated: when the rule block carrying
  the reading also carries a font size, the proposed name is the one the
  typography pass proposes for that same block, from the same unchanged naming
  scale. Two readings on one rule block are two readings of **one** token and
  share the name.
- A reading with no type stated around it says **`ask`**. A stray
  `font-family: Georgia, serif` is a real decision, and which token it belongs
  to is a question rather than a guess.

One line beneath the buckets says how many of the eighteen readings were already
named and how many are written raw. It prints even when there are none, because
a scan that looked and found nothing and a scan that never looked are different
results, and the reader cannot tell them apart from silence.

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
