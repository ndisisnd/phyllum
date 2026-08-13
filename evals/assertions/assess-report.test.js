/**
 * Assertions for the report, the score and the six smaller checks (v0.2.1 §7, §8).
 *
 * M1 to M4 each added a way of judging. M5 adds the two things a person actually
 * reads — one table of every finding in one shape, and one number for the whole
 * codebase — plus the six checks that did not fit any family before them.
 *
 * What is checked here is mostly the seams between those, because the families
 * themselves are already covered by their own files:
 *
 *   - **The score is arithmetic over counts, not a second opinion.** It reads
 *     the same summaries the families produced, weighted by a table, so it can
 *     never disagree with the rows above it.
 *   - **The verdict comes from severities and never from the score.** The two
 *     answer different questions, and a codebase that fails at 1 and one that
 *     passes-with-warnings at 8 both have to be expressible.
 *   - **The extras stay silent without evidence.** Half of these assertions are
 *     absences: no dark theme, no scale, two z-index values, one colour. A check
 *     that fires on a healthy project is one people learn to skip.
 *   - **Every rule has an action.** The suggested-action column is the only part
 *     of the report a reader acts on, so a rule with no row in the table would
 *     be a finding with nothing to do about it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ERROR, WARN, assess } from '../../lib/assess.js';
import {
  assessExtras,
  darkModeGaps,
  darkScopesIn,
  extrasSweep,
  hardcodedBreakpoints,
  nearDuplicateColours,
  offScaleSpacing,
  spacingScale,
  tokenAliasDuplicates,
  zIndexSprawl,
} from '../../lib/assess-extras.js';
import {
  FAMILIES,
  evidenceFor,
  findingRow,
  renderFindings,
  renderScore,
} from '../../lib/assess-report.js';
import { countFamilies, driftMass, scoreAssessment } from '../../lib/assess-score.js';
import { emptyModel, parse } from '../../lib/design-system.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import {
  actionFor,
  actionRules,
  extraLimit,
  extraRules,
  extraSeverityFor,
  hygieneRules,
  lintRules,
  namingRules,
  propRules,
  scoreFamilies,
  scoreScale,
  scoreStepFor,
  scoreWeight,
  similarityRules,
  threshold,
  verdictFor,
  verdicts,
} from '../../lib/tokenise-spec.js';
import { FIXTURES } from './helpers.js';

const codebase = (name) => path.join(FIXTURES, 'codebases', name);

const DRIFT = codebase('dark-drift');
const CLEAN = codebase('empty-project');

const modelIn = (root) => parse(fs.readFileSync(path.join(root, 'DESIGN-SYSTEM.md'), 'utf8'));

// One scan of the drifted fixture for the many cases that read it: rescanning
// per assertion would grade the fixture's size rather than the code.
const drift = assess(DRIFT, modelIn(DRIFT));

const rulesIn = (findings) => findings.map((finding) => finding.rule);

// ---------------------------------------------------------------------------
// The six smaller checks (§8)
// ---------------------------------------------------------------------------

test('every extra rule the table declares has a severity and a finding shape', () => {
  assert.deepEqual(extraRules(), [
    'near-duplicate-colour',
    'dark-mode-gap',
    'token-alias-duplicate',
    'off-scale-spacing',
    'z-index-sprawl',
    'hardcoded-breakpoint',
  ]);
  for (const rule of extraRules()) {
    assert.ok([ERROR, WARN].includes(extraSeverityFor(rule)), `${rule} has a severity`);
  }
  assert.equal(
    extraSeverityFor('off-scale-spacing'),
    ERROR,
    'a near miss on your own scale is a mistake, not an exception',
  );
  assert.equal(extraSeverityFor('nonsense'), null, 'and a rule nobody wrote has none');
});

test('the drifted fixture fires all six checks, and each says which rule it is', () => {
  assert.deepEqual(
    [...new Set(rulesIn(drift.extras.findings))].sort(),
    [...extraRules()].sort(),
    'six rules, all of them named',
  );
  for (const finding of drift.extras.findings) {
    assert.ok(finding.detail, `${finding.rule} says why in a sentence`);
    assert.ok(finding.evidence.length > 0, `${finding.rule} carries its evidence`);
  }
});

test('near-duplicate colours sit above the clustering floor and below the ceiling', () => {
  const rows = nearDuplicateColours(modelIn(DRIFT), drift.values);
  assert.ok(rows.length >= 2, 'the token pair and the raw pair');
  for (const row of rows) {
    assert.ok(row.distance > threshold('colours'), 'anything closer was already one cluster');
    assert.ok(row.distance <= extraLimit('colour distance'), 'and anything further is two colours');
    assert.equal(row.severity, WARN);
    assert.ok(row.detail.includes('ΔE'), 'the number is printed so it can be argued with');
  }
});

test('a colour written once is never near-duplicate of anything', () => {
  const values = { uncovered: [{ value: '#A1A1AA', severity: WARN, count: 1, files: ['a.css'] }] };
  assert.deepEqual(
    nearDuplicateColours(emptyModel(), values),
    [],
    'token-worthy is the gate — two one-off colours are two one-off colours',
  );
});

test('a codebase with no dark theme is told nothing about dark mode', () => {
  const clean = assess(CLEAN, emptyModel());
  assert.equal(clean.extras.dark.checked, false);
  assert.ok(clean.extras.dark.reason.includes('no dark theme'));
  assert.deepEqual(clean.extras.dark.rows, [], 'silence, not an empty list of gaps');
  assert.equal(clean.summary.darkModeChecked, false);
});

test('dark scopes are the three places a dark value can be written', () => {
  const scopes = darkScopesIn(
    '@media (prefers-color-scheme: dark) { :root { --ink: #FFF; } }\n' +
      '.dark .card { background: #0B1120; }\n' +
      '<div class="dark:bg-slate-900">',
  );
  const text = scopes.join('\n');
  assert.ok(text.includes('--ink: #FFF'), 'the media query body');
  assert.ok(text.includes('#0B1120'), 'the class-scheme rule body');
  assert.ok(text.includes('bg-slate-900'), 'and the utility variant');
});

test('a `.dark` written in a comment opens no scope', () => {
  assert.deepEqual(darkScopesIn('/* the .dark theme is coming */\n.card { color: #111; }'), []);
});

test('a token restated by name in a dark scope has a dark counterpart', () => {
  const gaps = drift.extras.dark;
  assert.equal(gaps.checked, true);
  assert.ok(gaps.evidence.length > 0, 'and the report says what the evidence was');
  const named = gaps.rows.map((row) => row.token);
  assert.ok(!named.includes('color-surface'), 'restated under the media query');
  assert.ok(!named.includes('color-ink'), 'so is this one');
  assert.ok(named.includes('color-primary'), 'this one is not');
  assert.ok(named.includes('color-brand'), 'nor is this one');
});

test('a project that names no token in a dark scope is told the tokens were not read', () => {
  const model = parse(
    [
      '# Design System',
      '',
      '## Tokens',
      '',
      '### Colours',
      '',
      '| token | value | notes |',
      '| --- | --- | --- |',
      '| color-primary | #2563EB | brand |',
      '',
      '### Numbers',
      '',
      '### Typography',
      '',
      '## Components',
      '',
      '## Backlog',
      '',
    ].join('\n'),
  );
  const sweep = { dark: [{ evidence: 'media query', file: 'a.css' }], darkText: ['color: #F9FAFB;'] };
  const gaps = darkModeGaps(model, sweep, {});
  assert.equal(gaps.checked, true, 'the codebase does have a dark theme');
  assert.equal(gaps.tokensChecked, false, 'but not one expressed per token');
  assert.ok(gaps.tokensReason.includes('will not guess'));
  assert.deepEqual(gaps.rows, [], 'so no token is called a gap');
});

test('two tokens holding one value are aliases, and two sections agreeing are not', () => {
  const rows = tokenAliasDuplicates(modelIn(DRIFT));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].tokens, ['space-4', 'gap-default']);
  assert.equal(rows[0].section, 'numbers');
  assert.equal(rows[0].severity, WARN);
  // `type-body` is also 16px. A size and a spacing agreeing is two decisions
  // that happen to match, not one decision written twice.
  assert.ok(!rows.some((row) => row.tokens.includes('type-body')));
});

test('off-scale spacing needs a scale, and reports the rung it missed', () => {
  const scale = spacingScale(modelIn(DRIFT));
  assert.deepEqual(scale, [16, 32]);
  const { checked, rows } = offScaleSpacing(modelIn(DRIFT), drift.values);
  assert.equal(checked, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, '15px');
  assert.equal(rows[0].nearest, 16);
  assert.equal(rows[0].severity, ERROR, 'a near miss reads as a mistake at any frequency');

  const noScale = offScaleSpacing(emptyModel(), drift.values);
  assert.equal(noScale.checked, false, 'no spacing tokens means nothing to be off');
  assert.deepEqual(noScale.rows, []);
});

test('a spacing value exactly on the scale is coverage, never a finding', () => {
  const { rows } = offScaleSpacing(modelIn(DRIFT), {
    uncovered: [{ value: '16px', pass: 'numbers', role: 'spacing', count: 9, files: ['a.css'] }],
  });
  assert.deepEqual(rows, []);
});

test('z-index is a sprawl only once there are enough layers to be one', () => {
  const sprawl = zIndexSprawl(extrasSweep(DRIFT));
  assert.equal(sprawl.length, 1, 'one finding, because the finding is the set');
  assert.ok(sprawl[0].values.length >= extraLimit('z-index values'));
  assert.equal(sprawl[0].severity, WARN);

  const few = zIndexSprawl({ zIndex: [{ value: '1', count: 1, files: ['a.css'] }] });
  assert.deepEqual(few, [], 'one layer is a stacking order somebody planned');
});

test('a breakpoint a token names is covered; the rest are findings', () => {
  const sweep = extrasSweep(DRIFT);
  assert.deepEqual(
    hardcodedBreakpoints(modelIn(DRIFT), sweep).map((row) => row.value),
    ['768px', '1024px'],
  );
  const named = parse(
    [
      '# Design System',
      '',
      '## Tokens',
      '',
      '### Colours',
      '',
      '### Numbers',
      '',
      '| token | value | applies to |',
      '| --- | --- | --- |',
      '| breakpoint-md | 768px | breakpoint |',
      '',
      '### Typography',
      '',
      '## Components',
      '',
      '## Backlog',
      '',
    ].join('\n'),
  );
  assert.deepEqual(
    hardcodedBreakpoints(named, sweep).map((row) => row.value),
    ['1024px'],
    'naming the token makes the finding disappear with no code change',
  );
});

test('the extras pass reads the project and writes nothing anywhere', () => {
  const extras = assessExtras(DRIFT, modelIn(DRIFT), drift.values);
  assert.ok(extras.swept.files > 0, 'it did read');
  assert.ok(extras.limits.files > 0, 'and it says what it ran under');
  const source = fs.readFileSync(path.join(process.cwd(), 'lib', 'assess-extras.js'), 'utf8');
  assert.ok(!/writeFileSync|appendFileSync|createWriteStream/.test(source), 'no write call at all');
});

// ---------------------------------------------------------------------------
// The score (§7.1)
// ---------------------------------------------------------------------------

test('the scale is the seven Fibonacci steps, lowest first', () => {
  assert.deepEqual(scoreScale(), [1, 2, 3, 5, 8, 13, 21]);
});

test('every step of the scale is reachable, and nothing falls off the top', () => {
  const seen = new Set();
  for (let mass = 0; mass <= 400; mass += 1) {
    const step = scoreStepFor(mass);
    assert.ok(step, `mass ${mass} lands on a step`);
    seen.add(step.step);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), scoreScale(), 'all seven, no holes');
  assert.equal(scoreStepFor(1_000_000).step, 21, 'the top row matches anything above it');
});

test('the score is monotonic: more drift never scores lower', () => {
  let last = 0;
  for (let mass = 0; mass <= 200; mass += 1) {
    const { step } = scoreStepFor(mass);
    assert.ok(step >= last, `mass ${mass} scored below the mass beneath it`);
    last = step;
  }
});

test('the weights table grades every family the report groups by', () => {
  assert.deepEqual(scoreFamilies(), ['lint', 'similarity', 'props', 'naming', 'hygiene', 'extras']);
  assert.deepEqual(
    FAMILIES.map(([family]) => family).sort(),
    [...scoreFamilies()].sort(),
    'the report and the score read the same six names',
  );
  for (const family of scoreFamilies()) {
    assert.ok(scoreWeight(family, ERROR) >= scoreWeight(family, WARN), `${family}: an error is never worth less than a warning`);
    assert.ok(scoreWeight(family, WARN) > 0, `${family}: a warning always counts for something`);
  }
});

test('the drift mass is the weighted sum of the families, and nothing else', () => {
  const { families } = countFamilies(drift);
  let expected = 0;
  for (const [family, summary] of Object.entries(families)) {
    expected += (summary.bySeverity[ERROR] ?? 0) * scoreWeight(family, ERROR);
    expected += (summary.bySeverity[WARN] ?? 0) * scoreWeight(family, WARN);
  }
  assert.equal(driftMass(families), expected);
  assert.equal(drift.score.mass, expected, 'and the assessment carries the same number');
});

test('a family the table does not weight cannot inflate the score', () => {
  assert.equal(driftMass({ invented: { bySeverity: { error: 99 }, total: 99 } }), 0);
});

test('the family counts add up to the overall count', () => {
  const { families, overall } = countFamilies(drift);
  const summed = Object.values(families).reduce((total, family) => total + family.total, 0);
  assert.equal(summed, overall.total, 'no finding is counted twice, and none is dropped');
  assert.equal(overall.total, drift.score.total);
});

test('the same codebase scores the same twice', () => {
  const again = assess(DRIFT, modelIn(DRIFT));
  assert.equal(again.score.score, drift.score.score);
  assert.equal(again.score.mass, drift.score.mass);
  assert.equal(again.score.verdict, drift.score.verdict);
});

// ---------------------------------------------------------------------------
// The verdict (§7.1)
// ---------------------------------------------------------------------------

test('the three verdicts are the table’s, most serious first', () => {
  assert.deepEqual(verdicts(), ['fail', 'pass w/ warnings', 'pass']);
});

test('the verdict is derived from severities and never from the score', () => {
  assert.equal(verdictFor({ errors: 1, warnings: 0 }), 'fail');
  assert.equal(verdictFor({ errors: 1, warnings: 99 }), 'fail', 'one error outranks any warning count');
  assert.equal(verdictFor({ errors: 0, warnings: 1 }), 'pass w/ warnings');
  assert.equal(verdictFor({ errors: 0, warnings: 0 }), 'pass');
});

test('a small failure and a large pass are both expressible', () => {
  const small = scoreAssessment({
    values: { uncovered: [{ rule: 'raw-colour', severity: ERROR }] },
  });
  assert.equal(small.verdict, 'fail');
  assert.ok(small.score <= 2, 'one error, and almost no mass — failing near the bottom of the scale');

  const large = scoreAssessment({
    values: { uncovered: Array.from({ length: 40 }, () => ({ rule: 'raw-colour', severity: WARN })) },
  });
  assert.equal(large.verdict, 'pass w/ warnings');
  assert.ok(large.score >= 8, 'forty exceptions is a lot of exceptions');
});

test('`clean` in the summary is exactly `verdict === pass`', () => {
  const clean = assess(CLEAN, emptyModel());
  assert.equal(clean.summary.verdict, 'pass');
  assert.equal(clean.summary.clean, true);
  assert.equal(drift.summary.clean, false);
  assert.equal(drift.summary.clean, drift.score.clean);
  assert.equal(drift.score.clean, drift.score.verdict === 'pass');
});

test('an empty project scores the bottom of the scale rather than nothing', () => {
  const clean = assess(CLEAN, emptyModel());
  assert.equal(clean.score.score, 1);
  assert.equal(clean.score.mass, 0);
  assert.equal(clean.summary.score, 1, 'and the summary carries it');
});

// ---------------------------------------------------------------------------
// The report (§7)
// ---------------------------------------------------------------------------

test('every rule any family can report has a suggested action', () => {
  const declared = new Set(actionRules());
  const rules = [
    ...lintRules(),
    ...hygieneRules(),
    ...similarityRules(),
    ...namingRules(),
    ...propRules(),
    ...extraRules(),
    'unread',
  ];
  for (const rule of rules) {
    assert.ok(declared.has(rule), `${rule} has no row in the action table`);
    assert.ok(actionFor(rule).length > 0, `${rule}'s action is not empty`);
  }
  assert.equal(actionFor('invented-rule'), null, 'and nothing is invented for a rule nobody wrote');
});

test('a finding row is severity, finding, evidence and action', () => {
  const row = findingRow({
    rule: 'raw-colour',
    severity: ERROR,
    value: '#2563EB',
    count: 12,
    files: ['src/a.css', 'src/b.css'],
  });
  assert.ok(row.includes(ERROR));
  assert.ok(row.includes('#2563EB'));
  assert.ok(row.includes('12×'), 'the evidence is how often and where');
  assert.ok(row.includes('src/a.css'));
  assert.ok(row.includes('+1 more'), 'and it says when there is more than it shows');
  assert.ok(row.includes(actionFor('raw-colour')));
});

test('a finding with no count reads its evidence list instead', () => {
  assert.equal(
    evidenceFor({ evidence: ['.card (a.css)', '.panel (b.css)'] }),
    '.card (a.css); .panel (b.css)',
  );
  assert.ok(evidenceFor({ evidence: ['a', 'b', 'c', 'd'] }).includes('+2 more'));
  assert.equal(evidenceFor({ detail: 'nothing else to say' }), 'nothing else to say');
});

test('the roll-up names all six families, including the empty ones', () => {
  const lines = renderFindings(drift).join('\n');
  for (const [family] of FAMILIES) {
    assert.ok(lines.includes(`  ${family} —`), `${family} has a line of its own`);
  }
  assert.ok(lines.includes('nothing found'), 'a family with no findings says so');
});

test('the roll-up counts what the families counted', () => {
  const lines = renderFindings(drift);
  const lint = lines.find((line) => line.startsWith('  lint —'));
  const errors = drift.score.families.lint.bySeverity[ERROR] ?? 0;
  const warnings = drift.score.families.lint.bySeverity[WARN] ?? 0;
  assert.ok(lint.includes(`${errors} error`), 'the header cannot disagree with the rows');
  assert.ok(lint.includes(`${warnings} warning`));
});

test('the headline prints the score out of the top of the scale, and the verdict’s reason', () => {
  const lines = renderScore(drift).join('\n');
  assert.ok(lines.includes(`Drift score: ${drift.score.score} of 21`));
  assert.ok(lines.includes(`Verdict: ${drift.score.verdict}`));
  assert.ok(lines.includes(`drift mass of ${drift.score.mass}`));
  assert.ok(lines.includes('every run'), 'and it says the numbers are reproducible');
});

test('the report ends with the findings and then the headline', async () => {
  const { out } = await execute(tokenizeLine('assess'), { cwd: DRIFT, env: {} });
  const findings = out.indexOf('The findings — severity');
  const score = out.indexOf('Drift score:');
  const suggestions = out.indexOf('Step 5 — suggestions');
  assert.ok(findings > 0 && score > findings, 'the roll-up, then the number');
  assert.ok(score < suggestions, 'and both before the conversation about what to do');
  assert.ok(out.includes('Verdict:'));
});

test('every chained mode inherits the same findings, score and verdict', async () => {
  for (const mode of ['assess', 'assess tokens', 'assess components']) {
    const { out } = await execute(tokenizeLine(mode), { cwd: DRIFT, env: {} });
    assert.ok(out.includes(`Drift score: ${drift.score.score} of 21`), `${mode} scores the same`);
    assert.ok(out.includes(`Verdict: ${drift.score.verdict}`), `${mode} judges the same`);
    assert.ok(out.includes('The findings — severity'), `${mode} lists the same findings`);
    assert.ok(out.includes('The smaller checks'), `${mode} runs the same extras`);
  }
});
