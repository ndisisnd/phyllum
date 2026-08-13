/**
 * Assertions for the hygiene checks — collisions and unused (v0.2.1 plan §6).
 *
 * Two questions that are about the project rather than about any value in it:
 * what is fighting what, and what is here that nothing needs. They share a shape
 * with the value findings — a rule family and a severity — and nothing else, so
 * what is checked here is mostly the seams.
 *
 *   - **Detection keeps its contract.** The winner is still one framework, one
 *     styling system, one label; the evidence behind it is reported beside it
 *     rather than instead of it. Every caller that reads `styling` reads the same
 *     answer it read before.
 *   - **Judging happens in `assess`, seeing happens in `detect`.** The detector
 *     reports two frameworks; deciding that two is a finding is the assessment's
 *     job, exactly as severity is.
 *   - **"Unused" states its own limits.** The check is bounded and text-based, so
 *     every finding carries the caveat, the report prints it next to the rows it
 *     applies to, and nothing is ever removed — including by `assess update`,
 *     the one mode that writes without being asked twice.
 *
 * The cases that matter most are the ones asserting an absence: a Tailwind
 * `globals.css` that is not a second styling system, a Next.js app that is not
 * two frameworks, a token saved by its name after its value drifted, and a Vue
 * project that is told its components were not checked rather than that they are
 * all unused.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ERROR, SCAN_LIMITS, WARN, assess } from '../../lib/assess.js';
import {
  UNUSED_CAVEAT,
  collisionFindings,
  tokenSpellings,
  unusedComponents,
  unusedTokens,
} from '../../lib/assess-hygiene.js';
import { renderHygiene } from '../../lib/assess-command.js';
import { namesForComponent, registeredNames, scanMarkup } from '../../lib/candidates.js';
import { emptyModel, parse } from '../../lib/design-system.js';
import { detectProject } from '../../lib/detect.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { hygieneRules, hygieneSeverityFor } from '../../lib/tokenise-spec.js';
import {
  FIXTURES,
  PACKAGE_ROOT,
  copyDir,
  diffSnapshots,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const codebase = (name) => path.join(FIXTURES, 'codebases', name);

const COLLISIONS = codebase('collisions');
const STALE = codebase('stale-system');
/** The fixture whose colours live in custom properties and are spent as `var()`. */
const DRIFT = codebase('dark-drift');

/** The stale fixture carries its own design system; the check needs both. */
const staleModel = () => parse(fs.readFileSync(path.join(STALE, 'DESIGN-SYSTEM.md'), 'utf8'));

const rulesIn = (findings) => findings.map((finding) => finding.rule);

// ---------------------------------------------------------------------------
// Detection reports its evidence, and keeps its answer (§6.1)
// ---------------------------------------------------------------------------

test('the single winner is unchanged by the evidence reported beside it', () => {
  const detection = detectProject(COLLISIONS);
  assert.equal(detection.framework, 'React', 'the manifest still picks one framework');
  assert.equal(detection.frameworkId, 'react');
  assert.equal(detection.styling, 'Tailwind', 'and one styling system, by the same precedence');
  assert.equal(detection.supported, true);
  assert.equal(detection.codeView.language, 'React');
});

test('every framework in the project is reported, not only the winner', () => {
  const { frameworks } = detectProject(COLLISIONS);
  assert.deepEqual(
    frameworks.map((item) => item.name),
    ['React', 'Vue'],
  );
  for (const item of frameworks) {
    assert.ok(item.evidence, `${item.name} says where it was seen`);
    assert.ok(item.family, `${item.name} carries the family that makes it countable`);
  }
});

test('Next is React, not a second framework', () => {
  const { frameworks, framework } = detectProject(codebase('tailwind'));
  assert.equal(framework, 'React (Next.js)', 'the finer label still wins');
  assert.equal(frameworks.length, 1, 'and one family means one entry');
  assert.equal(frameworks[0].family, 'react');
});

test('plain HTML is the absence of a framework, never a rival to one', () => {
  const { frameworks, frameworkId } = detectProject(codebase('plain-html'));
  assert.equal(frameworkId, 'html', 'the winner still names it');
  assert.deepEqual(frameworks, [], 'but it can never collide with anything');
});

test('two majors of one framework are read from the whole dependency tree', () => {
  const { duplicateMajors } = detectProject(COLLISIONS);
  assert.equal(duplicateMajors.length, 1);
  const [duplicate] = duplicateMajors;
  assert.equal(duplicate.package, 'react', 'an `npm:react@…` alias is still react');
  assert.deepEqual(duplicate.majors, ['17', '18']);
  assert.deepEqual(duplicate.where, ['dependencies', 'devDependencies']);
});

test('one major written several ways is one major', () => {
  const { duplicateMajors } = detectProject(codebase('react-css'));
  assert.deepEqual(duplicateMajors, [], 'react and react-dom at ^18 is one framework, once');
});

test('every styling system that is live is reported, in the winner order', () => {
  const { stylings } = detectProject(COLLISIONS);
  assert.deepEqual(
    stylings.map((item) => item.id),
    ['tailwind', 'css-in-js', 'css'],
  );
});

test("Tailwind's own entry stylesheet is not a second styling system", async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'tw', dependencies: { react: '^18.0.0', tailwindcss: '^3.4.0' } }),
    );
    fs.writeFileSync(path.join(dir, 'styles.css'), '@tailwind base;\n@tailwind utilities;\n');
    const detection = detectProject(dir);
    assert.deepEqual(
      detection.stylings.map((item) => item.id),
      ['tailwind'],
      'a globals.css of @tailwind directives is how Tailwind is installed',
    );
    assert.deepEqual(collisionFindings(detection), [], 'so a normal Tailwind app collides with nothing');
  });
});

test('Phyllum’s own record is never counted as a rival theme source', () => {
  const { artefacts, themeSources } = detectProject(STALE);
  assert.ok(artefacts.includes('DESIGN-SYSTEM.md'), 'it is still listed as an artefact');
  assert.ok(!themeSources.includes('DESIGN-SYSTEM.md'), 'and never as a source of truth to compete with');
});

// ---------------------------------------------------------------------------
// Collisions are findings, in the vocabulary the value findings use (§6.1)
// ---------------------------------------------------------------------------

test('a project with three collisions reports three kinds of them', () => {
  const findings = collisionFindings(detectProject(COLLISIONS));
  assert.deepEqual(rulesIn(findings), [
    'framework-collision',
    'framework-collision',
    'styling-collision',
    'theme-source-collision',
  ]);
  for (const finding of findings) {
    assert.ok(finding.value, 'a finding names what collided');
    assert.ok(finding.detail.length > 0, 'and says why that matters');
    assert.ok(finding.evidence.length > 0, 'and shows the evidence rather than asserting it');
  }
});

test('a single-stack project reports no collisions at all', () => {
  for (const fixture of ['react-css', 'vue-app', 'plain-html', 'empty-project']) {
    assert.deepEqual(
      collisionFindings(detectProject(codebase(fixture))),
      [],
      `${fixture}: one stack is not a collision`,
    );
  }
});

test('every hygiene severity comes from the table, and every rule is in it', () => {
  const declared = hygieneRules();
  const spec = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'refs', 'assess.md'), 'utf8');
  assert.ok(spec.includes('<!-- phyllum:hygiene-rules -->'), 'the table is marked for the parser');

  const result = assess(STALE, staleModel());
  const findings = [...collisionFindings(detectProject(COLLISIONS)), ...result.hygiene.findings];
  assert.ok(findings.length > 0, 'there is something to check');
  for (const finding of findings) {
    assert.ok(declared.includes(finding.rule), `${finding.rule} is not a documented family`);
    assert.equal(finding.severity, hygieneSeverityFor(finding.rule), 'severity is read, not restated');
    assert.equal(finding.severity, WARN, 'nothing here has an answer Phyllum could apply for you');
  }
});

// ---------------------------------------------------------------------------
// Unused tokens — the coverage split, run backwards (§6.2)
// ---------------------------------------------------------------------------

test('a token no sighting names and no code writes is reported as unused', () => {
  const result = assess(STALE, staleModel());
  assert.deepEqual(
    result.hygiene.unused.tokens.map((row) => row.token),
    ['color-legacy', 'radius-pill', 'type-display'],
  );
  for (const row of result.hygiene.unused.tokens) {
    assert.equal(row.rule, 'unused-token');
    assert.ok(row.section, 'a stale token says which section it sits in');
    assert.ok(row.detail.includes(UNUSED_CAVEAT), 'and carries the caveat with it');
  }
});

test('a token the codebase does write is never called unused', () => {
  const result = assess(STALE, staleModel());
  const unused = result.hygiene.unused.tokens.map((row) => row.token);
  assert.ok(!unused.includes('color-primary'), 'its value is written in the stylesheet');
  assert.ok(!unused.includes('space-4'), 'and so is this one');
});

test('a token whose value drifted is still used if its name is', () => {
  const result = assess(STALE, staleModel());
  const unused = result.hygiene.unused.tokens.map((row) => row.token);
  assert.ok(
    !unused.includes('space-8'),
    'the system says 32px and the code says 31px — that is drift, reported once, by the value rules',
  );
  const drift = [...result.values.uncovered, ...result.values.unreadable].find((row) =>
    String(row.value).includes('31'),
  );
  assert.ok(drift, 'and the drift itself is still a finding of the value rules');
});

test('a token spent only through var() is used, not unused (v0.2.1 M6)', () => {
  const model = emptyModel();
  model.tokens.colours.push(['color-ink', '#111827', 'body text']);
  // Nothing here writes `#111827` — the literal lives in the custom property,
  // and every use of it is a `var()` reference. Before M6 the declaration was
  // dropped by the rerun diff precisely *because* the design system named that
  // colour, so the one row carrying the token's name never reached this check
  // and the token was reported as safe to delete.
  assert.deepEqual(
    unusedTokens(model, { covered: [], inventory: [], unreadable: [], names: ['--color-ink'] }).map(
      (row) => row.token,
    ),
    [],
  );
  // And the name test stays a whole-word one: a longer custom property is not
  // evidence for a shorter token.
  assert.deepEqual(
    unusedTokens(model, {
      covered: [],
      inventory: [],
      unreadable: [],
      names: ['--color-ink-strong'],
    }).map((row) => row.token),
    ['color-ink'],
  );
});

test('the scan collects custom-property names, declared and spent', () => {
  const result = assess(DRIFT, parse(fs.readFileSync(path.join(DRIFT, 'DESIGN-SYSTEM.md'), 'utf8')));
  // The evidence is a flat, sorted list of spellings — deliberately not a
  // finding, a severity or a proposal. It exists to answer one question.
  assert.ok(result.values.names.includes('--color-primary'));
  assert.deepEqual([...result.values.names].sort(), result.values.names, 'sorted, so two runs agree');
  assert.ok(
    !result.hygiene.unused.tokens.some((row) => row.token === 'color-primary'),
    'and the token it is spelled from is no longer called unused',
  );
});

test('name spellings cover the ways a codebase writes a token', () => {
  assert.deepEqual(tokenSpellings('color-primary'), ['color-primary', '--color-primary', 'colorPrimary']);
  assert.deepEqual(tokenSpellings(''), [], 'a nameless row spells nothing');
});

test('a longer name is not a match for a shorter one', async () => {
  const model = emptyModel();
  model.tokens.numbers.push(['space-4', '4px', 'spacing']);
  const values = { covered: [], inventory: [], unreadable: [{ value: '40px', properties: ['space-40'] }] };
  assert.deepEqual(
    unusedTokens(model, values).map((row) => row.token),
    ['space-4'],
    'space-40 in the code does not make space-4 used',
  );
});

test('an empty design system has no unused tokens, because it has no tokens', () => {
  const result = assess(STALE, emptyModel());
  assert.deepEqual(result.hygiene.unused.tokens, []);
  assert.deepEqual(result.hygiene.unused.components, []);
});

// ---------------------------------------------------------------------------
// Unused components — only where the markup was read (§6.2)
// ---------------------------------------------------------------------------

test('a registered component no markup mentions is reported, and one that is used is not', () => {
  const result = assess(STALE, staleModel());
  assert.equal(result.hygiene.unused.componentsChecked, true);
  assert.deepEqual(
    result.hygiene.unused.components.map((row) => row.component),
    ['Card'],
  );
  const [card] = result.hygiene.unused.components;
  assert.ok(card.spellings.length > 0, 'the finding shows which spellings were looked for');
  assert.ok(card.detail.includes(UNUSED_CAVEAT));
});

test('every spelling registeredNames knows is a spelling one component can be found by', () => {
  const model = staleModel();
  const all = registeredNames(model);
  for (const component of model.components) {
    for (const spelling of namesForComponent(component.name)) {
      assert.ok(all.has(spelling), `${component.name}: ${spelling} is missing from the registered set`);
    }
  }
});

test('on a stack whose component pass did not run, components are not judged at all', () => {
  const model = staleModel();
  const result = assess(codebase('vue-app'), model);
  assert.equal(result.components.ran, false);
  assert.equal(result.hygiene.unused.componentsChecked, false);
  assert.deepEqual(result.hygiene.unused.components, [], 'silence, rather than "all of them are unused"');
  assert.ok(result.hygiene.unused.componentsReason.includes('React-only'), 'and the reason is the honest one');
});

test('the markup is walked once and the list handed to every pass (v0.2.1 M6)', () => {
  const root = codebase('mixed-naming');
  const model = parse(fs.readFileSync(path.join(root, 'DESIGN-SYSTEM.md'), 'utf8'));

  // Four passes want the same list of element/class signatures, and each one
  // used to walk the tree and re-read every markup file to get it. The proof
  // that they now share one list is that substituting the list moves all of
  // them at once: a pass still doing its own walk would be unmoved.
  const sentinel = [
    {
      signature: 'button.sentinel_btn',
      element: 'button',
      classes: ['sentinel_btn'],
      count: 9,
      files: ['src/App.jsx'],
    },
  ];
  const shared = assess(root, model, { signatures: sentinel });
  const real = assess(root, model);

  assert.deepEqual(
    shared.components.candidates.map((row) => row.signature),
    ['button.sentinel_btn'],
    'the candidate pass read it',
  );
  assert.notDeepEqual(shared.naming.findings, real.naming.findings, 'and so did naming drift');
  assert.deepEqual(
    shared.hygiene.unused.components.map((row) => row.value),
    model.components.map((component) => component.name),
    'and so did unused components — nothing in the handed-in list mentions them',
  );

  // Handing the same walk back in changes nothing at all, which is what
  // "byte-identical" means for this refactor.
  const again = assess(root, model, { signatures: scanMarkup(root, SCAN_LIMITS) });
  assert.deepEqual(again.hygiene.unused.components, real.hygiene.unused.components);
  assert.deepEqual(again.similarity.findings, real.similarity.findings);
  assert.deepEqual(again.naming.findings, real.naming.findings);
  assert.deepEqual(again.components.candidates, real.components.candidates);
});

test('unusedComponents refuses to answer rather than guessing when nothing read the markup', () => {
  const answer = unusedComponents(STALE, staleModel(), { ran: false, reason: 'no markup pass ran' });
  assert.deepEqual(answer, { checked: false, reason: 'no markup pass ran', rows: [] });
});

// ---------------------------------------------------------------------------
// How hygiene sits on the assessment object
// ---------------------------------------------------------------------------

test('hygiene is counted separately from the drift it is not', () => {
  const result = assess(STALE, staleModel());
  const { summary, hygiene } = result;
  assert.equal(summary.unusedTokens, hygiene.unused.tokens.length);
  assert.equal(summary.unusedComponents, hygiene.unused.components.length);
  assert.equal(summary.collisions, hygiene.collisions.length);
  assert.equal(summary.hygieneFindings, hygiene.findings.length);

  // The value findings are the drift count, and a stale token is not drift.
  assert.equal(summary.errors, result.values.findings.bySeverity[ERROR]);
  assert.equal(summary.warnings, result.values.findings.bySeverity[WARN]);
  for (const rule of Object.keys(summary.byRule)) {
    assert.ok(!rule.startsWith('unused'), `${rule} must not be counted as a value finding`);
  }
});

test('the hygiene summary is derived from its rows, in the same vocabulary', () => {
  const result = assess(COLLISIONS, emptyModel());
  const { findings, summary } = result.hygiene;
  assert.equal(summary.total, findings.length);
  assert.equal(summary.bySeverity[WARN], findings.length, 'all of it is warnings');
  assert.equal(summary.bySeverity[ERROR], 0);
  const counted = Object.values(summary.byRule).reduce((total, count) => total + count, 0);
  assert.equal(counted, findings.length, 'and the families add up to the rows');
});

test('two runs over one project agree exactly', () => {
  const first = assess(COLLISIONS, emptyModel()).hygiene;
  const second = assess(COLLISIONS, emptyModel()).hygiene;
  assert.deepEqual(second, first, 'nothing here is ordered by anything but the project itself');
});

test('assessing a project with hygiene findings still writes nothing', async () => {
  await withTempDir(async (dir) => {
    copyDir(STALE, dir);
    const before = snapshotContents(dir);
    assess(dir, parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8')));
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff, { added: [], changed: [], removed: [] });
  });
});

// ---------------------------------------------------------------------------
// The report, and the one thing it must never do
// ---------------------------------------------------------------------------

test('the report shows what collided and where it was seen', () => {
  const lines = renderHygiene(assess(COLLISIONS, emptyModel())).join('\n');
  assert.ok(lines.includes('Hygiene'), 'the section names itself');
  assert.ok(lines.includes('React + Vue'), 'the frameworks that collide');
  assert.ok(lines.includes('Tailwind + CSS-in-JS + CSS'), 'the styling systems that collide');
  assert.ok(lines.includes('tokens.json'), 'and the theme files that each declare values');
  assert.ok(/seen in: /.test(lines), 'each with its evidence rather than an assertion');
});

test('the report prints the caveat next to the rows it applies to, and never a demand', () => {
  const lines = renderHygiene(assess(STALE, staleModel())).join('\n');
  assert.ok(lines.includes('color-legacy'), 'the stale token is named');
  assert.ok(lines.includes('Card'), 'and so is the stale component');
  assert.ok(lines.includes(UNUSED_CAVEAT), 'with the caveat on the page, not in a footnote');
  assert.ok(lines.includes('Nothing is ever removed for you'), 'and the promise stated plainly');
  assert.ok(!/remove|delete/i.test(lines.replace(/Nothing is ever removed for you/, '')), 'nothing else here asks for a removal');
});

test('a clean project is told so, because a check that passed is not a check that never ran', () => {
  const lines = renderHygiene(assess(codebase('react-css'), emptyModel())).join('\n');
  assert.ok(lines.includes('Nothing collides'), 'silence is a result, and it is printed');
});

test('a stack with no component pass is told that, rather than that everything is unused', () => {
  const lines = renderHygiene(assess(codebase('vue-app'), staleModel())).join('\n');
  assert.ok(lines.includes('Components were not checked'), 'the report says the question was not asked');
  assert.ok(!lines.includes('Card'), 'and names nothing it could not have seen');
});

test('assess update writes tokens and removes nothing, whatever hygiene found', async () => {
  await withTempDir(async (dir) => {
    copyDir(STALE, dir);
    const before = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    const { code } = await execute(tokenizeLine('assess update'), { cwd: dir, env: {}, yes: true });
    assert.equal(code, 0);

    const after = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    for (const token of ['color-legacy', 'radius-pill', 'type-display']) {
      assert.ok(after.includes(token), `${token} was pruned, and no mode may ever prune`);
    }
    assert.ok(after.includes('### Card'), 'and an unused component is still a component you have');
    assert.ok(after.length >= before.length, 'the one write path adds rows; it never takes them away');
  });
});
