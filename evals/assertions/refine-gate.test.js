/**
 * Assertions for bare `refine` — the full gate and its report (v0.11.0 phase 6).
 *
 * Phases 2–5 built the seven sections. This phase runs them in one order, over
 * one of three subjects, and leaves a numbered report behind. So every promise
 * here is a promise about the *whole* rather than about any one check:
 *
 *   - **The order is the reference's, not the code's.** `phyllum:refine-gate`
 *     states the seven sections and the order they run in, and the gate walks
 *     that table rather than a list written in JavaScript. A section reordered
 *     in the reference reorders the run; a section reordered in the code cannot,
 *     because there is no list there to reorder.
 *   - **No section is ever skipped.** Seven rows in, seven sections out, every
 *     time — including the runs where four of them have nothing to say. A
 *     section outside the subject's reach reports that it does not apply and
 *     names why; it is never dropped and it is never quietly passed.
 *   - **Three scopes, and a refusal for anything else.** One component, one
 *     token, the whole system. A subject the design system does not record stops
 *     the gate and writes no report — a numbered report of an invented grade is
 *     worse than no report.
 *   - **The numbering is the one the other two stages already use.** Numeric,
 *     one past the highest that exists, never reused, never overwritten. Three
 *     numbering schemes in one directory would be two too many.
 *   - **The report ends in the verdict, and the verdict is readable twice.** Once
 *     as prose and once as the `phyllum-refine-verdict` block, and the two say
 *     the same thing because the block is rendered from the same gate object.
 *   - **The date is the reader's own.** Local parts, never `toISOString()`. A
 *     report dated a day behind the calendar of the person reading it is a
 *     report they have to second-guess.
 *   - **Nothing outside `.phyllum/` moves.** Bare `refine` grades; it does not
 *     fix, and it does not touch `DESIGN-SYSTEM.md`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { reportDate } from '../../lib/assess-reports.js';
import { parse } from '../../lib/design-system.js';
import {
  REFINE_REPORT_PATTERN,
  REFINE_VERDICT_FENCE,
  REFINE_VERDICT_SCHEMA_VERSION,
  latestRefineReportNumber,
  listRefineReportNumbers,
  listRefineReports,
  nextRefineReportNumber,
  parseVerdictBlock,
  readRefineReport,
  refineGate,
  refineReportFileName,
  refineReportPathFor,
  renderRefineReport,
  resolveSubject,
  runRefineGate,
  verdictWord,
  writeRefineReport,
} from '../../lib/refine-gate.js';
import { gateSections, refineScopes } from '../../lib/refine-spec.js';
import { DESIGN_SYSTEM_FILE, REFINE_REPORT_PREFIX, STATE_DIR, isAllowedPath } from '../../lib/write.js';
import { diffSnapshots, snapshotContents, withTempDir } from './helpers.js';

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

const DAY = '2026-08-25';

/** No linter configured — handed in, so the gate never shells out from a test. */
const NO_LINTER = { pass: null, reason: 'no linter is configured in this project' };

const BUTTON = [
  'name: Button',
  'archetype: button',
  'properties:',
  '  background: surface-default',
  '  text-colour: text-strong',
  '  border-colour: ink-deep',
  '  radius: radius-sm',
  '  typography: type-body',
  'states:',
  '  focus:',
  '    border-colour: ink-deep',
];

const BUTTON_MARKUP = 'export const Button = () => <button className="button" />;\n';

function designSystem(components) {
  return [
    '# Design System',
    '',
    "> Phyllum manages this file. It is the single source of truth for this project's design system.",
    '',
    '- Project: refine-gate',
    '- Phyllum version: 0.10.0',
    '- Created: 2026-08-25',
    '',
    '## Tokens',
    '',
    '### Colours',
    '',
    '| token | value |',
    '| --- | --- |',
    '| surface-default | #FFFFFF |',
    '| text-strong | #767676 |',
    '| ink-deep | #111827 |',
    '',
    '### Numbers',
    '',
    '| token | value | applies to |',
    '| --- | --- | --- |',
    '| radius-sm | 4px | radius |',
    '',
    '### Typography',
    '',
    '| token | size | weight | line-height |',
    '| --- | --- | --- | --- |',
    '| type-body | 16px | 400 | 1.5 |',
    '',
    '## Components',
    '',
    ...components.flatMap(({ name, spec }) => [`### ${name}`, '', '```yaml', ...spec, '```', '']),
    '## Backlog',
    '',
    '_Nothing outstanding._',
    '',
  ].join('\n');
}

function project(dir, components = [{ name: 'Button', spec: BUTTON }], files = { 'src/Button.jsx': BUTTON_MARKUP }) {
  const text = designSystem(components);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), text);
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'sample', dependencies: { react: '^18.0.0' } }),
  );
  for (const [rel, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), contents);
  }
  return { text, model: parse(text) };
}

/** Run the gate with the one non-deterministic input pinned. */
const gateOver = (dir, model, options = {}) => runRefineGate(dir, model, { lint: NO_LINTER, ...options });

const sectionOf = (gate, key) => gate.sections.find((entry) => entry.key === key);

const writeReport = (dir, n, body = '# placeholder\n') => {
  fs.mkdirSync(path.join(dir, STATE_DIR), { recursive: true });
  fs.writeFileSync(path.join(dir, ...refineReportPathFor(n).split('/')), body);
};

// ---------------------------------------------------------------------------
// The order is the table's
// ---------------------------------------------------------------------------

test('the gate runs every section the reference lists, in the order it lists them', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const gate = gateOver(dir, model);

    const expected = gateSections();
    assert.equal(expected.length, 7, 'the reference states seven sections');
    assert.deepEqual(
      gate.sections.map((entry) => entry.key),
      expected.map((row) => row.key),
      'the gate walks the table rather than a list of its own',
    );
    assert.deepEqual(
      gate.sections.map((entry) => entry.order),
      expected.map((row) => row.order),
    );
  });
});

test('determinism first — the mechanical sections all run before the judged ones', () => {
  const rows = gateSections();
  const lastDeterministic = rows.reduce(
    (last, row, index) => (row.kind === 'deterministic' ? index : last),
    -1,
  );
  const firstDerived = rows.findIndex((row) => row.kind === 'derived');
  assert.ok(lastDeterministic >= 0, 'the gate has deterministic sections');
  assert.ok(firstDerived > lastDeterministic, 'the derived verdict comes after every mechanical check');
  assert.equal(rows.at(-1).key, 'ship', 'the verdict is last, because it re-runs nothing');
});

test('no section is skipped, whatever the subject', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const count = gateSections().length;
    for (const subject of [null, 'Button', 'surface-default']) {
      const gate = gateOver(dir, model, { subject });
      assert.equal(gate.sections.length, count, `${subject ?? 'the whole system'} lost a section`);
      for (const entry of gate.sections) {
        // Silence is the one answer a gate may not give: a section that did not
        // apply, or could not run, carries the sentence saying so.
        if (entry.applies && entry.ran) continue;
        assert.equal(typeof entry.reason, 'string');
        assert.ok(entry.reason.length > 0, `${entry.key} went quiet instead of saying why`);
      }
    }
  });
});

test('the report’s headings are the gate’s sections, numbered in gate order', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const gate = gateOver(dir, model);
    const report = renderRefineReport({ number: 1, date: DAY, gate });

    const headings = [...report.matchAll(/^## (\d+)\. (.+)$/gm)];
    assert.deepEqual(
      headings.map((match) => Number(match[1])),
      gateSections().map((row) => row.order),
    );
    assert.match(headings.at(-1)[2], /^Ship verdict$/i, 'the report ends in the verdict section');
  });
});

// ---------------------------------------------------------------------------
// The three scopes
// ---------------------------------------------------------------------------

test('the three scopes are the three the reference records, and no others', () => {
  assert.deepEqual(
    refineScopes().map((row) => row.scope),
    ['component', 'token', 'system'],
  );
});

test('no subject is the whole system, and the whole system is every component', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir, [
      { name: 'Button', spec: BUTTON },
      { name: 'Card', spec: ['name: Card', 'archetype: card', 'properties:', '  background: surface-default'] },
    ]);
    assert.deepEqual(resolveSubject(model), { scope: 'system', subject: null, recorded: true, reason: null });

    const gate = gateOver(dir, model);
    assert.equal(gate.scope, 'system');
    assert.equal(gate.subject, null);
    const contract = sectionOf(gate, 'contract');
    assert.deepEqual(
      contract.detail.subjects.map((entry) => entry.subject).sort(),
      ['Button', 'Card'],
      'the system scope grades every recorded component',
    );
  });
});

test('a component scope grades that component and no other', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir, [
      { name: 'Button', spec: BUTTON },
      { name: 'Card', spec: ['name: Card', 'archetype: card', 'properties:', '  background: surface-default'] },
    ]);
    const gate = gateOver(dir, model, { subject: 'Button' });

    assert.equal(gate.scope, 'component');
    assert.equal(gate.subject, 'Button');
    assert.deepEqual(sectionOf(gate, 'contract').detail.subjects.map((entry) => entry.subject), ['Button']);
    const ship = sectionOf(gate, 'ship');
    assert.deepEqual(ship.detail.components.map((entry) => entry.component), ['Button']);
  });
});

test('a token scope grades the token, and says which sections are out of its reach', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const gate = gateOver(dir, model, { subject: 'surface-default' });

    assert.equal(gate.scope, 'token');
    assert.equal(gate.subject, 'surface-default');

    const contract = sectionOf(gate, 'contract');
    assert.equal(contract.applies, true, 'a token has a contract: its role and its value');
    assert.equal(contract.detail.subjects[0].role, 'colours');
    assert.equal(contract.detail.subjects[0].value, '#FFFFFF');

    assert.equal(sectionOf(gate, 'naming').applies, true, 'a token is exactly what naming grades');

    for (const key of ['coverage', 'lint', 'tests', 'ship']) {
      const entry = sectionOf(gate, key);
      assert.equal(entry.applies, false, `${key} claims to grade a token`);
      assert.equal(entry.pass, null, `${key} passed a token by absence`);
      assert.ok(entry.reason.length > 0, `${key} does not say why it is out of reach`);
    }
  });
});

test('a subject the design system does not record is refused, not guessed at', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const refusal = resolveSubject(model, 'card-hero');
    assert.equal(refusal.recorded, false);
    assert.equal(refusal.scope, null);
    assert.match(refusal.reason, /not a component or a token/);

    const gate = gateOver(dir, model, { subject: 'card-hero' });
    assert.equal(gate.ran, false);
    assert.equal(gate.refused, true);
    assert.deepEqual(gate.sections, []);
    assert.equal(gate.verdict, null);
  });
});

test('a refusal writes no report at all', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const before = snapshotContents(dir);
    const result = refineGate(dir, model, { lint: NO_LINTER, subject: 'card-hero' });

    assert.equal(result.ran, false);
    assert.equal(result.report, null);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
    assert.throws(
      () => renderRefineReport({ number: 1, date: DAY, gate: result }),
      /refused gate leaves no report/,
      'and the renderer refuses to make one from a refusal',
    );
  });
});

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

test('the report is named and pathed the way the other two stages are', () => {
  assert.equal(refineReportFileName(1), 'refine-report-1.md');
  assert.equal(refineReportPathFor(7), `${STATE_DIR}/refine-report-7.md`);
  assert.ok(refineReportPathFor(7).startsWith(REFINE_REPORT_PREFIX), 'the path is the funnel’s, not a second one');
  assert.ok(isAllowedPath(refineReportPathFor(7)), 'and the permission model already allows it');
  assert.ok(REFINE_REPORT_PATTERN.test('refine-report-10.md'));
  assert.ok(!REFINE_REPORT_PATTERN.test('refine-report-.md'));
  assert.ok(!REFINE_REPORT_PATTERN.test('build-report-10.md'));
  for (const bad of [0, -1, 1.5, 'two', null, undefined]) {
    assert.throws(() => refineReportFileName(bad), `${bad} was accepted as a report number`);
  }
});

test('reports order numerically, not lexicographically, and strangers are ignored', async () => {
  await withTempDir(async (dir) => {
    for (const n of [1, 2, 10]) writeReport(dir, n);
    fs.writeFileSync(path.join(dir, STATE_DIR, 'refine-report-01.md'), 'stranger\n');
    fs.writeFileSync(path.join(dir, STATE_DIR, 'refine-report-notes.md'), 'stranger\n');

    assert.deepEqual(listRefineReportNumbers(dir), [1, 2, 10]);
    assert.deepEqual(listRefineReports(dir), [
      { number: 1, path: `${STATE_DIR}/refine-report-1.md` },
      { number: 2, path: `${STATE_DIR}/refine-report-2.md` },
      { number: 10, path: `${STATE_DIR}/refine-report-10.md` },
    ]);
    assert.equal(latestRefineReportNumber(dir), 10);
    assert.equal(nextRefineReportNumber(dir), 11, 'one past the highest that exists, not the count');
  });
});

test('a deleted number is never reused, and an existing report is never overwritten', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const gate = gateOver(dir, model);

    const first = writeRefineReport(dir, gate, { date: DAY });
    const second = writeRefineReport(dir, gate, { date: DAY });
    assert.deepEqual([first.number, second.number], [1, 2], 'the number increments');

    fs.rmSync(path.join(dir, ...refineReportPathFor(1).split('/')));
    const third = writeRefineReport(dir, gate, { date: DAY });
    assert.equal(third.number, 3, 'the hole left by report 1 is not filled');

    const kept = readRefineReport(dir, 2);
    writeRefineReport(dir, gate, { date: '2026-09-09' });
    assert.equal(readRefineReport(dir, 2), kept, 'report 2 is untouched by the write after it');
    assert.deepEqual(listRefineReportNumbers(dir), [2, 3, 4]);
  });
});

test('the whole of bare `refine` is one run and one report', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const result = refineGate(dir, model, { lint: NO_LINTER, date: DAY });

    assert.equal(result.ran, true);
    assert.equal(result.report.number, 1);
    assert.equal(result.report.path, refineReportPathFor(1));
    assert.equal(result.sections.length, 7);
    assert.ok(readRefineReport(dir, 1).startsWith('# Refine report 1'));
    assert.equal(readRefineReport(dir, 2), null);
  });
});

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

test('the report carries the verdict twice — as prose, and as a block a machine reads', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const gate = gateOver(dir, model);
    const report = renderRefineReport({ number: 3, date: DAY, gate });

    assert.ok(report.includes(`\`\`\`${REFINE_VERDICT_FENCE}`), 'the fence is named, not bare');
    const block = parseVerdictBlock(report);
    assert.equal(block.schemaVersion, REFINE_VERDICT_SCHEMA_VERSION);
    assert.equal(block.scope, 'system');
    assert.equal(block.verdict, verdictWord(gate));
    assert.deepEqual(
      block.sections.map((entry) => entry.section),
      gate.sections.map((entry) => entry.section),
      'the block reports the same seven sections the prose does',
    );
    assert.ok(report.includes(verdictWord(gate)), 'and the prose says the same word');
  });
});

test('today’s verdict is “not shippable”, and the docs criterion is why', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const gate = gateOver(dir, model);

    assert.equal(verdictWord(gate), 'not shippable');
    assert.equal(gate.verdict.pass, false);
    assert.deepEqual(gate.verdict.shippable, []);
    assert.deepEqual(gate.verdict.notShippable, ['Button']);
    assert.ok(sectionOf(gate, 'ship').detail.components[0].open.includes('docs-exist'));
  });
});

test('nothing recorded is no verdict, which is neither of the other two answers', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir, [], {});
    const gate = gateOver(dir, model);

    assert.equal(gate.ran, true, 'an empty system is still graded — it just has nothing to grade');
    assert.equal(gate.sections.length, 7);
    assert.equal(verdictWord(gate), 'no verdict');
    assert.equal(parseVerdictBlock(renderRefineReport({ number: 1, date: DAY, gate })).verdict, 'no verdict');
  });
});

test('a token scope has no verdict, because the six criteria are a component’s', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const gate = gateOver(dir, model, { subject: 'surface-default' });
    assert.equal(verdictWord(gate), 'no verdict');
    const block = parseVerdictBlock(renderRefineReport({ number: 1, date: DAY, gate }));
    assert.equal(block.subject, 'surface-default');
    assert.equal(block.sections.find((entry) => entry.section.startsWith('ship')).applies, false);
  });
});

test('the verdict re-runs nothing — every section it reads was handed to it', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    let asked = 0;
    const coverage = {
      ran: true,
      get components() {
        asked += 1;
        return [{ component: 'Button', checked: true, pass: true, findings: [] }];
      },
    };
    const gate = gateOver(dir, model, { coverage });
    assert.ok(asked > 0, 'the handed-in section was read');
    assert.equal(sectionOf(gate, 'coverage').pass, true, 'and the gate reported what it was handed');
  });
});

test('a malformed verdict block is refused rather than half-read', () => {
  assert.equal(parseVerdictBlock('# Refine report 1\n\nno block here\n'), null);
  assert.throws(
    () => parseVerdictBlock(`\`\`\`${REFINE_VERDICT_FENCE}\n{ "verdict": "shippable" }\n`),
    SyntaxError,
    'an unclosed block is not an empty one',
  );
  assert.throws(
    () => parseVerdictBlock(`\`\`\`${REFINE_VERDICT_FENCE}\nnot json\n\`\`\`\n`),
    SyntaxError,
  );
});

// ---------------------------------------------------------------------------
// Dating
// ---------------------------------------------------------------------------

test('the date is injected, and the same gate renders the same bytes twice', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const gate = gateOver(dir, model);
    const once = renderRefineReport({ number: 1, date: DAY, gate });
    const twice = renderRefineReport({ number: 1, date: DAY, gate });

    assert.equal(once, twice, 'no clock is read inside the renderer');
    assert.ok(once.includes(`Date: ${DAY}`));
    assert.notEqual(once, renderRefineReport({ number: 1, date: '2026-09-01', gate }));
    assert.throws(() => renderRefineReport({ number: 1, gate }), TypeError);
    assert.throws(() => renderRefineReport({ number: 1, date: '25/08/2026', gate }), TypeError);
  });
});

test('the date is the reader’s own, not UTC’s', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const gate = gateOver(dir, model);

    // 04:00 in +08 is still yesterday in UTC. `toISOString()` would date the
    // gate report a day behind the calendar of the person reading it.
    const early = new Date(2026, 7, 25, 4, 0, 0);
    const written = writeRefineReport(dir, gate, { now: early });
    const local = `${early.getFullYear()}-${String(early.getMonth() + 1).padStart(2, '0')}-${String(early.getDate()).padStart(2, '0')}`;

    assert.equal(written.date, local);
    assert.equal(written.date, reportDate(early), 'one clock-reading function, shared with the other stages');
    assert.ok(readRefineReport(dir, written.number).includes(`Date: ${local}`));
  });
});

test('the gate module reads no clock of its own through toISOString', () => {
  // The module names `toISOString()` once, in the comment explaining why it is
  // not used. What it must never do is call one.
  const source = fs.readFileSync(new URL('../../lib/refine-gate.js', import.meta.url), 'utf8');
  assert.equal(source.includes('.toISOString('), false, 'lib/refine-gate.js dates a report in UTC');
});

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

test('running the gate writes the report and nothing else', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const before = snapshotContents(dir);
    refineGate(dir, model, { lint: NO_LINTER, date: DAY });
    const diff = diffSnapshots(before, snapshotContents(dir));

    assert.deepEqual(diff.added, [refineReportPathFor(1)], 'one new file, and it is the report');
    assert.deepEqual(diff.changed, [], 'DESIGN-SYSTEM.md and the user’s source are read only');
    assert.deepEqual(diff.removed, []);
  });
});

test('every write the gate makes lands under .phyllum/', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const before = snapshotContents(dir);
    refineGate(dir, model, { lint: NO_LINTER, date: DAY });
    refineGate(dir, model, { lint: NO_LINTER, date: DAY, subject: 'Button' });
    refineGate(dir, model, { lint: NO_LINTER, date: DAY, subject: 'surface-default' });
    const diff = diffSnapshots(before, snapshotContents(dir));

    assert.equal(diff.added.length, 3, 'three runs, three reports');
    for (const rel of diff.added) {
      assert.ok(rel.startsWith(`${STATE_DIR}/`), `${rel} is outside .phyllum/`);
    }
    assert.deepEqual(diff.changed, []);
    assert.deepEqual(diff.removed, []);
  });
});

test('the report goes through the write funnel, not a raw fs call', () => {
  const source = fs.readFileSync(new URL('../../lib/refine-gate.js', import.meta.url), 'utf8');
  assert.ok(source.includes('writeRefineReportFile'), 'the funnel is what writes the report');
  for (const call of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync']) {
    assert.equal(source.includes(call), false, `lib/refine-gate.js calls ${call} directly`);
  }
});

test('the gate never rewrites the user’s code, whatever it finds', async () => {
  await withTempDir(async (dir) => {
    const { model } = project(dir);
    const markup = path.join(dir, 'src', 'Button.jsx');
    const kept = fs.readFileSync(markup, 'utf8');
    refineGate(dir, model, { lint: NO_LINTER, date: DAY });
    assert.equal(fs.readFileSync(markup, 'utf8'), kept, 'refine grades; only apply writes source');
  });
});
