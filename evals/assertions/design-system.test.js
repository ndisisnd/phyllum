/**
 * Assertions for the DESIGN-SYSTEM.md contract (plan §7.1.1, §8.5).
 *
 * These are the cross-cutting invariants: round-trip parsing, the fencing rule,
 * and the promise that the shipped template and the renderer agree.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MANDATORY_HEADINGS,
  TOKEN_SECTIONS,
  emptyModel,
  fenceFor,
  missingHeadings,
  parse,
  render,
  validateFencing,
  validateStructure,
} from '../../lib/design-system.js';
import { instantiateTemplate, readTemplate } from '../../lib/template.js';
import { POPULATED_FIXTURE, USER_EDITED_FIXTURE, readFixture } from './helpers.js';

test('the shipped template is exactly what the renderer produces for an empty system', () => {
  const meta = { project: 'acme-web', version: '9.9.9', created: '2026-08-12' };
  assert.equal(instantiateTemplate(meta), render(emptyModel(meta)));
});

test('the template carries every mandatory section, with empty tables headed', () => {
  const text = instantiateTemplate({ project: 'p', version: 'v', created: 'd' });
  assert.deepEqual(missingHeadings(text), []);
  for (const section of TOKEN_SECTIONS) {
    assert.ok(text.includes(`| ${section.columns.join(' | ')} |`), `${section.key} header row missing`);
  }
  assert.ok(validateStructure(text).valid);
});

test('the template ships its placeholders and nothing else to fill in', () => {
  const raw = readTemplate();
  for (const placeholder of ['{{PROJECT}}', '{{VERSION}}', '{{CREATED}}']) {
    assert.ok(raw.includes(placeholder));
  }
  const leftovers = [...raw.matchAll(/{{(\w+)}}/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(leftovers)].sort(), ['CREATED', 'PROJECT', 'VERSION']);
});

test('parse -> render -> parse is a fixed point on the populated fixture', () => {
  const text = readFixture(POPULATED_FIXTURE);
  const once = parse(text);
  const rendered = render(once);
  const twice = parse(rendered);
  assert.deepEqual(twice, once);
  assert.equal(render(twice), rendered);
  // The fixture is itself canonical, so rendering reproduces it byte for byte.
  assert.equal(rendered, text);
});

test('parse reads the header, tokens, components and backlog', () => {
  const model = parse(readFixture(POPULATED_FIXTURE));
  assert.equal(model.header.project, 'acme-web');
  assert.equal(model.header.version, '0.1.0');
  assert.equal(model.tokens.colours.length, 2);
  assert.deepEqual(model.tokens.colours[0], ['color-primary', '#2563EB']);
  assert.equal(model.tokens.numbers.length, 1);
  assert.equal(model.tokens.typography.length, 1);
  assert.deepEqual(
    model.components.map((c) => c.name),
    ['Button/Primary', 'Card/Basic'],
  );
  assert.equal(model.backlog.length, 3);
});

test('fence length is significant: a block containing ``` is fenced with ````', () => {
  const inner = ['before', '```jsx', '<Button />', '```', 'after'].join('\n');
  assert.equal(fenceFor(inner), '````');
  assert.equal(fenceFor('plain text'), '```');
  assert.equal(fenceFor(['````', 'x'].join('\n')), '`````');

  const model = parse(readFixture(POPULATED_FIXTURE));
  const jsx = model.components[0].blocks.find((b) => b.lang === 'jsx');
  assert.ok(jsx.content.includes('```jsx'), 'the fixture should exercise the nesting case');
  assert.ok(render(model).includes('````jsx'));
});

test('the fixture and the template both honour the fencing rule', () => {
  for (const text of [
    readFixture(POPULATED_FIXTURE),
    readFixture(USER_EDITED_FIXTURE),
    instantiateTemplate({ project: 'p', version: 'v', created: 'd' }),
  ]) {
    const result = validateFencing(text);
    assert.deepEqual(result.problems, []);
    assert.ok(result.valid);
  }
});

test('a heading inside a fenced block is not mistaken for a section', () => {
  const model = emptyModel({ project: 'p', version: 'v', created: 'd' });
  model.components.push({
    name: 'Doc/Sample',
    blocks: [{ lang: 'markdown', content: ['## Tokens', '### Colours', '## Backlog'].join('\n') }],
  });
  const text = render(model);
  const reparsed = parse(text);
  assert.equal(reparsed.components.length, 1);
  assert.equal(reparsed.tokens.colours.length, 0);
  assert.deepEqual(missingHeadings(text), []);
});

test('validateStructure names exactly the headings that are missing', () => {
  const text = readFixture(USER_EDITED_FIXTURE);
  const result = validateStructure(text);
  assert.equal(result.valid, false);
  assert.deepEqual(result.missing, ['### Typography', '## Backlog']);
  for (const heading of result.missing) assert.ok(MANDATORY_HEADINGS.includes(heading));
});
