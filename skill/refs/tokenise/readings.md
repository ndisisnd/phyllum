## Several values in one sentence

A sentence may carry more than one value. Nothing about *naming* changes when it
does: every recognised value becomes one entry in a **proposal queue**, and each
entry runs the protocol a single-value sentence has always run — pass detection,
the naming scales, the already-named check, collision suffixing, the four-answer
confirmation, and the acceptance gate. The intake reads further; the protocol is
untouched.

The queue is asked about one entry at a time. A wall of questions is not a batch
mode, it is a form, and a form is the thing this command exists not to be.

<!-- phyllum:queue -->

| Rule | Setting | Reading |
|------|---------|---------|
| order | `sentence` | entries are settled in the order the sentence mentions them, left to right |
| duplicates | `collapse` | two mentions of one value are one entry — the first mention keeps its place, and a name carried by a later mention fills a survivor that has none |
| questions | `one` | one entry is settled before the next is raised |
| skip | `entry` | a skip writes nothing **for that entry** and the queue moves on |
| resume | `.phyllum/session.json` | the whole queue is held in the session file, so an interrupted run picks up where it stood |

Duplicates are compared the way the already-named check compares them:
case-folded, whitespace-stripped, `#abc` expanded to `#aabbcc`, a colour by its
channels whatever format it is written in, and a length only against a length in
the same role. So "our brand blue #2563EB and rgba(37, 99, 235, 1) again" is one
entry, not two. Convergence applies *inside* a run as well as between runs.

Ordering is not decoration. The ranked colour scale counts what the system
already names, and a token accepted earlier in the same run is something the
system already names — so the first colour in the sentence ranks ahead of the
second, exactly as two separate runs would have ranked them.

### Where one typography reading ends and the next begins

Colours and lengths are self-delimiting: a colour shape is a colour shape. A
typography reading is not — it is a size, a weight and a line-height scattered
across a clause — so the sentence has to be cut into readings before it can be
read at all.

<!-- phyllum:reading-splits -->

| Splitter | Written as | Opens a reading |
|----------|------------|-----------------|
| `role-word` | — | yes |
| `comma` | `,` | yes |
| `semicolon` | `;` | yes |
| `and` | `and` | yes |
| `slash` | `/` | no |

The em dash on the first row means "not a literal": the role words are the
`typography` row of the prose table above (`heading`, `body`, `title`,
`caption`, …), so adding a role word there adds a splitter here and nowhere else.

The slash is on the table precisely because it does **not** split: `16px/1.5` is
the CSS shorthand for one reading, and a delimiter set that says nothing about it
is a delimiter set with a hole in it. Nothing else splits — a full stop, a colon
and a dash all read as part of the clause they sit in.

<!-- phyllum:binding -->

| Fragment | Binds to | Direction |
|----------|----------|-----------|
| `reading` | the nearest typography reading on its left | left |
| `name` | the nearest value on its left | left |
| `stranded` | the first reading or value on its right, when it has none on its left | right |
| `restatement` | nothing — the first statement of a slot stands | — |

**A stranded weight word binds left.** "heading 24px, semibold" is a heading that
is semibold, not a semibold `body` still to come: a clause is read left to right
and a value is stated after the thing it describes. The one exception is a
fragment with nothing at all on its left — "bold heading 24px" — which binds
right, because there is no reading behind it to belong to. A fragment that would
fill a slot the reading already states changes nothing: the first statement
stands, and `tokenise` never overwrites a value the sentence already gave.

Everything the single-reading case does still happens per reading. The CSS
initial values — weight `400`, line-height `normal` — fill each reading's own
gaps, and each reading shows its own filled-in list on its own proposal.

**Names bind left too.** "#2563EB called brand-blue and #10B981 called
success-green" names both values, because each name is nearer to its own colour
than to the other. A name written ahead of every value — "brand-blue #2563EB" —
is the stranded case and binds right, to the first value it introduces. A
sentence with three values and one name leaves the other two to the naming
scales, exactly as it does today.

---

## The eighteen optional readings, read out of a sentence (v0.7.3 phase 2)

A typography token carries twenty-one readings as of v0.7.3. Three of them are
the Typography table's own columns and are read exactly as they always were.
The other eighteen are optional, and `refs/typography.md` is the one contract
that says what they are, how each is gathered and what CSS each becomes. This
section says only how a *sentence* reaches them; it repeats none of that table.

Two rules split the work, and they follow the `Kind` column of that contract:

- **A bare reading is a sentence keyword.** "underlined", "struck through",
  "superscript", "subscript", "small caps" carry no value, so a sentence is the
  whole of what they need. They are read straight out of the clause the reading
  already owns, bound the way every other fragment is — a keyword belongs to the
  nearest typography reading on its left.
- **An enum or a value reading is asked for once.** They carry a measurement, a
  word or a string, and a sentence rarely holds them. They are gathered in **one
  follow-up question**, asked after the three core readings are settled, and a
  skipped follow-up records **nothing** — never a default.

<!-- phyllum:type-keywords -->

| Reading | Written as | Means |
|---------|------------|-------|
| `underline` | `underlined`, `underline` | — |
| `strikethrough` | `struck through`, `struck-through`, `strikethrough`, `line-through` | — |
| `superscript` | `superscript`, `superscripted` | — |
| `subscript` | `subscript`, `subscripted` | — |
| `small-caps` | `small caps`, `small-caps`, `smallcaps` | — |
| `kerning` | `kerning`, `letter spacing`, `letter-spacing`, `tracking` | — |
| `word-spacing` | `word spacing`, `word-spacing` | — |
| `text-indent` | `text indent`, `text-indent`, `indent` | — |
| `measure` | `measure`, `max width`, `max-width`, `line length` | — |
| `text-transform` | `text transform`, `text-transform`, `case` | — |
| `text-transform` | `uppercase`, `all caps` | `uppercase` |
| `text-transform` | `lowercase` | `lowercase` |
| `text-transform` | `capitalize`, `capitalise`, `title case` | `capitalize` |
| `font-variant` | `font variant`, `font-variant` | — |
| `slashed-or-lining-zero` | `slashed-or-lining-zero`, `zero style` | — |
| `slashed-or-lining-zero` | `slashed zero`, `slashed-zero` | `slashed-zero` |
| `slashed-or-lining-zero` | `lining zero`, `lining figures`, `lining-nums` | `lining-nums` |
| `font-family` | `font family`, `font-family`, `typeface`, `face` | — |
| `font-stretch` | `font stretch`, `font-stretch` | — |
| `italic-or-oblique` | `italic-or-oblique` | — |
| `italic-or-oblique` | `italic`, `italics`, `italicised`, `italicized` | `italic` |
| `italic-or-oblique` | `oblique`, `obliqued` | `oblique` |
| `font-feature-settings` | `font feature settings`, `font-feature-settings`, `feature settings` | — |
| `font-optical-sizing` | `optical sizing`, `font optical sizing`, `font-optical-sizing` | — |
| `text-rendering` | `text rendering`, `text-rendering` | — |

One row is one meaning and several spellings of it, so the table flattens into
spelling → reading, exactly as `phyllum:role-signals` and `phyllum:prop-synonyms`
already do. The `Reading` cell must name a reading `refs/typography.md` holds:
the words are this file's, the vocabulary is that one's, and a row naming
anything else is dropped and reported rather than recorded.

The `Means` cell is what a spelling says on its own. An em dash means "nothing
by itself": a bare reading needs no value at all, and a value reading takes
whatever follows its word. A cell holding a word is a spelling that **is** its
own value — "italic" names the reading and answers it in one — which is what
keeps `italic-or-oblique` a single reading rather than two.

Nothing here corrects anything. A kerning of `0.42em`, a face nobody has
installed, a feature-settings string carrying quotes and commas: the words after
the reading's own word are recorded exactly as typed, to the end of the clause.

<!-- phyllum:reading-copy -->

| Line | Text |
|------|------|
| `follow-up` | Anything else about this type? |
| `follow-up-hint` | [underlined] [kerning 0.02em] [uppercase] [face "Inter"] |
| `follow-up-example` | kerning 0.02em, uppercase, underlined |
| `follow-up-skip` | skip — record only the size, weight and line-height |
| `conflict` | Which one does this token mean? |
| `keep-both` | keep both — record them exactly as read |
| `near-duplicate` | Record it anyway, as a second token? |
| `near-duplicate-yes` | yes — the optional readings make it a different decision |
| `near-duplicate-no` | skip — write nothing for it |

### The naming scale does not read any of them

Weight picks the role and size picks the band, and that is the whole of the
typography scale (`refs/tokenise/naming.md`). **No optional reading shifts a
proposed name.** An underlined 24px bold heading is proposed the same name an
un-underlined one is, because a name says what a token is *for* and a decoration
says what it looks like. Two tokens whose names would collide are suffixed the
way they always were.

### A near-duplicate is a warning, never a refusal

A token whose size, weight and line-height all match one already recorded, but
whose optional readings differ, is a **different decision wearing the same three
numbers**. Phyllum shows both, says which readings differ, and asks. It is never
auto-refused as a duplicate and never silently written — the route every
conflict in `refs/typography.md` already takes.

### The conflict questions are asked here

`refs/typography.md` declares three ways two readings collide and settles what
each means. Two of them are questions, and this is where they are put:
`superscript` with `subscript` contradict, and `font-variant` over `small-caps`
or `slashed-or-lining-zero` overlaps. Phyllum prints the notice, asks which
reading the token means, and records the answer. Answering with a reading's own
name keeps that one **because the user said so**; keeping both records both.
Nothing is auto-resolved and nothing is dropped in silence.

---
