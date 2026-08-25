## `refine tests` — generate the usage-contract tests

The sixth gate section asks a fact: do usage-contract tests exist for the
subject, and do they pass? This mode is what makes the first half of that
answerable — it derives the contract from the component's spec block and writes
out the tests that assert it.

| Property | Value |
|----------|-------|
| mode | `refine tests` |
| implemented in | `lib/refine-tests.js` |
| reads | `DESIGN-SYSTEM.md`, the project's manifest and test configuration, and the files the component lives in |
| writes | **nothing** — the rendered test text is returned, and placing it is the user's act |
| kind | deterministic; the same spec and the same project produce the same bytes |

What a usage contract *is* — type strictness, where data may live, how a human
and an agent are each meant to call the component — is stated once, in
`refs/refine/protocol-usage-contract.md`. That file owns the clause table. This
one owns the mechanics: which runner the tests are written for, what a
generated file looks like, and what happens when the project cannot express a
clause.

---

### The harness decides the dialect, not Phyllum

A generated test is only useful if the project can run it, so the runner is
detected rather than assumed. The evidence is a configuration file or an
installed package, read the way `refine lint` reads a linter's evidence, and
the first row that matches wins.

<!-- phyllum:test-harnesses -->

| Harness | Config files | Package | Suite | Case | Assertion | Imports |
|---------|--------------|---------|-------|------|-----------|---------|
| vitest | vitest.config.js, vitest.config.ts, vitest.config.mjs, vitest.config.mts, vitest.workspace.ts | vitest | describe | it | expect | import { describe, expect, it } from 'vitest'; |
| jest | jest.config.js, jest.config.ts, jest.config.mjs, jest.config.cjs, jest.config.json | jest | describe | it | expect | — |
| node | — | — | describe | test | assert | import assert from 'node:assert/strict'; import test, { describe } from 'node:test'; |

`jest` imports nothing because its suite and case functions are globals; the em
dash is that fact, not a gap.

**The last row is the fallback, and it is a stated one.** A project whose
runner Phyllum cannot identify gets tests written for `node:test`, which ships
with Node and needs no dependency, and the result says plainly that the harness
was not detected and which dialect was used instead. A silent guess would hand
somebody a file that fails to import and no reason why.

Detecting the runner is not the same as detecting the *command*.
`detectTestSuite` in `lib/harness-detect.js` already reads what this project
runs to prove itself, and the result carries that command so a reader knows
what to run the generated file with.

---

### Rendering a clause needs a render library

Half the clauses mount the component. That needs something to mount it with,
and the same detect-or-say-so rule applies.

<!-- phyllum:test-render -->

| Library | Package | Import | Render | Query |
| --- | --- | --- | --- | --- |
| testing-library | @testing-library/react | import { render, screen } from '@testing-library/react'; | render | screen |

A project with none of these gets the **spec** clauses and nothing else, and
every rendered clause is reported as not expressible with the reason named. It
is not emitted as a stub. A test file full of empty cases would pass, and a
passing test that asserts nothing is the one output worse than no test at all.

The same is true of a component the codebase does not contain: there is nothing
to import, so the rendered clauses are dropped and say why.

---

### What a generated file looks like

One file per component, and its shape is fixed:

| Part | What it holds |
|------|---------------|
| a header comment | that Phyllum generated it, from which component's spec block, and that it is regenerated rather than hand-edited |
| the harness imports | the row above, verbatim |
| `node:fs` and `node:path` | the spec clauses read `DESIGN-SYSTEM.md` and the component's own files |
| the render imports | only when a render library was detected |
| the component import | from the file the markup scan found this component in |
| one suite | named for the component |
| one case per stated clause | in clause-table order, each named for what it asserts |

The extension follows the component's own file — a `.tsx` component gets a
`.tsx` test — and defaults to `.jsx` when a rendered clause is present, `.js`
when none is.

The proposed path sits beside the component when the scan found it, and under
`tests/` when it did not. It is a **proposal**. Phyllum computes it and never
writes to it; see `refs/refine/protocol-usage-contract.md` for why, and for who
does the placing.

---

### Do tests already exist?

The mode also answers the half of gate section 6 that generation does not: it
looks for a test file the project already carries for this component, by name,
next to the component and in the usual test directories. A component with none
is why ship criterion 5 goes unmet, and the mode says so rather than counting
the file it just generated — a file Phyllum rendered but nobody placed is not a
test this project has.

---

### What this mode must never do

- **Write a test file.** Not into the test tree, not anywhere. It renders text
  and returns it.
- **Assume a runner.** Detected, or the stated `node:test` fallback with the
  reason attached.
- **Emit an empty case.** A clause the project cannot express is reported, not
  stubbed.
- **Invent a prop, a variant or a state.** Every clause comes from the recorded
  spec, and a silent spec yields a stated silence.
- **Overwrite what somebody already wrote.** An existing test for a component
  is reported as existing; the generated text is still returned, and the choice
  between them is the user's.

---
