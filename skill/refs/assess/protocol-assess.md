## `protocol-assess` — the Assess stage, end to end

Assess is stage one of the pipeline, and it answers one question: **what state
is my design system in?** This file is the spine of that answer. It names the
steps in order, says which existing reference owns each one, and says what the
stage leaves behind.

It is a spine rather than a second rulebook. Every step below is already
specified somewhere in `refs/assess/`, and this file points at that place
instead of restating it. Where this file and a topic file disagree, the topic
file wins and this one is wrong.

| Property | Value |
|----------|-------|
| stage | 1 — Assess |
| command | `assess`, one command; `score` and `drift` are modes of it |
| reads | the user's codebase, and `DESIGN-SYSTEM.md` |
| writes | `.phyllum/assess-[n].md`, and nothing else until a review is accepted |
| character | diagnostic — it reports, it never fixes |

The protocol runs in five steps, and the report is those five steps read back in
order.

| Step | What happens | Owned by |
|------|--------------|----------|
| 1. scan | detect the stack, read the project read-only, cluster and count | `refs/assess/scan.md` |
| 2. detect hardcoded values | read raw styling and repeated markup out of what the scan collected | `refs/assess/detection.md` |
| 3. compare | check every reading against what `DESIGN-SYSTEM.md` already records | this file, §3 |
| 4. score | weight the findings into a drift score and a verdict | `refs/assess/protocol-assess-rubric.md` |
| 5. emit | write the numbered, dated report from the template | this file, §5 |

Steps 1 to 4 are mechanical. They run in a plain terminal with no model
installed and no network, which is why a drift report is useful before anybody
says yes to anything. Only the prose of the summary and the ordering of the
recommendations are judgement, and the boundary is drawn row by row in the
rubric.

---

## 1. Scan

The scan is a read-only sweep. The modules that perform it contain no write call
at all, and the assertion suite diffs the whole directory around every scan and
demands that not one byte changed.

Three passes, in one sweep of the project:

| Pass | Reads | Reach |
|------|-------|-------|
| stylesheets and markup | declarations, `<style>` blocks, inline styles, Tailwind arbitrary values | any stack |
| every other text file | `property: value` pairs in any language | any stack |
| components | an element plus its class list, counted into a signature | React only |

**The mechanics are not restated here.** Which files are read, which
directories are skipped, how a shorthand is split, how a compound value is
taken apart, and what falls into the *seen, not read* bucket are all specified
in `refs/assess/scan.md`. That file carries the tables the CLI parses at run
time; this one carries only the order.

Two properties of the sweep matter to the rest of the protocol:

- **`DESIGN-SYSTEM.md` is never scanned as evidence.** It is Phyllum's own
  record, and reading it as code would let the design system count as its own
  drift. Its `.bak` is skipped for the same reason.
- **Clustering happens before naming, never after.** Near-identical values are
  grouped and surfaced as one proposal, and the representative is the cluster's
  most-used member — never an average. The thresholds are the
  `phyllum:clustering` table in `refs/assess/detection.md`.

---

## 2. Hardcoded-value detection

**This is a step of this protocol, not a mode of the command.** It is stated
here in plain words because the alternative has to be ruled out: there is no
`assess hardcoded`, no `--lint` flag and no sibling command. One stage, one
command; finding raw values is part of what `assess` *is*, and a mode that had
to be asked for would make the default assessment quietly incomplete.

A hardcoded value is a design decision written in code that the design system
does not name. Three shapes of it:

| Shape | Example | Becomes |
|-------|---------|---------|
| a raw value on a known property | `border-radius: 12px` written eleven times | a lint finding, under a rule from `refs/assess/severity.md` |
| a raw typography reading | `letter-spacing: 0.02em` on its own declaration | a `raw-typography` finding |
| a value seen but not read | `AccentTint = "#7C3AED"` on a property no table maps | a `role unknown` row — reported, never proposed as a token |

Severity is frequency and nothing else: used three times or more is `error`,
used twice or fewer is `warn`. The threshold is one number for every family, and
it is assigned at aggregation rather than by a scanner, because how much a
sighting matters is a question about the whole codebase.

The rule tables — which pass and role produce which rule name — live in
`refs/assess/severity.md`. The collision and unused checks live in
`refs/assess/hygiene.md`, the duplicate readings in
`refs/assess/similarity.md`, the naming and prop checks in
`refs/assess/consistency.md`, and the six smaller checks in
`refs/assess/extras.md`. All six families run in every mode, because the scan is
one scan.

---

## 3. Design-system comparison

This is the drift check, and it is a comparison rather than a judgement. Every
reading the scan took is put beside what `DESIGN-SYSTEM.md` already records, and
each reading lands in exactly one of two states.

| State | Means | In the report |
|-------|-------|---------------|
| covered | a token in the matching section already holds this value, or a value that clusters with it | counted as coverage; matched silently, never proposed again |
| uncovered | nothing in the design system names it | a finding, carrying a severity and a rule |

Covered and uncovered values sit **on the same table**, because "how far has
this drifted?" is only answerable when what is already named sits next to what
is not. The mapping table's columns are specified in `refs/assess/map.md`.

Three rules keep the comparison honest:

| Rule | Why |
|------|-----|
| a value the design system already names is coverage, not a proposal | an accepted token makes the raw sightings evidence that the token is working |
| a value with no role is a question, never a guess | without a role `18px` could be a corner or a padding, and Phyllum does not pick |
| a component pass that did not run says so | a stack outside the React row gets the values pass and an honest note, never silence |

This comparison is what `assess drift` returns on its own: the drift section,
codebase against `DESIGN-SYSTEM.md`, with no score section and no review.

---

## 4. Score

The findings are weighted into one **drift score** on a seven-step Fibonacci
scale, and one **verdict** read from severities alone. The two answer different
questions and neither is derived from the other.

**The weights, the bands and the verdict rules are not restated here.** They are
in `refs/assess/protocol-assess-rubric.md`, which is the protocol behind
`assess score` and behind the health section of every report. The tables the
code actually parses are in `refs/assess/report.md`.

What this protocol commits to is only the position of the step: scoring happens
**after** the comparison and **before** the emission, it re-reads nothing, and
it re-scans nothing. Every input is a count the families already produced. That
is what makes a rerun after a fix meaningful — the number moves down the scale,
or the work did not land.

---

## 5. Report emission

The stage leaves something behind. A terminal report is read once and lost when
the scrollback rolls; a stage output is an ordered, dated file that says what the
design system looked like on the day it was scanned.

`assess` writes **`.phyllum/assess-[n].md`**, five sections, in this order:

| Section | Holds |
|---------|-------|
| date | the day the scan ran, as `YYYY-MM-DD`, carried by the report itself |
| summary | what this scan found, in two sentences at most |
| drift | one row per family — errors, warnings, and what the family covers |
| health score | the drift score out of the top of the scale, and the verdict |
| recommendations | one line per rule a person acts on, then the machine-readable block |

### The number

| Rule | Meaning |
|------|---------|
| ordering is numeric, never lexicographic | `assess-10.md` follows `assess-9.md`, which a sorted listing would deny |
| the next number is one past the highest that exists | not one past the count — a deleted `assess-2.md` still yields `assess-4.md` next |
| a deleted number is never reused | that number already named a scan somebody may have quoted |
| anything that is not `assess-<digits>.md` is ignored | `.phyllum/` also holds `session.json`, `assess.json` and `PRD.md` |

### The date

The date is **injected, never read from the clock inside render code**. The
repository's determinism stance is that the same inputs produce the same bytes,
and a clock read buried in a renderer is exactly what breaks it. The seam is a
default parameter: a command that does not care passes nothing and gets today, a
test that wants fixed bytes passes a day and gets them.

### The recommendations block — the handoff to Build

The last section is written twice on purpose: once as prose a person acts on,
once as a fenced block a program parses. Both render from the same array, so
they cannot disagree.

| Decision | Why |
|----------|-----|
| a fenced block with the info string `phyllum-recommendations` | a consumer finds *this* block, not the first JSON somebody pasted into the file |
| JSON inside the fence | findings are raw CSS values, selectors and component names, and a delimited table breaks on the first one containing the delimiter |
| a schema version inside the block | the report is a document and will be reworded; the block is a contract and must not change shape silently |
| one entry per rule, not per finding | a recommendation is a piece of work, and the unit of work is a rule: "name the twelve raw blues", not twelve identical instructions |
| an entry carries id, family, rule, severity, count, action and evidence | the count and a short evidence sample keep the size of the job visible without turning a working document into a dossier |
| a rule with no action row carries `action: null` | inventing advice is how a report eventually gives a wrong one |

**This block is the handoff to the Build stage in v0.10.0.** Build reads the
recommendations of the latest report and turns them into phased work. That is
the whole reason the section is machine-readable, and the reason a report that
carries no block reads back as `null` rather than as an empty list: a clean
assessment and a report written before the block existed are different states,
and only one of them means "there is nothing to build".

The write goes through the single write funnel like every other write in the
CLI. `.phyllum/` is already inside the permission model, so the stage adds no
new write target — `assess` stays strictly read-only over the user's codebase.

---

## What this protocol must never do

- **Write to the user's codebase.** Not one file, not one byte. `assess` reads
  code; only `apply` writes it, and only through a reviewable plan on its own
  branch.
- **Let the report change anything by itself.** A report is a reading. The
  codebase changes only after the user approves, in a later stage.
- **Invent a value.** Every value in a report is a value the code contains. A
  cluster's representative is its most-used member, never an average.
- **Guess a role.** A value seen but not read is a question. Skip the question
  and the value stays unnamed — that is the correct outcome, not a failure.
- **Make hardcoded-value detection opt-in.** It is a step of this protocol. A
  flag that had to be asked for would make the default assessment incomplete.
- **Re-scan during scoring or emission.** Every number after step 1 is a count
  already produced by the family that made the findings.
- **Restate the rubric.** The weights, the bands and the verdict rules have one
  home. A second copy is a second scale waiting to disagree.
- **Reuse or renumber a report.** A number names a scan. Two scans under one
  name makes somebody's quote wrong.
- **Need a model to be useful.** The scan, the comparison, the score and the
  verdict are mechanical, and judgement layers on top of them rather than in
  place of them.
