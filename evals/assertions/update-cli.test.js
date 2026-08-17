/**
 * Assertions for `update` — the design-system editing verb (v0.4.0 plan §6, M5).
 *
 * The contract lives in `skill/refs/update/`; the command parses it; these
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
// `update component`: the list, the pick, the revision (§6.3)
// ---------------------------------------------------------------------------

/** The recorded properties of one component, as the spec block records them. */
function specOf(text, name) {
  const component = parse(text).components.find((item) => item.name === name);
  return component.blocks.find((block) => block.lang === 'yaml').content;
}

test('`update component` reaches the real flow — the list, then the change question', async () => {
  await project(async (dir) => {
    const conversation = scripted(['skip']);
    const result = await executeArgv(['update', 'component'], ctx(dir, conversation));
    assert.equal(result.code, 0);
    assert.ok(!/not built yet|M6/.test(result.out), 'the seam is gone; the flow is here');
    assert.ok(
      conversation.asked[0].includes('Which one are you updating?'),
      'it opens on the pick, not on an apology',
    );
  });
});

test('the component list prints every recorded component with its archetype', async () => {
  await project(async (dir) => {
    const conversation = scripted(['skip']);
    const result = await executeArgv(['update', 'component'], ctx(dir, conversation));

    const model = parse(SYSTEM);
    assert.ok(result.out.includes(`Components — ${model.components.length} recorded:`));
    model.components.forEach((component, index) => {
      const spec = component.blocks.find((block) => block.lang === 'yaml').content;
      const archetype = spec.match(/^archetype:\s*(.+)$/m)[1];
      assert.ok(
        new RegExp(`${index + 1}\\. ${component.name}\\s+${archetype}`).test(result.out),
        `${component.name} is listed with its archetype`,
      );
    });
  });
});

test('a system with no components says so, points at `create`, and exits clean', async () => {
  await withTempDir(async (dir) => {
    const emptied = `${SYSTEM.split('## Components')[0]}## Components\n\n_No components yet. Run \`phyllum create\` to add one._\n\n## Backlog\n`;
    fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), emptied);
    const before = snapshotContents(dir);
    const conversation = scripted([]);
    const result = await executeArgv(['update', 'component'], ctx(dir, conversation));

    assert.equal(result.code, 0, 'an empty section is not an error');
    assert.ok(/no components/i.test(result.out), 'it says the section is empty');
    assert.ok(result.out.includes('phyllum create'), 'and points at the command that fills it');
    assert.deepEqual(conversation.asked, [], 'nothing is asked, because there is nothing to pick');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('the component-change question renders the hint its table row declares', async () => {
  await project(async (dir) => {
    const conversation = scripted(['1', 'skip']);
    await executeArgv(['update', 'component'], ctx(dir, conversation));
    const question = conversation.asked.at(-1);
    const row = updateQuestionFor('component-change');

    assert.equal(
      updateHint('component-change'),
      '[slot becomes <value>] and/or [add a <state> state]',
    );
    assert.equal(
      question,
      `${row.asks} \`Button/Primary\`? ${row.hint} — e.g. "${row.example}". (or "skip")`,
      'the ask, the target, the hint, an example, the escape — in that order',
    );
  });
});

test('a change through `update component` alters only what the prose names', async () => {
  await project(async (dir) => {
    const conversation = scripted(['1', 'background becomes color-surface']);
    const result = await executeArgv(['update', 'component'], ctx(dir, conversation));

    assert.ok(result.out.includes('color-primary → color-surface'), 'old and new, side by side');

    const before = specOf(SYSTEM, 'Button/Primary');
    const after = specOf(read(dir), 'Button/Primary');
    assert.ok(after.includes('background: color-surface'), 'the slot the sentence named changed');

    // Every other line of the spec block is byte-identical, in place and in order.
    const others = (text) => text.split('\n').filter((line) => !/^\s*background:/.test(line));
    assert.deepEqual(others(after), others(before), 'nothing the sentence never named moved');

    // And the component the sentence never named is untouched, whole.
    assert.equal(specOf(read(dir), 'Card/Basic'), specOf(SYSTEM, 'Card/Basic'));
  });
});

test('a slot named without a value is a question, and a skipped question is a TODO', async () => {
  await project(async (dir) => {
    // "add a disabled state" names a state and gives it nothing — the
    // never-list forbids inventing one, so it is asked, and a skip records the
    // honest TODO rather than a guess.
    const conversation = scripted(['1', 'add a disabled state', 'skip']);
    await executeArgv(['update', 'component'], ctx(dir, conversation));

    assert.ok(
      conversation.asked.some((question) => /what changes on disabled/i.test(question)),
      'the state is asked about, never invented',
    );
    const after = specOf(read(dir), 'Button/Primary');
    assert.ok(after.includes('disabled: TODO'), 'the skip is recorded as a TODO');
    assert.ok(after.includes('background: color-primary'), 'and the recorded slots are untouched');
  });
});

test('`update component "<prose>"` naming one component skips the list', async () => {
  await project(async (dir) => {
    const conversation = scripted([]);
    const result = await executeArgv(
      ['update', 'component', 'Button/Primary background becomes color-surface'],
      ctx(dir, conversation),
    );
    assert.deepEqual(conversation.asked, [], 'nothing was asked — the sentence said it all');
    assert.ok(!result.out.includes('Components — '), 'and the list was never printed');
    assert.ok(result.out.includes('color-primary → color-surface'));
  });
});

test('`update "<prose>"` naming a component goes straight to its confirmation', async () => {
  await project(async (dir) => {
    const conversation = scripted([], { accept: false });
    const result = await executeArgv(
      ['update', 'Button/Primary background becomes color-surface'],
      ctx(dir, conversation),
    );
    assert.deepEqual(conversation.asked, [], 'the menu never opened');
    assert.equal(conversation.gates.length, 1, 'the one question put was the gate');
    assert.ok(result.out.includes('`Button/Primary`'));
  });
});

test('prose naming two components asks rather than guessing', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const conversation = scripted(['skip']);
    const result = await executeArgv(
      ['update', 'component', 'Button/Primary and Card/Basic get a new background'],
      ctx(dir, conversation),
    );
    assert.ok(result.out.includes('Components — '), 'it falls back to the list');
    assert.ok(
      conversation.asked[0].includes('Which one are you updating?'),
      'and asks which one is meant',
    );
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('`update component` writes nothing before the gate, and takes the .bak first', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    let atGate = null;
    const conversation = {
      asked: [],
      gates: [],
      ask: async (question) => {
        conversation.asked.push(question);
        return ['1', 'background becomes color-surface'][conversation.asked.length - 1] ?? 'skip';
      },
      confirm: async (question) => {
        conversation.gates.push(question);
        atGate = snapshotContents(dir);
        return true;
      },
    };
    await executeArgv(['update', 'component'], ctx(dir, conversation));

    assert.equal(conversation.gates.length, 1, 'exactly one gate');
    assert.deepEqual(
      diffSnapshots(before, atGate),
      { added: [], changed: [], removed: [] },
      'the project is untouched at the moment the question is put',
    );

    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.added, [BACKUP_FILE], 'the one undo, and nothing else');
    assert.deepEqual(diff.changed, [DESIGN_SYSTEM_FILE], 'the one file Phyllum edits');
    assert.deepEqual(diff.removed, []);
    assert.equal(fs.readFileSync(path.join(dir, BACKUP_FILE), 'utf8'), SYSTEM);
  });
});

test('a refused component change writes nothing at all', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const conversation = scripted(['1', 'background becomes color-surface'], { accept: false });
    const result = await executeArgv(['update', 'component'], ctx(dir, conversation));
    assert.ok(/not accepted/i.test(result.out));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('skipping a question about a slot the file already fills leaves it as it is', async () => {
  await withTempDir(async (dir) => {
    // "add a disabled state" names a state the record already fills. Skipping
    // the question means "leave it", not "blank it" — the recorded value stands,
    // and it is never carried twice.
    const system = SYSTEM.replace(
      '  radius: rounded-md\n```\n\n### Card/Basic',
      '  radius: rounded-md\nstates:\n  disabled: half opacity\n```\n\n### Card/Basic',
    );
    fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), system);
    const before = snapshotContents(dir);

    const result = await executeArgv(
      ['update', 'component'],
      ctx(dir, scripted(['1', 'add a disabled state', 'skip'])),
    );
    assert.ok(/nothing to write/i.test(result.out), 'a skip that changes nothing writes nothing');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });

    // Answered instead, the same question changes that one state and nothing else.
    await executeArgv(
      ['update', 'component'],
      ctx(dir, scripted(['1', 'add a disabled state', 'full opacity'])),
    );
    const after = specOf(read(dir), 'Button/Primary');
    assert.equal(
      (after.match(/^\s*disabled:/gm) ?? []).length,
      1,
      'the state is recorded once, never twice',
    );
    assert.ok(after.includes('disabled: full opacity'));
    assert.ok(after.includes('background: color-primary'), 'and the slots it never named stand');
  });
});

test('the menu reaches the component flow from its first row', async () => {
  await project(async (dir) => {
    const conversation = scripted(['1', '1', 'background becomes color-surface']);
    const result = await executeArgv(['update'], ctx(dir, conversation));
    assert.ok(conversation.asked[0].includes(updateCopy('menu-question')), 'the menu came first');
    assert.ok(result.out.includes('Components — '), 'and row 1 opened the component list');
    assert.ok(specOf(read(dir), 'Button/Primary').includes('background: color-surface'));
  });
});

test('revising a custom keeps its marker, because a custom has no contract to acquire', async () => {
  await withTempDir(async (dir) => {
    const system = SYSTEM.replace(
      'name: Card/Basic\narchetype: card\n',
      'name: Card/Basic\narchetype: custom\ncustom: true\n',
    );
    fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), system);

    const conversation = scripted(['skip']);
    const listed = await executeArgv(['update', 'component'], ctx(dir, conversation));
    assert.ok(/2\. Card\/Basic\s+custom/.test(listed.out), 'the list prints it as `custom`');

    await executeArgv(
      ['update', 'component', 'Card/Basic background becomes color-primary'],
      ctx(dir, scripted([])),
    );
    const after = specOf(read(dir), 'Card/Basic');
    assert.ok(after.includes('custom: true'), 'the marker survives the revision');
    assert.ok(after.includes('archetype: custom'), 'and so does the reserved archetype word');
    assert.ok(after.includes('background: color-primary'));
  });
});

test('a component entry with no spec block says so and points at `create`', async () => {
  await withTempDir(async (dir) => {
    const system = SYSTEM.replace(
      /### Card\/Basic\n\n```yaml[\s\S]*?```\n/,
      '### Card/Basic\n\nA hand-written note, and no spec block.\n',
    );
    fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), system);
    const before = snapshotContents(dir);
    const result = await executeArgv(['update', 'component'], ctx(dir, scripted(['2'])));

    assert.ok(/2\. Card\/Basic\s+\(no spec block\)/.test(result.out), 'no archetype is invented');
    assert.ok(/no spec block/.test(result.out), 'picking it says why it cannot be revised');
    assert.ok(result.out.includes('phyllum create'), 'and where to go instead');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('`update component` never writes .phyllum/PRD.md, under any argument', async () => {
  const argumentSets = [
    ['update', 'component'],
    ['update', 'component', 'Button/Primary background becomes color-surface'],
    ['update', 'component', 'nothing recorded is called this'],
    ['update', 'Button/Primary background becomes color-surface'],
  ];
  for (const args of argumentSets) {
    await project(async (dir) => {
      await executeArgv(args, ctx(dir, scripted(['1', 'background becomes color-surface'])));
      const after = snapshotContents(dir);
      assert.ok(!after.has(PRD_FILE), `${args.join(' ')} wrote ${PRD_FILE}`);
    });
  }
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
