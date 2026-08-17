## Pick rules (Mode C)

With no input, present a picker in three parts:

1. **Archetypes** — every row of the contract table above, in table order.
2. **Found in your codebase** — recurring element/class patterns that are not in
   `DESIGN-SYSTEM.md` yet, most-used first, each with its count and a file it
   was seen in.
3. **Custom** — last on the list, always: a component that follows no archetype
   contract at all (below).

Selecting an archetype or a candidate seeds a draft — archetype, and a name — and
drops into the same follow-up loop as the other two modes. Selecting custom seeds
nothing but the name it asks for, and drops into the open loop instead. **A candidate seeds a name and an
archetype, never values.** The values found around it are offered as codebase
evidence in the follow-up loop, where the user can accept or refuse them one at
a time.

### Candidate detection

The scan is read-only and looks at markup: JSX and HTML elements, their class
lists, and custom component names. A signature is one element plus its classes
(`button.btn.btn--primary`); a signature seen at least **Minimum** times is a
candidate. A row's archetype of `—` means "resolve the matched word through the
archetype aliases" — a `Chip` is a Badge, a `Dialog` is a Modal.

<!-- phyllum:candidates -->

| Signal | Matches | Archetype | Minimum |
|--------|---------|-----------|---------|
| element | `button` | Button | 2 |
| element | `input`, `textarea` | Input | 2 |
| element | `select` | Select | 2 |
| element | `progress` | Progress | 2 |
| element | `dialog` | Modal | 2 |
| class | `btn`, `button`, `cta`, `action` | Button | 2 |
| class | `input`, `field`, `textbox` | Input | 2 |
| class | `card`, `tile`, `panel` | Card | 2 |
| class | `badge`, `chip`, `pill`, `tag` | Badge | 2 |
| class | `modal`, `dialog`, `sheet`, `drawer` | Modal | 2 |
| class | `toggle`, `switch` | Toggle | 2 |
| class | `checkbox` | Checkbox | 2 |
| class | `radio` | Radio | 2 |
| class | `select`, `dropdown`, `combobox` | Select | 2 |
| class | `tooltip` | Tooltip | 2 |
| class | `toast`, `snackbar`, `notification`, `alert` | Toast | 2 |
| class | `tabs`, `tab`, `segmented` | Tabs | 2 |
| class | `link` | Link | 2 |
| class | `avatar` | Avatar | 2 |
| class | `progress`, `spinner`, `loader` | Progress | 2 |
| component | `button`, `input`, `card`, `badge`, `chip`, `modal`, `dialog`, `toggle`, `switch`, `checkbox`, `radio`, `select`, `dropdown`, `tooltip`, `toast`, `snackbar`, `tabs`, `tab`, `avatar`, `spinner` | — | 2 |

A few words the aliases know are deliberately **not** signals, because in real
markup they mean something else far more often than they mean a component:

- `<a>` and `<link>` as elements — one is every hyperlink on the page and the
  other is a stylesheet tag, so Link is found by class or by component name only.
- `Link` as a component name — in most React projects that is the router's,
  not the design system's.
- `banner` as a class — it is usually a page landmark or a hero, so Toast is
  matched on `toast`, `snackbar`, `notification` and `alert` instead.

**The dashboard's queue comes first.** An image dropped on the GUI enqueues a
`create-image` entry (see `refs/gui/server.md`). A bare `create` takes the oldest
pending one, removes it from the queue, and runs image mode on that file instead
of showing the picker — the drop *was* the pick.

**Already in the system drops out.** A signature whose class or component name
matches a component already in `DESIGN-SYSTEM.md` (by name or by the class name
Phyllum would generate for it) is not a candidate — it is a component, and
`create` on it opens a revision instead.

---
