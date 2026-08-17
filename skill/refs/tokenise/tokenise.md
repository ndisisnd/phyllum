# `tokenise` (alias: `tokenize`)

Turn **a sentence** into named tokens. One value, one name, one row in
`DESIGN-SYSTEM.md` — and a sentence may carry several values, each of which gets
its own turn through the same protocol:

```
phyllum tokenise "our brand blue #2563EB"
phyllum tokenise "our overlay rgba(0, 0, 0, 0.5)"
phyllum tokenise "hero backdrop linear-gradient(135deg, #2563EB, #10B981)"
phyllum tokenise "16px spacing called space-md"
phyllum tokenise "heading 24px bold 1.2"
phyllum tokenise "#2563EB #10B981 #F59E0B"
phyllum tokenise "heading 24px bold 1.2, body 16px regular 1.5"
```

`tokenise` reads prose. It does **not** read the codebase — as of v0.2.0 that is
`assess`'s job. The division is clean:

| Command | Reads | Writes |
|---------|-------|--------|
| `assess` | your codebase | `DESIGN-SYSTEM.md` |
| `tokenise` | the sentence you typed | `DESIGN-SYSTEM.md` |
| `create` | your intent | `DESIGN-SYSTEM.md` |

Only accepted tokens are written, and only into `DESIGN-SYSTEM.md`.

The tables in this file are the contract — for the skill, for the CLI
(`lib/tokenise-spec.js` parses them at run time) and for the assertion suite
alike. Editing a table here changes behaviour and changes what the tests expect.
There is no second copy of these rules in the code.

---

## The codebase-scanning contract lives with `assess`

`tokenise` used to carry the scanning tables too — which files are read, how
Tailwind arbitrary values map to properties, how near two values have to be
before they cluster. They describe reading a codebase, which is `assess`'s job
as of v0.2.0, so they moved with the behaviour: they now live in
`refs/assess/scan.md`, unchanged in meaning.

What stayed here is what a *name* is made of — the passes, the role table, the
colour scale, the ladders, the typography bands — because a name means the same
thing whether the value came out of a sentence or out of the code. One set of
scales, two ways in.

---

## What `tokenise` must never do

- **Read the codebase.** Not one file. A sentence is the whole input; scanning
  is `assess`, and writing to code is `apply`.
- **Rewrite the codebase to use the tokens it names.** The values in the code
  stay exactly as they are.
- Write any file other than `DESIGN-SYSTEM.md` (and Phyllum's own `.phyllum/`).
- Write anything at all before acceptance.
- Invent a value. A sentence with no value gets a question, never a guess.
- Record a value the system has already named, or name one value twice.
- Change a token the user already has. `tokenise` adds; renaming an existing
  token is the user's edit to make.
- Dead-end. Every incomplete sentence has a next question.
