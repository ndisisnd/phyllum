/**
 * Assertions for the package layout and the skill definition (plan §7.2, §8.5).
 *
 * The skill is the intelligence half of Phyllum, so the checks here are about the
 * promises it makes in writing: the permission rule, the command table, and a
 * reference file for every subskill.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { COMMANDS, DISPATCHABLE } from '../../lib/registry.js';
import { skillFiles } from '../../lib/template.js';
import { PACKAGE_ROOT } from './helpers.js';

const read = (rel) => fs.readFileSync(path.join(PACKAGE_ROOT, rel), 'utf8');

test('every path in the plan §7.2 layout exists', () => {
  const expected = [
    'package.json',
    'bin/phyllum.js',
    'skill/SKILL.md',
    'skill/refs/create.md',
    'skill/refs/assess.md',
    'skill/refs/apply.md',
    'skill/refs/tokenise.md',
    'skill/refs/nomenclature.md',
    'skill/refs/gui.md',
    'skill/refs/system.md',
    'skill/refs/version.md',
    'skill/refs/update.md',
    'skill/refs/init.md',
    'server/serve.py',
    'gui/index.html',
    'templates/DESIGN-SYSTEM.md',
    'evals/run.md',
  ];
  for (const rel of expected) {
    assert.ok(fs.existsSync(path.join(PACKAGE_ROOT, rel)), `missing ${rel}`);
  }
});

test('package.json declares the bin, ESM, and no runtime dependencies', () => {
  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.name, 'phyllum');
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.bin.phyllum, 'bin/phyllum.js');
  assert.deepEqual(manifest.dependencies, {});
  assert.deepEqual(manifest.devDependencies, {});
});

test('the skill ships a reference file for every subskill with one', () => {
  const files = skillFiles();
  assert.ok(files.includes('SKILL.md'));
  for (const name of ['create', 'assess', 'apply', 'tokenise', 'gui', 'system', 'version', 'update', 'init']) {
    assert.ok(files.includes(`refs/${name}.md`), `missing refs/${name}.md`);
  }
});

test('SKILL.md states the permission rule and its three exceptions', () => {
  const skill = read('skill/SKILL.md');
  assert.ok(skill.startsWith('---'), 'SKILL.md needs frontmatter');
  assert.ok(/^name: phyllum$/m.test(skill));
  assert.ok(/^description: /m.test(skill));
  assert.ok(skill.includes('exactly one file'));
  for (const target of ['DESIGN-SYSTEM.md', '.phyllum/**', '.claude/skills/phyllum/**', '.gitignore']) {
    assert.ok(skill.includes(target), `permission rule missing ${target}`);
  }
});

test('SKILL.md documents every command and alias, and the reserved word', () => {
  const skill = read('skill/SKILL.md');
  for (const command of COMMANDS) {
    assert.ok(skill.includes(`\`${command.name}\``), `SKILL.md does not mention ${command.name}`);
    for (const alias of command.aliases) {
      assert.ok(skill.includes(`\`${alias}\``), `SKILL.md does not mention alias ${alias}`);
    }
  }
  assert.ok(skill.includes('reserved word'));
  assert.ok(skill.includes('Fencing rule'));
  assert.ok(skill.includes('atomic'));
});

test('the milestone status in SKILL.md matches the command table', () => {
  const skill = read('skill/SKILL.md');
  for (const command of DISPATCHABLE.filter((c) => c.milestone !== 'M1')) {
    assert.ok(
      new RegExp(`\`${command.name}\`[^.]*${command.milestone}|${command.milestone}[^.]*\`${command.name}\``).test(
        skill,
      ),
      `SKILL.md should place ${command.name} in ${command.milestone}`,
    );
  }
});

test('the server is standard library only, and says so in code', () => {
  const server = read('server/serve.py');
  assert.ok(!server.includes('PLACEHOLDER'), 'the M4 placeholder is gone');

  // Zero dependencies is a property of the file, not a promise in a README:
  // every import has to be a module Python ships with.
  const stdlib = new Set([
    'argparse', 'json', 'os', 're', 'signal', 'subprocess', 'sys', 'threading', 'time', 'uuid',
    'http.server', 'urllib.parse', 'socketserver', 'mimetypes', 'shutil',
  ]);
  for (const line of server.split('\n')) {
    const plain = line.match(/^import\s+([A-Za-z0-9_.]+)/);
    const from = line.match(/^from\s+([A-Za-z0-9_.]+)\s+import\s+/);
    const module = plain?.[1] ?? from?.[1];
    if (!module) continue;
    assert.ok(stdlib.has(module), `server/serve.py imports a non-stdlib module: ${module}`);
  }

  // And the contract the GUI is built against stays written down in it.
  for (const marker of ['GET  /state', 'GET  /system', 'POST /prompt', 'POST /upload']) {
    assert.ok(server.includes(marker), `serve.py should document ${marker}`);
  }
  assert.ok(server.includes('localhost only'));
});

test('the dashboard page is a single file with no CDN and no build step', () => {
  const gui = read('gui/index.html');
  assert.ok(!gui.includes('PLACEHOLDER'), 'the M4 placeholder is gone');
  assert.ok(!/src\s*=\s*["']https?:/i.test(gui), 'no script may be loaded from the network');
  assert.ok(!/href\s*=\s*["']https?:/i.test(gui), 'no stylesheet may be loaded from the network');
  for (const view of ['Library', 'Workbench', 'Token view']) {
    assert.ok(gui.includes(view), `the page ships the ${view} view`);
  }
  for (const route of ['/state', '/system', '/prompt', '/upload']) {
    assert.ok(gui.includes(route), `the page talks to ${route}`);
  }
});

test('the judgement rubric that still has no judge says so plainly', () => {
  // `help-accuracy` compares free text to the §2.2 table, which needs a model
  // judge. It stays pinned and unscored rather than being given a number
  // nothing computed.
  const text = read('evals/rubrics/help-accuracy.md');
  assert.ok(/not scored yet/i.test(text), 'the rubric should say it is not scored yet');
  assert.ok(/threshold/i.test(text), 'the rubric should state a pass threshold for when it is');
  assert.ok(/model judge/i.test(text), 'the rubric should say what it is waiting for');

  const data = JSON.parse(read('evals/prompts/help-accuracy.json'));
  assert.ok(data.status.includes('not scored'));
  assert.ok(data.rubric);
});

test('every eval says which release it was written for (M6)', () => {
  // Two evals carried a bare `M3`, from before there was a second release with
  // an M3 in it. An unqualified milestone reads as the current one to whoever
  // opens the file next, which is how `tokenise-clustering` stayed misfiled for
  // a release — the same failure this pin now makes impossible.
  const dir = path.join(PACKAGE_ROOT, 'evals', 'prompts');
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    assert.match(
      String(data.milestone ?? ''),
      /^v\d+\.\d+\.\d+ M\d+$/,
      `${file} names a milestone without saying which release it belongs to`,
    );
    assert.ok(
      fs.existsSync(path.join(PACKAGE_ROOT, data.rubric)),
      `${file} points at a rubric that is not there`,
    );
  }
});

test('help-accuracy covers the surface v0.2.1 actually has (M6)', () => {
  const data = JSON.parse(read('evals/prompts/help-accuracy.json'));
  assert.equal(data.milestone, 'v0.2.1 M6', 're-pinned with the release, not left at the last one');

  // The one eval that reads help text against the plan is only as good as its
  // case list, and a list that only grows when a *command* is added misses a
  // depth release entirely. v0.2.1 added no command and changed three pages.
  const ids = new Set(data.cases.map((testCase) => testCase.id));
  for (const id of ['help-display', 'help-assess-json', 'help-assess-score']) {
    assert.ok(ids.has(id), `help-accuracy has no case for ${id}`);
  }

  const scopes = data.cases.find((testCase) => testCase.id === 'help-assess-scopes');
  assert.match(
    scopes.mustNotClaim,
    /accepts every proposed token/,
    'the claim most likely to rot is the one pinned by name',
  );
  const system = data.cases.find((testCase) => testCase.id === 'help-system');
  assert.match(system.mustClaim, /alias/, '`system` is described as the alias, not the primary name');
});

test('the help text says what `assess update` and `display` actually do (M6)', () => {
  const assess = COMMANDS.find((command) => command.name === 'assess');
  const modes = assess.modes.join('\n');
  const args = assess.args.join('\n');

  // Doc drift, pinned rather than trusted. `assess update` declines a `warn`
  // finding in `autoAnswer`, and the help page said it accepted "every proposed
  // token" for a whole release after that stopped being true.
  assert.match(modes, /`warn`[^\n]*never accepted/, 'the page says warnings are not auto-accepted');
  assert.ok(
    !/every proposed token accepted/.test(modes),
    'and no longer claims the opposite',
  );
  assert.match(modes, /--json/, 'the flag that writes a file is on the page it belongs to');
  assert.match(args, /--json \[path\]/);
  assert.match(assess.description.join('\n'), /drift score/, 'and the run says how it ends');

  // `display` leads and `system` follows, in the registry that renders both.
  const display = COMMANDS.find((command) => command.name === 'display');
  assert.ok(display, '`display` is the command');
  assert.ok(display.aliases.includes('system'), 'and `system` is its alias');
});

test('init-detection is scored from M6, and says which half is scored', () => {
  const rubric = read('evals/rubrics/init-detection.md');
  assert.ok(/scored from M6/i.test(rubric), 'the rubric should say it is scored now');
  assert.ok(/model judge/i.test(rubric), 'and which half still waits for a judge');

  const data = JSON.parse(read('evals/prompts/init-detection.json'));
  assert.equal(data.threshold, 1);
  assert.deepEqual(data.scored, ['framework', 'styling', 'artefacts', 'codeView']);
  assert.ok(Array.isArray(data.notScored) && data.notScored.length > 0, 'and what it does not score');
  for (const testCase of data.cases) {
    assert.ok(testCase.expected.codeView, `${testCase.id} pins the code view it expects`);
  }
});

test('the eval runner and its recorder ship with the package', () => {
  for (const rel of ['evals/run-evals.js', 'evals/record-model.js', 'evals/graders.js', 'evals/baseline.json']) {
    assert.ok(fs.existsSync(path.join(PACKAGE_ROOT, rel)), `missing ${rel}`);
  }
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts.evals, 'node evals/run-evals.js');
  assert.ok(scripts['evals:record'].includes('--record'));
});

test('every eval fixture codebase referenced by a prompt exists', () => {
  for (const spec of ['init-detection', 'assess-clustering', 'assess-naming']) {
    const data = JSON.parse(read(`evals/prompts/${spec}.json`));
    for (const testCase of data.cases) {
      if (!testCase.fixture) continue;
      assert.ok(
        fs.existsSync(path.join(PACKAGE_ROOT, testCase.fixture)),
        `${spec} references a missing fixture: ${testCase.fixture}`,
      );
    }
  }
});

test('the M5 eval assets exist, and the ground truth is the images themselves', () => {
  for (const rel of [
    'evals/fixtures/images/make-images.js',
    'evals/fixtures/images/ground-truth.json',
    'evals/fixtures/codebases/repeated-jsx/src/Toolbar.jsx',
  ]) {
    assert.ok(fs.existsSync(path.join(PACKAGE_ROOT, rel)), `missing ${rel}`);
  }

  const truth = JSON.parse(read('evals/fixtures/images/ground-truth.json')).images;
  const spec = JSON.parse(read('evals/prompts/create-image-trace.json'));
  for (const testCase of spec.cases) {
    assert.ok(fs.existsSync(path.join(PACKAGE_ROOT, testCase.image)), `missing ${testCase.image}`);
    assert.ok(fs.existsSync(path.join(PACKAGE_ROOT, testCase.trace)), `missing ${testCase.trace}`);
    const known = truth[path.basename(testCase.image)];
    assert.ok(known, `${testCase.image} has no ground truth`);
    for (const property of testCase.expectMeasured) {
      assert.ok(known.properties[property], `${testCase.id}: no ground truth for ${property}`);
    }
  }

  const picks = JSON.parse(read('evals/prompts/create-pick-candidates.json'));
  for (const testCase of picks.cases) {
    // A `primitives` case pins its colour tokens in the prompt file rather than
    // in a fixture codebase: there is no codebase to scan, only a design system
    // to read (v0.3.0 §5.1).
    if (testCase.kind === 'primitives') {
      assert.ok(Array.isArray(testCase.colours), `${testCase.id}: pins no colour tokens`);
      assert.ok(Array.isArray(testCase.expect.asked), `${testCase.id}: pins no questions`);
      continue;
    }
    assert.ok(fs.existsSync(path.join(PACKAGE_ROOT, testCase.fixture)), `missing ${testCase.fixture}`);
    assert.ok(
      fs.existsSync(path.join(PACKAGE_ROOT, testCase.designSystem)),
      `missing ${testCase.designSystem}`,
    );
  }
});

// ---------------------------------------------------------------------------
// The public docs against the real command surface (v0.2.0 M8)
// ---------------------------------------------------------------------------

/**
 * `menu`, `help` and the session banner all render from `lib/registry.js`, so they
 * cannot drift from the command surface — that is why they need no test here.
 * The README and `llms.txt` are hand-written prose, so they can and did: v0.2.0
 * added six commands and the M8 sweep found `kill` missing from the README table
 * entirely, and `assess`'s one-liner describing half of what it does.
 *
 * Pinning "every command is mentioned" is not a substitute for reading the prose,
 * but it is the part a person forgets and a check never does.
 */
test('every dispatchable command is named in the README command table', () => {
  const readme = read('README.md');
  const table = readme
    .split('\n')
    .filter((line) => /^\|\s*`/.test(line))
    .join('\n');
  assert.ok(table.length > 0, 'the README has a command table');
  for (const command of DISPATCHABLE) {
    assert.match(
      table,
      new RegExp(`\`${command.name}\``),
      `README's command table does not mention \`${command.name}\``,
    );
  }
});

test('the README does not describe tokenise as reading the codebase', () => {
  // The v0.2.0 division is that assess reads code and tokenise reads prose. This
  // is the sentence most likely to survive the rework unnoticed, in the surface
  // most people read first.
  // Line by line, not sentence by sentence: the command table is one block of
  // text mentioning every command, so a whole-block read cannot tell which
  // command a phrase belongs to. A line that names `assess` too is a legitimate
  // contrast ("assess reads code, tokenise reads prose") and is left alone.
  for (const line of read('README.md').split('\n')) {
    if (!/`tokenise`/.test(line) || /`assess`/.test(line)) continue;
    assert.ok(
      !/\bcodebase\b|\bscans?\b/.test(line),
      `README describes tokenise as scanning the codebase: ${line.trim()}`,
    );
  }
});

test('llms.txt does not claim the package is unpublished', () => {
  // `version` and `update` both exist because Phyllum is published. A doc saying
  // otherwise contradicts two whole commands.
  const llms = read('llms.txt');
  assert.ok(!/no published remote/i.test(llms), 'llms.txt still says the repo has no remote');
  assert.match(llms, /npm/, 'and it says where the package lives');
});

test('the shipped docs claim a bounded scan, because the scan is bounded', () => {
  // `assess` skips build output, gitignored paths, oversized files and non-text
  // files. A doc promising "every text file" promises something else.
  for (const rel of ['README.md', 'llms.txt', 'skill/SKILL.md']) {
    const text = read(rel);
    if (!/text file/.test(text)) continue;
    assert.ok(
      /skipped|bounded|size cap|gitignore/i.test(text),
      `${rel} claims text files are read without saying what is skipped`,
    );
  }
});
