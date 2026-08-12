/**
 * Assertions for `menu` (plan §2.2, §8.5).
 *
 * The menu is generated from the command table, so these checks are really
 * asking: does the table still describe what the user is told exists?
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMANDS } from '../../lib/registry.js';
import { renderMenu } from '../../lib/menu.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';

const run = (line, ctx) => execute(tokenizeLine(line), ctx);

test('menu lists every subskill exactly once, one line per command', () => {
  const lines = renderMenu().split('\n');
  const width = Math.max(...COMMANDS.map((c) => c.invocation.length));
  // Each command line is "  <invocation padded>  <summary>"; compare the first
  // column so that `basal` does not match `basal menu` and friends.
  const invocations = lines
    .filter((line) => line.startsWith('  basal'))
    .map((line) => line.slice(2, 2 + width).trim());

  for (const command of COMMANDS) {
    const matches = invocations.filter((word) => word === command.invocation);
    assert.equal(matches.length, 1, `${command.invocation} should appear on exactly one line`);
  }
  assert.equal(invocations.length, COMMANDS.length);
});

test('menu includes every alias from the command table', () => {
  const out = renderMenu();
  for (const command of COMMANDS) {
    for (const alias of command.aliases) {
      assert.ok(out.includes(`alias: ${alias}`) || out.includes(`, ${alias}`), `alias ${alias} missing from menu`);
    }
  }
});

test('menu is a pointer: one line per command plus a header and a hint', () => {
  const lines = renderMenu().trimEnd().split('\n');
  const commandLines = lines.filter((line) => line.startsWith('  basal'));
  assert.equal(commandLines.length, COMMANDS.length);
  assert.ok(lines.at(-1).includes('basal help [command]'));
});

test('`basal menu` prints the menu and exits cleanly', async () => {
  const result = await run('menu');
  assert.equal(result.code, 0);
  assert.equal(result.out, renderMenu());
});
