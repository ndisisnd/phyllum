/**
 * `init` (plan §6.5) — the mechanical half of the walkthrough.
 *
 * Five steps, each skippable, the whole thing rerunnable:
 *   1. Look before asking      — report what is already in the project
 *   2. Scaffold the template   — create DESIGN-SYSTEM.md, or repair it in place
 *   3. Install the skill       — copy skill/ into .claude/skills/basal/
 *   4. Seed the system         — offered here, delivered by M2/M3
 *   5. Orient                  — finish on the menu and the help hint
 *
 * Step 2 never overwrites. If the file exists, Basal checks it against the
 * §7.1.1 section contract and adds back only what is missing; user content is
 * never dropped, so a rerun's diff shows additions and nothing else.
 */

import fs from 'node:fs';
import path from 'node:path';

import { detectProject, renderDetection } from './detect.js';
import { missingHeadings, repairStructure } from './design-system.js';
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
export async function runInit(root, options = {}) {
  const { yes = true, confirm = async () => true, today } = options;
  const created = today ?? new Date().toISOString().slice(0, 10);
  const ask = async (question) => (yes ? true : confirm(question));

  const out = [];
  const actions = [];

  out.push('basal init — guided setup', '');

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
  }
  out.push('');

  // Step 3 — install the skill and gitignore the session directory.
  out.push('Step 3 — Claude Code skill');
  const installed = installSkill(root);
  actions.push('installed-skill');
  out.push(`  Copied ${installed.length} skill file${installed.length === 1 ? '' : 's'} into ${SKILL_INSTALL_DIR}/.`);

  const wantsGitignore = await ask(`Add \`${GITIGNORE_LINE}\` to .gitignore?`);
  if (wantsGitignore) {
    const result = appendGitignoreLine(root);
    actions.push(`gitignore-${result}`);
    out.push(
      result === 'already-present'
        ? `  .gitignore already ignores ${GITIGNORE_LINE}.`
        : `  Added one line to .gitignore: ${GITIGNORE_LINE}`,
    );
  } else {
    actions.push('gitignore-skipped');
    out.push(`  Skipped .gitignore (session state in ${GITIGNORE_LINE} will not be ignored).`);
  }
  out.push('');

  // Step 4 — seeding. Offered here; the passes themselves land with M2/M3.
  out.push('Step 4 — seed the system');
  out.push('  A first `tokenise` pass and a first `create` are the fastest way to a useful system.');
  out.push('  Both land in a later milestone (tokenise in M3, create in M2), so init stops here for now.');
  out.push('');

  // Step 5 — orient.
  out.push('Step 5 — where to go next', '');
  out.push(renderMenu().trimEnd(), '');
  out.push(HELP_HINT);
  out.push(`Your design system lives in ${DESIGN_SYSTEM_FILE}.`);

  return { out: `${out.join('\n')}\n`, code: 0, actions };
}

/** Copy skill/ into .claude/skills/basal/, through the write funnel. */
function installSkill(root) {
  const files = skillFiles();
  for (const rel of files) {
    const source = path.join(SKILL_DIR, rel);
    const contents = fs.readFileSync(source);
    writeGuarded(root, `${SKILL_INSTALL_DIR}/${rel}`, contents, { init: true });
  }
  return files;
}
