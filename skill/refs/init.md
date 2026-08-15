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

The CLI does the mechanical half of this (framework, styling, artefact paths,
and the code view that follows from them — React + CSS, marked `(default)` when
it is a fallback rather than a detection). Reading those artefacts and saying
what they actually mean is your job.

## Step 2 — scaffold the template

Create `DESIGN-SYSTEM.md` from the canonical template shipped in the package, so
that every Phyllum install produces the same structure. Never write it from
scratch.

If the file already exists, **do not overwrite it**. Validate its section
structure against the template contract and offer to repair anything missing.
User content is never dropped: a rerun's diff shows additions only.

Two shape changes arrived with v0.3.0, and they are handled in opposite ways
because one adds and one takes away:

- **The `Primitives` subsection** (inside Colours, `refs/create.md` §5.3) is
  added only when there are primitives to put under it. A file without it is
  valid, so repair never adds an empty one.
- **The Colours `notes` column** went in v0.3.0 (§5.5). A file written before
  that still has it, possibly with things written in it, so repair **offers**
  the removal and does not take it. A no keeps every word: the renderer writes
  back the shape it found. `--yes` does not answer this one — every other prompt
  in `init` adds something, and a gate that removes content is only ever
  answered by a person.

## Step 3 — install the skill

Copy the skill definition into `.claude/skills/phyllum/`, and add one `.phyllum/`
line to `.gitignore` so session state stays out of the repo. Ask before
touching `.gitignore`.

## Step 4 — seed the system (offered, not forced)

Ask whether to run a first read-only pass over the codebase now — the styles
already there yield immediate tokens, which makes every later `create` suggestion
smarter — and whether to create a first component via the Mode C picker.

The pass previews; it never names anything on the user's behalf. Point at
`phyllum assess` for the full reading of the codebase, and at
`phyllum tokenise "…"` for naming one value from a sentence.

*Reading the codebase is `assess`'s job as of v0.2.0; `tokenise` reads prose.*

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
| File still has the Colours `notes` column | Reported, and its removal offered; a no leaves the file untouched and asks again next time |
| File has no `Primitives` subsection | Left alone — it appears when `create primitives` writes one |
| Skill already installed | Files rewritten from the package (they are Phyllum-owned) |
| `.phyllum/` already in `.gitignore` | Left alone |
