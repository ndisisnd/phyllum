/**
 * What language and framework is this project written in? (plan §3.3, §6.5)
 *
 * Two callers, one answer. `init` shows it in step 1 — "look before asking" —
 * and `create` uses it to label the code view. Detection is deliberately
 * layered, because most of the interesting cases are the ones where it fails:
 *
 *   1. `package.json` dependencies — the strongest evidence there is.
 *   2. The files on disk — `.vue`, `.svelte`, `.jsx`, or just HTML and CSS.
 *   3. Nothing recognisable — an empty folder, or a codebase in a language
 *      Phyllum has no opinion about.
 *
 * Whatever comes back, the code view is React + CSS in v1 (plan §9), so the
 * only thing detection changes is the *label* and the honest note beside it.
 * Vue and Svelte are detected precisely so Phyllum can say "I can see this is
 * Svelte; the code view below is still React + CSS" instead of pretending.
 *
 * This is a read-only glance: nothing here writes, and nothing here is fatal.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The default code view, and the thing every fallback falls back to. */
export const DEFAULT_CODE_VIEW = { language: 'React', styling: 'CSS' };

const FRAMEWORK_HINTS = [
  { id: 'react-next', name: 'React (Next.js)', deps: ['next'] },
  { id: 'react', name: 'React', deps: ['react', 'react-dom'] },
  { id: 'vue-nuxt', name: 'Vue (Nuxt)', deps: ['nuxt'] },
  { id: 'vue', name: 'Vue', deps: ['vue'] },
  { id: 'svelte-kit', name: 'Svelte (SvelteKit)', deps: ['@sveltejs/kit'] },
  { id: 'svelte', name: 'Svelte', deps: ['svelte'] },
];

/** The frameworks v1 emits code for. Everything else is a labelled fallback. */
const SUPPORTED = new Set(['react', 'react-next']);

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

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.svelte-kit',
  'coverage',
  '.phyllum',
  '.claude',
  'vendor',
  '__pycache__',
]);

function readManifest(root) {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null; // an unparseable manifest is no evidence, not a crash
  }
}

/**
 * A shallow, bounded census of file extensions. Bounded on purpose: this runs
 * on every `create`, and "what kind of project is this" is answerable from the
 * first few hundred files or not at all.
 */
export function fileEvidence(root, { maxDepth = 3, maxFiles = 600 } = {}) {
  const counts = new Map();
  let seen = 0;
  const walk = (dir, depth) => {
    if (depth > maxDepth || seen >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (seen >= maxFiles) return;
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), depth + 1);
      else {
        seen += 1;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext) counts.set(ext, (counts.get(ext) ?? 0) + 1);
      }
    }
  };
  walk(root, 0);
  return counts;
}

function frameworkFromDeps(deps) {
  for (const hint of FRAMEWORK_HINTS) {
    if (hint.deps.some((dep) => dep in deps)) {
      // Next and Nuxt are React and Vue; the finer label is the useful one.
      return { id: hint.id, name: hint.name, evidence: 'package.json' };
    }
  }
  return null;
}

function frameworkFromFiles(counts) {
  if (counts.get('.vue')) return { id: 'vue', name: 'Vue', evidence: 'files' };
  if (counts.get('.svelte')) return { id: 'svelte', name: 'Svelte', evidence: 'files' };
  if (counts.get('.jsx') || counts.get('.tsx')) return { id: 'react', name: 'React', evidence: 'files' };
  if (counts.get('.html') || counts.get('.htm')) {
    return { id: 'html', name: 'none — plain HTML and CSS', evidence: 'files' };
  }
  return null;
}

/** Does any stylesheet here look like Tailwind's own? */
function tailwindInSource(root) {
  for (const rel of ['src/styles.css', 'styles.css', 'src/index.css', 'app/globals.css', 'src/app/globals.css']) {
    const file = path.join(root, rel);
    try {
      if (fs.existsSync(file) && /@tailwind\b|@import\s+["']tailwindcss/.test(fs.readFileSync(file, 'utf8'))) {
        return true;
      }
    } catch {
      // unreadable is not evidence
    }
  }
  return false;
}

function hasStyledComponents(deps) {
  return ['styled-components', '@emotion/react', '@emotion/styled'].some((dep) => dep in deps);
}

/**
 * `{ framework, frameworkId, supported, styling, artefacts, codeView, empty }`
 * — all best-effort, never fatal.
 */
export function detectProject(root) {
  const manifest = readManifest(root);
  const deps = {
    ...(manifest?.dependencies ?? {}),
    ...(manifest?.devDependencies ?? {}),
    ...(manifest?.peerDependencies ?? {}),
  };

  const counts = fileEvidence(root);
  const found = frameworkFromDeps(deps) ?? frameworkFromFiles(counts) ?? {
    id: 'unknown',
    name: 'unknown',
    evidence: 'none',
  };

  const artefacts = ARTEFACT_FILES.filter((rel) => fs.existsSync(path.join(root, rel)));
  const hasTailwind =
    'tailwindcss' in deps ||
    artefacts.some((artefact) => artefact.startsWith('tailwind.config')) ||
    tailwindInSource(root);

  let styling = 'CSS';
  if (hasTailwind) styling = 'Tailwind';
  else if (hasStyledComponents(deps)) styling = 'CSS-in-JS';

  const detection = {
    framework: found.name,
    frameworkId: found.id,
    frameworkEvidence: found.evidence,
    supported: SUPPORTED.has(found.id),
    styling,
    artefacts,
    // An empty folder is its own case: there is nothing to be wrong about.
    empty: counts.size === 0 && manifest === null,
  };
  detection.codeView = codeViewFor(detection);
  return detection;
}

/**
 * What the code view will actually be, and why (plan §3.3, §9).
 *
 * v1 emits React + CSS in every case. `fallback` says whether that is what the
 * codebase asked for or what Phyllum defaults to, and `reason` is the sentence
 * the user sees so the default is never silent.
 */
export function codeViewFor(detection = {}) {
  const { frameworkId = 'unknown', styling = 'CSS', empty = false } = detection;

  if (frameworkId === 'react' || frameworkId === 'react-next') {
    return {
      ...DEFAULT_CODE_VIEW,
      fallback: false,
      reason:
        styling === 'Tailwind'
          ? 'React with Tailwind was detected; the code view is React + CSS, so the values are ' +
            'spelled out rather than hidden behind utility classes.'
          : 'React was detected, and the code view is React + CSS.',
    };
  }

  if (frameworkId === 'html') {
    return {
      ...DEFAULT_CODE_VIEW,
      fallback: true,
      reason:
        'This looks like plain HTML and CSS. The CSS below applies as it stands; ' +
        'the React wrapper is the v1 default and is there to be ignored or adapted.',
    };
  }

  if (frameworkId === 'vue' || frameworkId === 'vue-nuxt' || frameworkId === 'svelte' || frameworkId === 'svelte-kit') {
    return {
      ...DEFAULT_CODE_VIEW,
      fallback: true,
      reason:
        `${detection.framework} was detected, but v1 emits React + CSS only (plan §9) — ` +
        'the CSS is framework-agnostic, and the markup is a template to translate.',
    };
  }

  return {
    ...DEFAULT_CODE_VIEW,
    fallback: true,
    reason: empty
      ? 'There is nothing here to detect yet, so the code view uses the default: React + CSS.'
      : 'No framework was detected, so the code view falls back to the default: React + CSS.',
  };
}

/** One-line-per-fact summary for the walkthrough's first step. */
export function renderDetection(detection) {
  const codeView = detection.codeView ?? codeViewFor(detection);
  const lines = ['Step 1 — what Phyllum can see'];
  lines.push(
    `  Framework: ${detection.framework === 'unknown' ? 'not detected' : detection.framework}`,
  );
  lines.push(`  Styling:   ${detection.styling}`);
  if (detection.artefacts.length === 0) {
    lines.push('  Existing design artefacts: none found');
  } else {
    lines.push(`  Existing design artefacts: ${detection.artefacts.join(', ')}`);
  }
  lines.push(`  Code view: ${codeView.language} + ${codeView.styling}${codeView.fallback ? ' (default)' : ''}`);
  return lines;
}
