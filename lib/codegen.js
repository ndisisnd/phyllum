/**
 * The code view (plan §3.3).
 *
 * v1 emits React + CSS. Framework detection picks the *label* on the block and
 * nothing more: Vue and Svelte emitters are explicitly out of scope for v1
 * (plan §9), and detection failure falls back to the same React + CSS output.
 *
 * The code view is a view. It is rendered into `DESIGN-SYSTEM.md` for the user
 * to copy; Phyllum never writes component code into the codebase.
 *
 * v0.7.3 phase 3 changes exactly one thing here: how a `typography` slot turns
 * into CSS declarations. Before this release the three mandatory readings were
 * pulled off a token's row by fixed position — `row[1]` is size, `row[2]` is
 * weight, `row[3]` is line-height — and hand-mapped to `font-size`,
 * `font-weight` and `line-height`. That was the last place in the codebase that
 * still treated the Typography table as three fixed columns rather than as
 * the contract table `skill/refs/typography.md` ships. This module no longer
 * holds that mapping. It builds the set of readings a token records — the three
 * mandatory ones off the row, plus whatever optional readings
 * `lib/typography.js` reads out of the token's fenced block — and hands that
 * set to `declarationsFor` in `lib/typography.js`, which is phase 1's own
 * reader for what a reading becomes as CSS, merge rule and all. Reusing that
 * function rather than re-deriving the mapping is what keeps this file free of
 * a second copy of the contract, the same rule every other reference-backed
 * module in this codebase already follows.
 *
 * The regression this rests on is a plain one: a token with no optional
 * readings must keep generating byte-identical CSS. `declarationsFor` walks
 * the contract table in its own row order, and the mandatory three sit first
 * in that table in the same order they always rendered in — size, weight,
 * line-height — so the output does not move.
 */

import { CORE_READINGS, declarationsFor as declarationsForReadings, readingsOf } from './typography.js';

/**
 * The HTML element an archetype renders as.
 *
 * Only where the element is the obvious one every surveyed system reaches for.
 * A `div` is the honest default for the rest — including a custom (§6.7), which
 * by definition is not any known kind of thing.
 */
const ELEMENTS = {
  button: 'button',
  input: 'input',
  badge: 'span',
  select: 'select',
  toggle: 'input',
  checkbox: 'input',
  radio: 'input',
  link: 'a',
  progress: 'progress',
};

export function elementFor(archetype) {
  return ELEMENTS[archetype] ?? 'div';
}

/** Property key -> CSS declaration name. */
const CSS_PROPERTY = {
  background: 'background',
  'text-colour': 'color',
  'border-colour': 'border-color',
  'border-width': 'border-width',
  radius: 'border-radius',
  'radius-top-left': 'border-top-left-radius',
  'radius-top-right': 'border-top-right-radius',
  'radius-bottom-right': 'border-bottom-right-radius',
  'radius-bottom-left': 'border-bottom-left-radius',
  padding: 'padding',
  'padding-top': 'padding-top',
  'padding-bottom': 'padding-bottom',
  'padding-left': 'padding-left',
  'padding-right': 'padding-right',
  'font-size': 'font-size',
  'font-weight': 'font-weight',
  'line-height': 'line-height',
  shadow: 'box-shadow',
  gap: 'gap',
  'overlay-colour': '--overlay-colour',
  'focus-ring': 'outline',
};

/** State name -> the selector it belongs on. */
const STATE_SELECTOR = {
  hover: ':hover',
  focus: ':focus-visible',
  active: ':active',
  disabled: ':disabled',
  checked: ':checked',
  error: '.is-error',
};

/** `Button/Primary` -> `button-primary`. */
export function classNameFor(name) {
  return String(name)
    .split('/')
    .map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase())
    .join('-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** `Button/Primary` -> `ButtonPrimary`. */
export function componentNameFor(name) {
  return String(name)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * The readings one typography token's row and fenced block together hold.
 *
 * `CORE_READINGS` is `['size', 'weight', 'line-height']`, in the Typography
 * table's own column order, so `row[i + 1]` is that reading's recorded value.
 * A row cell can be empty (a slot left blank on a hand-edited file), and an
 * empty mandatory reading is "not decided" exactly as an absent optional one
 * is — it is not entered, rather than entered as `''`. The optional readings
 * come from `readingsOf`, phase 1's own reader of the token's fenced block,
 * which already returns nothing for a token with no block.
 */
function typographyEntries(row, model) {
  const entries = {};
  CORE_READINGS.forEach((reading, index) => {
    const cell = row[index + 1];
    if (cell) entries[reading] = cell;
  });
  Object.assign(entries, readingsOf(model, row[0]));
  return entries;
}

/** Look a token name up in the model; null when it is a raw value. */
function tokenLookup(model, value) {
  if (!model) return null;
  for (const row of model.tokens.colours ?? []) if (row[0] === value) return { value: row[1] };
  for (const row of model.tokens.numbers ?? []) if (row[0] === value) return { value: row[1] };
  for (const row of model.tokens.typography ?? []) {
    if (row[0] === value) {
      return { typography: declarationsForReadings(typographyEntries(row, model)) };
    }
  }
  return null;
}

/** One property -> one or more CSS lines, with the token named in a comment. */
function declarationsFor(property, model) {
  const token = tokenLookup(model, property.value);

  if (property.key === 'font' || property.key === 'typography' || (token && token.typography)) {
    if (token && token.typography) {
      // One declaration per recorded reading, in the contract table's row
      // order — `declarationsForReadings` (`lib/typography.js`) already
      // merged `underline` + `strikethrough` into one `text-decoration-line`
      // line here, so this is a plain map rather than a second merge pass.
      return token.typography
        .filter((declaration) => declaration.value)
        .map((declaration) => `  ${declaration.property}: ${declaration.value}; /* ${property.value} */`);
    }
    return [`  /* typography: ${property.value} — see the token table */`];
  }

  const name = CSS_PROPERTY[property.key] ?? property.key;
  const value = token ? token.value : property.value;
  const comment = token ? ` /* ${property.value} */` : '';
  return [`  ${name}: ${value};${comment}`];
}

function ruleFor(selector, properties, model, extraLines = []) {
  const lines = properties.flatMap((property) => declarationsFor(property, model));
  if (lines.length === 0 && extraLines.length === 0) return [];
  return [`${selector} {`, ...lines, ...extraLines, '}', ''];
}

/** The CSS half of the code view. */
export function renderCss(draft, { model = null } = {}) {
  const className = `.${classNameFor(draft.name)}`;
  const todo = draft.skipped
    .filter((slot) => !slot.startsWith('state:'))
    .map((slot) => `  /* TODO: fill contract slot \`${slot}\` */`);

  const out = [`/* ${draft.name} */`, ...ruleFor(className, draft.properties, model, todo)];

  for (const state of draft.states) {
    const selector = STATE_SELECTOR[state.name] ?? `.is-${state.name}`;
    // A state answered in words stays words: Phyllum will not invent the CSS
    // that "10% darker" would turn into.
    const note = state.note ? [`  /* ${state.note} */`] : [];
    out.push(...ruleFor(`${className}${selector}`, state.properties, model, note));
  }
  for (const skipped of draft.skipped.filter((slot) => slot.startsWith('state:'))) {
    const state = skipped.slice('state:'.length);
    const selector = STATE_SELECTOR[state] ?? `.is-${state}`;
    out.push(`${className}${selector} {`, `  /* TODO: fill contract slot \`${state}\` */`, '}', '');
  }

  return out.join('\n').replace(/\n+$/, '');
}

/** The React half of the code view. */
export function renderJsx(draft) {
  const component = componentNameFor(draft.name);
  const className = classNameFor(draft.name);
  const element = elementFor(draft.archetype);
  return [
    '/**',
    ` * ${draft.name} — generated by Phyllum from DESIGN-SYSTEM.md.`,
    ' *',
    ' * Usage:',
    ' *',
    ' * ```jsx',
    ` * <${component}>Save</${component}>`,
    ' * ```',
    ' */',
    `export function ${component}({ children, className = '', ...rest }) {`,
    '  return (',
    `    <${element} className={\`${className} \${className}\`.trim()} {...rest}>`,
    '      {children}',
    `    </${element}>`,
    '  );',
    '}',
  ].join('\n');
}

/**
 * The blocks that follow the spec block in a component entry. Both are fenced
 * by the one renderer, which widens the fence when a block nests one of its
 * own — the four-backtick rule (plan §7.1.1).
 */
export function renderCodeBlocks(draft, { model = null, framework = 'React' } = {}) {
  void framework; // v1 emits React + CSS regardless; see plan §9.
  return [
    { lang: 'jsx', content: renderJsx(draft) },
    { lang: 'css', content: renderCss(draft, { model }) },
  ];
}
