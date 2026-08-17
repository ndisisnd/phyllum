## The confirmation

One queue entry means one question, and it is only asked when Phyllum chose the
name. A name that came from your own sentence is not put back to you for
approval. Several entries mean several questions, asked one after another — each
one settled, and written or not written, before the next is raised.

<!-- phyllum:review -->

| Action | Answer | Effect |
|--------|--------|--------|
| confirm | `y`, `yes`, `ok`, `<enter>` | accept the token under the proposed name |
| rename | any other text | accept it under the name you typed instead |
| merge | `merge <name>` | fold this value into that token; no second token is made |
| skip | `n`, `no`, `skip` | write nothing at all this run |

Merging into a name that does not exist is refused rather than guessed at.
After the name is settled there is still the acceptance gate — "write this to
DESIGN-SYSTEM.md?" — and a no there writes nothing. In a queue, a `skip` and a
no at the gate both mean the same thing and mean it locally: nothing is written
for *that* entry, and the next entry is raised as if it had never been asked.

---

## A value the system already names

If the value in your sentence is already the value of a token, `tokenise` says
which token names it and stops. It does not write a second row, and it does not
rename the one you have — that is your edit to make. Values are compared
normalised: case-folded, whitespace-stripped, `#abc` expanded to `#aabbcc`.

**A colour is compared by its channels, not by its spelling.** Any colour shape
the passes table lists is read into one canonical comparison form before it is
compared:

<!-- phyllum:value-comparison -->

| Shape | Written as | Compared as |
|-------|------------|-------------|
| hex | `#rgb`, `#rrggbb`, `#rgba`, `#rrggbbaa` | channels |
| rgb | `rgb()`, `rgba()` | channels |
| hsl | `hsl()`, `hsla()` | channels |
| other | anything else — a length, a compound, a gradient, a value Phyllum cannot read | string |

**channels** is `rgba(r,g,b,a)`: red, green and blue as integers 0–255 and alpha
as a number 0–1, which is the one spelling every colour shape above can be
written in. **string** is the normalised string described just above. So `rgba(37, 99, 235)` is the `#2563EB` the system already names, in either
direction, and a sentence carrying both spells one colour and gets one queue
entry.

Three rules keep that honest:

- **Alpha counts.** `rgba(0, 0, 0, 0.5)` and `rgba(0, 0, 0, 0.9)` are different
  facts and get different tokens. A colour that writes no alpha is fully opaque,
  so `#2563EB`, `#2563EBFF` and `rgba(37, 99, 235, 1)` are one colour.
- **No tolerance.** Two spellings either land on the same channels or they do
  not. Colours that are merely *near* each other are the clustering table's
  business (`refs/assess/detection.md`), and a tolerance here would collapse two colours a
  reader can tell apart into one name.
- **Comparison only.** The value written into `DESIGN-SYSTEM.md` is byte for
  byte what you typed, in the format you typed it. Phyllum never converts a
  value it records.

---
