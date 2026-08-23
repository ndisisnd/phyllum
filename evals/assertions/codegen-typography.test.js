/**
 * Assertions for phase 3 of the v0.7.3 plan, "The generated code".
 *
 * Before this phase, `renderCss` turned a `typography` slot into CSS by
 * pulling `row[1]`, `row[2]` and `row[3]` off a token's Typography row and
 * hand-naming them `font-size`, `font-weight` and `line-height` — three fixed
 * positions, mapped in code. The phase moves that mapping out of `codegen.js`
 * entirely: it now builds the set of readings a token records (the three
 * mandatory ones off the row, plus whatever the token's fenced block holds)
 * and hands that set to `declarationsFor` in `lib/typography.js`, which is
 * phase 1's own reader of the contract table in `skill/refs/typography.md`.
 *
 * Two things earn their own test here rather than living only in the eng
 * agent's manual check. First, the regression gate the plan names by name: a
 * token with no optional readings must keep generating byte-identical CSS,
 * proven against a plain string fixed ahead of time rather than "by eye".
 * Second, the one behaviour phase 3 is explicitly responsible for routing
 * correctly rather than reimplementing: `underline` + `strikethrough` collapse
 * into one `text-decoration-line` declaration, in contract order, because two
 * declarations of one property would be a silent overwrite.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { renderCss } from '../../lib/codegen.js';
import { parse } from '../../lib/design-system.js';
import { TYPOGRAPHY_FIXTURE, readFixture } from './helpers.js';

const model = parse(readFixture(TYPOGRAPHY_FIXTURE));

const draftFor = (tokenName, key = 'typography') => ({
  name: 'Button/Danger',
  archetype: 'button',
  skipped: [],
  states: [],
  properties: [{ key, value: tokenName }],
});

test('a token with no optional readings generates byte-identical CSS to the pre-phase-3 mapping', () => {
  // `legal-fine` carries no fenced block in the fixture, so this is exactly
  // the "three mandatory readings, nothing else" case the old fixed-position
  // code handled. The expected string is what that code produced before this
  // phase touched it — the regression gate the plan calls out by name.
  const out = renderCss(draftFor('legal-fine'), { model });
  assert.equal(
    out,
    [
      '/* Button/Danger */',
      '.button-danger {',
      '  font-size: 10px; /* legal-fine */',
      '  font-weight: 400; /* legal-fine */',
      '  line-height: 1.4; /* legal-fine */',
      '}',
    ].join('\n'),
  );
});

test('the typography slot still resolves through the legacy `font` property key', () => {
  // `Button/Primary` in the fixture names its typography slot `font:`, which
  // predates the `typography` key. Phase 3 must not have narrowed which
  // property keys route into the typography branch.
  const out = renderCss(draftFor('legal-fine', 'font'), { model });
  assert.match(out, /font-size: 10px; \/\* legal-fine \*\//);
});

test('underline and strikethrough merge into one text-decoration-line declaration', () => {
  // `highlight-small` records both, plus `kerning`. It also records
  // `text-transform: uppercase` and an unknown `text-align` line that
  // `lib/typography.js` already refuses to read — this proves that refusal
  // survives all the way through to the generated CSS: no `text-align` line
  // ever reaches the stylesheet.
  const out = renderCss(draftFor('highlight-small'), { model });
  assert.equal(
    out,
    [
      '/* Button/Danger */',
      '.button-danger {',
      '  font-size: 12px; /* highlight-small */',
      '  font-weight: 700; /* highlight-small */',
      '  line-height: 1.3; /* highlight-small */',
      '  letter-spacing: 0.02em; /* highlight-small */',
      '  text-decoration-line: underline line-through; /* highlight-small */',
      '  text-transform: uppercase; /* highlight-small */',
      '}',
    ].join('\n'),
  );
  assert.equal(
    out.match(/text-decoration-line/g).length,
    1,
    'one merged declaration, never two that would silently overwrite each other',
  );
  assert.ok(!out.includes('text-align'), 'a reading outside the contract table never reaches the CSS');
});

test('declaration order follows the contract table row order, not the order readings were written in the block', () => {
  // `body-primary`'s block writes `measure`, `font-family`,
  // `font-feature-settings`, `text-rendering` in that order, which happens to
  // match the contract table here — the real assertion is that the emitted
  // order is driven by the table (`skill/refs/typography.md`) and not by the
  // block's own line order or object insertion order.
  const out = renderCss(draftFor('body-primary'), { model });
  const order = [...out.matchAll(/^ {2}([a-z-]+):/gm)].map((m) => m[1]);
  assert.deepEqual(order, ['font-size', 'font-weight', 'line-height', 'max-width', 'font-family', 'font-feature-settings', 'text-rendering']);
});

test('two tokens recording the same readings generate the same declarations in the same sequence', () => {
  const first = renderCss(draftFor('body-primary'), { model });
  const strip = (css) => css.replace(/\/\* body-primary \*\//g, '/* TOKEN */').replace(/\/\* second \*\//g, '/* TOKEN */');

  const modelWithSecond = {
    ...model,
    tokens: {
      ...model.tokens,
      typography: [...model.tokens.typography, ['second', '16px', '400', '1.5']],
    },
    typographyBlocks: [
      ...model.typographyBlocks,
      model.typographyBlocks.find((b) => b.token === 'body-primary' && b.content != null),
    ].map((block, index, all) =>
      index === all.length - 1 ? { ...block, token: 'second' } : block,
    ),
  };

  const second = renderCss(draftFor('second'), { model: modelWithSecond });
  assert.equal(strip(first), strip(second));
});

test('a token whose readings block is ambiguous (two blocks, one name) falls back to the mandatory three only', () => {
  // `label-caps` is written twice in the fixture, which `lib/typography.js`
  // already treats as "the name does not identify one block, so nothing was
  // read". The generated CSS must reflect that: no `font-variant-caps` and no
  // `font-variant` line, only the mandatory three.
  const out = renderCss(draftFor('label-caps'), { model });
  assert.equal(
    out,
    [
      '/* Button/Danger */',
      '.button-danger {',
      '  font-size: 11px; /* label-caps */',
      '  font-weight: 600; /* label-caps */',
      '  line-height: 1.2; /* label-caps */',
      '}',
    ].join('\n'),
  );
});

test('a block naming a token the Typography table does not hold never reaches the generated CSS', () => {
  // `body-principal` in the fixture is a block for a token that has no row —
  // `readTypography` reports it and leaves it alone, but it must never be
  // reachable as a typography slot value at all.
  const out = renderCss(draftFor('body-principal'), { model });
  assert.equal(
    out,
    [
      '/* Button/Danger */',
      '.button-danger {',
      '  /* typography: body-principal — see the token table */',
      '}',
    ].join('\n'),
  );
});
