## Severity — frequency decides, you dispose

Every uncovered value is a finding, and not every finding is the same size. A
colour written forty times is systematic drift; the same colour written once is
probably somebody's deliberate exception. Reporting both as "add a token" is how
a tool earns the habit of being ignored.

So each finding carries a severity, and the only input is how often the value is
used across the whole codebase.

<!-- phyllum:severity -->

| Severity | Used | Means |
|----------|------|-------|
| error | >= 3 | systematic drift — proposed as a token, and accepted by `assess update` |
| warn | <= 2 | looks like a deliberate exception — reported and counted, never accepted on your behalf |

One threshold for every value family, tested in order, first match wins. It is
one number on purpose: a per-family threshold is four more numbers to explain
and four more ways for two runs to disagree about the same codebase.

Severity is assigned **at aggregation**, once the clusters are counted — never by
a scanner. A scanner's job is to report what it saw; how much a sighting matters
is a question about the whole codebase, and it cannot be answered one file at a
time.

What the two severities change:

| | `error` | `warn` |
|---|---|---|
| in the report | counted and listed | counted and listed |
| in the review | asked, most-used first | asked, most-used first — you may promote it by hand |
| in `assess update` | accepted under the proposed name | **skipped**, and the report says so |

The interactive review treats both alike, because a rare value can still be
worth a token and only you know that. The fast-forward does not, because
accepting an exception nobody asked about is exactly the write `assess update`
promises never to make.

### Which rule a finding belongs to

The severity says how much; the rule says what kind. Rules are named so a report
can group by family and a later run can say "the shadows are fixed, the spacing
is not". Rows are tested in order, and a role of `—` matches any role.

<!-- phyllum:lint-rules -->

| Rule | Pass | Role | Detects |
|------|------|------|---------|
| raw-colour | colours | — | a hex, `rgb()` or `hsl()` literal no colour token names |
| raw-spacing | numbers | spacing | a padding, margin or gap length off the token scale |
| raw-radius | numbers | radius | a corner radius off the radius scale |
| raw-border | numbers | border | a border or outline width off the scale |
| raw-border | borders | — | a border shorthand — width, style and colour written out together |
| raw-shadow | shadows | — | a `box-shadow`, `text-shadow` or elevation literal |
| raw-typography | typography | — | a font size, weight and line-height written out together |

`raw-radius` is the one that used to have no name of its own: a corner radius was
read, clustered and named correctly, but the report called it a number like any
other. Splitting it out changes no behaviour and one thing about the reading — a
radius problem is now findable in the report by the word a designer would use.

A value the scan could see but **not** read has no rule. It still carries a
severity, because how often it is written is a fact; but naming its family would
mean guessing which family it is in, and that is the one thing the fourth bucket
exists not to do.

---
