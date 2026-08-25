## `refine lint` — what the project's own linters say

The fifth gate section, and the only one that delegates. Phyllum has no lint
rules of its own here and does not want any: a project that installed ESLint has
already written down what it considers wrong, and a second opinion from a design
system companion would be a second answer to a settled question.

| Property | Value |
|----------|-------|
| mode | `refine lint` |
| implemented in | `lib/refine-lint.js` |
| reads | the project's linter configuration and its manifest |
| runs | the linters it found, in check mode, through `lib/run-command.js` |
| writes | nothing — and the linters it starts write nothing either |
| kind | deterministic; the answer is an exit code |

---

### Report mode, or not at all

The stage rule is stated in `refs/refine/protocol-refine.md` §6 and this section
is where it bites: **a tool that would fix what it found is run in report mode
or not at all.**

So the check command is a column in the table below rather than a string in the
code, and the argument list Phyllum builds is refused before it is spawned if a
fix flag appears anywhere in it. That refusal is a programming error in Phyllum,
not a condition a user can reach — which is exactly why it is checked at the one
place the arguments are assembled.

The same rule is why the project's own `lint` script is **not** what gets run. A
`"lint": "eslint . --fix"` in somebody's `package.json` is a perfectly ordinary
script and running it would rewrite the code Refine is grading. The linters are
detected from their configuration and their installed package instead, and the
command is the check-mode one Phyllum wrote down.

---

### What is detected, and how

A linter counts as configured when the project carries its configuration file,
or names it as a manifest key, or has the package installed. Any one of the
three is enough — a flat config file with the package not yet installed is still
a statement about what this project lints with.

<!-- phyllum:refine-linters -->

| Linter | Config files | Manifest key | Package | Check command |
|--------|--------------|--------------|---------|---------------|
| eslint | eslint.config.js, eslint.config.mjs, eslint.config.cjs, eslint.config.ts, .eslintrc, .eslintrc.js, .eslintrc.cjs, .eslintrc.json, .eslintrc.yml, .eslintrc.yaml | eslintConfig | eslint | `eslint .` |
| stylelint | stylelint.config.js, stylelint.config.cjs, stylelint.config.mjs, .stylelintrc, .stylelintrc.js, .stylelintrc.cjs, .stylelintrc.json, .stylelintrc.yml, .stylelintrc.yaml | stylelint | stylelint | `stylelint **/*.{css,scss,sass,less}` |
| prettier | .prettierrc, .prettierrc.json, .prettierrc.yml, .prettierrc.yaml, .prettierrc.js, .prettierrc.cjs, .prettierrc.mjs, prettier.config.js, prettier.config.cjs, prettier.config.mjs | prettier | prettier | `prettier --check .` |
| biome | biome.json, biome.jsonc | — | @biomejs/biome | `biome check .` |

Each one is started through the project's own package runner — `npm exec`, or
`pnpm`, `yarn` or `bun` when the lockfile says so — because that is how a
project's locally installed linter is reached, and because the runner is on the
`lib/run-command.js` allowlist while a linter binary is not.

---

### The four answers a linter can give

| Answer | Reported as | Counts as a failure |
|--------|-------------|---------------------|
| configured, ran, exit 0 | pass, with the run's own summary line | no |
| configured, ran, non-zero exit | fail, with the tail of what it printed | yes |
| configured, could not be started | could not run, with the reason — a missing runner, a timeout | yes, and the reason is named |
| not configured | **not configured** | no |

The fourth row is the one worth stating twice. **An absent linter is not a
failing linter.** A project that lints nothing has not failed a lint check; it
has no lint check to fail, and reporting that as a failure would grade a choice
somebody made rather than the component in front of it.

It is also not silence. A section that could not run says so and says why — the
one answer a gate may not give is nothing at all — so a system with no linter
installed reads "no linter is configured in this project", and the ship
criterion that depends on it reads the same way rather than passing by absence.

---

### Scope

`refine lint` grades the subject it was pointed at. Given one component, the
files that component lives in are the arguments the linter is handed, filtered
to the extensions that linter reads — a stylesheet linter is not handed a `.tsx`
file. Given no subject, the linter's own default target is used, which is the
project as its configuration already defines it.

A linter with nothing left to lint after the filter is reported as not
applicable to that subject, which is a different sentence from both "passed" and
"not configured", and is meant to be.

---
