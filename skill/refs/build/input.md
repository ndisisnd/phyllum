# Resolving Build's input

`refs/build/build.md` §2 states the rule. This file is the protocol that
follows from it: how a Build run works out what it is building, in what order
the sources are consulted, and what it says to the user for each answer.

Load this file when a Build command starts with no obvious subject — bare
`phyllum create` — or when a user asks what the last assessment recommends.
A run that already carries a description or an image needs none of it.

## The order of resolution

Exactly three sources, consulted in this order, first hit wins:

1. **Prose.** A quoted description the user typed. It ends the resolution
   immediately, and no report is opened.
2. **An image.** A path handed to `create`. Also an input, also final, and
   traced exactly as `refs/create/image.md` describes.
3. **The latest drift report.** `.phyllum/assess-[n].md` with the highest
   number, and its `phyllum-recommendations` block — the one written by Assess
   and specified in `refs/assess/protocol-assess.md` §5.

The mechanics live in `lib/build-input.js`, which is deterministic and
model-free: a directory listing, a file read and a JSON parse. Never re-derive
the answer by reading the report yourself, and never ask a model to summarise
a block that already parses.

## What prose overriding actually means

**A sentence the user typed is a decision, and a decision is never overridden
by a file.** The report is the input when there is no other input — never a
filter laid over one.

There is no mode in which recommendations narrow, reorder or veto what a typed
description asks for. Do not open a report to "check" a prose run against it,
and do not tell a user their description conflicts with the last assessment.
It cannot: the two were never in the same conversation.

Prose and images stay entry points into the stage, unchanged. Every mode
`create` has ever had — prose, image, pick, custom, primitives — is still a way
in, and the report default is a door added beside them, not one they pass
through. `refs/create/pick.md` still governs the picker itself.

## The five ways there is no report input

Each is a different sentence to the user, and collapsing them into one misleads
somebody:

| Answer | What is on disk | What to say |
|--------|-----------------|-------------|
| no reports | no `assess-[n].md` at all | say nothing about drift, and offer the picker exactly as before |
| unreadable | listed, but it will not open | name the report and say none of it was used |
| no block | a report with no `phyllum-recommendations` fence | it predates the block; offer to re-run `phyllum assess` |
| empty | a block that parsed and recommends nothing | the last assessment found no drift to answer — this is a result, not a gap |
| unparseable | a block that is present and broken | quote the parse error, name the report, and fall back |

**Never proceed as though a clean report had been read.** A broken block throws
in `lib/assess-reports.js` on purpose; the message is surfaced and the run
continues with the flow it would have run with no report at all.

## How it is surfaced

Recommendations are shown **above** the picker, attributed to the report they
came from ("From your latest drift report — assess-3, 2026-08-24"), and the
picker's own numbering is untouched. A recommendation is a piece of work — name
twelve raw blues — not a component to seed a draft from, so it is never given a
number beside the archetypes. Work that names a value is `tokenise`'s
(`refs/tokenise/tokenise.md`); work that builds a component is `create`'s.

## What this phase does not do

v0.10.0 phase 2 resolves the input and shows it. It writes no build report — a
numbered `build-report-[n].md` is phase 3 — and it holds nothing behind an
approval gate beyond the acceptance gates each command already carries. Do not
tell a user a build report is waiting for them, and see the phase table in
`refs/build/build.md` §4 before claiming any part of this stage works.

---
