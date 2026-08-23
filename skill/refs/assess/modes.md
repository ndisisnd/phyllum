## Chained modes

One command, one scan, six readings of it. The scan, the clustering and the map
are identical in every mode — a mode changes which tracks are walked, who
answers, and what the run leaves behind. It never changes what was found.

| Command | Tracks walked | Who answers | Leaves behind |
|---------|---------------|-------------|---------------|
| `assess` | tokens, then components — **one** component recorded | you | `.phyllum/assess-[n].md` |
| `assess tokens` | the token review only | you | `.phyllum/assess-[n].md` |
| `assess components` | the component picks only, **looped** | you, once per candidate | `.phyllum/assess-[n].md` |
| `assess update` | tokens, then components | Phyllum, where the answer is already on the page | `.phyllum/assess-[n].md` |
| `assess score` | none | nobody; it asks nothing | nothing |
| `assess drift` | none | nobody; it asks nothing | nothing |
| `assess --json` | none — the assessment is written to a file | nobody; it asks nothing | the JSON file, and no report |

Every finding family reports in every mode: the scan is one scan, so
`assess tokens` sees the same similarity groups, naming drift, prop mismatches,
hygiene findings and score that `assess` does. What the mode changes is which
suggestion track is *walked*, never what was found.

`tokens`, `components`, `update`, `score` and `drift` are reserved words in
argument position after `assess`. Any other word gets the list of valid ones
rather than an error. `--json` is a flag rather than a reserved word, so
`assess --json tokens` is the token mode written to a file — the scope word is
never read as a filename.

## `score` and `drift` — the two halves of the reading, on their own (v0.9.0)

They are **modes of `assess` and not siblings of it**, because the stage holds
to one command per stage. A second top-level verb would make "what state is my
design system in?" a question with two entry points and two answers.

| Mode | Returns | Never does |
|------|---------|------------|
| `assess score` | the drift score out of the top of the scale, the verdict, and how each was derived | write anything, ask anything, or emit a numbered report |
| `assess drift` | the codebase compared against `DESIGN-SYSTEM.md` — coverage, then the findings by family | print a score, walk a review, or emit a numbered report |

**Neither writes a report, and that asymmetry is the point of them.** A mode
somebody runs to check one thing has to be free to be run as often as they like.
A `score` that filed a numbered report each time would fill `.phyllum/` with
reports of the same scan, and it would break the one promise a numbered report
makes: that a number names a scan somebody meant to keep.

`assess score` is the **same computation** the full run does, through the same
module — one code path, so the score in a report and the score at a prompt can
never be two different numbers. The weights, the bands and the verdict rules are
in `refs/assess/protocol-assess-rubric.md`, which is the protocol behind both.

`assess drift` is the comparison specified in `refs/assess/protocol-assess.md`
§3: every reading the scan took put beside what `DESIGN-SYSTEM.md` already
records, each landing in exactly one of covered or uncovered. Covered and
uncovered are printed together, because "how far has this drifted?" is only
answerable when what is already named sits next to what is not.

## The numbered report — what a full run leaves behind (v0.9.0)

A full run ends by writing **`.phyllum/assess-[n].md`**: the date, the summary,
the drift by family, the health score, and the recommendations — once as prose a
person acts on, then once as a `phyllum-recommendations` fenced block a program
parses. The block is the handoff to the Build stage.

| Rule | Meaning |
|------|---------|
| the next number is one past the highest that exists | not one past the count — a deleted `assess-2.md` still yields `assess-4.md` next |
| a number is never reused or renumbered | that number already named a scan somebody may have quoted |
| the date is injected, never read from a clock inside render code | same inputs, same bytes; a test pins the day and gets fixed output |
| the write goes through the single write funnel | `.phyllum/` is already inside the permission model, so the stage adds no new write target |

The full specification is `refs/assess/protocol-assess.md` §5. What matters here
is only which modes emit one: the four that run the protocol end to end do,
`score` and `drift` do not, and `--json` does not — it writes its one file and
nothing else.

**`assess components` loops.** One candidate at a time, most-repeated first, each
with its own pick and its own acceptance gate. After each recording it asks about
the next. A skip, an empty answer, or an answer that matches nothing on the list
ends the run cleanly — nothing further is asked and nothing further is written.
Twenty components in one sitting is the cap; anything past it is named as left for
the next run.

**`assess update` fast-forwards on one rule:** a question whose answer is already
on the page is answered; a question whose answer is only in your head is skipped.

| Question | `assess update` | Why |
|----------|-----------------|-----|
| "Name `#2563EB` as `color-primary`?" | **accepted**, under the proposed name | the name was derived mechanically from the value and the naming scales — a review would add nothing to it |
| the one write to `DESIGN-SYSTEM.md` | **accepted**, once | the mode *is* that consent, given on the command line |
| "Name `#7C3AED` as `color-accent`?" (used twice) | **skipped**, value left unnamed | a `warn`-severity finding is a suspected exception, and accepting an exception nobody asked about is the write this mode promises not to make |
| "What does `18px` apply to?" (role unknown) | **skipped**, value left unnamed | the role is not in the codebase; guessing one is how a corner radius becomes a padding |
| "Record one of these as a component?" | **skipped**, patterns left in the report | the contract's questions have answers only you have, and unanswered slots would be written as TODOs nobody asked for |

Anything unrecognised is skipped, never accepted. That default is the safety
property worth stating: a question added by some later flow can only ever be
declined by the fast-forward, so no new conversation can be auto-accepted into by
accident.

So `assess update`'s output is exactly this: new token rows in `DESIGN-SYSTEM.md`,
under the names the map showed, and a report naming what it declined to answer.
Beyond `DESIGN-SYSTEM.md` and the numbered report every full run leaves under
`.phyllum/`, it writes nothing — no components, no codebase files, not one other
byte.

## `--json` — the same assessment, written to a file (§6.5.1)

`--json [path]` runs any mode and writes the **whole assessment object** to a
JSON file instead of walking any track. Default path `.phyllum/assess.json`;
`--json out/report.json` and `--json=out/report.json` both name one of your own.

| Property | What it means |
|----------|---------------|
| the same object | the file holds what the report renders from — findings, similarity groups, families, score, verdict — never a summary re-derived for machines |
| `schemaVersion` | first field in the file, so a consumer can refuse a shape it does not know instead of reading a field that moved |
| byte-stable | two runs over an unchanged codebase write byte-identical files. No timestamp, no duration, no absolute path, no random id — a diff between runs is a diff of the codebase |
| no review | `--json` never enters the review loop. Nothing is asked, nothing accepted, `DESIGN-SYSTEM.md` untouched |
| one file | it writes the JSON file and nothing else, and it never falls back to a second location when the first is refused |

Two things are left out of the file on purpose: `sightings`, every raw reading
the scan took, because it is tens of thousands of rows already summarised into
the inventory above it; and `root`, because an absolute path would make the same
project assessed from two checkouts diff against itself.

**`assess update --json` is refused**, with both halves of the reason stated.
`update` exists to accept suggestions for you and edit `DESIGN-SYSTEM.md`;
`--json` exists to report without touching anything. Running both would either
write the design system during a run whose whole promise is that it does not, or
silently ignore half the command line. It exits non-zero, because a run that did
not do what the command line asked must not report success to whatever asked.

## Backups — one undo ago (§6.5.2)

Every command that edits `DESIGN-SYSTEM.md` — `create`, `tokenise`, the review
loop, `assess update` — copies the current file to **`DESIGN-SYSTEM.md.bak`**
first. It is the state before the most recent edit, overwritten on each new one,
so `.bak` is always exactly one undo ago.

- It lives in the **single write path**, not in the commands. A backup each
  writer remembers to take is one that a future writer forgets.
- **A failed backup aborts the edit.** Not a warning: the file's whole value is
  existing at the moment somebody wants it, so a write that proceeds without one
  has quietly removed the safety it claims to provide.
- There is nothing to back up on a first write, so none is taken.
- `init` adds it to `.gitignore` alongside `.phyllum/` — a local undo buffer of
  a file that is already committed has no business in a diff.

## Rerunnable

A second `assess` diffs against the tokens `DESIGN-SYSTEM.md` already holds.
Known values are matched to their token silently and reported as coverage; only
*new*, unmatched values are proposed. So the run after an accepted pass proposes
nothing, and a codebase that has drifted since proposes exactly what drifted.

---

## What `assess` must never do

- **Write to your codebase.** Not one file, not one byte. `assess` reads code;
  only `apply` writes it, and only through a reviewable PRD on its own branch.
- **Write anything before acceptance, outside its own report.** The scan writes
  nothing at all. A full run writes one file, `.phyllum/assess-[n].md`, which is
  the stage's output and touches nothing you wrote; a later accepted suggestion
  writes `DESIGN-SYSTEM.md`, and there is no third thing.
- **Invent a value.** Every value in the report is a value the code contains. The
  representative of a cluster is its most-used member, never an average.
- **Rename or change a token you already have.** A value the system already names
  is reported as covered, not proposed again.
- **Pretend the component pass ran** on a stack it does not support, or imply it
  read files it skipped.
- **Guess a role.** A value it could see but could not read is a question. Skip
  the question and the value stays unnamed — that is the correct outcome, not a
  failure. This holds in `assess update` too: a fast-forward answers the questions
  whose answers are already on the page, and declines the rest.
- **Seed a component with a scanned value.** A candidate is a name and an
  archetype; every value still comes from you.
- **Need a model to be useful.** The scan, the map and the proposed names are
  mechanical. Only the review is a conversation, and its absence is said plainly
  rather than dressed up as an error.
