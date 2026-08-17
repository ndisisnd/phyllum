## The follow-up loop (all three modes)

Once a draft exists, compute the gaps and ask **one question at a time**. Every
question carries suggestions, sourced in this priority order:

1. **Existing tokens.** "Your system already has `rounded-md` (12px) — use it?"
   Token suggestions are matched to the slot by kind: colour slots read the
   Colours table, `radius`/`padding`/`gap` read Numbers, `typography` reads
   Typography. If a token matches the slot, it **must** be the first suggestion
   — never a raw value that happens to be the same number.
2. **Codebase evidence.** Values found in the code near similar components, with
   the file they came from: "`src/styles.css` uses `border-radius: 12px` on
   `.btn`". Evidence is read-only; `create` never edits code.
3. **Labelled defaults.** The archetype default from the table above, always
   marked as a guess: "8px (a sensible default — a guess, not from your code)".

The user answers by picking a suggestion, typing any value, or saying **skip**.

- A picked token is recorded by token name.
- A typed value is recorded verbatim, and carries `# TODO: tokenise` plus a
  Backlog entry, because a raw value is debt.
- A skipped mandatory slot is recorded as `TODO` in the spec block **and** as a
  Backlog entry, so nothing blocks acceptance and nothing is silently lost.

**Anti-fabrication invariant.** Every value in a draft traces to exactly one
origin: the user's prose, the traced image, an answered follow-up, or a token
the user picked. Nothing else may appear. Never fill a slot because it "usually"
looks a certain way, never carry a value over from another component without
asking, never invent a hover colour from a base colour. A slot with no origin is
a gap or a `TODO` — those are the only two honest outcomes.

---

## Output and acceptance

Render the finished draft two ways, every time round the loop:

- **Spec view** — the token-referenced YAML definition that would go into
  `DESIGN-SYSTEM.md`.
- **Code view** — the component in the codebase's language. Detection comes from
  the project (React, Vue, Svelte, plain HTML/CSS, Tailwind vs vanilla CSS);
  v1 emits **React + CSS**, and detection failure falls back to the same.
  When the project is *not* React — Vue, Svelte, plain HTML, or nothing
  recognisable — say so beside the code view rather than letting the default
  pass for a detection. The CLI prints that line itself; match it, do not
  contradict it. Vue and Svelte emitters are v2 (plan §9).

Then the user **accepts** or **edits**:

| State | Meaning | Leaves by |
|-------|---------|-----------|
| `drafting` | gaps are being answered | last gap answered or skipped → `review` |
| `review` | spec and code rendered, waiting on the user | `accept` → `accepted`; an edit prompt → `drafting` |
| `accepted` | written to `DESIGN-SYSTEM.md` | a new `create` run starts a new draft |
| `abandoned` | the user walked away | a new `create` run starts a new draft |

Edits are prompts — "make the radius larger", "use brand blue instead" — and
loop back through render → review. **Only the `review → accepted` transition
writes anything to `DESIGN-SYSTEM.md`.** The draft is persisted in
`.phyllum/session.json` at every step so a dropped session can be picked up.

---

## The write step

On acceptance, and only then:

1. Parse the current `DESIGN-SYSTEM.md`.
2. **Update in place.** If a component with this name already exists, replace
   its blocks; do not append a second entry. Component count is unchanged on a
   re-create — that is the rerunnable guarantee.
3. Write the spec block, then the code blocks, under `### <name>` in the
   Components section.
4. **Sync the Backlog.** Every raw value gets `TODO: tokenise \`<value>\`
   (<component> <property>)`; every skipped mandatory slot gets `TODO: fill
   contract slot \`<slot>\` (<component>)`. Re-creating a component replaces
   that component's Backlog entries rather than duplicating them, and a slot
   that has since been filled drops out.
5. Render the whole file through the one renderer and write it through the one
   funnel — atomically, and to no other path.

## Spec block shape

```yaml
name: Button/Primary
archetype: button
applied: true
properties:
  background: color-primary
  radius: rounded-md
  font: highlight-small
  padding-top: 12px # TODO: tokenise
  border-colour: TODO
states:
  hover:
    background: color-primary-hover
  disabled: TODO
```

Raw values carry a `TODO: tokenise` marker and a matching Backlog entry. A
skipped slot is the literal `TODO`, and also appears in the Backlog.

`applied:` is the one line in the block **`create` never writes** (v0.5.0 §3). It
records whether the codebase is using this component right now, it is derived by
`phyllum apply` and written by `apply` alone, and it is absent until the first
`apply` run — absence means "never derived", not "false". No question asks for it,
no acceptance gate covers it, and a hand-edited value is overwritten by the next
derivation. Everything that reads a spec block reads it tolerantly: a block
without the line parses exactly as it did before v0.5.0. The contract is in
`refs/apply/plan.md`, step 3b.

## What `create` must never do

- Write any file other than `DESIGN-SYSTEM.md` (and Phyllum's own `.phyllum/`).
- Write anything at all before acceptance.
- Invent a value for a slot the user did not fill (see the invariant above).
- "Correct" a value the user gave, or reject one for being unconventional.
- Duplicate a component that already exists under the same name.
- Resolve a description to the *nearest* archetype when it matches none — that
  is what custom mode is for, and it is offered rather than assumed.
- Ask a custom component for a slot it never mentioned, or grade one against a
  contract it never claimed.
- Generate a primitive ramp for a token nobody said yes to, or a step the file
  already has.
- Alter the value a token already records in order to fit it onto a ramp.
