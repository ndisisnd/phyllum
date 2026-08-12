/**
 * Assertions for `help` and the argument grammar (plan §2.2, §8.5).
 *
 * The load-bearing promise is that the user never has to remember word order:
 * `help create` and `create help` must be byte-identical, not merely similar.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { DISPATCHABLE, COMMANDS } from '../../lib/registry.js';
import { OVERVIEW_LINES, renderCommandHelp } from '../../lib/help.js';
import { execute } from '../../lib/execute.js';
import { parseInvocation, tokenizeLine, tokensFromArgv } from '../../lib/parse-args.js';

const run = (line, ctx) => execute(tokenizeLine(line), ctx);

test('bare help is 2-3 lines plus a hint at per-command help', async () => {
  const { out, code } = await run('help');
  assert.equal(code, 0);
  const [body, hint] = out.trimEnd().split('\n\n');
  const bodyLines = body.split('\n');
  assert.ok(bodyLines.length >= 2 && bodyLines.length <= 3, `overview was ${bodyLines.length} lines`);
  assert.deepEqual(bodyLines, OVERVIEW_LINES);
  assert.ok(hint.includes('basal help [command]'));
  assert.ok(hint.includes('basal [command] help'));
  assert.ok(hint.includes('basal menu'));
});

test('`help <command>` and `<command> help` are byte-identical', async () => {
  for (const command of DISPATCHABLE) {
    const a = await run(`help ${command.name}`);
    const b = await run(`${command.name} help`);
    assert.equal(a.out, b.out, `word order changed the output for ${command.name}`);
    assert.equal(a.out, renderCommandHelp(command));
  }
});

test('aliases resolve to the same help page as their canonical name', async () => {
  for (const command of DISPATCHABLE) {
    for (const alias of command.aliases) {
      const viaAlias = await run(`help ${alias}`);
      const viaAliasSuffix = await run(`${alias} help`);
      const canonical = await run(`help ${command.name}`);
      assert.equal(viaAlias.out, canonical.out);
      assert.equal(viaAliasSuffix.out, canonical.out);
    }
  }
});

test('every command in the table has a help page naming its modes and an example', async () => {
  for (const command of COMMANDS) {
    const { out } = await run(`help ${command.name}`);
    assert.ok(out.startsWith(`basal ${command.name}`), `${command.name} help should lead with its name`);
    assert.ok(out.includes('Example'));
    assert.ok(out.includes(command.example));
    for (const mode of command.modes) assert.ok(out.includes(mode), `${command.name} help missing mode: ${mode}`);
    for (const alias of command.aliases) assert.ok(out.includes(alias));
  }
});

test('`help` is a reserved word in argument position', () => {
  const reserved = parseInvocation(tokenizeLine('create help'));
  assert.equal(reserved.kind, 'help-command');
  assert.equal(reserved.command.name, 'create');

  // Quoted, it is the literal word — prose input for create, not a help request.
  const quoted = parseInvocation(tokenizeLine('create "help"'));
  assert.equal(quoted.kind, 'command');
  assert.equal(quoted.command.name, 'create');
  assert.deepEqual(quoted.args, [{ value: 'help', quoted: true }]);
});

test('a shell strips quotes, so argv `create help` is a help request', () => {
  const invocation = parseInvocation(tokensFromArgv(['create', 'help']));
  assert.equal(invocation.kind, 'help-command');
  assert.equal(invocation.command.name, 'create');
});

test('help on an unknown command suggests the menu and exits cleanly', async () => {
  const { out, code } = await run('help wibble');
  assert.equal(code, 0);
  assert.ok(out.includes('no command called "wibble"'));
  assert.ok(out.includes('basal menu'));
});

test('an unknown command suggests the menu and exits cleanly', async () => {
  const { out, code } = await run('wibble');
  assert.equal(code, 0);
  assert.ok(out.includes('no command called "wibble"'));
  assert.ok(out.includes('basal menu'));
});

test('help pages for unbuilt commands say which milestone they land in', async () => {
  for (const command of COMMANDS.filter((c) => c.milestone !== 'M1')) {
    const { out } = await run(`help ${command.name}`);
    assert.ok(out.includes(command.milestone), `${command.name} help should name its milestone`);
  }
});
