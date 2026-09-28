/**
 * The prompt relay's far end (`lib/relay.js`): the queue the dashboard fills is
 * drained into the Claude Code session, by two hooks and a background watcher.
 *
 * Before this module a prompt queued on the page — the Backlog's Assess button
 * above all — was never read back, so every click sat in `.phyllum/session.json`
 * for good. These assertions pin the drain, the hook output Claude Code reads,
 * and the settings merge that installs the hooks.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  RELAY_MARKER,
  RELAY_SCRIPT,
  hookCommand,
  installRelayHook,
  relayHookInstalled,
  renderRelay,
  runHook,
  takeQueuedPrompts,
  waitForPrompts,
} from '../../lib/relay.js';
import { readState } from '../../lib/state.js';
import { CLAUDE_SETTINGS_FILE, isAllowedPath } from '../../lib/write.js';
import { withTempDir } from './helpers.js';

const run = promisify(execFile);

const prompt = (id, text) => ({ id, kind: 'prompt', text, view: 'library', source: 'gui', status: 'pending', at: 'x' });
const image = { id: 'img', kind: 'create-image', file: '.phyllum/uploads/a.png', status: 'pending' };

function seedQueue(dir, queue, extra = {}) {
  fs.mkdirSync(path.join(dir, '.phyllum'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.phyllum', 'session.json'), JSON.stringify({ version: 1, queue, ...extra }));
}

const settingsOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, CLAUDE_SETTINGS_FILE), 'utf8'));

test('the drain takes dashboard prompts, collapses repeats, and leaves image uploads for create', async () => {
  await withTempDir(async (dir) => {
    seedQueue(dir, [prompt('a', 'assess'), image, prompt('b', 'assess'), prompt('c', 'make the radius 8px')]);

    const taken = takeQueuedPrompts(dir);
    assert.deepEqual(
      taken.map((entry) => entry.text),
      ['assess', 'make the radius 8px'],
      'three Assess clicks are one assessment, and order is kept',
    );
    assert.deepEqual(readState(dir).queue, [image], 'the upload stays for `create` to pick up');
    assert.deepEqual(takeQueuedPrompts(dir), [], 'a prompt is handed over once');
  });
});

test('the UserPromptSubmit hook hands pending prompts over as context, and is silent otherwise', async () => {
  await withTempDir(async (dir) => {
    assert.equal(runHook('prompt', {}, { CLAUDE_PROJECT_DIR: dir }), '');

    seedQueue(dir, [prompt('a', 'assess')]);
    const out = JSON.parse(runHook('prompt', {}, { CLAUDE_PROJECT_DIR: dir }));
    assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.ok(out.hookSpecificOutput.additionalContext.includes('- assess'));
    assert.deepEqual(readState(dir).queue, []);
  });
});

test('the Stop hook keeps Claude going when a prompt is waiting, and reads the root from the hook input', async () => {
  await withTempDir(async (dir) => {
    seedQueue(dir, [prompt('a', 'assess')]);
    const out = JSON.parse(runHook('stop', { cwd: dir }, {}));
    assert.equal(out.decision, 'block');
    assert.equal(out.reason, renderRelay([prompt('a', 'assess')]));
    // Drained, so the next stop is allowed: the hook cannot loop.
    assert.equal(runHook('stop', { cwd: dir }, {}), '');
  });
});

test('the hook script runs as Claude Code runs it: JSON on stdin, JSON on stdout', async () => {
  await withTempDir(async (dir) => {
    seedQueue(dir, [prompt('a', 'assess')]);
    const child = run(process.execPath, [RELAY_SCRIPT, 'prompt'], { env: { ...process.env, CLAUDE_PROJECT_DIR: '' } });
    child.child.stdin.end(JSON.stringify({ cwd: dir, hook_event_name: 'UserPromptSubmit' }));
    const { stdout } = await child;
    assert.ok(JSON.parse(stdout).hookSpecificOutput.additionalContext.includes('assess'));
  });
});

test('installing the hooks merges into the settings, once, and replaces a stale copy', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    const theirs = { type: 'command', command: 'echo theirs' };
    const stale = { type: 'command', command: `node "/old/phyllum/lib/relay.js" prompt ${RELAY_MARKER}` };
    fs.writeFileSync(
      path.join(dir, CLAUDE_SETTINGS_FILE),
      JSON.stringify({ env: { KEEP: '1' }, hooks: { UserPromptSubmit: [{ hooks: [theirs] }, { hooks: [stale] }] } }),
    );
    assert.equal(relayHookInstalled(dir), false);

    assert.equal(installRelayHook(dir).status, 'installed');
    const settings = settingsOf(dir);
    assert.deepEqual(settings.env, { KEEP: '1' }, 'every other setting survives');
    const commands = (event) => settings.hooks[event].flatMap((group) => group.hooks.map((hook) => hook.command));
    assert.deepEqual(commands('UserPromptSubmit'), ['echo theirs', hookCommand('prompt')]);
    assert.deepEqual(commands('Stop'), [hookCommand('stop')]);

    assert.equal(installRelayHook(dir).status, 'already');
    assert.deepEqual(settingsOf(dir), settings, 'a second install changes nothing');
  });
});

test('a settings file that is not JSON is left exactly as it is', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, CLAUDE_SETTINGS_FILE), '{ not json');
    assert.equal(installRelayHook(dir).status, 'unreadable');
    assert.equal(fs.readFileSync(path.join(dir, CLAUDE_SETTINGS_FILE), 'utf8'), '{ not json');
  });
});

test('the settings file is one init-only name, and the shared settings stay off the list', () => {
  assert.ok(isAllowedPath('.claude/settings.local.json', { init: true }));
  assert.ok(!isAllowedPath('.claude/settings.local.json'));
  assert.ok(!isAllowedPath('.claude/settings.json', { init: true }));
});

test('the watcher returns the next prompt, and stops once the dashboard has', async () => {
  await withTempDir(async (dir) => {
    seedQueue(dir, []);
    assert.equal(await waitForPrompts(dir, { intervalMs: 1, running: () => false }), null);

    let polls = 0;
    const arriving = waitForPrompts(dir, {
      intervalMs: 1,
      running: () => {
        polls += 1;
        if (polls === 3) seedQueue(dir, [prompt('a', 'assess')]);
        return true;
      },
    });
    assert.deepEqual((await arriving).map((entry) => entry.text), ['assess']);
  });
});
