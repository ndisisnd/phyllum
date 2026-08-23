/**
 * Assertions for the reader half of v0.7.3 (plan phase 2 — "The reader").
 *
 * Phase 1 settled what a typography token may hold. This file checks the two
 * commands that put readings *into* a token and take them out again: `tokenise`
 * reading bare keywords out of a sentence and gathering the rest in one
 * follow-up, and `update token` changing or clearing one.
 *
 * Five promises are pinned here, and each of them is a promise about behaviour
 * rather than about shape:
 *
 *   1. Every bare reading is a sentence keyword, and it binds to the reading
 *      whose clause it sits in rather than to the sentence.
 *   2. Every enum and value reading is gathered in **one** follow-up, asked
 *      after the three core readings, and a skipped follow-up records nothing.
 *   3. A near-duplicate is warned about and asked about — never auto-refused as
 *      a duplicate, never silently written.
 *   4. The naming scale reads weight and size and nothing else. No optional
 *      reading shifts a proposed name. This is the assertion the plan asks for
 *      by name.
 *   5. `update token` changes or clears a reading, and the rename ripple is
 *      unaffected by any of it.
 *
 * Never-invent and never-correct are checked throughout rather than in one
 * place, because they are properties of every path and not of one.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse, render } from '../../lib/design-system.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { nameTypography } from '../../lib/tokenise.js';
import { parseProse } from '../../lib/tokenise-prose.js';
import {
  bareKeywordHits,
  conflictQuestions,
  followUpReadings,
  isSkip,
  readingChanges,
  readingDifferences,
  readingLines,
  settleConflict,
} from '../../lib/tokenise-readings.js';
import { readingsQuestion } from '../../lib/tokenise-command.js';
import { readChange, tokensOfType } from '../../lib/update-command.js';
import { readingCopy, specNotices, typeKeywordFor } from '../../lib/tokenise-spec.js';
import { clearPhrases, updateSpecNotices } from '../../lib/update-spec.js';
import { isReading, optionalReadings, readingsOf } from '../../lib/typography.js';
import { POPULATED_FIXTURE, readFixture, withTempDir } from './helpers.js';

const run = (line, cwd, extra = {}) =>
  execute(tokenizeLine(line), { cwd, env: {}, yes: true, ...extra });

/** A project with a design system, and no codebase worth reading. */
async function withProject(body, fixture = POPULATED_FIXTURE) {
  return withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(fixture));
    return body(dir);
  });
}

/** The answers a full acceptance gives: yes to everything, and this follow-up. */
const accepting = (followUp = 'skip') => ({
  ask: async (question) => (/Anything else/.test(question) ? followUp : 'y'),
  confirm: async () => true,
});

/** The typography section of a written file, as `{ token: readings }`. */
function readingsIn(dir) {
  const model = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
  const out = {};
  for (const row of model.tokens.typography ?? []) out[row[0]] = readingsOf(model, row[0]);
  return out;
}

// ---------------------------------------------------------------------------
// The keyword table is the contract
// ---------------------------------------------------------------------------

test('the keyword table names only readings refs/typography.md declares', () => {
  // Every shipped row must read, and every reading it names must exist. A row
  // naming an invented reading is dropped and reported rather than recorded —
  // which is why an empty notice list is the assertion.
  assert.deepEqual(specNotices(), []);
  assert.deepEqual(updateSpecNotices(), []);

  for (const spelling of ['underlined', 'struck through', 'small caps', 'tracking', 'typeface']) {
    const row = typeKeywordFor(spelling);
    assert.ok(row, `${spelling} names no reading`);
    assert.ok(isReading(row.reading), `${spelling} names ${row.reading}, which is not a reading`);
  }
});

test('every optional reading is reachable by at least one word', () => {
  // A reading nobody can say is a reading nobody can record. The check is
  // deliberately over the contract's list rather than over the keyword table,
  // so adding a reading in phase 1 fails here until phase 2 gives it words.
  const missing = optionalReadings()
    .map((row) => row.reading)
    .filter(
      (reading) =>
        ![reading, reading.replace(/-/g, ' ')].some(
          (spelling) => typeKeywordFor(spelling)?.reading === reading,
        ),
    );
  assert.deepEqual(missing, []);
});

test('a spelling that is its own value carries it, and one that is not carries nothing', () => {
  assert.deepEqual(typeKeywordFor('italic'), { reading: 'italic-or-oblique', means: 'italic' });
  assert.deepEqual(typeKeywordFor('oblique'), { reading: 'italic-or-oblique', means: 'oblique' });
  assert.deepEqual(typeKeywordFor('uppercase'), { reading: 'text-transform', means: 'uppercase' });
  // `kerning` names the reading and nothing more: the value is whatever follows.
  assert.deepEqual(typeKeywordFor('kerning'), { reading: 'kerning', means: null });
});

// ---------------------------------------------------------------------------
// A bare reading is a sentence keyword
// ---------------------------------------------------------------------------

test('tokenise reads every bare reading as a sentence keyword', () => {
  const parsed = parseProse(
    'heading 24px bold 1.2 underlined, struck through, superscript, small caps',
  );
  assert.equal(parsed.candidates.length, 1);
  assert.deepEqual(parsed.candidates[0].readings, {
    underline: true,
    strikethrough: true,
    superscript: true,
    'small-caps': true,
  });
});

test('subscript is read as its own keyword, not as a spelling of superscript', () => {
  const parsed = parseProse('caption 12px regular 1.4 subscript');
  assert.deepEqual(parsed.candidates[0].readings, { subscript: true });
});

test('a bare keyword binds to the reading whose clause it sits in', () => {
  // The binding table's own rule: a fragment belongs to the nearest reading on
  // its left. Underlining the caption too would be reading a decision nobody
  // made about a token nobody mentioned it for.
  const parsed = parseProse('heading 24px bold underlined and caption 12px regular');
  assert.deepEqual(
    parsed.candidates.map((item) => [item.size, item.readings]),
    [
      ['24px', { underline: true }],
      ['12px', {}],
    ],
  );
});

test('a keyword with nothing on its left binds right, as a stranded weight does', () => {
  const parsed = parseProse('underlined heading 24px bold');
  assert.deepEqual(parsed.candidates[0].readings, { underline: true });
});

test('a sentence stating no reading records none — never a default', () => {
  const parsed = parseProse('heading 24px bold 1.2');
  assert.deepEqual(parsed.candidates[0].readings, {});
  assert.deepEqual(bareKeywordHits('heading 24px bold 1.2'), []);
});

test('the sentence pass reads bare readings only, so ordinary words stay ordinary', () => {
  // "measure", "case" and "face" are English before they are readings. Reading
  // them out of a sentence would conjure a value nobody stated.
  const parsed = parseProse('body 16px regular 1.5 for the measure of a face in any case');
  assert.deepEqual(parsed.candidates[0].readings, {});
});

// ---------------------------------------------------------------------------
// One follow-up gathers every enum and value
// ---------------------------------------------------------------------------

test('the follow-up is one question, and its copy comes from the table', () => {
  const question = readingsQuestion();
  assert.ok(question.includes(readingCopy('follow-up')));
  assert.ok(question.includes(readingCopy('follow-up-hint')));
  assert.ok(question.includes(readingCopy('follow-up-example')));
  for (const line of ['follow-up', 'follow-up-hint', 'follow-up-example', 'follow-up-skip']) {
    assert.notEqual(readingCopy(line), '', `${line} has no copy`);
  }
});

test('one follow-up answer gathers every enum and value reading', () => {
  const read = followUpReadings('kerning 0.02em, uppercase, italic, measure 60ch, underlined');
  assert.deepEqual(read.readings, {
    kerning: '0.02em',
    'text-transform': 'uppercase',
    'italic-or-oblique': 'italic',
    measure: '60ch',
    underline: true,
  });
  assert.deepEqual(read.unread, []);
});

test('a value carrying commas and quotes is recorded exactly as given', () => {
  const read = followUpReadings('face "Inter", system-ui, sans-serif');
  assert.equal(read.readings['font-family'], '"Inter", system-ui, sans-serif');

  const features = followUpReadings('font feature settings "ss01", "cv11" and uppercase');
  assert.equal(features.readings['font-feature-settings'], '"ss01", "cv11"');
  assert.equal(features.readings['text-transform'], 'uppercase');
});

test('a kerning nobody would have chosen is not corrected', () => {
  assert.equal(followUpReadings('kerning 0.4291em').readings.kerning, '0.4291em');
  assert.equal(followUpReadings('font stretch 87.5%').readings['font-stretch'], '87.5%');
});

test('a reading named with no value records nothing, and says so', () => {
  const read = followUpReadings('kerning');
  assert.deepEqual(read.readings, {});
  assert.equal(read.unread.length, 1);
  assert.match(read.unread[0], /kerning/);
});

test('a skipped follow-up is recognised before anything is read', () => {
  for (const answer of ['', 'skip', 'no', 'none', 'nothing']) {
    assert.equal(isSkip(answer), true, `${answer} should be a skip`);
  }
  assert.equal(isSkip('kerning 0.02em'), false);
});

test('the follow-up is asked after the three core readings, and only for typography', async () => {
  await withProject(async (dir) => {
    const asked = [];
    const result = await run('tokenise "heading 24px bold 1.2"', dir, {
      ask: async (question) => {
        asked.push(question);
        return /Anything else/.test(question) ? 'skip' : 'y';
      },
      confirm: async () => true,
    });
    assert.equal(result.code, 0);
    // One follow-up, and it comes before the name is put to the user — the
    // three core readings were already in the sentence.
    const followUps = asked.filter((question) => /Anything else/.test(question));
    assert.equal(followUps.length, 1);
    assert.ok(asked.indexOf(followUps[0]) < asked.findIndex((q) => /^Name /.test(q)));
  });

  await withProject(async (dir) => {
    const asked = [];
    await run('tokenise "our brand blue #2563EB"', dir, {
      ask: async (question) => {
        asked.push(question);
        return 'y';
      },
      confirm: async () => true,
    });
    assert.deepEqual(asked.filter((question) => /Anything else/.test(question)), []);
  });
});

test('a skipped follow-up writes the token and no block at all', async () => {
  await withProject(async (dir) => {
    const result = await run('tokenise "display 40px bold 1.1"', dir, accepting('skip'));
    assert.equal(result.code, 0);
    const text = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(text.includes('| highlight-display | 40px | 700 | 1.1 |'));
    assert.equal(text.includes('#### highlight-display'), false);
    assert.deepEqual(readingsIn(dir)['highlight-display'], {});
  });
});

test('an answered follow-up writes one block, in the contract row order', async () => {
  await withProject(async (dir) => {
    const result = await run(
      'tokenise "display 40px bold 1.1 underlined"',
      dir,
      accepting('kerning 0.02em, uppercase'),
    );
    assert.equal(result.code, 0);
    const text = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(text.includes('#### highlight-display'));
    // Bytes, because the row order of the block is the contract's row order and
    // nothing else — kerning before underline before text-transform.
    assert.ok(
      text.includes('```yaml\nkerning: 0.02em\nunderline: true\ntext-transform: uppercase\n```'),
      text,
    );
  });
});

test('what the follow-up gathered is shown before the acceptance gate', async () => {
  await withProject(async (dir) => {
    const result = await run(
      'tokenise "display 40px bold 1.1"',
      dir,
      accepting('kerning 0.02em, uppercase'),
    );
    assert.match(result.out, /also {3}kerning: 0\.02em/);
    assert.match(result.out, /also {3}text-transform: uppercase/);
  });
});

test('the sentence wins over the follow-up: the first statement of a slot stands', async () => {
  await withProject(async (dir) => {
    await run('tokenise "display 40px bold 1.1 underlined"', dir, accepting('underlined'));
    assert.deepEqual(readingsIn(dir)['highlight-display'], { underline: true });
  });
});

test('a recorded reading survives the round trip byte-identical', async () => {
  await withProject(async (dir) => {
    await run(
      'tokenise "display 40px bold 1.1"',
      dir,
      accepting('face "Inter", system-ui and feature settings "ss01", "cv11"'),
    );
    const file = path.join(dir, 'DESIGN-SYSTEM.md');
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(render(parse(text)), text);
    assert.equal(readingsIn(dir)['highlight-display']['font-family'], '"Inter", system-ui');
    assert.equal(
      readingsIn(dir)['highlight-display']['font-feature-settings'],
      '"ss01", "cv11"',
    );
  });
});

// ---------------------------------------------------------------------------
// The conflicts, asked rather than resolved
// ---------------------------------------------------------------------------

test('superscript with subscript is a question, and both answers are offered', () => {
  const questions = conflictQuestions({ superscript: true, subscript: true }, 'heading');
  assert.equal(questions.length, 1);
  assert.equal(questions[0].kind, 'conflict');
  assert.deepEqual(questions[0].options, ['superscript', 'subscript']);
  assert.equal(questions[0].ask, readingCopy('conflict'));
  assert.equal(questions[0].keepBoth, readingCopy('keep-both'));
});

test('font-variant over a longhand is a question, and the shorthand is offered too', () => {
  const questions = conflictQuestions(
    { 'font-variant': 'small-caps', 'small-caps': true },
    'heading',
  );
  assert.equal(questions.length, 1);
  assert.equal(questions[0].kind, 'overlap');
  assert.deepEqual(questions[0].options, ['font-variant', 'small-caps']);
});

test('underline with strikethrough is never a question — the contract merges them', () => {
  assert.deepEqual(conflictQuestions({ underline: true, strikethrough: true }, 'heading'), []);
});

test('answering a conflict keeps one reading, and nothing is dropped silently', () => {
  const held = { superscript: true, subscript: true, kerning: '0.02em' };
  const [question] = conflictQuestions(held, 'heading');
  const settled = settleConflict(held, question, 'superscript');
  assert.deepEqual(settled.readings, { superscript: true, kerning: '0.02em' });
  assert.deepEqual(settled.kept, ['superscript']);
});

test('an unanswered conflict keeps both — a question about two stated things never refuses one', () => {
  const held = { superscript: true, subscript: true };
  const [question] = conflictQuestions(held, 'heading');
  assert.deepEqual(settleConflict(held, question, '').readings, held);
  assert.deepEqual(settleConflict(held, question, 'keep both').readings, held);
});

test('a conflict in a sentence is warned about, asked about, and recorded as answered', async () => {
  await withProject(async (dir) => {
    const asked = [];
    const result = await run('tokenise "display 40px bold 1.1 superscript subscript"', dir, {
      ask: async (question) => {
        asked.push(question);
        if (/Anything else/.test(question)) return 'skip';
        if (question.includes(readingCopy('conflict'))) return 'superscript';
        return 'y';
      },
      confirm: async () => true,
    });
    assert.equal(result.code, 0);
    // Warned: the notice is printed before the question is asked.
    assert.match(result.out, /both write `font-variant-position`/);
    assert.ok(asked.some((question) => question.includes(readingCopy('conflict'))));
    assert.deepEqual(readingsIn(dir)['highlight-display'], { superscript: true });
  });
});

test('a conflict is never auto-resolved when there is nobody to ask', async () => {
  await withProject(async (dir) => {
    const result = await run('tokenise "display 40px bold 1.1 superscript subscript"', dir, {
      confirm: async () => true,
    });
    assert.match(result.out, /both write `font-variant-position`/);
    // Both readings are recorded exactly as read. Nothing is auto-resolved and
    // nothing is dropped: a collision nobody could be asked about stays a
    // collision the file honestly shows.
    assert.deepEqual(readingsIn(dir)['highlight-display'], {
      superscript: true,
      subscript: true,
    });
  });
});

// ---------------------------------------------------------------------------
// A near-duplicate is warned about and asked about
// ---------------------------------------------------------------------------

test('a token matching on all three core readings but not on its readings is asked about', async () => {
  await withProject(async (dir) => {
    // The fixture holds `highlight-small` at 12px / 700 / 1.3 and no block.
    const asked = [];
    const result = await run('tokenise "12px bold 1.3 heading underlined"', dir, {
      ask: async (question) => {
        asked.push(question);
        if (/Anything else/.test(question)) return 'skip';
        return 'y';
      },
      confirm: async () => true,
    });
    assert.equal(result.code, 0);
    // Warned, in words, saying which reading differs.
    assert.match(result.out, /matches `highlight-small`/);
    assert.match(result.out, /underline: yes here, not recorded there/);
    // Asked, with the table's own copy.
    assert.ok(asked.some((question) => question.includes(readingCopy('near-duplicate'))));
    // Answered yes, so a second token is written rather than refused.
    const rows = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8')).tokens.typography;
    assert.equal(rows.length, 2);
    assert.deepEqual(readingsIn(dir)[rows[1][0]], { underline: true });
  });
});

test('answering no to a near-duplicate writes nothing at all', async () => {
  await withProject(async (dir) => {
    const before = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    const result = await run('tokenise "12px bold 1.3 heading underlined"', dir, {
      ask: async (question) => {
        if (/Anything else/.test(question)) return 'skip';
        if (question.includes(readingCopy('near-duplicate'))) return 'skip';
        return 'y';
      },
      confirm: async () => true,
    });
    assert.equal(result.code, 0);
    assert.match(result.out, /Left as `highlight-small`/);
    assert.equal(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'), before);
  });
});

test('a plain duplicate is still already-named, with no near-duplicate question', async () => {
  await withProject(async (dir) => {
    const before = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    const asked = [];
    const result = await run('tokenise "12px bold 1.3 heading"', dir, {
      ask: async (question) => {
        asked.push(question);
        return /Anything else/.test(question) ? 'skip' : 'y';
      },
      confirm: async () => true,
    });
    assert.equal(result.code, 0);
    assert.match(result.out, /already `highlight-small`/);
    assert.deepEqual(asked.filter((q) => q.includes(readingCopy('near-duplicate'))), []);
    assert.equal(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'), before);
  });
});

test('readingDifferences says which readings two tokens disagree about', () => {
  assert.deepEqual(readingDifferences({ underline: true }, {}), [
    { reading: 'underline', mine: true, theirs: null },
  ]);
  assert.deepEqual(readingDifferences({ kerning: '1px' }, { kerning: '1px' }), []);
  // In the contract's own row order, so a warning reads the way a block does.
  assert.deepEqual(
    readingDifferences({ underline: true, kerning: '1px' }, {}).map((item) => item.reading),
    ['kerning', 'underline'],
  );
});

// ---------------------------------------------------------------------------
// The naming scale is untouched — the pin the plan asks for by name
// ---------------------------------------------------------------------------

test('no optional reading shifts a proposed name', () => {
  // The scale takes size and weight, and there is nowhere for a reading to
  // enter it. Handing it every reading at once changes nothing.
  const every = Object.fromEntries(optionalReadings().map((row) => [row.reading, 'anything']));
  const plain = nameTypography({ size: '24px', weight: '700' });
  assert.equal(nameTypography({ size: '24px', weight: '700', ...every }), plain);
  assert.equal(nameTypography({ size: '24px', weight: '700', readings: every }), plain);
});

test('weight still picks the role and size still picks the band', async () => {
  await withProject(async (dir) => {
    const withReadings = await run(
      'tokenise "display 40px bold 1.1 underlined small caps"',
      dir,
      accepting('kerning 0.02em, uppercase'),
    );
    assert.match(withReadings.out, /name {3}highlight-display/);
    assert.match(withReadings.out, /weight picks the role, size picks the band/);
  });

  await withProject(async (dir) => {
    const without = await run('tokenise "display 40px bold 1.1"', dir, accepting('skip'));
    assert.match(without.out, /name {3}highlight-display/);
  });
});

test('the same three numbers propose the same name whatever the readings', async () => {
  const names = [];
  for (const followUp of ['skip', 'kerning 0.02em, uppercase, italic']) {
    await withProject(async (dir) => {
      const result = await run('tokenise "caption 11px regular 1.4"', dir, accepting(followUp));
      names.push(result.out.match(/name {3}(\S+)/)[1]);
    });
  }
  assert.equal(names[0], names[1]);
});

// ---------------------------------------------------------------------------
// `update token` changes and clears a reading
// ---------------------------------------------------------------------------

/** A project whose one typography token already carries readings. */
async function withReadings(body, block = 'kerning: 0.02em\nunderline: true') {
  return withProject(async (dir) => {
    const file = path.join(dir, 'DESIGN-SYSTEM.md');
    const text = fs
      .readFileSync(file, 'utf8')
      .replace(
        '| highlight-small | 12px | 700 | 1.3 |\n',
        `| highlight-small | 12px | 700 | 1.3 |\n\n#### highlight-small\n\n\`\`\`yaml\n${block}\n\`\`\`\n`,
      );
    fs.writeFileSync(file, text);
    return body(dir);
  });
}

test('readChange reads a changed reading against the token it is about', () => {
  const entry = {
    section: 'typography',
    index: 0,
    row: ['highlight-small', '12px', '700', '1.3'],
    name: 'highlight-small',
    readings: { kerning: '0.02em', underline: true },
  };
  const changed = readChange('kerning becomes 0.04em', entry);
  assert.equal(changed.changed, true);
  assert.equal(changed.changedValue, false);
  assert.deepEqual(changed.readings, { kerning: '0.04em', underline: true });
  // The core three are untouched, so the row comes back exactly as it went in.
  assert.deepEqual(changed.row, entry.row);
});

test('readChange reads a cleared reading, and removes it rather than emptying it', () => {
  const entry = {
    section: 'typography',
    index: 0,
    row: ['highlight-small', '12px', '700', '1.3'],
    name: 'highlight-small',
    readings: { kerning: '0.02em', underline: true },
  };
  assert.deepEqual(readChange('clear the underline', entry).readings, { kerning: '0.02em' });
  assert.deepEqual(readChange('no longer underlined', entry).readings, { kerning: '0.02em' });
  assert.deepEqual(readChange('remove its kerning', entry).readings, { underline: true });
});

test('one sentence can change one reading and clear another', () => {
  const entry = {
    section: 'typography',
    index: 0,
    row: ['highlight-small', '12px', '700', '1.3'],
    name: 'highlight-small',
    readings: { kerning: '0.02em', underline: true },
  };
  const changed = readChange('kerning becomes 0.04em and clear the underline', entry);
  assert.deepEqual(changed.readings, { kerning: '0.04em' });
});

test('clearing a reading the token does not hold changes nothing', () => {
  const entry = {
    section: 'typography',
    index: 0,
    row: ['highlight-small', '12px', '700', '1.3'],
    name: 'highlight-small',
    readings: {},
  };
  const changed = readChange('clear the underline', entry);
  assert.equal(changed.readings, null);
  assert.equal(changed.changed, false);
});

test('a colour or a number never grows a readings change', () => {
  const entry = {
    section: 'colours',
    index: 0,
    row: ['color-primary', '#2563EB'],
    name: 'color-primary',
  };
  const changed = readChange('becomes #1D4ED8 and clear the underline', entry);
  assert.equal(changed.readings, null);
  assert.equal(changed.changedValue, true);
});

test('update token writes a changed reading, and says what changed', async () => {
  await withReadings(async (dir) => {
    const result = await run(
      'update "highlight-small kerning becomes 0.04em"',
      dir,
      { ask: async () => 'y', confirm: async () => true },
    );
    assert.equal(result.code, 0);
    assert.match(result.out, /also {3}kerning {2}0\.02em → 0\.04em/);
    assert.deepEqual(readingsIn(dir)['highlight-small'], { kerning: '0.04em', underline: true });
  });
});

test('update token clears a reading, and says it went to nothing', async () => {
  await withReadings(async (dir) => {
    const result = await run('update "highlight-small clear the underline"', dir, {
      ask: async () => 'y',
      confirm: async () => true,
    });
    assert.equal(result.code, 0);
    assert.match(result.out, /also {3}underline {2}yes → \(cleared\)/);
    assert.deepEqual(readingsIn(dir)['highlight-small'], { kerning: '0.02em' });
  });
});

test('clearing the last reading removes the block entirely', async () => {
  await withReadings(
    async (dir) => {
      const result = await run('update "highlight-small clear the underline"', dir, {
        ask: async () => 'y',
        confirm: async () => true,
      });
      assert.equal(result.code, 0);
      const text = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
      assert.equal(text.includes('#### highlight-small'), false);
      assert.deepEqual(readingsIn(dir)['highlight-small'], {});
    },
    'underline: true',
  );
});

test('update token adds a block to a token that had none', async () => {
  await withProject(async (dir) => {
    const result = await run('update "highlight-small kerning becomes 0.04em"', dir, {
      ask: async () => 'y',
      confirm: async () => true,
    });
    assert.equal(result.code, 0);
    assert.deepEqual(readingsIn(dir)['highlight-small'], { kerning: '0.04em' });
  });
});

test('a reading change is not written until the gate is passed', async () => {
  await withReadings(async (dir) => {
    const before = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    const result = await run('update "highlight-small kerning becomes 0.04em"', dir, {
      ask: async () => 'y',
      confirm: async () => false,
    });
    assert.equal(result.code, 0);
    assert.match(result.out, /Not accepted, so nothing was written/);
    assert.equal(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'), before);
  });
});

test('a rename carries the block heading with it, in the same write', async () => {
  await withReadings(async (dir) => {
    const result = await run('update "highlight-small rename to caption-tight"', dir, {
      ask: async () => 'y',
      confirm: async () => true,
    });
    assert.equal(result.code, 0);
    const text = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(text.includes('#### caption-tight'));
    assert.equal(text.includes('#### highlight-small'), false);
    // The readings arrive under the new name, and none of them is reported as
    // belonging to a token the table does not hold.
    assert.deepEqual(readingsIn(dir)['caption-tight'], { kerning: '0.02em', underline: true });
  });
});

test('the rename ripple is unaffected by the readings', async () => {
  await withReadings(async (dir) => {
    const plain = await run('update "highlight-small rename to caption-tight"', dir, {
      ask: async () => 'y',
      confirm: async () => true,
    });
    assert.match(plain.out, /name {3}highlight-small → caption-tight/);
  });
  await withProject(async (dir) => {
    const noReadings = await run('update "highlight-small rename to caption-tight"', dir, {
      ask: async () => 'y',
      confirm: async () => true,
    });
    assert.match(noReadings.out, /name {3}highlight-small → caption-tight/);
  });
});

test('a token entry carries its readings, so the change reader can compare against them', async () => {
  await withReadings(async (dir) => {
    const model = parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
    const [entry] = tokensOfType(model, { section: 'typography', role: null });
    assert.deepEqual(entry.readings, { kerning: '0.02em', underline: true });
  });
});

test('the clear phrases come from the table, longest first', () => {
  const phrases = clearPhrases();
  assert.ok(phrases.includes('clear'));
  assert.ok(phrases.includes('no longer'));
  for (let index = 1; index < phrases.length; index += 1) {
    assert.ok(
      phrases[index - 1].length >= phrases[index].length,
      `${phrases[index - 1]} should not be shorter than ${phrases[index]}`,
    );
  }
});

test('readingChanges with no clear vocabulary clears nothing', () => {
  const changed = readingChanges('clear the underline', []);
  assert.deepEqual(changed.cleared, []);
  assert.deepEqual(changed.set, { underline: true });
});

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

test('readingLines prints in the contract row order and says nothing for none', () => {
  assert.deepEqual(readingLines({}), []);
  assert.deepEqual(readingLines({ underline: true, kerning: '1px' }), [
    'kerning: 1px',
    'underline',
  ]);
});
