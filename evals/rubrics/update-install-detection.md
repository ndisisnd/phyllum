# Eval — `upgrade`, "how was Phyllum installed?" (plan v0.2.0 §4, §7)

**Status: scored from v0.2.0 M1.**

The eval id stays `update-install-detection`, and deliberately: v0.3.0 §6 renamed
the command to `upgrade` without changing one thing this eval measures, and a
renamed id would break the comparison with every baseline recorded before it.

`upgrade` is only as good as its answer to one question: how did this copy of
Phyllum get here? Get it wrong and the command either does nothing useful or —
much worse — installs a second copy somewhere the user did not ask for. So the
detection is graded as a fact, over pinned directory layouts, with no model
involved and nothing installed.

## Why the fixtures are built rather than committed

Every layout here contains a `node_modules` directory, and `node_modules` is
gitignored, so these fixtures cannot live in the repository. Each case therefore
carries its layout as *data* — the path, an optional project manifest, an
optional lockfile — and the runner builds it inside a temp sandbox, reads it, and
removes it. The data is pinned in `evals/prompts/update-install-detection.json`;
only the directories are ephemeral.

The environment is emptied for every case, because the eval suite is itself run
by npm and would otherwise see npm's own `npm_config_user_agent` on every case.

## What the runner scores

Four claims per case, one point each:

1. **Kind.** `global`, `project`, `ephemeral` or `source` — the four shapes that
   lead to four different behaviours.
2. **Manager.** npm, pnpm, yarn, bun, or nothing. `null` is a legitimate answer
   and scores the point when nothing in the layout names a manager.
3. **Supported.** Whether v0.2.0 will act on this install at all. npm and pnpm
   are driven; everything else is refused. Claiming support Phyllum does not have
   is the failure this criterion exists to catch.
4. **Command.** The exact command line, argument for argument — or `null` where
   there is nothing to run, as with a one-off `npx` cache or a source checkout.
   A dev dependency must keep its dev flag and a plain dependency must not gain
   one, so the user's manifest comes out as they had it.

## Cases

| Case | Layout | Kind | Manager | Command |
|------|--------|------|---------|---------|
| `npm-global` | `usr/local/lib/node_modules/phyllum` | global | npm | `npm install --global phyllum@latest` |
| `pnpm-global` | `Library/pnpm/global/5/node_modules/phyllum` | global | pnpm | `pnpm add --global phyllum@latest` |
| `npm-project-dev` | `app/node_modules/phyllum` + `package-lock.json` | project | npm | `npm install --save-dev phyllum@latest` |
| `npm-project-dependency` | as above, listed in `dependencies` | project | npm | `npm install --save phyllum@latest` |
| `pnpm-project-virtual-store` | `monorepo/node_modules/.pnpm/…/node_modules/phyllum` | project | pnpm | `pnpm add --save-dev phyllum@latest` |
| `npx-one-off` | `.npm/_npx/…/node_modules/phyllum` | ephemeral | npm | none |
| `pnpm-dlx-one-off` | `Library/Caches/pnpm/dlx/…/node_modules/phyllum` | ephemeral | pnpm | none |
| `source-checkout` | `code/phyllum` (no `node_modules` above it) | source | none | none |
| `yarn-project` | `yarn-app/node_modules/phyllum` + `yarn.lock` | project | yarn | `yarn add --dev phyllum@latest` (named, not run) |
| `bun-project` | `bun-app/node_modules/phyllum` + `bun.lockb` | project | bun | `bun add --dev phyllum@latest` (named, not run) |

The pnpm virtual-store case is the one worth watching: pnpm nests a second
`node_modules` inside the first, and the *outer* one identifies the project. A
detector that takes the innermost would update the wrong directory.

## Scoring

Four points per case, 40 in total.

**Threshold: 1.0.** These are facts about pinned layouts, not judgements, so
anything less than every point is a regression. A wrong command here is a wrong
`npm install` on a real machine, which is why the bar cannot be lower.

## Not scored here

The *wording* of a refusal — whether "there is nothing here to update" reads as
helpful rather than obstructive — is prose, and prose needs a model judge. The
assertion suite checks the load-bearing part mechanically instead: every refusal
path names the exact command, runs nothing, and writes nothing
(`evals/assertions/upgrade-cli.test.js`).
