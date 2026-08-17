# `assess`

Drop into a codebase and answer one question: **how much raw, un-systematised
styling is in here, and what should the design system look like?**

```
phyllum assess
```

`assess` reads your code. It never writes it:

| Command | Reads | Writes |
|---------|-------|--------|
| `assess` | your codebase | `DESIGN-SYSTEM.md` |
| `tokenise` | the sentence you typed | `DESIGN-SYSTEM.md` |
| `create` | your intent | `DESIGN-SYSTEM.md` |

The scan is read-only in the strongest available sense: the modules that do it
contain no write call at all, and the assertion suite diffs the whole directory
around every scan and demands that not one byte changed. A tool that reads your
codebase has to earn that trust before it asks to write a single line.

The tables in this file are the contract — the skill, the CLI
(`lib/tokenise-spec.js` parses them at run time) and the assertion suite read the
same rows. Editing a table changes the behaviour and changes what the tests
expect. There is no second copy of these rules in the code.

---

## The pipeline

Five steps, and the report is the pipeline read out loud: what Phyllum can see,
what it read, what the codebase uses, the map of it, and what it suggests you do.

| Step | What happens |
|------|--------------|
| 1. detect | work out the language and framework, and pick the scanners for the stack |
| 2. scan | read the project for raw styling — read-only, never a write |
| 3. aggregate | cluster near-identical values, count usage, rank by frequency |
| 4. map | present the inventory as a table: value · where and how often used · what it means · what covers it |
| 5. suggest | propose tokens for the raw values and components for the recurring patterns |

**Steps 1–4 are mechanical.** A scan and a rendering: no model, no conversation,
nothing to accept. The whole assessment — including the mapping table with the
name Phyllum would propose already in it — works in a plain terminal with nothing
installed, which is why the report is useful before you say yes to anything.

**Step 5 is the half that talks.** Naming a value and recording a component are
decisions, so they are asked one at a time. In an interactive session (or inside
Claude Code) the tracks are walked; in a one-shot terminal command they are
previewed, with the proposals named rather than withheld. Nothing about the
report changes either way — only whether anybody is there to answer.

### The split commitment

The two halves of the scan have deliberately different reach:

- **The values pass is language-agnostic.** Colours, lengths and typography are
  read out of *any* text file, whatever the stack, so token suggestions work in a
  Go service or a Swift app as much as in a React app.
- **Component detection is React only** in v0.2.0. Recognising an ad-hoc
  component pattern means reading markup, and reading markup means committing to
  a syntax. Vue, Svelte and the rest get the values pass and an honest note
  saying the component half did not run.

---
