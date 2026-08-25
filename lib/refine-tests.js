/**
 * `refine tests` — the usage-contract tests, derived from the spec (v0.11.0 §3).
 *
 * The gate's sixth section asks whether usage-contract tests exist and pass.
 * This module makes the first half answerable: it reads a component's spec
 * block, derives the contract that block implies, and renders the tests that
 * assert it — type strictness, where data may live, and how a human and an
 * agent are each meant to call the thing.
 *
 * Four decisions shape everything below.
 *
 *   1. **The contract is derived, never authored.** Its source is the spec
 *      block in `DESIGN-SYSTEM.md` and the archetype contract in
 *      `refs/create/archetypes.md`. Where the spec is silent the clause is
 *      reported unstated, with the reason — the stage's standing rule that a
 *      criterion passed by absence is a criterion nobody checked.
 *   2. **The clause table lives in the reference, not here.** What each clause
 *      asserts, and when it is stated at all, is `phyllum:usage-clauses` in
 *      `refs/refine/protocol-usage-contract.md`, read through
 *      `lib/refine-spec.js`. This file holds only how a clause is *spelled* in
 *      one runner's dialect, which is the same split `refine coverage` makes
 *      between its rule table and its detector.
 *   3. **The runner is detected, and the fallback is stated.** A project whose
 *      harness Phyllum cannot identify gets `node:test` — which ships with Node
 *      and needs no dependency — and is told that is what happened. A silent
 *      guess hands somebody a file that will not import and no reason why.
 *   4. **Nothing is written.** There is no write call in this module and there
 *      is not meant to be one. `SKILL.md` opens with the rule that Phyllum
 *      writes `DESIGN-SYSTEM.md` plus its own enumerated paths, and a file in
 *      the user's test tree is neither. The text is rendered, the path it
 *      *would* sit at is computed as a proposal, and placing it is the user's
 *      act — or their agent's, on their behalf.
 */

import fs from 'node:fs';
import path from 'node:path';

import { contractFor, isCustomArchetype } from './archetypes.js';
import { classNameFor, componentNameFor } from './codegen.js';
import { detectTestSuite } from './harness-detect.js';
import { readComponent } from './prd.js';
import { componentFiles } from './refine-coverage.js';
import {
  RENDERED_CLAUSE,
  SPEC_CLAUSE,
  renderLibraries,
  testHarnesses,
  usageClauses,
} from './refine-spec.js';

/** The runner a project with no detectable harness gets, and is told it got. */
export const FALLBACK_HARNESS = 'node';

/** Where a generated file is proposed when the codebase does not contain the component. */
export const FALLBACK_TEST_DIR = 'tests';

/** The directories a project's existing tests are looked for in. */
export const TEST_DIRS = ['tests', 'test', '__tests__', 'src', 'app', 'components'];

/** The token sections a recorded name can come from. */
const TOKEN_SECTIONS = ['colours', 'primitives', 'numbers', 'typography'];

const exists = (file) => {
  try {
    return fs.existsSync(file);
  } catch {
    return false; // an unreadable path is silence, not evidence
  }
};

/** The project manifest, or null. A manifest that will not parse is not evidence. */
export function readManifest(root) {
  const file = path.join(path.resolve(root), 'package.json');
  if (!exists(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const dependenciesOf = (manifest) => ({
  ...(manifest?.devDependencies ?? {}),
  ...(manifest?.dependencies ?? {}),
});

// ---------------------------------------------------------------------------
// Detection — the runner, and the thing that mounts a component
// ---------------------------------------------------------------------------

/**
 * Which runner will run these tests?
 *
 * A configuration file or an installed package is the evidence, the same two
 * signals `refine lint` reads, and the first row in the table that matches
 * wins. Nothing matching is not an error: it selects the last row, and says so.
 */
export function detectTestHarness(root, { manifest = null } = {}) {
  const resolved = path.resolve(root);
  const pkg = manifest ?? readManifest(root);
  const deps = dependenciesOf(pkg);

  for (const harness of testHarnesses()) {
    const config = harness.configs.find((file) => exists(path.join(resolved, file)));
    if (config) return { ...harness, found: true, fallback: false, evidence: config, reason: null };
    if (harness.package && deps[harness.package] !== undefined) {
      return {
        ...harness,
        found: true,
        fallback: false,
        evidence: `${harness.package} in package.json`,
        reason: null,
      };
    }
  }

  const fallback =
    testHarnesses().find((row) => row.id === FALLBACK_HARNESS) ??
    testHarnesses()[testHarnesses().length - 1];
  return {
    ...fallback,
    found: false,
    fallback: true,
    evidence: null,
    reason: `no test runner was detected in this project, so the tests are written for \`${fallback.id}\`, which ships with Node`,
  };
}

/**
 * What will mount the component?
 *
 * `found: false` is a supported answer and it changes the output rather than
 * blocking it: the rendered clauses are dropped, each with its reason, and the
 * spec clauses are emitted as normal.
 */
export function detectRenderLibrary(root, { manifest = null } = {}) {
  const deps = dependenciesOf(manifest ?? readManifest(root));
  for (const library of renderLibraries()) {
    if (deps[library.package] !== undefined) {
      return { ...library, found: true, evidence: `${library.package} in package.json`, reason: null };
    }
  }
  return {
    id: null,
    package: null,
    imports: [],
    render: null,
    query: null,
    found: false,
    evidence: null,
    reason: `no render library is installed here (${renderLibraries()
      .map((row) => row.package)
      .join(', ')}), so a clause that has to mount the component cannot be expressed`,
  };
}

// ---------------------------------------------------------------------------
// The contract, derived from the spec block
// ---------------------------------------------------------------------------

/** The `properties:` slots a spec block records, minus the ones left TODO. */
export function recordedSlots(spec) {
  const out = {};
  let inside = false;
  for (const line of String(spec ?? '').split('\n')) {
    if (/^properties:\s*$/.test(line)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (/^\S/.test(line)) break; // the next top-level key ends the block
    const match = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.+?)\s*(?:#.*)?$/);
    if (!match) continue;
    // TODO means "I do not know yet", and Phyllum's standing rule is that a
    // TODO is never guessed at. A slot left TODO carries no clause.
    if (match[2] === 'TODO') continue;
    out[match[1]] = match[2];
  }
  return out;
}

/** Every token name the design system records, whatever section it sits in. */
export function recordedTokens(model) {
  const names = new Set();
  for (const section of TOKEN_SECTIONS) {
    for (const row of model?.tokens?.[section] ?? []) {
      const name = String(row?.[0] ?? '').trim();
      if (name !== '') names.add(name);
    }
  }
  return names;
}

/** Every variant recorded under this component's base name — `Button/Primary` → Primary. */
export function recordedVariants(model, name) {
  const base = String(name).split('/')[0];
  const out = [];
  for (const component of model?.components ?? []) {
    const recorded = String(component?.name ?? '');
    if (!recorded.startsWith(`${base}/`)) continue;
    const variant = recorded.split('/').slice(-1)[0];
    if (!out.includes(variant)) out.push(variant);
  }
  return out;
}

/**
 * The usage contract for one component: every clause, stated or not.
 *
 * A clause the spec cannot support is kept in the list with `stated: false` and
 * a reason, rather than dropped. The list is the contract; a shorter list would
 * read as a component with fewer obligations instead of one with a spec that
 * has not been finished.
 */
export function usageContract(component, { model = null, files = [], render = null } = {}) {
  const recorded = readComponent(component);
  const contract = recorded.custom ? null : contractFor(recorded.archetype);
  const custom = recorded.custom || isCustomArchetype(recorded.archetype);
  const slots = recordedSlots(recorded.spec);
  const tokens = recordedTokens(model);
  const subject = {
    name: recorded.name,
    element: componentNameFor(recorded.name),
    className: classNameFor(recorded.name),
    archetype: recorded.archetype,
    custom,
    contract,
    slots,
    // A slot's value is a token only when the design system actually records
    // that name. `background: #2563EB` is a slot the design system does not own.
    tokenSlots: Object.fromEntries(Object.entries(slots).filter(([, value]) => tokens.has(value))),
    // The archetype says which states are mandatory; the spec says whether each
    // one has been decided. A state the spec still records as TODO is dropped,
    // because TODO means "do not generate" everywhere else in Phyllum and a
    // test asserting a state nobody built would fail for the wrong reason.
    states: (contract?.states ?? []).filter((state) => !recorded.todoSlots.includes(state)),
    todoStates: (contract?.states ?? []).filter((state) => recorded.todoSlots.includes(state)),
    variants: recordedVariants(model, recorded.name),
    files: [...files],
    module: moduleFor(recorded, files),
  };

  const clauses = usageClauses().map((row) => {
    const silence = silenceFor(row.clause, subject, render);
    return {
      ...row,
      stated: silence === null,
      reason: silence,
      subject: subject.name,
    };
  });

  return { component: subject.name, subject, clauses };
}

/** The file a generated test would import the component from, or null. */
function moduleFor(recorded, files) {
  const element = componentNameFor(recorded.name).toLowerCase();
  const code = files.filter((file) => /\.(jsx?|tsx?|mjs|cjs)$/i.test(file));
  const named = code.find((file) => path.basename(file).toLowerCase().startsWith(element));
  return named ?? code[0] ?? null;
}

/**
 * Why this clause is not stated for this component, or null when it is.
 *
 * Every branch names a fact about the recorded spec or about the project, and
 * none of them guesses: a component with no archetype does not get the
 * archetype's clauses filled in from what its name looks like.
 */
function silenceFor(clause, subject, render) {
  // The contract-level silences are asked first, and on purpose. "This spec
  // records no archetype" is a fact about the contract; "nothing in the
  // codebase is spelled as this" is a fact about the project. A clause that has
  // no contract behind it has none whether or not the component was ever built,
  // so the contract's answer is the one worth reporting.
  if (clause === 'variant-closed' && subject.variants.length === 0) {
    return 'the spec records no variant for this component, so there is no closed set to hold it to';
  }
  if (clause === 'state-boolean' && subject.states.length === 0) {
    if (subject.custom) return 'a custom claims no archetype contract, so no state is mandatory';
    if (subject.todoStates.length > 0) {
      return `the spec still records ${subject.todoStates.map((state) => `\`${state}\``).join(', ')} as TODO, and a TODO is never guessed at`;
    }
    return 'the recorded archetype makes no state mandatory';
  }
  if (clause === 'slot-token-valued' && Object.keys(subject.tokenSlots).length === 0) {
    return 'no slot in this spec is recorded with a token the design system names';
  }
  if ((clause === 'styling-not-passed-in' || clause === 'agent-props-are-closed') && !subject.contract) {
    return subject.custom
      ? 'a custom claims no archetype contract, so it has no contracted slot to protect'
      : 'no archetype is recorded, which the contract section reports rather than this one';
  }
  if (clause === 'styling-in-the-system' && subject.files.length === 0) {
    return 'nothing in the codebase is spelled as this component, so there is no file to read';
  }
  if (clause === 'content-from-the-caller' && !holdsContent(subject.contract)) {
    return subject.contract
      ? `the \`${subject.contract.key}\` archetype draws as \`${subject.contract.previewElement}\`, which holds no content`
      : 'no archetype is recorded, so nothing says whether this component holds content';
  }
  if (clause === 'human-call-by-name' && subject.module === null) {
    return 'nothing in the codebase is spelled as this component, so there is no export to hold the name to';
  }
  if (clause === 'agent-reads-one-source' && subject.archetype === null) {
    return 'the spec records no archetype, so there is no archetype line to read the contract from';
  }

  // And only then the project-level ones: a clause that has to mount the
  // component needs something to mount it with, and something to mount.
  if (usageClauses().find((entry) => entry.clause === clause)?.kind === RENDERED_CLAUSE) {
    if (render && render.found === false) return render.reason;
    if (subject.module === null) {
      return 'nothing in the codebase is spelled as this component, so there is no module to import and mount';
    }
  }
  return null;
}

/** An element that cannot hold children cannot be asked to render the caller's content. */
const holdsContent = (contract) =>
  Boolean(contract) && contract.previewElement !== null && contract.previewElement !== 'input';

// ---------------------------------------------------------------------------
// The dialect — one sentence, spelled for one runner
// ---------------------------------------------------------------------------

const quote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The assertion vocabulary, in whichever of the two styles the harness uses. */
export function assertions(harness) {
  const expect = harness.assertion === 'expect';
  return {
    equal: (actual, expected, message) =>
      expect
        ? `${indent}expect(${actual}).toBe(${expected});`
        : `${indent}assert.equal(${actual}, ${expected}, ${quote(message)});`,
    truthy: (actual, message) =>
      expect
        ? `${indent}expect(${actual}).toBeTruthy();`
        : `${indent}assert.ok(${actual}, ${quote(message)});`,
    contains: (haystack, needle, message) =>
      expect
        ? `${indent}expect(${haystack}).toContain(${needle});`
        : `${indent}assert.ok(${haystack}.includes(${needle}), ${quote(message)});`,
    notContains: (haystack, needle, message) =>
      expect
        ? `${indent}expect(${haystack}).not.toContain(${needle});`
        : `${indent}assert.ok(!${haystack}.includes(${needle}), ${quote(message)});`,
    notEqual: (actual, expected, message) =>
      expect
        ? `${indent}expect(${actual}).not.toBe(${expected});`
        : `${indent}assert.notEqual(${actual}, ${expected}, ${quote(message)});`,
  };
}

const indent = '    ';

/**
 * The body of one clause, in this project's dialect.
 *
 * One entry per clause in `phyllum:usage-clauses`, keyed by the same name. A
 * clause with no entry here is a programming error and is refused rather than
 * emitted empty — an empty case passes, and a passing test that asserts nothing
 * is the one output worse than no test at all.
 */
const BODIES = {
  'variant-closed': (s, a, r) => [
    `${indent}const recorded = ${r.render}(<${s.element} variant=${quote(s.variants[0])} />);`,
    a.contains('recorded.container.firstChild.className', quote(s.className), 'a recorded variant renders the recorded class'),
    `${indent}const invented = ${r.render}(<${s.element} variant="PhyllumInventedVariant" />);`,
    a.notContains(
      'String(invented.container.firstChild.className).toLowerCase()',
      "'phylluminventedvariant'",
      'a variant the design system does not record is not honoured',
    ),
  ],
  'state-boolean': (s, a, r) =>
    s.states.flatMap((state) => [
      `${indent}const off_${identifier(state)} = ${r.render}(<${s.element} />).container.innerHTML;`,
      `${indent}const on_${identifier(state)} = ${r.render}(<${s.element} ${state} />).container.innerHTML;`,
      a.notEqual(
        `on_${identifier(state)}`,
        `off_${identifier(state)}`,
        `\`${state}\` is a boolean prop, and its absence means off`,
      ),
    ]),
  'slot-token-valued': (s, a) =>
    Object.entries(s.tokenSlots).flatMap(([slot, token]) => [
      a.contains('SPEC', quote(`${slot}: ${token}`), `the spec records \`${slot}\` as \`${token}\``),
      a.truthy(
        `/\\|\\s*${escapeRegExp(token)}\\s*\\|/.test(SYSTEM)`,
        `\`${token}\` is a token the design system's own tables record`,
      ),
    ]),
  'styling-not-passed-in': (s, a, r) => [
    `${indent}const forced = ${r.render}(<${s.element} style={{ background: '#FF00FF' }} />);`,
    a.notContains(
      'forced.container.innerHTML.toUpperCase()',
      "'#FF00FF'",
      'a styling value handed in at the call site does not reach a contracted slot',
    ),
  ],
  'styling-in-the-system': (s, a) =>
    s.files.flatMap((file) => [
      `${indent}const source_${identifier(file)} = fs.readFileSync(path.resolve(${quote(file)}), 'utf8');`,
      a.equal(
        `/#[0-9A-Fa-f]{3,8}\\b/.test(source_${identifier(file)})`,
        'false',
        `${file} writes a colour by hand instead of reaching for a token`,
      ),
    ]),
  'content-from-the-caller': (s, a, r) => [
    `${indent}${r.render}(<${s.element}>Phyllum</${s.element}>);`,
    a.truthy(`${r.query}.getByText('Phyllum')`, 'the content the caller passes is the content that renders'),
  ],
  'human-call-by-name': (s, a) => [
    a.equal(`typeof ${s.element}`, quote('function'), `\`${s.element}\` is the name the design system records`),
  ],
  'human-minimal-call': (s, a, r) => [
    `${indent}const minimal = ${r.render}(<${s.element}>Phyllum</${s.element}>);`,
    a.truthy('minimal.container.firstChild', 'the documented minimal call renders with no prop beyond its content'),
  ],
  'agent-props-are-closed': (s, a, r) => [
    `${indent}const extended = ${r.render}(<${s.element} phyllumUnrecordedProp="loud" />);`,
    a.notContains(
      'extended.container.innerHTML',
      "'loud'",
      'a prop the spec does not record is not honoured — an agent may not extend the contract',
    ),
  ],
  'agent-reads-one-source': (s, a) => [
    a.contains('SYSTEM', quote(`### ${s.name}`), 'the design system still records this component'),
    a.contains('SPEC', quote(`archetype: ${s.archetype}`), 'the archetype the contract is read from'),
  ],
};

const identifier = (word) => String(word).replace(/[^A-Za-z0-9]+/g, '_');
const escapeRegExp = (word) => String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

/** The extension a generated file wears — the component's own, or the default. */
export function testExtension(subject, { rendered }) {
  const own = subject.module ? path.extname(subject.module).toLowerCase() : '';
  if (own === '.tsx' || own === '.ts') return rendered ? 'tsx' : 'ts';
  return rendered ? 'jsx' : 'js';
}

/**
 * Where the file would sit — beside the component, or under `tests/`.
 *
 * A proposal, and nothing more. Phyllum computes it so a reader knows what is
 * being offered; it never writes to it, because a file inside the user's test
 * tree is outside the one write funnel this tool has.
 */
export function proposedTestPath(subject, extension) {
  const name = `${subject.element}.usage.test.${extension}`;
  const dir = subject.module ? path.dirname(subject.module) : FALLBACK_TEST_DIR;
  return dir === '.' ? name : `${dir}/${name}`;
}

/**
 * The whole text of one component's usage-contract test file.
 *
 * Deterministic: the same spec, the same harness and the same files produce the
 * same bytes, which is what makes a regenerated file diffable against the one
 * somebody placed last month.
 */
export function renderTestFile(contract, { harness, render }) {
  const s = contract.subject;
  const a = assertions(harness);
  const stated = contract.clauses.filter((clause) => clause.stated);
  const rendered = stated.some((clause) => clause.kind === RENDERED_CLAUSE);

  const lines = [
    `// Generated by \`phyllum refine tests\` from the ${s.name} spec block in`,
    '// DESIGN-SYSTEM.md. Phyllum rendered this text; placing it in your test tree',
    '// is your call. Regenerate it when the spec changes rather than editing it',
    '// here and there.',
    '',
    ...harness.imports,
    "import fs from 'node:fs';",
    "import path from 'node:path';",
  ];
  if (rendered) lines.push(...render.imports);
  if (s.module) lines.push(`import { ${s.element} } from ${quote(relativeImport(s.module))};`);
  lines.push(
    '',
    "const SYSTEM = fs.readFileSync(path.resolve('DESIGN-SYSTEM.md'), 'utf8');",
    `const SPEC = (SYSTEM.split(${quote(`### ${s.name}`)})[1] ?? '').split('\\n### ')[0];`,
    '',
    `${harness.suite}(${quote(`${s.name} — usage contract`)}, () => {`,
  );

  stated.forEach((clause, index) => {
    const body = BODIES[clause.clause];
    if (!body) throw new Error(`no body is written for the \`${clause.clause}\` clause`);
    const emitted = body(s, a, render);
    if (emitted.length === 0) throw new Error(`the \`${clause.clause}\` clause emitted no assertion`);
    if (index > 0) lines.push('');
    lines.push(`  ${harness.case}(${quote(`${clause.family}: ${clause.asserts}`)}, () => {`);
    lines.push(...emitted);
    lines.push('  });');
  });

  lines.push('});', '');
  return lines.join('\n');
}

/** The specifier a test file beside the component would import it by. */
function relativeImport(module) {
  const base = module.replace(/\.(jsx?|tsx?|mjs|cjs)$/i, '');
  return `./${path.basename(base)}`;
}

/** A test this project already carries for this component, if it carries one. */
export function existingTests(root, subject) {
  const resolved = path.resolve(root);
  const found = [];
  const bases = [subject.element, subject.className];
  const dirs = new Set([
    ...TEST_DIRS,
    ...(subject.module ? [path.dirname(subject.module), `${path.dirname(subject.module)}/__tests__`] : []),
  ]);
  for (const dir of dirs) {
    const full = path.join(resolved, dir);
    let entries;
    try {
      entries = fs.readdirSync(full, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.(test|spec)\.[jt]sx?$/i.test(entry.name)) continue;
      const stem = entry.name.toLowerCase();
      if (!bases.some((base) => stem.startsWith(String(base).toLowerCase()))) continue;
      found.push(`${dir}/${entry.name}`.replace(/^\.\//, ''));
    }
  }
  return [...new Set(found)].sort();
}

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

/**
 * `refine tests` over every recorded component.
 *
 * Two answers come back per component and they are different questions kept
 * apart on purpose: the **proposal** is the text Phyllum rendered, and
 * `existing` is what the project already has. A file Phyllum rendered but
 * nobody placed is not a test this project carries, so ship criterion 5 reads
 * `existing`, never the proposal.
 */
export function refineTests(root, model, options = {}) {
  const manifest = readManifest(root);
  const harness = options.harness ?? detectTestHarness(root, { manifest });
  const render = options.render ?? detectRenderLibrary(root, { manifest });
  const suite = options.suite ?? detectTestSuite(root);
  const entries =
    options.files ?? componentFiles(root, model, { signatures: options.signatures ?? null });

  const components = (model?.components ?? []).map((component) => {
    const files = entries.find((row) => row.component === component.name)?.files ?? [];
    const contract = usageContract(component, { model, files, render });
    const stated = contract.clauses.filter((clause) => clause.stated);
    const proposal =
      stated.length === 0
        ? null
        : (() => {
            const extension = testExtension(contract.subject, {
              rendered: stated.some((clause) => clause.kind === RENDERED_CLAUSE),
            });
            return {
              path: proposedTestPath(contract.subject, extension),
              contents: renderTestFile(contract, { harness, render }),
              written: false,
            };
          })();

    return {
      component: contract.component,
      subject: contract.subject,
      clauses: contract.clauses,
      stated: stated.map((clause) => clause.clause),
      unstated: contract.clauses
        .filter((clause) => !clause.stated)
        .map((clause) => ({ clause: clause.clause, reason: clause.reason })),
      families: [...new Set(stated.map((clause) => clause.family))],
      proposal,
      existing: existingTests(root, contract.subject),
    };
  });

  return {
    ran: true,
    reason: null,
    harness,
    render,
    suite,
    components,
    // The section's own verdict is about what the project has, not about what
    // Phyllum just rendered. A component with no test on disk is why criterion
    // 5 goes unmet, and generating one does not change that.
    findings: components
      .filter((entry) => entry.existing.length === 0)
      .map((entry) => ({
        rule: 'no-usage-contract-test',
        severity: 'error',
        value: entry.component,
        detail: `no usage-contract test covers \`${entry.component}\` — \`refine tests\` rendered one, and placing it is yours to do`,
        evidence: entry.proposal ? [entry.proposal.path] : [],
      })),
    pass: components.length === 0 ? null : components.every((entry) => entry.existing.length > 0),
  };
}

/** The clauses this section may assert, straight from the table. */
export const clauses = () => usageClauses().map((row) => row.clause);
