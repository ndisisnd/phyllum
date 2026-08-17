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
