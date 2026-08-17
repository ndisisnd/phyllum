## With nothing to read — the kind picker

`phyllum tokenise` with no sentence at all is not an error and not a wall. The
run does two things, in this order and never the other one:

1. **The resume offer, first, always.** A queue cut short is picked up where it
   stood — the values are already read, and asking for them again is asking for
   a sentence that was already typed.
2. **The kind picker**, when there is no queue to resume or the offer is
   declined. It asks *what kind* of token is being recorded, and then asks the
   one follow-up that kind needs.

The picker builds prose. Everything downstream of it — pass detection, the
naming scales, the already-named check, the confirmation, the acceptance gate,
the one write funnel — is the path a typed sentence has always walked, and the
picker reaches it by assembling the sentence the user did not type.

```
What are you tokenising?
  1. a colour
  2. typography
  3. a border radius
  4. spacing
  5. something else
(or just describe it — "our brand blue #2563EB" — or "skip")
```

<!-- phyllum:picker -->

| Pick | Prints as | Follow-up | Builds |
|------|-----------|-----------|--------|
| `colour` | a colour | `colour-fork` | — |
| `typography` | typography | `typography` | `type <answer>` |
| `radius` | a border radius | `radius` | `<answer> radius` |
| `spacing` | spacing | `spacing` | `<answer> spacing` |
| `other` | something else | `free-text` | `<answer>` |

The **Builds** column is the whole of what the picker does to an answer:
`<answer>` is what the user typed, and the word beside it is the one the pick
already answered. `8px` picked under *a border radius* becomes `8px radius`, so
the "what does this apply to?" question never fires — a question already
answered is a question not worth asking twice. The added word is dropped when
the answer already carries a word that signals the same thing, so `8px radius`
answered at that question stays `8px radius` and never becomes `8px radius
radius`. Row order is the printed order, and the number a user types is the
row's place in this table.

**The first four rows are the three passes plus the two commonest number
roles.** The fifth, `something else`, falls to the free-text question — so
border widths, shadows and compounds keep a numbered path in, and the named
rows stay the ones a first-time user reaches for.

**How an answer is read**, in this order: a number inside the range picks the
row in that place; a row's own word picks that row, so `1`, `colour` and
`a colour` are one answer; a skip word — the `skip` row of the review table
above, and an empty answer — ends the run writing nothing; and **anything else
is a sentence**, parsed exactly as an argument would be. The skip words are read
from that one table rather than restated here, so the word that skips a
proposal is the word that skips the picker.

Free text is honoured at **every** step, not only the first: a user who answers
the picker, the fork or a value question with a whole sentence gets that
sentence parsed as if it had been the argument. The picker is a ramp for the
empty-handed, not a gate for anyone. And a skip at any depth writes nothing and
ends the run — no dead ends, no forced march.

**Non-interactive runs keep the older behaviour.** With no way to ask — a pipe,
CI, `--no-input` — the run prints the usage block and exits `1`. A picker with
nobody to pick is a wall, and a wall is what this section exists to remove.

### The fork under colour: solid or gradient

Picking *a colour* asks one more question before the value:

```
A solid colour, or a gradient?
  1. solid — one value (#2563EB, rgba(…), hsl(…))
  2. gradient — a CSS gradient (linear-gradient(…), radial-gradient(…))
(or just describe it — "our brand blue #2563EB" — or "skip")
```

<!-- phyllum:colour-fork -->

| Fork | Prints as | Follow-up | Builds |
|------|-----------|-----------|--------|
| `solid` | solid — one value (#2563EB, rgba(…), hsl(…)) | `colour-solid` | `<answer>` |
| `gradient` | gradient — a CSS gradient (linear-gradient(…), radial-gradient(…)) | `colour-gradient` | `<answer>` |

Both forks build the answer unchanged, because a colour value is
self-identifying once it exists: a pasted `linear-gradient(…)` reads as a
gradient wherever it appears. The fork lives here, and nowhere in sentence
parsing, precisely because it is only needed when there is no value yet to look
at. The escape line is on this question too — decided with the fork, because a
question that can be answered in prose and cannot be escaped would be the one
dead end in the flow.

### Argument hints — every value question shows its shape

A question that asks for a value also says what a valid answer looks like, in
brackets, in a fixed order. The hint is **copy, not grammar**: the parser
accepts everything it always accepted, and a hint understates on purpose —
`hsl()` still works where the hint says rgba — rather than listing every shape
and burying the common case. The optional part, `[name]`, is answered or left
off freely.

<!-- phyllum:value-questions -->

| Question | Asks | Hint | Example |
|----------|------|------|---------|
| `colour-solid` | Write your colour as | `[HEX code / rgba value] [name]` | `#2563EB brand-blue` |
| `colour-gradient` | Write your gradient as | `[linear-gradient(…) / radial-gradient(…)] [name]` | `linear-gradient(135deg, #2563EB, #10B981) hero-backdrop` |
| `typography` | Write your reading as | `[size] [weight] [line-height] [name]` | `24px bold 1.2` |
| `radius` | Write your value as | `[px / rem value] [name]` | `8px rounded-card` |
| `spacing` | Write your value as | `[px / rem value] [name]` | `16px space-md` |
| `missing-value` | Write the value as | `[HEX code / rgba value / px / rem value] [name]` | `#2563EB` |

One question is composed from one row, in a fixed order — the ask, the hint, an
example, the escape:

```
<Asks> <Hint> — e.g. "<Example>". (or "skip")
```

so the `colour-solid` row prints as
`Write your colour as [HEX code / rgba value] [name] — e.g. "#2563EB brand-blue". (or "skip")`.

Two readings come out of the table's shape:

- **`radius` and `spacing` are two rows with one hint.** The shape of the answer
  is the same and the example is not, because an example is the fastest way to
  say which question is being asked.
- **The `missing-value` row is the same rule, one step earlier.** A thin
  sentence — "add a token for our brand blue" — opens the missing-value
  question, and that question wears the hint its row declares, after the lead
  sentence naming what is being asked about. It cannot know whether a colour or
  a length is coming, so its hint carries both.

Hint copy for the `update` flows is not here; those rows land with those flows.

---
