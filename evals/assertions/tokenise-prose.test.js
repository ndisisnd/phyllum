/**
 * Assertions for the prose reader and the follow-up loop (v0.2.0 plan §6, §7).
 *
 * The rework's whole claim is that a sentence is enough. Three promises make
 * that true, and this file is where each one is held to account:
 *
 *   1. **Never invent a value.** A sentence with no value gets a question, and
 *      the token is written only once the answer completes it. Never an error,
 *      never a dead end, never a guessed value.
 *   2. **The user's name wins.** A name in the sentence is used verbatim; a name
 *      Phyllum suggests comes off the documented scales and is confirmed first.
 *   3. **A number's meaning is asked for, not assumed.** A length with no role
 *      word in the sentence opens a question, because a 12px radius and a 12px
 *      padding are different facts that share a number.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse } from '../../lib/design-system.js';
import { runTokenise, resolveRole, resolveCandidate } from '../../lib/tokenise-command.js';
import {
  IMPLIED_LINE_HEIGHT,
  IMPLIED_WEIGHT,
  existingTokenFor,
  ladderPlacement,
  nameInProse,
  parseProse,
  roleInProse,
  suggestName,
} from '../../lib/tokenise-prose.js';
import { FIXTURES, copyDir, readFixture, withTempDir } from './helpers.js';

const MIXED = path.join(FIXTURES, 'codebases', 'tokenise-mixed');
const EMPTY_FIXTURE = path.join(FIXTURES, 'design-system', 'empty.md');
const read = (dir) => fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
const args = (prose) => [{ value: prose, quoted: true }];
const emptyModel = () => parse(readFixture(EMPTY_FIXTURE));

async function withProject(body, fixture = EMPTY_FIXTURE) {
  return withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(fixture));
    return body(dir);
  });
}

// ---------------------------------------------------------------------------
// Reading the sentence
// ---------------------------------------------------------------------------

test('a colour in the sentence is read as a colour, in any of its spellings', () => {
  for (const value of ['#2563EB', '#fff', 'rgb(37, 99, 235)', 'hsl(217, 91%, 60%)']) {
    const parsed = parseProse(`our brand colour ${value}`);
    assert.equal(parsed.candidates.length, 1, `${value} was not read`);
    assert.equal(parsed.candidates[0].pass, 'colours');
    assert.equal(parsed.candidates[0].value, value, 'and recorded exactly as written');
  }
});

test('a length is a number, and the sentence says which kind of number', () => {
  assert.equal(parseProse('12px corner radius').candidates[0].role, 'radius');
  assert.equal(parseProse('16px padding').candidates[0].role, 'spacing');
  assert.equal(parseProse('2px border').candidates[0].role, 'border');
  assert.equal(roleInProse('12px gap between cards'), 'spacing');
  assert.equal(roleInProse('12px'), null, 'a bare length states no role');
});

test('a length with no stated role is marked as assumed, not as stated', () => {
  const parsed = parseProse('8px');
  assert.equal(parsed.candidates[0].role, 'spacing', 'the commonest reading is the default');
  assert.equal(parsed.candidates[0].roleFromProse, false, 'and it is flagged as an assumption');
});

test('a typography word pulls a length out of the numbers pass', () => {
  const parsed = parseProse('heading 24px bold 1.2');
  assert.equal(parsed.candidates[0].pass, 'typography');
  assert.equal(parsed.candidates[0].size, '24px');
  assert.equal(parsed.candidates[0].weight, '700', 'the weight word is the weight');
  assert.equal(parsed.candidates[0].lineHeight, '1.2');
});

test('a typography reading records the CSS defaults rather than inventing values', () => {
  const parsed = parseProse('body text 16px');
  const [candidate] = parsed.candidates;
  assert.equal(candidate.pass, 'typography');
  assert.equal(candidate.weight, IMPLIED_WEIGHT);
  assert.equal(candidate.lineHeight, IMPLIED_LINE_HEIGHT);
  assert.deepEqual(candidate.implied, ['font-weight 400', 'line-height normal']);
});

test('the name in the sentence is found however it is introduced', () => {
  assert.equal(nameInProse('16px spacing called space-md'), 'space-md');
  assert.equal(nameInProse('16px spacing named space-md'), 'space-md');
  assert.equal(nameInProse('our `brand-blue` #2563EB'), 'brand-blue');
  assert.equal(nameInProse('brand-blue #2563EB'), 'brand-blue');
  assert.equal(nameInProse('our brand blue #2563EB'), null, 'no name is not a wrong name');
  assert.equal(
    nameInProse('12px corner-radius'),
    null,
    'a property the tables already know is not a name',
  );
});

test('a sentence with no value at all is incomplete rather than wrong', () => {
  const parsed = parseProse('add a token for our brand blue');
  assert.equal(parsed.complete, false);
  assert.deepEqual(parsed.candidates, []);
});

// ---------------------------------------------------------------------------
// Suggesting the name
// ---------------------------------------------------------------------------

test('a colour is named from the scale, by role first and rank second', () => {
  const model = emptyModel();
  assert.equal(suggestName({ pass: 'colours', value: '#2563EB' }, model).name, 'color-primary');
  assert.equal(suggestName({ pass: 'colours', value: '#F9FAFB' }, model).name, 'color-surface');
  assert.equal(suggestName({ pass: 'colours', value: '#111827' }, model).name, 'color-text');

  // A system that already names one chromatic colour ranks the next one second.
  model.tokens.colours.push(['color-primary', '#2563EB', 'from prose']);
  assert.equal(suggestName({ pass: 'colours', value: '#16A34A' }, model).name, 'color-secondary');
});

test('the first value in a role lands on the ladder’s centre rung', () => {
  const model = emptyModel();
  assert.equal(ladderPlacement('radius', '12px', model), 'rounded-md');
  assert.equal(ladderPlacement('spacing', '16px', model), 'space-md');
  assert.equal(ladderPlacement('border', '1px', model), 'border-sm');
});

test('a value bigger than everything named takes the next rung up, and smaller the next down', () => {
  const model = emptyModel();
  model.tokens.numbers.push(['space-md', '16px', 'spacing']);
  assert.equal(ladderPlacement('spacing', '24px', model), 'space-lg');
  assert.equal(ladderPlacement('spacing', '8px', model), 'space-sm');
  assert.equal(
    ladderPlacement('radius', '4px', model),
    'rounded-md',
    'a different role has its own ladder, and its own first value',
  );
});

test('typography is named role-then-band, the plan’s own example included', () => {
  const model = emptyModel();
  const name = (size, weight) =>
    suggestName({ pass: 'typography', size, weight, lineHeight: '1.3' }, model).name;
  assert.equal(name('12px', '700'), 'highlight-small');
  assert.equal(name('16px', '400'), 'body');
  assert.equal(name('20px', '300'), 'subtle-large');
});

test('a length is only "already named" inside its own role', () => {
  const model = emptyModel();
  model.tokens.numbers.push(['rounded-md', '12px', 'corner radius']);
  assert.equal(existingTokenFor({ pass: 'numbers', value: '12px', role: 'radius' }, model).name, 'rounded-md');
  assert.equal(existingTokenFor({ pass: 'numbers', value: '12px', role: 'spacing' }, model), null);
});

test('a length already named in another unit is still already named', () => {
  const model = emptyModel();
  model.tokens.numbers.push(['space-md', '16px', 'spacing']);
  assert.equal(existingTokenFor({ pass: 'numbers', value: '1rem', role: 'spacing' }, model).name, 'space-md');
});

// ---------------------------------------------------------------------------
// The follow-up loop — no dead ends
// ---------------------------------------------------------------------------

test('a sentence with no value asks for it, then writes the completed token', async () => {
  await withProject(async (dir) => {
    const asked = [];
    const { out, code } = await runTokenise(args('add a token for our brand blue'), {
      cwd: dir,
      env: {},
      ask: async (question) => {
        asked.push(question);
        return asked.length === 1 ? '#2563EB' : 'y';
      },
      confirm: async () => true,
    });

    assert.equal(code, 0);
    assert.match(asked[0], /Give me the value/, 'the missing value is what it asks for');
    assert.ok(out.includes('#2563EB'));
    assert.ok(parse(read(dir)).tokens.colours.some((row) => row[1] === '#2563EB'));
  });
});

test('the follow-up keeps the name the sentence gave, and asks only for the value', async () => {
  await withProject(async (dir) => {
    const asked = [];
    await runTokenise(args('add a token called brand-blue'), {
      cwd: dir,
      env: {},
      ask: async (question) => {
        asked.push(question);
        return '#2563EB';
      },
      confirm: async () => true,
    });

    assert.match(asked[0], /`brand-blue`/, 'the question knows what it is asking about');
    assert.equal(asked.length, 1, 'and a name the user typed is not confirmed back to them');
    assert.ok(parse(read(dir)).tokens.colours.some((row) => row[0] === 'brand-blue'));
  });
});

test('an unanswerable follow-up stops cleanly instead of looping or erroring', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    const { out, code } = await runTokenise(args('add a token for our brand blue'), {
      cwd: dir,
      env: {},
      ask: async () => 'still no value here',
      confirm: async () => {
        throw new Error('tokenise tried to write a token with no value');
      },
    });

    assert.equal(code, 0, 'an incomplete sentence is never an error exit');
    assert.ok(out.includes('does not say what its value is'));
    assert.ok(out.includes('Nothing has been written'));
    assert.equal(read(dir), before);
  });
});

test('skipping the follow-up writes nothing and says nothing was written', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    const { out, code } = await runTokenise(args('add a token for our brand blue'), {
      cwd: dir,
      env: {},
      ask: async () => 'skip',
      confirm: async () => {
        throw new Error('tokenise asked to write after a skip');
      },
    });
    assert.equal(code, 0);
    assert.ok(out.includes('Nothing has been written'));
    assert.equal(read(dir), before);
  });
});

test('with no terminal, a valueless sentence explains itself and writes nothing', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    const { out } = await runTokenise(args('add a token for our brand blue'), { cwd: dir, env: {} });
    assert.ok(out.includes('does not say what its value is'));
    assert.ok(out.includes('phyllum tokenise "our brand blue #2563EB"'), 'it shows the shape that works');
    assert.equal(read(dir), before);
  });
});

test('a length with no stated role is asked about, and the answer names it', async () => {
  await withProject(async (dir) => {
    const asked = [];
    await runTokenise(args('12px'), {
      cwd: dir,
      env: {},
      ask: async (question) => {
        asked.push(question);
        return asked.length === 1 ? 'corner radius' : 'y';
      },
      confirm: async () => true,
    });

    assert.match(asked[0], /What does 12px apply to\?/);
    const model = parse(read(dir));
    assert.ok(
      model.tokens.numbers.some((row) => row[0] === 'rounded-md' && row[2] === 'corner radius'),
      'the answer decided both the section row and the name',
    );
  });
});

test('with no terminal, an assumed role is stated rather than hidden', async () => {
  await withProject(async (dir) => {
    const { out } = await runTokenise(args('12px'), { cwd: dir, env: {} });
    assert.ok(out.includes('does not say what 12px applies to'));
    assert.ok(out.includes('reading it as spacing'));
  });
});

test('the role answer is read the way the question offers it', () => {
  assert.equal(resolveRole('corner radius'), 'radius');
  assert.equal(resolveRole('radius'), 'radius');
  assert.equal(resolveRole('2'), 'radius', 'the numbered picker');
  assert.equal(resolveRole('border width'), 'border');
  assert.equal(resolveRole(''), 'spacing', 'an empty answer takes the offered default');
});

test('a sentence naming two values records one and says so', async () => {
  await withProject(async (dir) => {
    const asked = [];
    const { out } = await runTokenise(args('card 4px corner and #F9FAFB surface'), {
      cwd: dir,
      env: {},
      ask: async (question) => {
        asked.push(question);
        return asked.length === 1 ? '2' : 'y';
      },
      confirm: async () => true,
    });

    assert.match(asked[0], /names 2 values/, 'it asks which one rather than guessing');
    assert.ok(out.includes('needs its own run'), 'and says what was left behind');
    const model = parse(read(dir));
    assert.equal(model.tokens.numbers.length, 1, 'exactly one token was written');
    assert.deepEqual(model.tokens.colours, []);
  });
});

test('resolveCandidate reads a number, a value, or falls back to the first', () => {
  const candidates = [
    { pass: 'colours', value: '#F9FAFB' },
    { pass: 'numbers', value: '4px' },
  ];
  assert.equal(resolveCandidate('2', candidates), candidates[1]);
  assert.equal(resolveCandidate('4px', candidates), candidates[1]);
  assert.equal(resolveCandidate('', candidates), candidates[0]);
  assert.equal(resolveCandidate('nothing like this', candidates), candidates[0]);
});

test('the notes cell records the sentence, and cannot break the table it lands in', async () => {
  await withProject(async (dir) => {
    await runTokenise(args('our brand | blue #2563EB'), {
      cwd: dir,
      env: {},
      ask: async () => 'y',
      confirm: async () => true,
    });
    const row = parse(read(dir)).tokens.colours.find((item) => item[1] === '#2563EB');
    assert.ok(row, 'the row parsed back, so the pipe did not split the table');
    assert.ok(row[2].includes('from prose'));
    assert.ok(!row[2].includes('|'));
  });
});
