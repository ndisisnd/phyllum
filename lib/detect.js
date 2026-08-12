/**
 * "Look before asking" (plan §6.5, step 1) — the mechanical half.
 *
 * This is a read-only glance at the project: what framework is in play and
 * what design-system artefacts already exist, so the walkthrough starts from
 * facts instead of a blank form. The judgement half (reading those artefacts
 * and summarising what they mean) belongs to the skill, not the CLI.
 */

import fs from 'node:fs';
import path from 'node:path';

const FRAMEWORK_HINTS = [
  { name: 'React', deps: ['react', 'next', 'react-dom'] },
  { name: 'Vue', deps: ['vue', 'nuxt'] },
  { name: 'Svelte', deps: ['svelte', '@sveltejs/kit'] },
];

const ARTEFACT_FILES = [
  'DESIGN-SYSTEM.md',
  'tailwind.config.js',
  'tailwind.config.ts',
  'tailwind.config.cjs',
  'theme.js',
  'theme.ts',
  'tokens.json',
  'design-tokens.json',
  'src/theme.ts',
  'src/theme.js',
  'src/styles/tokens.css',
  'styles/tokens.css',
];

function readManifest(root) {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** { framework, styling, artefacts } — all best-effort, never fatal. */
export function detectProject(root) {
  const manifest = readManifest(root);
  const deps = {
    ...(manifest?.dependencies ?? {}),
    ...(manifest?.devDependencies ?? {}),
  };

  let framework = 'unknown';
  for (const hint of FRAMEWORK_HINTS) {
    if (hint.deps.some((dep) => dep in deps)) {
      framework = hint.name;
      break;
    }
  }

  const artefacts = ARTEFACT_FILES.filter((rel) => fs.existsSync(path.join(root, rel)));
  const hasTailwind =
    'tailwindcss' in deps || artefacts.some((a) => a.startsWith('tailwind.config'));

  let styling = 'CSS';
  if (hasTailwind) styling = 'Tailwind';
  else if (hasStyledComponents(deps)) styling = 'CSS-in-JS';

  return { framework, styling, artefacts };
}

function hasStyledComponents(deps) {
  return ['styled-components', '@emotion/react', '@emotion/styled'].some((dep) => dep in deps);
}

/** One-line-per-fact summary for the walkthrough's first step. */
export function renderDetection(detection) {
  const lines = ['Step 1 — what Basal can see'];
  lines.push(
    `  Framework: ${detection.framework === 'unknown' ? 'not detected (code view will default to React + CSS)' : detection.framework}`,
  );
  lines.push(`  Styling:   ${detection.styling}`);
  if (detection.artefacts.length === 0) {
    lines.push('  Existing design artefacts: none found');
  } else {
    lines.push(`  Existing design artefacts: ${detection.artefacts.join(', ')}`);
  }
  return lines;
}
