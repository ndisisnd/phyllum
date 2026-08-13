/**
 * `create` — pick mode, the codebase half (plan §3.1 Mode C, §8.5).
 *
 * Bare `create` offers two kinds of thing to build: the archetypes in the
 * contract, and the components the codebase already has but the design system
 * has never been told about. This module finds the second kind.
 *
 * It is a read-only scan of markup — JSX and HTML elements, their class lists,
 * and custom component names — counted into signatures. A signature repeated
 * often enough, matching one of the signals in `skill/refs/create.md`, and not
 * already registered in `DESIGN-SYSTEM.md`, is a candidate.
 *
 * The invariant that matters here: **a candidate seeds a name and an archetype,
 * never values.** Whatever CSS sits around the pattern is codebase evidence for
 * the follow-up loop to offer, not a fact about the component. The user decides.
 */

import fs from 'node:fs';
import path from 'node:path';

import { archetypes as archetypeList, candidateSignals, contractFor } from './archetypes.js';
import { classNameFor, componentNameFor } from './codegen.js';
import { VARIANTS, newDraft } from './create.js';
import { MAX_SOURCE_BYTES, readTextFile } from './scan-text.js';
import { sources } from './tokenise-spec.js';

/**
 * One opening tag: its name, and everything written inside the angle brackets.
 *
 * Exported since v0.2.1, because the prop pass (§5.2) reads the *attributes*
 * this scan throws away after it has taken the class list out of them. Sharing
 * the regex rather than writing a second one is what keeps "what is an opening
 * tag" a single answer — two readers disagreeing about where a tag ends is the
 * kind of drift a tool about drift should not have.
 */
export const OPENING_TAG = /<([A-Za-z][A-Za-z0-9._-]*)((?:"[^"]*"|'[^']*'|\{[^{}]*\}|[^<>])*)>/g;
const CLASS_ATTRIBUTE = /\b(?:className|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*[`'"]([^`'"]*)[`'"]\s*\})/;

/** `btn--primary` -> ['btn', 'primary']; `PrimaryButton` -> ['primary', 'button']. */
export function wordsIn(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const isComponentName = (element) => /^[A-Z]/.test(element);

/** The markup files worth reading — the stylesheets are `tokenise`'s business. */
function markupExtensions() {
  const { extensions, stylesheets } = sources();
  const styles = new Set(stylesheets);
  return new Set(extensions.filter((extension) => !styles.has(extension)));
}

/**
 * Every element/class signature in the project, with counts (read-only).
 */
export function scanMarkup(root, { maxFiles = 400, maxDepth = 8 } = {}) {
  const extensions = markupExtensions();
  const skip = new Set(sources().skipped);
  const found = new Map();
  let budget = maxFiles;

  const record = (element, classes, file) => {
    const signature = [element, ...classes].join('.');
    const entry = found.get(signature) ?? { signature, element, classes, count: 0, files: [] };
    entry.count += 1;
    if (!entry.files.includes(file)) entry.files.push(file);
    found.set(signature, entry);
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
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!extensions.has(path.extname(entry.name).toLowerCase())) continue;
      if (budget-- <= 0) return;

      // The same reader the values pass uses (v0.2.0 M8). A bare `readFileSync`
      // here had two holes the values pass does not: no size cap, so one generated
      // `.jsx` bounded the scan's memory by the repository rather than by Phyllum;
      // and no binary sniff, so a file with NUL bytes was scanned as mojibake and
      // its garbage read as element names instead of being skipped.
      const text = readTextFile(full, { maxBytes: MAX_SOURCE_BYTES });
      if (text === null) continue;
      const rel = path.relative(root, full).split(path.sep).join('/');
      OPENING_TAG.lastIndex = 0;
      let match = OPENING_TAG.exec(text);
      while (match !== null) {
        const element = isComponentName(match[1]) ? match[1] : match[1].toLowerCase();
        const attributes = match[2] ?? '';
        const classes = (attributes.match(CLASS_ATTRIBUTE) ?? [])
          .slice(1)
          .find((group) => typeof group === 'string');
        record(
          element,
          (classes ?? '').split(/\s+/).filter(Boolean).sort(),
          rel,
        );
        match = OPENING_TAG.exec(text);
      }
    }
  };

  walk(path.resolve(root), 0);
  return [...found.values()].sort(
    (a, b) => b.count - a.count || a.signature.localeCompare(b.signature),
  );
}

/**
 * Which archetype does this signature look like, by the signals table? Returns
 * the matching row and the word that matched, or null when nothing does.
 */
export function archetypeForSignature({ element, classes }) {
  for (const row of candidateSignals()) {
    if (row.signal === 'element') {
      if (!isComponentName(element) && row.matches.includes(element)) {
        return { archetype: contractFor(row.archetype ?? element), row, matched: element };
      }
      continue;
    }
    if (row.signal === 'component') {
      if (!isComponentName(element)) continue;
      const words = wordsIn(element);
      const matched = row.matches.find((word) => words.includes(word));
      if (matched) return { archetype: contractFor(row.archetype ?? matched), row, matched };
      continue;
    }
    // class
    for (const className of classes) {
      const words = wordsIn(className);
      const matched = row.matches.find((word) => words.includes(word));
      if (matched) return { archetype: contractFor(row.archetype ?? matched), row, matched };
    }
  }
  return null;
}

/** The variant word in a signature, if it names one — `btn--primary` -> Primary. */
function variantFor({ element, classes }) {
  const words = [...classes.flatMap(wordsIn), ...wordsIn(element)];
  const variant = words.find((word) => VARIANTS.includes(word));
  return variant ? variant.charAt(0).toUpperCase() + variant.slice(1) : 'Default';
}

/**
 * One component's name in every spelling a scan can see it in: the name as
 * written, its class spelling, and its element spelling.
 *
 * Split out of `registeredNames` in v0.2.1 because the unused check asks the
 * question one component at a time — "was *this* one ever seen?" — and a single
 * set of everybody's spellings cannot answer that.
 */
export function namesForComponent(name) {
  return new Set([
    String(name).toLowerCase(),
    classNameFor(name),
    componentNameFor(name).toLowerCase(),
  ]);
}

/** Everything `DESIGN-SYSTEM.md` already knows, in the spellings a scan sees. */
export function registeredNames(model) {
  const names = new Set();
  for (const component of model?.components ?? []) {
    for (const spelling of namesForComponent(component.name)) names.add(spelling);
  }
  return names;
}

/** Is this signature a component the system already has? */
export function isRegistered(signature, registered) {
  if (registered.has(String(signature.element).toLowerCase())) return true;
  if (registered.has(signature.name?.toLowerCase())) return true;
  if (registered.has(classNameFor(signature.name ?? ''))) return true;
  return signature.classes.some((className) => registered.has(className.toLowerCase()));
}

/**
 * The candidate list for a project: repeated markup patterns that map to an
 * archetype and are not in the system yet, most-used first.
 */
export function scanCandidates(root, model, { limit = 8, ...options } = {}) {
  const registered = registeredNames(model);
  const out = [];

  for (const signature of scanMarkup(root, options)) {
    const hit = archetypeForSignature(signature);
    if (!hit || !hit.archetype) continue;
    if (signature.count < hit.row.minimum) continue;

    const candidate = {
      ...signature,
      archetype: hit.archetype.key,
      archetypeName: hit.archetype.name,
      matched: hit.matched,
      signal: hit.row.signal,
      name: `${hit.archetype.name}/${variantFor(signature)}`,
    };
    if (isRegistered(candidate, registered)) continue;
    out.push(candidate);
  }

  return out.slice(0, limit);
}

/**
 * The picker: the archetypes from the contract, then the candidates found in
 * the codebase. One flat numbering, because the user types one number.
 */
export function pickList(root, model, options = {}) {
  const candidates = scanCandidates(root, model, options);
  const archetypeRows = archetypeList().map((contract) => ({
    kind: 'archetype',
    archetype: contract.key,
    archetypeName: contract.name,
    name: `${contract.name}/Default`,
    label: contract.name,
  }));
  const candidateRows = candidates.map((candidate) => ({ kind: 'candidate', ...candidate }));
  return { archetypes: archetypeRows, candidates: candidateRows, choices: [...archetypeRows, ...candidateRows] };
}

/**
 * "3" picks the third row; a name picks by archetype or by candidate name.
 * Returns null when the answer matches nothing — a picker never guesses.
 */
export function resolvePick(answer, picker) {
  const raw = String(answer ?? '').trim();
  if (raw === '') return null;

  const index = Number.parseInt(raw, 10);
  if (String(index) === raw) {
    return index >= 1 && index <= picker.choices.length ? picker.choices[index - 1] : null;
  }

  const lower = raw.toLowerCase();
  return (
    picker.choices.find((choice) => choice.name?.toLowerCase() === lower) ??
    picker.choices.find((choice) => choice.signature?.toLowerCase() === lower) ??
    picker.choices.find(
      (choice) => choice.kind === 'archetype' && choice.archetype === contractFor(lower)?.key,
    ) ??
    null
  );
}

/**
 * Seed a draft from a pick. Archetype and name only: a pick is a decision about
 * *what* to build, and every value still has to come from the user.
 */
export function seedFromPick(choice, { now } = {}) {
  const draft = newDraft({
    mode: 'pick',
    input: choice.kind === 'candidate' ? choice.signature : choice.archetypeName,
    now,
  });
  draft.archetype = choice.archetype;
  draft.archetypeName = choice.archetypeName;
  draft.name = choice.name;
  if (choice.kind === 'candidate') {
    draft.source.candidate = {
      signature: choice.signature,
      count: choice.count,
      files: choice.files,
    };
  }
  return draft;
}

/** The picker as the user reads it. */
export function renderPicker(picker) {
  const lines = ['What would you like to create?', '', 'Archetypes'];
  let index = 1;
  for (const row of picker.archetypes) {
    lines.push(`  ${index}. ${row.label}`);
    index += 1;
  }

  lines.push('', 'Found in your codebase (not in your design system yet)');
  if (picker.candidates.length === 0) {
    lines.push('  nothing repeated often enough to propose — the archetypes above are the way in.');
  }
  for (const row of picker.candidates) {
    lines.push(
      `  ${index}. ${row.name} — \`${row.signature}\` used ${row.count}× (${row.files[0]}${row.files.length > 1 ? ` +${row.files.length - 1} more` : ''})`,
    );
    index += 1;
  }
  lines.push('', 'Pick a number or a name. Nothing is written until you accept.');
  return lines.join('\n');
}
