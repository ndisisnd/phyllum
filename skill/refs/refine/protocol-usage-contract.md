## `protocol-usage-contract` — what correct use of a component looks like

A component's spec block says what it is made of. It does not say how it is
meant to be **called**, and that is the gap this file closes.

A **usage contract** is the answer to one question: *if somebody — a person or
an agent — reaches for this component tomorrow, what counts as using it
correctly?* It has three parts, and every clause below belongs to exactly one
of them.

| Part | The question it answers |
|------|-------------------------|
| type strictness | what may a prop be given — a closed set of recorded words, or anything at all? |
| where data may live | which values belong to the design system, and which belong to the caller? |
| how it is called | what does a human write, what may an agent write, and what is neither allowed to invent? |

The contract is **derived, never authored**. Its source is the component's spec
block in `DESIGN-SYSTEM.md` — the `name:`, the `archetype:`, the `properties:`
slots, the `states:`, the variant word after the `/`, and the `applied:` line
that says where the component lives — read together with the archetype contract
in `refs/create/archetypes.md`. Nothing here adds a fact the spec does not
already carry.

That is also why the contract can be *incomplete*. **Where the spec is silent,
the contract says so.** A slot recorded `TODO` has no clause, a component with
no archetype has no archetype-derived clauses, and a component nothing in the
codebase spells has no file-reading clause. Each of those is reported as
unstated with its reason, which is the stage's standing rule: a criterion
passed by absence is a criterion nobody checked.

---

### 1. Type strictness — a prop is a closed set, not a free string

The design system records a finite vocabulary: these variants, these slots,
these states. A component that accepts anything in those positions has a
vocabulary in the file and no vocabulary in the code, and the two drift without
anybody seeing it happen.

| Rule | Why it is a rule |
|------|------------------|
| a variant prop accepts only the variants recorded for this component | `Button/Primary` and `Button/Ghost` are the button's variants; `Button/Loud` is not one, and honouring it makes the recorded list advisory |
| a state prop is a boolean, and its absence means off | the archetype's States column is a list of switches, not of values — a state that takes a string is a slot wearing a state's name |
| a contracted slot resolves to a token the design system records | a slot holding `#2563EB` is a slot the design system does not actually own |

### 2. Where data may live — styling is the system's, content is the caller's

This is the part a design system exists for, stated as a testable rule rather
than as an aspiration.

| Rule | Why it is a rule |
|------|------------------|
| a styling value handed in at the call site does not reach a contracted slot | a component that lets its caller pass `style={{ background: '#FF0000' }}` through to a contracted slot has handed the decision back to the call site |
| the component's own files carry no literal for a property a contracted slot names | this is `refine coverage`'s finding, asserted from inside the test suite so the project keeps it after Phyllum stops looking |
| the content the caller passes is the content that renders | content is the one thing that legitimately comes from outside, and a component that swallows or rewrites it is not a container |

### 3. How it is called — by a human, and by an agent

A human and an agent get the contract wrong in different ways, so the clauses
are different.

| Caller | What correct use means |
|--------|------------------------|
| a human | imports the component under the name the design system records, and the documented minimal call renders with no prop beyond its content |
| an agent | reads the spec block, sets only the props the spec records, and treats `DESIGN-SYSTEM.md` as the single place the contract is written down |

The agent clauses are the stricter pair on purpose. A person who invents a prop
usually notices; an agent that invents one will invent it consistently, in
every file it touches, and the result reads like a convention.

---

### The clauses, and how a test asserts each one

<!-- phyllum:usage-clauses -->

| Clause | Family | Kind | Asserts | Stated when |
|--------|--------|------|---------|-------------|
| variant-closed | type | rendered | a recorded variant is honoured and an invented one is not | the component's name carries a variant after the `/` |
| state-boolean | type | rendered | each mandatory state is reachable as a bare boolean prop, and changes what renders | the recorded archetype makes a state mandatory and the spec does not still record it as TODO |
| slot-token-valued | type | spec | each contracted slot resolves to a token name the design system's own tables record | at least one slot is recorded with a value that is not TODO |
| styling-not-passed-in | data | rendered | a styling value given at the call site does not reach the rendered output | the recorded archetype has mandatory slots |
| styling-in-the-system | data | spec | the component's own files carry no colour written as a literal | the codebase spells this component somewhere |
| content-from-the-caller | data | rendered | the content the caller passes is the content that renders | the archetype's preview element can hold content |
| human-call-by-name | usage | spec | the component is exported under the name the spec records | the codebase carries a module that could export it |
| human-minimal-call | usage | rendered | the documented minimal call renders with no prop beyond its content | the component can be imported from a file the scan found |
| agent-props-are-closed | usage | rendered | a prop the spec does not record is not honoured | the recorded archetype has mandatory slots |
| agent-reads-one-source | usage | spec | the spec block is in `DESIGN-SYSTEM.md`, with the archetype the contract is read from | the component records an archetype |

Two kinds, and the difference decides whether a clause can be tested at all:

- A **spec** clause reads files — `DESIGN-SYSTEM.md`, or the component's own
  source. It needs no runner beyond the project's own, and it is always
  emitted.
- A **rendered** clause mounts the component. It needs a render library, and
  when the project has none it is **not emitted and is reported as not
  expressible**, with the reason named. It is never emitted as an empty test,
  because a test that asserts nothing is worse than a test nobody wrote.

---

### The write target — Phyllum hands the text over, it does not place it

`SKILL.md` opens with the hard rule, and generated tests do not bend it.
Phyllum writes `DESIGN-SYSTEM.md` plus its own enumerated paths, and a test
file inside the user's test tree is neither.

| Step | Who does it |
|------|-------------|
| deriving the contract from the spec | `lib/refine-tests.js`, mechanically |
| rendering the test file's text | `lib/refine-tests.js`, mechanically |
| computing the path the file *would* sit at | `lib/refine-tests.js` — a proposal, not a destination |
| putting the file in the test tree | the user, or the agent working on their behalf |

`lib/refine-tests.js` contains no write call. It returns
`{ path, contents }` per component and stops there, exactly as `refine lint`
returns what a linter said without touching what the linter read. If a run ever
needs the text on disk before the user has decided, it goes under `.phyllum/`
through `lib/write.js` — the target Phyllum already had — and never into the
project's own tests.

The reason is the reason the whole stage is read-only. A gate that quietly
added files to the codebase it was grading would be grading its own output on
the next run.

---

### What a usage contract must never do

- **Invent a clause the spec does not support.** A slot recorded `TODO` gets no
  test; it gets a stated silence.
- **Guess a variant, a state or a slot.** The vocabulary is the recorded one.
- **Emit a test that asserts nothing.** A clause that cannot be expressed in
  this project is reported as not expressible, with its reason.
- **Write into the user's test tree.** Phyllum renders the text; placing it is
  somebody else's act.
- **Grade a `custom` component against an archetype.** A custom claims no
  contract, so it gets the name and source clauses and no archetype ones —
  the same rule `refine naming` follows.
- **Restate the clause table in code.** The table above is the contract;
  `lib/refine-spec.js` reads it, and the code holds only how each clause is
  spelled in a given runner.

---
