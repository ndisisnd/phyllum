/**
 * The smaller checks (v0.2.1 plan §8).
 *
 * Six questions that did not fit any of the four families before them, and are
 * only alike in that: each one reads something no other pass reads. Two colours
 * against each other rather than against the design system. A dark theme
 * against a light one. `DESIGN-SYSTEM.md` against itself. A spacing value
 * against the scale it *nearly* sits on. And two kinds of literal — z-index and
 * media-query widths — that no property table gives a role to, so the values
 * pass can only ever record them as unreadable.
 *
 * They ship as one family because a report needs one place to put them, and
 * each carries its own rule name because "an extra finding" tells a reader
 * nothing. Severities are rows in `refs/assess.md`, like every other grading in
 * the assessment.
 *
 * The organising rule for all six is **silence without evidence**, and it is
 * the deliberate half of the design rather than timidity:
 *
 *   - no dark theme in the codebase, no dark-coverage check — a tool that nags
 *     a light-only product about its missing dark palette is a tool people
 *     learn to run with the section folded;
 *   - no spacing tokens, no scale, so nothing can be off it;
 *   - two z-index values are a stack somebody planned, not a sprawl;
 *   - one colour on its own is never a near-duplicate of anything.
 *
 * Like every module on the scan path this one reads and never writes. It does
 * take its own sweep of the project, which is the fourth read of the source
 * after the values pass, the markup pass and the style-block pass — for the
 * same reason those are separate: none of them keeps what this needs. The
 * values pass throws away a `z-index: 40` because no table gives `40` a role,
 * and it never sees a media query at all, because a media query is not a
 * declaration.
 */

import fs from 'node:fs';
import path from 'node:path';

import { TOKEN_SECTIONS } from './design-system.js';
import { MAX_SOURCE_BYTES, gitignoreMatcher, isDataFile, readTextFile } from './scan-text.js';
import {
  darkEvidence,
  extraLimit,
  extraSeverityFor,
  sources,
  threshold,
} from './tokenise-spec.js';
import { deltaE, isColourValue, normaliseValue, toPx } from './tokenise.js';

/** One finding, in the vocabulary every other family already uses. */
function finding(rule, value, detail, evidence = []) {
  return { rule, severity: extraSeverityFor(rule), value, detail, evidence };
}

/** The caps and thresholds this pass ran under, as the report states them. */
export function extraLimits() {
  return {
    colourDistance: extraLimit('colour distance'),
    colourPairs: extraLimit('colour pairs'),
    offScaleTolerance: extraLimit('off-scale tolerance'),
    zIndexValues: extraLimit('z-index values'),
    files: extraLimit('files'),
  };
}

// ---------------------------------------------------------------------------
// The sweep — the literals no property table gives a role to
// ---------------------------------------------------------------------------

/** `z-index: 40`, `zIndex: 40`, `z-index="40"` — the literal, wherever written. */
const Z_INDEX = /\bz-?index\s*[:=]\s*["'{]?\s*(-?\d+)/gi;

/** `@media (min-width: 768px)` — the width, whichever side of the range it is. */
const MEDIA_WIDTH = /\((?:min|max)-(?:width|device-width)\s*:\s*([\d.]+(?:px|rem|em))\s*\)/gi;

/** `@media (prefers-color-scheme: dark) { … }` and the class schemes beside it. */
const DARK_MEDIA = /@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{/gi;

/** A `dark:` utility in a class list — Tailwind and everything that copied it. */
const DARK_UTILITY = /(?:^|["'\s])dark:([a-z0-9[\]#().,/_-]+)/gi;

/**
 * The body of the block that opens at `start`, by counting braces.
 *
 * A regex cannot balance brackets, and a dark block holds whole rules rather
 * than declarations — so the scope has to be walked rather than matched. An
 * unclosed brace (a truncated file, a template literal Phyllum misread) returns
 * what there was, which is the honest answer: the text that was actually read.
 */
export function blockBody(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return text.slice(start + 1);
}

/**
 * Every dark scope in one file's text, as plain strings.
 *
 * Three shapes, one per row of the evidence table that can be read out of a
 * file's text: the body of a `prefers-color-scheme: dark` block, the body of a
 * rule whose selector carries the class scheme, and the value half of a `dark:`
 * utility. The third is not a block at all, which is exactly why it is included
 * as text: `dark:bg-[#0B1120]` states a dark value without opening a scope.
 */
export function darkScopesIn(text) {
  const scopes = [];
  const schemes = darkEvidence()
    .filter((row) => row.evidence === 'class scheme')
    .flatMap((row) => row.spellings);

  DARK_MEDIA.lastIndex = 0;
  let media = DARK_MEDIA.exec(text);
  while (media !== null) {
    scopes.push(blockBody(text, media.index + media[0].length - 1));
    media = DARK_MEDIA.exec(text);
  }

  for (const scheme of schemes) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(scheme, from);
      if (at === -1) break;
      from = at + scheme.length;
      const open = text.indexOf('{', at);
      // The selector has to reach its own brace with nothing but selector in
      // between: `.dark` mentioned in a comment, in prose or in a class list
      // opens no scope, and reading the next rule in the file as its body would
      // be inventing one. A closed comment, a closed rule or a finished
      // declaration between the two is proof the brace belongs to something else.
      if (open === -1) continue;
      const between = text.slice(at + scheme.length, open);
      if (/[}\];]|\*\//.test(between)) continue;
      scopes.push(blockBody(text, open));
    }
  }

  DARK_UTILITY.lastIndex = 0;
  let utility = DARK_UTILITY.exec(text);
  while (utility !== null) {
    scopes.push(utility[1]);
    utility = DARK_UTILITY.exec(text);
  }

  return scopes;
}

/** Is there a dark theme in this text at all, whatever it holds? */
export function darkEvidenceIn(text, file) {
  const found = [];
  for (const row of darkEvidence()) {
    for (const spelling of row.spellings) {
      const seen =
        row.evidence === 'media query'
          ? DARK_MEDIA.test(text)
          : text.includes(spelling);
      DARK_MEDIA.lastIndex = 0;
      if (!seen) continue;
      found.push({ evidence: row.evidence, spelling, file });
      break;
    }
  }
  return found;
}

/**
 * One read of the project for the three things only this module wants.
 *
 * The same walk the other passes use — the same extensions, the same skip
 * list, the same `.gitignore`, the same bounded budget — because a fourth read
 * with a fifth idea of what a source file is would report on a different
 * project than the rest of the assessment did.
 */
export function extrasSweep(root, { maxFiles = null, maxDepth = 8 } = {}) {
  const { extensions, skipped } = sources();
  const known = new Set(extensions);
  const skip = new Set(skipped);
  const resolved = path.resolve(root);
  const ignored = gitignoreMatcher(resolved);

  const zIndex = new Map();
  const breakpoints = new Map();
  const dark = [];
  const darkText = [];
  let files = 0;
  let budget = maxFiles ?? extraLimits().files;

  const tally = (map, key, file) => {
    const row = map.get(key) ?? { value: key, count: 0, files: [] };
    row.count += 1;
    if (!row.files.includes(file)) row.files.push(file);
    map.set(key, row);
  };

  const walk = (dir, depth) => {
    if (depth > maxDepth || budget <= 0) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (budget <= 0) return;
      if (skip.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(resolved, full).split(path.sep).join('/');
      if (ignored(rel)) continue;
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      const wanted = known.has(path.extname(entry.name).toLowerCase());
      // A theme config is where `darkMode` lives, so the sweep reads data files
      // as well as source — the same reach the values pass has.
      if (!wanted && !isDataFile(entry.name)) continue;
      if (budget-- <= 0) return;
      const text = wanted
        ? readTextFile(full, { maxBytes: MAX_SOURCE_BYTES })
        : readTextFile(full);
      if (text === null) continue;
      files += 1;

      Z_INDEX.lastIndex = 0;
      let z = Z_INDEX.exec(text);
      while (z !== null) {
        tally(zIndex, z[1], rel);
        z = Z_INDEX.exec(text);
      }

      MEDIA_WIDTH.lastIndex = 0;
      let width = MEDIA_WIDTH.exec(text);
      while (width !== null) {
        tally(breakpoints, width[1].toLowerCase(), rel);
        width = MEDIA_WIDTH.exec(text);
      }

      dark.push(...darkEvidenceIn(text, rel));
      darkText.push(...darkScopesIn(text));
    }
  };

  walk(resolved, 0);
  return {
    files,
    zIndex: [...zIndex.values()].sort((a, b) => b.count - a.count || Number(a.value) - Number(b.value)),
    breakpoints: [...breakpoints.values()].sort(
      (a, b) => (toPx(a.value) ?? 0) - (toPx(b.value) ?? 0),
    ),
    dark,
    darkText,
  };
}

// ---------------------------------------------------------------------------
// Near-duplicate colours
// ---------------------------------------------------------------------------

/**
 * Every colour worth comparing: the ones the system names, and the ones the
 * codebase writes often enough to deserve a name.
 *
 * Token-worthy is the whole gate. Two one-off colours three ΔE apart are two
 * one-off colours, and reporting them would turn the classic "seventeen greys"
 * finding into "every pair of anything" — so a raw colour joins the comparison
 * only at `error` severity, which is the same three-uses line every other
 * judgement in the assessment is drawn at.
 */
export function colourCandidates(model, values = {}) {
  const seen = new Map();
  const add = (value, label, from) => {
    if (!isColourValue(value)) return;
    const key = normaliseValue(value);
    if (seen.has(key)) return;
    seen.set(key, { value, key, label, from });
  };

  for (const [name, value] of model?.tokens?.colours ?? []) add(value, name, 'token');
  for (const row of values.uncovered ?? []) {
    if (row.severity !== 'error') continue;
    add(row.value, String(row.value), 'code');
  }
  return [...seen.values()];
}

/**
 * Pairs of colours the codebase keeps apart and an eye cannot.
 *
 * Bounded above and below. Above by the distance row in the table; below by the
 * clustering threshold, because anything closer than that was already merged
 * into one cluster before this ran — so a pair here is, by construction, two
 * values that survived clustering and still look the same.
 */
export function nearDuplicateColours(model, values = {}) {
  const limits = extraLimits();
  const floor = threshold('colours');
  const candidates = colourCandidates(model, values);
  const rows = [];
  let budget = limits.colourPairs;

  for (let i = 0; i < candidates.length && budget > 0; i += 1) {
    for (let j = i + 1; j < candidates.length && budget > 0; j += 1) {
      budget -= 1;
      const a = candidates[i];
      const b = candidates[j];
      const distance = deltaE(a.value, b.value);
      if (!Number.isFinite(distance)) continue;
      if (distance <= floor || distance > limits.colourDistance) continue;
      rows.push({
        ...finding(
          'near-duplicate-colour',
          `${a.label} ~ ${b.label}`,
          `${Math.round(distance * 10) / 10} ΔE apart — two values the code keeps separate and an eye cannot`,
          [`${a.label} (${a.value}, ${a.from})`, `${b.label} (${b.value}, ${b.from})`],
        ),
        distance: Math.round(distance * 10) / 10,
        pair: [a.value, b.value],
      });
    }
  }

  return rows.sort((a, b) => a.distance - b.distance || a.value.localeCompare(b.value));
}

// ---------------------------------------------------------------------------
// Dark-mode coverage — conditional, and silent without evidence
// ---------------------------------------------------------------------------

/** Every property name declared inside a dark scope — `--color-ink`, `background`. */
const DARK_PROPERTY = /(^|[;{\s"'`])(--[a-z0-9-]+|[a-zA-Z-]{3,})\s*:/g;

/**
 * Which colours the light theme names and the dark theme never restates.
 *
 * "Has a dark counterpart" is not a fact any file format states, which is why
 * this was the last open question in the plan. There is no universal answer, so
 * the check reads the two things every styling system does have — a **place**
 * where dark values are written, and a **way** of saying which colour is being
 * restated there — and it reads the second one differently depending on how the
 * codebase writes colour:
 *
 *   - **By name** (CSS custom properties, a theme object, design tokens): the
 *     token's name is re-declared inside a dark scope. `--color-ink: #F9FAFB`
 *     under `prefers-color-scheme: dark` is `color-ink` having a dark value,
 *     stated as plainly as any file will ever state it.
 *   - **By value** (literals in stylesheets, utilities in markup): a literal
 *     cannot be "restated" — the dark version is a *different* literal, and
 *     nothing in the text ties the two together. So a raw colour counts as
 *     covered when the **property** it is written on is declared again inside a
 *     dark scope: the dark theme touches `background`, so the backgrounds are
 *     handled.
 *
 * And one gate over both, which is what keeps this from becoming a nag. If no
 * colour token in the design system is restated by name anywhere in a dark
 * scope, then this project does not express dark values per token at all — and
 * a check that then reported every token as missing would be reporting its own
 * inability to read the convention. So it says exactly that instead, and grades
 * only the raw half.
 *
 * Silent without evidence, and the silence is reported as a skipped check
 * rather than as an empty one: "no missing dark colours" and "no dark theme"
 * are different facts, and only one of them is worth printing.
 */
export function darkModeGaps(model, sweep, values = {}) {
  if (sweep.dark.length === 0) {
    return {
      checked: false,
      reason:
        'no dark theme in this codebase — no media query, class scheme, utility variant or config switch',
      evidence: [],
      tokensChecked: false,
      tokensReason: null,
      rows: [],
    };
  }

  const scopes = sweep.darkText.join('\n').toLowerCase();
  const darkProperties = new Set();
  DARK_PROPERTY.lastIndex = 0;
  let property = DARK_PROPERTY.exec(scopes);
  while (property !== null) {
    darkProperties.add(property[2].toLowerCase());
    property = DARK_PROPERTY.exec(scopes);
  }

  const namedInDark = (name) => {
    const bare = String(name ?? '').trim().toLowerCase();
    return bare.length > 0 && scopes.includes(bare);
  };
  const valueInDark = (value) => Boolean(value) && scopes.includes(normaliseValue(value));

  const tokens = (model?.tokens?.colours ?? []).filter(([, value]) => isColourValue(value));
  const restated = tokens.filter(([name, value]) => namedInDark(name) || valueInDark(value));
  const tokensChecked = tokens.length === 0 || restated.length > 0;

  const rows = [];
  if (tokensChecked) {
    for (const [name, value] of tokens) {
      if (namedInDark(name) || valueInDark(value)) continue;
      rows.push({
        ...finding(
          'dark-mode-gap',
          name,
          `${value} is never restated in a dark scope, and ${restated.length} of your colour tokens are`,
          [`${name}: ${value}`],
        ),
        token: name,
        tokenValue: value,
      });
    }
  }

  // The raw half: a colour the codebase leans on hard enough to deserve a token
  // is a colour the dark theme has to answer for — and the answer it can be
  // read for is whether the dark theme touches the property at all.
  for (const row of values.uncovered ?? []) {
    if (row.severity !== 'error' || !isColourValue(row.value)) continue;
    if (valueInDark(row.value)) continue;
    const properties = (row.properties ?? []).map((item) => String(item).toLowerCase());
    if (properties.length > 0 && properties.every((item) => darkProperties.has(item))) continue;
    rows.push({
      ...finding(
        'dark-mode-gap',
        String(row.value),
        `written ${row.count}× on ${properties.join(', ') || 'no property Phyllum could read'}, and the dark theme never touches ${properties.length === 1 ? 'it' : 'them'}`,
        [`${row.value} (${row.files[0] ?? 'unknown'})`],
      ),
      token: null,
      tokenValue: row.value,
    });
  }

  return {
    checked: true,
    reason: null,
    evidence: [...new Set(sweep.dark.map((item) => `${item.evidence} (${item.file})`))],
    tokensChecked,
    tokensReason: tokensChecked
      ? null
      : 'no colour token is restated by name in a dark scope, so this project does not express dark values per token and Phyllum will not guess which ones it covers',
    rows,
  };
}

// ---------------------------------------------------------------------------
// The design system read against itself
// ---------------------------------------------------------------------------

/**
 * Two names for one value, in the file that is supposed to settle names.
 *
 * The only check in the assessment that never reads the codebase: both halves
 * of the evidence are rows in `DESIGN-SYSTEM.md`. Compared within a section,
 * because a `16px` spacing and a `16px` radius are two decisions that happen to
 * agree, not one decision written twice.
 */
export function tokenAliasDuplicates(model) {
  const rows = [];
  for (const section of TOKEN_SECTIONS) {
    const byValue = new Map();
    for (const cells of model?.tokens?.[section.key] ?? []) {
      const [name, ...rest] = cells;
      // Typography is three columns of value, so the whole row past the name is
      // the value — two type tokens agreeing on size and disagreeing on weight
      // are not aliases of each other.
      const value = rest
        .slice(0, section.key === 'typography' ? 3 : 1)
        .map((cell) => normaliseValue(cell ?? ''))
        .join(' ')
        .trim();
      if (value === '') continue;
      byValue.set(value, [...(byValue.get(value) ?? []), name]);
    }
    for (const [value, names] of byValue) {
      if (names.length < 2) continue;
      rows.push({
        ...finding(
          'token-alias-duplicate',
          names.join(' ~ '),
          `${names.length} ${section.key} tokens holding ${value} under different names`,
          names.map((name) => `${name}: ${value}`),
        ),
        section: section.key,
        tokens: [...names],
        tokenValue: value,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Off-scale spacing
// ---------------------------------------------------------------------------

/**
 * The rungs of the spacing scale, in px, from the tokens that declare one.
 *
 * Read out of the design system rather than assumed: an eight-point system and
 * a four-point one are both scales, and Phyllum has no opinion about which a
 * project should use. No spacing tokens means no scale, which means this check
 * has nothing to measure against and says nothing.
 */
export function spacingScale(model) {
  const rungs = new Set();
  for (const [, value, applies] of model?.tokens?.numbers ?? []) {
    if (!/spacing/i.test(String(applies ?? ''))) continue;
    const px = toPx(value);
    if (px !== null && px > 0) rungs.add(px);
  }
  return [...rungs].sort((a, b) => a - b);
}

/**
 * A spacing value that misses a rung by a hair.
 *
 * Stronger than a merely-unknown value, and graded that way in the table: a
 * `17px` padding in an eight-point system is not a considered exception, it is
 * a value somebody meant to write as `16px`. So it is an `error` however few
 * times it appears — the frequency ladder answers "is this deliberate?", and a
 * near miss answers it on its own.
 *
 * A value that lands exactly on a rung is not reported here at all; it is
 * covered, and the coverage split already said so.
 */
export function offScaleSpacing(model, values = {}) {
  const rungs = spacingScale(model);
  if (rungs.length === 0) return { checked: false, reason: 'no spacing tokens, so no scale', rows: [] };

  const tolerance = extraLimits().offScaleTolerance;
  const rows = [];
  for (const row of values.uncovered ?? []) {
    if (row.pass !== 'numbers' || row.role !== 'spacing') continue;
    const px = toPx(row.value);
    if (px === null) continue;
    let nearest = null;
    for (const rung of rungs) {
      const gap = Math.abs(rung - px);
      if (nearest === null || gap < nearest.gap) nearest = { rung, gap };
    }
    if (!nearest || nearest.gap === 0 || nearest.gap > tolerance) continue;
    rows.push({
      ...finding(
        'off-scale-spacing',
        String(row.value),
        `${nearest.gap}px from ${nearest.rung}px on your own scale — a near miss reads as a mistake, not an exception`,
        [`${row.value} used ${row.count}× (${row.files[0] ?? 'unknown'})`, `scale: ${rungs.map((rung) => `${rung}px`).join(', ')}`],
      ),
      nearest: nearest.rung,
      gap: nearest.gap,
    });
  }
  return { checked: true, reason: null, rows: rows.sort((a, b) => a.gap - b.gap || a.value.localeCompare(b.value)) };
}

// ---------------------------------------------------------------------------
// Z-index sprawl and hardcoded breakpoints
// ---------------------------------------------------------------------------

/**
 * The raw z-index literals, inventoried — once there are enough to be a sprawl.
 *
 * One finding and not one per value, because the finding *is* the set: three
 * layers is a stack somebody planned, and eleven is a stack that grew every
 * time a modal went behind a header. The threshold is a row in the table, and
 * below it this says nothing at all.
 */
export function zIndexSprawl(sweep) {
  const rows = sweep.zIndex;
  if (rows.length < extraLimits().zIndexValues) return [];
  const values = rows.map((row) => row.value);
  const files = [...new Set(rows.flatMap((row) => row.files))];
  return [
    {
      ...finding(
        'z-index-sprawl',
        `${rows.length} raw z-index values`,
        `${values.join(', ')} — a stacking order nobody named, written across ${files.length} ${files.length === 1 ? 'file' : 'files'}`,
        rows.map((row) => `${row.value} ×${row.count} (${row.files[0]})`),
      ),
      values,
      files,
    },
  ];
}

/**
 * Media-query widths written as literals when a token could name them.
 *
 * A width matching a number token is covered and never reported, which is what
 * makes this rerunnable: name `768px` as `breakpoint-md` and the finding
 * disappears on the next run without anything in the code changing. Every
 * unmatched width is one finding, because a breakpoint is a decision and there
 * are rarely more than five of them.
 */
export function hardcodedBreakpoints(model, sweep) {
  const named = new Map();
  for (const [name, value] of model?.tokens?.numbers ?? []) {
    const px = toPx(value);
    if (px !== null) named.set(px, name);
  }

  const rows = [];
  for (const row of sweep.breakpoints) {
    const px = toPx(row.value);
    if (px !== null && named.has(px)) continue;
    rows.push({
      ...finding(
        'hardcoded-breakpoint',
        row.value,
        `a media-query width written out ${row.count}× with no token naming it`,
        row.files.map((file) => `${row.value} (${file})`),
      ),
      count: row.count,
      files: row.files,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

/**
 * The six smaller checks, in one object shaped like every other family.
 *
 * Each half keeps its own "was this even asked?" flag, because a check that did
 * not run and a check that found nothing are different results and the report
 * says which is which.
 */
export function assessExtras(root, model, values = {}, options = {}) {
  const sweep = extrasSweep(root, options);
  const colours = nearDuplicateColours(model, values);
  const dark = darkModeGaps(model, sweep, values);
  const aliases = tokenAliasDuplicates(model);
  const spacing = offScaleSpacing(model, values);
  const zIndex = zIndexSprawl(sweep);
  const breakpoints = hardcodedBreakpoints(model, sweep);

  return {
    limits: extraLimits(),
    swept: { files: sweep.files, zIndexValues: sweep.zIndex.length, breakpoints: sweep.breakpoints.length },
    colours,
    dark,
    aliases,
    spacing,
    zIndex,
    breakpoints,
    findings: [
      ...colours,
      ...dark.rows,
      ...aliases,
      ...spacing.rows,
      ...zIndex,
      ...breakpoints,
    ],
  };
}
