/**
 * Assertions for `update` — the design-system editing verb (v0.4.0 plan §6, M5).
 *
 * The contract lives in `skill/refs/update.md`; the command parses it; these
 * checks assert it. Everything asserted here is deterministic — the copy, the
 * grammar, what is listed, what a rename drags with it, what a collision stops,
 * and above all *when* the one write happens. The conversational ends (the menu
 * reaching both flows, prose skipping the menu, skip at every depth) are the
 * eval suite's, as always.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { executeArgv } from '../../lib/execute.js';
import { parseInvocation, tokenizeLine } from '../../lib/parse-args.js';
import { resolveCommand } from '../../lib/registry.js';
import { parse } from '../../lib/design-system.js';
import { BACKUP_FILE, DESIGN_SYSTEM_FILE, PRD_FILE } from '../../lib/write.js';
import {
  chainWords,
  isChainWord,
  updateCopy,
  updateHint,
  updateMenuOptions,
  updateQuestionFor,
  updateTypeOptions,
} from '../../lib/update-spec.js';
import { diffSnapshots, snapshotContents, withTempDir } from './helpers.js';

/**
 * A design system with something to edit and something to ripple onto: two
 * colours, two numbers in two different roles, a reading, two components whose
 * specs reference the tokens by name, and a Backlog that names one of them.
 */
const SYSTEM = `# Design System

> Phyllum manages this file. It is the single source of truth for this project's design system.

- Project: acme-web
- Phyllum version: 0.3.0
- Created: 2026-08-12

## Tokens

### Colours

| token | value |
| --- | --- |
| color-primary | #2563EB |
| color-surface | #FFFFFF |

### Numbers

| token | value | applies to |
| --- | --- | --- |
| rounded-md | 12px | corner radius |
| space-md | 16px | spacing |

### Typography

| token | size | weight | line-height |
| --- | --- | --- | --- |
| highlight-small | 12px | 700 | 1.3 |

## Components

### Button/Primary

\`\`\`yaml
name: Button/Primary
archetype: button
properties:
  background: color-primary
  radius: rounded-md
\`\`\`

### Card/Basic

\`\`\`yaml
name: Card/Basic
archetype: card
properties:
  background: color-surface
  radius: rounded-md
\`\`\`

## Backlog

- TODO: swap \`color-primary\` into Card/Basic
- TODO: tokenise \`8px\` (Button/Primary padding-bottom)
- TODO: fill contract slot \`disabled\` (Button/Primary)
`;

/** A project with that design system in it. */
async function project(body) {
  return withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), SYSTEM);
    return body(dir);
  });
}

const read = (dir) => fs.readFileSync(path.join(dir, DESIGN_SYSTEM_FILE), 'utf8');

/**
 * A scripted conversation. `asked` is every question put, in order, so a test
 * can assert what the user was shown as well as what came back.
 */
function scripted(answers, { accept = true } = {}) {
  const asked = [];
  const gates = [];
  return {
    asked,
    gates,
    ask: async (question) => {
      asked.push(question);
      return answers.shift() ?? 'skip';
    },
    confirm: async (question) => {
      gates.push(question);
      return accept;
    },
  };
}

const ctx = (dir, conversation = {}) => ({ cwd: dir, ...conversation });

// ---------------------------------------------------------------------------
// The un-aliasing and the grammar (§6.1, §6.2)
// ---------------------------------------------------------------------------

test('`update` is its own registry entry, with `component` and `token` reserved', () => {
  const update = resolveCommand('update');
  assert.ok(update, '`update` resolves');
  assert.equal(update.name, 'update');
  assert.notEqual(update, resolveCommand('apply'), 'and it is not `apply` under a second name');

  // The reserved words are the ref table's, not a second list in the code.
  assert.deepEqual(update.chains, chainWords());
  assert.deepEqual(chainWords(), ['component', 'token']);
  for (const word of chainWords()) assert.ok(isChainWord(word));

  for (const chain of chainWords()) {
    const invocation = parseInvocation(tokenizeLine(`update ${chain}`));
    assert.equal(invocation.kind, 'command');
    assert.equal(invocation.command.name, 'update', `\`update ${chain}\` reaches \`update\``);
    assert.deepEqual(
      invocation.args.map((token) => token.value),
      [chain],
      'and the chain word arrives as its argument',
    );
  }
});

test('the menu rows and the chain words are the same two things', () => {
  assert.deepEqual(
    updateMenuOptions().map((row) => row.chain),
    chainWords(),
  );
});

test('`update run` is not a command any more', async () => {
  // v0.3.0 spelled `update run` as `apply run`. The word left, and the scope
  // word left with it: nothing here executes anything.
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const conversation = scripted(['skip']);
    const result = await executeArgv(['update', 'run'], ctx(dir, conversation));
    assert.equal(result.code, 0);
    assert.ok(!/branch|commit per phase/i.test(result.out), '`update run` executes nothing');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('`phyllum update` never writes .phyllum/PRD.md, under any argument', async () => {
  const argumentSets = [
    ['update'],
    ['update', 'run'],
    ['update', '--fresh'],
    ['update', 'token'],
    ['update', 'component'],
    ['update', 'make color-primary #1D4ED8'],
    ['update', 'token', 'make color-primary #1D4ED8'],
  ];
  for (const args of argumentSets) {
    await project(async (dir) => {
      const before = snapshotContents(dir);
      // Answered with a skip at every depth, and refused at the gate: the run
      // must reach the end of its conversation without a single write.
      await executeArgv(args, ctx(dir, scripted(['skip', 'skip', 'skip'], { accept: false })));
      const after = snapshotContents(dir);
      assert.ok(!after.has(PRD_FILE), `${args.join(' ')} wrote ${PRD_FILE}`);
      assert.deepEqual(diffSnapshots(before, after), { added: [], changed: [], removed: [] });
    });
  }
});

// ---------------------------------------------------------------------------
// The menu (§6.2)
// ---------------------------------------------------------------------------

test('the empty-run menu prints both rows, the escape, and the `apply` breadcrumb', async () => {
  await project(async (dir) => {
    const conversation = scripted(['skip']);
    await executeArgv(['update'], ctx(dir, conversation));
    const menu = conversation.asked[0];
    assert.ok(menu.startsWith(updateCopy('menu-question')), 'the question the table declares');
    updateMenuOptions().forEach((row, index) => {
      assert.ok(menu.includes(`${index + 1}. ${row.printsAs}`), `row ${index + 1} is printed`);
    });
    assert.ok(menu.includes(updateCopy('escape')), 'free text and skip are offered');

    // The 0.4.x breadcrumb, verbatim from the table.
    assert.equal(
      updateCopy('breadcrumb'),
      'Looking to apply the design system to your code? That is `phyllum apply`.',
    );
    assert.ok(menu.includes(updateCopy('breadcrumb')), 'the breadcrumb prints on the empty run');
  });
});

test('the breadcrumb prints on the empty run and nowhere else', async () => {
  await project(async (dir) => {
    const conversation = scripted(['skip']);
    const result = await executeArgv(['update', 'token'], ctx(dir, conversation));
    const everything = [...conversation.asked, result.out].join('\n');
    assert.ok(
      !everything.includes(updateCopy('breadcrumb')),
      'a chained run did not mistype anything, so it is not pointed at `apply`',
    );
  });
});

// ---------------------------------------------------------------------------
// `update token`: the list, the question, the hint (§6.4, §4.4)
// ---------------------------------------------------------------------------

test('the token list prints every row of the picked section', async () => {
  await project(async (dir) => {
    const conversation = scripted(['1', 'skip']);
    const result = await executeArgv(['update', 'token'], ctx(dir, conversation));

    const type = conversation.asked[0];
    assert.ok(type.startsWith(updateCopy('type-question')));
    updateTypeOptions().forEach((row, index) => {
      assert.ok(type.includes(`${index + 1}. ${row.printsAs}`), `type row ${index + 1} is printed`);
    });

    const model = parse(SYSTEM);
    for (const [name, value] of model.tokens.colours) {
      assert.ok(result.out.includes(name), `${name} is listed`);
      assert.ok(result.out.includes(value), `${value} is listed`);
    }
    assert.ok(result.out.includes(`Colours — ${model.tokens.colours.length} tokens`));
  });
});

test('a number type lists its own role, and only its own', async () => {
  await project(async (dir) => {
    // Row 3 is `a border radius`; `space-md` is spacing and belongs to row 4.
    const conversation = scripted(['3', 'skip']);
    const result = await executeArgv(['update', 'token'], ctx(dir, conversation));
    assert.ok(result.out.includes('rounded-md'), 'the radius is listed');
    assert.ok(!result.out.includes('space-md'), 'the spacing is not');
  });
});

test('an empty section says so and points at `tokenise`, rather than dead-ending', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(
      path.join(dir, DESIGN_SYSTEM_FILE),
      SYSTEM.replace('| color-primary | #2563EB |\n| color-surface | #FFFFFF |\n', ''),
    );
    const before = snapshotContents(dir);
    const conversation = scripted(['1']);
    const result = await executeArgv(['update', 'token'], ctx(dir, conversation));
    assert.ok(/no colour tokens/i.test(result.out), 'it says the section is empty');
    assert.ok(result.out.includes('phyllum tokenise'), 'and points at the command that fills it');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test("update's change question renders the hint its table row declares", async () => {
  await project(async (dir) => {
    const conversation = scripted(['1', '1', 'skip']);
    await executeArgv(['update', 'token'], ctx(dir, conversation));
    const question = conversation.asked.at(-1);
    const row = updateQuestionFor('token-change');

    assert.equal(updateHint('token-change'), '[new value] and/or [rename to <name>]');
    assert.equal(
      question,
      `${row.asks} \`color-primary\`? ${row.hint} — e.g. "${row.example}". (or "skip")`,
      'the ask, the target, the hint, an example, the escape — in that order',
    );
  });
});

// ---------------------------------------------------------------------------
// Target-matching: exact, or a question (§6.2)
// ---------------------------------------------------------------------------

test('prose naming a recorded token exactly goes straight to its proposal', async () => {
  await project(async (dir) => {
    const conversation = scripted([], { accept: false });
    const result = await executeArgv(
      ['update', 'make color-primary #1D4ED8'],
      ctx(dir, conversation),
    );
    assert.deepEqual(conversation.asked, [], 'nothing was asked — the sentence said it all');
    assert.ok(result.out.includes('#2563EB → #1D4ED8'), 'old and new, side by side');
  });
});

test('a near-miss name resolves to nothing and is asked about, never guessed', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const conversation = scripted(['skip']);
    const result = await executeArgv(['update', 'make color-primar #1D4ED8'], ctx(dir, conversation));
    assert.ok(/never guesses/i.test(result.out), 'it says it will not guess');
    assert.ok(conversation.asked[0].includes(updateCopy('menu-question')), 'and asks instead');
    assert.equal(read(dir), SYSTEM, 'and `color-primary` is untouched');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });
});

// ---------------------------------------------------------------------------
// The rename ripple (§6.4)
// ---------------------------------------------------------------------------

test('a rename rewrites every referencing spec slot and Backlog line, and no others', async () => {
  await project(async (dir) => {
    const conversation = scripted(['1', '1', 'rename to interaction-primary']);
    const result = await executeArgv(['update', 'token'], ctx(dir, conversation));

    // Said out loud before the gate, counted — accepting a rename is accepting
    // all of it, which is only true if the count was on screen first.
    assert.ok(/renaming also rewrites/.test(result.out), 'the ripple is reported');
    assert.ok(/1 spec slot \(Button\/Primary\)/.test(result.out));
    assert.ok(/1 Backlog line/.test(result.out));

    const before = parse(SYSTEM);
    const after = parse(read(dir));

    assert.deepEqual(
      after.tokens.colours.map((row) => row[0]),
      ['interaction-primary', 'color-surface'],
      'the token row is renamed in place',
    );
    assert.equal(after.tokens.colours[0][1], '#2563EB', 'and its value is untouched');

    const specOf = (model, name) =>
      model.components.find((item) => item.name === name).blocks[0].content;
    assert.ok(specOf(after, 'Button/Primary').includes('background: interaction-primary'));
    assert.equal(
      specOf(after, 'Card/Basic'),
      specOf(before, 'Card/Basic'),
      'a component that never referenced it is byte-identical',
    );

    assert.deepEqual(after.backlog, [
      'TODO: swap `interaction-primary` into Card/Basic',
      before.backlog[1],
      before.backlog[2],
    ]);

    // One write, and the whole ripple inside it.
    assert.ok(result.out.includes('Wrote `interaction-primary`'));
    assert.equal(fs.readFileSync(path.join(dir, BACKUP_FILE), 'utf8'), SYSTEM);
  });
});

test('a rename touches nothing that merely contains the old name', async () => {
  await withTempDir(async (dir) => {
    const system = SYSTEM.replace(
      '  radius: rounded-md\n\\`\\`\\`\n\n### Card/Basic',
      '  radius: rounded-md\n```\n\n### Card/Basic',
    ).replace('| color-surface | #FFFFFF |', '| color-primary-dark | #1E3A8A |');
    fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), system);

    const conversation = scripted(['1', '1', 'rename to brand-blue']);
    await executeArgv(['update', 'token'], ctx(dir, conversation));
    const after = parse(read(dir));
    assert.deepEqual(
      after.tokens.colours.map((row) => row[0]),
      ['brand-blue', 'color-primary-dark'],
      '`color-primary-dark` is a different token and keeps its name',
    );
  });
});

// ---------------------------------------------------------------------------
// Convergence, re-run on an edit (§6.4)
// ---------------------------------------------------------------------------

test('a value change that collides with an existing token is surfaced, not written', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    // The same colour `color-primary` already holds, in another format — the
    // cross-format comparison of §3.1 is what catches it.
    const conversation = scripted([]);
    const result = await executeArgv(
      ['update', 'color-surface now rgb(37, 99, 235)'],
      ctx(dir, conversation),
    );
    assert.ok(result.out.includes('`color-primary`'), 'it names the token that holds the value');
    assert.ok(/merge/i.test(result.out), 'and offers the two honest ways out');
    assert.deepEqual(conversation.gates, [], 'the gate is never even reached');
    assert.equal(read(dir), SYSTEM);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('a number collides only inside its own "applies to"', async () => {
  await project(async (dir) => {
    // 16px is `space-md`'s value, but as a radius it is a different fact.
    const conversation = scripted([]);
    const result = await executeArgv(['update', 'rounded-md now 16px'], ctx(dir, conversation));
    assert.ok(!/already `space-md`/.test(result.out), 'no collision across roles');
    assert.ok(result.out.includes('12px'), 'the proposal shows the old value');
  });
});

// ---------------------------------------------------------------------------
// The gate, and the one write (§6.5)
// ---------------------------------------------------------------------------

test('nothing is written before the gate, and a refusal writes nothing at all', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    let atGate = null;
    const conversation = {
      asked: [],
      gates: [],
      ask: async (question) => {
        conversation.asked.push(question);
        return ['1', '1', 'now #1D4ED8'][conversation.asked.length - 1] ?? 'skip';
      },
      confirm: async (question) => {
        conversation.gates.push(question);
        atGate = snapshotContents(dir);
        return false;
      },
    };
    const result = await executeArgv(['update', 'token'], ctx(dir, conversation));

    assert.equal(conversation.gates.length, 1, 'exactly one gate');
    assert.deepEqual(diffSnapshots(before, atGate), { added: [], changed: [], removed: [] },
      'the project is untouched at the moment the question is put');
    assert.ok(/not accepted/i.test(result.out));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('an accepted change takes the .bak before it writes, and writes one file', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const conversation = scripted(['1', '1', 'now #1D4ED8']);
    await executeArgv(['update', 'token'], ctx(dir, conversation));

    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.added, [BACKUP_FILE], 'the one undo, and nothing else');
    assert.deepEqual(diff.changed, [DESIGN_SYSTEM_FILE], 'the one file Phyllum edits');
    assert.deepEqual(diff.removed, []);
    assert.equal(
      fs.readFileSync(path.join(dir, BACKUP_FILE), 'utf8'),
      SYSTEM,
      'the backup holds the file as it stood before the edit',
    );
    assert.equal(parse(read(dir)).tokens.colours[0][1], '#1D4ED8');
  });
});

test('a change sentence changes only what it mentions', async () => {
  await project(async (dir) => {
    // A typography reading whose weight and line-height the sentence never
    // states keeps the ones it had: the CSS defaults fill a *new* token's gaps,
    // never an existing one's.
    const conversation = scripted(['2', '1', 'now 16px']);
    await executeArgv(['update', 'token'], ctx(dir, conversation));
    assert.deepEqual(parse(read(dir)).tokens.typography[0], [
      'highlight-small',
      '16px',
      '700',
      '1.3',
    ]);
  });
});

// ---------------------------------------------------------------------------
// The M6 seam (§6.3)
// ---------------------------------------------------------------------------

test('`update component` resolves, says what is not built yet, and writes nothing', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const result = await executeArgv(['update', 'component'], ctx(dir, scripted([])));
    assert.equal(result.code, 0);
    assert.ok(/M6/.test(result.out), 'it names the milestone it lands in');
    assert.ok(result.out.includes('phyllum create'), 'and the door that is open today');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

// ---------------------------------------------------------------------------
// With nobody to ask
// ---------------------------------------------------------------------------

test('a run with no way to ask prints the grammar and writes nothing', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const result = await executeArgv(['update'], { cwd: dir });
    assert.equal(result.code, 1, 'a menu with nobody to pick is a wall, and says so by exiting');
    assert.ok(result.out.includes('phyllum update token'), 'the grammar table is the usage block');
    assert.ok(result.out.includes('Nothing has been written'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});
