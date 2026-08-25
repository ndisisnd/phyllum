/**
 * Assertions for `refine a11y` (v0.11.0 phase 4).
 *
 * The gate's fourth section, and the first one that asks about the people who
 * will use what was built. Six promises, and each one is a way the section
 * could have quietly overclaimed:
 *
 *   - **The arithmetic is WCAG's.** Black on white is 21, a colour on itself is
 *     1, and the canonical boundary greys land where the standard says they do.
 *     A luminance formula that is nearly right fails nothing and passes
 *     everything that should fail.
 *   - **A pair is one somebody recorded.** Two colours are compared only where a
 *     component spec binds both, states included. A colour nothing pairs is
 *     reported unpaired, not checked against every other colour in the table.
 *   - **An interactive archetype needs a focus treatment.** Either spelling
 *     counts; neither is a finding; a non-interactive archetype is not asked.
 *   - **An ARIA row is checked against markup, and the native element counts.**
 *     A real `<button>` has met the role. A hand-written role owes its
 *     attributes, and missing one is the finding.
 *   - **What could not be read is stated, never failed.** An unbuilt component,
 *     an unreadable colour, a translucent pair, an archetype with no row — each
 *     gets a sentence, and none of them gets an error.
 *   - **Nothing is written.** The whole directory is diffed around every call,
 *     and the module source is checked for write calls.
 *
 * The rules, the thresholds, the pairings and the ARIA rows are read from
 * `refs/refine/a11y.md` rather than restated here, so an edit to the reference
 * moves this suite with it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse } from '../../lib/design-system.js';
import {
  STATED_CAVEATS,
  ariaReading,
  boundColour,
  colourIndex,
  contrastRatio,
  focusReading,
  pairsFor,
  refineA11y,
  relativeLuminance,
  roundRatio,
  rules,
  slotsInState,
  textContext,
  typographyIndex,
  unpairedTokens,
} from '../../lib/refine-a11y.js';
import {
  a11yRules,
  ariaExpectationFor,
  contrastThresholdFor,
  refineSeverityFor,
} from '../../lib/refine-spec.js';
import { parseSpecBlock } from '../../lib/create.js';
import { diffSnapshots, snapshotContents, withTempDir } from './helpers.js';

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

/**
 * The palette every case below draws from, chosen so the numbers are the
 * standard's own boundaries rather than arbitrary colours:
 *
 *   #767676 on white is 4.54 — the smallest grey that clears normal text
 *   #777777 on white is 4.48 — one shade lighter, and it does not
 *   #949494 on white is 3.03 — the smallest grey that clears a UI boundary
 *   #BBBBBB on white is 1.92 — and this one does not
 */
const COLOURS = [
  ['surface-default', '#FFFFFF'],
  ['text-strong', '#767676'],
  ['text-weak', '#777777'],
  ['border-strong', '#949494'],
  ['border-weak', '#BBBBBB'],
  ['ink-deep', '#111827'],
  ['veil-half', 'rgba(17, 24, 39, 0.5)'],
];

const TYPOGRAPHY = [
  ['type-body', '16px', '400', '1.5'],
  ['type-display', '32px', '400', '1.2'],
];

/** A design system carrying the palette above and whatever components a case needs. */
function designSystem(components) {
  return [
    '# Design System',
    '',
    "> Phyllum manages this file. It is the single source of truth for this project's design system.",
    '',
    '- Project: refine-a11y',
    '- Phyllum version: 0.10.0',
    '- Created: 2026-08-25',
    '',
    '## Tokens',
    '',
    '### Colours',
    '',
    '| token | value |',
    '| --- | --- |',
    ...COLOURS.map(([token, value]) => `| ${token} | ${value} |`),
    '',
    '### Numbers',
    '',
    '| token | value | applies to |',
    '| --- | --- | --- |',
    '| radius-sm | 4px | radius |',
    '',
    '### Typography',
    '',
    '| token | size | weight | line-height |',
    '| --- | --- | --- | --- |',
    ...TYPOGRAPHY.map((row) => `| ${row.join(' | ')} |`),
    '',
    '## Components',
    '',
    ...components.flatMap(({ name, spec }) => [`### ${name}`, '', '```yaml', ...spec, '```', '']),
    '## Backlog',
    '',
    '_Nothing outstanding._',
    '',
  ].join('\n');
}

/** A button spec, with whatever slots and states the case wants written over it. */
function buttonSpec({ text = 'text-strong', background = 'surface-default', extra = [], states = ['  hover:', '    background: surface-default'] } = {}) {
  return [
    'name: Button',
    'archetype: button',
    'properties:',
    `  background: ${background}`,
    `  text-colour: ${text}`,
    '  border-colour: border-strong',
    '  radius: radius-sm',
    '  typography: type-body',
    ...extra,
    'states:',
    ...states,
  ];
}

const BUTTON_MARKUP = [
  'export function Button({ children }) {',
  '  return <button className="button">{children}</button>;',
  '}',
  '',
].join('\n');

/** A project with a design system and, optionally, some markup files. */
function project(dir, components, files = {}) {
  const text = designSystem(components);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'DESIGN-SYSTEM.md'), text);
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'sample', dependencies: { react: '^18.0.0' } }),
  );
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return parse(text);
}

const rulesIn = (findings) => findings.map((row) => row.rule).sort();
const specFor = (lines) => parseSpecBlock(lines.join('\n'));

// ---------------------------------------------------------------------------
// The arithmetic
// ---------------------------------------------------------------------------

test('relative luminance is WCAG 2.x, black to white', () => {
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#FFFFFF'), 1);
  assert.equal(relativeLuminance('not a colour'), null, 'a non-colour has no luminance to report');
});

test('the contrast ratio matches the standard at its own reference values', () => {
  assert.equal(roundRatio(contrastRatio('#000000', '#FFFFFF')), 21, 'black on white is the ceiling');
  assert.equal(roundRatio(contrastRatio('#FFFFFF', '#000000')), 21, 'the order of the pair is irrelevant');
  assert.equal(roundRatio(contrastRatio('#2563EB', '#2563EB')), 1, 'a colour on itself is the floor');
  // The canonical boundary greys: the smallest that clears 4.5, and the next
  // shade lighter, which does not.
  assert.equal(roundRatio(contrastRatio('#767676', '#FFFFFF')), 4.54);
  assert.equal(roundRatio(contrastRatio('#777777', '#FFFFFF')), 4.48);
  assert.equal(roundRatio(contrastRatio('#949494', '#FFFFFF')), 3.03);
  assert.equal(roundRatio(contrastRatio('#0000FF', '#FFFFFF')), 8.59);
  assert.equal(contrastRatio('#FFFFFF', 'shrubbery'), null, 'a pair with an unreadable side has no ratio');
});

test('the thresholds are the reference table\'s, not the code\'s', () => {
  assert.equal(contrastThresholdFor('normal-text'), 4.5);
  assert.equal(contrastThresholdFor('large-text'), 3);
  assert.equal(contrastThresholdFor('ui-component'), 3);
});

// ---------------------------------------------------------------------------
// Where a pair comes from
// ---------------------------------------------------------------------------

test('a pair is derived from slots one spec binds together, and only from those', () => {
  const spec = specFor(buttonSpec());
  const pairs = pairsFor(spec);
  const stated = pairs.map((pair) => `${pair.foregroundSlot}/${pair.backgroundSlot}`).sort();
  assert.deepEqual(stated, ['border-colour/background', 'text-colour/background']);
  assert.equal(
    pairs.find((pair) => pair.foregroundSlot === 'text-colour').context,
    'normal-text',
  );
  assert.equal(
    pairs.find((pair) => pair.foregroundSlot === 'border-colour').context,
    'ui-component',
    'a boundary is a UI component, not text',
  );
});

test('a slot the spec never fills states no pair at all', () => {
  // A Card records no `text-colour`, so it states a boundary pair and no text
  // pair. That is the archetype, not a gap.
  const spec = specFor([
    'name: Card',
    'archetype: card',
    'properties:',
    '  background: surface-default',
    '  border-colour: border-strong',
  ]);
  assert.deepEqual(
    pairsFor(spec).map((pair) => pair.foregroundSlot),
    ['border-colour'],
  );
});

test('a state that overrides one side makes a second pair; one that overrides neither does not', () => {
  const overriding = specFor(
    buttonSpec({ states: ['  hover:', '    background: ink-deep', '  disabled:', '    radius: radius-sm'] }),
  );
  const pairs = pairsFor(overriding);
  const hover = pairs.filter((pair) => pair.state === 'hover');
  assert.equal(hover.length, 2, 'the hover background re-pairs with the text and the border');
  assert.equal(hover[0].background, 'ink-deep');
  assert.equal(
    pairs.filter((pair) => pair.state === 'disabled').length,
    0,
    'a state that changes no colour restates the base pair, and one pair twice is one pair wrong',
  );
});

test('the slot map a state sees is the base written over, not replaced', () => {
  const spec = specFor(buttonSpec({ states: ['  hover:', '    background: ink-deep'] }));
  const hover = slotsInState(spec, 'hover');
  assert.equal(hover.background, 'ink-deep', 'the state wins where it speaks');
  assert.equal(hover['text-colour'], 'text-strong', 'the label did not move');
  assert.equal(slotsInState(spec, 'nothing'), null, 'a state nobody recorded has no map');
});

// ---------------------------------------------------------------------------
// Contrast findings
// ---------------------------------------------------------------------------

test('a recorded text pair below 4.5 is an error, and the finding carries the ratio', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, [{ name: 'Button', spec: buttonSpec({ text: 'text-weak' }) }], {
      'src/Button.jsx': BUTTON_MARKUP,
    });
    const result = refineA11y(dir, model);
    const failures = result.findings.filter((row) => row.rule === 'contrast-fail');

    assert.equal(failures.length, 1);
    assert.equal(failures[0].severity, refineSeverityFor('contrast-fail'));
    assert.equal(failures[0].severity, 'error');
    assert.equal(failures[0].value, '4.48:1');
    assert.match(failures[0].detail, /below the 4.5:1/);
    assert.match(failures[0].evidence[0], /#777777/, 'the finding names the values it measured');
    assert.equal(result.pass, false);
  });
});

test('the same pair passes at 4.54 — the bar is the standard\'s, not a rounding', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, [{ name: 'Button', spec: buttonSpec() }], { 'src/Button.jsx': BUTTON_MARKUP });
    const result = refineA11y(dir, model);
    assert.equal(rulesIn(result.findings).includes('contrast-fail'), false);
    const [button] = result.components;
    const text = button.contrast.pairs.find((pair) => pair.foregroundSlot === 'text-colour');
    assert.equal(text.ratio, 4.54);
    assert.equal(text.pass, true);
  });
});

test('a UI boundary is held to 3:1, not to 4.5:1', async () => {
  await withTempDir(async (dir) => {
    const passing = project(dir, [{ name: 'Button', spec: buttonSpec() }], { 'src/Button.jsx': BUTTON_MARKUP });
    const border = refineA11y(dir, passing)
      .components[0].contrast.pairs.find((pair) => pair.foregroundSlot === 'border-colour');
    assert.equal(border.ratio, 3.03);
    assert.equal(border.required, 3);
    assert.equal(border.pass, true, 'a 3.03 boundary would have failed a text bar and is not text');
  });
});

test('a boundary below 3:1 fails, and says which context set the bar', async () => {
  await withTempDir(async (dir) => {
    const spec = buttonSpec();
    const model = project(
      dir,
      [{ name: 'Button', spec: spec.map((line) => line.replace('border-strong', 'border-weak')) }],
      { 'src/Button.jsx': BUTTON_MARKUP },
    );
    const [found] = refineA11y(dir, model).findings.filter((row) => row.rule === 'contrast-fail');
    assert.equal(found.value, '1.92:1');
    assert.match(found.detail, /ui-component context requires/);
  });
});

test('large type earns the large-text bar, and a component with no typography does not', () => {
  const model = parse(designSystem([]));
  const typography = typographyIndex(model);
  assert.equal(textContext(specFor(buttonSpec()), typography), 'normal-text');
  const display = specFor(['name: Display', 'archetype: badge', 'properties:', '  typography: type-display']);
  assert.equal(textContext(display, typography), 'large-text', '32px is past the 24px cut-off');
  assert.equal(
    textContext(specFor(['name: Bare', 'archetype: badge', 'properties:', '  background: surface-default']), typography),
    'normal-text',
    'no recorded type size means the stricter bar, never a discount',
  );
});

test('a 4.48 pair that fails as body text passes as display text', async () => {
  await withTempDir(async (dir) => {
    const spec = buttonSpec({ text: 'text-weak' }).map((line) =>
      line.replace('typography: type-body', 'typography: type-display'),
    );
    const model = project(dir, [{ name: 'Button', spec }], { 'src/Button.jsx': BUTTON_MARKUP });
    const result = refineA11y(dir, model);
    assert.equal(result.components[0].contrast.context, 'large-text');
    assert.equal(rulesIn(result.findings).includes('contrast-fail'), false);
  });
});

// ---------------------------------------------------------------------------
// What cannot be measured — stated, never failed
// ---------------------------------------------------------------------------

test('an unfilled, unknown or translucent side is a warn, and names its reason', () => {
  const colours = colourIndex(parse(designSystem([])));
  assert.equal(boundColour('text-strong', colours).value, '#767676');
  assert.equal(boundColour('var(--text-strong)', colours).value, '#767676', 'a var() wrapper is a spelling');
  assert.equal(boundColour('#123456', colours).value, '#123456', 'a literal is still a colour worth measuring');
  assert.equal(boundColour('TODO', colours).readable, false);
  assert.match(boundColour('TODO', colours).reason, /unfilled/);
  assert.match(boundColour('nowhere-token', colours).reason, /no colour token is recorded/);
  assert.match(boundColour('veil-half', colours).reason, /translucent/);
});

test('an unreadable pair is a warn and does not fail the section', async () => {
  await withTempDir(async (dir) => {
    const model = project(
      dir,
      [{ name: 'Button', spec: buttonSpec({ text: 'veil-half', states: ['  focus:', '    border-colour: ink-deep'] }) }],
      { 'src/Button.jsx': BUTTON_MARKUP },
    );
    const result = refineA11y(dir, model);
    const [warn] = result.findings.filter((row) => row.rule === 'unreadable-pair');
    assert.equal(warn.severity, 'warn');
    assert.match(warn.detail, /cannot measure/);
    assert.equal(result.pass, true, 'a limit of the reading is not a fault in the component');
  });
});

test('colours no spec binds are one unpaired warning, not one per token', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, [{ name: 'Button', spec: buttonSpec() }], { 'src/Button.jsx': BUTTON_MARKUP });
    const result = refineA11y(dir, model);
    const unpaired = result.findings.filter((row) => row.rule === 'unpaired-token');

    assert.equal(unpaired.length, 1, 'forty unpaired neutrals would bury every real finding');
    assert.equal(unpaired[0].severity, 'warn');
    assert.deepEqual(result.unpaired, ['border-weak', 'ink-deep', 'text-weak', 'veil-half']);
    assert.deepEqual(unpaired[0].evidence, result.unpaired, 'the tokens are named, not counted');
    assert.equal(
      result.unpaired.includes('surface-default'),
      false,
      'a colour a spec binds is paired, and is not asked about again',
    );
  });
});

test('the tokens a state binds count as paired too', () => {
  const model = parse(designSystem([]));
  const spec = specFor(buttonSpec({ states: ['  hover:', '    background: ink-deep'] }));
  assert.equal(unpairedTokens(model, [spec]).includes('ink-deep'), false);
});

// ---------------------------------------------------------------------------
// Focus states
// ---------------------------------------------------------------------------

test('an interactive archetype with no focus treatment is an error', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, [{ name: 'Button', spec: buttonSpec() }], { 'src/Button.jsx': BUTTON_MARKUP });
    const result = refineA11y(dir, model);
    const [missing] = result.findings.filter((row) => row.rule === 'focus-missing');

    assert.equal(missing.severity, 'error');
    assert.match(missing.detail, /interactive/);
    assert.match(missing.detail, /focus-ring/, 'the finding names both ways of repairing it');
    assert.equal(result.pass, false);
  });
});

test('either spelling of a focus treatment satisfies it', () => {
  const button = ariaExpectationFor('button');
  const withState = focusReading('Button', specFor(buttonSpec({ states: ['  focus:', '    border-colour: ink-deep'] })), button);
  assert.equal(withState.pass, true);
  assert.match(withState.recorded, /focus. state/);

  const withRing = focusReading('Button', specFor(buttonSpec({ extra: ['  focus-ring: ink-deep'] })), button);
  assert.equal(withRing.pass, true);
  assert.match(withRing.recorded, /focus-ring/);

  const todo = focusReading('Button', specFor(buttonSpec({ states: ['  focus: TODO'] })), button);
  assert.equal(todo.pass, false, 'a TODO is the user saying "not yet", and is never a treatment');
});

test('a non-interactive archetype is never asked for a focus state', () => {
  const card = specFor(['name: Card', 'archetype: card', 'properties:', '  background: surface-default']);
  const reading = focusReading('Card', card, ariaExpectationFor('card'));
  assert.equal(reading.interactive, false);
  assert.equal(reading.pass, null, 'a check that does not apply is not a check that passed');
  assert.deepEqual(reading.findings, []);
});

// ---------------------------------------------------------------------------
// ARIA expectations
// ---------------------------------------------------------------------------

const readerFor = (files) => (file) => files[file] ?? null;

test('the native element carries the role and the state it implies', () => {
  const files = { 'src/Toggle.jsx': '<input type="checkbox" className="toggle" />' };
  const reading = ariaReading('Toggle', ariaExpectationFor('checkbox'), Object.keys(files), readerFor(files));
  assert.equal(reading.pass, true);
  assert.equal(reading.how, 'natively');
  assert.deepEqual(reading.findings, [], 'a real checkbox needs no aria-checked, and adding one is a way to be wrong');
});

test('a hand-written role owes its attributes, and a missing one is the finding', () => {
  const files = { 'src/Toggle.jsx': '<div role="switch" className="toggle" />' };
  const reading = ariaReading('Toggle', ariaExpectationFor('toggle'), Object.keys(files), readerFor(files));
  assert.equal(reading.pass, false);
  assert.deepEqual(reading.missing, ['aria-checked']);
  assert.equal(reading.findings[0].rule, 'aria-unmet');
  assert.equal(reading.findings[0].severity, 'error');
  assert.match(reading.findings[0].detail, /carries no state unless the state is written/);
});

test('a hand-written role with every attribute it owes passes', () => {
  const files = { 'src/Toggle.jsx': '<div role="switch" aria-checked={on} className="toggle" />' };
  const reading = ariaReading('Toggle', ariaExpectationFor('toggle'), Object.keys(files), readerFor(files));
  assert.equal(reading.pass, true);
  assert.equal(reading.how, 'explicitly');
});

test('markup with neither the element nor the role tells assistive technology nothing', () => {
  const files = { 'src/Toggle.jsx': '<div className="toggle" onClick={toggle} />' };
  const reading = ariaReading('Toggle', ariaExpectationFor('toggle'), Object.keys(files), readerFor(files));
  assert.equal(reading.findings[0].rule, 'aria-unmet');
  assert.match(reading.findings[0].detail, /assistive technology is told nothing/);
});

test('an archetype with no ARIA row is stated as having none, and is not passed', () => {
  const files = { 'src/Card.jsx': '<div className="card" />' };
  const reading = ariaReading('Card', ariaExpectationFor('card'), Object.keys(files), readerFor(files));
  assert.equal(reading.expected, false);
  assert.equal(reading.pass, null, 'a green tick here would imply a check that never happened');
  assert.match(reading.stated, /records no role and no attributes/);
  assert.deepEqual(reading.findings, []);
});

test('an unbuilt component leaves its expectation unverified — a warn, not an error', () => {
  const reading = ariaReading('Toggle', ariaExpectationFor('toggle'), [], readerFor({}));
  assert.equal(reading.pass, null);
  assert.equal(reading.findings[0].rule, 'aria-unverified');
  assert.equal(reading.findings[0].severity, 'warn');
  assert.match(reading.stated, /not built|not checked/);
});

test('markup that could not be read is unverified too, and says so', () => {
  const reading = ariaReading('Toggle', ariaExpectationFor('toggle'), ['src/Toggle.jsx'], () => null);
  assert.equal(reading.pass, null);
  assert.match(reading.stated, /could not be read/);
  assert.deepEqual(reading.findings[0].evidence, ['src/Toggle.jsx: unread']);
});

test('every archetype the contract table records has an ARIA row, and the keyboard is never verified', () => {
  const button = ariaExpectationFor('button');
  assert.equal(button.interactive, true);
  assert.match(button.keyboard, /Enter/);
  const progress = ariaExpectationFor('progress');
  assert.deepEqual(progress.attributes, ['aria-valuenow', 'aria-valuemin', 'aria-valuemax']);
  assert.equal(progress.interactive, false, 'a progress bar is read, not driven');
  const files = { 'src/Button.jsx': '<button className="button" />' };
  const reading = ariaReading('Button', button, Object.keys(files), readerFor(files));
  assert.equal(reading.keyboardVerified, false, 'whether Space activates it is a fact about a running program');
  assert.equal(reading.keyboard, button.keyboard, 'the expectation is carried into the result regardless');
});

test('the section reads a component\'s markup through the applied: walk', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, [{ name: 'Toggle', spec: ['name: Toggle', 'archetype: toggle', 'properties:', '  track-colour: surface-default', '  thumb-colour: text-strong', 'states:', '  focus:', '    thumb-colour: ink-deep'] }], {
      'src/Toggle.jsx': 'export const Toggle = () => <div role="switch" className="toggle" />;\n',
    });
    const result = refineA11y(dir, model);
    assert.equal(result.markupRead, true);
    assert.deepEqual(rulesIn(result.components[0].aria.findings), ['aria-unmet']);
  });
});

// ---------------------------------------------------------------------------
// What is not graded, and why
// ---------------------------------------------------------------------------

test('a custom component is reported ungraded — it claimed no contract to be held to', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, [
      { name: 'Widget', spec: ['name: Widget', 'archetype: custom', 'custom: true', 'properties:', '  background: surface-default'] },
    ]);
    const result = refineA11y(dir, model);
    const [widget] = result.components;
    assert.equal(widget.checked, false);
    assert.equal(widget.pass, null);
    assert.match(widget.reason, /claimed no archetype contract/);
    assert.equal(result.pass, null, 'with nothing gradable, the section has no verdict to give');
  });
});

test('a component pass that did not run still yields contrast and focus, and says what it cost', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, [{ name: 'Button', spec: buttonSpec({ text: 'text-weak' }) }]);
    const result = refineA11y(dir, model, {
      componentPass: { ran: false, reason: 'component detection is React-only, and this looks like Vue' },
    });

    assert.equal(result.ran, true, 'two of the three checks read the design system alone');
    assert.equal(result.markupRead, false);
    assert.match(result.markupReason, /React-only/);
    assert.equal(rulesIn(result.findings).includes('contrast-fail'), true);
    assert.equal(rulesIn(result.findings).includes('focus-missing'), true);
    assert.equal(rulesIn(result.findings).includes('aria-unmet'), false, 'an unread source is never a failure');
    assert.equal(result.components[0].aria.pass, null);
  });
});

test('every result carries the sentences that bound it', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, [{ name: 'Button', spec: buttonSpec() }]);
    assert.deepEqual(refineA11y(dir, model).caveats, STATED_CAVEATS);
    assert.equal(STATED_CAVEATS.length, 3);
  });
});

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

test('every rule this section can report is one the reference declares', () => {
  const declared = a11yRules().map((row) => row.rule);
  assert.deepEqual(rules(), declared);
  for (const rule of ['contrast-fail', 'focus-missing', 'aria-unmet']) {
    assert.equal(refineSeverityFor(rule), 'error', `${rule} is a fact about the component`);
  }
  for (const rule of ['unpaired-token', 'unreadable-pair', 'aria-unverified']) {
    assert.equal(refineSeverityFor(rule), 'warn', `${rule} is a limit of the reading`);
  }
});

// ---------------------------------------------------------------------------
// Read-only
// ---------------------------------------------------------------------------

test('a11y writes nothing — not one file, not one byte', async () => {
  await withTempDir(async (dir) => {
    const model = project(dir, [{ name: 'Button', spec: buttonSpec({ text: 'text-weak' }) }], {
      'src/Button.jsx': BUTTON_MARKUP,
    });
    const before = snapshotContents(dir);
    refineA11y(dir, model);
    refineA11y(dir, model, { componentPass: { ran: false, reason: 'not this stack' } });
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
  });
});

test('no write call exists in the module at all', () => {
  const source = fs.readFileSync(new URL('../../lib/refine-a11y.js', import.meta.url), 'utf8');
  for (const call of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'writeFile(']) {
    assert.equal(source.includes(call), false, `lib/refine-a11y.js calls ${call}`);
  }
});
