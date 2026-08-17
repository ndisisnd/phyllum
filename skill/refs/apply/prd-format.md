## The PRD format — the contract `apply run` parses

The file is Markdown a human reads and a machine parses. Every marker below
exists because step two has to find it again.

### Sections, in order

| Section | Holds |
|---------|-------|
| `# Phyllum apply — PRD` | the title, then a one-line warning that nothing has been executed |
| header block | `- <Field>: <value>` lines (below) |
| `## Goal` | what applying the design system means for this codebase, in prose |
| `## Harness` | which harness was detected, from which evidence, or that none was |
| `## Execution guarantees` | the five guarantees, restated in the plan itself |
| `## Phases` | one `### Phase n — <title>` per phase |
| `## Out of scope` | four reasoned exclusion lists, plus what is always excluded |
| `## Notes` | **the user's section.** Phyllum seeds it once and never rewrites it |

### Header fields

| Field | Meaning |
|-------|---------|
| `Design system` | always `DESIGN-SYSTEM.md` |
| `Harness` | the detected harness's name, or `none detected` |
| `Harness config` | the config file that identified it, or `—` |
| `Harness evidence` | which layer of the precedence answered, in words |
| `Host test suite` | the detected command and the evidence for it, or `none detected` |
| `Generated` · `Phyllum version` | when, and by which version |
| `Changes` · `Phases` | the counts, so a diff of the file is readable |
| `Status` | `not started` · `in progress` · `complete` |

### Markers

| Marker | Written by | Shape |
|--------|-----------|-------|
| phase heading | `apply` | `### Phase 3 — Number tokens` |
| phase status | `apply`, ticked by `apply run` | `- [ ] Phase 3 complete` |
| criterion | `apply`, ticked by `apply run` | `- [ ] **AC-3.1** · file: … · literal: … · becomes: … · check: …` |
| commit record | `apply run` | `- Commit: 9f2c1ab` |
| stop record | `apply run` | `- Stopped: <why>` |
| reopen record | `apply` | `- Reopened: <n> changes appeared here after this phase was marked complete…` |
| verification block | `apply` | `#### Verification — Phase 3` |

**Criterion grammar.** After the id, fields are `key: value` pairs separated by
` · `. No value ever contains that separator. The keys are fixed:

| Kind | Keys |
|------|------|
| raw value → token | `file`, `literal`, `becomes`, `check`, and `note` when the literal is only *near*-identical to the token's value |
| pattern → component | `file`, `pattern`, `becomes`, `check` |

`becomes` is `token \`name\`` or `component \`Name/Variant\`` — that is how the
two kinds are told apart.

### Per-phase verification

Every phase ends with a `#### Verification — Phase n` block stating the same bar:

1. every criterion in the phase, ticked and checked as written;
2. `git diff` for the phase touching only the files the criteria name;
3. **the host project's own test suite, green** — when one was detected. Detected,
   not assumed: a project with no suite gets a phase that says the criteria are
   the whole bar, rather than a phase that fails on a command nobody wrote;
4. on failure: stop, keep the completed commits, record `- Stopped: <why>` on the
   phase, and report.

Detection order for the suite: a `test` script in `package.json` (the strongest
evidence there is — the project's author wrote that command down), then
`pytest.ini`, `Cargo.toml`, `go.mod`, `Gemfile`.

---
