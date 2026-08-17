## Acceptance — what gets written, and where

On acceptance, and only then:

1. The accepted token is appended to **its own** token subsection, in the
   column order that section's table declares:

   | Section | Columns |
   |---------|---------|
   | Colours | token, value |
   | Numbers | token, value, applies to |
   | Typography | token, size, weight, line-height |

   Colours is `token | value` as of v0.3.0 (§5.5). It used to carry a third
   `notes` cell recording the sentence you typed — provenance, which is history
   rather than design system, so it went. A file written before that keeps the
   column it has: the renderer writes back the shape it found, and `init` offers
   the one-time removal rather than taking it.

   The `applies to` cell records the role — `corner radius`, `spacing`,
   `border width` — which is what lets a later run tell a radius from a padding.

   Colours has one subsection, `Primitives`, holding the ramps
   `create primitives` writes (`refs/create/primitives.md`). `tokenise` never writes into
   it: a named value is a semantic token and goes in the Colours table itself.
2. **Backlog reconciliation.** When an accepted token's value matches a
   `TODO: tokenise \`<value>\` (<Component> <property>)` entry, the referencing
   component's spec block is updated — the raw value becomes the token name and
   the `# TODO: tokenise` marker goes — and that Backlog entry is removed.

   Two guards keep that from being over-eager. The property has to be one the
   token's role is about, per the role table above: a `rounded-md` never pays off
   a `padding-top` that happens to be `12px`. And only lines still carrying the
   `# TODO: tokenise` marker are rewritten, so a slot that already names a token
   is left exactly as the user left it.

   Everything else in the Backlog stays. A skipped contract slot is a different
   debt and stays until the slot is filled.
3. The whole file is rendered through the one renderer and written through the
   one funnel — atomically, and to no other path. One accepted token is one
   write; a queue of five acceptances is five writes through that same funnel,
   and `DESIGN-SYSTEM.md.bak` is taken **once, before the first write of the
   run**, so the undo it holds is the file as it stood before the whole
   sentence, not before its last value.

Nothing is written before acceptance. The queue — every entry, settled or still
pending — lives in `.phyllum/session.json`, Phyllum's own state, gitignored,
until then. That is also what makes a queue resumable: a run cut short leaves
its pending entries recorded, and the next `tokenise` with nothing to read
offers to pick them up.

---
