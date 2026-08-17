/**
 * Assertions for `delete` — the removal verb (v0.5.0 plan §4, M2).
 *
 * `delete` is the one destructive command in the product, so what has to be
 * proved here is mostly about *not* writing:
 *
 *   1. **The gates are real.** The breaking-change warning prints before any
 *      question about proceeding; an in-use component is refused with no path
 *      past it; the acceptance gate and the typed-name confirmation are both
 *      prerequisites of the one write, and `--yes` reaches neither.
 *   2. **The write is exactly the entry and its Backlog lines.** The file is
 *      diffed byte for byte around the run: every other line — the other
 *      components, the tokens, the user's own prose — comes back identical, and
 *      the whole project shows `DESIGN-SYSTEM.md` and its `.bak` and nothing
 *      else.
 *   3. **Nothing is written at any depth that did not pass both gates.** A skip
 *      at the pick, a declined gate and a wrong name at the second confirmation
 *      all leave the project byte for byte as it was — no file, no `.bak`.
 *
 * The contract lives in `skill/refs/delete/`; the command parses it; these
 * checks assert it. The conversational ends are the eval suite's, as always.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { executeArgv } from '../../lib/execute.js';
import { resolveCommand } from '../../lib/registry.js';
import { parse } from '../../lib/design-system.js';
import { setAppliedLines } from '../../lib/applied.js';
import {
  applyDelete,
  backlogFor,
  componentRanges,
  inUseCheck,
  planDelete,
} from '../../lib/delete-command.js';
import {
  deleteChainWords,
  deleteCopy,
  deleteFlow,
  deleteGrammar,
  deleteSpecNotices,
  isDeleteChainWord,
} from '../../lib/delete-spec.js';
import { BACKUP_FILE, DESIGN_SYSTEM_FILE, PRD_FILE } from '../../lib/write.js';
import { FIXTURES, copyDir, diffSnapshots, snapshotContents, withTempDir } from './helpers.js';

const CODEBASES = path.join(FIXTURES, 'codebases');

/**
 * A design system with two components, one of them named by three Backlog
 * lines, and one Backlog line naming the other — so "its lines, and only its
 * lines" is a claim with something to get wrong.
 */
const SYSTEM = `# Design System

> Phyllum manages this file. It is the single source of truth for this project's design system.

- Project: acme-web
- Phyllum version: 0.4.1
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

\`\`\`\`jsx
/**
 * Usage:
 *
 * \`\`\`jsx
 * <ButtonPrimary>Save</ButtonPrimary>
 * \`\`\`
 */
export function ButtonPrimary({ children }) {
  return <button className="button-primary">{children}</button>;
}
\`\`\`\`

### Card/Basic

\`\`\`yaml
name: Card/Basic
archetype: card
properties:
  background: color-surface
  radius: rounded-md
\`\`\`

## Backlog

- TODO: tokenise \`12px\` (Button/Primary padding-top)
- TODO: fill contract slot \`disabled\` (Button/Primary)
- TODO: tokenise \`4px\` (Card/Basic radius)
`;

/** The same file with one component only, so "the last one" has a case. */
const ONE_COMPONENT = SYSTEM.replace(/### Card\/Basic[\s\S]*?\n\n## Backlog/, '## Backlog').replace(
  '- TODO: tokenise `4px` (Card/Basic radius)\n',
  '',
);

/** The same file with no components at all. */
const EMPTY = SYSTEM.replace(
  /## Components\n[\s\S]*?\n## Backlog/,
  '## Components\n\n_No components yet. Run `phyllum create` to add one._\n\n## Backlog',
);

/** A project holding one of those design systems. */
async function project(body, { system = SYSTEM, fixture = null, files = {} } = {}) {
  return withTempDir(async (dir) => {
    if (fixture) copyDir(path.join(CODEBASES, fixture), dir);
    fs.writeFileSync(path.join(dir, DESIGN_SYSTEM_FILE), system);
    for (const [rel, contents] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), contents);
    }
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

const run = (dir, line, conversation = {}) =>
  executeArgv(line.split(' ').filter(Boolean), { cwd: dir, today: '2026-08-17', ...conversation });

/** A file that uses the recorded `Button/Primary` as the component it is. */
const ADOPTED_JSX = [
  'import { ButtonPrimary } from "./ButtonPrimary";',
  '',
  'export function Toolbar() {',
  '  return <ButtonPrimary>Save</ButtonPrimary>;',
  '}',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// The registry and the contract (§4.2, §8)
// ---------------------------------------------------------------------------

test('`delete` is its own registry entry, with `token` reserved', () => {
  const command = resolveCommand('delete');
  assert.ok(command, '`delete` resolves');
  assert.equal(command.name, 'delete');
  assert.equal(command.built, true);
  assert.notEqual(command, resolveCommand('update'), 'and it is not `update` under a second name');

  // The reserved word is the ref table's, not a second list in the code.
  assert.deepEqual(command.chains, deleteChainWords());
  assert.ok(isDeleteChainWord('token'));
  assert.ok(isDeleteChainWord('TOKEN'), 'the word is matched case-insensitively');
  assert.ok(!isDeleteChainWord('component'), '`delete component` is not a chain — a component is the default');
});

test('the shipped contract reads cleanly, and says what the flow is', () => {
  assert.deepEqual(deleteSpecNotices(), [], 'the shipped refs/delete/ has no unreadable row');

  // Six steps, and exactly one of them writes (§4.2).
  const flow = deleteFlow();
  assert.equal(flow.length, 6);
  assert.deepEqual(flow.map((row) => row.step), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    flow.filter((row) => row.writes).map((row) => row.step),
    [6],
    'only the last step writes, and the table is where that is recorded',
  );

  // The grammar reserves `token` in order to refuse it.
  const grammar = deleteGrammar();
  assert.ok(grammar.some((row) => row.typed === 'phyllum delete'));
  assert.ok(grammar.some((row) => row.takesProse), '`delete <name>` pre-answers the pick');
  assert.ok(grammar.some((row) => row.chain === 'token' && /refus/i.test(row.opens)));
});

test('the warning is a copy contract, carrying the component it is about', () => {
  const warning = deleteCopy('warning', { name: 'Button/Primary' });
  assert.ok(warning.includes('breaking change'), 'the warning says breaking change in those words');
  assert.ok(warning.includes('Button/Primary'), 'and names the component');
  assert.ok(!warning.includes('{name}'), 'the placeholder is filled, never printed');
  assert.match(warning, /no longer match anything the design system records/);

  // A line the table does not carry is empty rather than invented.
  assert.equal(deleteCopy('no-such-line'), '');
});

// ---------------------------------------------------------------------------
// The flow, end to end (§4.2)
// ---------------------------------------------------------------------------

test('delete removes exactly the entry and its Backlog lines, `.bak` first', async () => {
  await project(async (dir) => {
    const before = read(dir);
    const conversation = scripted(['1', 'Button/Primary']);
    const { out, code } = await run(dir, 'delete', conversation);
    assert.equal(code, 0);

    const after = read(dir);
    const model = parse(after);
    assert.deepEqual(model.components.map((component) => component.name), ['Card/Basic']);
    assert.deepEqual(model.backlog, ['TODO: tokenise `4px` (Card/Basic radius)']);

    // Byte for byte, and the expectation is derived from the *file* rather than
    // from the code under test: the lines from the `### Button/Primary` heading
    // up to the next heading, plus the two Backlog lines naming it, and not one
    // line more.
    const lines = before.split('\n');
    const start = lines.indexOf('### Button/Primary');
    const end = lines.indexOf('### Card/Basic');
    const dropped = new Set([...Array(end - start).keys()].map((offset) => start + offset));
    lines.forEach((line, index) => {
      if (/^- TODO:.*\(Button\/Primary/.test(line)) dropped.add(index);
    });
    assert.equal(dropped.size, end - start + 2);
    assert.equal(after, lines.filter((line, index) => !dropped.has(index)).join('\n'));
    assert.ok(after.includes('### Card/Basic'), 'the other component is untouched');
    assert.ok(after.includes('| color-primary | #2563EB |'), 'and so are the tokens');

    // The undo is on disk and is the file as it stood.
    assert.equal(fs.readFileSync(path.join(dir, BACKUP_FILE), 'utf8'), before);
    assert.ok(out.includes(BACKUP_FILE), 'the report names the backup as the undo');
  });
});

test('the whole-project diff around a delete is the file and its backup, nothing else', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    await run(dir, 'delete Button/Primary', scripted(['Button/Primary']));
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff.added, [BACKUP_FILE]);
    assert.deepEqual(diff.changed, [DESIGN_SYSTEM_FILE]);
    assert.deepEqual(diff.removed, []);
  });
});

test('`delete <name>` pre-answers the pick, and the warning still prints first', async () => {
  await project(async (dir) => {
    const conversation = scripted(['Button/Primary']);
    const { out } = await run(dir, 'delete Button/Primary', conversation);

    // One question only: the second confirmation. The pick was answered by the
    // argument, and the warning is not a question at all.
    assert.equal(conversation.asked.length, 1);
    assert.match(conversation.asked[0], /Type the component's name/);

    const warning = out.indexOf('breaking change');
    const gate = out.indexOf('Deleting `Button/Primary` removes exactly');
    assert.ok(warning !== -1, 'the warning prints on a pre-answered run too');
    assert.ok(warning < gate, 'and it prints before any question about proceeding');
    assert.ok(conversation.gates.length === 1, 'exactly one acceptance gate');
  });
});

test('an unknown name lists and asks rather than failing or guessing', async () => {
  await project(async (dir) => {
    const conversation = scripted(['skip']);
    const { out, code } = await run(dir, 'delete Button/Primry', conversation);
    assert.equal(code, 0);
    assert.ok(out.includes('Button/Primry'), 'it says the name it could not find');
    assert.ok(out.includes('never guesses a target'));
    assert.ok(out.includes('Components — 2 recorded:'), 'and lists what there is');
    assert.equal(read(dir), SYSTEM);
    assert.ok(!fs.existsSync(path.join(dir, BACKUP_FILE)));
  });
});

test('the list carries the recorded archetype and the applied reading', async () => {
  await project(
    async (dir) => {
      const { out } = await run(dir, 'delete', scripted(['skip']));
      assert.match(out, /1\. Button\/Primary\s+button\s+applied/);
      assert.match(out, /2\. Card\/Basic\s+card\s+not applied/);
    },
    { system: setAppliedLines(SYSTEM, new Map([['Button/Primary', true], ['Card/Basic', false]])) },
  );

  // No flag at all prints nothing at all — absence is not `false` (§3.1).
  await project(async (dir) => {
    const { out } = await run(dir, 'delete', scripted(['skip']));
    assert.match(out, /1\. Button\/Primary\s+button$/m);
    assert.ok(!/applied/.test(out.split('Which component')[0]));
  });
});

// ---------------------------------------------------------------------------
// The in-use block (§4.2 step 3)
// ---------------------------------------------------------------------------

test('an `applied: true` component is refused, and there is no path past it', async () => {
  await project(
    async (dir) => {
      const before = snapshotContents(dir);
      const conversation = scripted(['Button/Primary'], { accept: true });
      const { out, code } = await run(dir, 'delete Button/Primary', conversation);

      // A refusal honoured is not an error.
      assert.equal(code, 0);
      assert.ok(out.includes('is in use in this codebase right now'));
      assert.ok(out.includes('applied: true'), 'the refusal names the evidence');
      assert.ok(out.includes('phyllum apply'), 'and the way out');
      assert.ok(out.includes('phyllum delete'), 'ending with the retry');

      // No gate was ever opened, and nothing was written.
      assert.deepEqual(conversation.gates, []);
      assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
        added: [],
        changed: [],
        removed: [],
      });
    },
    { system: setAppliedLines(SYSTEM, new Map([['Button/Primary', true]])) },
  );
});

test('a no-flag file triggers the live check, and the refusal names the sites', async () => {
  await project(
    async (dir) => {
      const before = snapshotContents(dir);
      const { out, code } = await run(dir, 'delete Button/Primary', scripted(['Button/Primary']));
      assert.equal(code, 0);
      assert.ok(out.includes('no `applied:` line is recorded, so the codebase was read now'));
      assert.ok(out.includes('ButtonPrimary'), 'the site itself is the evidence');
      assert.ok(out.includes('src/Toolbar.jsx'), 'and the file it is in');
      assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
        added: [],
        changed: [],
        removed: [],
      });
    },
    { files: { 'src/Toolbar.jsx': ADOPTED_JSX } },
  );
});

test('the block reads the flag when there is one, and the codebase only when there is not', async () => {
  await project(
    async (dir) => {
      const entry = (applied) => ({
        name: 'Button/Primary',
        applied,
        component: parse(read(dir)).components[0],
      });

      // `applied: false` is a reading, so it is honoured — the file is not
      // re-scanned behind the user's back.
      assert.deepEqual(inUseCheck(dir, entry(false)), { inUse: false, source: 'flag', sites: [] });
      assert.deepEqual(inUseCheck(dir, entry(true)), { inUse: true, source: 'flag', sites: [] });

      // Absence is not `false`: with no flag the codebase is read, and here it
      // says the component is in use.
      const live = inUseCheck(dir, entry(null));
      assert.equal(live.source, 'live');
      assert.equal(live.inUse, true);
      assert.ok(live.sites.length > 0);
    },
    { files: { 'src/Toolbar.jsx': ADOPTED_JSX } },
  );
});

// ---------------------------------------------------------------------------
// The two gates (§4.2 steps 4 and 5, §4.3)
// ---------------------------------------------------------------------------

test('nothing is written before the second confirmation', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    // The acceptance gate says yes; the typed name never arrives.
    const conversation = scripted(['Button/Primary', 'skip'], { accept: true });
    const { out, code } = await run(dir, 'delete', conversation);
    assert.equal(code, 0);
    assert.equal(conversation.gates.length, 1, 'the gate was passed');
    assert.ok(out.includes('nothing was written'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('a wrong name at the second confirmation writes nothing and says so', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await run(dir, 'delete Button/Primary', scripted(['Card/Basic']));
    assert.equal(code, 0);
    assert.ok(out.includes('That is not `Button/Primary`'), 'the miss is named');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });

  // A near miss is a miss: no prefix, no substring, no edit distance.
  await project(async (dir) => {
    const before = snapshotContents(dir);
    await run(dir, 'delete Button/Primary', scripted(['Button']));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });

  // The name itself passes, backticked or in another case — it is the *name*
  // being proved, not the typing.
  await project(async (dir) => {
    await run(dir, 'delete Button/Primary', scripted(['`button/primary`']));
    assert.ok(!read(dir).includes('### Button/Primary'));
  });
});

test('`--yes` does not pass the second confirmation, and neither does having nobody to ask', async () => {
  // `--yes` answers gates. It cannot answer a question whose answer is a name,
  // and a `y` typed at that question is a wrong name like any other.
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const { out } = await run(dir, 'delete Button/Primary', {
      ...scripted(['y']),
      yes: true,
    });
    assert.ok(out.includes('That is not `Button/Primary`'));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)).changed, []);
  });

  // And with nobody to ask at all, the run refuses at the top and says why.
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const { out, code } = await run(dir, 'delete Button/Primary --yes', {});
    assert.equal(code, 1);
    assert.ok(out.includes('type the component'), 'it says what it needed');
    assert.ok(out.includes('--yes'), 'and that the flag does not stand in for it');
    assert.ok(out.includes('phyllum delete <name>'), 'and prints the grammar');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

test('a skip at every depth writes nothing', async () => {
  for (const conversation of [
    scripted(['skip']), // at the pick
    scripted(['1'], { accept: false }), // at the acceptance gate
    scripted(['1', 'skip']), // at the second confirmation
  ]) {
    await project(async (dir) => {
      const before = snapshotContents(dir);
      const { code } = await run(dir, 'delete', conversation);
      assert.equal(code, 0);
      assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
        added: [],
        changed: [],
        removed: [],
      });
    });
  }
});

// ---------------------------------------------------------------------------
// The refusals and the dead ends (§4.4, §8)
// ---------------------------------------------------------------------------

test('`delete token` is refused with the reason, and asks nothing', async () => {
  await project(async (dir) => {
    const before = snapshotContents(dir);
    const conversation = scripted([]);
    const { out, code } = await run(dir, 'delete token', conversation);
    assert.equal(code, 0);
    assert.ok(out.includes('reserved and refused'));
    assert.ok(out.includes('ripples'), 'the reason is stated, not just the refusal');
    assert.deepEqual(conversation.asked, [], 'a refusal does not open a conversation');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });

  // Quoted, it is the word itself — and there is no component called that, so
  // the run lists and asks rather than refusing.
  await project(async (dir) => {
    const { out } = await run(dir, 'delete "token"', scripted(['skip']));
    assert.ok(!out.includes('reserved and refused'));
    assert.ok(out.includes('Components — 2 recorded:'));
  });
});

test('a system with no components points at `create` and ends cleanly', async () => {
  await project(
    async (dir) => {
      const before = snapshotContents(dir);
      const conversation = scripted([]);
      const { out, code } = await run(dir, 'delete', conversation);
      assert.equal(code, 0);
      assert.ok(out.includes('nothing to delete'));
      assert.ok(out.includes('phyllum create'));
      assert.deepEqual(conversation.asked, [], 'an empty system is not a question');
      assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
        added: [],
        changed: [],
        removed: [],
      });
    },
    { system: EMPTY },
  );
});

test('delete edits DESIGN-SYSTEM.md and leaves the PRD to `apply`, saying so', async () => {
  await project(
    async (dir) => {
      const prd = fs.readFileSync(path.join(dir, PRD_FILE), 'utf8');
      const { out } = await run(dir, 'delete Button/Primary', scripted(['Button/Primary']));
      assert.ok(out.includes(PRD_FILE), 'the report names the PRD');
      assert.ok(out.includes('next `phyllum apply`'), 'and says who cleans it up');
      assert.equal(fs.readFileSync(path.join(dir, PRD_FILE), 'utf8'), prd, 'and does not edit it');
    },
    { files: { [PRD_FILE]: '# PRD\n\n- AC-1.1 adopt Button/Primary\n' } },
  );

  // With no PRD there is nothing to warn about, so nothing is said.
  await project(async (dir) => {
    const { out } = await run(dir, 'delete Button/Primary', scripted(['Button/Primary']));
    assert.ok(!out.includes('next `phyllum apply`'));
  });
});

// ---------------------------------------------------------------------------
// The removal itself, in the raw text (§4.2 step 6)
// ---------------------------------------------------------------------------

test('a Backlog line naming another component is not this component’s to take', () => {
  const plan = planDelete(SYSTEM, 'Button/Primary');
  assert.equal(plan.backlog.length, 2);
  assert.ok(plan.backlog.every((line) => line.text.includes('Button/Primary')));

  // And a line naming both belongs to neither deletion alone.
  const shared = SYSTEM.replace(
    '- TODO: tokenise `4px` (Card/Basic radius)',
    '- TODO: align Button/Primary with Card/Basic',
  );
  assert.deepEqual(backlogFor(shared, 'Button/Primary', ['Button/Primary', 'Card/Basic']).length, 2);
  assert.deepEqual(backlogFor(shared, 'Card/Basic', ['Button/Primary', 'Card/Basic']), []);
});

test('the entry range is the whole entry, fenced blocks and all', () => {
  const ranges = componentRanges(SYSTEM);
  assert.deepEqual(ranges.map((range) => range.name), ['Button/Primary', 'Card/Basic']);

  const lines = SYSTEM.split('\n');
  assert.equal(lines[ranges[0].start].trim(), '### Button/Primary');
  // The four-backtick block holds a three-backtick block; the walk must not end
  // the entry on the inner fence.
  assert.ok(
    lines.slice(ranges[0].start, ranges[0].end).some((line) => line.includes('<ButtonPrimary>')),
    'the nested fence stayed inside the entry',
  );
  assert.equal(lines[ranges[1].start].trim(), '### Card/Basic');
});

test('removing the last component leaves the section’s note, not a bare heading', () => {
  const after = applyDelete(ONE_COMPONENT, planDelete(ONE_COMPONENT, 'Button/Primary'));
  const model = parse(after);
  assert.deepEqual(model.components, []);
  assert.deepEqual(model.backlog, []);
  assert.ok(after.includes('_No components yet.'), 'the empty-section note is back');
  assert.ok(after.includes('_Nothing outstanding._'), 'and so is the Backlog’s');
  assert.ok(after.includes('## Components') && after.includes('## Backlog'));
});
