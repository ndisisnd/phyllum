## `govern log` — append what changed, and never take a line back

This is the Governance stage's first mode with a file behind it, and it answers
the question a design system cannot answer about itself: **how did it get to be
the way it is?** `DESIGN-SYSTEM.md` records the state. It does not record the
journey, and it never will — a file that carried both would grow a second
history beside git's and disagree with it by the second week.

So the journey lives beside it, in one file, written one line at a time:
`DESIGN-SYSTEM-CHANGELOG.md`.

| Property | Value |
|----------|-------|
| mode | `govern log` |
| implemented in | `lib/govern-log.js` |
| reads | `DESIGN-SYSTEM-CHANGELOG.md`, and the change the caller states |
| writes | `DESIGN-SYSTEM-CHANGELOG.md` only, through the one funnel, and only ever by making it longer |
| kind | deterministic derivation; the acceptance is the skill's |

---

### The invariant, stated before anything else

**The file may only grow.** That is not a description of what the mode usually
does — it is the whole contract, and it is enforced in the code rather than
promised in this file.

Every write goes through one check: the text about to be written must begin with
the exact bytes already on disk, and it must be longer than them. A write that
fails either half is refused before it reaches the funnel, whatever produced it.
So there is no bug, no re-render and no rewrite of a heading that can quietly
lose a line, because a line is never at risk of being lost by an ordinary write —
only by a call that no ordinary write makes.

Three consequences follow, and each one is a decision rather than a side effect:

- **Entries run oldest first, newest at the bottom.** A changelog that puts the
  newest entry at the top has to rewrite every byte below it on every run, which
  is the one thing this file may not do. Reading order lost the argument to
  never losing a line.
- **A removal is an entry, not an absence.** When a token or a component is
  removed from the design system, the changelog gains a line saying so. It never
  gives one back. A log that can quietly shorten is a log nobody can cite in a
  review, which is the only use it has.
- **A correction is an entry too.** An entry recorded wrongly stays, and a later
  entry says what was actually true. This is git's posture with a bad commit,
  and it is this file's for the same reason.

---

### Deletion needs permission, asked for and given

There is exactly one path that may shorten the file, and it is deliberately
awkward to reach.

| Lock | What it means |
|------|---------------|
| a grant | there is no path-only spelling of a shortening write; the caller must hold a grant object, and only `openDeletionGrant` mints one |
| a person asked | the grant carries the reason the user gave, in their words, and a grant with no reason is refused at the point it is opened |
| named, not implied | "tidy up the changelog" is not permission; the user names what comes out, and the grant is opened for that removal |
| closed afterwards | the grant is shut when the removal ends, so the door is shut between runs as well as during them |

This is the same shape `lib/write.js` already uses for the one other dangerous
door in Phyllum — the source-write grant `apply run` phases hold — and it is the
same shape for the same reason: a permission that is a boolean argument is a
permission somebody passes by accident.

**Never open a grant on your own judgement.** Not to fix a typo, not to remove a
duplicate, not to shorten a file that has grown long. A long changelog is the
design system telling the truth about how much has happened to it.

---

### What an entry says

<!-- phyllum:changelog-kinds -->

| Kind | What it names |
|------|---------------|
| `token` | one token the design system records, by its recorded name |
| `component` | one component the design system records, by its recorded name |
| `system` | the design system as a whole — a scaffold, a migration, a rename that touched everything |

<!-- phyllum:changelog-actions -->

| Action | What it records |
|--------|-----------------|
| `added` | the subject did not exist in `DESIGN-SYSTEM.md` and now does |
| `changed` | the subject existed and something recorded about it is different |
| `renamed` | the subject is the same thing under a new recorded name |
| `deprecated` | the subject is on its way out and the record names its replacement |
| `removed` | the subject is no longer recorded, and this entry is the only trace left |

The two word lists are closed, and a word outside them is refused rather than
written. The reason is the reason every closed vocabulary in Phyllum is closed:
an entry is read back later by something that has to know what it is looking at,
and a free-text verb turns the file into prose nobody can count.

**The date is local, never UTC.** `reportDate` in `lib/assess-reports.js` is
imported rather than respelled here, which imports its stated reason too: a
changelog entry dated a day behind the calendar of the person who made the
change is one they have to second-guess.

---

### The fixed lines

<!-- phyllum:changelog-copy -->

| Line | Text |
|------|------|
| `heading` | # Design system changelog |
| `preamble` | Every entry below was appended by `govern log`, oldest first. Nothing here is ever rewritten and nothing is ever removed: the file only grows. A removal is recorded as an entry saying something was removed, never as an entry going missing, because a log that can quietly lose a line is a log nobody can cite. |
| `entry-heading` | ## {date} — {kind} `{name}` {action} |
| `by-line` | Recorded by `{by}`. |
| `unchanged` | `{name}` is already the last entry in DESIGN-SYSTEM-CHANGELOG.md, so nothing was appended. |
| `unknown-action` | "{action}" is not something a changelog entry records. The words are {actions}. |
| `unknown-kind` | "{kind}" is not a subject a changelog entry names. The words are {kinds}. |
| `no-name` | A changelog entry names its subject, and there is no entry for "something changed". |
| `truncation` | Phyllum refused to shorten DESIGN-SYSTEM-CHANGELOG.md. `govern log` appends, and the write it was handed would have removed {removed} character(s) that are already on disk. |
| `no-grant` | Phyllum refused to shorten DESIGN-SYSTEM-CHANGELOG.md. Removing an entry needs permission you asked for by name, and nothing in Phyllum opens that door on its own. |
| `no-reason` | Phyllum refused to open a changelog deletion grant with no reason recorded. The reason is the permission. |
| `grant-closed` | Phyllum refused to shorten DESIGN-SYSTEM-CHANGELOG.md. That permission has already been used and closed. |
| `not-written` | Nothing has been written — Phyllum writes DESIGN-SYSTEM-CHANGELOG.md only when you accept. |

The lines live in a table for the reason every other copy table in Phyllum
exists: the skill, the CLI and the assertion suite read one source. Two of them
are read *back* as well as printed — the heading and the entry heading are what
`entries()` recognises when it parses the file again — so a line edited here
stays a line the reader recognises.

---

### Rerunnability

Running anything twice converges, and this mode is no exception. An entry
identical to the one already at the end of the file appends nothing and writes
nothing at all, and the result says which of the two happened rather than
reporting a success either way.

That is a narrower rule than "never append a duplicate", deliberately. A token
changed on Monday, changed back on Tuesday and changed again on Wednesday
produces three entries that read alike, and all three are true. Only the
immediately repeated one — the same run, run twice — is the accident.

---

### Where this mode sits

`govern log` records what changed. It does not decide that something changed, it
does not read the codebase, and it never touches `DESIGN-SYSTEM.md`. The change
is stated by whatever made it — `tokenise`, `create`, `update`, `delete`,
`refine deprecate` — and this mode writes it down.

The acceptance in between is the skill's, exactly as it is for `update` and
`delete`: the entry is shown, one question is asked, and only that branch writes.
`planAppend` derives the entry and reaches no writer at all.

---

### What this mode must never do

- **Shorten the file.** Not to reformat it, not to deduplicate it, not to fix a
  heading. Every ordinary write is checked against the bytes already on disk.
- **Remove an entry without a grant.** A grant is minted from a reason a person
  gave, and no other spelling of the call exists.
- **Open its own grant.** Permission comes from the user, by name, for a stated
  removal. A mode that can permit itself has no permission model.
- **Record an action or a kind outside the two word lists.** A free-text verb is
  prose, and the file is meant to be read back.
- **Write into `DESIGN-SYSTEM.md`.** The state is that file's; the history is
  this one's, and a stage that wrote both would be keeping two records of one
  fact.
- **Date an entry in UTC.** The reader lives in their own timezone, and
  `reportDate` already reads it.
- **Invent an entry.** A change nobody stated is a change nobody made.
- **Treat a long file as a problem.** Length is what a history looks like.
