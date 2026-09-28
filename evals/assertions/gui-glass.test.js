/**
 * Assertions for the glass surfaces' readability (v0.14.0 plan §5).
 *
 * Glass is a translucent tint over whatever sits behind it, so the contrast
 * a reader gets on it is not one number but a range: it depends on the
 * backdrop. The plan's bar is WCAG AA — 4.5:1 for normal text — in both
 * themes, and this file holds every glass surface to it against the three
 * backdrops that bound the range:
 *
 *   - the solid `--glass-fallback`, which a browser without backdrop blur
 *     (or a reader who asked for less transparency) sees instead;
 *   - `--glass` over the real page canvas — `--bg` and its faint accent
 *     pools, taking whichever reads worst;
 *   - `--glass` over solid `--ink`, the densest content that can scroll
 *     under a sticky bar, left unblurred. This is the conservative bound: a
 *     blur only ever softens the backdrop towards its average, never past it.
 *
 * Nothing here is a restatement of the palette. The colours are lifted from
 * the page's own `:root` blocks, the glass surfaces from the page's own rules,
 * and the backdrop pools from the page's own `body` background — so a token
 * change or a new glass surface is checked the day it lands. The contrast
 * maths is WCAG 2.x relative luminance, written out below with no
 * dependencies; translucent colours are composited over their backdrop first,
 * the way the browser paints them.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { PACKAGE_ROOT } from './helpers.js';

const GUI_PAGE = path.join(PACKAGE_ROOT, 'gui', 'index.html');

/** The AA floors: normal text, and non-text UI such as a field's edge. */
const TEXT_FLOOR = 4.5;
const UI_FLOOR = 3;

/** The page's one stylesheet, comments stripped so a brace in prose is inert. */
function stylesheet() {
  const text = fs.readFileSync(GUI_PAGE, 'utf8');
  const match = text.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(match, 'the page carries its styles inline');
  return match[1].replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Every style rule on the page, with the at-rules it sits inside.
 *
 * A small brace walk rather than a CSS parser: the page's stylesheet has no
 * strings with braces in them, and a rule is all this file needs — its
 * selectors, its declarations, and whether it is conditional.
 */
function rules(css) {
  const out = [];
  const stack = [];
  let buffer = '';
  for (const char of css) {
    if (char === '{') {
      stack.push(buffer.trim());
      buffer = '';
    } else if (char === '}') {
      const prelude = stack.pop();
      if (!prelude.startsWith('@')) {
        out.push({
          selectors: prelude.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
          body: buffer,
          context: stack.filter((p) => p.startsWith('@')),
        });
      }
      buffer = '';
    } else {
      buffer += char;
    }
  }
  assert.equal(stack.length, 0, 'the page\'s stylesheet closes every brace it opens');
  return out;
}

/** The custom properties a rule body declares, by name. */
function customProperties(body) {
  const vars = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[name] = value.trim();
  return vars;
}

/**
 * The page's two palettes. Light is the plain `:root` set; dark is written
 * twice — once for `system` under the dark media query, once for `dark`
 * chosen outright — and both copies are returned so they can be compared.
 */
function palettes() {
  const all = rules(stylesheet());
  const find = (selector, context) => all.find((rule) => (
    rule.selectors.includes(selector) && context(rule.context)
  ));
  const light = find(':root', (ctx) => ctx.length === 0);
  const system = find(':root:not([data-theme])', (ctx) => (
    ctx.length === 1 && /prefers-color-scheme:\s*dark/.test(ctx[0])
  ));
  const dark = find(":root[data-theme='dark']", (ctx) => ctx.length === 0);
  assert.ok(light && system && dark, 'the page writes a light :root set and both dark sets');
  assert.ok(system.selectors.includes(":root[data-theme='system']"), (
    'the system dark set also answers an explicit `system` choice'
  ));
  return {
    light: customProperties(light.body),
    darkSystem: customProperties(system.body),
    dark: customProperties(dark.body),
  };
}

// --- colour maths ----------------------------------------------------------

/** A colour as straight-alpha sRGB, channels 0–255 and alpha 0–1. */
function parseColour(value, vars, seen = new Set()) {
  const v = value.trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) {
    assert.ok(!seen.has(ref[1]), `${ref[1]} does not refer to itself`);
    assert.ok(ref[1] in vars, `${ref[1]} is declared in this theme`);
    return parseColour(vars[ref[1]], vars, new Set([...seen, ref[1]]));
  }
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    const n = parseInt(digits, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgba) {
    return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] === undefined ? 1 : +rgba[4] };
  }
  const mix = v.match(/^color-mix\(\s*in srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)(?:\s+([\d.]+)%)?\s*\)$/);
  if (mix) {
    const p = +mix[2] / 100;
    const q = mix[4] === undefined ? 1 - p : +mix[4] / 100;
    return colourMix(parseColour(mix[1], vars, seen), p, parseColour(mix[3], vars, seen), q);
  }
  assert.fail(`a colour this file can read: ${v}`);
}

/**
 * CSS `color-mix()` in sRGB: the two colours are interpolated with
 * premultiplied alpha, so mixing with `transparent` thins the alpha and
 * leaves the hue alone — which is exactly how the accent pools are drawn.
 */
function colourMix(c1, p1, c2, p2) {
  const sum = p1 + p2;
  const w1 = p1 / sum;
  const w2 = p2 / sum;
  const a = c1.a * w1 + c2.a * w2;
  const scale = sum < 1 ? sum : 1;
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const channel = (k) => (c1[k] * c1.a * w1 + c2[k] * c2.a * w2) / a;
  return { r: channel('r'), g: channel('g'), b: channel('b'), a: a * scale };
}

/** Source-over compositing: `top` painted on an opaque `bottom`. */
function over(top, bottom) {
  assert.equal(bottom.a, 1, 'a backdrop is opaque once composited');
  const mixChannel = (k) => top[k] * top.a + bottom[k] * (1 - top.a);
  return { r: mixChannel('r'), g: mixChannel('g'), b: mixChannel('b'), a: 1 };
}

/** WCAG 2.x relative luminance of an opaque colour. */
function luminance({ r, g, b }) {
  const linear = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio, lighter over darker, both opaque. */
function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const fmt = (ratio) => `${ratio.toFixed(2)}:1`;

// --- the page's glass ------------------------------------------------------

/** The selectors the page paints as glass: a `--glass` fill with a blur. */
function glassSurfaces() {
  const all = rules(stylesheet());
  const blurred = all.filter((rule) => (
    /(^|[;\s])backdrop-filter\s*:\s*blur\(/.test(rule.body) ||
      /background(-color)?\s*:\s*var\(--glass\)/.test(rule.body)
  ));
  return { all, blurred };
}

/**
 * The page canvas a glass surface can sit over: the plain `--bg`, and `--bg`
 * under each accent pool the `body` background draws — read from the rule
 * itself, so a stronger pool is caught the day it is written.
 */
function canvases(vars) {
  const body = rules(stylesheet()).find((rule) => (
    rule.selectors.includes('body') && rule.context.length === 0 && /radial-gradient/.test(rule.body)
  ));
  assert.ok(body, 'the page draws its backdrop on body');
  const pools = [...body.body.matchAll(/color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)/g)].map((m) => m[0]);
  assert.ok(pools.length >= 1, 'the backdrop carries its accent pools');
  const bg = parseColour('var(--bg)', vars);
  return [
    { name: '--bg', colour: bg },
    ...pools.map((pool) => ({
      name: `--bg + ${pool.match(/var\((--[\w-]+)\)\s+([\d.]+%)/).slice(1).join(' ')} pool`,
      colour: over(parseColour(pool, vars), bg),
    })),
  ];
}

/**
 * The three backdrops every glass surface is held against, in one theme,
 * each already opaque: the fallback, the glass over the worst canvas, and
 * the glass over solid ink.
 */
function backdrops(vars) {
  const glass = parseColour('var(--glass)', vars);
  assert.ok(glass.a < 1, '--glass is translucent — otherwise it is not glass');
  return {
    fallback: [{ name: '--glass-fallback', colour: parseColour('var(--glass-fallback)', vars) }],
    canvas: canvases(vars).map(({ name, colour }) => ({ name: `--glass on ${name}`, colour: over(glass, colour) })),
    ink: [{ name: '--glass on --ink', colour: over(glass, parseColour('var(--ink)', vars)) }],
  };
}

/** The worst ratio a colour reaches against a list of backdrops. */
function worst(fg, list) {
  return list
    .map(({ name, colour }) => ({ name, ratio: contrast(fg, colour) }))
    .reduce((a, b) => (b.ratio < a.ratio ? b : a));
}

const THEMES = () => {
  const { light, dark } = palettes();
  return [['light', light], ['dark', dark]];
};

/**
 * The text colours the page writes. `--layer` is a label on the accent fill
 * of the primary button, never on glass, and it has its own test below.
 */
const TEXT_ON_GLASS = ['--ink', '--muted', '--accent', '--raw'];
const TEXT_OFF_GLASS = ['--layer'];

// --- tests -----------------------------------------------------------------

test('the dark palette reads the same whether the OS or the page chose it', () => {
  const { light, darkSystem, dark } = palettes();
  const colourVars = Object.keys(light).filter((name) => /^(#|rgba?\()/.test(light[name]));
  const used = [...TEXT_ON_GLASS, ...TEXT_OFF_GLASS, '--bg', '--layer', '--glass', '--glass-fallback', '--line-control'];
  for (const name of new Set([...colourVars, ...used])) {
    assert.ok(name in dark, `the dark set overrides ${name}`);
    assert.equal(darkSystem[name], dark[name], `${name} is the same in the system and the chosen dark set`);
  }
});

test('every text colour the page writes is one this file checks', () => {
  const css = stylesheet();
  const written = new Set(
    [...css.matchAll(/(?:^|[{;\s])color\s*:\s*var\((--[\w-]+)\)/g)].map((m) => m[1]),
  );
  assert.deepEqual(
    [...written].sort(),
    [...TEXT_ON_GLASS, ...TEXT_OFF_GLASS].sort(),
    'the page writes text in exactly the colours this file holds to 4.5:1',
  );
});

test('every glass surface blurs in both engines and keeps a solid fallback', () => {
  const { all, blurred } = glassSurfaces();
  const selectors = new Set(blurred.flatMap((rule) => rule.selectors));
  assert.ok(selectors.size >= 1, 'the page has glass surfaces');
  assert.ok(selectors.has('header'), 'the sticky header is one of them');

  for (const rule of blurred) {
    const where = rule.selectors.join(', ');
    assert.ok(
      rule.context.some((ctx) => /^@supports\b/.test(ctx) && /backdrop-filter/.test(ctx)),
      `the glass on ${where} sits behind an @supports check for backdrop blur`,
    );
    assert.match(rule.body, /background\s*:\s*var\(--glass\)/, `${where} fills with --glass`);
    assert.match(rule.body, /(^|[;\s])backdrop-filter\s*:\s*blur\(/, `${where} sets backdrop-filter`);
    assert.match(rule.body, /-webkit-backdrop-filter\s*:\s*blur\(/, `${where} sets -webkit-backdrop-filter`);
  }

  for (const selector of selectors) {
    const fallback = all.find((rule) => (
      rule.context.length === 0 &&
        rule.selectors.includes(selector) &&
        /background\s*:\s*var\(--glass-fallback\)/.test(rule.body)
    ));
    assert.ok(fallback, `${selector} is painted --glass-fallback outside any condition`);
    const reduced = all.find((rule) => (
      rule.context.some((ctx) => /prefers-reduced-transparency:\s*reduce/.test(ctx)) &&
        rule.selectors.includes(selector) &&
        /background\s*:\s*var\(--glass-fallback\)/.test(rule.body) &&
        /(^|[;\s])backdrop-filter\s*:\s*none/.test(rule.body)
    ));
    assert.ok(reduced, `${selector} goes solid for a reader who asks for less transparency`);
  }
});

test('text on glass clears 4.5:1 on the solid fallback, in both themes', () => {
  for (const [theme, vars] of THEMES()) {
    const { fallback } = backdrops(vars);
    for (const name of TEXT_ON_GLASS) {
      const { name: on, ratio } = worst(parseColour(`var(${name})`, vars), fallback);
      assert.ok(ratio >= TEXT_FLOOR, `${theme}: ${name} on ${on} reads ${fmt(ratio)}, under ${TEXT_FLOOR}:1`);
    }
  }
});

test('text on glass clears 4.5:1 over the page canvas and its accent pools, in both themes', () => {
  for (const [theme, vars] of THEMES()) {
    const { canvas } = backdrops(vars);
    for (const name of TEXT_ON_GLASS) {
      const { name: on, ratio } = worst(parseColour(`var(${name})`, vars), canvas);
      assert.ok(ratio >= TEXT_FLOOR, `${theme}: ${name} on ${on} reads ${fmt(ratio)}, under ${TEXT_FLOOR}:1`);
    }
  }
});

test('text on glass clears 4.5:1 even with solid ink scrolling underneath, in both themes', () => {
  for (const [theme, vars] of THEMES()) {
    const { ink } = backdrops(vars);
    for (const name of TEXT_ON_GLASS) {
      const { name: on, ratio } = worst(parseColour(`var(${name})`, vars), ink);
      assert.ok(ratio >= TEXT_FLOOR, `${theme}: ${name} on ${on} reads ${fmt(ratio)}, under ${TEXT_FLOOR}:1`);
    }
  }
});

test('the primary button label clears 4.5:1 on its accent fill, in both themes', () => {
  const primary = rules(stylesheet()).find((rule) => rule.selectors.includes('.btn--primary'));
  assert.ok(primary, 'the page styles a primary button');
  const fill = primary.body.match(/(?:^|[;\s])background\s*:\s*([^;]+);/);
  const label = primary.body.match(/(?:^|[;\s])color\s*:\s*([^;]+);/);
  assert.ok(fill && label, 'the primary button names its fill and its label');
  for (const [theme, vars] of THEMES()) {
    const ratio = contrast(parseColour(label[1], vars), parseColour(fill[1], vars));
    assert.ok(ratio >= TEXT_FLOOR, `${theme}: ${label[1]} on ${fill[1]} reads ${fmt(ratio)}, under ${TEXT_FLOOR}:1`);
  }
});

/**
 * A form field's edge is non-text UI, so its floor is 3:1 (WCAG 1.4.11). The
 * field sits inside a panel, in the page's flow, so what lies behind that
 * panel is the canvas and never scrolled content: the solid-ink bound above
 * is a sticky-bar case and does not apply here. The edge is also held
 * against the field's own `--layer` fill, the other side of the line.
 */
test('the form-field edge clears 3:1 on glass and on its own fill, in both themes', () => {
  const css = stylesheet();
  assert.match(css, /border\s*:\s*1px solid var\(--line-control\)/, 'a form field draws its edge in --line-control');
  for (const [theme, vars] of THEMES()) {
    const { fallback, canvas } = backdrops(vars);
    const edge = parseColour('var(--line-control)', vars);
    const { name: on, ratio } = worst(edge, [
      ...fallback,
      ...canvas,
      { name: '--layer', colour: parseColour('var(--layer)', vars) },
    ]);
    assert.ok(ratio >= UI_FLOOR, `${theme}: --line-control on ${on} reads ${fmt(ratio)}, under ${UI_FLOOR}:1`);
  }
});

test('the contrast maths agrees with the WCAG reference pairs', () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 255, g: 255, b: 255, a: 1 };
  assert.equal(contrast(black, white), 21, 'black on white is 21:1');
  assert.equal(contrast(white, white), 1, 'a colour on itself is 1:1');
  assert.equal(fmt(contrast(parseColour('#767676', {}), white)), '4.54:1', '#767676 on white is the AA edge');
  const half = over(parseColour('rgba(0, 0, 0, 0.5)', {}), white);
  assert.ok(Math.abs(half.r - 127.5) < 1e-9, 'half-black over white composites to mid-grey');
  const pool = parseColour('color-mix(in srgb, #4a53d1 10%, transparent)', {});
  assert.deepEqual(
    [pool.r, pool.g, pool.b, +pool.a.toFixed(6)],
    [0x4a, 0x53, 0xd1, 0.1],
    'mixing with transparent thins the alpha and keeps the hue',
  );
});
