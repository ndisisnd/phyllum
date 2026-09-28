/**
 * Assertions for the view rail's four collapsible stage tabs (v0.14.1 §1/§2).
 *
 * The rail used to be four plain stage labels sitting over their page
 * buttons, always visible. Now each stage is a tab a person taps open, so the
 * risks worth pinning are different from a plain restyle:
 *
 *   1. **The shape.** Exactly four tabs, in pipeline order, each one carrying
 *      its own Lucide icon and its own page group underneath.
 *   2. **No dependency, no network.** The icons are inlined SVG, not a CDN
 *      pull or an npm package — the promise the rest of the GUI suite already
 *      holds for fonts and fetches.
 *   3. **The starting state.** Every tab starts collapsed, and every page
 *      button keeps the `data-view` it always had.
 *   4. **The toggle.** Opening a tab never closes another; tapping an open
 *      tab closes only itself. This is the one behaviour worth running
 *      rather than reading, so the handler's own tab-toggling block is lifted
 *      out of the page and run against a small fake DOM, the way every other
 *      page contract in this suite is run rather than restated.
 *
 * Nothing about how the rail looks is pinned here — a restyle rewrites no
 * assertion in this file.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { stripTicks, tableAfter } from '../../lib/md-tables.js';
import { PACKAGE_ROOT } from './helpers.js';

const GUI_PAGE = path.join(PACKAGE_ROOT, 'gui', 'index.html');
const GUI_REF = path.join(PACKAGE_ROOT, 'skill', 'refs', 'gui', 'gui.md');
const readPage = () => fs.readFileSync(GUI_PAGE, 'utf8');

const STAGES = ['assess', 'governance', 'build', 'refine'];
const LABELS = { assess: 'Assess', governance: 'Governance', build: 'Build', refine: 'Refine' };
/** One path fragment unique to each Lucide icon (lucide 1.18.0), just enough
 * to tell the four apart without pinning every point on the glyph. */
const ICON_FRAGMENTS = {
  assess: 'circle cx="12" cy="12" r="3"', // scan-search
  governance: 'm9 12 2 2 4-4', // shield-check
  build: 'm18 15 4-4', // hammer
  refine: 'M20 2v4', // sparkles
};

/** The tab buttons, in document order, each with its group's markup beside it. */
function railTabs(page) {
  const matches = [...page.matchAll(/<button class="rail-tab" data-stage="([a-z]+)"[^>]*>/g)];
  return matches.map((match) => {
    const start = match.index;
    const groupStart = page.indexOf('<div class="rail-group"', start);
    const groupEnd = page.indexOf('</div>', page.indexOf('id="rail-group-', groupStart));
    return {
      stage: match[1],
      tag: match[0],
      body: page.slice(start, groupStart),
      group: page.slice(groupStart, groupEnd),
    };
  });
}

// ---------------------------------------------------------------------------
// The shape: four tabs, in order, each with its icon and its group
// ---------------------------------------------------------------------------

test('the rail shows exactly four stage tabs, in pipeline order', () => {
  const tabs = railTabs(readPage());
  assert.deepEqual(tabs.map((tab) => tab.stage), STAGES, 'assess, governance, build, refine — in that order');
  for (const tab of tabs) {
    assert.ok(tab.body.includes(`>${LABELS[tab.stage]}<`), `the ${tab.stage} tab carries its own label`);
  }
});

test('every tab carries its own inline Lucide icon', () => {
  const tabs = railTabs(readPage());
  for (const tab of tabs) {
    assert.match(tab.body, /<svg class="rail-icon"[^>]*>/, `${tab.stage} has an inline rail-icon svg`);
    assert.ok(
      tab.body.includes(ICON_FRAGMENTS[tab.stage]),
      `${tab.stage} carries the path distinctive to its own icon, not another stage's`,
    );
    // And no other stage's fragment leaked in alongside it.
    for (const [other, fragment] of Object.entries(ICON_FRAGMENTS)) {
      if (other === tab.stage) continue;
      assert.ok(!tab.body.includes(fragment), `${tab.stage}'s icon does not also carry ${other}'s path`);
    }
  }
});

test('the icons are inline SVG — no CDN, no network fetch, no dependency', () => {
  const page = readPage();
  // The page may say in a comment where the paths were copied from (v0.14.1
  // §1: "Lucide … from lucide 1.18.0"), but it never *fetches* the library —
  // no script tag, no link, no import naming it.
  assert.ok(!/<script[^>]*\blucide/i.test(page), 'no script tag names lucide as a source');
  assert.ok(!/<link[^>]*\blucide/i.test(page), 'no link tag names lucide as a source');
  assert.ok(!/import[^\n]*lucide/i.test(page), 'no import statement names lucide');
  assert.equal(page.match(/https?:\/\//g), null, 'no absolute URL for an icon or anything else');
  assert.ok(!/<script[^>]+\bsrc=/i.test(page), 'no second script is pulled in to draw the icons');

  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies ?? {}, {}, 'package.json keeps no dependency for the icons');
});

// ---------------------------------------------------------------------------
// The starting state
// ---------------------------------------------------------------------------

test('every tab starts collapsed, and every group starts hidden', () => {
  const page = readPage();
  const tabs = railTabs(page);
  for (const tab of tabs) {
    assert.match(tab.tag, /aria-expanded="false"/, `${tab.stage} tab starts collapsed`);
    assert.match(tab.tag, new RegExp(`aria-controls="rail-group-${tab.stage}"`), `${tab.stage} tab names its own group`);
    assert.match(tab.group, /^<div class="rail-group" id="rail-group-[a-z]+" hidden>/, `${tab.stage} group starts hidden`);
  }
});

test('the group contents match the stage table — pages where there are pages, the empty chip where there are none', () => {
  const tabs = new Map(railTabs(readPage()).map((tab) => [tab.stage, tab]));

  const views = (stage) => [...tabs.get(stage).group.matchAll(/data-view="([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(views('assess'), ['library', 'reports']);
  assert.deepEqual(views('build'), ['workbench', 'build-reports', 'tokens']);

  for (const stage of ['governance', 'refine']) {
    assert.deepEqual(views(stage), [], `${stage} holds no page button`);
    assert.match(tabs.get(stage).group, /rail-empty[\s\S]*?nothing yet/, `${stage} shows the empty chip`);
  }
});

test('all five views still exist, and each data-view value is used exactly once', () => {
  const page = readPage();
  const values = [...page.matchAll(/data-view="([a-z-]+)"/g)].map((m) => m[1]);
  const expected = ['library', 'reports', 'workbench', 'build-reports', 'tokens'];
  assert.deepEqual([...values].sort(), [...expected].sort(), 'no view was added, dropped, or renamed');
  for (const view of expected) {
    assert.equal(values.filter((value) => value === view).length, 1, `${view} appears exactly once`);
  }
});

// ---------------------------------------------------------------------------
// The toggle — the handler's own logic, run rather than restated
// ---------------------------------------------------------------------------

/**
 * The tab-toggling block of the `#views` click handler, lifted out of the
 * page and run against a fake DOM. It is the one part of the handler this
 * file cares about, so only the block up to its own `return` is taken — the
 * page-button half of the same handler (already covered elsewhere in the
 * suite) is left alone.
 */
function tabToggle() {
  const text = readPage();
  const start = text.indexOf("const tab = event.target.closest && event.target.closest('.rail-tab');");
  const end = text.indexOf('const view = event.target.dataset');
  assert.ok(start !== -1 && end > start, 'the page still has the tab-toggling block at a findable spot');
  const block = text.slice(start, end);
  assert.ok(!/\bdocument\b|\bfetch\s*\(/.test(block), 'the block touches no real document and no network');
  // eslint-disable-next-line no-new-func
  return new Function('event', 'el', `${block}`);
}

/** A minimal stand-in for a tab button and its group — just enough surface
 * for the toggle block to read and write. */
function fakeTab(stage, expanded = false) {
  const tab = {
    className: 'rail-tab',
    dataset: { stage },
    attrs: { 'aria-expanded': String(expanded), 'aria-controls': `rail-group-${stage}` },
    getAttribute(name) {
      return this.attrs[name];
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    closest(selector) {
      return selector === '.rail-tab' ? tab : null;
    },
  };
  const group = { hidden: !expanded };
  return { tab, group };
}

/** A fake `el(id)` that only knows the groups it was handed. */
function fakeEl(groups) {
  return (id) => groups[id];
}

test('tapping a closed tab opens it, and opening one leaves the others open', () => {
  const toggle = tabToggle();
  const assess = fakeTab('assess', false);
  const build = fakeTab('build', false);
  const el = fakeEl({ 'rail-group-assess': assess.group, 'rail-group-build': build.group });

  toggle({ target: assess.tab }, el);
  assert.equal(assess.tab.getAttribute('aria-expanded'), 'true', 'the tapped tab opens');
  assert.equal(assess.group.hidden, false, 'and its group is shown');
  assert.equal(build.tab.getAttribute('aria-expanded'), 'false', 'a tab nobody tapped stays as it was');
  assert.equal(build.group.hidden, true);

  toggle({ target: build.tab }, el);
  assert.equal(build.tab.getAttribute('aria-expanded'), 'true', 'a second tab opens independently');
  assert.equal(build.group.hidden, false);
  assert.equal(assess.tab.getAttribute('aria-expanded'), 'true', 'and the first tab it did not touch stays open');
  assert.equal(assess.group.hidden, false);
});

test('tapping an open tab closes only that tab', () => {
  const toggle = tabToggle();
  const assess = fakeTab('assess', true);
  const build = fakeTab('build', true);
  const el = fakeEl({ 'rail-group-assess': assess.group, 'rail-group-build': build.group });

  toggle({ target: assess.tab }, el);
  assert.equal(assess.tab.getAttribute('aria-expanded'), 'false', 'the tapped tab closes');
  assert.equal(assess.group.hidden, true);
  assert.equal(build.tab.getAttribute('aria-expanded'), 'true', 'the other tab is left open');
  assert.equal(build.group.hidden, false);
});

test('a click that lands on the icon or the label still toggles the tab it sits inside', () => {
  const toggle = tabToggle();
  const assess = fakeTab('assess', false);
  const el = fakeEl({ 'rail-group-assess': assess.group });

  // The click target is the svg or the span, not the button itself — the
  // handler answers to whichever `.rail-tab` is nearest, per its own comment.
  const inner = { closest: (selector) => (selector === '.rail-tab' ? assess.tab : null) };
  toggle({ target: inner }, el);
  assert.equal(assess.tab.getAttribute('aria-expanded'), 'true', 'the tab it belongs to opens');
});

test('a click on a page button, not a tab, falls through rather than toggling anything', () => {
  const toggle = tabToggle();
  // `closest` returns nothing for a click that never touched a `.rail-tab` —
  // exactly what a page button's own click target sees.
  const pageButton = { closest: () => null, dataset: { view: 'library' } };
  assert.doesNotThrow(() => toggle({ target: pageButton }, fakeEl({})));
});

// ---------------------------------------------------------------------------
// The rail doc and the page cannot drift apart
// ---------------------------------------------------------------------------

test('the rail ref names the same four stages the page ships, in the same order', () => {
  const ref = fs.readFileSync(GUI_REF, 'utf8');
  const rows = tableAfter(ref, '| Stage | What sits under it |', 'refs/gui/gui.md');
  assert.deepEqual(
    rows.map((row) => stripTicks(row[0])),
    ['Assess', 'Governance', 'Build', 'Refine'],
    'the ref table lists the same four stages, in the same order, as the page',
  );
});
