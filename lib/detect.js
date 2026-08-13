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
 *
 * v0.2.1 adds a second reading of the same evidence (plan §6.1). Detection has
 * always gathered more than it reported: it looks for six frameworks and three
 * styling systems, then collapses all of it into one winner, because `create`
 * only ever needed one label. A design system cares about the part that gets
 * thrown away — a repository with React *and* Vue files, or Tailwind *and*
 * styled-components *and* a folder of stylesheets, cannot have one source of
 * truth however confidently a single string names it.
 *
 * So the winner is unchanged, and the evidence behind it is now reported beside
 * it: `frameworks`, `stylings`, `themeSources` and `duplicateMajors`. Nothing
 * here decides that co-existence is a problem. That judgement belongs to
 * `assess` (`lib/assess-hygiene.js`), for the same reason severity does: a
 * detector's job is to report what it saw.
 */

import fs from 'node:fs';
import path from 'node:path';

import { sources } from './tokenise-spec.js';

/** The default code view, and the thing every fallback falls back to. */
export const DEFAULT_CODE_VIEW = { language: 'React', styling: 'CSS' };

/**
 * The frameworks worth naming, finest label first.
 *
 * `family` is what makes co-existence answerable. Next *is* React and Nuxt *is*
 * Vue, so matching both rows is one framework described twice, not two
 * frameworks in one repository — the family is the thing there can be more than
 * one of.
 */
const FRAMEWORK_HINTS = [
  { id: 'react-next', family: 'react', name: 'React (Next.js)', deps: ['next'] },
  { id: 'react', family: 'react', name: 'React', deps: ['react', 'react-dom'] },
  { id: 'vue-nuxt', family: 'vue', name: 'Vue (Nuxt)', deps: ['nuxt'] },
  { id: 'vue', family: 'vue', name: 'Vue', deps: ['vue'] },
  { id: 'svelte-kit', family: 'svelte', name: 'Svelte (SvelteKit)', deps: ['@sveltejs/kit'] },
  { id: 'svelte', family: 'svelte', name: 'Svelte', deps: ['svelte'] },
];

/** The packages whose version ranges are worth reading, from the rows above. */
const TRACKED_PACKAGES = new Set(FRAMEWORK_HINTS.flatMap((hint) => hint.deps));

/** The three places a manifest declares a dependency, read in one pass. */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

/** The CSS-in-JS libraries, listed once because two readings need them. */
const CSS_IN_JS = ['styled-components', '@emotion/react', '@emotion/styled'];

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

/** Which stylesheet here looks like Tailwind's own, if any? */
function tailwindEntry(root) {
  for (const rel of ['src/styles.css', 'styles.css', 'src/index.css', 'app/globals.css', 'src/app/globals.css']) {
    const file = path.join(root, rel);
    try {
      if (fs.existsSync(file) && /@tailwind\b|@import\s+["']tailwindcss/.test(fs.readFileSync(file, 'utf8'))) {
        return rel;
      }
    } catch {
      // unreadable is not evidence
    }
  }
  return null;
}

function hasStyledComponents(deps) {
  return CSS_IN_JS.some((dep) => dep in deps);
}

/**
 * Every framework family the manifest names — the winner, and everything the
 * winner used to hide.
 *
 * One entry per family, keeping the finest label that matched, in the order the
 * hints are written so two runs over one repository agree.
 */
function frameworksFromDeps(deps) {
  const byFamily = new Map();
  for (const hint of FRAMEWORK_HINTS) {
    if (!hint.deps.some((dep) => dep in deps)) continue;
    if (byFamily.has(hint.family)) continue;
    byFamily.set(hint.family, {
      id: hint.id,
      name: hint.name,
      family: hint.family,
      evidence: 'package.json',
    });
  }
  return [...byFamily.values()];
}

/**
 * The same question asked of the files, for the families the manifest missed.
 *
 * Plain HTML is deliberately not in here. It is the *absence* of a framework
 * rather than a rival to one, and almost every React app ships an `index.html`
 * — reading that as a collision would make the check noise on its first day.
 */
function frameworksFromFiles(counts) {
  const found = [];
  if (counts.get('.vue')) found.push({ id: 'vue', name: 'Vue', family: 'vue', evidence: 'files' });
  if (counts.get('.svelte')) {
    found.push({ id: 'svelte', name: 'Svelte', family: 'svelte', evidence: 'files' });
  }
  if (counts.get('.jsx') || counts.get('.tsx')) {
    found.push({ id: 'react', name: 'React', family: 'react', evidence: 'files' });
  }
  return found;
}

/** `npm:react@^18` names react, whatever key it was written under. */
function packageAndRange(name, range) {
  const alias = String(range).match(/^npm:((?:@[^/]+\/)?[^@]+)@(.+)$/);
  return alias ? { name: alias[1], range: alias[2] } : { name, range: String(range) };
}

/**
 * One framework, two majors in the same dependency tree.
 *
 * A range is read for its first number and nothing else — `^18.2.0`, `>=17`
 * and `npm:react@18` all say 18 — because the question is which major, not
 * which release, and a resolver is not something a read-only glance owns.
 */
function duplicateMajors(manifest) {
  const majors = new Map();
  for (const field of DEPENDENCY_FIELDS) {
    for (const [key, declared] of Object.entries(manifest?.[field] ?? {})) {
      const { name, range } = packageAndRange(key, declared);
      if (!TRACKED_PACKAGES.has(name)) continue;
      const major = (String(range).match(/(\d+)/) ?? [])[1];
      if (!major) continue;
      const entry = majors.get(name) ?? new Map();
      const where = entry.get(major) ?? [];
      if (!where.includes(field)) where.push(field);
      entry.set(major, where);
      majors.set(name, entry);
    }
  }
  return [...majors.entries()]
    .filter(([, entry]) => entry.size > 1)
    .map(([name, entry]) => ({
      package: name,
      majors: [...entry.keys()].sort((a, b) => Number(a) - Number(b)),
      where: [...new Set([...entry.values()].flat())],
    }))
    .sort((a, b) => a.package.localeCompare(b.package));
}

/**
 * Every styling system that is live here, not just the one that wins.
 *
 * The Tailwind entry point is discounted from the stylesheet count on purpose:
 * a `globals.css` holding `@tailwind` directives is how Tailwind is installed,
 * not a second styling system competing with it. Any *other* stylesheet is,
 * because that is a file where somebody writes values by hand.
 */
function stylingSystems(root, deps, artefacts, counts) {
  const live = [];
  const configs = artefacts.filter((artefact) => artefact.startsWith('tailwind.config'));
  const entry = tailwindEntry(root);
  if ('tailwindcss' in deps || configs.length > 0 || entry) {
    live.push({
      id: 'tailwind',
      name: 'Tailwind',
      evidence: 'tailwindcss' in deps ? 'package.json' : (configs[0] ?? entry),
    });
  }
  const inJs = CSS_IN_JS.filter((dep) => dep in deps);
  if (inJs.length > 0) live.push({ id: 'css-in-js', name: 'CSS-in-JS', evidence: inJs.join(', ') });

  const sheets = Math.max(
    0,
    sources().stylesheets.reduce((total, ext) => total + (counts.get(ext) ?? 0), 0) - (entry ? 1 : 0),
  );
  if (sheets > 0) {
    live.push({
      id: 'css',
      name: 'CSS',
      evidence: `${sheets} stylesheet${sheets === 1 ? '' : 's'}`,
    });
  }
  return live;
}

/**
 * `{ framework, frameworkId, supported, styling, artefacts, codeView, empty }`
 * — all best-effort, never fatal — plus the evidence the winner is drawn from:
 * `frameworks`, `duplicateMajors`, `stylings` and `themeSources` (v0.2.1 §6.1).
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
  const stylings = stylingSystems(root, deps, artefacts, counts);
  const hasTailwind = stylings.some((system) => system.id === 'tailwind');

  let styling = 'CSS';
  if (hasTailwind) styling = 'Tailwind';
  else if (hasStyledComponents(deps)) styling = 'CSS-in-JS';

  // One family per entry, the manifest's reading of a family preferred to the
  // files' — the same precedence the single winner has always used.
  const fromDeps = frameworksFromDeps(deps);
  const frameworks = [
    ...fromDeps,
    ...frameworksFromFiles(counts).filter(
      (candidate) => !fromDeps.some((known) => known.family === candidate.family),
    ),
  ];

  const detection = {
    framework: found.name,
    frameworkId: found.id,
    frameworkEvidence: found.evidence,
    supported: SUPPORTED.has(found.id),
    styling,
    artefacts,
    // The evidence behind the three lines above, kept rather than collapsed.
    frameworks,
    duplicateMajors: duplicateMajors(manifest),
    stylings,
    // `DESIGN-SYSTEM.md` is Phyllum's own record, never a rival source of
    // truth — counting it would make every project Phyllum manages collide
    // with itself.
    themeSources: artefacts.filter((artefact) => artefact !== 'DESIGN-SYSTEM.md'),
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
