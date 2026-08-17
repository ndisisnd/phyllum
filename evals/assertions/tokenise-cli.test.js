/**
 * Assertions for the `tokenise` command surface (v0.2.0 plan §6, §7).
 *
 * Three things are checked here that the reader tests cannot see: that the spec
 * tables in `skill/refs/tokenise/` really are what drives the code, that the
 * alias `tokenize` is the same subskill rather than a second one, and — the
 * v0.2.0 rework's headline promise — that `tokenise` no longer reads the
 * codebase at all. A sentence is the whole input; scanning belongs to `assess`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { execute } from '../../lib/execute.js';
import { readRef } from '../../lib/refs.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { resolveCommand } from '../../lib/registry.js';
import { slotNames, slotWords } from '../../lib/nomenclature.js';
import {
  actionForAnswer,
  bindingDirection,
  colourNames,
  hintFor,
  ladders,
  nameSources,
  passes,
  proseHints,
  proseWeights,
  argumentHint,
  colourForkOptions,
  pickerOptions,
  queueRule,
  readingSeparators,
  readingSplits,
  reloadSpec,
  valueQuestionFor,
  valueQuestions,
  roleSignalFor,
  roleSignalWords,
  roles,
  sectionFor,
  sources,
  splitterOpens,
  weightForWord,
} from '../../lib/tokenise-spec.js';
import {
  buildProse,
  missingValueQuestion,
  renderColourFork,
  renderPicker,
  resolvePick,
  valueQuestion,
} from '../../lib/tokenise-command.js';
import {
  FIXTURES,
  PACKAGE_ROOT,
  POPULATED_FIXTURE,
  copyDir,
  diffSnapshots,
  readFixture,
  snapshotContents,
  snapshotPaths,
  withTempDir,
} from './helpers.js';

const MIXED = path.join(FIXTURES, 'codebases', 'tokenise-mixed');
const EMPTY_FIXTURE = path.join(FIXTURES, 'design-system', 'empty.md');
const run = (line, cwd, extra = {}) =>
  execute(tokenizeLine(line), { cwd, env: {}, yes: true, ...extra });

const accept = { ask: async () => 'y', confirm: async () => true };

/** A project with a design system — and a codebase, which `tokenise` must ignore. */
async function withProject(body, fixture = POPULATED_FIXTURE) {
  return withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(fixture));
    return body(dir);
  });
}

// ---------------------------------------------------------------------------
// The spec file is the contract
// ---------------------------------------------------------------------------

test('the spec tables in refs/tokenise/ cover every pass', () => {
  reloadSpec();
  assert.deepEqual(
    passes().map((pass) => pass.pass),
    ['colours', 'numbers', 'typography', 'shadows', 'borders'],
  );
  assert.equal(sectionFor('colours'), 'colours');
  assert.equal(sectionFor('numbers'), 'numbers');
  assert.equal(sectionFor('typography'), 'typography');
  // The two compound passes write into Numbers rather than into a section of
  // their own: a shadow and a border width are lengths with a job, and a fourth
  // token section would change every DESIGN-SYSTEM.md for no gain.
  assert.equal(sectionFor('shadows'), 'numbers');
  assert.equal(sectionFor('borders'), 'numbers');

  assert.deepEqual(
    roles().map((role) => role.role),
    ['radius', 'spacing', 'border'],
    'the plan names spacing, corner radius and borders',
  );
  for (const role of roles()) {
    assert.ok(role.appliesTo.length > 0, `${role.role} needs an applies-to label`);
    assert.ok(ladders()[role.ladder], `${role.role} points at a ladder that exists`);
  }
});

test('every ladder names its own centre rung', () => {
  for (const [name, ladder] of Object.entries(ladders())) {
    assert.ok(ladder.rungs.length > 0, `${name} has no rungs`);
    assert.ok(
      ladder.centre >= 0 && ladder.centre < ladder.rungs.length,
      `${name}'s centre is off its ladder`,
    );
  }
});

test('the colour naming table is ordered role-first, then by rank', () => {
  const rows = colourNames();
  const firstRanked = rows.findIndex((row) => row.rank !== null);
  assert.ok(firstRanked > 0, 'the role rows come first, so a surface is never "primary"');
  const ranks = rows.slice(firstRanked).map((row) => row.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'ranks ascend');
  assert.ok(
    rows.some((row) => row.name.includes('{n}')),
    'and the tail is numbered rather than unnamed',
  );
});

test('the prose vocabulary is a table, not a list buried in the code', () => {
  const hints = proseHints();
  assert.ok(hints.size > 0);
  // Every role a number can have is reachable from a word someone would type.
  for (const role of ['radius', 'spacing', 'border']) {
    assert.ok([...hints.values()].includes(role), `no prose word means ${role}`);
  }
  assert.ok([...hints.values()].includes('typography'), 'and one moves a length into type');
  assert.ok([...hints.values()].includes('name'), 'and one introduces the user’s own name');

  assert.equal(hintFor('CORNER'), 'radius', 'matching is case-insensitive');
  assert.equal(hintFor('padding'), 'spacing');
  assert.equal(hintFor('nothing-like-this'), null);
});

test('the weight words are a table too, and cover the CSS scale', () => {
  const weights = new Set(proseWeights().values());
  for (const step of [300, 400, 700]) {
    assert.ok(weights.has(step), `no word spells weight ${step}`);
  }
  assert.equal(weightForWord('Bold'), 700);
  assert.equal(weightForWord('semibold'), 600);
  assert.equal(weightForWord('blue'), null, 'a colour word is not a weight');
});

test('the batch intake is a table, not a loop nobody can read', () => {
  // Every rule the queue follows is a row. The point is that changing one is an
  // edit to the contract rather than to a condition buried in the command.
  assert.equal(queueRule('order'), 'sentence', 'sentence order is queue order');
  assert.equal(queueRule('duplicates'), 'collapse');
  assert.equal(queueRule('questions'), 'one', 'one question at a time, never a wall');
  assert.equal(queueRule('skip'), 'entry', 'a skip costs its own entry and nothing else');
  assert.equal(queueRule('resume'), '.phyllum/session.json');
});

test('the splitting grammar is stated, including what does not split', () => {
  const splits = readingSplits();
  assert.ok(splits.some((row) => row.splitter === 'role-word' && row.writtenAs === null));
  assert.deepEqual(readingSeparators(), [',', ';', 'and'], 'the whole delimiter set, and no more');
  assert.equal(splitterOpens('slash'), false, 'a slash is one reading — `16px/1.5`');

  // A separator that is not on the table does not split, which is the half of a
  // delimiter set that is easy to leave unsaid.
  for (const character of ['.', ':', '-', '/']) {
    assert.ok(!readingSeparators().includes(character), `${character} is not a separator`);
  }
});

test('the binding table decides which way a stranded fragment reaches', () => {
  assert.equal(bindingDirection('reading'), 'left', 'a weight word belongs to the reading behind it');
  assert.equal(bindingDirection('name'), 'left');
  assert.equal(bindingDirection('stranded'), 'right', 'unless there is nothing behind it');
  assert.equal(bindingDirection('restatement'), null, 'the first statement of a slot stands');
});

test('the name-source table records that the library supersedes the old scale', () => {
  const [first, second] = nameSources();
  assert.equal(first.source, 'nomenclature', 'the library is consulted first');
  assert.equal(first.fallsBackTo, 'scale', 'and the scale is what it falls back to');
  assert.equal(second.source, 'scale');
  assert.equal(second.fallsBackTo, null, 'the fallback falls back to nothing — it always answers');
});

test('every role signal names a slot and a word the nomenclature library ships', () => {
  const words = roleSignalWords();
  assert.ok(words.length > 0);
  for (const word of words) {
    const signal = roleSignalFor(word);
    assert.ok(slotNames().includes(signal.slot), `${word} signals ${signal.slot}, which is not a slot`);
    assert.ok(
      slotWords(signal.slot).includes(signal.word),
      `${word} proposes \`${signal.word}\`, which the ${signal.slot} slot does not know`,
    );
  }
  // A signal word that is already a weight word would mean two things at once.
  for (const word of words) {
    assert.equal(weightForWord(word), null, `\`${word}\` is a weight word as well as a signal`);
  }
});

test('the review answers come from the review table', () => {
  assert.equal(actionForAnswer('yes').action, 'confirm');
  assert.equal(actionForAnswer('NO').action, 'skip');
  assert.equal(actionForAnswer('merge color-primary').target, 'color-primary');
  assert.equal(actionForAnswer('brand-blue').action, 'rename');
});

test('the scanning tables have left this reference for refs/assess/', () => {
  // M2 left the scanning contract here on purpose, so that moving a contract and
  // changing a command were two steps rather than one. M3 is the second step: the
  // tables move with the behaviour, and the `tokenise` reference keeps only what
  // a *name* is made of. Neither reference may hold both halves.
  const ref = readRef('tokenise');
  const assessRef = readRef('assess');

  for (const marker of ['phyllum:sources', 'phyllum:tailwind', 'phyllum:clustering']) {
    assert.ok(assessRef.includes(marker), `refs/assess/ should now carry ${marker}`);
    assert.ok(!ref.includes(marker), `refs/tokenise/ should no longer carry ${marker}`);
  }
  for (const marker of ['phyllum:passes', 'phyllum:roles', 'phyllum:colour-names', 'phyllum:ladders']) {
    assert.ok(ref.includes(marker), `the naming scales stay in refs/tokenise/: ${marker}`);
    assert.ok(!assessRef.includes(marker), `refs/assess/ should not restate ${marker}`);
  }

  // And the tables still drive the code from their new home.
  const { extensions, stylesheets, markup, skipped } = sources();
  assert.deepEqual(extensions, [...stylesheets, ...markup]);
  assert.ok(skipped.includes('node_modules'));

  assert.match(ref, /refs\/assess\//, 'the tokenise reference points at where the contract went');
  assert.match(ref, /does not read your codebase|does \*\*not\*\* read the codebase/i);
});

// ---------------------------------------------------------------------------
// The command surface
// ---------------------------------------------------------------------------

test('tokenise is registered as built, and points at its own reference file', () => {
  const command = resolveCommand('tokenise');
  assert.equal(command.built, true);
  assert.deepEqual(command.aliases, ['tokenize']);

  const skill = fs.readFileSync(path.join(PACKAGE_ROOT, 'skill', 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('refs/tokenise/'));
});

test('tokenise takes a sentence, and says what it read before writing', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('tokenise "our brand blue #1D4ED8"', dir, accept);
    assert.equal(code, 0);
    assert.ok(out.includes('Read from "our brand blue #1D4ED8"'));
    assert.ok(out.includes('#1D4ED8'));
    assert.ok(out.includes('Wrote'));
  });
});

test('tokenise never reads the codebase — not one file', async () => {
  await withProject(async (dir) => {
    // A codebase full of raw values, and a sentence about none of them.
    const { out } = await run('tokenise "our brand green #16A34A"', dir, accept);
    assert.ok(!out.includes('src/styles.css'), 'no file from the codebase is mentioned');
    assert.ok(!out.includes('read-only'), 'there is no scan to be read-only about');
    assert.ok(out.includes('`tokenise` reads the sentence, `assess` reads the code'));

    const model = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(model.includes('#16A34A'), 'the sentence’s value was written');
    assert.ok(!model.includes('#2564EC'), 'and nothing the codebase happens to contain was');
  }, EMPTY_FIXTURE);
});

test('bare tokenise explains the sentence form and hands scanning to assess', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out } = await run('tokenise', dir);
    assert.ok(out.includes('names the values in a sentence, one question at a time'));
    assert.ok(out.includes('`assess` does that'), 'it names the command that reads code');
    assert.ok(out.includes('Nothing has been written'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});

test('bare tokenise with a terminal asks what to name rather than scanning', async () => {
  await withProject(async (dir) => {
    const asked = [];
    const { out } = await run('tokenise', dir, {
      ask: async (question) => {
        asked.push(question);
        return asked.length === 1 ? 'our brand teal #0D9488' : 'y';
      },
      confirm: async () => true,
    });
    // The picker opens the run now, and free text at it is a whole sentence —
    // the ramp never becomes a gate for a user who knows the grammar.
    assert.match(asked[0], /What are you tokenising\?/);
    assert.ok(out.includes('#0D9488'));
    assert.ok(out.includes('Wrote'));
  }, EMPTY_FIXTURE);
});

// ---------------------------------------------------------------------------
// With nothing to read — the kind picker (v0.4.0 plan §4)
// ---------------------------------------------------------------------------

/** An empty `tokenise` run that answers its questions in order, then accepts. */
function pickerRun(dir, answers) {
  const asked = [];
  const queue = [...answers];
  return {
    asked,
    result: run('tokenise', dir, {
      ask: async (question) => {
        asked.push(question);
        return queue.length > 0 ? queue.shift() : 'y';
      },
      confirm: async () => true,
    }),
  };
}

test('the kind picker is the table in refs/tokenise/picker.md, printed', () => {
  const rows = pickerOptions();
  assert.deepEqual(
    rows.map((row) => row.pick),
    ['colour', 'typography', 'radius', 'spacing', 'other'],
    'the three passes, the two commonest number roles, and the escape row',
  );

  const printed = renderPicker().split('\n');
  assert.equal(printed[0], 'What are you tokenising?');
  rows.forEach((row, index) => {
    assert.equal(printed[index + 1], `  ${index + 1}. ${row.printsAs}`, 'numbered in table order');
  });
  assert.match(printed.at(-1), /just describe it/, 'and the escape line closes it');
  assert.match(printed.at(-1), /"skip"/);

  // `something else` is the row that keeps compounds on a numbered path.
  assert.equal(rows.at(-1).followUp, 'free-text');
});

test('the colour fork is its own table, and both rows name a value question', () => {
  const rows = colourForkOptions();
  assert.deepEqual(
    rows.map((row) => row.pick),
    ['solid', 'gradient'],
  );
  const printed = renderColourFork().split('\n');
  assert.equal(printed[0], 'A solid colour, or a gradient?');
  rows.forEach((row, index) => {
    assert.equal(printed[index + 1], `  ${index + 1}. ${row.printsAs}`);
    assert.ok(valueQuestionFor(row.followUp), `${row.pick} points at a question with no row`);
  });
  assert.match(printed.at(-1), /"skip"/, 'the fork is escapable too');
});

test('every value question renders the bracketed hint its ref row declares', () => {
  const rows = valueQuestions();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.match(row.hint, /^\[.+\]/, `${row.question}'s hint is not in brackets`);
    assert.ok(row.hint.includes('[name]'), `${row.question} never says a name may ride along`);

    const printed = valueQuestion(row.question);
    assert.ok(printed.includes(row.hint), `${row.question} does not print its own hint`);
    assert.ok(printed.startsWith(row.asks), `${row.question} does not open with its own ask`);
    assert.ok(printed.includes(row.example), `${row.question} drops its example`);
    assert.ok(printed.includes('(or "skip")'), `${row.question} has no way out`);
    assert.equal(argumentHint(row.question), row.hint);
  }

  // Every follow-up a picker row names is a question that exists.
  for (const row of [...pickerOptions(), ...colourForkOptions()]) {
    if (row.followUp === 'colour-fork' || row.followUp === 'free-text') continue;
    assert.ok(valueQuestionFor(row.followUp), `${row.pick} points at ${row.followUp}, which has no row`);
  }
});

test('the missing-value question wears the same hint, after its lead sentence', () => {
  const row = valueQuestionFor('missing-value');
  const asked = missingValueQuestion({ name: 'brand-blue', input: 'add a token' });
  assert.match(asked, /^What is `brand-blue`\?/, 'it says what it is asking about first');
  assert.ok(asked.includes(row.hint), 'and then wears the hint its row declares');
});

test('a border radius pick builds prose, and the role question never fires', async () => {
  await withProject(async (dir) => {
    const { asked, result } = pickerRun(dir, ['3', '8px']);
    const { code } = await result;
    assert.equal(code, 0);
    assert.match(asked[0], /What are you tokenising\?/);
    assert.match(asked[1], /Write your value as \[px \/ rem value\] \[name\]/);
    assert.ok(
      !asked.some((question) => /apply to\?/.test(question)),
      'the pick already answered what it applies to',
    );

    const model = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(model.includes('8px'));
    assert.ok(model.includes('corner radius'), 'and it landed in the radius role');
  }, EMPTY_FIXTURE);
});

test('a spacing pick lands in the spacing role, name and all', async () => {
  await withProject(async (dir) => {
    const { asked, result } = pickerRun(dir, ['4', '16px called space-md']);
    await result;
    assert.ok(!asked.some((question) => /apply to\?/.test(question)));

    const model = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(model.includes('space-md'), 'a name rides along in the answer');
    assert.ok(model.includes('spacing'));
  }, EMPTY_FIXTURE);
});

test('a typography pick reads as one reading, not as a bare length', async () => {
  await withProject(async (dir) => {
    const { asked, result } = pickerRun(dir, ['2', '24px bold 1.2']);
    await result;
    assert.match(asked[1], /Write your reading as \[size\] \[weight\] \[line-height\] \[name\]/);

    const model = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    const typography = model.slice(model.indexOf('### Typography'));
    assert.ok(typography.includes('24px'), 'the reading is in Typography, not Numbers');
    assert.ok(typography.includes('700') && typography.includes('1.2'));
  }, EMPTY_FIXTURE);
});

test('the colour pick forks before the value, and solid walks the old path', async () => {
  await withProject(async (dir) => {
    const { asked, result } = pickerRun(dir, ['1', '1', '#0D9488']);
    await result;
    assert.match(asked[1], /A solid colour, or a gradient\?/);
    assert.match(asked[2], /Write your colour as \[HEX code \/ rgba value\] \[name\]/);

    const model = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(model.includes('#0D9488'));
  }, EMPTY_FIXTURE);
});

test('the gradient branch records the gradient verbatim and never asks about stops', async () => {
  await withProject(async (dir) => {
    const gradient = 'linear-gradient(135deg, #2563EB, #10B981)';
    const { asked, result } = pickerRun(dir, ['1', '2', gradient]);
    await result;
    assert.match(asked[2], /Write your gradient as/);

    const model = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    assert.ok(model.includes(gradient), 'stops and angle exactly as typed');
    assert.ok(/gradient-\d/.test(model), 'and the name carries the mark word');
  }, EMPTY_FIXTURE);
});

test('free text at any picker step is parsed as a whole sentence', async () => {
  // At the picker itself.
  await withProject(async (dir) => {
    const { result } = pickerRun(dir, ['our brand teal #0D9488']);
    await result;
    assert.ok(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8').includes('#0D9488'));
  }, EMPTY_FIXTURE);

  // And one step deeper, at the fork.
  await withProject(async (dir) => {
    const { result } = pickerRun(dir, ['1', 'our brand teal #0D9488']);
    await result;
    assert.ok(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8').includes('#0D9488'));
  }, EMPTY_FIXTURE);
});

test('a pick answers to its own word as readily as to its number', () => {
  assert.equal(resolvePick('3').row.pick, 'radius');
  assert.equal(resolvePick('a border radius').row.pick, 'radius', 'the printed label');
  assert.equal(resolvePick('radius').row.pick, 'radius', 'and the label without its article');
  assert.equal(resolvePick('colour').row.pick, 'colour');
  assert.equal(resolvePick('9').action, 'prose', 'a number off the end is not a pick');
  assert.equal(resolvePick('skip').action, 'skip');
  assert.equal(resolvePick('').action, 'skip', 'and so is answering nothing');
  assert.deepEqual(resolvePick('our brand blue #2563EB'), {
    action: 'prose',
    prose: 'our brand blue #2563EB',
  });
});

test('the added role word is dropped when the answer already said it', () => {
  assert.equal(buildProse('<answer> radius', '8px'), '8px radius');
  assert.equal(buildProse('<answer> radius', '8px radius'), '8px radius', 'never said twice');
  assert.equal(buildProse('<answer> spacing', '16px padding'), '16px padding');
  assert.equal(buildProse('type <answer>', '24px'), 'type 24px');
  assert.equal(buildProse('<answer>', '#2563EB'), '#2563EB', 'a colour is built unchanged');
});

test('skip at any picker depth writes nothing at all', async () => {
  for (const answers of [['skip'], ['1', 'skip'], ['1', '1', 'skip'], ['3', 'skip'], ['5', 'skip']]) {
    await withProject(async (dir) => {
      const before = snapshotContents(dir);
      const { result } = pickerRun(dir, answers);
      const { out, code } = await result;
      assert.equal(code, 0);
      assert.ok(out.includes('Nothing has been written'), `${answers.join(' → ')} wrote a notice`);
      assert.deepEqual(
        diffSnapshots(before, snapshotContents(dir)).changed,
        [],
        `${answers.join(' → ')} changed a file`,
      );
    }, EMPTY_FIXTURE);
  }
});

test('a non-interactive empty run still prints usage and exits 1', async () => {
  await withProject(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await run('tokenise', dir);
    assert.equal(code, 1, 'a picker with nobody to pick is a wall, so it is not opened');
    assert.ok(out.includes('names the values in a sentence, one question at a time'));
    assert.ok(!out.includes('What are you tokenising?'), 'and no question is printed to nobody');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  }, EMPTY_FIXTURE);
});

test('`tokenize` is the same subskill, on a real flow', async () => {
  await withProject(async (dir) => {
    const a = await run('tokenise "our brand blue #1D4ED8"', dir);
    const b = await run('tokenize "our brand blue #1D4ED8"', dir);
    assert.equal(b.out, a.out, 'the alias produces identical output');
    assert.equal(b.code, a.code);

    const help = await run('help tokenise', dir);
    const helpAlias = await run('help tokenize', dir);
    assert.equal(helpAlias.out, help.out);
  });
});

test('`tokenize` writes the same file as `tokenise` would', async () => {
  let canonical;
  await withProject(async (dir) => {
    await run('tokenise "16px spacing"', dir, accept);
    canonical = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
  }, EMPTY_FIXTURE);
  await withProject(async (dir) => {
    await run('tokenize "16px spacing"', dir, accept);
    assert.equal(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'), canonical);
  }, EMPTY_FIXTURE);
});

test('with no route to a model, tokenise names both ways to get one', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('tokenise "our brand blue #1D4ED8"', dir);
    assert.equal(code, 1);
    assert.ok(out.includes('Install Claude Code'));
    assert.ok(out.includes('what a designer would call them'), 'it says what it needs a model for');
  });
});

test('inside a Claude Code session the skill takes over the conversation', async () => {
  await withProject(async (dir) => {
    const { out, code } = await run('tokenise "our brand blue #1D4ED8"', dir, {
      env: { CLAUDECODE: '1' },
    });
    assert.equal(code, 0);
    assert.ok(out.includes('inside a Claude Code session'));
  });
});

test('tokenise before init points at init and creates nothing', async () => {
  await withTempDir(async (dir) => {
    copyDir(MIXED, dir);
    const before = snapshotPaths(dir);
    const { out, code } = await run('tokenise "our brand blue #2563EB"', dir);
    assert.equal(code, 0);
    assert.ok(out.includes('phyllum init'));
    assert.deepEqual(snapshotPaths(dir), before);
  });
});

test('a value the system already names is said plainly, and nothing is written', async () => {
  await withProject(async (dir) => {
    const before = fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8');
    const { out, code } = await run('tokenise "our brand blue #2563EB"', dir, accept);
    assert.equal(code, 0);
    assert.ok(out.includes('is already `color-primary`'));
    assert.ok(out.includes('never renames a token you already have'));
    assert.equal(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'), before);
  });
});
