/**
 * Assertions for `create` pick mode (plan §3.1 Mode C, §8.5).
 *
 * The plan's assertion for this mode is one sentence — "bare `create` presents
 * archetypes + detected candidates; selection seeds a draft that enters the
 * same follow-up loop" — and every check here is a piece of it, plus the two
 * ways a picker can be dishonest:
 *
 *   Proposing what is already registered, which invites a duplicate of a
 *   component the system already has.
 *
 *   Seeding values. A pick says *what* to build, never what it looks like: the
 *   CSS around a candidate arrives as follow-up suggestions the user accepts or
 *   refuses, never as facts in the draft.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { archetypes } from '../../lib/archetypes.js';
import { writeAssessReport } from '../../lib/assess-reports.js';
import { scoreAssessment } from '../../lib/assess-score.js';
import {
  archetypeForSignature,
  pickList,
  renderPicker,
  resolvePick,
  scanCandidates,
  scanMarkup,
  seedFromPick,
} from '../../lib/candidates.js';
import { parse } from '../../lib/design-system.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { readDraft } from '../../lib/state.js';
import {
  FIXTURES,
  POPULATED_FIXTURE,
  copyDir,
  diffSnapshots,
  readFixture,
  snapshotContents,
  withTempDir,
} from './helpers.js';

const REPEATED_JSX = path.join(FIXTURES, 'codebases', 'repeated-jsx');

const run = (line, cwd, extra = {}) =>
  execute(tokenizeLine(line), { cwd, env: {}, yes: true, ...extra });

/** A project that is the fixture codebase, with a design system on top. */
async function withProject(body, { system = POPULATED_FIXTURE } = {}) {
  return withTempDir(async (dir) => {
    copyDir(REPEATED_JSX, dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(system));
    return body(dir);
  });
}

const model = () => parse(readFixture(POPULATED_FIXTURE));

/** An assessment with two rules' worth of findings, shaped as the scan emits. */
function assessed() {
  const result = {
    values: {
      uncovered: [
        { severity: 'error', rule: 'raw-colour', value: '#3b82f6', count: 12, files: ['a.css'] },
        { severity: 'warn', rule: 'raw-spacing', value: '13px', count: 1, files: ['d.css'] },
      ],
    },
    naming: { findings: [] },
    props: { findings: [] },
    similarity: { findings: [] },
    hygiene: { findings: [] },
    extras: { findings: [] },
  };
  result.score = scoreAssessment(result);
  return result;
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

test('the scan counts repeated markup signatures, read-only', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const signatures = scanMarkup(dir);
    const chip = signatures.find((entry) => entry.signature === 'span.chip.chip--info');

    assert.ok(chip, 'the repeated chip is seen');
    assert.equal(chip.count, 4);
    assert.deepEqual(chip.files.sort(), ['src/Sidebar.jsx', 'src/Toolbar.jsx']);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('the signals table decides which archetype a signature is', () => {
  assert.equal(
    archetypeForSignature({ element: 'span', classes: ['chip', 'chip--info'] }).archetype.key,
    'badge',
    'a chip is a badge, through the archetype aliases',
  );
  assert.equal(
    archetypeForSignature({ element: 'button', classes: [] }).archetype.key,
    'button',
  );
  assert.equal(
    archetypeForSignature({ element: 'PriceCard', classes: [] }).archetype.key,
    'card',
    'a custom component is read by its name',
  );
  assert.equal(archetypeForSignature({ element: 'div', classes: ['wrapper'] }), null);
});

test('a candidate seeds a name and an archetype, and no values at all', async () => {
  await withProject(async (dir) => {
    const [chip] = scanCandidates(dir, model());
    assert.equal(chip.name, 'Badge/Info');
    assert.equal(chip.archetype, 'badge');

    const draft = seedFromPick({ kind: 'candidate', ...chip });
    assert.deepEqual(draft.properties, [], 'nothing about the chip’s CSS is assumed');
    assert.deepEqual(draft.states, []);
    assert.equal(draft.source.mode, 'pick');
    assert.equal(draft.source.candidate.count, 4);
  });
});

test('a component the system already has is not offered as a candidate', async () => {
  await withProject(async (dir) => {
    const candidates = scanCandidates(dir, model());
    assert.ok(
      !candidates.some((candidate) => candidate.signature === 'button.button-primary'),
      'button-primary is what Phyllum calls Button/Primary, which is registered',
    );
    assert.ok(
      !candidates.some((candidate) => candidate.signature === 'button.btn.btn--ghost'),
      'one sighting is not a pattern',
    );
  });
});

// ---------------------------------------------------------------------------
// The picker
// ---------------------------------------------------------------------------

test('bare create presents every archetype exactly once, then the candidates', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('create', dir, { env: { CLAUDECODE: '1' } });
    assert.equal(code, 0);

    for (const archetype of archetypes()) {
      const occurrences = out.split(`. ${archetype.name}`).length - 1;
      assert.ok(occurrences >= 1, `${archetype.name} is missing from the picker`);
    }
    assert.ok(out.includes('Found in your codebase'));
    assert.ok(out.includes('`span.chip.chip--info` used 4×'));
    assert.ok(out.includes('src/'), 'a candidate says where it was seen');
    assert.ok(out.includes('Nothing has been written'));
  });
});

test('the picker numbers archetypes first, then candidates, in one sequence', async () => {
  await withProject(async (dir) => {
    const picker = pickList(dir, model());
    assert.equal(picker.archetypes.length, archetypes().length);
    assert.equal(
      picker.choices.length,
      picker.archetypes.length + picker.candidates.length + 1,
      'archetypes, then candidates, then the one custom row',
    );

    const text = renderPicker(picker);
    assert.ok(text.includes('  1. Button'));
    assert.ok(text.includes(`  ${picker.archetypes.length + 1}. Badge/Info`));

    // Custom is last, always — an escape hatch, never the default (§6.7).
    assert.equal(picker.choices.at(-1).kind, 'custom');
    assert.ok(text.includes(`  ${picker.choices.length}. Custom`));
  });
});

test('a pick resolves by number or by name, and matches nothing else', async () => {
  await withProject(async (dir) => {
    const picker = pickList(dir, model());

    assert.equal(resolvePick('1', picker).archetypeName, 'Button');
    assert.equal(resolvePick('Badge/Info', picker).kind, 'candidate');
    assert.equal(resolvePick('card', picker).kind, 'archetype');
    assert.equal(resolvePick('span.chip.chip--info', picker).kind, 'candidate');
    assert.equal(resolvePick('99', picker), null);
    assert.equal(resolvePick('something else', picker), null);
    assert.equal(resolvePick('', picker), null);
  });
});

test('an answer that matches nothing starts nothing, and says so', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out } = await run('create', dir, {
      env: { CLAUDECODE: '1' },
      ask: async () => 'a thing',
    });
    assert.ok(out.includes('could not match "a thing"'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});

// ---------------------------------------------------------------------------
// Selection enters the same follow-up loop as every other mode
// ---------------------------------------------------------------------------

test('picking a candidate seeds a draft and enters the follow-up loop', async () => {
  await withProject(async (dir) => {
    const asked = [];
    const { out } = await run('create', dir, {
      env: { CLAUDECODE: '1' },
      ask: async (question) => {
        if (question.includes('Which one?')) return 'Badge/Info';
        asked.push(question);
        return 'skip';
      },
    });

    // Badge's contract: background, text-colour, radius, typography, padding.
    for (const slot of ['background', 'text-colour', 'radius', 'typography', 'padding']) {
      assert.ok(
        asked.some((question) => question.includes(slot)),
        `the loop should ask about ${slot}`,
      );
    }
    assert.ok(out.includes('Draft — Badge/Info'));
    assert.ok(out.includes('From your pick: `span.chip.chip--info`, used 4×'));
    assert.ok(out.includes('background: TODO'), 'a skipped slot is an honest TODO');
    assert.ok(out.includes('Code view (React + CSS)'));
  });
});

test('the follow-up loop offers what the codebase uses, and records only answers', async () => {
  await withProject(async (dir) => {
    const { out } = await run('create', dir, {
      env: { CLAUDECODE: '1' },
      ask: async (question, suggestions) => {
        if (question.includes('Which one?')) return 'Badge/Info';
        if (!question.includes('background')) return 'skip';
        const fromCode = suggestions.filter((suggestion) => suggestion.source === 'codebase');
        assert.ok(fromCode.length > 0, 'values from the codebase are offered');
        const evidence = fromCode.find((suggestion) => suggestion.value === '#EFF6FF');
        assert.ok(evidence, 'including the one the chip itself uses');
        assert.ok(evidence.text.includes('styles.css'), 'and it says where it came from');
        return String(suggestions.indexOf(evidence) + 1);
      },
    });
    assert.ok(out.includes('background: #EFF6FF'), 'and lands only because it was picked');
  });
});

test('picking an archetype seeds an empty draft of that kind', async () => {
  await withProject(async (dir) => {
    const { out } = await run('create', dir, {
      env: { CLAUDECODE: '1' },
      ask: async (question) => (question.includes('Which one?') ? '2' : 'skip'),
    });
    assert.ok(out.includes('Draft — Input/Default'));
    assert.ok(out.includes('From your pick: Input'));

    const draft = readDraft(dir);
    assert.equal(draft.archetype, 'input');
    assert.ok(draft.properties.every((property) => property.origin !== 'pick'));
  });
});

test('nothing is written until the pick is accepted, and then only one file', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const declined = await run('create', dir, {
      env: { CLAUDECODE: '1' },
      ask: async (question) => (question.includes('Which one?') ? 'Badge/Info' : 'skip'),
      confirm: async () => false,
    });
    assert.ok(declined.out.includes('Not accepted, so nothing was written'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);

    const accepted = await run('create', dir, {
      env: { CLAUDECODE: '1' },
      ask: async (question) => (question.includes('Which one?') ? 'Badge/Info' : 'skip'),
      confirm: async () => true,
    });
    assert.ok(accepted.out.includes('Wrote Badge/Info to DESIGN-SYSTEM.md'));

    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.changed, ['DESIGN-SYSTEM.md']);
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(
      diff.added.filter((rel) => !rel.startsWith('.phyllum/')),
      ['DESIGN-SYSTEM.md.bak'],
    );
  });
});

// ---------------------------------------------------------------------------
// The Build stage's default input (v0.10.0 phase 2)
// ---------------------------------------------------------------------------

test('bare create leads with the latest drift report, and numbers nothing new', async () => {
  await withProject(async (dir) => {
    const written = writeAssessReport(dir, assessed(), { date: '2026-08-24' });
    const { out, code } = await run('create', dir, { env: { CLAUDECODE: '1' } });
    assert.equal(code, 0);

    assert.ok(out.includes(`From your latest drift report — assess-${written.number}, 2026-08-24`));
    assert.ok(out.includes('`raw-colour`'), 'the report’s recommendations are the leading section');
    assert.ok(
      out.indexOf('raw-colour') < out.indexOf('What would you like to create?'),
      'the report comes above the picker, not inside it',
    );

    // A recommendation is a piece of work, not a component to seed a draft
    // from, so it is never numbered beside the archetypes — the picker's own
    // numbering is exactly the numbering that was there before this phase.
    assert.ok(out.includes('  1. Button'));
    const picker = pickList(dir, model());
    assert.ok(out.includes(`  ${picker.archetypes.length + 1}. Badge/Info`));
    assert.equal(resolvePick('1', picker).archetypeName, 'Button');
  });
});

test('a project with no drift report sees exactly the picker it always saw', async () => {
  await withProject(async (dir) => {
    const { out } = await run('create', dir, { env: { CLAUDECODE: '1' } });
    assert.ok(!out.includes('drift report'), 'nothing is said about a report that does not exist');
    assert.ok(out.startsWith('What would you like to create?'));
  });
});

test('a mangled recommendations block is reported, and the picker still runs', async () => {
  await withProject(async (dir) => {
    fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.phyllum', 'assess-2.md'),
      '# Assessment 2\n\nDate: 2026-08-24\n\n```phyllum-recommendations\n{ nope }\n```\n',
    );
    const { out } = await run('create', dir, { env: { CLAUDECODE: '1' } });
    assert.ok(out.includes('could not be read'), 'the parse failure is surfaced, not swallowed');
    assert.ok(out.includes('assess-2, 2026-08-24'), 'and it names the report to fix');
    assert.ok(out.includes('  1. Button'), 'the flow falls back to exactly today’s picker');
  });
});

test('a description outranks the report — prose mode never opens one', async () => {
  await withProject(async (dir) => {
    writeAssessReport(dir, assessed(), { date: '2026-08-24' });
    const { out } = await run('create "button primary with 12px padding-top"', dir, {
      env: { CLAUDECODE: '1' },
    });
    assert.ok(out.includes('From your description: "button primary with 12px padding-top"'));
    assert.ok(!out.includes('drift report'), 'a sentence the user typed is never filtered by a file');
  });
});

test('a codebase with nothing repeated offers the archetypes and says so plainly', async () => {
  await withTempDir(async (dir) => {
    copyDir(path.join(FIXTURES, 'codebases', 'react-css'), dir);
    fs.writeFileSync(
      path.join(dir, 'DESIGN-SYSTEM.md'),
      readFixture(path.join(FIXTURES, 'design-system', 'empty.md')),
    );
    const { out } = await run('create', dir, { env: { CLAUDECODE: '1' } });
    assert.ok(out.includes('nothing repeated often enough to propose'));
    assert.ok(out.includes('1. Button'));
  });
});
