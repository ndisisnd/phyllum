/**
 * Assertions for `version` (plan v0.2.0 §3, §7).
 *
 * Three promises are worth checking mechanically, because all three are easy to
 * break by accident:
 *
 *   1. The installed version is *read*, never written down. A hard-coded string
 *      would still print something plausible, so the check is that the number
 *      matches package.json and appears nowhere in the source.
 *   2. The registry is asked on `version` and nowhere else. That is checked both
 *      statically (who imports the client) and dynamically (a stubbed fetch that
 *      counts calls while every other command runs).
 *   3. Offline degrades, never crashes. Every failure mode of the request —
 *      refused, timed out, HTTP error, junk payload, no fetch at all — still
 *      prints the installed version and exits 0.
 *
 * No test here touches the network. Every request is a stub.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import {
  compareVersions,
  latestPublishedVersion,
  parseVersion,
  registryUrlFor,
} from '../../lib/npm-registry.js';
import { renderVersion, runVersion, statusFor } from '../../lib/version-command.js';
import { packageVersion } from '../../lib/template.js';
import { PACKAGE_ROOT, POPULATED_FIXTURE, readFixture, snapshotPaths, withTempDir } from './helpers.js';

const run = (line, ctx) => execute(tokenizeLine(line), ctx);
const manifestVersion = () =>
  JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;

/** A fetch that answers with one registry document, and counts its calls. */
function stubFetch(version, { calls = [] } = {}) {
  const impl = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ name: 'phyllum', version }) };
  };
  impl.calls = calls;
  return impl;
}

// ---------------------------------------------------------------------------
// The installed version
// ---------------------------------------------------------------------------

test('the installed version is read from package.json, not written into the code', async () => {
  const version = manifestVersion();
  assert.equal(packageVersion(), version);

  const { out } = await run('version', { fetch: stubFetch(version) });
  assert.ok(out.includes(version), 'the reported version is the manifest one');

  // Nothing in lib/ or bin/ may spell the version out: a literal would keep
  // printing the old number after a release.
  const offenders = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith('.js')) {
        const source = fs.readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        if (source.includes(`'${version}'`) || source.includes(`"${version}"`)) offenders.push(rel);
      }
    }
  };
  for (const dir of ['lib', 'bin']) walk(path.join(PACKAGE_ROOT, dir), dir);
  assert.deepEqual(offenders, [], `the version is hard-coded in ${offenders.join(', ')}`);
});

test('version works before init, and creates nothing', async () => {
  await withTempDir(async (dir) => {
    const { out, code } = await run('version', { cwd: dir, fetch: stubFetch(manifestVersion()) });
    assert.equal(code, 0);
    assert.ok(out.includes('installed'));
    assert.deepEqual(snapshotPaths(dir), [], 'version is about the install, not the project');
  });
});

// ---------------------------------------------------------------------------
// The three verdicts
// ---------------------------------------------------------------------------

test('an install that matches the registry is reported as up to date', async () => {
  const installed = manifestVersion();
  const result = await runVersion({ fetch: stubFetch(installed) });
  assert.equal(result.status, 'current');
  assert.equal(result.code, 0);
  assert.ok(result.out.includes('up to date'));
  assert.ok(result.out.includes(`installed         ${installed}`));
  assert.ok(result.out.includes(`latest published  ${installed}`));
  assert.ok(!result.out.includes('phyllum upgrade'), 'nothing to suggest when there is nothing to do');
});

test('an outdated install shows both versions and points at upgrade', async () => {
  const installed = manifestVersion();
  const result = await runVersion({ fetch: stubFetch('99.0.0') });
  assert.equal(result.status, 'outdated');
  assert.equal(result.code, 0, 'being behind is news, not a failure');
  assert.ok(result.out.includes(`installed         ${installed}`), 'the installed version is shown');
  assert.ok(result.out.includes('latest published  99.0.0'), 'and the published one');
  assert.ok(result.out.includes('`phyllum upgrade`'), 'and what to do about it');
});

test('an install ahead of the registry says so instead of suggesting an update', async () => {
  const result = await runVersion({ fetch: stubFetch('0.0.1') });
  assert.equal(result.status, 'ahead');
  assert.equal(result.code, 0);
  assert.ok(result.out.includes('ahead of what is published'));
  assert.ok(!result.out.includes('`phyllum upgrade`'));
});

test('statusFor compares versions rather than strings', () => {
  assert.equal(statusFor('0.2.0', '0.2.0'), 'current');
  assert.equal(statusFor('0.2.0', '0.10.0'), 'outdated', '10 is after 2, not before it');
  assert.equal(statusFor('0.10.0', '0.2.0'), 'ahead');
  assert.equal(statusFor('1.0.0-rc.1', '1.0.0'), 'outdated', 'a prerelease is behind its release');
  assert.equal(statusFor('1.0.0', '1.0.0-rc.1'), 'ahead');
  assert.equal(statusFor('0.2.0', null), 'unknown');
  assert.equal(statusFor('0.2.0', 'not-a-version'), 'unknown');
});

test('compareVersions and parseVersion are total: junk is null, never a guess', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.3', '1.2.4'), -1);
  assert.equal(compareVersions('1.3.0', '1.2.9'), 1);
  assert.equal(compareVersions('1.2.3', 'latest'), null);
  assert.equal(parseVersion('latest'), null);
  assert.equal(parseVersion('v1.2.3').minor, 2);
});

// ---------------------------------------------------------------------------
// Offline, and every other way the check can fail
// ---------------------------------------------------------------------------

test('an unreachable registry still reports the installed version, and exits 0', async () => {
  const installed = manifestVersion();
  const result = await runVersion({
    fetch: async () => {
      const error = new Error('getaddrinfo ENOTFOUND registry.npmjs.org');
      error.code = 'ENOTFOUND';
      throw error;
    },
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.code, 0, 'offline never blocks and never crashes');
  assert.ok(result.out.includes(`installed         ${installed}`));
  assert.ok(result.out.includes('latest published  unknown'));
  assert.ok(result.out.includes('could not be reached'));
  assert.ok(result.out.includes('Nothing is wrong with your install'));
});

test('a timeout is named as a timeout, not as an error', async () => {
  const result = await runVersion({
    timeoutMs: 1500,
    fetch: async () => {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    },
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.code, 0);
  assert.ok(result.out.includes('timed out'));
});

test('every other failure shape degrades the same way', async () => {
  const cases = [
    {
      id: 'http error',
      fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }),
      expect: 'answered with an error',
    },
    {
      id: 'not json',
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token <');
        },
      }),
      expect: 'something unexpected',
    },
    {
      id: 'no version field',
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ name: 'phyllum' }) }),
      expect: 'something unexpected',
    },
    // An explicit null is "this runtime has no fetch": the global default only
    // fills in for an absent argument, never for a stated one.
    { id: 'no fetch in this runtime', fetch: null, expect: 'has no fetch' },
  ];

  for (const testCase of cases) {
    const result = await runVersion({ fetch: testCase.fetch });
    assert.equal(result.status, 'unknown', `${testCase.id} should be unknown`);
    assert.equal(result.code, 0, `${testCase.id} should still exit 0`);
    assert.ok(result.out.includes(testCase.expect), `${testCase.id}: "${testCase.expect}" not in the output`);
  }
});

test('the client never throws, whatever the request does', async () => {
  for (const impl of [
    async () => {
      throw new Error('boom');
    },
    async () => null,
    async () => ({ ok: true, status: 200, json: async () => null }),
  ]) {
    const result = await latestPublishedVersion({ fetchImpl: impl });
    assert.equal(result.ok, false);
    assert.ok(typeof result.reason === 'string');
  }
});

// ---------------------------------------------------------------------------
// On demand only
// ---------------------------------------------------------------------------

test('the registry is asked for exactly one document, and told nothing else', async () => {
  const calls = [];
  const inits = [];
  await runVersion({
    fetch: async (url, init) => {
      calls.push(url);
      inits.push(init);
      return { ok: true, status: 200, json: async () => ({ version: '1.0.0' }) };
    },
  });
  assert.equal(calls.length, 1, 'one request per run');
  assert.equal(calls[0], registryUrlFor());
  assert.equal(calls[0], 'https://registry.npmjs.org/phyllum/latest');

  // Plain JSON, not npm's abbreviated media type: the registry answers 406 to
  // that one on the `/latest` endpoint. This is a regression guard for a bug
  // that only shows up against the real registry.
  assert.equal(inits[0].headers.accept, 'application/json');
  assert.ok(inits[0].signal, 'the request is bounded by a timeout');
  assert.deepEqual(Object.keys(inits[0].headers), ['accept'], 'nothing about the user is sent');
});

test('no other command touches the network', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));

    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ version: '0.0.0' }) };
    };
    try {
      // Every command that runs without a model, a server or a package manager.
      for (const line of ['menu', 'help', 'help version', 'system', 'system tokens', 'tokenise', 'kill']) {
        await run(line, { cwd: dir, yes: true });
      }
      assert.deepEqual(calls, [], `these commands must not check the registry: ${calls.join(', ')}`);

      // And `version` does, through the same global.
      await run('version', { cwd: dir, yes: true });
      assert.equal(calls.length, 1, 'version is the one command that asks');
    } finally {
      globalThis.fetch = original;
    }
  });
});

test('only the version command imports the registry client', () => {
  const importers = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith('.js')) {
        const source = fs.readFileSync(abs, 'utf8');
        if (/from\s+['"]\.\/npm-registry\.js['"]/.test(source)) importers.push(rel);
      }
    }
  };
  walk(path.join(PACKAGE_ROOT, 'lib'), 'lib');
  // `install-method.js` and `upgrade-command.js` take the package *name* from the
  // client; only `version-command.js` may make a request with it.
  assert.deepEqual(importers.sort(), [
    'lib/install-method.js',
    'lib/upgrade-command.js',
    'lib/version-command.js',
  ]);

  const requesters = [];
  for (const rel of importers) {
    const source = fs.readFileSync(path.join(PACKAGE_ROOT, rel), 'utf8');
    if (/latestPublishedVersion/.test(source)) requesters.push(rel);
  }
  assert.deepEqual(requesters, ['lib/version-command.js'], 'one command makes the request');
});

test('no help, menu or greeting hints at an available update', async () => {
  await withTempDir(async (dir) => {
    for (const line of ['menu', 'help', 'help phyllum', 'help version']) {
      const { out } = await run(line, { cwd: dir });
      assert.ok(!/newer version has been published/i.test(out), `${line} must not nag`);
      assert.ok(!/update available/i.test(out), `${line} must not nag`);
    }
  });
});

// ---------------------------------------------------------------------------
// The rendering itself
// ---------------------------------------------------------------------------

test('renderVersion always ends in one newline and always shows both rows', () => {
  for (const status of ['current', 'outdated', 'ahead', 'unknown']) {
    const out = renderVersion({
      installed: '1.0.0',
      latest: status === 'unknown' ? null : '2.0.0',
      status,
      check: { reason: 'offline' },
    });
    assert.ok(out.endsWith('\n'));
    assert.ok(!out.endsWith('\n\n'));
    assert.ok(out.includes('installed'));
    assert.ok(out.includes('latest published'));
    assert.ok(out.startsWith('phyllum 1.0.0 — '));
  }
});
