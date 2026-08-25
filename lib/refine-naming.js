/**
 * `refine naming` — is the name one Phyllum could have proposed? (v0.11.0 §2).
 *
 * The gate's third section. It reads `DESIGN-SYSTEM.md` and nothing else: a
 * token's name against the scale of the table it sits in, a component's name
 * against the archetype its own spec records.
 *
 * Every scale here is read from the shipped tables rather than restated —
 * `refs/nomenclature.md` for the library names and the ramp steps,
 * `refs/tokenise/naming.md` for the colour scale, the ladders and the type
 * bands. That is what makes the check meaningful rather than circular: it asks
 * whether a name is one the *naming* code would have produced, so a table
 * edited in one place moves the checker with it.
 *
 * The standing rule from the library applies in full and is the reason for the
 * severities below: **a name is a proposal.** An off-scale name is reported, not
 * failed and never renamed — naming is not one of the six ship criteria, so a
 * name cannot block a ship on its own. What the section buys is that the drift
 * is visible: a system half on the scale and half off it has stopped having a
 * scale, and nobody notices that from the inside.
 *
 * The one `error` is the exception that proves the rule. An archetype the
 * contract table does not know is not a naming opinion — it is a spec no reader
 * can read, and a component whose contract cannot be read cannot be graded
 * against it.
 */

import { contractFor, isCustomArchetype } from './archetypes.js';
import { wordsIn } from './candidates.js';
import { neutralBase } from './primitives.js';
import { isWellFormed, rampSteps } from './nomenclature.js';
import { readComponent } from './prd.js';
import { colourNames, gradientMark, gradientNames, ladders, typeBands, typeRoles } from './tokenise-spec.js';
import { ERROR, namingRules, refineSeverityFor } from './refine-spec.js';

/** The token sections this section grades, and the label each one wears. */
export const TOKEN_SECTIONS = ['colours', 'primitives', 'numbers', 'typography'];

/** A finding, in the vocabulary every other finding in Phyllum already uses. */
function finding(rule, value, detail, evidence = []) {
  return { rule, severity: refineSeverityFor(rule), value, detail, evidence };
}

// ---------------------------------------------------------------------------
// The scales, as predicates
// ---------------------------------------------------------------------------

/** `color-{n}` and `gradient-{n}` are patterns; every other row is a literal. */
function matchesScaleName(name, row) {
  if (!row.includes('{n}')) return name === row;
  const pattern = new RegExp(`^${row.split('{n}').map(escape).join('(\\d+)')}$`);
  return pattern.test(name);
}

const escape = (part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every literal name on the colour and gradient scales, patterns included. */
const colourScaleRows = () => [
  ...colourNames().map((row) => row.name),
  ...gradientNames().map((row) => row.name),
];

/** Is this a name the colours table could have been given? */
export function onColourScale(name) {
  if (isWellFormed(name)) return true;
  return colourScaleRows().some((row) => matchesScaleName(name, row));
}

/** Is this a rung of one of the ladders? */
export function onNumberScale(name) {
  return Object.values(ladders()).some((ladder) => ladder.rungs.includes(name));
}

/** Is this a type role with its band's suffix — `body`, `highlight-small`? */
export function onTypographyScale(name) {
  for (const role of typeRoles()) {
    for (const band of typeBands()) {
      if (name === `${role.role}${band.suffix}`) return true;
    }
  }
  return false;
}

/**
 * Is this a ramp step — a colour name with one of the nine steps glued on?
 *
 * `stepName` welds the number to the base with no separator, so the step is
 * stripped from the right and what is left has to be a name the Colours table
 * could have carried. The neutral ramp's own base is allowed as itself, because
 * `neutral-` is the shipped base rather than a semantic token.
 */
export function onPrimitiveScale(name) {
  const match = String(name).match(/^(.*?)(\d+)$/);
  if (!match) return false;
  if (!rampSteps().includes(Number(match[2]))) return false;
  const base = match[1];
  return base === neutralBase() || onColourScale(base);
}

/**
 * The two spellings Phyllum's own naming adds on top of any scale name.
 *
 * The collision suffix (`color-primary-2`) is what a taken name gets, and the
 * gradient mark is the word every gradient name carries as its final part. A
 * checker that did not know about either would report Phyllum's own output as
 * off the scale.
 */
export function baseNames(name) {
  const out = new Set([name]);
  const mark = `-${gradientMark()}`;
  for (const spelling of [...out]) {
    if (spelling.endsWith(mark)) out.add(spelling.slice(0, -mark.length));
  }
  for (const spelling of [...out]) {
    const collision = spelling.match(/^(.*)-(\d+)$/);
    if (collision) out.add(collision[1]);
  }
  return [...out];
}

/** Which section's scale, if any, this name belongs to. */
export function scaleOf(name) {
  const tests = [
    ['numbers', onNumberScale],
    ['typography', onTypographyScale],
    ['primitives', onPrimitiveScale],
    ['colours', onColourScale],
  ];
  for (const spelling of baseNames(name)) {
    for (const [section, test] of tests) {
      if (test(spelling)) return section;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** The scale a section is measured by, in the words a finding uses. */
const SCALE_LABEL = {
  colours: 'the colour scale or the nomenclature library',
  primitives: 'a ramp step on a colour-scale base',
  numbers: 'one of the ladders',
  typography: 'a type role with its band suffix',
};

/**
 * Every recorded token, checked against the scale of its own table.
 *
 * A name on some *other* section's scale is its own rule rather than a plain
 * miss: `space-md` recorded as a colour is not an unrecognised name, it is a
 * recognised one in the wrong table, and the two have different repairs.
 */
export function tokenNames(model) {
  const rows = [];
  for (const section of TOKEN_SECTIONS) {
    for (const row of model?.tokens?.[section] ?? []) {
      const name = String(row?.[0] ?? '').trim();
      if (name === '') continue;
      const scale = scaleOf(name);
      const findings = [];
      if (scale === null) {
        findings.push(
          finding(
            'token-off-scale',
            name,
            `no scale could have produced this name — ${section} names come from ${SCALE_LABEL[section]}`,
            [`${section}: ${name}`],
          ),
        );
      } else if (scale !== section && !(section === 'colours' && scale === 'primitives')) {
        findings.push(
          finding(
            'token-off-section',
            name,
            `this is a ${scale} name recorded under ${section} — ${section} names come from ${SCALE_LABEL[section]}`,
            [`${section}: ${name}`],
          ),
        );
      }
      rows.push({
        kind: 'token',
        name,
        section,
        scale,
        pass: findings.every((item) => item.severity !== ERROR),
        clean: findings.length === 0,
        findings,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** `Button/Primary` → the words of its base: `button`. `IconButton` → two words. */
export function baseWords(name) {
  const base = String(name).split('/')[0];
  return new Set(wordsIn(base));
}

/** Does the name say what the archetype says it is — by key, or by any alias? */
export function saysArchetype(name, contract) {
  const words = baseWords(name);
  return [contract.key, ...contract.aliases].some((word) => words.has(word));
}

/** `Base` or `Base/Variant`, each part starting with a capital. */
export function wellShaped(name) {
  return /^[A-Z][A-Za-z0-9]*(\/[A-Z][A-Za-z0-9]*)?$/.test(String(name));
}

/**
 * Every recorded component, checked against the archetype its spec records.
 *
 * Three subjects are left alone and each says why rather than passing quietly:
 * a `custom` claims no contract, a component with no archetype at all is the
 * contract section's finding rather than this one's, and the variant word after
 * the `/` is the user's vocabulary rather than the archetype's.
 */
export function componentNames(model) {
  return (model?.components ?? []).map((component) => {
    const recorded = readComponent(component);
    const findings = [];
    let checked = true;
    let reason = null;

    if (!wellShaped(recorded.name)) {
      findings.push(
        finding(
          'component-name-shape',
          recorded.name,
          'a component name is `Base` or `Base/Variant`, each part starting with a capital',
          [recorded.name],
        ),
      );
    }

    if (recorded.archetype === null) {
      checked = false;
      reason = 'no archetype is recorded, which the contract section reports rather than this one';
    } else if (recorded.custom || isCustomArchetype(recorded.archetype)) {
      checked = false;
      reason = 'a custom follows no archetype contract, so its name has no contract to agree with';
    } else {
      const contract = contractFor(recorded.archetype);
      if (!contract) {
        findings.push(
          finding(
            'component-unknown-archetype',
            recorded.name,
            `the spec records \`${recorded.archetype}\`, which the archetype table does not know`,
            [`archetype: ${recorded.archetype}`],
          ),
        );
      } else if (!saysArchetype(recorded.name, contract)) {
        findings.push(
          finding(
            'component-name-mismatch',
            recorded.name,
            `the spec records the \`${contract.key}\` archetype and the name says nothing about it`,
            [`archetype: ${contract.key}`, `name: ${recorded.name}`],
          ),
        );
      }
    }

    return {
      kind: 'component',
      name: recorded.name,
      archetype: recorded.archetype,
      checked,
      reason,
      pass: findings.every((item) => item.severity !== ERROR),
      clean: findings.length === 0,
      findings,
    };
  });
}

/**
 * The naming section: every token name and every component name, each with its
 * verdict and — when it failed — the rule it broke.
 *
 * No replacement name is proposed and nothing is renamed. A proposal is
 * `tokenise`'s to make and a rename is `update`'s to carry out, each behind its
 * own acceptance gate.
 */
export function refineNaming(model) {
  const tokens = tokenNames(model);
  const components = componentNames(model);
  const names = [...tokens, ...components];
  return {
    ran: true,
    reason: null,
    tokens,
    components,
    names,
    findings: names.flatMap((row) => row.findings),
    pass: names.every((row) => row.pass),
    clean: names.every((row) => row.clean),
  };
}

/** The rules this section may report, straight from the table. */
export const rules = () => namingRules().map((row) => row.rule);
