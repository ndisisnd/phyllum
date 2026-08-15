/**
 * `init` (plan §6.5) — the mechanical half of the walkthrough.
 *
 * Five steps, each skippable, the whole thing rerunnable:
 *   1. Look before asking      — report what is already in the project
 *   2. Scaffold the template   — create DESIGN-SYSTEM.md, or repair it in place
 *   3. Install the skill       — copy skill/ into .claude/skills/phyllum/
 *   4. Seed the system         — offered here, delivered by M2/M3
 *   5. Orient                  — finish on the menu and the help hint
 *
 * Step 4 is the one that could break a promise, so it is the most careful: it
 * offers a first `assess` pass, and the pass it runs is the read-only scan only.
 * It reports what the codebase already uses and stops there — naming a token is a
 * decision, and decisions belong to `assess`'s review, not to a setup walkthrough
 * that assumed yes.
 *
 * The pass it runs is the v0.1.0 extension-gated scan rather than `assess`'s
 * widened sweep, on purpose: a walkthrough should be quick and should preview,
 * not inventory. `phyllum assess` is the full reading.
 *
 * Step 2 never overwrites. If the file exists, Phyllum checks it against the
 * §7.1.1 section contract and adds back only what is missing; user content is
 * never dropped, so a rerun's diff shows additions and nothing else.
 */

import fs from 'node:fs';
import path from 'node:path';

import { detectProject, renderDetection } from './detect.js';
import {
  dropLegacyColumns,
  legacyColumns,
  missingHeadings,
  parse,
  render,
  repairStructure,
} from './design-system.js';
import { tokenise } from './tokenise.js';
import { renderMenu } from './menu.js';
import { HELP_HINT } from './help.js';
import {
  SKILL_DIR,
  detectProjectName,
  instantiateTemplate,
  packageVersion,
  skillFiles,
} from './template.js';
import {
  DESIGN_SYSTEM_FILE,
  GITIGNORE_LINE,
  GITIGNORE_LINES,
  SKILL_INSTALL_DIR,
  appendGitignoreLine,
  writeDesignSystem,
  writeGuarded,
} from './write.js';

/**
 * Run init against `root`.
 *
 * options:
 *   yes      confirmations are assumed (set automatically when not on a TTY)
 *   confirm  async (question) => boolean, used only when yes is false
 *   today    ISO date for the template's Created field (tests pin this)
 */
/** How many seeded proposals the walkthrough shows before it says "and more". */
const SEED_PREVIEW = 5;

export async function runInit(root, options = {}) {
  const { yes = true, confirm = async () => true, today } = options;
  const created = today ?? new Date().toISOString().slice(0, 10);
  const ask = async (question) => (yes ? true : confirm(question));

  const out = [];
  const actions = [];

  out.push('phyllum init — guided setup', '');

  // Step 1 — look before asking.
  const detection = detectProject(root);
  out.push(...renderDetection(detection), '');

  // Step 2 — scaffold or repair DESIGN-SYSTEM.md.
  const designSystemPath = path.join(root, DESIGN_SYSTEM_FILE);
  out.push('Step 2 — source of truth');
  if (!fs.existsSync(designSystemPath)) {
    const meta = {
      project: detectProjectName(root),
      version: packageVersion(),
      created,
    };
    writeDesignSystem(root, instantiateTemplate(meta));
    actions.push('created-design-system');
    out.push(`  Created ${DESIGN_SYSTEM_FILE} from the canonical template.`);
  } else {
    const current = fs.readFileSync(designSystemPath, 'utf8');
    const missing = missingHeadings(current);
    if (missing.length === 0) {
      actions.push('design-system-already-valid');
      out.push(`  ${DESIGN_SYSTEM_FILE} already exists and matches the template contract.`);
    } else {
      const repaired = repairStructure(current, {
        project: detectProjectName(root),
        version: packageVersion(),
        created,
      });
      writeDesignSystem(root, repaired.text);
      actions.push('repaired-design-system');
      out.push(
        `  ${DESIGN_SYSTEM_FILE} was missing ${missing.length} section${missing.length === 1 ? '' : 's'} — added back, nothing removed:`,
      );
      for (const heading of missing) out.push(`    + ${heading}`);
    }

    // The one repair that *removes* something, so it is the one repair that is
    // offered rather than done (v0.3.0 §5.5). Colours dropped its `notes` column
    // — provenance is history, not design system — but a file written before
    // that has the column and may have things written in it. Never-drop-content
    // holds: the column goes only when the user says so, and a no leaves the
    // file exactly as it stands, still valid, still rendered as it was found.
    out.push(...(await offerLegacyRemoval(root, designSystemPath, { gate: options.confirm, actions })));
  }
  out.push('');

  // Step 3 — install the skill and gitignore the session directory.
  out.push('Step 3 — Claude Code skill');
  const installed = installSkill(root);
  actions.push('installed-skill');
  out.push(`  Copied ${installed.length} skill file${installed.length === 1 ? '' : 's'} into ${SKILL_INSTALL_DIR}/.`);

  // Two lines since v0.2.1, asked as one question because they are one idea:
  // the things Phyllum keeps beside your design system that are yours locally
  // and belong to nobody else — the session directory, and the pre-edit backup
  // the write funnel takes (§6.5.2). Committing an undo buffer would put a
  // stale copy of the design system in every diff.
  const wantsGitignore = await ask(`Add \`${GITIGNORE_LINES.join('` and `')}\` to .gitignore?`);
  if (wantsGitignore) {
    const result = appendGitignoreLine(root);
    actions.push(`gitignore-${result}`);
    out.push(
      result === 'already-present'
        ? `  .gitignore already ignores ${GITIGNORE_LINES.join(' and ')}.`
        : `  Added to .gitignore: ${GITIGNORE_LINES.join(', ')}`,
    );
  } else {
    actions.push('gitignore-skipped');
    out.push(`  Skipped .gitignore (session state in ${GITIGNORE_LINE} will not be ignored).`);
  }
  out.push('');

  // Step 4 — seeding. Offered, never forced, and read-only: the pass shows what
  // it found and stops there, because naming a token is the user's decision.
  out.push('Step 4 — seed the system');
  const wantsSeed = await ask('Run a first read-only pass over your codebase now?');
  if (wantsSeed) {
    const model = parse(fs.readFileSync(designSystemPath, 'utf8'));
    const { proposals } = tokenise(root, model);
    actions.push(`tokenise-seed-${proposals.length}`);
    if (proposals.length === 0) {
      out.push('  Scanned your codebase, read-only — no colours, numbers or typography to name yet.');
    } else {
      out.push(
        `  Scanned your codebase, read-only — ${proposals.length} value${proposals.length === 1 ? '' : 's'} worth naming, most-used first:`,
      );
      for (const proposal of proposals.slice(0, SEED_PREVIEW)) {
        out.push(`    ${proposal.name}  ${proposal.value}  (used ${proposal.count}×)`);
      }
      if (proposals.length > SEED_PREVIEW) {
        out.push(`    …and ${proposals.length - SEED_PREVIEW} more.`);
      }
      out.push('  Nothing was written. Run `phyllum assess` for the full reading, or `phyllum tokenise "…"` to name one value from a sentence.');
    }
  } else {
    actions.push('tokenise-seed-skipped');
    out.push('  Skipped. `phyllum assess` reads your codebase whenever you want it to.');
  }
  out.push('  A first component is the other half: `phyllum create "button primary"` starts one.');
  out.push('  (Or run `phyllum create` with nothing after it, and pick from the archetypes and the');
  out.push('  components your codebase already repeats.)');
  out.push('');

  // Step 5 — orient.
  out.push('Step 5 — where to go next', '');
  out.push(renderMenu().trimEnd(), '');
  out.push(HELP_HINT);
  out.push(`Your design system lives in ${DESIGN_SYSTEM_FILE}.`);

  return { out: `${out.join('\n')}\n`, code: 0, actions };
}

/**
 * Offer the one-time removal of a column the contract no longer has.
 *
 * Reported when it is there, removed only on a yes, silent when there is nothing
 * to remove — so a file already on the current shape sees none of this, and a
 * rerun after a "no" asks again rather than deciding for anybody.
 */
async function offerLegacyRemoval(root, designSystemPath, { gate, actions }) {
  const model = parse(fs.readFileSync(designSystemPath, 'utf8'));
  const legacy = legacyColumns(model);
  if (legacy.length === 0) return [];

  const lines = [];
  for (const column of legacy) {
    lines.push(
      `  ${column.heading.replace('### ', '')} still carries the \`${column.extra.join('`, `')}\` column, which Phyllum dropped in v0.3.0.`,
    );
  }
  // This is the only prompt in `init` that `--yes` does not answer. Every other
  // step adds; this one takes away, and a gate that removes content is only ever
  // answered by a person — the same rule `apply run`'s safety gate keeps.
  const extras = legacy.flatMap((column) => column.extra);
  const one = extras.length === 1;
  const question =
    `Remove the \`${extras.join('`, `')}\` column${one ? '' : 's'}? ` +
    `(what is written in ${one ? 'it' : 'them'} is lost)`;
  const wanted = typeof gate === 'function' ? await gate(question) : false;
  if (!wanted) {
    actions.push('legacy-columns-kept');
    lines.push('  Kept. Phyllum renders the column it finds, so nothing you wrote there is touched.');
    return lines;
  }
  dropLegacyColumns(model);
  writeDesignSystem(root, render(model));
  actions.push('legacy-columns-removed');
  lines.push('  Removed. Colours is `token | value` now, matching the other sections.');
  return lines;
}

/**
 * Copy skill/ into .claude/skills/phyllum/, through the write funnel.
 *
 * Exported because `upgrade` re-syncs the same copy after an install (plan v0.2.0
 * §4): one installer, so the CLI and the skill can never be two versions.
 */
export function installSkill(root) {
  const files = skillFiles();
  for (const rel of files) {
    const source = path.join(SKILL_DIR, rel);
    const contents = fs.readFileSync(source);
    writeGuarded(root, `${SKILL_INSTALL_DIR}/${rel}`, contents, { init: true });
  }
  return files;
}
