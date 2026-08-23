/**
 * Assertions for the typography specimen (v0.7.3 plan §"the surfaces").
 *
 * A typography token now carries up to twenty-one readings — the
 * `phyllum:type-readings` table in `skill/refs/typography.md` — and the GUI
 * specimen has to draw every one that passes its own value gate, list every
 * one that does not (with why), and never let a hand-edited value reach a
 * `style` attribute unchecked. `font-family` earns a fetch note whenever the
 * reading is present, whether or not its value happened to pass the gate.
 *
 * The mechanism follows `gui-preview.test.js`'s exactly: the page marks the
 * region pure — strings and objects, no DOM, no fetch — and this file lifts
 * that region out and runs it, so the suite executes the code the browser
 * executes rather than a restatement of it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { systemJson } from '../../lib/system-json.js';
import { stripTicks, tableAfter } from '../../lib/md-tables.js';
import { PACKAGE_ROOT, TYPOGRAPHY_FIXTURE, readFixture } from './helpers.js';

const GUI_PAGE = path.join(PACKAGE_ROOT, 'gui', 'index.html');
const TYPOGRAPHY_REF = path.join(PACKAGE_ROOT, 'skill', 'refs', 'typography.md');
const readPage = () => fs.readFileSync(GUI_PAGE, 'utf8');

/** One marked region of the page's script, by name. */
function region(text, name) {
  const start = text.indexOf(`// --- phyllum:${name}`);
  const end = text.indexOf(`// --- end phyllum:${name}`);
  assert.ok(start !== -1 && end > start, `the page marks its ${name} region`);
  return text.slice(start, end);
}

/**
 * The page's own typography rules, lifted out and run.
 *
 * The region leans on helpers defined elsewhere on the page — `esc`, `cell`,
 * `heading`, `container`, `NOTES`, the three core-reading gates, `isLength`,
 * `isSafeDeclaration` and `UNRENDERED` — so all of them are lifted too rather
 * than restated here.
 */
function typographyContract() {
  const text = readPage();
  const typeRegion = region(text, 'typography-contract');
  assert.ok(!/\b(document|window)\b|fetch\s*\(/.test(typeRegion.replace(/\/\*[\s\S]*?\*\//g, '')), (
    'the typography region touches no DOM and no network'
  ));

  const esc = text.match(/const esc = \(value\) =>[\s\S]*?;\n/);
  const cell = text.match(/const cell = \(row, name, index\) =>[^\n]*\n/);
  const heading = text.match(/const heading = \(title, count, note\) =>[\s\S]*?;\n/);
  const container = text.match(/const container = \(body\) =>[^\n]*\n/);
  const notes = text.match(/const NOTES = \{[\s\S]*?\n\s*\};\n/);
  const isSafeDeclaration = text.match(/const isSafeDeclaration = \(value\) => \{[\s\S]*?\n\s*\};\n/);
  const safeSize = text.match(/const safeSize = \(value\) =>[^\n]*\n/);
  const safeWeight = text.match(/const safeWeight = \(value\) =>[^\n]*\n/);
  const safeLeading = text.match(/const safeLeading = \(value\) =>[^\n]*\n/);
  const isLength = text.match(/const isLength = \(value\) =>[^\n]*\n/);
  const unrendered = text.match(/const UNRENDERED = \{[^\n]*\n/);
  assert.ok(
    esc && cell && heading && container && notes && isSafeDeclaration &&
      safeSize && safeWeight && safeLeading && isLength && unrendered,
    'the helpers the typography region leans on are the page\'s own',
  );

  const factory = new Function(
    `${esc[0]}${cell[0]}${heading[0]}${container[0]}${notes[0]}${isSafeDeclaration[0]}` +
      `${safeSize[0]}${safeWeight[0]}${safeLeading[0]}${isLength[0]}${unrendered[0]}${typeRegion}` +
      '\nreturn { TYPE_READINGS, TYPE_MERGES, TYPE_SHAPES, TYPE_BARE_VALUES, typeDeclarations,' +
      ' typographySpecimenHtml, typographySection, isKeyword, isTracking, isMeasure, isFontFamily,' +
      ' isFeatureSettings };',
  );
  return factory();
}

/** The fixture's typography rows, as `/system` would carry them. */
const FIXTURE_ROWS = () => systemJson(readFixture(TYPOGRAPHY_FIXTURE)).tokens.typography;

const rowFor = (rows, token) => rows.find((row) => row.token === token);

// ---------------------------------------------------------------------------
// The contract table, and the page's copy of it, cannot drift
// ---------------------------------------------------------------------------

test('the page names a property and a shape for every one of the twenty-one readings', () => {
  const contract = typographyContract();
  const refText = fs.readFileSync(TYPOGRAPHY_REF, 'utf8');
  const rows = tableAfter(refText, '<!-- phyllum:type-readings -->', 'refs/typography.md');
  assert.equal(rows.length, 21, 'the contract still names twenty-one readings');

  for (const [reading] of rows) {
    const name = stripTicks(reading);
    assert.ok(
      Object.prototype.hasOwnProperty.call(contract.TYPE_READINGS, name),
      `the page's own copy names ${name}`,
    );
    const entry = contract.TYPE_READINGS[name];
    assert.ok(entry.property, `${name} names a CSS property`);
    assert.ok(contract.TYPE_SHAPES[entry.shape], `${name}'s shape (${entry.shape}) has a gate`);
  }
  // And nothing on the page's side that the contract does not hold.
  for (const name of Object.keys(contract.TYPE_READINGS)) {
    assert.ok(rows.some(([reading]) => stripTicks(reading) === name), `${name} is a reading the contract still names`);
  }
});

test('the page\'s one merge mirrors the contract\'s one `shared` conflict', () => {
  const contract = typographyContract();
  const refText = fs.readFileSync(TYPOGRAPHY_REF, 'utf8');
  const rows = tableAfter(refText, '<!-- phyllum:type-conflicts -->', 'refs/typography.md');
  const shared = rows.filter((row) => stripTicks(row[1]) === 'shared');
  assert.equal(shared.length, contract.TYPE_MERGES.length, 'one shared rule, one merge');
  for (const row of shared) {
    const members = stripTicks(row[2]).split(',').map((part) => part.trim());
    const merge = contract.TYPE_MERGES.find((rule) => rule.readings.join(',') === members.join(','));
    assert.ok(merge, `the page merges ${members.join(' + ')} the way the contract does`);
    assert.equal(merge.property, stripTicks(row[3]));
  }
});

// ---------------------------------------------------------------------------
// The specimen draws what passes, lists what it refuses
// ---------------------------------------------------------------------------

test('an underlined-and-struck-through token draws one declaration carrying both keywords', () => {
  const contract = typographyContract();
  const row = rowFor(FIXTURE_ROWS(), 'highlight-small');
  const html = contract.typographySpecimenHtml(row);
  const [style] = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  assert.match(style, /text-decoration-line:underline line-through/, style);
  // One declaration, not two — the second never silently overwrites the first.
  assert.equal((style.match(/text-decoration-line/g) ?? []).length, 1, style);
  assert.match(style, /letter-spacing:0\.02em/, style);
  // `text-align` is not one of the twenty-one readings, so `readingsOf` never
  // hands it to the page at all — it is refused upstream, not by this region.
  assert.equal(/text-align/.test(style), false, style);
});

test('a value the shape gate refuses never reaches the style attribute, and is listed with why', () => {
  const contract = typographyContract();
  const row = rowFor(FIXTURE_ROWS(), 'body-primary');
  const html = contract.typographySpecimenHtml(row);
  const [style] = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);

  // `measure` (68ch) and `text-rendering` (optimizeLegibility) are shapes this
  // page recognises, so they draw.
  assert.match(style, /max-width:68ch/, style);
  assert.match(style, /text-rendering:optimizeLegibility/, style);

  // The font-family and the feature-settings values both carry quotes, which
  // the hard gate refuses whatever shape they otherwise wear — so neither ever
  // reaches the attribute, and both are named underneath instead.
  assert.equal(/font-family|font-feature-settings/.test(style), false, style);
  assert.ok(html.includes('specimen__unrendered'), html);
  assert.ok(/font-family: .* — unresolved/.test(html.replace(/&quot;/g, '"')), html);
  assert.ok(/font-feature-settings: .* — unresolved/.test(html.replace(/&quot;/g, '"')), html);
});

test('the font-family note appears whenever the reading is present, pass or refuse', () => {
  const contract = typographyContract();
  const rows = FIXTURE_ROWS();

  // `body-primary` records a font-family whose value the hard gate refuses
  // (it carries quotes) — the note still appears, because the page cannot know
  // whether an uninstalled face is the reason a value looks that way.
  const refused = contract.typographySpecimenHtml(rowFor(rows, 'body-primary'));
  assert.ok(refused.includes('specimen__note'), refused);
  assert.match(refused, /fetches no fonts/, refused);

  // `highlight-small` records no font-family reading at all — no note.
  const none = contract.typographySpecimenHtml(rowFor(rows, 'highlight-small'));
  assert.equal(/specimen__note/.test(none), false, none);

  // A token whose declaration passes the gate outright still gets the note —
  // the note is about the reading's presence, never its outcome.
  const held = { size: '16px', weight: '400', 'line-height': '1.5', cells: [], readings: { 'font-family': 'Inter, system-ui, sans-serif' } };
  const passed = contract.typographySpecimenHtml({ token: 'plain', ...held });
  assert.ok(passed.includes('specimen__note'), passed);
  assert.match(passed, /style="[^"]*font-family:Inter, system-ui, sans-serif[^"]*"/, passed);
});

test('a token whose optional block was ambiguous draws its three core readings and nothing else', () => {
  const contract = typographyContract();
  // `label-caps` carries two blocks under one name in the fixture, so
  // `readingsOf` hands the page `{}` — no reading, never a guess at either
  // block's content.
  const row = rowFor(FIXTURE_ROWS(), 'label-caps');
  assert.deepEqual(row.readings, {});
  const html = contract.typographySpecimenHtml(row);
  assert.equal(/specimen__unrendered/.test(html), false, html);
  assert.equal(/specimen__note/.test(html), false, html);
});

test('a token with no optional readings at all draws only its three core readings', () => {
  const contract = typographyContract();
  const row = rowFor(FIXTURE_ROWS(), 'legal-fine');
  const html = contract.typographySpecimenHtml(row);
  const [style] = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  assert.match(style, /^font-size:10px;font-weight:400;line-height:1\.4$/, style);
  assert.equal(/specimen__unrendered|specimen__note/.test(html), false, html);
});

test('a typography row cannot write markup or an unchecked style into the specimen', () => {
  const contract = typographyContract();
  const hostile = contract.typographySpecimenHtml({
    token: '<b>x</b>',
    cells: [],
    size: '12px;background:url(http://x/y)',
    weight: '400" onmouseover="alert(1)',
    'line-height': '1.3',
    readings: { kerning: '1em;color:red', 'text-transform': '<script>alert(1)</script>' },
  });
  assert.equal(/<b>|<script>/.test(hostile), false, hostile);
  assert.ok(hostile.includes('&lt;b&gt;x&lt;/b&gt;'), hostile);
  // The hostile size and weight never reach a style attribute at all — only
  // `line-height`, the one clean value, draws.
  const [style] = [...hostile.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(style, 'line-height:1.3', style);
  assert.equal(/[<>"]/.test(hostile.replace(/style="[^"]*"/, '').replace(/<[^>]*>/g, '')), false, hostile);
});

test('typographySection renders one specimen per row, in the file\'s own order', () => {
  const contract = typographyContract();
  const rows = FIXTURE_ROWS();
  const html = contract.typographySection(rows);
  const tokens = [...html.matchAll(/data-token="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(tokens, rows.map((row) => row.token));
});

test('an empty typography table renders the section heading and nothing more', () => {
  const contract = typographyContract();
  const html = contract.typographySection([]);
  assert.ok(html.includes('Typography'));
  assert.ok(html.includes('(none yet)'));
  assert.equal(/specimen/.test(html), false, html);
});

// ---------------------------------------------------------------------------
// The page stays self-contained (v0.7.3 §"the surfaces")
// ---------------------------------------------------------------------------

test('the typography region introduces no webfont, no CDN, no src=, no external URL', () => {
  const text = readPage();
  const typeRegion = region(text, 'typography-contract');
  assert.equal(typeRegion.match(/https?:\/\//g), null, typeRegion);
  assert.equal(/@font-face|@import/.test(typeRegion), false, typeRegion);
  assert.equal(/\bsrc\s*=/i.test(typeRegion), false, typeRegion);
  assert.equal(/<link\b|<script[^>]+\bsrc=/i.test(typeRegion), false, typeRegion);
});
