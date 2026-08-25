/**
 * `refine a11y` — contrast, focus states, and the archetype's ARIA row (v0.11.0 §4).
 *
 * The gate's fourth section, and the first one that asks about the people who
 * will use what was built rather than about the files it was built from. Three
 * checks, and each one is deliberately narrower than the question it serves:
 *
 *   1. **Contrast, on pairs somebody recorded.** `DESIGN-SYSTEM.md` records
 *      colours one at a time and never records that this text sits on that
 *      surface. The component spec does — a spec that fills both a foreground
 *      slot and its background slot has stated a pairing — and that statement is
 *      the only evidence this module acts on. Every token against every other
 *      token would be a wall of ratios about pairs no screen will ever show.
 *   2. **Focus, as presence.** An interactive archetype whose spec records no
 *      focus treatment is a control nobody can see themselves reach. That is an
 *      absence in a file Phyllum owns, so it is a finding rather than a caveat.
 *   3. **ARIA, as a table lookup.** Each archetype's row says the native element
 *      it carries, the role a hand-written version must declare, and the
 *      attributes that role then owes. An archetype with no row is reported as
 *      having no row. It is never passed silently.
 *
 * Two reuses keep this module from becoming a second opinion about anything:
 * colours are read by `toRgb` from `lib/tokenise.js`, the one colour parser in
 * the product, and a component's markup is found by `componentFiles` from
 * `lib/refine-coverage.js`, which is `applied:`'s own answer about where a
 * component lives. Every rule, every threshold, every pairing and every ARIA
 * row is read from `refs/refine/a11y.md` through `lib/refine-spec.js`. What
 * lives here is arithmetic and string reading, and nothing else.
 *
 * Read-only, like the rest of the stage: this module opens files for reading
 * and contains no write call.
 */

import { parseSpecBlock } from './create.js';
import { readComponent, specOf } from './prd.js';
import { componentFiles } from './refine-coverage.js';
import {
  ERROR,
  a11yRules,
  ariaExpectationFor,
  contrastPairs,
  contrastThresholdFor,
  refineSeverityFor,
} from './refine-spec.js';
import { MAX_SOURCE_BYTES, readTextFile } from './scan-text.js';
import { alphaOf, toPx, toRgb } from './tokenise.js';

/** The sentences every a11y result is read under, and never without. */
export const STATED_CAVEATS = [
  'contrast is measured on the values the design system records, not on rendered pixels',
  'keyboard behaviour is stated from the archetype table and is never verified — a running program is not text',
  'only pairs a component spec binds are checked; a pairing nobody recorded is reported unpaired, not invented',
];

/** The px size at which text becomes large, and the smaller size bold text needs. */
export const LARGE_TEXT_PX = 24;
export const LARGE_BOLD_PX = 18.66;

/** The weight at or above which text counts as bold for the large-text cut-off. */
export const BOLD_WEIGHT = 700;

/** A finding, in the vocabulary every other finding in Phyllum already uses. */
function finding(rule, value, detail, evidence = []) {
  return { rule, severity: refineSeverityFor(rule), value, detail, evidence };
}

// ---------------------------------------------------------------------------
// The arithmetic — WCAG 2.x relative luminance and contrast ratio
// ---------------------------------------------------------------------------

/**
 * Relative luminance, 0 for black and 1 for white, or null for a non-colour.
 *
 * The formula is WCAG 2.x's and is written out rather than approximated:
 * each sRGB channel is scaled to 0–1, linearised through the 0.03928 knee, and
 * weighted 0.2126 / 0.7152 / 0.0722. `lib/tokenise.js` already linearises
 * channels on the way to Lab, but that is a *perceptual* transform on a
 * different white point and reusing it would give the right shape and the wrong
 * numbers.
 */
export function relativeLuminance(value) {
  const rgb = toRgb(value);
  if (!rgb) return null;
  const linear = (channel) => {
    const c = Math.min(255, Math.max(0, channel)) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
}

/**
 * The contrast ratio between two colours — 21 for black on white, 1 for a
 * colour on itself, and null when either side cannot be read as a colour.
 *
 * Alpha is deliberately not composited. A translucent colour's real ratio
 * depends on whatever is behind it, and nothing in `DESIGN-SYSTEM.md` records
 * what that is; `isOpaque` is what the caller uses to refuse the pair instead of
 * answering it from an assumed backdrop.
 */
export function contrastRatio(a, b) {
  const one = relativeLuminance(a);
  const two = relativeLuminance(b);
  if (one === null || two === null) return null;
  const lighter = Math.max(one, two);
  const darker = Math.min(one, two);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Is this colour fully opaque? A translucent one has no ratio worth reporting. */
export const isOpaque = (value) => alphaOf(value) === 1;

/** Does a ratio clear the bar its context sets? */
export const meetsContrast = (ratio, context) =>
  ratio !== null && ratio >= contrastThresholdFor(context);

/** A ratio as a report reads it — two decimals, never a raw float. */
export const roundRatio = (ratio) => (ratio === null ? null : Math.round(ratio * 100) / 100);

// ---------------------------------------------------------------------------
// Reading the design system
// ---------------------------------------------------------------------------

/**
 * Every recorded colour, by token name.
 *
 * Primitives are included: the neutral ramp is recorded as tokens and a spec
 * may bind a slot to `neutral-900` exactly as it may bind one to `brand-primary`.
 * A pairing that named a colour Phyllum records and got "unreadable" back would
 * be reporting a limit that is not there.
 */
export function colourIndex(model) {
  const index = new Map();
  for (const key of ['colours', 'primitives']) {
    for (const row of model?.tokens?.[key] ?? []) {
      const name = String(row?.[0] ?? '').trim();
      if (name !== '') index.set(name.toLowerCase(), String(row?.[1] ?? '').trim());
    }
  }
  return index;
}

/** Every recorded typography token, by name — size, weight and line height. */
export function typographyIndex(model) {
  const index = new Map();
  for (const row of model?.tokens?.typography ?? []) {
    const name = String(row?.[0] ?? '').trim();
    if (name === '') continue;
    index.set(name.toLowerCase(), {
      size: String(row?.[1] ?? '').trim(),
      weight: String(row?.[2] ?? '').trim(),
      lineHeight: String(row?.[3] ?? '').trim(),
    });
  }
  return index;
}

/**
 * What a slot is actually bound to: a token's value, a literal, or nothing.
 *
 * A spec slot normally names a token, so the token table is asked first. A slot
 * that writes a colour out by hand is still a colour and is still measured —
 * `refine coverage` is the section that grades a literal for being a literal,
 * and answering the same complaint twice under two rule names would double-count
 * one mistake.
 */
export function boundColour(bound, colours) {
  const raw = String(bound ?? '').trim();
  if (raw === '' || raw.toUpperCase() === 'TODO') {
    return { bound: raw, token: null, value: null, readable: false, reason: 'the slot is unfilled' };
  }
  const name = raw.replace(/^var\(\s*--/, '').replace(/\s*\)$/, '').trim();
  const recorded = colours.get(name.toLowerCase());
  const value = recorded ?? raw;
  if (!toRgb(value)) {
    return {
      bound: raw,
      token: recorded === undefined ? null : name,
      value: null,
      readable: false,
      reason:
        recorded === undefined
          ? 'no colour token is recorded under that name, and it is not a colour Phyllum reads'
          : 'the token records a value that is not a colour Phyllum reads',
    };
  }
  if (!isOpaque(value)) {
    return {
      bound: raw,
      token: recorded === undefined ? null : name,
      value,
      readable: false,
      reason: 'the colour is translucent, so its real ratio depends on a backdrop nothing records',
    };
  }
  return { bound: raw, token: recorded === undefined ? null : name, value, readable: true, reason: null };
}

/**
 * Which text threshold this component's own typography earns.
 *
 * A component that records no typography token, or one the table does not
 * carry, is measured at `normal-text`. That is the stricter bar, and it is the
 * right default for the reason the whole stage runs on: the alternative grants a
 * discount nothing recorded.
 */
export function textContext(spec, typography) {
  const named = String(spec?.properties?.typography ?? '').trim();
  const row = typography.get(named.replace(/^var\(\s*--/, '').replace(/\s*\)$/, '').toLowerCase());
  if (!row) return 'normal-text';
  const px = toPx(row.size);
  if (px === null) return 'normal-text';
  const weight = Number.parseFloat(row.weight);
  const bold = (Number.isFinite(weight) && weight >= BOLD_WEIGHT) || /bold|black|heavy/i.test(row.weight);
  if (px >= LARGE_TEXT_PX) return 'large-text';
  return bold && px >= LARGE_BOLD_PX ? 'large-text' : 'normal-text';
}

// ---------------------------------------------------------------------------
// 1. Contrast
// ---------------------------------------------------------------------------

/**
 * The slot map a state sees: the component's own slots, with the state's
 * overrides written over them.
 *
 * A `hover:` that changes only the background is still a text pair, because the
 * label did not move. Re-deriving the pairs under the overridden map is what
 * catches a hover that drops a label below the bar.
 */
export function slotsInState(spec, state = null) {
  const base = { ...(spec?.properties ?? {}) };
  if (state === null) return base;
  const overrides = spec?.states?.[state];
  if (!overrides || typeof overrides !== 'object') return null;
  return { ...base, ...overrides };
}

/**
 * Every pair one component states, base slots and each state's overrides.
 *
 * A pair is stated only when both of its slots are filled. A `Card` fills
 * `background` and `border-colour` and no `text-colour`, so it states a boundary
 * pair and no text pair; that is a fact about the archetype, not a gap.
 */
export function pairsFor(spec, { context = 'normal-text' } = {}) {
  const rows = contrastPairs();
  const out = [];
  const states = [null, ...Object.keys(spec?.states ?? {})];

  for (const state of states) {
    const slots = slotsInState(spec, state);
    if (slots === null) continue;
    for (const row of rows) {
      const foreground = slots[row.foreground];
      const background = slots[row.background];
      if (foreground === undefined || background === undefined) continue;
      out.push({
        state,
        foregroundSlot: row.foreground,
        backgroundSlot: row.background,
        foreground: String(foreground).trim(),
        background: String(background).trim(),
        // A text pair's bar depends on the component's own type size; every
        // other pair's bar is the one the pairs table names outright.
        context: row.context === 'normal-text' ? context : row.context,
        names: row.names,
      });
    }
  }
  // A state that overrides nothing on either side of a pair restates that pair
  // unchanged, and one pair reported twice is one pair reported wrong.
  const seen = new Set();
  return out.filter((pair) => {
    const key = `${pair.foregroundSlot}|${pair.backgroundSlot}|${pair.foreground}|${pair.background}|${pair.context}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Where a pair came from, as a finding says it. */
const whereFrom = (pair) =>
  pair.state === null ? 'the base spec' : `the \`${pair.state}\` state`;

/** One component's contrast reading: every stated pair, measured. */
export function componentContrast(name, spec, model) {
  const colours = colourIndex(model);
  const context = textContext(spec, typographyIndex(model));
  const measured = [];
  const findings = [];

  for (const pair of pairsFor(spec, { context })) {
    const foreground = boundColour(pair.foreground, colours);
    const background = boundColour(pair.background, colours);
    const required = contrastThresholdFor(pair.context);

    if (!foreground.readable || !background.readable) {
      const broken = foreground.readable ? background : foreground;
      const slot = foreground.readable ? pair.backgroundSlot : pair.foregroundSlot;
      measured.push({ ...pair, ratio: null, required, pass: null, reason: broken.reason });
      findings.push(
        finding(
          'unreadable-pair',
          broken.bound,
          `\`${name}\` binds \`${slot}\` to something this section cannot measure — ${broken.reason}`,
          [`${whereFrom(pair)}: ${slot}: ${broken.bound || '(empty)'}`],
        ),
      );
      continue;
    }

    const ratio = roundRatio(contrastRatio(foreground.value, background.value));
    const pass = ratio >= required;
    measured.push({ ...pair, ratio, required, pass, reason: null });
    if (pass) continue;
    findings.push(
      finding(
        'contrast-fail',
        `${ratio}:1`,
        `\`${name}\` pairs \`${pair.foregroundSlot}\` on \`${pair.backgroundSlot}\` at ${ratio}:1, below the ${required}:1 its ${pair.context} context requires`,
        [
          `${whereFrom(pair)}: ${pair.foreground} (${foreground.value}) on ${pair.background} (${background.value})`,
        ],
      ),
    );
  }

  return { context, pairs: measured, findings };
}

/**
 * The colour tokens no component spec binds on either side of a pair.
 *
 * One finding for the whole set rather than one per token, because this is a
 * question about what the system recorded and not a fault in any single colour.
 * A ramp of forty neutrals would otherwise bury every real finding in the
 * section under forty warnings that all say the same thing.
 */
export function unpairedTokens(model, specs) {
  const bound = new Set();
  const slots = new Set(contrastPairs().flatMap((row) => [row.foreground, row.background]));
  for (const spec of specs) {
    for (const state of [null, ...Object.keys(spec?.states ?? {})]) {
      const map = slotsInState(spec, state);
      if (map === null) continue;
      for (const [slot, value] of Object.entries(map)) {
        if (!slots.has(slot)) continue;
        bound.add(
          String(value ?? '')
            .trim()
            .replace(/^var\(\s*--/, '')
            .replace(/\s*\)$/, '')
            .toLowerCase(),
        );
      }
    }
  }
  return [...colourIndex(model).keys()].filter((token) => !bound.has(token)).sort();
}

// ---------------------------------------------------------------------------
// 2. Focus states
// ---------------------------------------------------------------------------

/**
 * Does this component record a focus treatment?
 *
 * Either spelling counts: a `focus` entry under `states:`, or a `focus-ring`
 * slot under `properties:`. Two ways of saying the same thing, and refusing one
 * of them would fail a component that had done the work.
 */
export function focusReading(name, spec, expectation) {
  if (!expectation || !expectation.interactive) {
    return { interactive: false, recorded: null, pass: null, findings: [] };
  }
  const state = spec?.states?.focus;
  const hasState = state !== undefined && String(state).trim().toUpperCase() !== 'TODO';
  const ring = String(spec?.properties?.['focus-ring'] ?? '').trim();
  const hasRing = ring !== '' && ring.toUpperCase() !== 'TODO';
  const recorded = hasState ? 'a `focus` state' : hasRing ? 'a `focus-ring` slot' : null;
  if (recorded !== null) return { interactive: true, recorded, pass: true, findings: [] };
  return {
    interactive: true,
    recorded: null,
    pass: false,
    findings: [
      finding(
        'focus-missing',
        expectation.archetype,
        `\`${name}\` is a \`${expectation.archetype}\`, which is interactive, and its spec records no focus treatment — add a \`focus\` state or a \`focus-ring\` slot`,
        [`the spec records states: ${Object.keys(spec?.states ?? {}).join(', ') || 'none'}`],
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// 3. ARIA expectations
// ---------------------------------------------------------------------------

/** Does this markup use the element? A tag open, so `<button` and not `button`. */
const usesElement = (text, element) =>
  element !== null && new RegExp(`<${element}\\b`, 'i').test(text);

/** Does this markup declare the role by hand? `role="button"`, however quoted. */
const declaresRole = (text, role) =>
  role !== null && new RegExp(`role\\s*=\\s*["'{\`]?\\s*${role}\\b`, 'i').test(text);

/**
 * One component's ARIA reading, against the markup it was adopted into.
 *
 * The native element carries its own semantics, and that is the whole shape of
 * this check. A real `<input type="checkbox">` needs no `aria-checked` — adding
 * one is a way to make it wrong — so the attribute column is what an author owes
 * only when they wrote the role by hand instead. A `role="checkbox"` on a `div`
 * promises a state, and nothing carries that promise unless it is written out.
 */
export function ariaReading(name, expectation, files, readFile) {
  if (!expectation) {
    return {
      archetype: null,
      expected: null,
      pass: null,
      stated: 'no archetype row records an ARIA expectation for this component',
      findings: [],
    };
  }
  const keyboard = expectation.keyboard;
  const base = {
    archetype: expectation.archetype,
    element: expectation.element,
    role: expectation.role,
    attributes: expectation.attributes,
    keyboard,
    keyboardVerified: false,
  };

  if (expectation.role === null && expectation.attributes.length === 0) {
    return {
      ...base,
      expected: false,
      pass: null,
      stated: `the archetype table records no role and no attributes for \`${expectation.archetype}\``,
      findings: [],
    };
  }

  const read = files.map((file) => ({ file, text: readFile(file) })).filter((entry) => entry.text !== null);
  if (read.length === 0) {
    return {
      ...base,
      expected: true,
      pass: null,
      stated:
        files.length === 0
          ? 'nothing in the markup scan is this component, so the expectation was not checked'
          : 'the markup this component lives in could not be read, so the expectation was not checked',
      findings: [
        finding(
          'aria-unverified',
          expectation.archetype,
          `\`${name}\` carries a \`${expectation.role}\` expectation that was not checked — ${files.length === 0 ? 'the component is not built' : 'its markup could not be read'}`,
          files.map((file) => `${file}: unread`),
        ),
      ],
    };
  }

  const native = read.filter((entry) => usesElement(entry.text, expectation.element));
  if (native.length > 0) {
    return {
      ...base,
      expected: true,
      pass: true,
      how: 'natively',
      stated: `\`<${expectation.element}>\` carries the \`${expectation.role}\` role and the state that goes with it`,
      findings: [],
    };
  }

  const declared = read.filter((entry) => declaresRole(entry.text, expectation.role));
  if (declared.length === 0) {
    return {
      ...base,
      expected: true,
      pass: false,
      how: null,
      stated: null,
      findings: [
        finding(
          'aria-unmet',
          expectation.role,
          `\`${name}\` is built without ${expectation.element === null ? '' : `the \`<${expectation.element}>\` element or `}\`role="${expectation.role}"\` — assistive technology is told nothing about what it is`,
          read.map((entry) => `${entry.file}: neither the element nor the role`),
        ),
      ],
    };
  }

  const missing = expectation.attributes.filter(
    (attribute) => !declared.some((entry) => entry.text.includes(attribute)),
  );
  if (missing.length === 0) {
    return {
      ...base,
      expected: true,
      pass: true,
      how: 'explicitly',
      stated: `\`role="${expectation.role}"\` is written by hand, with every attribute it owes`,
      findings: [],
    };
  }
  return {
    ...base,
    expected: true,
    pass: false,
    how: 'explicitly',
    stated: null,
    missing,
    findings: [
      finding(
        'aria-unmet',
        missing.join(', '),
        `\`${name}\` writes \`role="${expectation.role}"\` by hand and misses ${missing.map((a) => `\`${a}\``).join(', ')} — a hand-written role carries no state unless the state is written too`,
        declared.map((entry) => `${entry.file}: role="${expectation.role}" without ${missing.join(', ')}`),
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

/** Read one of the project's files, or null when it cannot be read. */
const fileReader = (root) => (file) =>
  readTextFile(`${root}/${file}`, { maxBytes: MAX_SOURCE_BYTES });

/**
 * The a11y section, over every recorded component.
 *
 * Unlike `refine coverage`, this section still runs when the component pass
 * does not: contrast and focus are read out of `DESIGN-SYSTEM.md` alone, and
 * refusing them because the codebase could not be walked would withhold two
 * answers Phyllum already has. What the missing walk costs is the ARIA reading,
 * and that is reported per component as unverified rather than failed.
 */
export function refineA11y(root, model, options = {}) {
  const { componentPass = { ran: true, reason: null }, signatures = null, ...rest } = options;
  const walked = componentPass.ran !== false;
  const located = walked ? componentFiles(root, model, { ...rest, signatures }) : [];
  const byName = new Map(located.map((entry) => [entry.component, entry]));
  const readFile = options.readFile ?? fileReader(root);
  const specs = [];

  const components = (model?.components ?? []).map((component) => {
    const recorded = readComponent(component);
    const spec = parseSpecBlock(specOf(component) ?? '');
    specs.push(spec);
    const expectation = recorded.custom ? null : ariaExpectationFor(recorded.archetype);

    if (recorded.custom) {
      return {
        component: recorded.name,
        archetype: recorded.archetype,
        checked: false,
        reason: 'a custom component claimed no archetype contract, so there is no row to hold it to',
        contrast: null,
        focus: null,
        aria: null,
        pass: null,
        findings: [],
      };
    }

    const contrast = componentContrast(recorded.name, spec, model);
    const focus = focusReading(recorded.name, spec, expectation);
    const files = walked ? (byName.get(recorded.name)?.markup ?? []) : [];
    const aria = walked
      ? ariaReading(recorded.name, expectation, files, readFile)
      : {
          archetype: expectation?.archetype ?? null,
          expected: expectation ? expectation.role !== null : null,
          pass: null,
          stated: componentPass.reason ?? 'the component pass did not run for this stack',
          findings: expectation?.role
            ? [
                finding(
                  'aria-unverified',
                  expectation.archetype,
                  `\`${recorded.name}\` carries a \`${expectation.role}\` expectation that was not checked — ${componentPass.reason ?? 'the component pass did not run for this stack'}`,
                ),
              ]
            : [],
        };

    const findings = [...contrast.findings, ...focus.findings, ...aria.findings];
    return {
      component: recorded.name,
      archetype: recorded.archetype,
      checked: true,
      reason: null,
      contrast,
      focus,
      aria,
      pass: findings.every((row) => row.severity !== ERROR),
      findings,
    };
  });

  const unpaired = unpairedTokens(model, specs);
  const findings = components.flatMap((entry) => entry.findings);
  if (unpaired.length > 0) {
    findings.push(
      finding(
        'unpaired-token',
        `${unpaired.length} colour token${unpaired.length === 1 ? '' : 's'}`,
        'no component spec binds these colours to a partner, so nothing records what they are read against',
        unpaired,
      ),
    );
  }

  const graded = components.filter((entry) => entry.checked);
  return {
    ran: true,
    reason: null,
    // The ARIA reading is the only part a missing component pass costs, and it
    // is named here rather than left for the reader to deduce from a `null`.
    markupRead: walked,
    markupReason: walked ? null : (componentPass.reason ?? 'the component pass did not run for this stack'),
    caveats: STATED_CAVEATS,
    components,
    unpaired,
    findings,
    // A conjunction, not a proportion — and a system with nothing gradable
    // passes nothing rather than passing cleanly.
    pass: graded.length === 0 ? null : graded.every((entry) => entry.pass),
  };
}

/** The rules this section may report, straight from the table. */
export const rules = () => a11yRules().map((row) => row.rule);
