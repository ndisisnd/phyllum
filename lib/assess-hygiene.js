/**
 * Hygiene — what collides, and what nothing uses (v0.2.1 plan §6).
 *
 * Every other check `assess` runs reads one value at a time: here is a colour,
 * here is how often it is written, here is the token it should be. Two questions
 * cannot be asked that way, because they are about the project rather than about
 * any value in it.
 *
 *   1. **What is fighting what.** A repository with React and Vue files, or with
 *      Tailwind and styled-components and a folder of hand-written stylesheets,
 *      or with three theme files each declaring values, cannot have one source of
 *      truth. `detectProject` has always seen this and always thrown it away —
 *      it collapses its evidence into one winner because `create` only ever
 *      needed a label. v0.2.1 keeps the evidence, and this module reads it.
 *   2. **What is here that nothing needs.** Coverage runs codebase → system:
 *      which raw values does the design system already name? Run the same scan
 *      backwards and it answers the opposite question — which tokens and
 *      components does the codebase never mention?
 *
 * Both are `warn`, and the severity is a column in `refs/assess.md` rather than a
 * constant here. That is not timidity, it is the honest reading: unlike a raw
 * colour, none of these findings has an answer Phyllum could apply. Two
 * frameworks may be a migration halfway done; an unused token may be the one the
 * next screen is built on. So the finding carries its evidence and stops there.
 *
 * The caveat on "unused" is part of the finding rather than a footnote, because
 * the failure mode is somebody deleting a token on Phyllum's say-so. The scan is
 * **bounded** (`SCAN_LIMITS`) and **text-based**, so "not seen" means "not seen
 * in what was read" and never "provably dead". A token used past the file cap,
 * behind a computed class name, or in a language the markup pass does not read is
 * unseen, not unused. Nothing here removes anything, at any severity, in any
 * mode.
 *
 * The judging lives here and the seeing lives upstream, exactly as it does for
 * severity: `lib/detect.js` reports what frameworks it found, and this module
 * decides that finding two of them is worth saying out loud.
 */

import { isRegistered, namesForComponent, scanMarkup } from './candidates.js';
import { TOKEN_SECTIONS } from './design-system.js';
import { hygieneSeverityFor } from './tokenise-spec.js';
import { normaliseValue, toPx } from './tokenise.js';

/** The sentence every unused finding is read under, and never without. */
export const UNUSED_CAVEAT =
  'the scan is bounded and text-based, so "not seen" means "not seen in what was read" — never "provably dead"';

/** A finding, in the vocabulary the value findings already use. */
function finding(rule, value, detail, evidence = []) {
  return { rule, severity: hygieneSeverityFor(rule), value, detail, evidence };
}

/**
 * The collisions in the detection evidence — co-existence, reported as findings.
 *
 * Reading the evidence rather than re-deriving it is the point: there is one
 * detector, and a second opinion about what framework this is would be a second
 * answer to a question that already has one.
 */
export function collisionFindings(detection = {}) {
  const out = [];

  const frameworks = detection.frameworks ?? [];
  if (frameworks.length > 1) {
    out.push(
      finding(
        'framework-collision',
        frameworks.map((item) => item.name).join(' + '),
        'more than one UI framework is live here, so the same button has more than one definition',
        frameworks.map((item) => `${item.name} (${item.evidence})`),
      ),
    );
  }

  for (const duplicate of detection.duplicateMajors ?? []) {
    out.push(
      finding(
        'framework-collision',
        `${duplicate.package} ${duplicate.majors.join(' and ')}`,
        'two majors of one framework in the dependency tree — a component written against one may not run on the other',
        duplicate.where.map((field) => `${field}: ${duplicate.package}`),
      ),
    );
  }

  const stylings = detection.stylings ?? [];
  if (stylings.length > 1) {
    out.push(
      finding(
        'styling-collision',
        stylings.map((item) => item.name).join(' + '),
        'more than one styling system is live at once, so a token has more than one place to reach',
        stylings.map((item) => `${item.name} (${item.evidence})`),
      ),
    );
  }

  const themeSources = detection.themeSources ?? [];
  if (themeSources.length > 1) {
    out.push(
      finding(
        'theme-source-collision',
        themeSources.join(' + '),
        'more than one theme file declares values, so none of them is the source of truth',
        themeSources,
      ),
    );
  }

  return out;
}

/**
 * Every value the scan saw, in the two shapes a token can be recognised by.
 *
 * Both buckets count. A value in the fourth bucket — seen but not read — is
 * still a value the codebase writes, and a token that matches one is being used
 * whether or not Phyllum could work out what it applies to.
 */
function valuesSeen(values = {}) {
  const literal = new Set();
  const pixels = new Set();
  const rows = [...(values.inventory ?? []), ...(values.unreadable ?? [])];
  for (const row of rows) {
    for (const member of row.members ?? [{ value: row.value }]) {
      const raw = member.value ?? row.value;
      literal.add(normaliseValue(raw));
      const px = toPx(raw);
      if (px !== null) pixels.add(px);
    }
  }
  return { literal, pixels };
}

/** Every property name the scan wrote down, lowercased once for matching. */
function propertiesSeen(values = {}) {
  const out = new Set();
  for (const row of [...(values.inventory ?? []), ...(values.unreadable ?? [])]) {
    for (const property of row.properties ?? []) out.add(String(property).toLowerCase());
  }
  return out;
}

/** `color-primary` -> the spellings a codebase writes a token name in. */
export function tokenSpellings(name) {
  const raw = String(name ?? '').trim().toLowerCase();
  if (!raw) return [];
  const bare = raw.replace(/^--/, '');
  const camel = bare.replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase());
  return [...new Set([bare, `--${bare}`, camel])];
}

/**
 * Was this name written anywhere the scan looked?
 *
 * Matched on a whole word rather than a substring, so `space-4` is not counted
 * as used because somebody wrote `space-40`.
 */
function nameSeen(name, properties) {
  for (const spelling of tokenSpellings(name)) {
    const pattern = new RegExp(`(^|[^a-z0-9])${spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
    for (const property of properties) {
      if (pattern.test(property)) return true;
    }
  }
  return false;
}

/**
 * The tokens the codebase never mentions — the coverage split, run backwards.
 *
 * Three ways a token counts as used, and a token has to fail all three: it is
 * the token a covered value is covered *by*, its value was written somewhere,
 * or its name was written somewhere as a property or CSS variable. The first is
 * the coverage machinery itself, which is why an accepted token stops being
 * reported as unused the moment the value it names appears.
 */
export function unusedTokens(model, values = {}) {
  const covering = new Set(
    (values.covered ?? [])
      .map((row) => row.token)
      .filter(Boolean)
      .map((token) => String(token).toLowerCase()),
  );
  const seen = valuesSeen(values);
  const properties = propertiesSeen(values);

  const rows = [];
  for (const section of TOKEN_SECTIONS) {
    for (const cells of model?.tokens?.[section.key] ?? []) {
      const [name, value] = cells;
      if (!name) continue;
      if (covering.has(String(name).toLowerCase())) continue;
      if (seen.literal.has(normaliseValue(value))) continue;
      const px = toPx(value);
      if (px !== null && seen.pixels.has(px)) continue;
      if (nameSeen(name, properties)) continue;
      rows.push({
        ...finding(
          'unused-token',
          name,
          `nothing the scan read uses ${value || 'this token'} or names it — ${UNUSED_CAVEAT}`,
          [`${section.key}: ${[name, ...cells.slice(1)].filter(Boolean).join(' · ')}`],
        ),
        section: section.key,
        token: name,
        tokenValue: value ?? null,
      });
    }
  }
  return rows;
}

/**
 * The registered components no markup mentions.
 *
 * This runs only where the component pass ran. On a stack Phyllum does not read
 * markup for, every component would come back unused, and that is a statement
 * about the reader rather than about the project — so the answer is that the
 * question was not asked, said plainly.
 *
 * The markup is read a second time here rather than reusing the candidate scan:
 * `scanCandidates` returns the patterns the system does *not* have, capped at a
 * handful, which is the exact complement of what this question needs.
 */
export function unusedComponents(root, model, components = {}, options = {}) {
  if (!components.ran) {
    return { checked: false, reason: components.reason ?? null, rows: [] };
  }
  const signatures = scanMarkup(root, options);
  const rows = [];
  for (const component of model?.components ?? []) {
    const spellings = namesForComponent(component.name);
    if (signatures.some((signature) => isRegistered(signature, spellings))) continue;
    rows.push({
      ...finding(
        'unused-component',
        component.name,
        `no element, tag or class name in the markup scan matched it — ${UNUSED_CAVEAT}`,
        [...spellings],
      ),
      component: component.name,
      spellings: [...spellings],
    });
  }
  return { checked: true, reason: null, rows };
}

/**
 * The hygiene half of an assessment: collisions, unused tokens, unused
 * components, and one flat list of the findings so a report can count them the
 * way it counts every other finding.
 */
export function assessHygiene(root, model, detection, values, components, options = {}) {
  const collisions = collisionFindings(detection);
  const tokens = unusedTokens(model, values);
  const unusedComponentResult = unusedComponents(root, model, components, options);

  return {
    caveat: UNUSED_CAVEAT,
    collisions,
    unused: {
      tokens,
      components: unusedComponentResult.rows,
      componentsChecked: unusedComponentResult.checked,
      componentsReason: unusedComponentResult.reason,
    },
    findings: [...collisions, ...tokens, ...unusedComponentResult.rows],
  };
}
