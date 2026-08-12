# polyglot-theme

A fixture codebase with **no stylesheet and no markup at all** (v0.2.0 plan §5.1).

The point of it is the commitment `assess` makes about reach: the values pass is
language-agnostic, so raw styling is read wherever it lives — a JSON theme file, a
Go constants file, a Kotlin object — and not only out of `.css` and `.jsx`. If the
scan were still gated on file extensions, this whole project would read as empty.

What is read, and what is not, is decided by the **property name**, because that is
the one thing that survives translation between languages. `cardRadius`,
`radii: { card }` and `border-radius` are the same fact in three syntaxes.

The counts are pinned by the clustering eval, so editing this fixture moves the
eval's expected numbers with it:

- the brand blue is `#2563EB` twice and `#2564EC` once
- the card radius is `18px` twice and `17px` once
- the spacing is `16px` twice

Three controls sit alongside them, each for its own reason:

- `timeout: 30` and `RequestTimeoutSeconds = 30` are numbers that are **not design
  decisions** — no property table gives their keys a meaning, so they are not read.
- `BrandBlue = "#2563EB"` in the Go file is **deliberately not read**. `BrandBlue`
  is a name the project chose, not a property, and Phyllum does not guess that a
  name means a colour. That is why the blue counts twice and not three times.
- This file is documentation, and documentation is not evidence. The
  `border-radius: 99px` and `#ABCDEF` written here must never turn up in a scan,
  because prose *about* a value is not a use of it.
