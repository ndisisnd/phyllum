# Running the checks

Basal has two kinds of behaviour, so it has two kinds of check (plan §8.5).

| | **Assertions** | **Evals** |
|---|---|---|
| What they cover | Deterministic mechanics — files written, output text, parsing round-trips | Model-driven behaviour — understanding prose, asking good follow-ups |
| How they are graded | Pass / fail | Scored against a rubric, each with a threshold |
| Model involved | No | Yes |
| Bar | **100%, always** | Every score at or above its recorded threshold |

Nothing here fakes a model call. An eval without a runner is simply not run, and
says so.

## Assertions — run these now

```
node --test "evals/assertions/**/*.test.js"
```

or, equivalently:

```
pnpm test
```

No test framework is installed: the suite is `node:test` from the standard
library, so there is nothing to install before running it. Node 20 or newer.

Every test that writes anything works inside a throwaway temp directory. The
repository is never a test subject — `init` in particular is only ever run
against a sandbox.

### What is covered today (M1)

| File | Covers |
|------|--------|
| `evals/assertions/menu.test.js` | Every subskill listed exactly once, aliases included |
| `evals/assertions/help.test.js` | The 2–3 line overview, word-order byte-equality, the reserved `help` word, unknown commands |
| `evals/assertions/system.test.js` | Fixture round-trip counts, zero writes, the three scopes, `all` ≡ bare, unrecognised scopes |
| `evals/assertions/init.test.js` | Template scaffold, skill install, `.gitignore` line, rerun repair with no content lost |
| `evals/assertions/design-system.test.js` | Template integrity, the fencing rule, parse → render → parse as a fixed point |
| `evals/assertions/permissions.test.js` | The permission model, the static grep for writes outside the funnel, atomic writes under fault injection |
| `evals/assertions/cli.test.js` | Interactive and pre-init behaviour, alias equivalence, the registered-but-unbuilt commands |
| `evals/assertions/session.test.js` | The interactive loop, including quoting |
| `evals/assertions/package-layout.test.js` | The §7.2 layout, the skill's permission rule, and the honesty of the eval assets |

## Evals — pinned, not yet runnable

The runner lands in **M2**, alongside the first model-driven feature (`create`,
prose mode). Until then this directory holds the inputs, so that when the runner
arrives it grades against a target fixed before the code existed:

- `evals/rubrics/` — one rubric per eval, each with its scoring method and pass
  threshold.
- `evals/prompts/` — the pinned prompts and expected answers.
- `evals/fixtures/` — sample codebases (`react-css`, `tailwind`, `plain-html`)
  and reference `DESIGN-SYSTEM.md` files.

M1's two eval rubrics are `init-detection` (does step 1 report the framework and
existing artefacts correctly?) and `help-accuracy` (do the per-command
explanations still match the plan?).

When the runner lands it will write each eval's score to a committed baseline
file, so "never quietly worse" is checkable rather than remembered. Thresholds
may be raised over time, never silently lowered — a lowered threshold needs an
explicit note in the change explaining why.

## The definition of done

1. Every feature ships its assertions and evals in the same change.
2. A change passes only if its new checks *and* every prior check are green.
3. No green, no merge. A feature that has not passed the gate does not exist for
   release purposes; there is no waiver path in v1.
