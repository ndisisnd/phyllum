/**
 * The mechanical layer of `apply run` (v0.2.0 plan §6.5.2).
 *
 * Some acceptance criteria do not need a model, and paying a model to do them
 * would be both slower and less trustworthy. A criterion that says *in this file,
 * this exact literal, on these exact properties, becomes this token* is a
 * deterministic edit: find the declarations, swap the value, done. Node does it,
 * the same way every time, and the diff is reviewable line by line.
 *
 * So the split is drawn narrowly and stated out loud, because "Phyllum edited
 * this by hand" and "an agent wrote this" are different promises:
 *
 *   **Mechanical** — the literal is *exactly* the token's recorded value; the
 *   file is a stylesheet; the criterion names the properties it applies to; and
 *   the token is a colour or a number. Everything about the edit is decided by
 *   the plan, so nothing is left to judgement.
 *
 *   **Agent** — anything else, with the reason recorded per criterion:
 *   component adoption (markup has to be written, and `create`'s recorded
 *   contract is what it has to satisfy); a *near-identical* literal (the rendered
 *   value changes, which is a judgement the plan flags with a `note`); typography
 *   (one token carries size, weight and line-height at once — and since v0.7.3
 *   up to eighteen further readings beside them — so which declarations it
 *   replaces is not a single substitution, whether the criterion is about the
 *   size or about the kerning); and any file that is not a stylesheet, where the
 *   literal may be inside markup, a script, or a template.
 *
 * This module is pure: text in, text out. It never touches the filesystem — the
 * source-write funnel in `lib/write.js` does that, under a phase's grant.
 */

import path from 'node:path';

/** File kinds a single-property substitution is safe in. */
export const STYLESHEET_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.pcss', '.postcss'];

/** The comment that marks a token block Phyllum wrote, so a re-run finds it. */
export const TOKEN_BLOCK_COMMENT = '/* phyllum: tokens from DESIGN-SYSTEM.md */';

const unbacktick = (value) => String(value ?? '').replace(/^`|`$/g, '').trim();

export const isStylesheet = (file) => STYLESHEET_EXTENSIONS.includes(path.extname(String(file)).toLowerCase());

/** `token \`color-primary\`` / `component \`Button/Primary\`` → its two halves. */
export function readBecomes(becomes) {
  const match = String(becomes ?? '').match(/^(token|component)\s+`([^`]+)`$/);
  if (!match) return null;
  return { kind: match[1], name: match[2] };
}

/**
 * The properties a criterion applies to, read back out of its `check` sentence.
 *
 * The properties are not a field of their own in the criterion grammar — they are
 * named inside `check`, which is the sentence a human verifies against. Reading
 * them from there rather than re-deriving them from a fresh scan is deliberate:
 * the plan the user approved is the instruction, even if the codebase has moved.
 */
export function propertiesFrom(check) {
  const text = String(check ?? '');
  const match = text.match(/^in\s+`[^`]+`,\s+every\s+(.+?)\s+value of\s+`/);
  if (!match) return [];
  if (match[1].trim() === 'affected') return [];
  return [...match[1].matchAll(/`([^`]+)`/g)].map((hit) => hit[1]);
}

/** A token's recorded value, and which table it came from. */
export function tokenRecord(model, name) {
  for (const section of ['colours', 'numbers', 'typography']) {
    const row = (model?.tokens?.[section] ?? []).find((item) => item[0] === name);
    if (row) return { name, value: row[1], section };
  }
  return null;
}

/** The CSS custom property a token becomes in code. */
export const customProperty = (name) => `--${name}`;
export const tokenReference = (name) => `var(${customProperty(name)})`;

/**
 * Decide who does this criterion, and say why.
 *
 * Returns `{ route: 'mechanical' | 'agent', reason, plan }`. `plan` is present
 * for the mechanical route and carries everything the edit needs, so the caller
 * never re-parses the criterion.
 */
export function classifyCriterion(criterion, model) {
  const fields = criterion.fields ?? {};
  const file = unbacktick(fields.file);
  const becomes = readBecomes(fields.becomes);

  if (!becomes) {
    return { route: 'agent', reason: 'its `becomes` field is not a token or a component, so nothing can be derived from it mechanically' };
  }
  if (becomes.kind === 'component') {
    return {
      route: 'agent',
      reason: `adopting ${becomes.name} changes markup as well as styling, and the recorded component contract is what the new markup has to satisfy — that is generation, not substitution`,
    };
  }
  if (fields.note) {
    return {
      route: 'agent',
      reason: 'the literal is only near-identical to the token, so this replacement changes the rendered value — a judgement the plan flagged and a mechanical pass must not make',
    };
  }
  if (!isStylesheet(file)) {
    return {
      route: 'agent',
      reason: `${file || 'the file'} is not a stylesheet, so the literal may sit in markup, a script or a template rather than in a declaration`,
    };
  }

  const record = tokenRecord(model, becomes.name);
  if (!record) {
    return {
      route: 'agent',
      reason: `no token named ${becomes.name} is recorded in DESIGN-SYSTEM.md any more, so its value is unknown here`,
    };
  }
  if (record.section === 'typography') {
    return {
      route: 'agent',
      reason: `${becomes.name} is a typography token, which carries size, weight and line-height at once — and, since v0.7.3, up to eighteen more readings beside them — so which declarations it replaces is not one substitution`,
    };
  }

  const literal = unbacktick(fields.literal);
  if (literal === '') {
    return { route: 'agent', reason: 'the criterion names no literal to replace' };
  }
  if (normalise(literal) !== normalise(record.value)) {
    return {
      route: 'agent',
      reason: `the literal ${literal} is not the value ${becomes.name} records (${record.value}), so replacing it changes what the page renders`,
    };
  }

  const properties = propertiesFrom(fields.check);
  if (properties.length === 0) {
    return {
      route: 'agent',
      reason: 'the criterion does not name the properties the literal sits on, and a mechanical pass will not guess which declarations to touch',
    };
  }

  return {
    route: 'mechanical',
    reason: `an exact literal on named properties in a stylesheet — ${literal} becomes ${tokenReference(becomes.name)}`,
    plan: { file, literal, properties, token: record, reference: tokenReference(becomes.name) },
  };
}

const normalise = (value) => String(value).trim().toLowerCase();

/** Escape a literal for use inside a regular expression. */
const escape = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every declaration of `property` in a stylesheet, as `{ start, end, value }`.
 *
 * A hand-rolled scan rather than a CSS parser, and bounded accordingly: it looks
 * for `property:` at a declaration boundary and takes the value up to the next
 * `;` or `}`. That is enough for the substitution this layer allows and small
 * enough to reason about; anything it cannot see is the agent route's problem.
 */
export function declarationsOf(source, property) {
  const text = String(source);
  const pattern = new RegExp(`(^|[;{}\\s])(${escape(property)})\\s*:\\s*`, 'gi');
  const out = [];
  for (const match of text.matchAll(pattern)) {
    const start = match.index + match[0].length;
    let end = start;
    while (end < text.length && text[end] !== ';' && text[end] !== '}') end += 1;
    out.push({ start, end, value: text.slice(start, end) });
  }
  return out;
}

/**
 * Replace `literal` with `reference` in every declaration of the named
 * properties. Returns `{ text, replaced }`; `replaced` counts occurrences, so a
 * criterion that changed nothing can be reported as such rather than assumed done.
 */
export function replaceOnProperties(source, { literal, properties, reference }) {
  let text = String(source);
  let replaced = 0;
  const literalPattern = new RegExp(`(^|[^\\w-])${escape(literal)}(?![\\w-])`, 'gi');

  for (const property of properties) {
    // Rebuilt each pass: the offsets move as soon as one value is rewritten.
    for (;;) {
      const declarations = declarationsOf(text, property);
      let changed = false;
      for (const declaration of declarations) {
        if (!new RegExp(`(^|[^\\w-])${escape(literal)}(?![\\w-])`, 'i').test(declaration.value)) continue;
        let hits = 0;
        const rewritten = declaration.value.replace(literalPattern, (whole, before) => {
          hits += 1;
          return `${before}${reference}`;
        });
        if (hits === 0) continue;
        text = text.slice(0, declaration.start) + rewritten + text.slice(declaration.end);
        replaced += hits;
        changed = true;
        break;
      }
      if (!changed) break;
    }
  }
  return { text, replaced };
}

/** Is any raw `literal` still sitting on one of those properties? */
export function rawLiteralRemains(source, { literal, properties }) {
  const pattern = new RegExp(`(^|[^\\w-])${escape(literal)}(?![\\w-])`, 'i');
  for (const property of properties) {
    for (const declaration of declarationsOf(source, property)) {
      if (pattern.test(declaration.value)) return true;
    }
  }
  return false;
}

/**
 * Make sure the custom properties the edits now reference are actually declared.
 *
 * A stylesheet that reads `var(--color-primary)` without declaring it renders
 * nothing, so the mechanical pass would otherwise "succeed" by breaking the page.
 * The declaration goes into an existing `:root` rule when there is one, and into
 * a marked block at the top of the file when there is not — always in the same
 * file the edit was made in, because the phase's criteria name that file and
 * nothing else is writable.
 */
export function ensureCustomProperties(source, tokens) {
  let text = String(source);
  const missing = tokens.filter((token) => !new RegExp(`${escape(customProperty(token.name))}\\s*:`).test(text));
  if (missing.length === 0) return { text, declared: [] };

  const declarations = missing.map((token) => `  ${customProperty(token.name)}: ${token.value};`);
  const root = text.match(/(^|[\s}])(:root\s*\{)/);

  if (root) {
    const at = root.index + root[0].length;
    text = `${text.slice(0, at)}\n${declarations.join('\n')}${text.slice(at)}`;
  } else {
    const block = [TOKEN_BLOCK_COMMENT, ':root {', ...declarations, '}', ''].join('\n');
    text = `${block}\n${text}`;
  }
  return { text, declared: missing.map((token) => token.name) };
}

/**
 * Apply every mechanical criterion that touches one file, in one pass.
 *
 * One pass per file rather than per criterion, because the criteria for a file
 * overlap (`12px` on `border-radius` and `12px` on `padding` are two criteria and
 * one file), and because the custom-property block should be written once.
 *
 * Returns `{ text, results, declared }` where each result says whether its
 * criterion is satisfied, and if not, why not — nothing is reported as done on
 * the strength of having attempted it.
 */
export function applyFile(source, criteria) {
  let text = String(source);
  const results = [];
  const tokens = [];

  for (const entry of criteria) {
    const { id, plan } = entry;
    const outcome = replaceOnProperties(text, plan);
    text = outcome.text;
    tokens.push(plan.token);
    const remains = rawLiteralRemains(text, plan);
    const references = text.includes(plan.reference);
    results.push({
      id,
      replaced: outcome.replaced,
      satisfied: !remains && references,
      why: remains
        ? `a raw ${plan.literal} is still on ${plan.properties.join(', ')} in ${plan.file}`
        : references
          ? null
          : `${plan.reference} does not appear in ${plan.file}, so nothing reads the token`,
    });
  }

  const ensured = ensureCustomProperties(text, tokens);
  return { text: ensured.text, results, declared: ensured.declared };
}
