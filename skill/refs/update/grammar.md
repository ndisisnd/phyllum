## The grammar: chain, prose, or menu (§6.2)

<!-- phyllum:update-grammar -->

| Typed | Opens | Chain | Prose |
|-------|-------|-------|-------|
| `phyllum update` | the menu | — | — |
| `phyllum update component` | the component flow, from its list | `component` | — |
| `phyllum update token` | the token flow, from its type question | `token` | — |
| `phyllum update "<prose>"` | the target read from the sentence | — | yes |
| `phyllum update component "<prose>"` | the component flow, sentence already read | `component` | yes |
| `phyllum update token "<prose>"` | the token flow, sentence already read | `token` | yes |

`component` and `token` are **reserved chain words**, the way `tokens` and
`components` are reserved under `assess`. Quote one ("token") to mean the word
itself, and it is read as prose.

The empty run opens the menu:

<!-- phyllum:update-menu -->

| Pick | Prints as | Chain | Flow |
|------|-----------|-------|------|
| `component` | a component — change a recorded component | `component` | `component` |
| `token` | a token — change a recorded token's value or name | `token` | `token` |

printed as

```
What are you updating?
  1. a component — change a recorded component
  2. a token — change a recorded token's value or name
(or just describe it — "make color-primary #1D4ED8" — or "skip")

Looking to apply the design system to your code? That is `phyllum apply`.
```

The posture is the tokenise kind picker's, exactly (`refs/tokenise/picker.md` § with
nothing to read): **numbers or words** both pick a row, **free text is honoured**
at every step and read as prose, and **skip is always available and always
writes nothing**. Row order is the printed order, and the number a user types is
the row's place in the table.

## Reading a target out of prose (§6.2)

Prose given anywhere — as the argument, or typed at any question — is read for
the thing it is about. The rule is deliberately narrow, because the never-list
forbids a guess:

| The sentence carries | Resolves |
|----------------------|----------|
| a backticked name that is exactly a recorded token or component name | that target |
| a bare word that is exactly a recorded token or component name | that target |
| exactly one recorded component name, plus any number of token names | that component — the tokens are its values, not a second target (§6.3) |
| two or more different recorded names, no single component among them | nothing — the disambiguation question, listing what it matched |
| no recorded name at all | nothing — the menu, so the run is not a dead end |

Matching is **exact on the whole name**, case-insensitively, and nothing else.
No prefixes, no substrings, no edit distance, no "did you mean". A sentence
about `color-primar` matches nothing and gets asked; it never quietly edits
`color-primary`. A component name is matched whole, slash included
(`Button/Primary`), so a sentence naming `Button/Primary` resolves and a
sentence naming `Button` does not.

One target per run. A sentence naming three tokens is three runs (§10).
