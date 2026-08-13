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
import { ASSESS_SPEC_FILE, SPEC_FILE, parseSpec } from '../../lib/tokenise-spec.js';
import { renderSpecNotices } from '../../lib/assess-report.js';
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

// ---------------------------------------------------------------------------
// `assess --json`'s target: hostile before Phyllum got there (v0.2.1 M6)
// ---------------------------------------------------------------------------

/**
 * The flag writes one file, and everything that can already be sitting at that
 * path is somebody else's decision. The bar is the same three parts the rest of
 * this file holds to — no stack trace, a message naming the file and what to do,
 * nothing written — plus a fourth the JSON path adds: **exit honestly**, because
 * the reader of a `--json` run is usually a script that only checks the code.
 */

/** A small project with enough drift for the assessment to have something to say. */
function drifted(dir) {
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'src', 'styles.css'),
    '.a { color: #123456; }\n.b { color: #123456; }\n.c { color: #123456; }\n',
  );
  fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), readFixture(POPULATED_FIXTURE));
}

test('a directory sitting where the JSON file goes is named, not thrown', async () => {
  await withTempDir(async (dir) => {
    drifted(dir);
    fs.mkdirSync(path.join(dir, STATE_DIR), { recursive: true });
    fs.mkdirSync(path.join(dir, STATE_DIR, 'assess.json'));
    const before = snapshotContents(dir);

    const result = await executeArgv(['assess', '--json'], ctx(dir));

    assert.equal(result.code, 1, 'a run that wrote nothing must not report success');
    assert.match(result.out, /already a directory at \.phyllum\/assess\.json/);
    assert.match(result.out, /Nothing was written/);
    assert.ok(!/EISDIR|at Object\.|at Module\./.test(result.out), 'no raw errno, no stack trace');
    // And nothing about Phyllum's own temp file, which is an implementation
    // detail of the atomic write and not a path the user has ever seen.
    assert.ok(!/phyllum-tmp-/.test(result.out), 'the temp file is not the user’s problem');
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
  });
});

test('a JSON target this user cannot write is named, not thrown', async (t) => {
  if (AS_ROOT) return t.skip('running as root: a mode-500 directory is still writable');
  await withTempDir(async (dir) => {
    drifted(dir);
    fs.mkdirSync(path.join(dir, STATE_DIR), { recursive: true });
    fs.chmodSync(path.join(dir, STATE_DIR), 0o500);
    try {
      const result = await executeArgv(['assess', '--json'], ctx(dir));
      assert.equal(result.code, 1);
      assert.match(result.out, /cannot write to \.phyllum\/assess\.json \(EACCES\)/);
      assert.ok(!/at Object\.|at Module\./.test(result.out));
      assert.ok(!/phyllum-tmp-/.test(result.out));
    } finally {
      fs.chmodSync(path.join(dir, STATE_DIR), 0o700);
    }
  });
});

test('a refused JSON path is told which lock closed, not the whole rulebook', async () => {
  await withTempDir(async (dir) => {
    drifted(dir);
    const cases = [
      ['report.txt', /does not end in `\.json`/],
      ['../outside.json', /resolves outside it/],
      ['.git/config.json', /never writes inside `\.git\/`/],
      ['DESIGN-SYSTEM.md', /never writes DESIGN-SYSTEM\.md/],
    ];
    for (const [target, reason] of cases) {
      const before = snapshotContents(dir);
      const result = await executeArgv(['assess', '--json', target], ctx(dir));
      assert.equal(result.code, 1, target);
      assert.match(result.out, reason, target);
      assert.ok(!/during init only/.test(result.out), `${target}: not the rule it did not break`);
      assert.deepEqual(
        diffSnapshots(before, snapshotContents(dir)),
        { added: [], changed: [], removed: [] },
        target,
      );
    }
  });
});

test('`assess --json DESIGN-SYSTEM.md` cannot destroy the design system', async () => {
  await withTempDir(async (dir) => {
    drifted(dir);
    const original = readFixture(POPULATED_FIXTURE);
    const before = snapshotContents(dir);

    // The bug M6 found, pinned by name. `--json` is a read-only command, and
    // the permission model checked its general rules first — so this path
    // matched "Phyllum may write DESIGN-SYSTEM.md", overwrote the user's design
    // system with the JSON assessment *of* it, and exited 0.
    const result = await executeArgv(['assess', '--json', 'DESIGN-SYSTEM.md'], ctx(dir));

    assert.equal(result.code, 1);
    assert.equal(
      fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'),
      original,
      'the design system is byte-identical',
    );
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
  });
});

test('a hostile file already at the target is replaced whole, never merged into', async () => {
  await withTempDir(async (dir) => {
    drifted(dir);
    fs.mkdirSync(path.join(dir, STATE_DIR), { recursive: true });
    const target = path.join(dir, STATE_DIR, 'assess.json');
    // Truncated JSON from a killed run, and a NUL byte for good measure: the
    // write must not read what is there, only overwrite it.
    fs.writeFileSync(
      target,
      Buffer.concat([Buffer.from('{"schemaVersion":1,"sco'), Buffer.from([0])]),
    );

    const result = await executeArgv(['assess', '--json'], ctx(dir));

    assert.equal(result.code, 0, 'a broken previous file is not a reason to refuse');
    const bytes = fs.readFileSync(target);
    assert.doesNotThrow(() => JSON.parse(bytes.toString('utf8')), 'what is there afterwards is whole JSON');
    assert.equal(bytes.includes(0), false, 'and none of the old bytes survived');
  });
});

// ---------------------------------------------------------------------------
// The spec tables: hostile rows in the contract itself (v0.2.1 M6)
// ---------------------------------------------------------------------------

/**
 * `refs/assess.md` is installed into a project's `.claude/skills/`, and tuning
 * a severity or moving a similarity band is the thing those tables exist for.
 * So a hand-edited table is an expected input, and a *broken* hand-edited table
 * is an expected malformed input — which before M6 took the whole CLI down with
 * an uncaught `"…" is not a comparison a table cell can hold`.
 *
 * The sweep feeds `parseSpec` a doctored copy of the real reference files
 * rather than overwriting the ones the package ships: a test that edits
 * `skill/refs/assess.md` in place is one crash away from leaving the repository
 * itself broken, which is a worse failure than the one being tested for.
 */

const specText = () => fs.readFileSync(SPEC_FILE, 'utf8');
const assessSpecText = () => fs.readFileSync(ASSESS_SPEC_FILE, 'utf8');

/** Replace the first data row under `marker` with one of your own. */
function withRow(text, marker, row) {
  const at = text.indexOf(marker);
  assert.notEqual(at, -1, `the fixture needs the ${marker} table`);
  const head = text.slice(0, at);
  const lines = text.slice(at).split('\n');
  let seen = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trim().startsWith('|')) continue;
    seen += 1;
    if (seen < 3) continue; // the header, the separator, then the first data row
    lines[i] = row;
    break;
  }
  return head + lines.join('\n');
}

/** One hostile row per new table, and the key its surviving rows land in. */
const HOSTILE = [
  ['<!-- phyllum:severity -->', '| `error` | not a number at all |', 'severities'],
  ['<!-- phyllum:lint-rules -->', '|  | `colours` | `radius` |', 'lintRules'],
  ['<!-- phyllum:hygiene-rules -->', '|  | `error` |', 'hygieneRules'],
  ['<!-- phyllum:similarity-rules -->', '| `clone` |  |', 'similarityRules'],
  [
    '<!-- phyllum:similarity-bands -->',
    '| `clone` | somewhere near 0.8 | `error` |',
    'similarityBands',
  ],
  ['<!-- phyllum:naming-rules -->', '|  | `warn` |', 'namingRules'],
  ['<!-- phyllum:prop-rules -->', '|  | `warn` | `id` |', 'propRules'],
  ['<!-- phyllum:extra-rules -->', '|  | `warn` |', 'extraRules'],
  ['<!-- phyllum:score-steps -->', '| twenty-one | `>= 40` | untamed |', 'scoreSteps'],
];

for (const [marker, row, key] of HOSTILE) {
  const name = marker.replace(/<!--\s*|\s*-->/g, '');
  test(`a hostile row in ${name} is dropped, and said out loud`, () => {
    const clean = parseSpec(specText(), assessSpecText());
    const broken = parseSpec(specText(), withRow(assessSpecText(), marker, row));

    assert.deepEqual(clean.ignored, [], 'the shipped tables have nothing to report');
    assert.equal(broken.ignored.length, 1, `${name}: exactly the one bad row`);
    assert.match(broken.ignored[0], new RegExp(name), 'the notice names the table');
    assert.match(broken.ignored[0], /ignored an unreadable row/);

    // The rest of the table still works. A contract with one typo in it is
    // still a contract, and refusing all of it would be the larger failure.
    const count = (value) => (Array.isArray(value) ? value.length : Object.keys(value).length);
    assert.equal(count(broken[key]), count(clean[key]) - 1, `${name}: one row fewer, not zero rows`);
  });
}

test('a hostile row never reaches a user as a stack trace', async () => {
  await withTempDir(async (dir) => {
    drifted(dir);
    // The real files, unedited — this is the regression guard for the shape of
    // the failure rather than for one row: every command reads the spec, so a
    // throwing reader was a throwing CLI.
    const result = await executeArgv(['assess'], ctx(dir));
    assert.ok(!/is not a comparison a table cell can hold/.test(result.out));
    assert.ok(!/at Object\.|at Module\./.test(result.out));
  });
});

test('the notice reads as a sentence, and says the assessment ran anyway', () => {
  assert.deepEqual(renderSpecNotices([]), [], 'silence when there is nothing to say');
  const lines = renderSpecNotices(['phyllum:severity: ignored an unreadable row (…) — why']);
  assert.match(lines[0], /One rule was skipped/);
  assert.match(lines[0], /ran without them/, 'the finding is still trustworthy, minus that rule');
  assert.match(lines.at(-1), /refs\/assess\.md/, 'and it names the file to fix');
  assert.match(renderSpecNotices(['a', 'b'])[0], /2 rules were skipped/);
});
