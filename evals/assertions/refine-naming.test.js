/**
 * Assertions for `refine naming` (v0.11.0 phase 2).
 *
 * The gate's third section reads names and nothing else, so this suite is
 * table-driven the way `nomenclature.test.js` is: the scales come from the
 * shipped tables, and a name Phyllum's own naming code would produce has to be
 * a name this checker accepts. That circularity is the point — the two must
 * never disagree about what the scale is.
 *
 * Four promises are checked:
 *
 *   1. **Every name the naming code can produce is on the scale.** The colour
 *      scale, the ladders, the type bands, the ramp steps, the collision suffix
 *      and the gradient mark all round-trip.
 *   2. **A name is a proposal.** An off-scale name is a `warn` and nothing is
 *      renamed, because naming is not one of the six ship criteria.
 *   3. **A component is graded against the archetype its own spec records** —
 *      and a `custom`, a component with no archetype, and the variant word are
 *      each left alone with the reason stated.
 *   4. **Nothing is written.** The section reads a parsed model; the directory
 *      is diffed around the call regardless.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { parse } from '../../lib/design-system.js';
import { ladders, typeBands, typeRoles } from '../../lib/tokenise-spec.js';
import { nameColour, nameTypography } from '../../lib/tokenise.js';
import { neutralRamp } from '../../lib/nomenclature.js';
import { namingRules, refineSeverityFor } from '../../lib/refine-spec.js';
import {
  baseWords,
  componentNames,
  onColourScale,
  refineNaming,
  rules,
  scaleOf,
  tokenNames,
  wellShaped,
} from '../../lib/refine-naming.js';
import { diffSnapshots, snapshotContents, withTempDir } from './helpers.js';

/** A model carrying exactly the rows a case is about. */
function model({ colours = [], primitives = [], numbers = [], typography = [], components = [] } = {}) {
  return {
    tokens: {
      colours: colours.map((name) => [name, '#2563EB']),
      primitives: primitives.map((name) => [name, '#2563EB']),
      numbers: numbers.map((name) => [name, '16px', 'spacing']),
      typography: typography.map((name) => [name, '16px', '400', '1.5']),
    },
    components,
  };
}

/** A recorded component: a name, and the spec block its archetype is read from. */
const component = (name, spec) => ({
  name,
  blocks: spec === null ? [] : [{ lang: 'yaml', content: spec }],
});

const rulesIn = (rows) => rows.flatMap((row) => row.findings.map((item) => item.rule));

// ---------------------------------------------------------------------------
// The scales — every name the naming code produces is one this checker accepts
// ---------------------------------------------------------------------------

test('every rung of every ladder is a number name on the scale', () => {
  for (const [name, ladder] of Object.entries(ladders())) {
    for (const rung of ladder.rungs) {
      assert.equal(scaleOf(rung), 'numbers', `${rung} is a rung of the ${name} ladder`);
    }
  }
});

test('every role-and-band spelling is a typography name on the scale', () => {
  for (const role of typeRoles()) {
    for (const band of typeBands()) {
      const name = `${role.role}${band.suffix}`;
      assert.equal(scaleOf(name), 'typography', `${name} is what nameTypography spells`);
    }
  }
  assert.equal(scaleOf(nameTypography({ size: '12px', weight: '700' })), 'typography');
});

test('the colour scale and the nomenclature library both name colours', () => {
  assert.equal(onColourScale(nameColour('#2563EB')), true, 'the scale names a chromatic colour');
  for (const name of ['color-surface', 'color-text', 'color-muted', 'color-primary', 'color-9']) {
    assert.equal(scaleOf(name), 'colours', `${name} is on the colour scale`);
  }
  for (const name of ['neutral-primary', 'interaction-primary-hover', 'danger-primary-bold-pressed']) {
    assert.equal(scaleOf(name), 'colours', `${name} is a library name`);
  }
});

test('the two spellings Phyllum adds on top of a scale name are on the scale too', () => {
  assert.equal(scaleOf('color-primary-2'), 'colours', 'the collision suffix a taken name gets');
  assert.equal(scaleOf('gradient-1'), 'colours', 'the gradient scale');
  assert.equal(scaleOf('danger-primary-gradient'), 'colours', 'a library name plus the gradient mark');
});

test('every step of the shipped neutral ramp is a primitive name on the scale', () => {
  for (const row of neutralRamp()) {
    assert.equal(scaleOf(row.token), 'primitives', `${row.token} is a shipped constant`);
  }
  assert.equal(scaleOf('color-primary500'), 'primitives', 'a ramp derived from a colour token');
  assert.equal(scaleOf('color-primary550'), null, '550 is not a step of the nine-step scale');
});

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

test('a name no scale could have produced is reported, and only as a warn', () => {
  const rows = tokenNames(model({ colours: ['brandBlue'] }));
  assert.deepEqual(rulesIn(rows), ['token-off-scale']);
  assert.equal(rows[0].findings[0].severity, 'warn', 'a name is a proposal, not a gate');
  assert.equal(rows[0].pass, true, 'so an off-scale name cannot fail the section on its own');
  assert.equal(rows[0].clean, false, 'and it is still visible as drift');
});

test('a name on the wrong table is its own rule — a recognised name in the wrong place', () => {
  const rows = tokenNames(model({ colours: ['space-md'] }));
  assert.deepEqual(rulesIn(rows), ['token-off-section']);
  assert.match(rows[0].findings[0].detail, /recorded under colours/);
});

test('a system named entirely off the scales is reported name by name', () => {
  const rows = tokenNames(model({ colours: ['color-primary'], numbers: ['space-4'], typography: ['type-display'] }));
  assert.deepEqual(
    rows.map((row) => [row.name, row.clean]),
    [['color-primary', true], ['space-4', false], ['type-display', false]],
  );
});

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

test('a name that says its archetype passes; one that says nothing about it does not', () => {
  const spec = 'name: X\narchetype: button\n';
  const rows = componentNames(
    model({
      components: [
        component('Button', spec),
        component('IconButton', spec),
        component('Button/Primary', spec),
        component('Widget', spec),
      ],
    }),
  );
  assert.deepEqual(rows.map((row) => row.clean), [true, true, true, false]);
  assert.equal(rows[3].findings[0].rule, 'component-name-mismatch');
  assert.match(rows[3].findings[0].detail, /`button` archetype/);
});

test('an archetype the contract table does not know is the one error this section reports', () => {
  const rows = componentNames(model({ components: [component('Sprocket', 'archetype: sprocket\n')] }));
  assert.deepEqual(rulesIn(rows), ['component-unknown-archetype']);
  assert.equal(rows[0].findings[0].severity, 'error', 'a spec no reader can read is not a naming opinion');
  assert.equal(rows[0].pass, false);
});

test('three subjects are left alone, and each says why', () => {
  const rows = componentNames(
    model({
      components: [
        component('Anything', 'archetype: custom\n'),
        component('Whatever', 'name: Whatever\n'),
      ],
    }),
  );
  assert.equal(rows[0].checked, false);
  assert.match(rows[0].reason, /custom follows no archetype contract/);
  assert.equal(rows[1].checked, false);
  assert.match(rows[1].reason, /contract section/, 'one fact reported twice is one finding too many');
  assert.deepEqual(rulesIn(rows), [], 'and neither one produces a finding here');
});

test('the variant word after the slash is the user’s vocabulary, not the archetype’s', () => {
  const rows = componentNames(
    model({ components: [component('Button/Sprocket', 'archetype: button\n')] }),
  );
  assert.deepEqual(rulesIn(rows), []);
  assert.deepEqual([...baseWords('Button/Sprocket')], ['button']);
});

test('a name that is not Base or Base/Variant is reported on its shape', () => {
  assert.equal(wellShaped('Button'), true);
  assert.equal(wellShaped('Button/Primary'), true);
  assert.equal(wellShaped('button'), false);
  assert.equal(wellShaped('Button/Primary/Small'), false);
  const rows = componentNames(model({ components: [component('button', 'archetype: button\n')] }));
  assert.deepEqual(rulesIn(rows), ['component-name-shape']);
});

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

test('the section rolls tokens and components into one list, and one verdict', () => {
  const result = refineNaming(
    model({
      colours: ['color-primary', 'brandBlue'],
      components: [component('Button', 'archetype: button\n')],
    }),
  );
  assert.equal(result.ran, true);
  assert.equal(result.names.length, 3);
  assert.equal(result.pass, true, 'nothing here is an error');
  assert.equal(result.clean, false, 'but one name is off the scale');
  assert.deepEqual(result.findings.map((row) => row.rule), ['token-off-scale']);
});

test('every rule this section can report is one the reference declares', () => {
  assert.deepEqual(rules(), namingRules().map((row) => row.rule));
  assert.equal(refineSeverityFor('token-off-scale'), 'warn');
  assert.equal(refineSeverityFor('component-unknown-archetype'), 'error');
});

test('no name is renamed, and no replacement is proposed', () => {
  const rows = tokenNames(model({ colours: ['brandBlue'] }));
  for (const finding of rows[0].findings) {
    assert.equal(finding.value, 'brandBlue', 'the finding carries the name as written');
    assert.ok(!('suggestion' in finding), 'a proposal is `tokenise`’s to make');
  }
});

// ---------------------------------------------------------------------------
// Read-only
// ---------------------------------------------------------------------------

test('naming writes nothing — not one file, not one byte', async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, 'DESIGN-SYSTEM.md');
    fs.writeFileSync(
      file,
      ['# Design System', '', '## Tokens', '', '### Colours', '', '| token | value |', '| --- | --- |', '| brandBlue | #2563EB |', ''].join('\n'),
    );
    const before = snapshotContents(dir);
    refineNaming(parse(fs.readFileSync(file, 'utf8')));
    assert.deepEqual(diffSnapshots(before, snapshotContents(dir)), { added: [], changed: [], removed: [] });
  });
});
