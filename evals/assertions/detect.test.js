/**
 * Assertions for language and framework detection (plan §3.3, §6.5, §9).
 *
 * Detection has one job and one fallback. The job: name what the project is
 * written in, from the manifest first and the files second. The fallback: when
 * that fails — an empty folder, a Go service, an unparseable `package.json` —
 * the code view is React + CSS and says so out loud, because a silent default
 * is indistinguishable from a wrong answer.
 *
 * Vue and Svelte are detected on purpose even though v1 cannot emit them: being
 * told "this is Svelte, the code view below is still React" is honest, and
 * pretending not to notice is not.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { DEFAULT_CODE_VIEW, codeViewFor, detectProject, renderDetection } from '../../lib/detect.js';
import { execute } from '../../lib/execute.js';
import { tokenizeLine } from '../../lib/parse-args.js';
import { runCreate } from '../../lib/create-command.js';
import { FIXTURES, copyDir, snapshotContents, diffSnapshots, withTempDir } from './helpers.js';

const codebase = (name) => path.join(FIXTURES, 'codebases', name);

const EXPECTED = [
  { fixture: 'react-css', framework: 'React', id: 'react', styling: 'CSS', supported: true },
  { fixture: 'tailwind', framework: 'React (Next.js)', id: 'react-next', styling: 'Tailwind', supported: true },
  { fixture: 'plain-html', framework: 'none — plain HTML and CSS', id: 'html', styling: 'CSS', supported: false },
  { fixture: 'vue-app', framework: 'Vue', id: 'vue', styling: 'CSS', supported: false },
  { fixture: 'unknown-lang', framework: 'unknown', id: 'unknown', styling: 'CSS', supported: false },
  { fixture: 'empty-project', framework: 'unknown', id: 'unknown', styling: 'CSS', supported: false },
];

for (const expected of EXPECTED) {
  test(`detection reads ${expected.fixture} as ${expected.framework}`, () => {
    const detection = detectProject(codebase(expected.fixture));
    assert.equal(detection.framework, expected.framework);
    assert.equal(detection.frameworkId, expected.id);
    assert.equal(detection.styling, expected.styling);
    assert.equal(detection.supported, expected.supported);
  });
}

test('the code view is React + CSS whatever the answer was', () => {
  for (const { fixture } of EXPECTED) {
    const { codeView } = detectProject(codebase(fixture));
    assert.equal(codeView.language, DEFAULT_CODE_VIEW.language);
    assert.equal(codeView.styling, DEFAULT_CODE_VIEW.styling);
  }
});

test('a fallback is labelled as one, and a real detection is not', () => {
  for (const { fixture, supported } of EXPECTED) {
    const { codeView } = detectProject(codebase(fixture));
    assert.equal(codeView.fallback, !supported, `${fixture}: fallback flag`);
    assert.ok(codeView.reason.length > 0, `${fixture}: a fallback with no reason is a silent default`);
  }
});

test('an unsupported framework is named in the reason, not hidden by it', () => {
  const vue = detectProject(codebase('vue-app')).codeView;
  assert.match(vue.reason, /Vue/);
  assert.match(vue.reason, /React \+ CSS/);

  const html = detectProject(codebase('plain-html')).codeView;
  assert.match(html.reason, /plain HTML and CSS/i);
});

test('an empty project says there is nothing to detect yet', () => {
  const detection = detectProject(codebase('empty-project'));
  assert.equal(detection.empty, true);
  assert.match(detection.codeView.reason, /nothing here to detect/i);
});

test('a codebase in a language Basal has no opinion about falls back cleanly', () => {
  const detection = detectProject(codebase('unknown-lang'));
  assert.equal(detection.empty, false, 'there are files here — it is not an empty project');
  assert.match(detection.codeView.reason, /No framework was detected/i);
});

test('an unparseable package.json is no evidence rather than a crash', async () => {
  await withTempDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), '{ this is not json');
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><button>Save</button>');
    const detection = detectProject(dir);
    assert.equal(detection.frameworkId, 'html', 'the files still answer the question');
  });
});

test('detection falls back to the files when there is no manifest at all', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'Button.jsx'), 'export const Button = () => null;');
    assert.equal(detectProject(dir).frameworkId, 'react');
  });
});

test('a Svelte project is detected, and told plainly that v1 emits React', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'Button.svelte'), '<button>Save</button>');
    const detection = detectProject(dir);
    assert.equal(detection.frameworkId, 'svelte');
    assert.equal(detection.supported, false);
    assert.match(detection.codeView.reason, /Svelte/);
  });
});

test('Tailwind is spotted from a stylesheet even with no config file', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'styles.css'), '@tailwind base;\n@tailwind utilities;\n');
    fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), 'export const App = () => null;');
    const detection = detectProject(dir);
    assert.equal(detection.styling, 'Tailwind');
    assert.equal(detection.codeView.fallback, false, 'React with Tailwind is still React');
    assert.match(detection.codeView.reason, /Tailwind/);
  });
});

test('detection never looks inside node_modules', async () => {
  await withTempDir(async (dir) => {
    fs.mkdirSync(path.join(dir, 'node_modules', 'vue'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'vue', 'App.vue'), '<template />');
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
    assert.equal(detectProject(dir).frameworkId, 'html');
  });
});

test('codeViewFor answers the same way when handed a bare detection', () => {
  assert.equal(codeViewFor({}).fallback, true);
  assert.equal(codeViewFor({}).language, 'React');
  assert.equal(codeViewFor({ frameworkId: 'react' }).fallback, false);
});

test('detection writes nothing — it is a read', async () => {
  await withTempDir(async (dir) => {
    copyDir(codebase('vue-app'), dir);
    const before = snapshotContents(dir);
    detectProject(dir);
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), {
      added: [],
      changed: [],
      removed: [],
    });
  });
});

// ---------------------------------------------------------------------------
// What the user actually sees
// ---------------------------------------------------------------------------

test("init's step 1 reports the framework, the styling and the code view", async () => {
  await withTempDir(async (dir) => {
    copyDir(codebase('vue-app'), dir);
    const { out } = await execute(tokenizeLine('init'), { cwd: dir, yes: true, today: '2026-08-12' });
    assert.ok(out.includes('Framework: Vue'));
    assert.ok(out.includes('Code view: React + CSS (default)'));
  });
});

test('renderDetection marks the default, and leaves a real detection unmarked', () => {
  const vue = renderDetection(detectProject(codebase('vue-app'))).join('\n');
  assert.match(vue, /Code view: React \+ CSS \(default\)/);

  const react = renderDetection(detectProject(codebase('react-css'))).join('\n');
  assert.match(react, /Code view: React \+ CSS$/m);
  assert.ok(!react.includes('(default)'));
});

test('the create review explains the code view when it is a fallback', async () => {
  await withTempDir(async (dir) => {
    copyDir(codebase('vue-app'), dir);
    await execute(tokenizeLine('init'), { cwd: dir, yes: true, today: '2026-08-12' });

    const { out } = await runCreate([{ value: 'button primary with 12px padding-top', quoted: true }], {
      cwd: dir,
      env: {},
      ask: async () => 'skip',
      confirm: async () => false,
    });
    assert.ok(out.includes('Code view (React + CSS)'));
    assert.ok(out.includes('v1 emits React + CSS only'), 'the fallback is explained where it is shown');
  });
});

test('the create review says nothing extra when the codebase really is React', async () => {
  await withTempDir(async (dir) => {
    copyDir(codebase('react-css'), dir);
    await execute(tokenizeLine('init'), { cwd: dir, yes: true, today: '2026-08-12' });

    const { out } = await runCreate([{ value: 'button primary with 12px padding-top', quoted: true }], {
      cwd: dir,
      env: {},
      ask: async () => 'skip',
      confirm: async () => false,
    });
    assert.ok(out.includes('Code view (React + CSS)'));
    assert.ok(!out.includes('falls back to the default'));
  });
});
