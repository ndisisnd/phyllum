/**
 * Assertions for the severity engine and the two compound passes (v0.2.1 §3).
 *
 * v0.2.0's assessment could inventory a codebase but not judge it: a colour used
 * forty times and a colour used once came back as the same demand. v0.2.1 adds
 * the judgement, and it is one number — how often the value is written — turned
 * into a severity by a table rather than by a constant. This file exists to hold
 * three promises about that:
 *
 *   1. **The threshold is data.** It is a row in `refs/assess/severity.md`, the same row
 *      the report and the fast-forward read, so a project that wants to be
 *      stricter edits a table rather than the code.
 *   2. **Severity belongs to aggregation.** A scanner reports what it saw in one
 *      file; how much a sighting matters is a question about the whole codebase.
 *      No sighting carries a severity, and the checks below prove it by reading
 *      the scanner's own output.
 *   3. **A warning is never accepted on your behalf.** The interactive review
 *      offers an `error` and a `warn` alike — a rare value can still deserve a
 *      token, and only the user knows — but `assess update` declines the warning
 *      and says it did.
 *
 * The second half of the file is the two compound passes. A shadow and a border
 * shorthand are values whose meaning is the whole list, so they need their own
 * reading, their own clustering and their own ladder. The rule that matters most
 * there is the negative one: a declaration read as a compound is **not** also
 * read as a scalar length, because reporting one decision twice is worse than
 * not reporting it at all.
 *
 * And the promise both halves inherit: none of this writes. Every check that
 * runs a scan diffs the whole directory around it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ERROR, WARN, assess, assessValues, summariseFindings } from '../../lib/assess.js';
import { autoAnswer, renderSeverities } from '../../lib/assess-command.js';
import { renderProposalList } from '../../lib/assess-suggest.js';
import { meansFor } from '../../lib/assess-map.js';
import { parse } from '../../lib/design-system.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import {
  clusterSightings,
  compoundMagnitude,
  compoundValue,
  normaliseCompound,
  ownsProperty,
  parseCompound,
  proposeTokens,
  sameIntent,
  scanCodebase,
} from '../../lib/tokenise.js';
import {
  appliesToForCluster,
  compoundPassFor,
  compounds,
  isCompoundPass,
  lintRuleFor,
  lintRules,
  severityFor,
  severities,
  threshold,
} from '../../lib/tokenise-spec.js';
import {
  FIXTURES,
  copyDir,
  diffSnapshots,
  readFixture,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const SHADOWS = path.join(FIXTURES, 'codebases', 'shadow-border');
const EMPTY_FIXTURE = path.join(FIXTURES, 'design-system', 'empty.md');
const emptySystem = () => parse(readFixture(EMPTY_FIXTURE));

const run = (line, cwd, extra = {}) =>
  execute(tokenizeLine(line), { cwd, env: {}, yes: true, ...extra });

/** The fixture codebase plus a design system, in a sandbox. */
async function withProject(body, codebase = SHADOWS) {
  return withTempDir(async (dir) => {
    copyDir(codebase, dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(EMPTY_FIXTURE));
    return body(dir);
  });
}

const assessed = () => assess(SHADOWS, emptySystem());
const proposalFor = (result, value) =>
  result.values.proposals.find((proposal) => proposal.value.toLowerCase() === value.toLowerCase());

// ---------------------------------------------------------------------------
// The threshold is a table row, not a number in the code
// ---------------------------------------------------------------------------

test('the severity threshold comes from the table, and applies to every family alike', () => {
  assert.deepEqual(severities(), [ERROR, WARN], 'two severities, most serious first');

  // The plan's decided number, read back through the table rather than restated.
  assert.equal(severityFor(3), ERROR, 'three uses is systematic drift');
  assert.equal(severityFor(2), WARN, 'two is what a deliberate exception looks like');
  assert.equal(severityFor(1), WARN);
  assert.equal(severityFor(40), ERROR);
  assert.equal(severityFor(0), WARN, 'and nothing at all is certainly not drift');

  // One threshold, not one per family: the same count means the same thing to a
  // colour, a radius and a shadow.
  const result = assessed();
  for (const proposal of result.values.proposals) {
    assert.equal(
      proposal.severity,
      severityFor(proposal.count),
      `${proposal.name} (${proposal.rule}) disagrees with the table about its own count`,
    );
  }
});

test('every rule family in the table is a name the engine can produce', () => {
  const declared = lintRules();
  assert.deepEqual(
    declared,
    ['raw-colour', 'raw-spacing', 'raw-radius', 'raw-border', 'raw-shadow', 'raw-typography'],
    'the six families the plan names, in the order the table declares them',
  );

  // The split v0.2.1 is here to make: a radius is no longer "a number".
  assert.equal(lintRuleFor({ pass: 'numbers', role: 'radius' }), 'raw-radius');
  assert.equal(lintRuleFor({ pass: 'numbers', role: 'spacing' }), 'raw-spacing');
  assert.equal(lintRuleFor({ pass: 'numbers', role: 'border' }), 'raw-border');
  assert.equal(lintRuleFor({ pass: 'borders' }), 'raw-border', 'the shorthand joins the same family');
  assert.equal(lintRuleFor({ pass: 'shadows' }), 'raw-shadow');
  assert.equal(lintRuleFor({ pass: 'colours' }), 'raw-colour');
  assert.equal(lintRuleFor({ pass: 'typography' }), 'raw-typography');

  for (const proposal of assessed().values.proposals) {
    assert.ok(declared.includes(proposal.rule), `${proposal.name} claims the unknown rule ${proposal.rule}`);
  }
});

// ---------------------------------------------------------------------------
// Where severity is assigned, and where it is not
// ---------------------------------------------------------------------------

test('the scanners stay neutral — no sighting carries a severity or a rule', () => {
  const sightings = scanCodebase(SHADOWS, { text: true, gitignore: true });
  assert.ok(sightings.length > 0, 'the fixture has values to find');
  for (const sighting of sightings) {
    assert.equal(sighting.severity, undefined, 'a scanner reports what it saw, not what it means');
    assert.equal(sighting.rule, undefined);
  }
  // Clustering is the step before the judgement, and it stays neutral too.
  for (const cluster of clusterSightings(sightings)) {
    assert.equal(cluster.severity, undefined);
  }
});

test('only a finding has a severity — a covered value is evidence, not a problem', () => {
  const model = emptySystem();
  model.tokens.numbers.push(['space-md', '16px', 'spacing']);
  const values = assessValues(SHADOWS, model);

  const covered = values.covered.find((row) => row.value === '16px');
  assert.ok(covered, 'the padding the system now names is covered');
  assert.equal(covered.severity, null, 'a token doing its job is not a finding');
  assert.equal(covered.rule, 'raw-spacing', 'but it still knows what kind of value it is');

  for (const row of values.uncovered) {
    assert.ok(row.severity === ERROR || row.severity === WARN, `${row.value} has no severity`);
  }
});

test('a value seen but not read carries a severity and no rule', () => {
  const { values } = assessed();
  const row = values.unreadable.find((item) => item.value === '3px');
  assert.ok(row, 'the length inside a shadow Phyllum cannot read whole is still seen');
  assert.equal(row.severity, WARN, 'how often it is written is a fact, so it is classified');
  assert.equal(row.rule, null, 'but naming its family would be the guess this bucket exists to refuse');
});

test('the finding summary is derived from the rows, so it cannot disagree with them', () => {
  const { values, summary } = assessed();
  const rows = [...values.uncovered, ...values.unreadable];

  assert.equal(summary.errors, rows.filter((row) => row.severity === ERROR).length);
  assert.equal(summary.warnings, rows.filter((row) => row.severity === WARN).length);
  assert.equal(values.findings.total, rows.length);

  const counted = Object.values(summary.byRule).reduce((total, count) => total + count, 0);
  assert.equal(counted, rows.length, 'every finding is counted under exactly one family');
  assert.equal(summary.byRule.unread, values.unreadable.length, 'including the ones with no family');

  // And the helper is the same one, over rows it is handed rather than found.
  const made = summariseFindings([
    { severity: ERROR, rule: 'raw-shadow' },
    { severity: WARN, rule: 'raw-shadow' },
    { severity: WARN, rule: null },
  ]);
  assert.deepEqual(made, {
    total: 3,
    bySeverity: { error: 1, warn: 2 },
    byRule: { 'raw-shadow': 2, unread: 1 },
  });
});

// ---------------------------------------------------------------------------
// What a severity changes, and what it does not
// ---------------------------------------------------------------------------

test('the fast-forward accepts an error and declines a warning, by severity alone', () => {
  const review = [{ action: 'confirm' }, { action: 'skip' }];
  assert.equal(autoAnswer(review, { severity: ERROR }), 'y');
  assert.equal(autoAnswer(review, { severity: WARN }), 'skip');
  // A question with no severity is a question from somewhere else, and the old
  // rule still decides it — this is an addition, not a replacement.
  assert.equal(autoAnswer(review), 'y');
  assert.equal(autoAnswer(review, {}), 'y');
  // And a warning is declined whatever else it offers, so no later flow can
  // route around the rule by offering a differently shaped question.
  assert.equal(autoAnswer([{ action: 'confirm' }], { severity: WARN }), 'skip');
});

test('assess update writes the systematic drift and leaves the exceptions alone', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await run('assess update', dir);
    assert.equal(code, 0);

    const model = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
    const written = [...model.tokens.colours, ...model.tokens.numbers].map((row) => row[1]);

    // The three-times-and-more values, named.
    assert.ok(written.includes('#E5E7EB'), 'a colour used three times is drift');
    assert.ok(written.includes('12px'), 'and so is the radius');
    assert.ok(written.includes('0 2px 8px rgba(0,0,0,0.1)'), 'and the shadow, read whole');
    assert.ok(written.includes('1px solid #e5e7eb'), 'and the border shorthand');

    // The once-or-twice values, left for a human.
    assert.ok(!written.includes('#2563EB'), 'a colour written once is not named on your behalf');
    assert.ok(!written.includes('2px dashed #2563eb'), 'nor a one-off border');
    assert.ok(!written.includes('0 1px 2px rgba(0,0,0,0.05)'), 'nor a one-off shadow');

    assert.ok(out.includes('used only once or twice'), 'and the report says which it declined, and why');

    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(
      diff.added.sort(),
      ['.phyllum/assess-1.md', 'DESIGN-SYSTEM.md.bak'],
      'the backup and the stage report, and nothing else new',
    );
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.changed, ['DESIGN-SYSTEM.md'], 'one file edited, as ever');
  });
});

test('the interactive review still offers a warning, so it can be promoted by hand', async () => {
  await withProject(async (dir) => {
    const asked = [];
    await run('assess tokens', dir, {
      ask: async (question, _suggestions, meta = {}) => {
        asked.push({ question, severity: meta.severity ?? null });
        // Accept the rare border shorthand and nothing else.
        return question.includes('2px dashed') ? 'y' : 'skip';
      },
      confirm: async () => true,
    });

    const warned = asked.filter((item) => item.severity === WARN);
    assert.ok(warned.length > 0, 'a warning is a question, not a silence');
    assert.ok(
      asked.some((item) => item.severity === ERROR),
      'and an error is asked in exactly the same loop',
    );

    const model = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
    assert.ok(
      model.tokens.numbers.some((row) => row[1] === '2px dashed #2563eb'),
      'a warning the user promoted is written like any other accepted token',
    );
  });
});

test('the report separates the drift from the exceptions, and names the families', () => {
  const { summary } = assessed();
  const lines = renderSeverities(summary).join('\n');
  assert.match(lines, /used three times or more/);
  assert.match(lines, /raw-shadow ×/, 'the families are named, because they are different afternoons of work');
  assert.match(lines, /raw-radius ×/, 'including the one v0.2.1 split out');
  assert.match(lines, /used only once or twice/);
  assert.match(lines, /never accepted on your behalf/);

  // Nothing to say means nothing said, rather than two zeroes.
  assert.deepEqual(renderSeverities({ errors: 0, warnings: 0, byRule: {} }), []);
});

test('the proposal preview marks the exceptions and leaves the rest unlabelled', () => {
  const lines = renderProposalList([
    { name: 'shadow-md', value: '0 2px 8px rgba(0,0,0,0.1)', count: 3, severity: ERROR },
    { name: 'shadow-sm', value: '0 1px 2px rgba(0,0,0,0.05)', count: 1, severity: WARN },
  ]);
  assert.ok(!lines[0].includes('exception'), 'a label on every row is a label nobody reads');
  assert.ok(lines[1].includes('likely an exception'));
});

// ---------------------------------------------------------------------------
// Compound values — a shadow and a border read whole
// ---------------------------------------------------------------------------

test('the compound passes are declared in the table, and write into Numbers', () => {
  assert.deepEqual(
    compounds().map((row) => row.pass),
    ['shadows', 'borders'],
  );
  for (const row of compounds()) {
    assert.equal(row.section, 'numbers', 'a shadow and a border width are lengths with a job');
    assert.ok(row.properties.length > 0, `${row.pass} reads no properties`);
    assert.ok(row.appliesTo.length > 0, `${row.pass} has no applies-to label`);
  }

  assert.equal(compoundPassFor('box-shadow'), 'shadows');
  assert.equal(compoundPassFor('text-shadow'), 'shadows');
  assert.equal(compoundPassFor('border'), 'borders');
  assert.equal(compoundPassFor('border-radius'), null, 'a radius is a scalar, and stays one');
  assert.ok(isCompoundPass('shadows') && isCompoundPass('borders'));
  assert.ok(!isCompoundPass('numbers'));
});

test('a compound is normalised into one spelling of the value the code contains', () => {
  // Case, spacing inside a colour function, and a zero with a unit are all
  // spellings rather than differences.
  assert.equal(
    normaliseCompound('0px 2PX 8px  rgba(0, 0, 0, 0.1)'),
    '0 2px 8px rgba(0,0,0,0.1)',
  );
  assert.equal(normaliseCompound('1PX SOLID #E5E7EB'), '1px solid #e5e7eb');
  assert.equal(normaliseCompound('#ABC 1px solid'), '#aabbcc 1px solid', 'parts keep the order they were written in');

  // Layers are kept apart and kept in order, because the order is the stacking.
  const layered = parseCompound('0 1px 2px #000, 0 4px 8px #111');
  assert.equal(layered.length, 2);
  assert.deepEqual(layered[0].lengths, ['0', '1px', '2px']);
  assert.equal(layered[1].colour, '#111111');

  // A part no table names makes the whole thing unreadable rather than
  // half-read: a part-read compound looks like a fact.
  assert.equal(normaliseCompound('0 2px 8px var(--ring)'), null);
  assert.equal(normaliseCompound('0 calc(2px + 1px) 8px #000'), null);
  // And a compound with neither a length nor a colour is not a value at all.
  assert.equal(normaliseCompound('none'), null);
  assert.equal(normaliseCompound(''), null);
});

test('the shorthand keyword is what tells a border from a border width', () => {
  assert.equal(compoundValue('borders', '1px solid #E5E7EB'), '1px solid #e5e7eb');
  assert.equal(compoundValue('borders', '1px'), null, 'a bare width stays the scalar role it always was');
  assert.equal(compoundValue('borders', 'none'), null);
  // Shadows list no keywords, so every declaration on their properties is read.
  assert.equal(compoundValue('shadows', '0 2px 8px #000'), '0 2px 8px #000000');
  assert.equal(compoundValue('nonsense', '1px solid #000'), null, 'a pass that is not compound reads nothing');
});

test('a compound clusters part for part, and never across shapes', () => {
  const shadow = (value) => ({ pass: 'shadows', value });
  const border = (value) => ({ pass: 'borders', value });

  assert.ok(
    sameIntent(shadow('0 2px 8px rgba(0,0,0,0.1)'), shadow('0 2px 9px rgba(0,0,0,0.1)')),
    'a pixel of blur apart is the same shadow, by the same threshold a length uses',
  );
  assert.equal(threshold('shadow length'), 1, 'and that threshold is the table’s, not the code’s');
  assert.equal(threshold('shadow colour'), 3);

  assert.ok(
    !sameIntent(shadow('0 2px 8px rgba(0,0,0,0.1)'), shadow('0 2px 8px 1px rgba(0,0,0,0.1)')),
    'a fourth length is a different shadow, however close the first three are',
  );
  assert.ok(
    !sameIntent(shadow('0 2px 8px #000000'), shadow('0 2px 8px #FFFFFF')),
    'and so is the same geometry in a different colour',
  );
  assert.ok(
    !sameIntent(shadow('inset 0 2px 8px #000'), shadow('0 2px 8px #000')),
    'an inset shadow is not the shadow it is inset from',
  );
  assert.ok(
    !sameIntent(border('1px solid #E5E7EB'), border('1px dashed #E5E7EB')),
    'the style keyword is part of the border, not decoration on it',
  );
  assert.ok(sameIntent(border('1PX SOLID #e5e7eb'), border('1px solid #E5E7EB')), 'case is spelling');

  // Ladder order: a bigger shadow is one with more length in it.
  assert.ok(compoundMagnitude('0 4px 16px #000') > compoundMagnitude('0 1px 2px #000'));
});

test('the two compound passes read a codebase whole, and never twice', () => {
  const sightings = scanCodebase(SHADOWS, { text: true, gitignore: true });

  const shadows = sightings.filter((sighting) => sighting.pass === 'shadows');
  assert.ok(shadows.length > 0, 'the shadow pass ran');
  const borders = sightings.filter((sighting) => sighting.pass === 'borders');
  assert.deepEqual(
    borders.map((sighting) => sighting.value).sort(),
    ['1px solid #e5e7eb', '2px dashed #2563eb'],
  );

  // The fixture's only bare `1px` sits inside a shorthand, so a `1px` border
  // width in the numbers pass would be that same decision counted twice.
  assert.ok(
    !sightings.some(
      (sighting) => sighting.pass === 'numbers' && sighting.role === 'border' && sighting.value === '1px',
    ),
    'the width inside a shorthand is not also a length',
  );
  // But `border-width: 4px` has no keyword, so it is still read as one.
  assert.ok(
    sightings.some(
      (sighting) => sighting.pass === 'numbers' && sighting.role === 'border' && sighting.value === '4px',
    ),
    'and a bare border width still is',
  );
  // The colour inside the shorthand is untouched by any of this.
  assert.ok(
    sightings.some((sighting) => sighting.pass === 'colours' && sighting.properties.includes('border')),
    'a colour is read wherever it sits',
  );
});

test('a shadow leaves the fourth bucket without leaving a hole in it', () => {
  const { values } = assessed();
  const unread = values.unreadable.map((row) => row.value);

  // Before v0.2.1 every length in every shadow landed here. Now only the one
  // Phyllum genuinely cannot read does.
  assert.deepEqual(unread, ['3px'], 'exactly the shadow with a var() in it, and nothing else');
  assert.ok(
    values.proposals.some((proposal) => proposal.pass === 'shadows'),
    'the readable shadows moved buckets rather than disappearing',
  );

  // And nothing was double-counted on the way: every raw sighting is in exactly
  // one bucket.
  const sightings = scanCodebase(SHADOWS, { text: true, gitignore: true });
  const raw = sightings.reduce((total, sighting) => total + sighting.count, 0);
  assert.equal(values.raw, raw);
});

test('a compound is named on its own ladder and owns only its own properties', () => {
  const { values } = assessed();
  const shadow = values.proposals.find((proposal) => proposal.pass === 'shadows' && proposal.count === 3);

  assert.match(shadow.name, /^shadow-(xs|sm|md|lg|xl)$/, 'the shadow ladder, from the table');
  assert.equal(shadow.section, 'numbers', 'and it is written into the Numbers table');
  assert.equal(shadow.appliesTo, 'shadow');
  assert.equal(appliesToForCluster({ pass: 'borders' }), 'border');
  assert.equal(appliesToForCluster({ pass: 'numbers', role: 'radius' }), 'corner radius');

  // A token may only fill a slot of its own kind — the rule the roles table has
  // always enforced for lengths, extended to the two new passes.
  assert.ok(ownsProperty(shadow, 'box-shadow'));
  assert.ok(ownsProperty(shadow, 'text-shadow'));
  assert.ok(!ownsProperty(shadow, 'border'), 'a shadow is not a border, however alike the Numbers row looks');
  assert.ok(!ownsProperty(shadow, 'padding'));

  // Two of them lay out smallest-first on the ladder, as a role's clusters do.
  const laid = values.proposals
    .filter((proposal) => proposal.pass === 'shadows')
    .map((proposal) => proposal.name);
  assert.equal(new Set(laid).size, laid.length, 'no two shadows get the same name');
});

test('the map says what a compound is, rather than calling it a colour', () => {
  assert.equal(
    meansFor({ pass: 'shadows', properties: ['box-shadow'], bucket: 'proposed' }),
    'shadow on box-shadow',
  );
  assert.equal(
    meansFor({ pass: 'borders', properties: ['border'], bucket: 'proposed' }),
    'border',
    'and does not say the same word twice',
  );
  assert.equal(
    meansFor({ pass: 'borders', properties: ['outline'], bucket: 'proposed' }),
    'border on outline',
    'but does name the property where it adds something',
  );
  assert.equal(meansFor({ pass: 'shadows', properties: [], bucket: 'proposed' }), 'shadow');
});

// ---------------------------------------------------------------------------
// And none of it writes
// ---------------------------------------------------------------------------

test('assessing a codebase full of shadows changes not one byte of it', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { code } = await run('assess', dir);
    assert.equal(code, 0);
    // The report under `.phyllum/` is the stage's own output. Nothing the user
    // wrote is added to, changed, or removed.
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: ['.phyllum/assess-1.md'],
      changed: [],
      removed: [],
    });
  });
});

test('the same codebase assessed twice gives the same severities and the same rules', () => {
  const first = assessed().values.proposals.map((p) => `${p.rule}|${p.severity}|${p.name}|${p.value}`);
  const second = assess(SHADOWS, emptySystem()).values.proposals.map(
    (p) => `${p.rule}|${p.severity}|${p.name}|${p.value}`,
  );
  assert.deepEqual(second, first, 'deterministic, which is what makes a rerun a diff');
  assert.ok(first.length > 0);
});

test('a rerun after acceptance proposes the compound nothing, because it is named now', () => {
  const model = emptySystem();
  const { proposals } = assessValues(SHADOWS, model);
  const shadow = proposals.find((proposal) => proposal.pass === 'shadows');
  model.tokens.numbers.push([shadow.name, shadow.value, shadow.appliesTo]);

  const again = assessValues(SHADOWS, model);
  assert.ok(
    !again.proposals.some((proposal) => proposal.value === shadow.value),
    'an accepted compound is matched silently on the next run, like any other token',
  );
  assert.ok(
    again.covered.some((row) => row.value === shadow.value && row.token === shadow.name),
    'and is reported as coverage under the name it was given',
  );
});

test('proposals built straight from a scan carry no severity — that is assess’s job', () => {
  const sightings = scanCodebase(SHADOWS, { text: true, gitignore: true });
  for (const proposal of proposeTokens(sightings, emptySystem())) {
    assert.equal(proposal.severity, undefined, 'tokenise proposes; assess judges');
  }
});
