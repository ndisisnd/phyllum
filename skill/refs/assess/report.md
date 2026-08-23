## The findings, the score and the verdict (§7)

Every family counts its findings the same way, so the report can lay them side
by side: severity, the finding, the evidence behind it, and the one thing to do
about it. The suggested action is a row here rather than a sentence in the
renderer, because it is the part of a finding a reader acts on, and it should be
editable without touching code.

<!-- phyllum:actions -->

| Rule | Suggested action |
|------|------------------|
| raw-colour | name it as a colour token, then let `apply` replace the literals |
| raw-spacing | name it on the spacing scale, or move it onto a rung you already have |
| raw-radius | name it as a radius token, or reuse the nearest one |
| raw-border | name the border as a token, or reuse the border you already named |
| raw-shadow | name the elevation as a shadow token — a shadow written out twice is two elevations |
| raw-typography | record it on a type token — the size, weight and line-height together, and the kerning, case, face or decoration written beside them |
| unread | tell Phyllum what it applies to, and it becomes a token like any other |
| framework-collision | decide which framework owns the components, and finish the migration |
| styling-collision | pick the system the tokens live in; the others read from it |
| theme-source-collision | make one file the source of truth and generate the rest |
| unused-token | keep it or remove it — nothing is removed for you |
| unused-component | keep it or remove it — nothing is removed for you |
| component-clone | merge them, keeping the more-used one |
| style-duplicate | keep one block and reference it from the other |
| utility-overlap | extract the bundle as a component, if it is one |
| naming-drift | rename it to the predictable form |
| naming-convention | spell it in the convention the rest of the codebase uses |
| prop-synonym | pick one spelling and use it everywhere |
| prop-type-conflict | decide which value type the prop takes, and say so in the spec |
| prop-style-bypass | use the variant instead of the inline style |
| near-duplicate-colour | keep one of them and point the other at it |
| dark-mode-gap | give it a dark value, or say plainly that it has none |
| token-alias-duplicate | keep one name and merge the other into it |
| off-scale-spacing | move it onto the nearest rung of the scale |
| z-index-sprawl | name the layers as tokens and stop counting upwards |
| hardcoded-breakpoint | name the breakpoint and use it everywhere |

### The drift score

One number for the whole assessment, on a **seven-step Fibonacci scale — 1, 2,
3, 5, 8, 13, 21**. Lower is better: 1 is essentially systematised, 21 is
untamed. Fibonacci on purpose, because drift does not grow evenly and a 0–100
score implies a precision no scan has. The widening gaps are the honest part —
the difference between a 3 and a 5 is a morning's work, and the difference
between a 13 and a 21 is a decision about the project.

The score is built in two steps. Every finding is worth points by family and
severity, the points are summed into one **drift mass**, and the mass falls
into a step. The verdict is a third reading, taken from severities alone.

### Where the three tables live

**`phyllum:score-weights`, `phyllum:score-steps` and `phyllum:verdicts` are
marked in `refs/assess/protocol-assess-rubric.md`, and nowhere else.** That file
is the protocol that owns the score, so the rows the CLI parses sit beside the
reasoning that explains them.

This file carried the marked copy until v0.9.0, while the rubric restated the
same rows in prose. Two copies of one scale is how two answers to one question
start — `lib/refs.js` refuses a marker that appears in two files for exactly
that reason — so the markers moved to the rubric and the second copy was deleted
rather than kept in step by hand. Read the weights, the steps and the verdict
band there; what stays here is what the *report* does with them.

The verdict is derived from **severities and never from the score**, and the two
answer different questions on purpose. The verdict says whether anything here is
systematic drift; the score says how much of it there is. A codebase can fail
with a score of 2 (one value written three times, and nothing else) and pass
with warnings at 8 (a hundred deliberate exceptions). `clean` in the summary is
exactly `verdict === 'pass'`, so one word cannot disagree with the other.

Both are deterministic: same codebase, same `DESIGN-SYSTEM.md`, same score and
same verdict. That is what makes a rerun after a fix meaningful — the number
moves down the scale, or the work did not land.

---
