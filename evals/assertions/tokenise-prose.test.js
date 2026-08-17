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
import { slotWords } from '../../lib/nomenclature.js';
import { readState } from '../../lib/state.js';
import { askable, deriveRamp, primitiveOffers } from '../../lib/primitives.js';
import {
  readSpecText,
  comparedAs,
  gradientFunctions,
  gradientMark,
  nameSourceApplies,
  nameSourceFallback,
  roleSignalFor,
  roleSignalWords,
  shapesFor,
  valueComparisons,
} from '../../lib/tokenise-spec.js';
import {
  alphaOf,
  colourShape,
  comparisonValue,
  isGradientValue,
  nameGradient,
  normaliseValue,
  toHsl,
  withGradientMark,
} from '../../lib/tokenise.js';
import { runTokenise, resolveRole, unfinishedQueue } from '../../lib/tokenise-command.js';
import {
  IMPLIED_LINE_HEIGHT,
  IMPLIED_WEIGHT,
  collapseDuplicates,
  existingTokenFor,
  ladderPlacement,
  nameInProse,
  namesInProse,
  nomenclatureName,
  parseProse,
  roleInProse,
  signalsInProse,
  splitSegments,
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
    assert.match(asked[0], /Write the value as/, 'the missing value is what it asks for');
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

// ---------------------------------------------------------------------------
// The batch intake — several values, one sentence (v0.3.0 plan §3)
// ---------------------------------------------------------------------------

test('N values in the sentence are N entries in the queue, in the order it says them', () => {
  const parsed = parseProse('#2563EB #10B981 #F59E0B');
  assert.equal(parsed.candidates.length, 3);
  assert.deepEqual(
    parsed.candidates.map((candidate) => candidate.value),
    ['#2563EB', '#10B981', '#F59E0B'],
    'sentence order is queue order',
  );
  assert.ok(parsed.candidates.every((candidate) => candidate.pass === 'colours'));
});

test('order is preserved across passes, not colours-then-the-rest', () => {
  const parsed = parseProse('card 4px corner and #F9FAFB surface');
  assert.deepEqual(
    parsed.candidates.map((candidate) => [candidate.pass, candidate.value]),
    [
      ['numbers', '4px'],
      ['colours', '#F9FAFB'],
    ],
    'the length was said first, so it is asked about first',
  );
});

test('one sentence can carry several complete typography readings', () => {
  const parsed = parseProse('heading 24px bold 1.2, body 16px regular 1.5');
  assert.equal(parsed.candidates.length, 2);
  const [heading, body] = parsed.candidates;
  assert.deepEqual(
    [heading.size, heading.weight, heading.lineHeight],
    ['24px', '700', '1.2'],
  );
  assert.deepEqual([body.size, body.weight, body.lineHeight], ['16px', '400', '1.5']);
  assert.deepEqual(heading.implied, [], 'a reading stated in full implies nothing');
});

test('the CSS defaults fill each reading’s own gaps, visibly and separately', () => {
  const parsed = parseProse('heading 24px bold; caption 11px');
  const [heading, caption] = parsed.candidates;
  assert.deepEqual(heading.implied, ['line-height normal'], 'the heading only lacks a line-height');
  assert.equal(caption.weight, IMPLIED_WEIGHT);
  assert.equal(caption.lineHeight, IMPLIED_LINE_HEIGHT);
  assert.deepEqual(caption.implied, ['font-weight 400', 'line-height normal']);
});

test('a reading starts at a role word or an explicit separator, and nowhere else', () => {
  const cuts = (prose) => splitSegments(prose).map((segment) => prose.slice(segment.start, segment.end).trim());
  assert.deepEqual(cuts('heading 24px body 16px'), ['heading 24px', 'body 16px'], 'a role word cuts');
  assert.deepEqual(cuts('24px, 16px'), ['24px,', '16px'], 'a comma cuts');
  assert.deepEqual(cuts('24px; 16px'), ['24px;', '16px'], 'a semicolon cuts');
  assert.deepEqual(cuts('24px and 16px'), ['24px and', '16px'], '"and" cuts');
  assert.deepEqual(cuts('16px/1.5'), ['16px/1.5'], 'and a slash never does — it is one reading');
});

test('a stranded weight word binds to the reading on its left', () => {
  const [reading] = parseProse('heading 24px, semibold').candidates;
  assert.equal(reading.weight, '600', 'the semibold heading, not a semibold nothing');
  assert.deepEqual(reading.implied, ['line-height normal'], 'and the weight is no longer implied');
});

test('a fragment with no reading on its left binds right instead', () => {
  const [reading] = parseProse('bold heading 24px').candidates;
  assert.equal(reading.weight, '700');
});

test('a fragment never overwrites a slot the reading already states', () => {
  const [heading] = parseProse('heading 24px bold, semibold').candidates;
  assert.equal(heading.weight, '700', 'the first statement of a slot stands');
});

test('a name binds to the value nearest it, so two names name two values', () => {
  const parsed = parseProse('#2563EB called brand-blue and #10B981 called success-green');
  assert.deepEqual(
    parsed.candidates.map((candidate) => [candidate.value, candidate.name]),
    [
      ['#2563EB', 'brand-blue'],
      ['#10B981', 'success-green'],
    ],
  );
  assert.ok(parsed.candidates.every((candidate) => candidate.nameFromProse));
});

test('a name written ahead of every value binds to the first one on its right', () => {
  const [colour] = parseProse('brand-blue #2563EB').candidates;
  assert.equal(colour.name, 'brand-blue');
});

test('three values and one name leaves the other two to the naming scales', () => {
  const parsed = parseProse('#2563EB #10B981 called success-green #F59E0B');
  assert.deepEqual(
    parsed.candidates.map((candidate) => candidate.name),
    [null, 'success-green', null],
  );
});

test('namesInProse finds every name, in the order the sentence carries them', () => {
  assert.deepEqual(
    namesInProse('#2563EB called brand-blue and #10B981 called success-green').map((item) => item.name),
    ['brand-blue', 'success-green'],
  );
  assert.deepEqual(namesInProse('our brand blue #2563EB'), [], 'no name is not a wrong name');
});

test('duplicates inside one sentence collapse to one proposal', () => {
  const parsed = parseProse('#2563EB and #2563eb again');
  assert.equal(parsed.candidates.length, 1, 'the same colour, spelled two ways, is one value');
  assert.equal(parsed.candidates[0].value, '#2563EB', 'and the first mention keeps its place');
});

test('a duplicate’s name fills a survivor that has none', () => {
  const parsed = parseProse('#2563EB and #2563EB called brand-blue');
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].name, 'brand-blue', 'the user did say it');
});

test('a length is only a duplicate of a length in the same role', () => {
  const candidates = [
    { pass: 'numbers', value: '12px', role: 'radius' },
    { pass: 'numbers', value: '12px', role: 'spacing' },
    { pass: 'numbers', value: '12px', role: 'radius' },
  ];
  assert.equal(collapseDuplicates(candidates).length, 2, 'same number, different facts');
});

// ---------------------------------------------------------------------------
// Cross-format convergence — one colour is one colour, however it is written
// (v0.4.0 plan §3.1)
// ---------------------------------------------------------------------------

test('the comparison table is the contract, and the code reads it', () => {
  const table = valueComparisons();
  assert.deepEqual(Object.keys(table).sort(), ['hex', 'hsl', 'other', 'rgb']);
  for (const shape of ['hex', 'rgb', 'hsl']) {
    assert.equal(table[shape], 'channels', `${shape} compares by channels`);
    assert.equal(comparedAs(shape), 'channels');
  }
  assert.equal(comparedAs('other'), 'string');
  assert.equal(comparedAs('gradient'), 'string', 'a shape the table does not list is not folded');

  assert.equal(colourShape('#2563EB'), 'hex');
  assert.equal(colourShape('rgba(37, 99, 235, 1)'), 'rgb');
  assert.equal(colourShape('hsl(217, 91%, 60%)'), 'hsl');
  assert.equal(colourShape('12px'), 'other');
  assert.ok(
    readSpecText().includes('<!-- phyllum:value-comparison -->'),
    'the table is marked for the parser',
  );
});

test('every colour shape compares as one canonical channel form', () => {
  const blue = comparisonValue('#2563EB');
  assert.equal(blue, 'rgba(37,99,235,1)', 'the canonical form is the rgba channel tuple');
  for (const spelling of ['#2563eb', '#2563EBFF', 'rgb(37, 99, 235)', 'rgba(37,99,235,1)']) {
    assert.equal(comparisonValue(spelling), blue, `${spelling} is the same colour`);
  }
  assert.equal(comparisonValue('#ABC'), comparisonValue('rgb(170, 187, 204)'));
  assert.equal(
    comparisonValue('hsl(221.2, 83.2%, 53.3%)'),
    comparisonValue('rgb(37, 99, 235)'),
    'hsl converts to integer channels and compares there — no tolerance is applied',
  );
  assert.equal(comparisonValue('12px'), '12px', 'a value that is not a colour keeps the string form');
});

test('alpha is read, and two alphas are two facts', () => {
  assert.equal(alphaOf('#2563EB'), 1, 'no alpha written is fully opaque');
  assert.equal(alphaOf('#2563EBFF'), 1);
  assert.equal(alphaOf('rgba(0, 0, 0, 0.5)'), 0.5);
  assert.equal(alphaOf('hsla(217, 91%, 53%, 0.25)'), 0.25);
  assert.notEqual(
    comparisonValue('rgba(0, 0, 0, 0.5)'),
    comparisonValue('rgba(0, 0, 0, 0.9)'),
    'a half-opaque black and a nearly-opaque one are different tokens',
  );
  assert.notEqual(comparisonValue('#2563EB80'), comparisonValue('#2563EB'));
});

test('one colour written two ways is one queue entry', () => {
  const parsed = parseProse('our overlay #2563EB and rgba(37, 99, 235, 1) again');
  assert.equal(parsed.candidates.length, 1, 'the same colour in two formats is one value');
  assert.equal(parsed.candidates[0].value, '#2563EB', 'and the first mention keeps its place');

  const other = parseProse('our overlay rgb(37, 99, 235) and #2563EB again');
  assert.equal(other.candidates.length, 1, 'convergence has no preferred direction');
  assert.equal(other.candidates[0].value, 'rgb(37, 99, 235)');
});

test('alpha variants in one sentence do not collapse', () => {
  const parsed = parseProse('rgba(0, 0, 0, 0.5) and rgba(0, 0, 0, 0.9)');
  assert.equal(parsed.candidates.length, 2, 'differing alphas are differing facts');
});

test('a colour already named in another format trips the already-named check', () => {
  const model = emptyModel();
  model.tokens.colours.push(['color-primary', '#2563EB']);
  for (const spelling of ['rgba(37, 99, 235, 1)', 'rgb(37, 99, 235)', 'hsl(221.2, 83.2%, 53.3%)']) {
    assert.equal(
      existingTokenFor({ pass: 'colours', value: spelling }, model).name,
      'color-primary',
      `${spelling} is the colour the system already names`,
    );
  }
  assert.equal(
    existingTokenFor({ pass: 'colours', value: 'rgba(37, 99, 235, 0.5)' }, model),
    null,
    'a different alpha is a different colour, and still nameable',
  );

  // And the other direction: the recorded value is the rgba one.
  const inverted = emptyModel();
  inverted.tokens.colours.push(['color-primary', 'rgba(37, 99, 235, 1)']);
  assert.equal(existingTokenFor({ pass: 'colours', value: '#2563EB' }, inverted).name, 'color-primary');
});

test('a colour already named in another format is refused a second row', async () => {
  await withProject(async (dir) => {
    await runTokenise(args('our brand blue #2563EB'), {
      cwd: dir,
      env: {},
      ask: async () => 'y',
      confirm: async () => true,
    });
    const { out } = await runTokenise(args('our overlay rgba(37, 99, 235, 1)'), {
      cwd: dir,
      env: {},
      ask: async () => 'y',
      confirm: async () => true,
    });
    assert.match(out, /is already `color-primary`/, 'the same colour, said another way');
    assert.equal(parse(read(dir)).tokens.colours.length, 1, 'and no second row was written');
  });
});

test('the recorded value is byte-identical to what was typed, in every format', async () => {
  const written = [
    '#2563EB',
    '#2563ebff',
    'rgb(37, 99, 235)',
    'rgba(0, 0, 0, 0.5)',
    'hsl(221.2, 83.2%, 53.3%)',
    'hsla(221.2, 83.2%, 53.3%, 0.25)',
  ];
  for (const value of written) {
    await withProject(async (dir) => {
      await runTokenise(args(`our colour ${value}`), {
        cwd: dir,
        env: {},
        ask: async () => 'y',
        confirm: async () => true,
      });
      const colours = parse(read(dir)).tokens.colours;
      assert.equal(colours.length, 1, `${value} was written`);
      assert.equal(colours[0][1], value, 'exactly as typed — Phyllum never converts a value');
    });
  }
});

test('the queue runs one question at a time, and each entry writes its own token', async () => {
  await withProject(async (dir) => {
    const asked = [];
    const { out } = await runTokenise(args('#2563EB #10B981 #F59E0B'), {
      cwd: dir,
      env: {},
      ask: async (question) => {
        asked.push(question);
        return 'y';
      },
      confirm: async () => true,
    });

    assert.equal(asked.length, 3, 'one question per value, never a wall of them');
    for (const question of asked) assert.match(question, /^\(\d of 3\) Name /);
    assert.ok(out.includes('Read 3 values'), 'and the queue is stated before it is walked');

    const colours = parse(read(dir)).tokens.colours;
    assert.deepEqual(colours.map((row) => row[1]), ['#2563EB', '#10B981', '#F59E0B']);
    assert.deepEqual(
      colours.map((row) => row[0]),
      ['color-primary', 'color-secondary', 'color-accent'],
      'the ranked scale counts the acceptances this run made',
    );
  });
});

test('skipping one entry writes nothing for it and the queue carries on', async () => {
  await withProject(async (dir) => {
    let asked = 0;
    await runTokenise(args('#2563EB #10B981 #F59E0B'), {
      cwd: dir,
      env: {},
      ask: async () => {
        asked += 1;
        return asked === 2 ? 'skip' : 'y';
      },
      confirm: async () => true,
    });

    assert.equal(asked, 3, 'the skip ended one entry, not the run');
    assert.deepEqual(
      parse(read(dir)).tokens.colours.map((row) => row[1]),
      ['#2563EB', '#F59E0B'],
      'the skipped value left no row behind',
    );
  });
});

test('a value named earlier in the same run is not named twice', async () => {
  await withProject(async (dir) => {
    const { out } = await runTokenise(args('#2563EB and 12px radius and #2563EB'), {
      cwd: dir,
      env: {},
      ask: async () => 'y',
      confirm: async () => true,
    });
    assert.equal(parse(read(dir)).tokens.colours.length, 1);
    assert.ok(!out.includes('is already `color-primary`'), 'it collapsed rather than being refused');
  });
});

test('the whole queue is kept in the session file, settled entries and pending ones alike', async () => {
  await withProject(async (dir) => {
    let asked = 0;
    await runTokenise(args('#2563EB #10B981'), {
      cwd: dir,
      env: {},
      ask: async () => {
        asked += 1;
        return asked === 1 ? 'y' : 'skip';
      },
      confirm: async () => true,
    });

    const { queue } = readState(dir).tokenise;
    assert.deepEqual(
      queue.map((entry) => [entry.value, entry.status]),
      [
        ['#2563EB', 'written'],
        ['#10B981', 'skipped'],
      ],
    );
  });
});

test('a queue cut short is offered back, and picks up where it stood', async () => {
  await withProject(async (dir) => {
    // No `confirm`, so the run stops at the acceptance gate of the first entry.
    await runTokenise(args('#2563EB #10B981'), { cwd: dir, env: {}, ask: async () => 'y' });
    const unfinished = unfinishedQueue(dir);
    assert.equal(unfinished.pending.length, 2, 'nothing was settled, so nothing was dropped');

    const asked = [];
    const { out } = await runTokenise([], {
      cwd: dir,
      env: {},
      ask: async (question) => {
        asked.push(question);
        return 'y';
      },
      confirm: async () => true,
    });

    assert.match(asked[0], /Pick the queue up where it stood\?/);
    assert.ok(out.includes('Resuming'));
    assert.deepEqual(
      parse(read(dir)).tokens.colours.map((row) => row[1]),
      ['#2563EB', '#10B981'],
    );
    assert.equal(unfinishedQueue(dir), null, 'and a finished queue is not offered again');
  });
});

test('one backup for the run, not one per accepted token', async () => {
  await withProject(async (dir) => {
    const before = read(dir);
    await runTokenise(args('#2563EB #10B981 #F59E0B'), {
      cwd: dir,
      env: {},
      ask: async () => 'y',
      confirm: async () => true,
    });
    assert.equal(
      fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md.bak'), 'utf8'),
      before,
      'the undo is the file as it stood before the sentence, not before its last value',
    );
  });
});

// ---------------------------------------------------------------------------
// Naming suggestions from the nomenclature library (v0.3.0 plan §4.2, §4.3)
// ---------------------------------------------------------------------------

test('a sentence that signals a role is named by the library, not by the scale', () => {
  const model = emptyModel();
  const suggestion = suggestName(parseProse('our main interactive blue #2563EB').candidates[0], model);
  assert.equal(suggestion.name, 'interaction-primary');
  assert.equal(suggestion.source, 'nomenclature');
});

test('a sentence that signals nothing the library knows falls back to the scale', () => {
  const model = emptyModel();
  const suggestion = suggestName(parseProse('our brand blue #2563EB').candidates[0], model);
  assert.equal(suggestion.name, 'color-primary');
  assert.equal(suggestion.source, 'scale');
});

test('a family with no rank is ranked by what that family already names', () => {
  const model = emptyModel();
  assert.equal(nomenclatureName('our danger red', model), 'danger-primary');
  model.tokens.colours.push(['danger-primary', '#DC2626']);
  assert.equal(nomenclatureName('our danger red', model), 'danger-secondary');
  model.tokens.colours.push(['danger-secondary', '#EF4444'], ['danger-tertiary', '#F87171']);
  assert.equal(nomenclatureName('our danger red', model), null, 'and a fourth rank is never invented');
});

test('a rank without a family names nothing — family is the anchor', () => {
  assert.equal(nomenclatureName('our main blue', emptyModel()), null);
});

test('exception and state words are added when the sentence says them, never otherwise', () => {
  const model = emptyModel();
  assert.equal(nomenclatureName('the interactive primary on hover', model), 'interaction-primary-hover');
  assert.equal(nomenclatureName('the interactive primary', model), 'interaction-primary');
  assert.deepEqual(signalsInProse('our main interactive blue'), {
    rank: 'primary',
    family: 'interaction',
  });
});

test('every spelling in the signal table resolves to a word the library ships', () => {
  for (const word of roleSignalWords()) {
    const signal = roleSignalFor(word);
    assert.ok(
      slotWords(signal.slot).includes(signal.word),
      `${word} proposes \`${signal.word}\`, which is not a ${signal.slot} the library knows`,
    );
  }
});

test('the library is consulted for colours only, per the name-source table', () => {
  assert.ok(nameSourceApplies('nomenclature', 'colours'));
  assert.ok(!nameSourceApplies('nomenclature', 'numbers'));
  assert.ok(!nameSourceApplies('nomenclature', 'typography'));
  assert.equal(nameSourceFallback('nomenclature'), 'scale', 'the old scale is the fallback, not the default');
});

test('a pipe in the sentence never reaches the table, and no provenance cell is written', async () => {
  await withProject(async (dir) => {
    await runTokenise(args('our brand | blue #2563EB'), {
      cwd: dir,
      env: {},
      ask: async () => 'y',
      confirm: async () => true,
    });
    const row = parse(read(dir)).tokens.colours.find((item) => item[1] === '#2563EB');
    assert.ok(row, 'the row parsed back, so the pipe did not split the table');
    assert.equal(row.length, 2, 'Colours is token | value (v0.3.0 §5.5) — the sentence is not recorded');
    assert.ok(!row.join(' ').includes('|'), 'nothing from the sentence carries a pipe into the file');
    assert.ok(
      !read(dir).includes('| token | value | notes |'),
      'the Colours table has no notes column to record it in',
    );
  });
});

// ---------------------------------------------------------------------------
// Gradients — one new value shape in the colours pass (v0.4.0 plan §5)
// ---------------------------------------------------------------------------

const GRADIENTS = [
  'linear-gradient(135deg, #2563EB, #10B981)',
  'radial-gradient(circle at 50% 50%, #2563EB 0%, #10B981 100%)',
  'conic-gradient(from 90deg, #2563EB, #10B981)',
  'repeating-linear-gradient(45deg, #2563EB 0 10px, #10B981 10px 20px)',
  'repeating-radial-gradient(circle, #2563EB 0 10px, #10B981 10px 20px)',
  'repeating-conic-gradient(from 0deg, #2563EB 0deg 10deg, #10B981 10deg 20deg)',
];

test('the gradient shapes are the passes table\'s, and there are six of them', () => {
  const shapes = shapesFor('colours');
  const functions = gradientFunctions();
  assert.deepEqual(
    [...functions].sort(),
    [
      'conic-gradient',
      'linear-gradient',
      'radial-gradient',
      'repeating-conic-gradient',
      'repeating-linear-gradient',
      'repeating-radial-gradient',
    ],
    'six shapes, read off the colours row rather than restated in the code',
  );
  for (const name of functions) {
    assert.ok(shapes.includes(`${name}()`), `${name} is written on the passes table`);
  }
});

test('each of the six gradient shapes reads as one colours-pass value', () => {
  for (const gradient of GRADIENTS) {
    const read = parseProse(`hero backdrop ${gradient}`);
    assert.equal(read.candidates.length, 1, `${gradient} is one value, not its stops`);
    const [candidate] = read.candidates;
    assert.equal(candidate.pass, 'colours', 'a gradient is a colours-pass value');
    assert.equal(candidate.value, gradient, 'recorded verbatim, byte for byte as typed');
    assert.ok(isGradientValue(gradient), 'and is recognised whole');
  }
});

test('the commas and brackets inside a gradient never split a batch sentence', () => {
  const gradient = 'linear-gradient(135deg, rgba(37, 99, 235, 0.8), #10B981)';
  const read = parseProse(`hero ${gradient} and our brand blue #2563EB`);
  assert.deepEqual(
    read.candidates.map((candidate) => candidate.value),
    [gradient, '#2563EB'],
    'two entries: one gradient and one colour, in sentence order',
  );

  const inside = `${gradient} `.indexOf(',');
  const segments = splitSegments(`hero ${gradient} and #2563EB`);
  for (const segment of segments) {
    assert.ok(
      segment.start <= 'hero '.length || segment.start >= 'hero '.length + gradient.length,
      'no segment starts inside the gradient',
    );
  }
  assert.ok(inside > 0, 'the gradient really does carry a comma');
});

test('the words inside a gradient are not read as names, roles or weights', () => {
  const read = parseProse('linear-gradient(to right, #2563EB, #10B981)');
  assert.equal(read.candidates.length, 1);
  assert.equal(read.name, null, '`linear-gradient` is not the name the user typed');
  assert.equal(read.candidates[0].nameFromProse, false);
  assert.equal(read.typographic, false, 'nothing inside the value moves it out of colours');

  const named = parseProse('linear-gradient(to right, #2563EB, #10B981) called hero-wash');
  assert.equal(named.candidates.length, 1);
  assert.equal(named.candidates[0].name, 'hero-wash', 'a real name still binds');
});

test('gradient-{n} ranks by count, and every proposed gradient name carries the mark', () => {
  const mark = gradientMark();
  assert.equal(mark, 'gradient', 'the mark word the table ships');
  assert.equal(nameGradient(1), 'gradient-1');
  assert.equal(nameGradient(2), 'gradient-2');

  const model = emptyModel();
  const candidate = { pass: 'colours', value: GRADIENTS[0], context: 'hero backdrop' };
  const first = suggestName(candidate, model);
  assert.equal(first.name, 'gradient-1', 'the first gradient in an empty system');

  model.tokens.colours.push([first.name, GRADIENTS[0]]);
  const second = suggestName({ ...candidate, value: GRADIENTS[1] }, model);
  assert.equal(second.name, 'gradient-2', 'ranked by how many gradients are already named');

  // The library, when the sentence signals a family — the mark rides last.
  const fromLibrary = suggestName(
    { pass: 'colours', value: GRADIENTS[0], context: 'our danger gradient' },
    emptyModel(),
  );
  assert.equal(fromLibrary.name, 'danger-primary-gradient');
  assert.equal(fromLibrary.source, 'nomenclature');

  const withState = suggestName(
    { pass: 'colours', value: GRADIENTS[0], context: 'our danger gradient on hover' },
    emptyModel(),
  );
  assert.equal(withState.name, 'danger-primary-hover-gradient', 'the mark is always the last part');

  for (const proposed of [first.name, second.name, fromLibrary.name, withState.name]) {
    assert.ok(proposed.split('-').includes(mark), `${proposed} carries the word ${mark}`);
  }
  assert.equal(withGradientMark('danger-primary-gradient'), 'danger-primary-gradient', 'never twice');
});

test('a gradient does not move a solid colour along the chromatic scale', () => {
  const model = emptyModel();
  model.tokens.colours.push(['gradient-1', GRADIENTS[0]]);
  const suggestion = suggestName({ pass: 'colours', value: '#2563EB', context: 'our brand blue' }, model);
  assert.equal(suggestion.name, 'color-primary', 'the first solid colour is still the first');
});

test('gradient duplicate detection stays string-level, never channel-level', () => {
  assert.equal(comparedAs(colourShape(GRADIENTS[0])), 'string', 'the `other` row owns a gradient');
  assert.equal(comparisonValue(GRADIENTS[0]), normaliseValue(GRADIENTS[0]));

  const spaced = 'linear-gradient(135deg,#2563EB,#10B981)';
  assert.equal(
    collapseDuplicates([
      { pass: 'colours', value: GRADIENTS[0] },
      { pass: 'colours', value: spaced.toUpperCase() },
    ]).length,
    1,
    'case-folded and whitespace-stripped is one value',
  );

  const reordered = 'linear-gradient(135deg, #10B981, #2563EB)';
  assert.equal(
    collapseDuplicates([
      { pass: 'colours', value: GRADIENTS[0] },
      { pass: 'colours', value: reordered },
    ]).length,
    2,
    'reordered stops are two facts — no equivalence beyond the string',
  );

  const model = emptyModel();
  model.tokens.colours.push(['hero-wash', GRADIENTS[0]]);
  assert.equal(existingTokenFor({ pass: 'colours', value: spaced }, model)?.name, 'hero-wash');
  assert.equal(existingTokenFor({ pass: 'colours', value: reordered }, model), null);
});

test('create primitives skips a gradient, as it skips every value toHsl cannot read', () => {
  for (const gradient of GRADIENTS) {
    assert.equal(toHsl(gradient), null, 'a gradient has no lightness to read');
    assert.equal(deriveRamp('hero-wash', gradient), null, 'so there is no ramp to derive');
  }
  const model = emptyModel();
  model.tokens.colours.push(['hero-wash', GRADIENTS[0]]);
  const offer = primitiveOffers(model).find((item) => item.base === 'hero-wash');
  assert.equal(offer.status, 'unreadable', 'reported as skipped, never asked about');
  assert.ok(!askable(primitiveOffers(model)).some((item) => item.base === 'hero-wash'));
});

test('a gradient lands in Colours as an ordinary token | value row, verbatim', async () => {
  await withProject(async (dir) => {
    await runTokenise(args(`hero backdrop ${GRADIENTS[0]}`), {
      cwd: dir,
      env: {},
      ask: async () => 'y',
      confirm: async () => true,
    });
    const model = parse(read(dir));
    const row = model.tokens.colours.find((item) => item[1] === GRADIENTS[0]);
    assert.ok(row, 'the gradient is in the Colours table, byte for byte as typed');
    assert.equal(row.length, 2, 'Colours is token | value');
    assert.ok(row[0].split('-').includes(gradientMark()), 'and its name says it is a gradient');
    assert.equal(model.tokens.primitives.length, 0, 'no ramp was derived from it');
  });
});
