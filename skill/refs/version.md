# `version`

Answer one question: which Phyllum is installed here, and is it the current one?

`version` is mechanics — it runs entirely in Node, needs no model, and writes
nothing. It is the **only** command that touches the network.

## What it reports

```
phyllum 0.1.0 — a newer version has been published.
  installed         0.1.0
  latest published  0.2.0

Run `phyllum update` to move to 0.2.0.
```

Two facts, then one sentence about what they mean together:

| Status | When | What it says |
|--------|------|--------------|
| up to date | installed = latest published | "Nothing to do." |
| a newer version has been published | installed < latest published | both versions, and `phyllum update` |
| ahead of what is published | installed > latest published | an unreleased build; nothing to update to |
| installed version only | the registry could not be reached | the installed version, and why the check failed |

## Rules

- **The installed version is read, never written down.** It comes from the
  package's own `package.json`. There is no version string anywhere in the
  source, so the number can never drift from the code that is running.
- **The registry check is on demand, and only here.** No other command asks the
  registry, nothing is cached between runs, and no banner, menu or help page ever
  hints that an update is available. If the user did not ask, Phyllum does not
  check.
- **Offline is an answer, not an error.** A missing network, a timeout, an error
  from the registry or a reply in an unexpected shape all end the same way: the
  installed version is printed, the reason the check failed is stated plainly,
  and the exit code is 0. `version` never blocks and never crashes.
- **It works before `init`.** `version` is about the install, not about the
  project, so it needs no `DESIGN-SYSTEM.md`.

## What it asks

`GET https://registry.npmjs.org/phyllum/latest`, with a short timeout, reading
one field: `version`. Nothing is sent about the user or their project.
