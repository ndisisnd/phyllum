## `refine coverage` — a built component may not carry raw values

The second gate section, and the first one with anything to read. The contract
section asks whether the component was *specified*; this one asks whether the
thing that got built kept the promise the spec made.

The question is narrow on purpose: **does the built component reach its styling
through named tokens, or does it still write the values out by hand?** A design
system whose components carry `#2563EB` in the markup has a table of tokens and
a codebase that ignores it, and nothing about the table will say so.

| Property | Value |
|----------|-------|
| mode | `refine coverage` |
| implemented in | `lib/refine-coverage.js` |
| reads | the recorded components, and the files the codebase says each one lives in |
| writes | nothing — a mode returns its section and no report |
| kind | deterministic; no model, no network |

---

### What "built" means here

Only a component the codebase actually contains is graded. The evidence is the
`applied:` reading — the same `alreadyAdopted` walk `lib/applied.js` derives the
flag from, so there is one detector and no second opinion about where a
component lives.

| Reading | What coverage does |
|---------|--------------------|
| the markup scan finds the component | its files are graded, one finding per raw value in them |
| the markup scan finds nothing | the component is reported **not built**, and is neither passed nor failed |
| the component pass did not run for this stack | the whole section reports that it could not run, and says why |

A component nobody built cannot fail a check about what it was built out of.
Passing it would be worse — a criterion passed by absence is a criterion nobody
checked — so it is reported as unbuilt and left out of the verdict.

---

### What counts as a raw value

The value classes are Assess's, unchanged: this section runs the same scan
`assess` runs and filters it to the component's own files. A value class Assess
cannot read is a value class this section does not invent a reading for.

| Written as | Counted | Why |
|------------|---------|-----|
| `color: #2563EB`, `padding: 12px`, `font-size: 18px` | yes | a design decision written as a literal, on a property the tables name |
| `color: var(--interaction-primary)` | no | a reference to a token is the thing this section is asking for |
| `#2563EB` in a comment or a test string | no | prose about a colour is not a use of it — comments are stripped before the read |
| a bare `12px` with no property | no | a length with no role has no reading, and Phyllum does not guess one |

<!-- phyllum:refine-coverage-rules -->

| Rule | Severity | Detects |
|------|----------|---------|
| bypassed-token | error | a raw value in a built component that the design system **already names** — the token exists and the component went around it |
| unnamed-value | error | a raw value in a built component that no token covers — the component is styling itself |
| unreadable-value | warn | a colour or a length the scan saw on a property no table gives a meaning to, inside a built component |

The first two are one failure with two different repairs, which is why they are
two rules rather than one. `bypassed-token` has an answer already sitting in
`DESIGN-SYSTEM.md` and the finding names it. `unnamed-value` has no answer yet,
so the repair runs through `tokenise` first and the finding says so.

`unreadable-value` is a `warn` for the reason Assess's fourth bucket is a
question rather than a proposal: a value on a property nothing names might be a
design decision and might be a timeout. Phyllum will not decide which, so it
reports what it saw and stops. A `warn` does not fail the section.

---

### The verdict this section returns

A component passes coverage when its files carry **no error finding**. It is a
conjunction like every other verdict in the stage, not a proportion: nine tokens
and one hardcoded hex is a component with a hardcoded hex in it.

The section as a whole passes when every built component passes. A system with
no built components at all reports that, and passes nothing.

Two limits are stated with every result rather than left to be discovered:

- **The scan is bounded and text-based.** "No raw values seen" means none were
  seen in what was read, exactly as `assess`'s unused check means it. A value
  past the file cap or behind a computed class name is unseen, not absent.
- **Nothing is repaired.** The finding names the file, the property and the
  value, and stops there. Rewriting the component would destroy the evidence the
  grade was made from, and only `apply` writes source.

---
