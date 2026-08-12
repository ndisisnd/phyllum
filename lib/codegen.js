/**
 * The code view (plan §3.3).
 *
 * v1 emits React + CSS. Framework detection picks the *label* on the block and
 * nothing more: Vue and Svelte emitters are explicitly out of scope for v1
 * (plan §9), and detection failure falls back to the same React + CSS output.
 *
 * The code view is a view. It is rendered into `DESIGN-SYSTEM.md` for the user
 * to copy; Phyllum never writes component code into the codebase.
 */

/** The HTML element an archetype renders as. */
const ELEMENTS = { button: 'button', input: 'input', badge: 'span' };

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

/** Look a token name up in the model; null when it is a raw value. */
function tokenLookup(model, value) {
  if (!model) return null;
  for (const row of model.tokens.colours ?? []) if (row[0] === value) return { value: row[1] };
  for (const row of model.tokens.numbers ?? []) if (row[0] === value) return { value: row[1] };
  for (const row of model.tokens.typography ?? []) {
    if (row[0] === value) {
      return {
        typography: { 'font-size': row[1], 'font-weight': row[2], 'line-height': row[3] },
      };
    }
  }
  return null;
}

/** One property -> one or more CSS lines, with the token named in a comment. */
function declarationsFor(property, model) {
  const token = tokenLookup(model, property.value);

  if (property.key === 'font' || property.key === 'typography' || (token && token.typography)) {
    if (token && token.typography) {
      return Object.entries(token.typography)
        .filter(([, value]) => value)
        .map(([name, value]) => `  ${name}: ${value}; /* ${property.value} */`);
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
