/**
 * Assertions for `refine coverage` (v0.11.0 phase 2).
 *
 * The gate's second section, and the first one that reads a codebase. What is
 * checked here is mostly the seams, because the reading itself is Assess's and
 * is already covered by Assess's own suite:
 *
 *   - **A built component's raw values are found, and named for what they are.**
 *     A value the design system already names is a `bypassed-token`; a value no
 *     token covers is an `unnamed-value`. One failure, two repairs.
 *   - **A component that reaches its styling through tokens passes.** A
 *     `var(--token)` is a reference rather than a value, so a component written
 *     entirely in references carries nothing for this section to find.
 *   - **A component nobody built is neither passed nor failed.** It is reported
 *     unbuilt, because a criterion passed by absence is one nobody checked.
 *   - **A section that could not run says so.** A stack whose component pass
 *     does not run cannot be told its components carry raw values.
 *   - **Nothing is written.** The whole directory is diffed around every call.
 *
 * The rules and their severities are read from the `phyllum:refine-coverage-rules`
 * table rather than restated here, so a severity edited in the reference moves
 * this suite with it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse } from '../../lib/design-system.js';
import {
  BOUNDED_CAVEAT,
  alreadyNamed,
  componentFiles,
  refineCoverage,
  rules,
  styleFilesFor,
  unreadableSightings,
} from '../../lib/refine-coverage.js';
import { coverageRules, refineSeverityFor } from '../../lib/refine-spec.js';
import { knownValues } from '../../lib/tokenise.js';
import { diffSnapshots, snapshotContents, withTempDir } from './helpers.js';

/**
 * A project with one recorded component, whose styling is whatever the caller
 * writes. Built inline rather than copied from `evals/fixtures/`: every case
 * here turns on one or two declarations, and a fixture per declaration would be
 * a folder of near-identical projects.
 */
const DESIGN_SYSTEM = [
  '# Design System',
  '',
  "> Phyllum manages this file. It is the single source of truth for this project's design system.",
  '',
  '- Project: refine-coverage',
  '- Phyllum version: 0.10.0',
  '- Created: 2026-08-25',
  '',
  '## Tokens',
  '',
  '### Colours',
  '',
  '| token | value |',
  '| --- | --- |',
  '| color-primary | #2563EB |',
  '',
  '### Numbers',
  '',
  '| token | value | applies to |',
  '| --- | --- | --- |',
  '| space-md | 16px | spacing |',
  '',
  '### Typography',
  '',
  '| token | size | weight | line-height |',
  '| --- | --- | --- | --- |',
  '',
  '## Components',
  '',
  '### Button',
  '',
  '```yaml',
  'name: Button',
  'archetype: button',
  'applied: true',
  '```',
  '',
  '## Backlog',
  '',
  '_Nothing outstanding._',
  '',
].join('\n');

const MARKUP = [
  'export function Button({ children }) {',
  '  return <Button className="button">{children}</Button>;',
  '}',
  '',
].join('\n');

/** A project whose one component is styled by `css`, in a temp directory. */
function project(dir, css, { markup = MARKUP } = {}) {
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), DESIGN_SYSTEM);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'sample', dependencies: { react: '^18.0.0' } }));
  if (markup !== null) fs.writeFileSync(path.join(dir, 'src', 'Button.jsx'), markup);
  if (css !== null) fs.writeFileSync(path.join(dir, 'src', 'button.css'), css);
  return parse(fs.readFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), 'utf8'));
}

const rulesIn = (findings) => findings.map((row) => row.rule).sort();

// ---------------------------------------------------------------------------
// A clean component
// ---------------------------------------------------------------------------

test('a component that reaches its styling through tokens passes', async () => {
  await withTempDir(async (dir) => {
    const model = project(
      dir,
      ['.button {', '  color: var(--color-primary);', '  padding: var(--space-md);', '}', ''].join('\n'),
    );
    const result = refineCoverage(dir, model);

    assert.equal(result.ran, true);
    assert.equal(result.pass, true, 'a component written in references carries no raw values');
    assert.deepEqual(result.findings, []);
    assert.equal(result.caveat, BOUNDED_CAVEAT, 'the bound is stated with the result, not footnoted');
    const [button] = result.components;
    assert.equal(button.component, 'Button');
    assert.equal(button.built, true);
    assert.deepEqual(button.files, ['src/Button.jsx', 'src/button.css']);
  });
});

// ---------------------------------------------------------------------------
// The two failures
// ---------------------------------------------------------------------------

test('a value the design system already names is a bypassed token, not an unnamed one', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, ['.button {', '  color: #2563EB;', '}', ''].join('\n'));
    const result = refineCoverage(dir, model);

    assert.equal(result.pass, false);
    assert.deepEqual(rulesIn(result.findings), ['bypassed-token']);
    const [found] = result.findings;
    assert.equal(found.severity, refineSeverityFor('bypassed-token'));
    assert.match(found.detail, /already names/);
    assert.deepEqual(found.evidence, ['src/button.css: color: #2563EB']);
  });
});

test('a value no token covers is an unnamed value, and says the repair runs through tokenise', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, ['.button {', '  padding: 13px;', '}', ''].join('\n'));
    const result = refineCoverage(dir, model);

    assert.equal(result.pass, false);
    assert.deepEqual(rulesIn(result.findings), ['unnamed-value']);
    assert.match(result.findings[0].detail, /tokenise/);
  });
});

test('both failures can land on one component, and one raw value fails it', async () => {
  await withTempDir(async (dir) => {
    const model = project(
      dir,
      ['.button {', '  color: #2563EB;', '  padding: var(--space-md);', '  border-radius: 4px;', '}', ''].join('\n'),
    );
    const result = refineCoverage(dir, model);
    assert.deepEqual(rulesIn(result.findings), ['bypassed-token', 'unnamed-value']);
    assert.equal(result.components[0].pass, false, 'nine tokens and one literal is a component with a literal in it');
  });
});

test('a raw value in the markup is found too — a component is not only its stylesheet', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, null, {
      markup: [
        'export function Button({ children }) {',
        '  return <Button className="button" style={{ color: "#111827" }}>{children}</Button>;',
        '}',
        '',
      ].join('\n'),
    });
    const result = refineCoverage(dir, model);
    assert.deepEqual(rulesIn(result.findings), ['unnamed-value']);
    assert.deepEqual(result.findings[0].evidence, ['src/Button.jsx: color: #111827']);
  });
});

// ---------------------------------------------------------------------------
// What is not graded, and why
// ---------------------------------------------------------------------------

test('a component nobody built is reported unbuilt — neither passed nor failed', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, null, { markup: 'export const Nothing = () => null;\n' });
    const result = refineCoverage(dir, model);

    const [button] = result.components;
    assert.equal(button.built, false);
    assert.equal(button.checked, false);
    assert.equal(button.pass, null, 'an unbuilt component is not passed by absence');
    assert.match(button.reason, /nothing in the markup scan is this component/);
    assert.equal(result.pass, null, 'with nothing built, the section has no verdict to give');
  });
});

test('a component pass that did not run is reported, never read as a clean sheet', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, ['.button { color: #2563EB; }', ''].join('\n'));
    const result = refineCoverage(dir, model, {
      componentPass: { ran: false, reason: 'component detection is React-only, and this looks like Vue' },
    });

    assert.equal(result.ran, false);
    assert.equal(result.pass, null);
    assert.deepEqual(result.findings, []);
    assert.match(result.reason, /React-only/, 'the section says why it could not run');
  });
});

test('a comment is not evidence, and a token reference is not a value', async () => {
  await withTempDir(async (dir) => {
    const model = project(
      dir,
      ['/* the brand colour is #2563EB */', '.button {', '  color: var(--color-primary);', '}', ''].join('\n'),
    );
    assert.deepEqual(refineCoverage(dir, model).findings, [], 'prose about a colour is not a use of it');
  });
});

// ---------------------------------------------------------------------------
// The seams
// ---------------------------------------------------------------------------

test('the stylesheet a component is styled by is part of its source', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, ['.button {', '  color: #2563EB;', '}', ''].join('\n'));
    const [entry] = componentFiles(dir, model);
    assert.deepEqual(entry.markup, ['src/Button.jsx'], 'the markup site is where it is used');
    assert.deepEqual(styleFilesFor(dir, entry.recorded), ['src/button.css'], 'the rule is what it is made of');
  });
});

test('a value is recognised however it is spelled', () => {
  const known = knownValues(parse(DESIGN_SYSTEM));
  assert.equal(alreadyNamed({ pass: 'colours', value: 'rgb(37, 99, 235)' }, known), true);
  assert.equal(alreadyNamed({ pass: 'colours', value: '#7C3AED' }, known), false);
  assert.equal(alreadyNamed({ pass: 'numbers', value: '16px' }, known), true);
});

test('one unreadable value written three times is one finding, not three', () => {
  const folded = unreadableSightings([
    { kind: 'colour', property: 'accent', value: '#7C3AED', file: 'a.css' },
    { kind: 'colour', property: 'accent', value: '#7C3AED', file: 'a.css' },
    { kind: 'colour', property: 'accent', value: '#7C3AED', file: 'b.css' },
  ]);
  assert.equal(folded.length, 1);
  assert.deepEqual(folded[0].files, ['a.css', 'b.css']);
});

test('every rule this section can report is one the reference declares', () => {
  const declared = coverageRules().map((row) => row.rule);
  assert.deepEqual(rules(), declared);
  assert.ok(declared.includes('bypassed-token') && declared.includes('unnamed-value'));
  assert.equal(refineSeverityFor('unreadable-value'), 'warn', 'a question is not a failure');
});

// ---------------------------------------------------------------------------
// Read-only
// ---------------------------------------------------------------------------

test('coverage writes nothing — not one file, not one byte', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, ['.button { color: #2563EB; padding: 13px; }', ''].join('\n'));
    const before = snapshotContents(dir);
    refineCoverage(dir, model);
    componentFiles(dir, model);
    const diff = diffSnapshots(before, snapshotContents(dir));
    assert.deepEqual(diff, { added: [], changed: [], removed: [] });
  });
});
