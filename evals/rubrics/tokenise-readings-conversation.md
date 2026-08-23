# Eval — the readings conversation holds its shape (plan v0.7.3, phase 2)

**Status: scored, from the v0.7.3 release.** The cases in
`evals/prompts/tokenise-readings-conversation.json` are deterministic end to end:
`parseProse`, `readingsQuestion`, `followUpReadings`, `conflictQuestions`,
`settleConflict`, `nearDuplicate` and `declarationTextFor` are the real functions,
called in the real order, walked without a terminal. No model is involved, so the
score is reproducible on any machine.

**Threshold: 1.0.** Every claim here is a fact about a pinned sentence and a
scripted answer, so anything below every point is a behaviour that changed rather
than a judgement that went the other way.

## What is being graded

v0.7.3 widened the typography token from three readings to twenty-one. The
assertion suite already proves the mechanics — which keyword reaches which
reading, which value survives a round trip, which CSS declaration each reading
becomes. This eval grades the half a contract table cannot hold: the shape of the
**conversation** that gathers the eighteen optional readings. Two behaviours, and
both of them rot without a single assertion noticing.

### 1. The follow-up conversation

Eighteen optional readings could have been eighteen questions. That is a form,
and a form is the thing `tokenise` exists not to be. So there is **one**
follow-up, asked **after** the three core readings are settled, and everything an
enum or a value reading needs is gathered in it.

Three things are graded, and each is a case:

- **One question, once.** Not two, not one per reading. Asked with size, weight
  and line-height already read, because the readings only make sense on top of a
  type decision that already exists.
- **A skipped follow-up records nothing.** Not a default, not a helpful guess,
  not the neighbouring token's face. Nothing. An absent reading means "not
  decided", and the moment a skip starts recording anything the never-invent rule
  is gone.
- **An unstated reading stays absent.** Stating kerning states kerning. It does
  not imply a case, a face or a rendering hint. A reading named with no value
  after it is reported rather than filled in, because an empty value is not a
  decision anybody made.

The never-correct rule rides along with these: a value carrying commas and quotes
— a font stack, a feature-settings string — is recorded exactly as typed.

### 2. The conflict questions

Three collisions exist, the contract declares all three, and this release chose
one route for every one of them: **warn and ask, never refuse.** Phyllum shows
what it read, says why the readings collide, and asks. Nothing is auto-resolved
and nothing is silently dropped.

- **The contradiction.** `superscript` with `subscript` both write
  `font-variant-position`, and no value of it means both. Graded: one question,
  reported as a contradiction, naming both readings and the property; both
  offered, plus keeping both; and an unanswered question keeping both rather than
  picking a winner. The run carries on — a conflict is a question, never a
  refusal.
- **The shorthand overlap.** `font-variant` reaches what `small-caps` and
  `slashed-or-lining-zero` reach. Both pairings are a case, and both are graded
  on the same four points.
- **The near-duplicate.** Three numbers already named, different optional
  readings. That may be a different typographic decision wearing the same size,
  weight and line-height, so it is neither auto-refused as a duplicate nor
  silently written. Graded: the warning naming the differing reading and saying
  nothing has been written yet, the question offering to record it anyway,
  answering yes recording it, and skipping writing nothing and saying which token
  it was left as.

And one reading is dropped only when the user names the other. That is the whole
of how a reading is ever removed.

### The counter-case that pins the distinction

`underline` with `strikethrough` is **not** a question. The two share one
declaration rather than colliding, so they merge into a single
`text-decoration-line: underline line-through` in the contract's own reading
order. A release that turned that pair into a question would still pass every
assertion in the suite, and the user would be asked to choose between two things
that were never in conflict. One case pins it: no question raised, both readings
kept, one declaration emitted.

A second counter-case pins the other edge: three numbers already named with **no**
differing reading is still a plain duplicate. No warning, no question, nothing
written. The near-duplicate path is deliberately narrow, and widening it by
accident would nag about every repeated token.

## What is not being graded

- Which bytes reach `DESIGN-SYSTEM.md`. That is
  `evals/assertions/tokenise-readings.test.js` and
  `evals/assertions/typography.test.js`.
- The wording of any line. The copy is a contract table in
  `skill/refs/tokenise/readings.md` and the collisions are a contract table in
  `skill/refs/typography.md`, so a copy change is a contract change and is
  asserted there rather than judged here. The claims below read structure —
  which readings a warning names, which options a question offers — never a
  sentence.
- The naming scale. No optional reading shifts a proposed name, and the plan asks
  for an assertion to pin that, not an eval.
- Anything a model would have to write. The whole path is mechanical, which is
  why every case scores without a responder.

## Scoring

One point per claim. A case scores only what the walk demonstrably does; an
expectation that cannot be observed in the walk scores zero rather than being
credited as probably fine.
