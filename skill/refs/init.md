# `init`

`init` is not a dumb scaffolder. It is a smart walkthrough that takes a project
from zero to a working design system setup in one guided session. It is the
first command to run after installing the package, and the interactive session
suggests it automatically when no `DESIGN-SYSTEM.md` exists.

Every step is skippable, and the whole flow is rerunnable.

## Step 1 — look before asking

Read the project first, then report what you found:

- Detect the language and framework (this feeds the code-view default: React +
  CSS unless something else is clearly in play).
- Find existing design-system artefacts — a prior `DESIGN-SYSTEM.md`, theme
  files, a Tailwind config, a tokens JSON.
- Summarise what you found, so the user starts from facts rather than a blank
  form.

The CLI does the mechanical half of this (framework, styling, artefact paths).
Reading those artefacts and saying what they actually mean is your job.

## Step 2 — scaffold the template

Create `DESIGN-SYSTEM.md` from the canonical template shipped in the package, so
that every Basal install produces the same structure. Never write it from
scratch.

If the file already exists, **do not overwrite it**. Validate its section
structure against the template contract and offer to repair anything missing.
User content is never dropped: a rerun's diff shows additions only.

## Step 3 — install the skill

Copy the skill definition into `.claude/skills/basal/`, and add one `.basal/`
line to `.gitignore` so session state stays out of the repo. Ask before
touching `.gitignore`.

## Step 4 — seed the system (offered, not forced)

Ask whether to run a first `tokenise` pass now — the codebase's existing styles
yield immediate tokens, which makes every later `create` suggestion smarter —
and whether to create a first component via the Mode C picker.

*The passes themselves land in M2 (`create`) and M3 (`tokenise`).*

## Step 5 — orient

Finish with the `menu` output plus the `help` hint, so the user leaves knowing
what each subskill is, how to learn more about any of them, and where the source
of truth lives.

## Rerun behaviour

| Situation | What happens |
|-----------|--------------|
| No `DESIGN-SYSTEM.md` | Created from the template |
| File exists and is valid | Left byte-identical; init says so |
| File exists, sections missing | Missing headings added back in canonical position; nothing removed |
| Skill already installed | Files rewritten from the package (they are Basal-owned) |
| `.basal/` already in `.gitignore` | Left alone |
