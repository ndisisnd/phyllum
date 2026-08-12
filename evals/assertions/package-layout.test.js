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
  for (const spec of ['init-detection', 'tokenise-clustering', 'tokenise-naming']) {
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
    assert.ok(fs.existsSync(path.join(PACKAGE_ROOT, testCase.fixture)), `missing ${testCase.fixture}`);
    assert.ok(
      fs.existsSync(path.join(PACKAGE_ROOT, testCase.designSystem)),
      `missing ${testCase.designSystem}`,
    );
  }
});
