/**
 * Assertions for `refine tests` (v0.11.0 phase 3).
 *
 * The mode that *writes code* is the mode with the most ways to be quietly
 * wrong, so the promises checked here are the ones the protocol makes rather
 * than the shape of any one generated line:
 *
 *   1. **The contract is derived from the spec, and nowhere else.** Every
 *      clause traces back to a `properties:` line, an archetype row or a
 *      recorded name. Where the spec is silent, the clause is reported unstated
 *      with its reason — never filled in from what the name looks like.
 *   2. **All three families are covered.** Type strictness, where data may
 *      live, and correct use by a human and by an agent. A generated file that
 *      lost a family would still look like a test suite.
 *   3. **The generated text matches the project's runner**, and a project whose
 *      runner cannot be identified is told which fallback it got.
 *   4. **Nothing is written.** Not into the test tree, not anywhere. The
 *      proposal is text plus a path Phyllum computed and never used.
 *
 * The clause table is read from `refs/refine/protocol-usage-contract.md`, so a
 * clause added there without a body in `lib/refine-tests.js` fails here rather
 * than being emitted empty.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse } from '../../lib/design-system.js';
import { CLAUSE_FAMILIES, usageClauses } from '../../lib/refine-spec.js';
import {
  FALLBACK_HARNESS,
  detectRenderLibrary,
  detectTestHarness,
  existingTests,
  proposedTestPath,
  recordedSlots,
  recordedVariants,
  refineTests,
  renderTestFile,
  usageContract,
} from '../../lib/refine-tests.js';
import { POPULATED_FIXTURE, diffSnapshots, readFixture, snapshotContents, withTempDir } from './helpers.js';

/** A project with the files a case needs, and nothing else. */
function project(dir, files = {}) {
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return dir;
}

const BUTTON_SOURCE =
  'export function ButtonPrimary({ children }) {\n' +
  '  return <button className="button-primary">{children}</button>;\n' +
  '}\n';

/** The populated fixture, a React button beside it, and a runner of your choosing. */
function reactProject(dir, { manifest = {}, extra = {} } = {}) {
  return project(dir, {
    'DESIGN-SYSTEM.md': readFixture(POPULATED_FIXTURE),
    'src/ButtonPrimary.jsx': BUTTON_SOURCE,
    'package.json': JSON.stringify({ name: 'x', ...manifest }),
    ...extra,
  });
}

const modelIn = (dir) => parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
const named = (result, name) => result.components.find((row) => row.component === name);
const clauseIn = (entry, clause) => entry.clauses.find((row) => row.clause === clause);

const VITEST = { devDependencies: { vitest: '^1.0.0', '@testing-library/react': '^14.0.0' } };

// ---------------------------------------------------------------------------
// The contract, derived from the spec
// ---------------------------------------------------------------------------

test('every clause in the reference table has a body, and no body invents a clause', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST });
    const entry = named(refineTests(dir, modelIn(dir)), 'Button/Primary');
    const declared = usageClauses().map((row) => row.clause);
    assert.deepEqual(entry.clauses.map((row) => row.clause), declared, 'the contract is the table, in table order');
    // Every clause the fixture states rendered a body; `renderTestFile` throws
    // rather than emitting an empty case, so reaching here is the assertion.
    assert.ok(entry.stated.length >= 8, `only ${entry.stated.length} clauses were stated for a fully specified button`);
  });
});

test('the three families of the usage contract are all covered', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST });
    const entry = named(refineTests(dir, modelIn(dir)), 'Button/Primary');
    assert.deepEqual([...entry.families].sort(), [...CLAUSE_FAMILIES].sort());
    for (const family of CLAUSE_FAMILIES) {
      assert.ok(
        entry.proposal.contents.includes(`'${family}: `),
        `the generated file has no case for the ${family} family`,
      );
    }
  });
});

test('the contracted slots are the spec’s own, and a token cell is what makes one a token', async () => {
  const spec = 'name: Button/Primary\nproperties:\n  background: color-primary\n  padding-top: 12px # TODO: tokenise\n  radius: TODO\nstates:\n  disabled: TODO\n';
  assert.deepEqual(recordedSlots(spec), { background: 'color-primary', 'padding-top': '12px' });
  assert.equal(recordedSlots(spec).radius, undefined, 'a slot recorded TODO is a silence, not a slot');
});

test('the variants are the ones the design system records under the same base', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  assert.deepEqual(recordedVariants(model, 'Button/Primary'), ['Primary']);
  assert.deepEqual(recordedVariants(model, 'Nothing/Here'), [], 'a base nobody records has no variants');
});

// ---------------------------------------------------------------------------
// Where the spec is silent
// ---------------------------------------------------------------------------

test('a state the spec still records as TODO carries no test, and says why', async () => {
  await withTempDir(async (dir) => {
    // The fixture's button records `disabled: TODO`; `hover` is mandatory and
    // undecided, so the clause is stated for hover alone.
    reactProject(dir, { manifest: VITEST });
    const entry = named(refineTests(dir, modelIn(dir)), 'Button/Primary');
    assert.equal(entry.subject.states.includes('disabled'), false, 'a TODO state is never guessed at');
    assert.deepEqual(entry.subject.todoStates, ['disabled']);
    assert.ok(entry.proposal.contents.includes('<ButtonPrimary hover />'));
    assert.equal(entry.proposal.contents.includes('<ButtonPrimary disabled />'), false);
  });
});

test('a component the codebase does not contain loses every clause that needs it, each with a reason', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST });
    const entry = named(refineTests(dir, modelIn(dir)), 'Card/Basic');
    const unstated = new Map(entry.unstated.map((row) => [row.clause, row.reason]));
    for (const clause of ['human-minimal-call', 'agent-props-are-closed', 'human-call-by-name']) {
      assert.ok(unstated.has(clause), `${clause} was stated for a component with no module`);
      assert.match(unstated.get(clause), /nothing in the codebase is spelled as this component/);
    }
    assert.ok(entry.stated.includes('slot-token-valued'), 'the spec clauses still stand — the spec is on disk');
  });
});

test('a clause with no spec behind it is reported unstated, never guessed at', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, {
      manifest: VITEST,
      extra: {
        'DESIGN-SYSTEM.md': readFixture(POPULATED_FIXTURE).replace('archetype: card\n', ''),
      },
    });
    const entry = named(refineTests(dir, modelIn(dir)), 'Card/Basic');
    assert.equal(clauseIn(entry, 'agent-reads-one-source').stated, false);
    assert.match(clauseIn(entry, 'agent-reads-one-source').reason, /no archetype/);
    assert.match(clauseIn(entry, 'content-from-the-caller').reason, /no archetype is recorded/);
  });
});

test('a custom is given no archetype clause, because it claims no archetype contract', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  const component = model.components.find((row) => row.name === 'Card/Basic');
  const blocks = component.blocks.map((block) =>
    block.lang === 'yaml' ? { ...block, content: block.content.replace('archetype: card', 'archetype: custom') } : block,
  );
  const contract = usageContract({ ...component, blocks }, { model, files: [], render: { found: true } });
  const reason = contract.clauses.find((row) => row.clause === 'agent-props-are-closed').reason;
  assert.match(reason, /custom claims no archetype contract/);
});

// ---------------------------------------------------------------------------
// The harness
// ---------------------------------------------------------------------------

test('the runner is detected from a config file or an installed package', async () => {
  await withTempDir(async (dir) => {
    project(dir, { 'vitest.config.ts': 'export default {};\n' });
    assert.equal(detectTestHarness(dir).id, 'vitest');
    assert.equal(detectTestHarness(dir).evidence, 'vitest.config.ts');
    project(dir, { 'package.json': JSON.stringify({ devDependencies: { jest: '^29.0.0' } }) });
    fs.rmSync(path.join(dir, 'vitest.config.ts'));
    const jest = detectTestHarness(dir);
    assert.equal(jest.id, 'jest');
    assert.deepEqual(jest.imports, [], 'jest’s suite and case functions are globals');
  });
});

test('an undetectable harness gets a stated fallback, not silence', async () => {
  await withTempDir(async (dir) => {
    project(dir, { 'package.json': JSON.stringify({ name: 'x' }) });
    const harness = detectTestHarness(dir);
    assert.equal(harness.id, FALLBACK_HARNESS);
    assert.equal(harness.found, false);
    assert.equal(harness.fallback, true);
    assert.match(harness.reason, /no test runner was detected/);
    assert.match(harness.reason, /node/);
  });
});

test('the generated file is written in the detected runner’s dialect', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST });
    const vitest = named(refineTests(dir, modelIn(dir)), 'Button/Primary').proposal.contents;
    assert.ok(vitest.startsWith('// Generated by `phyllum refine tests`'));
    assert.ok(vitest.includes("import { describe, expect, it } from 'vitest';"));
    assert.ok(vitest.includes('  it('), 'vitest names its cases `it`');
    assert.ok(vitest.includes('expect(') && !vitest.includes('assert.'));

    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
    const fallback = named(refineTests(dir, modelIn(dir)), 'Button/Primary').proposal.contents;
    assert.ok(fallback.includes("import assert from 'node:assert/strict';"));
    assert.ok(fallback.includes("import test, { describe } from 'node:test';"));
    assert.ok(fallback.includes('  test('), 'node names its cases `test`');
    assert.ok(fallback.includes('assert.') && !fallback.includes('expect('));
  });
});

test('a project with nothing to mount with gets the spec clauses and a reason for the rest', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: { devDependencies: { vitest: '^1.0.0' } } });
    const result = refineTests(dir, modelIn(dir));
    assert.equal(result.render.found, false);
    assert.match(result.render.reason, /@testing-library\/react/);
    const entry = named(result, 'Button/Primary');
    for (const clause of entry.clauses) {
      if (clause.kind !== 'rendered') continue;
      assert.equal(clause.stated, false, `${clause.clause} was emitted with nothing to mount it`);
      assert.match(clause.reason, /no render library is installed/);
    }
    assert.deepEqual([...entry.families].sort(), [...CLAUSE_FAMILIES].sort(), 'every family keeps its spec clauses');
    assert.deepEqual(entry.stated, ['slot-token-valued', 'styling-in-the-system', 'human-call-by-name', 'agent-reads-one-source']);
    assert.equal(entry.proposal.contents.includes('render('), false, 'and no case pretends to render');
    assert.equal(entry.proposal.contents.includes('@testing-library'), false);
  });
});

test('the same spec and the same project produce the same bytes', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST });
    const model = modelIn(dir);
    const once = named(refineTests(dir, model), 'Button/Primary').proposal.contents;
    const twice = named(refineTests(dir, model), 'Button/Primary').proposal.contents;
    assert.equal(once, twice);
  });
});

// ---------------------------------------------------------------------------
// What the generated tests actually assert
// ---------------------------------------------------------------------------

test('the type clauses hold the variant, the state and the slot to what is recorded', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST });
    const contents = named(refineTests(dir, modelIn(dir)), 'Button/Primary').proposal.contents;
    assert.ok(contents.includes("<ButtonPrimary variant='Primary' />"), 'the recorded variant is honoured');
    assert.ok(contents.includes('PhyllumInventedVariant'), 'and an invented one is not');
    assert.ok(contents.includes('<ButtonPrimary hover />'), 'a state is a bare boolean prop');
    assert.ok(contents.includes("expect(SPEC).toContain('background: color-primary')"));
    assert.ok(contents.includes('/\\|\\s*color-primary\\s*\\|/.test(SYSTEM)'), 'the token is one the tables record');
  });
});

test('the data clauses keep styling in the system and content with the caller', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST });
    const contents = named(refineTests(dir, modelIn(dir)), 'Button/Primary').proposal.contents;
    assert.ok(contents.includes("style={{ background: '#FF00FF' }}"), 'a value from the call site is tried');
    assert.ok(contents.includes(".not.toContain('#FF00FF')"), 'and must not reach the rendered output');
    assert.ok(contents.includes("fs.readFileSync(path.resolve('src/ButtonPrimary.jsx'), 'utf8')"));
    assert.ok(contents.includes('<ButtonPrimary>Phyllum</ButtonPrimary>'), 'the caller’s content renders');
  });
});

test('the usage clauses cover the human call and the agent’s closed vocabulary', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST });
    const contents = named(refineTests(dir, modelIn(dir)), 'Button/Primary').proposal.contents;
    assert.ok(contents.includes("import { ButtonPrimary } from './ButtonPrimary';"), 'imported by its recorded name');
    assert.ok(contents.includes("expect(typeof ButtonPrimary).toBe('function')"));
    assert.ok(contents.includes('phyllumUnrecordedProp'), 'an agent may not extend the contract');
    assert.ok(contents.includes("expect(SYSTEM).toContain('### Button/Primary')"), 'one source for the contract');
    assert.ok(contents.includes("expect(SPEC).toContain('archetype: button')"));
  });
});

test('a component whose spec supports no clause at all gets no proposal', () => {
  const contract = usageContract(
    { name: 'Widget', blocks: [] },
    { model: { components: [], tokens: {} }, files: [], render: { found: false, reason: 'no render library is installed here' } },
  );
  assert.deepEqual(contract.clauses.filter((row) => row.stated), [], 'nothing is recorded, so nothing is asserted');
  for (const clause of contract.clauses) assert.ok(clause.reason.length > 0, `${clause.clause} is silent about why`);
});

// ---------------------------------------------------------------------------
// The proposal, and the write rule
// ---------------------------------------------------------------------------

test('the proposed path sits beside the component, or under tests/ when there is none', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST });
    const result = refineTests(dir, modelIn(dir));
    assert.equal(named(result, 'Button/Primary').proposal.path, 'src/ButtonPrimary.usage.test.jsx');
    assert.equal(named(result, 'Card/Basic').proposal.path, 'tests/CardBasic.usage.test.js');
    assert.equal(
      proposedTestPath({ element: 'ButtonPrimary', module: 'ButtonPrimary.tsx' }, 'tsx'),
      'ButtonPrimary.usage.test.tsx',
      'a component at the root proposes a file at the root',
    );
  });
});

test('a TypeScript component proposes a TypeScript test', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST, extra: { 'src/ButtonPrimary.tsx': BUTTON_SOURCE } });
    fs.rmSync(path.join(dir, 'src', 'ButtonPrimary.jsx'));
    assert.equal(named(refineTests(dir, modelIn(dir)), 'Button/Primary').proposal.path, 'src/ButtonPrimary.usage.test.tsx');
  });
});

test('a test the project already carries is reported, and the generated one is still offered', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST, extra: { 'src/ButtonPrimary.test.jsx': '// somebody wrote this\n' } });
    const result = refineTests(dir, modelIn(dir));
    const button = named(result, 'Button/Primary');
    assert.deepEqual(button.existing, ['src/ButtonPrimary.test.jsx']);
    assert.ok(button.proposal, 'the generated text is still returned — the choice is the user’s');
    assert.deepEqual(result.findings.map((row) => row.value), ['Card/Basic'], 'only the uncovered component is a finding');
    assert.equal(result.pass, false, 'one component covered is not the section passing');
    assert.equal(existingTests(dir, button.subject).length, 1);
  });
});

test('a component with no test on disk is why the ship criterion goes unmet', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST });
    const result = refineTests(dir, modelIn(dir));
    assert.equal(result.pass, false);
    assert.deepEqual(result.findings.map((row) => row.rule), ['no-usage-contract-test', 'no-usage-contract-test']);
    assert.match(result.findings[0].detail, /rendered one, and placing it is yours to do/);
    for (const row of result.findings) assert.equal(row.severity, 'error');
  });
});

test('the section writes nothing — not into the test tree, not anywhere', async () => {
  await withTempDir(async (dir) => {
    reactProject(dir, { manifest: VITEST });
    const before = snapshotContents(dir);
    const result = refineTests(dir, modelIn(dir));
    detectTestHarness(dir);
    detectRenderLibrary(dir);
    renderTestFile(usageContract(modelIn(dir).components[0], { model: modelIn(dir), files: [], render: result.render }), {
      harness: result.harness,
      render: result.render,
    });
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
    for (const entry of result.components) {
      if (!entry.proposal) continue;
      assert.equal(entry.proposal.written, false, 'a proposal is a path Phyllum computed and never used');
      assert.equal(
        fs.existsSync(path.join(dir, entry.proposal.path)),
        false,
        `${entry.proposal.path} was written — the mechanical layer may not place a test`,
      );
    }
  });
});

test('no write call exists in the module at all', () => {
  const source = fs.readFileSync(new URL('../../lib/refine-tests.js', import.meta.url), 'utf8');
  for (const call of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'writeFile(']) {
    assert.equal(source.includes(call), false, `lib/refine-tests.js calls ${call}`);
  }
});
