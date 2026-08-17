/**
 * Assertions for the Library view's component preview (v0.4.1 plan §4, §6).
 *
 * The preview is a **projection of the recorded spec**, so every risk it
 * carries is a risk about honesty rather than about looks:
 *
 *   1. **The data path.** `/system`'s component objects have to carry the
 *      parsed slots the preview reads, through the one spec parser — not a
 *      second reader living in the page.
 *   2. **The projection.** A fixture spec has to land in one element whose
 *      inline styles are the resolved slots, token references resolved.
 *   3. **The honesty.** A `TODO` slot must be absent from the styles and
 *      present in the unrendered list, and a value that fails the shape gate
 *      must never reach a `style` attribute at all.
 *   4. **The toggles.** Variant siblings group by base name, and a lone
 *      component shows none.
 *   5. **What did not change.** The page still fetches nothing, and the server
 *      surface is the same four routes.
 *
 * The mechanism is `gui.test.js`'s: the page marks its preview region pure —
 * strings and numbers, no DOM, no fetch — and this file lifts that exact region
 * out and runs it. The suite therefore executes the code the browser executes,
 * not a restatement of it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { archetypes, previewElementFor } from '../../lib/archetypes.js';
import { isNone, listCell, stripTicks, tableAfter } from '../../lib/md-tables.js';
import { systemJson } from '../../lib/system-json.js';
import { PACKAGE_ROOT, POPULATED_FIXTURE, readFixture } from './helpers.js';

const GUI_PAGE = path.join(PACKAGE_ROOT, 'gui', 'index.html');
const PREVIEW_REF = path.join(PACKAGE_ROOT, 'skill', 'refs', 'gui', 'component-preview.md');
const ARCHETYPE_REF = path.join(PACKAGE_ROOT, 'skill', 'refs', 'create', 'archetypes.md');
const readPage = () => fs.readFileSync(GUI_PAGE, 'utf8');
const readRefText = (file) => fs.readFileSync(file, 'utf8');

/** One marked region of the page's script, by name. */
function region(text, name) {
  const start = text.indexOf(`// --- phyllum:${name}`);
  const end = text.indexOf(`// --- end phyllum:${name}`);
  assert.ok(start !== -1 && end > start, `the page marks its ${name} region`);
  return text.slice(start, end);
}

/**
 * The region with its prose removed.
 *
 * The comments explain what the code refuses to do — "no JSX transform", "no
 * fetch" — so a sweep for those words has to read the code, not the reasoning.
 */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * The page's own preview rules, lifted out and run.
 *
 * The preview reuses the colour cards' value gate rather than inventing a
 * second one, so both regions are lifted together — which is itself the
 * contract: one gate, widened, not two.
 */
function previewContract() {
  const text = readPage();
  const swatch = region(text, 'swatch-contract');
  const preview = region(text, 'preview-contract');
  assert.ok(
    !/\b(document|window)\b|fetch\s*\(/.test(code(preview)),
    'the preview region touches no DOM and no network',
  );
  return new Function(
    `${swatch}\n${preview}\nreturn { PREVIEW, UNRENDERED, PREVIEW_SHAPES, isSafeDeclaration, previewTokens,` +
      ' projectSlot, projectSpec, previewStates, previewLabel, previewElementHtml, previewVariantGroups,' +
      ' previewGroupOf, previewPanelHtml, previewAttributeRowHtml, attributeSlotsFor };',
  )();
}

const FIXTURE_SYSTEM = () => systemJson(readFixture(POPULATED_FIXTURE));

/** Every `style="…"` in a fragment. */
const styles = (html) => [...html.matchAll(/style="([^"]*)"/g)].map((match) => match[1]);

// ---------------------------------------------------------------------------
// 1. The data path — /system carries the parsed slots
// ---------------------------------------------------------------------------

test('/system component objects carry the parsed spec slots the preview reads', () => {
  const system = FIXTURE_SYSTEM();
  const button = system.components.find((component) => component.name === 'Button/Primary');
  assert.ok(button, 'the fixture has a button to preview');

  // The raw block is still served — the panel still prints it.
  assert.match(button.spec, /^name: Button\/Primary$/m, 'the raw spec block survives');

  // And the slots are served as data, not as a string for the page to parse.
  assert.equal(button.archetype, 'button');
  assert.equal(button.custom, false);
  assert.equal(typeof button.properties, 'object');
  assert.equal(button.properties.background, 'color-primary');
  assert.equal(button.properties.radius, 'rounded-md');
  assert.equal(button.properties.font, 'highlight-small');
  // The trailing `# TODO: tokenise` comment is the parser's to strip, not the
  // page's — one parser, one truth.
  assert.equal(button.properties['padding-top'], '12px');
  assert.deepEqual(button.states, { disabled: 'TODO' });

  const card = system.components.find((component) => component.name === 'Card/Basic');
  assert.equal(card.archetype, 'card');
  assert.deepEqual(card.states, {}, 'a spec with no states block carries an empty one, never a null');
});

test('a component with no yaml block carries empty slots rather than invented ones', () => {
  const text = '## Components\n\n### Odd/One\n\n```js\nconst x = 1;\n```\n';
  const [component] = systemJson(text).components;
  assert.equal(component.spec, null);
  assert.equal(component.archetype, null);
  assert.equal(component.custom, false);
  assert.deepEqual(component.properties, {});
  assert.deepEqual(component.states, {});
});

// ---------------------------------------------------------------------------
// 2. The projection — one element, styles that are the resolved slots
// ---------------------------------------------------------------------------

test('the preview element per archetype is the one the archetype table records', () => {
  const contract = previewContract();
  const rows = tableAfter(readRefText(ARCHETYPE_REF), '<!-- phyllum:contracts -->', 'refs/create/archetypes.md');
  assert.ok(rows.length >= 15, 'the contract table still holds every archetype');

  for (const row of rows) {
    const key = row[0].trim().toLowerCase();
    const recorded = stripTicks(row[4] ?? '');
    assert.ok(recorded !== '', `${key} has no preview element in the table`);
    assert.equal(
      contract.PREVIEW.elements[key],
      recorded,
      `the page draws ${key} as ${contract.PREVIEW.elements[key]}, the table says ${recorded}`,
    );
    // And the CLI reads the same column out of the same table.
    assert.equal(previewElementFor(key), recorded, `previewElementFor('${key}') disagrees with the table`);
  }
  assert.equal(
    Object.keys(contract.PREVIEW.elements).length,
    rows.length,
    'the page knows exactly the archetypes the table declares',
  );
  // Aliases resolve too — the column belongs to the archetype, not the spelling.
  assert.equal(previewElementFor('cta'), 'button');
  assert.equal(previewElementFor(archetypes()[0].aliases[0]), archetypes()[0].previewElement);
});

test('the projection map in the page is the one the ref table records', () => {
  const contract = previewContract();
  const rows = tableAfter(readRefText(PREVIEW_REF), '<!-- phyllum:preview-projection -->', 'refs/gui/component-preview.md');
  assert.ok(rows.length > 20, 'the map covers the slot vocabulary');

  for (const [property, declarations, shape] of rows) {
    const key = stripTicks(property);
    const rule = contract.PREVIEW.projection[key];
    assert.ok(rule, `the page has no projection for ${key}`);
    assert.deepEqual(
      rule.declarations,
      isNone(stripTicks(declarations)) ? [] : listCell(declarations),
      `${key} projects into different declarations in the page and the table`,
    );
    assert.equal(rule.shape, stripTicks(shape), `${key}'s shape gate disagrees`);
    assert.ok(contract.PREVIEW_SHAPES[rule.shape], `${rule.shape} is not a gate the page implements`);
  }
  assert.equal(
    Object.keys(contract.PREVIEW.projection).length,
    rows.length,
    'the page projects exactly the properties the table declares',
  );

  // Every shape the table names has a row of its own, so no gate is undocumented.
  const shapeRows = tableAfter(readRefText(PREVIEW_REF), '<!-- phyllum:preview-shapes -->', 'refs/gui/component-preview.md');
  assert.deepEqual(
    shapeRows.map((row) => stripTicks(row[0])).sort(),
    Object.keys(contract.PREVIEW_SHAPES).sort(),
    'the shape table and the page implement the same set of gates',
  );
});

test('a fixture spec projects into one element whose styles are the resolved slots', () => {
  const contract = previewContract();
  const system = FIXTURE_SYSTEM();
  const tokens = contract.previewTokens(system);
  const button = system.components.find((component) => component.name === 'Button/Primary');

  const { html, projected } = contract.previewElementHtml(button, tokens, 'default');
  assert.equal(projected.element, 'button', 'a button archetype is drawn as a button element');
  assert.equal((html.match(/<[a-z]/g) ?? []).length, 1, 'the projection is exactly one element');
  assert.equal(styles(html).length, 1, 'carrying exactly one style attribute');

  const declared = Object.fromEntries(projected.declarations);
  // `color-primary` is a token, so the swatch's own value is what is drawn.
  assert.equal(declared.background, '#2563EB', 'the token reference resolved to its recorded value');
  assert.equal(declared['border-radius'], '12px', '`rounded-md` resolved through the Numbers table');
  // `highlight-small` is a typography token: three readings, three declarations.
  assert.equal(declared['font-size'], '12px');
  assert.equal(declared['font-weight'], '700');
  assert.equal(declared['line-height'], '1.3');
  // And a raw value is used verbatim, with no rounding and no unit conversion.
  assert.equal(declared['padding-top'], '12px');
  assert.equal(declared['padding-bottom'], '8px');

  // The style attribute is those declarations and nothing else.
  assert.equal(styles(html)[0], projected.declarations.map(([name, value]) => `${name}:${value}`).join(';'));
  assert.ok(!styles(html)[0].includes('color-primary'), 'a token name never reaches a style attribute');

  // The label is the variant half of the name, escaped.
  assert.ok(html.includes('>Primary</button>'), html);
});

test('a custom component with no contract is a generic block from the slots it carries', () => {
  const contract = previewContract();
  const spec = {
    name: 'Ribbon',
    archetype: 'custom',
    custom: true,
    properties: { background: '#161616', padding: '4px 8px' },
    states: {},
  };
  const { html, projected } = contract.previewElementHtml(spec, contract.previewTokens(null), 'default');
  assert.equal(projected.element, contract.PREVIEW.fallbackElement);
  assert.equal(projected.element, 'div');
  assert.equal(styles(html).length, 1);
  assert.deepEqual(Object.fromEntries(projected.declarations), { background: '#161616', padding: '4px 8px' });
  assert.deepEqual(projected.unrendered, [], 'nothing was skipped, so nothing is listed');

  // An archetype the page has never heard of falls back the same way.
  const unknown = contract.projectSpec({ archetype: 'sparkline', properties: {} }, null, 'default');
  assert.equal(unknown.element, 'div');
});

test('an input archetype is a void element carrying its label as a value', () => {
  const contract = previewContract();
  const { html } = contract.previewElementHtml(
    { name: 'Input/Text', archetype: 'input', properties: { background: '#FFFFFF' } },
    contract.previewTokens(null),
    'default',
  );
  assert.match(html, /^<input class="preview__element" style="background:#FFFFFF" value="Text" readonly \/>$/);
});

// ---------------------------------------------------------------------------
// 3. The honesty — TODO slots, unresolvable slots, and the gate
// ---------------------------------------------------------------------------

test('a TODO slot contributes nothing to the styles and is listed as unrendered', () => {
  const contract = previewContract();
  const projected = contract.projectSpec(
    {
      name: 'Button/Ghost',
      archetype: 'button',
      properties: { background: '#2563EB', 'text-colour': 'TODO', radius: 'TODO: pick one' },
      states: {},
    },
    contract.previewTokens(null),
    'default',
  );
  assert.deepEqual(Object.fromEntries(projected.declarations), { background: '#2563EB' });
  assert.ok(!projected.style.includes('TODO'), 'no TODO reaches a style attribute');
  assert.deepEqual(
    projected.unrendered.map((entry) => [entry.slot, entry.reason]),
    [['text-colour', contract.UNRENDERED.todo], ['radius', contract.UNRENDERED.todo]],
    'both TODO slots are named underneath instead',
  );

  // The fixture's own case: a state recorded as a bare TODO.
  const system = FIXTURE_SYSTEM();
  const button = system.components.find((component) => component.name === 'Button/Primary');
  const disabled = contract.projectSpec(button, contract.previewTokens(system), 'disabled');
  assert.ok(
    disabled.unrendered.some((entry) => entry.slot === 'disabled' && entry.reason === contract.UNRENDERED.todo),
    'the TODO state is listed rather than drawn',
  );
});

test('an unresolvable slot is listed, never guessed at', () => {
  const contract = previewContract();
  const projected = contract.projectSpec(
    {
      archetype: 'button',
      properties: {
        background: 'color-that-does-not-exist',
        'overlay-colour': '#000000',
        'thumb-colour': '#FFFFFF',
      },
      states: {},
    },
    contract.previewTokens(FIXTURE_SYSTEM()),
    'default',
  );
  assert.deepEqual(projected.declarations, [], 'nothing was drawn');
  assert.equal(projected.style, '');
  const reasons = Object.fromEntries(projected.unrendered.map((entry) => [entry.slot, entry.reason]));
  assert.equal(reasons.background, contract.UNRENDERED.unresolved, 'a name no table holds is unresolved');
  assert.equal(reasons['overlay-colour'], contract.UNRENDERED.unprojectable, 'a scrim is a second box');
  assert.equal(reasons['thumb-colour'], contract.UNRENDERED.unprojectable);

  // Every reason the page prints is a row in the ref table.
  const rows = tableAfter(readRefText(PREVIEW_REF), '<!-- phyllum:preview-unrendered -->', 'refs/gui/component-preview.md');
  assert.deepEqual(
    rows.map((row) => stripTicks(row[0])).sort(),
    Object.values(contract.UNRENDERED).sort(),
    'the reasons the page prints are the reasons the ref records',
  );
});

test('a value failing the shape gate never reaches a style attribute', () => {
  const contract = previewContract();
  const hostile = [
    ['background', '#fff;position:fixed;inset:0'],
    ['background', '#fff" onload="alert(1)'],
    ['background', 'url(https://example.com/x.png)'],
    ['background', 'linear-gradient(#fff) /* x */'],
    ['background', 'var(--brand)'],
    ['background', '#GGGGGG'],
    ['text-colour', 'linear-gradient(#fff, #eee)'],
    ['padding', '12px 16px 20px 24px 28px'],
    ['padding', '12px;color:red'],
    ['radius', 'expression(alert(1))'],
    ['font-size', '12'],
    ['font-weight', '350'],
    ['shadow', '0 1px 2px rgba(0,0,0,0.06), 0 8px 16px #000'],
    ['shadow', '0 1px 2px #000; position:fixed'],
    ['font', '14px / 600 / 1.4'],
    ['size', '44px × 24px'],
  ];
  for (const [property, value] of hostile) {
    const slot = contract.projectSlot(property, value, contract.previewTokens(null));
    assert.deepEqual(slot.declarations, [], `${property}: ${value} must not be drawn`);
    assert.ok(slot.reason, `${property}: ${value} must say why`);

    // And it is refused through the whole path, not merely by one helper.
    const projected = contract.projectSpec(
      { archetype: 'button', properties: { [property]: value } },
      contract.previewTokens(null),
      'default',
    );
    assert.equal(projected.style, '', `${value} reached the style attribute`);
    const { html } = contract.previewElementHtml(
      { name: 'X', archetype: 'button', properties: { [property]: value } },
      contract.previewTokens(null),
      'default',
    );
    assert.equal(styles(html)[0], '', html);
    assert.ok(!/onload|position:fixed|url\(|expression\(/.test(html), html);
  }

  // A token whose recorded value is hostile is refused just the same — the gate
  // runs after resolution, not before it.
  const doctored = contract.previewTokens({
    tokens: { colours: [{ token: 'color-evil', value: '#fff;position:fixed' }] },
  });
  const slot = contract.projectSlot('background', 'color-evil', doctored);
  assert.deepEqual(slot.declarations, []);
  assert.equal(slot.reason, contract.UNRENDERED.unresolved);
});

test('the hard half of the gate refuses a shape whatever else it wears', () => {
  const contract = previewContract();
  for (const value of ['#fff;x', 'a"b', "a'b", 'a\\b', 'a<b', 'a>b', 'a{b', 'a}b', 'a/*b*/', 'url(x)', 'attr(x)', '']) {
    assert.equal(contract.isSafeDeclaration(value), false, `${value} must be refused outright`);
  }
  for (const value of ['#2563EB', '12px 16px', 'linear-gradient(#fff, #eee)', 'rgba(0,0,0,0.5)']) {
    assert.ok(contract.isSafeDeclaration(value), `${value} is an ordinary value`);
  }
});

// ---------------------------------------------------------------------------
// 4. The toggles — variants, and states
// ---------------------------------------------------------------------------

test('variant siblings group by base name, and a lone component shows no toggle', () => {
  const contract = previewContract();
  const components = [
    { name: 'Button/Primary', archetype: 'button', properties: { background: '#2563EB' } },
    { name: 'Button/Ghost', archetype: 'button', properties: { background: '#FFFFFF' } },
    { name: 'Card/Basic', archetype: 'card', properties: {} },
  ];
  const groups = contract.previewVariantGroups(components);
  assert.deepEqual(groups.map((group) => group.base), ['Button', 'Card']);
  assert.deepEqual(groups[0].members.map((member) => member.variant), ['Primary', 'Ghost']);
  assert.deepEqual(groups[1].members.map((member) => member.index), [2]);

  const tokens = contract.previewTokens(null);
  const withSiblings = contract.previewPanelHtml(components, 0, tokens, 'default');
  const buttons = [...withSiblings.matchAll(/data-preview-variant="(\d+)"/g)].map((match) => match[1]);
  assert.deepEqual(buttons, ['0', '1'], 'one button per variant, in file order');
  assert.match(withSiblings, /data-preview-variant="0" aria-selected="true"/, 'the shown one is active');
  assert.match(withSiblings, /data-preview-variant="1" aria-selected="false"/);

  const alone = contract.previewPanelHtml(components, 2, tokens, 'default');
  assert.ok(!alone.includes('data-preview-variant'), 'a component with no siblings shows no toggle');
  assert.ok(alone.includes('preview__stage'), 'but it still shows a preview');

  // A component with no slash at all is its own base, not everyone's.
  const flat = contract.previewVariantGroups([{ name: 'Ribbon' }, { name: 'Banner' }]);
  assert.deepEqual(flat.map((group) => group.base), ['Ribbon', 'Banner']);
});

test('a state overlays the base properties, and a spec with no states shows no state toggle', () => {
  const contract = previewContract();
  const spec = {
    name: 'Button/Primary',
    archetype: 'button',
    properties: { background: '#2563EB', 'text-colour': '#FFFFFF' },
    states: { hover: { background: '#1D4ED8' }, disabled: 'TODO' },
  };
  assert.deepEqual(contract.previewStates(spec), ['default', 'hover', 'disabled']);

  const base = contract.projectSpec(spec, contract.previewTokens(null), 'default');
  assert.deepEqual(Object.fromEntries(base.declarations), { background: '#2563EB', color: '#FFFFFF' });

  const hover = contract.projectSpec(spec, contract.previewTokens(null), 'hover');
  assert.deepEqual(
    Object.fromEntries(hover.declarations),
    { background: '#1D4ED8', color: '#FFFFFF' },
    'the state slot overlays the base, the untouched slot survives',
  );

  const panel = contract.previewPanelHtml([spec], 0, contract.previewTokens(null), 'hover');
  assert.deepEqual(
    [...panel.matchAll(/data-preview-state="([^"]+)"/g)].map((match) => match[1]),
    ['default', 'hover', 'disabled'],
  );
  assert.match(panel, /data-preview-state="hover" aria-selected="true"/);
  assert.match(panel, /data-state="hover"/, 'the panel records which reading is shown');

  const stateless = contract.previewPanelHtml(
    [{ name: 'Card/Basic', archetype: 'card', properties: {}, states: {} }],
    0,
    contract.previewTokens(null),
    'default',
  );
  assert.ok(!stateless.includes('data-preview-state'), 'one state is not a choice');

  // An unknown state name falls back to the base reading rather than to nothing.
  const unknown = contract.previewPanelHtml([spec], 0, contract.previewTokens(null), 'nonsense');
  assert.match(unknown, /data-state="default"/);
});

// ---------------------------------------------------------------------------
// 4b. The attribute controls — icon slots (v0.5.1 §5)
// ---------------------------------------------------------------------------

/** A button spec recording both icon slots, with the readings a test wants. */
const iconSpec = (leading, trailing) => ({
  name: 'Button/Primary',
  archetype: 'button',
  custom: false,
  properties: Object.assign(
    { background: '#2563EB' },
    leading === undefined ? {} : { 'leading-icon': leading },
    trailing === undefined ? {} : { 'trailing-icon': trailing },
  ),
  states: {},
});

/** The controls a panel offers, as slot → whether it reads as shown. */
const controls = (html) =>
  Object.fromEntries(
    [...html.matchAll(/data-preview-attribute="([^"]+)" aria-pressed="(true|false)"/g)].map((match) => [
      match[1],
      match[2] === 'true',
    ]),
  );

test('the toggleable-slot tables and the page constants say the same thing', () => {
  const contract = previewContract();

  const rows = tableAfter(readRefText(PREVIEW_REF), '<!-- phyllum:preview-attributes -->', 'refs/gui/component-preview.md');
  assert.equal(rows.length, 2, 'the attribute layer is the icon pair and nothing else this release');
  for (const [slot, position, shape] of rows) {
    const rule = contract.PREVIEW.attributes[stripTicks(slot)];
    assert.ok(rule, `the page has no attribute rule for ${stripTicks(slot)}`);
    assert.equal(rule.position, stripTicks(position), `${slot} sits somewhere else in the page`);
    assert.equal(rule.shape, stripTicks(shape));
    assert.ok(contract.PREVIEW_SHAPES[rule.shape], `${rule.shape} is not a gate the page implements`);
  }
  assert.deepEqual(
    Object.keys(contract.PREVIEW.attributes).sort(),
    rows.map((row) => stripTicks(row[0])).sort(),
    'the page offers exactly the slots the table declares',
  );

  // The recorded reading → where the control starts.
  const presence = tableAfter(readRefText(PREVIEW_REF), '<!-- phyllum:preview-presence -->', 'refs/gui/component-preview.md');
  assert.ok(presence.length >= 4, 'both readings are recorded');
  for (const [reading, starts] of presence) {
    const key = stripTicks(reading).toLowerCase();
    assert.ok(
      Object.prototype.hasOwnProperty.call(contract.PREVIEW.presence, key),
      `the page cannot read the recorded reading ${key}`,
    );
    assert.equal(
      contract.PREVIEW.presence[key],
      stripTicks(starts) === 'shown',
      `${key} starts somewhere else in the page`,
    );
  }
  assert.equal(
    Object.keys(contract.PREVIEW.presence).length,
    presence.length,
    'the page reads exactly the readings the table declares',
  );

  // And which archetypes may carry an icon slot at all is the archetype ref's.
  const carriers = tableAfter(readRefText(ARCHETYPE_REF), '<!-- phyllum:icon-slots -->', 'refs/create/archetypes.md');
  assert.ok(carriers.length >= 1, 'at least one archetype records icon slots');
  for (const [archetype, slots] of carriers) {
    const key = archetype.trim().toLowerCase();
    assert.deepEqual(
      contract.PREVIEW.attributeArchetypes[key],
      listCell(slots),
      `${key} carries different icon slots in the page and the table`,
    );
    for (const slot of listCell(slots)) {
      assert.ok(contract.PREVIEW.attributes[slot], `${slot} is not a slot the attribute table declares`);
    }
  }
  assert.equal(
    Object.keys(contract.PREVIEW.attributeArchetypes).length,
    carriers.length,
    'the page draws icon slots for exactly the archetypes the table declares',
  );
});

test('a pressed attribute control wears the same active treatment as a selected toggle', () => {
  const page = readPage();
  const active = page.match(/button\.tile-action\[aria-selected='true'\][^{]*\{[^}]*\}/);
  assert.ok(active, 'the active tile-action rule exists');
  assert.match(
    active[0],
    /button\.tile-action\[aria-pressed='true'\]/,
    'aria-pressed shares the aria-selected active style — an on control must look on',
  );
});

test('a control appears only for a slot the spec records', () => {
  const contract = previewContract();
  const tokens = contract.previewTokens(null);

  const both = contract.previewPanelHtml([iconSpec('yes', 'optional')], 0, tokens, 'default');
  assert.deepEqual(controls(both), { 'leading-icon': true, 'trailing-icon': false });

  // A spec with no trailing icon shows no trailing-icon control.
  const leadingOnly = contract.previewPanelHtml([iconSpec('yes')], 0, tokens, 'default');
  assert.deepEqual(controls(leadingOnly), { 'leading-icon': true });
  assert.ok(!leadingOnly.includes('trailing-icon'), 'a slot the file never recorded is nowhere on the panel');

  // And a spec recording neither shows no attribute row at all.
  const none = contract.previewPanelHtml([iconSpec()], 0, tokens, 'default');
  assert.ok(!none.includes('data-preview-attribute'), 'no recorded icon slot, no controls');
  assert.ok(!none.includes('data-toggle="attribute"'), 'and no empty row where the controls would be');
  assert.ok(none.includes('preview__stage'), 'but the preview is still drawn');

  // The fixture's own button records no icon slot, so it gains nothing.
  const system = FIXTURE_SYSTEM();
  const fixture = contract.previewPanelHtml(system.components, 0, contract.previewTokens(system), 'default');
  assert.ok(!fixture.includes('data-preview-attribute'), 'the shipped fixture records no icon slot');
  assert.ok(!fixture.includes('preview__icon'), 'and draws no placeholder');
});

test('a TODO icon slot gets no control and keeps its unrendered line', () => {
  const contract = previewContract();
  const tokens = contract.previewTokens(null);
  for (const written of ['TODO', 'TODO: decide', '']) {
    const spec = iconSpec(written, 'yes');
    const projected = contract.projectSpec(spec, tokens, 'default');
    assert.deepEqual(
      projected.attributes.map((entry) => entry.slot),
      ['trailing-icon'],
      `${written || 'an empty slot'} must not become a switch`,
    );
    assert.ok(
      projected.unrendered.some(
        (entry) => entry.slot === 'leading-icon' && entry.reason === contract.UNRENDERED.todo,
      ),
      'the gap is stated as a gap',
    );
    const panel = contract.previewPanelHtml([spec], 0, tokens, 'default');
    assert.deepEqual(Object.keys(controls(panel)), ['trailing-icon']);
    assert.match(panel, /leading-icon[^<]*— TODO/, 'and it keeps its line under the preview');
  }
});

test('a gated-out icon reading stays out, with the control still there', () => {
  const contract = previewContract();
  const tokens = contract.previewTokens(null);
  for (const hostile of ['#FF0000', '16px', 'yes;position:fixed', 'maybe', 'url(x.svg)']) {
    const spec = iconSpec(hostile, 'yes');
    const projected = contract.projectSpec(spec, tokens, 'default');
    const control = projected.attributes.find((entry) => entry.slot === 'leading-icon');
    assert.ok(control, `${hostile} is still a recorded slot, so it still earns a control`);
    assert.equal(control.recorded, false, 'a reading the page cannot classify starts hidden');
    assert.equal(control.shown, false);
    assert.ok(
      projected.unrendered.some(
        (entry) => entry.slot === 'leading-icon' && entry.reason === contract.UNRENDERED.unresolved,
      ),
      `${hostile} must say why it was not read`,
    );

    // And the refused reading never reaches a style attribute, on the element
    // or on the placeholder.
    const { html } = contract.previewElementHtml(spec, tokens, 'default', { 'leading-icon': true });
    assert.equal(styles(html)[0], 'background:#2563EB', html);
    assert.ok(!html.includes(hostile), html);
    assert.ok(!/position:fixed|url\(|16px|#FF0000/.test(html), html);
  }
});

test('an icon slot draws one child dot, leading or trailing, and no style of its own', () => {
  const contract = previewContract();
  const tokens = contract.previewTokens(null);
  const { html, projected } = contract.previewElementHtml(iconSpec('yes', 'required'), tokens, 'default');

  assert.deepEqual(projected.icons.map((entry) => entry.slot), ['leading-icon', 'trailing-icon']);
  assert.equal((html.match(/<span class="preview__icon"/g) ?? []).length, 2, 'one child box per shown slot');
  assert.match(
    html,
    /^<button class="preview__element" style="background:#2563EB"><span class="preview__icon" data-icon="leading-icon" data-position="leading" aria-hidden="true"><\/span>Primary<span class="preview__icon" data-icon="trailing-icon" data-position="trailing" aria-hidden="true"><\/span><\/button>$/,
    html,
  );
  assert.equal(styles(html).length, 1, 'the placeholder carries no style attribute — it is the page’s mark');

  // The dot is the page's muted ink, sized in em from the component's own font.
  const rule = readPage().match(/\.preview__icon\s*\{([^}]*)\}/);
  assert.ok(rule, 'the placeholder is styled by the page');
  assert.match(rule[1], /border-radius:\s*50%/, 'a filled dot is a circle');
  assert.match(rule[1], /background:\s*var\(--muted\)/, 'in the page’s muted ink');
  assert.match(rule[1], /width:\s*[\d.]+em/, 'sized from the component’s font size');
  assert.ok(!/url\(|<img|svg/i.test(rule[1] + html), 'no icon font, no asset, no glyph');
});

test('an archetype whose contract records no icon slot draws none', () => {
  const contract = previewContract();
  const tokens = contract.previewTokens(null);

  // A card records one anyway: it is listed, never drawn, and earns no control.
  const card = { name: 'Card/Basic', archetype: 'card', custom: false, properties: { 'leading-icon': 'yes' }, states: {} };
  const projected = contract.projectSpec(card, tokens, 'default');
  assert.deepEqual(projected.attributes, [], 'the contract says a card has no icon slot');
  assert.deepEqual(
    projected.unrendered.map((entry) => [entry.slot, entry.reason]),
    [['leading-icon', contract.UNRENDERED.unprojectable]],
  );

  // A void element cannot hold a child box, whatever its contract says.
  const field = { name: 'Input/Text', archetype: 'input', custom: false, properties: { 'leading-icon': 'yes' }, states: {} };
  const voided = contract.projectSpec(field, tokens, 'default');
  assert.deepEqual(voided.attributes, []);
  assert.equal(voided.unrendered[0].reason, contract.UNRENDERED.unprojectable);

  // A custom component has no contract, so it carries what it carries.
  const custom = { name: 'Ribbon', archetype: 'custom', custom: true, properties: { 'trailing-icon': 'yes' }, states: {} };
  const carried = contract.projectSpec(custom, tokens, 'default');
  assert.deepEqual(carried.attributes.map((entry) => entry.slot), ['trailing-icon']);
  assert.deepEqual(contract.attributeSlotsFor(custom), Object.keys(contract.PREVIEW.attributes));
  assert.deepEqual(contract.attributeSlotsFor(card), []);
  assert.deepEqual(contract.attributeSlotsFor({ archetype: 'button' }), ['leading-icon', 'trailing-icon']);
});

test('flipping a control changes the projection only — never the spec, never the payload', () => {
  const contract = previewContract();
  const tokens = contract.previewTokens(null);
  const spec = iconSpec('optional', 'optional');
  const before = JSON.stringify(spec);

  const off = contract.previewPanelHtml([spec], 0, tokens, 'default', {});
  const on = contract.previewPanelHtml([spec], 0, tokens, 'default', { 'leading-icon': true });

  assert.deepEqual(controls(off), { 'leading-icon': false, 'trailing-icon': false });
  assert.deepEqual(controls(on), { 'leading-icon': true, 'trailing-icon': false });
  assert.ok(!off.includes('preview__icon'), 'nothing recorded as hidden is drawn');
  assert.equal((on.match(/preview__icon/g) ?? []).length, 1, 'exactly the flipped slot is drawn');
  assert.match(on, /data-icons="leading-icon"/);
  assert.match(off, /data-icons=""/);

  // The element's inline styles are the same either way: a control changes
  // children, never a declaration.
  assert.deepEqual(styles(off), styles(on));

  // And the spec object the panel was handed is untouched, so the `yaml` block
  // and the `/system` payload the page holds read exactly as the file does.
  assert.equal(JSON.stringify(spec), before, 'the projection wrote back into the spec');
  const system = FIXTURE_SYSTEM();
  const payload = JSON.stringify(system);
  contract.previewPanelHtml(system.components, 0, contract.previewTokens(system), 'default', {
    'leading-icon': true,
    'trailing-icon': true,
  });
  assert.equal(JSON.stringify(system), payload, 'the served payload is unchanged by any toggle');
  assert.equal(JSON.stringify(systemJson(readFixture(POPULATED_FIXTURE))), payload);
});

test('a variant or a state switch resets the attribute controls to the recorded reading', () => {
  const contract = previewContract();
  const tokens = contract.previewTokens(null);

  // The reset is the page's: both switches clear the flipped map before
  // re-rendering, so the panel is rebuilt from the file's own reading.
  const text = readPage();
  const handler = text.slice(text.indexOf('// The three toggle rows'), text.indexOf("for (const id of ['component-list'"));
  assert.match(handler, /previewVariant !== undefined[\s\S]*?state\.previewIcons = \{\};/, 'a variant switch resets them');
  assert.match(handler, /previewState !== undefined[\s\S]*?state\.previewIcons = \{\};/, 'a state switch resets them');
  assert.match(handler, /previewVariant !== undefined[\s\S]*?state\.previewState = PREVIEW\.baseState;/, 'and the state row');
  assert.match(handler, /previewAttribute !== undefined/, 'and the controls are wired at all');
  assert.match(text, /previewIcons: \{\},/, 'the empty map is the recorded reading');

  // Rendered with no flips, both siblings read as their own file says.
  const siblings = [iconSpec('yes', 'no'), Object.assign(iconSpec('optional'), { name: 'Button/Ghost' })];
  assert.deepEqual(controls(contract.previewPanelHtml(siblings, 0, tokens, 'default', {})), {
    'leading-icon': true,
    'trailing-icon': false,
  });
  assert.deepEqual(controls(contract.previewPanelHtml(siblings, 1, tokens, 'default', {})), {
    'leading-icon': false,
  });

  // A state may record its own reading, and it overlays like any other slot.
  const stateful = {
    name: 'Button/Primary',
    archetype: 'button',
    properties: { 'leading-icon': 'no' },
    states: { hover: { 'leading-icon': 'yes' } },
  };
  assert.equal(contract.projectSpec(stateful, tokens, 'default').attributes[0].shown, false);
  assert.equal(contract.projectSpec(stateful, tokens, 'hover').attributes[0].shown, true);
});

test('the attribute row survives a malformed payload and an empty control list', () => {
  const contract = previewContract();
  assert.equal(contract.previewAttributeRowHtml([]), '');
  assert.equal(contract.previewAttributeRowHtml(null), '');
  assert.equal(contract.previewAttributeRowHtml(undefined), '');
  for (const spec of [null, {}, { archetype: 'button', properties: { 'leading-icon': null } }]) {
    const projected = contract.projectSpec(spec, contract.previewTokens(null), 'default', 'not a map');
    assert.ok(Array.isArray(projected.attributes));
    assert.ok(Array.isArray(projected.icons));
  }
});

// ---------------------------------------------------------------------------
// 5. Placement, treatment, and what did not change
// ---------------------------------------------------------------------------

test('the preview is the panel section above the yaml and jsx blocks, which are unchanged', () => {
  const text = readPage();
  const detail = text.slice(text.indexOf('function showComponent'), text.indexOf('// The two toggle rows'));
  const preview = detail.indexOf('previewPanelHtml');
  const blocks = detail.indexOf("'</code></pre>'");
  assert.ok(preview !== -1 && blocks !== -1, 'the panel builds both');
  // The heading gained the `applied` badge in v0.5.0 §3.4 and nothing else moved:
  // the preview still comes before the blocks, and the blocks are still whole.
  assert.match(
    detail,
    /innerHTML =\s*'<h3>' \+ esc\(component\.name\) \+ appliedBadge\(component\) \+ '<\/h3>' \+ preview \+ blocks;/,
    'the preview is written before the blocks, and the blocks are still printed whole',
  );
});

test('the preview borrows the page palette and adds no colour or font of its own', () => {
  const text = readPage();
  const rules = [...text.matchAll(/(\.preview[\w_-]*)\s*\{([^}]*)\}/g)].map((match) => ({
    selector: match[1],
    body: match[2],
  }));
  assert.ok(rules.length >= 5, 'the preview is styled');

  // v0.5.1 §3: the stage is restyled with the rest of the page and rounds like
  // every other surface, but it rounds off the page's own scale — and the
  // specimen inside it is never touched. A corner the page chose is a corner
  // the file never recorded.
  for (const { selector, body } of rules) {
    for (const [, radius] of body.matchAll(/border-radius:\s*([^;]+);/g)) {
      assert.notEqual(selector, '.preview__element', 'the previewed component takes no radius from the page');
      // v0.5.1 §5.3: the icon placeholder is a dot, and a dot is a circle
      // rather than a corner anybody recorded — the one radius on the stage
      // that is not a step on the page's scale.
      if (selector === '.preview__icon') {
        assert.equal(radius.trim(), '50%', 'the icon placeholder is a circle');
        continue;
      }
      assert.match(radius.trim(), /^var\(--radius-(sm|md)\)$/, `${selector} rounds off the page's radius scale`);
    }
  }

  for (const { body: rule } of rules) {
    for (const [, , colour] of rule.matchAll(/(background|color|border-color):\s*([^;]+);/g)) {
      assert.ok(
        /^(var\(--[\w-]+\)|transparent|inherit)$/.test(colour.trim()),
        `the preview introduces a colour of its own: ${colour}`,
      );
    }
    assert.ok(!/font-family/.test(rule), 'the preview names no font of its own');
    for (const [, size] of rule.matchAll(/font-size:\s*([^;]+);/g)) {
      assert.match(size.trim(), /^var\(--type-0[1-5]\)$/, `${size} is outside the five-step ramp`);
    }
  }
  // The toggles are the page's existing button idiom, and the unrendered list
  // its existing chip.
  assert.ok(text.includes("'<button class=\"tile-action\" data-preview-'"), 'toggles reuse tile-action');
  assert.ok(text.includes("'<span class=\"chip raw\">'"), 'unrendered slots reuse the raw chip');
});

test('the preview added no network access and no server route', () => {
  const text = readPage();
  assert.equal(text.match(/https?:\/\//g), null, 'the page still fetches nothing external');
  const requests = [...text.matchAll(/fetch\(\s*'([^']+)'/g)].map((match) => match[1]);
  for (const route of requests) assert.match(route, /^\/(state|system|prompt|upload)$/);
  // Nothing in the preview reads the stored code block: it projects the spec.
  const preview = code(region(text, 'preview-contract'));
  assert.ok(!/\bimport\b|\brequire\(|createElement/.test(preview), 'the projection loads nothing');
  assert.ok(!/\bjsx\b|\beval\b|new Function|innerHTML|\bblocks\b/.test(preview), 'the projection executes nothing');

  const server = fs.readFileSync(path.join(PACKAGE_ROOT, 'server', 'serve.py'), 'utf8');
  const routes = [...server.matchAll(/path == "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(new Set(routes), new Set(['/state', '/system', '/prompt', '/upload']));
  assert.equal(server.match(/def do_(GET|HEAD|POST)/g).length, 3);
});

test('the preview renders a malformed payload rather than throwing on it', () => {
  const contract = previewContract();
  const hostile = [
    null,
    undefined,
    'not a component',
    {},
    { name: null, properties: null, states: null },
    { name: 'X', archetype: 42, properties: { background: null }, states: 'nope' },
    { name: 'X', properties: { background: '#fff' }, states: { hover: null } },
  ];
  for (const spec of hostile) {
    const projected = contract.projectSpec(spec, contract.previewTokens(null), 'default');
    assert.equal(typeof projected.style, 'string');
    assert.ok(Array.isArray(projected.unrendered));
    assert.ok(typeof contract.previewPanelHtml([spec], 0, contract.previewTokens(null), 'default') === 'string');
  }
  assert.deepEqual(contract.previewVariantGroups(null), []);
  assert.equal(contract.previewPanelHtml([], 0, contract.previewTokens(null), 'default'), '');
  assert.deepEqual(contract.previewTokens('not a system'), { values: {}, typography: {} });
});
