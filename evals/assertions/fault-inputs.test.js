/**
 * The malformed-input sweep (v0.2.0 M8 hardening).
 *
 * `fault-injection.test.js` sweeps one axis: **a write was interrupted**. This
 * file sweeps the other one — **the input was already broken before Phyllum got
 * there** — because the two fail in different places and only the first had a
 * sweep of its own.
 *
 * Everything Phyllum reads on the way to doing something is somebody else's file,
 * and any of them can be a directory, empty, truncated, hand-edited, full of NUL
 * bytes, or unreadable. The bar for every case here is the same three-part one the
 * v0.1.0 sweep set: **no stack trace**, **a message that names the file and what
 * to do**, and **nothing written**. A raw `EACCES` reaching a user is a bug even
 * when the underlying operation was always going to fail.
 *
 * Read-permission cases are skipped when the suite runs as root, because root can
 * read a mode-000 file and the case would prove nothing.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { designSystemReadError, executeArgv } from '../../lib/execute.js';
import { configProblem, readApplyConfig } from '../../lib/apply-config.js';
import { MAX_SOURCE_BYTES, MAX_TEXT_BYTES, readTextFile } from '../../lib/scan-text.js';
import { scanCandidates } from '../../lib/candidates.js';
import { assessValues } from '../../lib/assess.js';
import { emptyModel } from '../../lib/design-system.js';
import { PRD_FILE, STATE_DIR } from '../../lib/write.js';
import { POPULATED_FIXTURE, readFixture, snapshotContents, diffSnapshots, withTempDir } from './helpers.js';

/** Root reads anything, so a permissions case would pass for the wrong reason. */
const AS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

/** Every command that reads DESIGN-SYSTEM.md before it does anything. */
const READS_DESIGN_SYSTEM = ['system', 'create', 'tokenise', 'assess', 'apply', 'gui'];

const ctx = (dir, extra = {}) => ({ cwd: dir, today: '2026-08-13', home: '/nonexistent', env: { PATH: '' }, ...extra });

// ---------------------------------------------------------------------------
// DESIGN-SYSTEM.md: it exists, and it still cannot be read
// ---------------------------------------------------------------------------

test('a DESIGN-SYSTEM.md that is a directory is a message, not an EISDIR trace', async () => {
  for (const command of READS_DESIGN_SYSTEM) {
    await withTempDir(async (dir) => {
      // The gate upstream of every one of these commands asks `existsSync`, which
      // a directory of the same name satisfies. The read is the real question.
      fs.mkdirSync(path.join(dir, 'DESIGN-SYSTEM.md'));
      const before = snapshotContents(dir);

      const result = await executeArgv([command], ctx(dir));

      assert.match(result.out, /is a directory here, not a file/, `${command} should name the problem`);
      assert.match(result.out, /Nothing was written/, `${command} should say it wrote nothing`);
      assert.equal(result.code, 1, `${command} should exit non-zero — this is not a normal outcome`);
      assert.ok(!/EISDIR|at Object\.|at Module\./.test(result.out), `${command} leaked an error object`);
      assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
    });
  }
});

test('a DESIGN-SYSTEM.md this user cannot read is a message, not an EACCES trace', async (t) => {
  if (AS_ROOT) return t.skip('running as root: a mode-000 file is still readable');
  for (const command of READS_DESIGN_SYSTEM) {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'DESIGN-SYSTEM.md');
      fs.writeFileSync(file, readFixture(POPULATED_FIXTURE));
      fs.chmodSync(file, 0o000);
      try {
        const result = await executeArgv([command], ctx(dir));
        assert.match(result.out, /cannot read it \(EACCES\)|could not be read/, `${command} should name the problem`);
        assert.match(result.out, /Nothing was written/);
        assert.equal(result.code, 1);
        assert.ok(!/at Object\.|at Module\./.test(result.out), `${command} leaked a stack trace`);
      } finally {
        fs.chmodSync(file, 0o600);
      }
    });
  }
});

test('the readability check is the read itself, so it cannot disagree with it', async () => {
  await withTempDir(async (dir) => {
    assert.notEqual(designSystemReadError(dir), null, 'a missing file is not readable');
    fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
    assert.equal(designSystemReadError(dir), null);
    fs.rmSync(path.join(dir, 'DESIGN-SYSTEM.md'));
    fs.mkdirSync(path.join(dir, 'DESIGN-SYSTEM.md'));
    assert.equal(designSystemReadError(dir), 'EISDIR');
  });
});

// ---------------------------------------------------------------------------
// .phyllum/PRD.md: hand-edited, and unreadable
// ---------------------------------------------------------------------------

/** A project `apply` can plan against: one stylesheet and a matching token. */
function planningProject(dir) {
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'styles.css'), '.btn { background: #2563EB; }\n');
  fs.writeFileSync(
    path.join(dir, 'DESIGN-SYSTEM.md'),
    readFixture(POPULATED_FIXTURE).replace(/^\| color-/m, '| color-primary | #2563EB | brand |\n| color-'),
  );
}

test('a PRD that cannot be read stops apply run with a message, not a trace', async (t) => {
  if (AS_ROOT) return t.skip('running as root: a mode-000 file is still readable');
  await withTempDir(async (dir) => {
    planningProject(dir);
    await executeArgv(['apply'], ctx(dir));
    const prd = path.join(dir, PRD_FILE);
    assert.ok(fs.existsSync(prd), 'the plan was generated');
    fs.chmodSync(prd, 0o000);
    try {
      // `existsSync` says yes and the read says no. Before M8 this threw EACCES
      // out of `runApplyRun`; now an unreadable plan is treated the way a missing
      // one is, which is the same answer `apply` itself already gave.
      const result = await executeArgv(['apply', 'run'], ctx(dir));
      assert.equal(result.code, 0);
      assert.ok(!/at Object\.|at Module\.|EACCES/.test(result.out), 'no stack trace, no raw errno');
      assert.match(result.out, /phyllum apply/, 'and it still says something useful');
    } finally {
      fs.chmodSync(prd, 0o600);
    }
  });
});

test('a PRD that is a directory stops apply run with a message, not a trace', async () => {
  await withTempDir(async (dir) => {
    planningProject(dir);
    fs.mkdirSync(path.join(dir, STATE_DIR), { recursive: true });
    fs.mkdirSync(path.join(dir, PRD_FILE));
    const result = await executeArgv(['apply', 'run'], ctx(dir));
    assert.equal(result.code, 0);
    assert.ok(!/EISDIR|at Object\.|at Module\./.test(result.out));
  });
});

test('a PRD stripped of its phases is an empty plan, not a crash', async () => {
  await withTempDir(async (dir) => {
    planningProject(dir);
    await executeArgv(['apply'], ctx(dir));
    const prd = path.join(dir, PRD_FILE);
    const text = fs.readFileSync(prd, 'utf8');
    // A hand-edit that deletes the section the runner iterates.
    fs.writeFileSync(prd, text.split('## Phases')[0]);

    const result = await executeArgv(['apply', 'run'], ctx(dir));
    assert.equal(result.code, 0);
    assert.ok(!/at Object\.|at Module\./.test(result.out), 'no stack trace');
    assert.match(result.out, /has no phases, so there is nothing to execute/);
    assert.match(result.out, /`phyllum apply`/, 'and it names the command that fixes it');
  });
});

test('a PRD that is not a PRD at all is regenerated rather than executed', async () => {
  await withTempDir(async (dir) => {
    planningProject(dir);
    fs.mkdirSync(path.join(dir, STATE_DIR), { recursive: true });
    fs.writeFileSync(path.join(dir, PRD_FILE), 'hand-written notes, no plan here\n');
    const result = await executeArgv(['apply', 'run'], ctx(dir));
    assert.equal(result.code, 0);
    assert.ok(!/at Object\.|at Module\./.test(result.out));
  });
});

// ---------------------------------------------------------------------------
// .phyllum/config.json: the one file a user hand-writes
// ---------------------------------------------------------------------------

test('every way of breaking config.json is ignored out loud, never in silence', async () => {
  const broken = [
    ['not JSON at all', '{ "apply": '],
    ['empty', ''],
    ['whitespace only', '   \n  '],
    ['a JSON array', '[1, 2, 3]'],
    ['a JSON string', '"claude-fable-5"'],
    ['JSON null', 'null'],
    ['a number', '42'],
  ];

  for (const [why, contents] of broken) {
    await withTempDir(async (dir) => {
      fs.mkdirSync(path.join(dir, STATE_DIR), { recursive: true });
      fs.writeFileSync(path.join(dir, STATE_DIR, 'config.json'), contents);

      const config = readApplyConfig(dir);
      // Defaults still apply — a typo in a settings file must not stop a run.
      assert.equal(config.orchestratorModel, 'claude-fable-5', why);
      assert.equal(config.agentModel, 'claude-opus-4-8', why);
      // But it is *said*. The module's own promise is that a silently ignored
      // setting is worse than a rejected one, and a whole unusable file is the
      // biggest version of that mistake, not an exemption from it.
      assert.ok(config.ignored.length > 0, `${why}: the file was discarded silently`);
      assert.match(config.ignored[0], /config\.json/, why);
      assert.notEqual(configProblem(dir), null, why);
    });
  }
});

test('a config.json that is a directory is reported, not thrown', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, STATE_DIR, 'config.json'), { recursive: true });
    const config = readApplyConfig(dir);
    assert.equal(config.orchestratorModel, 'claude-fable-5');
    assert.ok(config.ignored.some((line) => /could not be read/.test(line)));
  });
});

test('a valid config.json is not reported as a problem', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, STATE_DIR), { recursive: true });
    fs.writeFileSync(
      path.join(dir, STATE_DIR, 'config.json'),
      JSON.stringify({ apply: { orchestratorModel: 'claude-fable-5' } }),
    );
    assert.equal(configProblem(dir), null);
    assert.deepEqual(readApplyConfig(dir).ignored, []);
  });
});

test('no config.json at all is silence, because there is nothing to report', async () => {
  await withTempDir(async (dir) => {
    assert.equal(configProblem(dir), null);
    assert.deepEqual(readApplyConfig(dir).ignored, []);
  });
});

// ---------------------------------------------------------------------------
// The scan: binary, oversized, and unreadable files
// ---------------------------------------------------------------------------

test('a file with NUL bytes is skipped rather than scanned as mojibake', async () => {
  await withTempDir(async (dir) => {
    const binary = path.join(dir, 'theme.css');
    fs.writeFileSync(binary, Buffer.concat([Buffer.from('.btn { color: #2563EB; }\n'), Buffer.from([0, 0, 0])]));
    assert.equal(readTextFile(binary), null, 'a NUL byte near the start means "not text"');
  });
});

test('the values pass and the component pass agree about binary files', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    // A .jsx with NUL bytes. Before M8 the component pass read this with a bare
    // readFileSync and matched element names out of the garbage.
    fs.writeFileSync(
      path.join(dir, 'src', 'Broken.jsx'),
      Buffer.concat([Buffer.from([0, 0]), Buffer.from('<Button className="btn">x</Button>\n')]),
    );
    fs.writeFileSync(path.join(dir, 'src', 'Fine.jsx'), '<Button className="btn">x</Button>\n');

    const candidates = scanCandidates(dir, emptyModel());
    const files = candidates.flatMap((candidate) => candidate.files ?? []);
    assert.ok(!files.some((rel) => /Broken\.jsx/.test(rel)), 'the binary file must not be scanned');
  });
});

test('an oversized file is skipped, and the cap is finite for both passes', async () => {
  assert.ok(Number.isFinite(MAX_TEXT_BYTES));
  // The looser cap is the point: files Phyllum came to read are not uncapped, so
  // a scan's memory is bounded by Phyllum rather than by the user's repository.
  assert.ok(Number.isFinite(MAX_SOURCE_BYTES), 'a source read must not be uncapped');
  assert.ok(MAX_SOURCE_BYTES > MAX_TEXT_BYTES);

  await withTempDir(async (dir) => {
    const big = path.join(dir, 'huge.css');
    fs.writeFileSync(big, `/* ${'x'.repeat(MAX_TEXT_BYTES + 64)} */\n`);
    assert.equal(readTextFile(big), null, 'past the tight cap, as a data file');
    assert.notEqual(readTextFile(big, { maxBytes: MAX_SOURCE_BYTES }), null, 'inside the loose one');
  });
});

test('an unreadable file mid-scan does not stop the scan or crash it', async (t) => {
  if (AS_ROOT) return t.skip('running as root: a mode-000 file is still readable');
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'readable.css'), '.a { color: #2563EB; }\n.b { color: #2563EB; }\n');
    const locked = path.join(dir, 'src', 'locked.css');
    fs.writeFileSync(locked, '.c { color: #FF0000; }\n');
    fs.chmodSync(locked, 0o000);
    try {
      const result = assessValues(dir, emptyModel());
      // The readable file's values are still found — one bad file is skipped, not
      // fatal, and the scan does not silently report zero.
      assert.ok(result.proposals.length > 0, 'the scan continued past the unreadable file');
      assert.equal(readTextFile(locked), null);
    } finally {
      fs.chmodSync(locked, 0o600);
    }
  });
});

test('a broken symlink in the tree is skipped rather than followed into an error', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'real.css'), '.a { color: #2563EB; }\n.b { color: #2563EB; }\n');
    fs.symlinkSync(path.join(dir, 'src', 'gone.css'), path.join(dir, 'src', 'dangling.css'));
    const result = assessValues(dir, emptyModel());
    assert.ok(result.proposals.length > 0, 'the real file was still scanned');
  });
});

test('a directory symlinked to its own parent does not send the scan round forever', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'a.css'), '.a { color: #2563EB; }\n.b { color: #2563EB; }\n');
    // The walk keeps no visited set, so termination rests on `readdirSync`'s
    // `withFileTypes` reporting a symlinked directory as a *symlink* rather than a
    // directory — which means it is never recursed into. That is load-bearing and
    // invisible, so it is pinned here rather than left as a property nobody checks.
    fs.symlinkSync(path.join(dir, 'src'), path.join(dir, 'src', 'self'));
    const started = Date.now();
    const result = assessValues(dir, emptyModel());
    assert.ok(result.proposals.length > 0, 'the real file was still scanned');
    assert.ok(Date.now() - started < 5000, 'and the scan terminated promptly');
  });
});
