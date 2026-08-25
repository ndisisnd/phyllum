/**
 * `refine deprecate` — mark it dying, and say what replaces it (v0.11.0 §5).
 *
 * The one mode of Refine that changes what `DESIGN-SYSTEM.md` records, and the
 * only one that is not a section of the gate. It answers the question the other
 * six cannot: this thing is on its way out — what takes its place, and who is
 * still using it?
 *
 * Four decisions shape everything below:
 *
 *   1. **A replacement is mandatory.** There is no "deprecated, successor
 *      undecided" state, because that state is a message that something is bad
 *      with no answer about what to do instead — and it leaves `delete` with
 *      nothing to point at when it refuses a removal.
 *   2. **The record goes where the file already keeps that kind of fact.** A
 *      component's state sits in its spec block beside `applied:`; a token's
 *      sits in the Backlog, because the token tables' columns are contract and
 *      may not grow to carry a state. Both homes are read from
 *      `phyllum:deprecate-record` rather than decided here.
 *   3. **The usage list has no second detector.** A component's usages come
 *      from the same `alreadyAdopted` walk `apply` derives its flag from and
 *      `delete` blocks on, so the three can never disagree about what "this
 *      component is here" means.
 *   4. **The derivation writes nothing.** `planDeprecation` reads the file,
 *      reads the codebase, and returns the edit it *would* make. The write is a
 *      separate call, and it sits after the acceptance gate the skill runs —
 *      exactly where `update`'s and `delete`'s writes sit.
 *
 * The write, when it comes, is **surgical**: two lines in one spec block, or one
 * line in the Backlog. Every other byte of `DESIGN-SYSTEM.md` is the file the
 * user had, which is what makes "nothing else is touched" a fact about the diff
 * rather than a promise in a report.
 */

import fs from 'node:fs';
import path from 'node:path';

import { adoptionSites, specBlockRanges } from './applied.js';
import { tokenSpellings } from './assess-hygiene.js';
import { scanMarkup } from './candidates.js';
import {
  EMPTY_BACKLOG_NOTE,
  HEADING_BACKLOG,
  HEADING_COMPONENTS,
  HEADING_TOKENS,
  TOKEN_SECTIONS,
} from './design-system.js';
import { readComponent } from './prd.js';
import { deprecateCopy, deprecateCopyTemplate, deprecateRecordFor } from './refine-spec.js';
import { MAX_SOURCE_BYTES, readTextFile } from './scan-text.js';
import { sources } from './tokenise-spec.js';
import { DESIGN_SYSTEM_FILE, writeDesignSystem } from './write.js';

/** The two subject kinds this mode can be pointed at. */
export const COMPONENT = 'component';
export const TOKEN = 'token';

/** The copy line a token's deprecation is written as, and read back out of. */
export const BACKLOG_LINE = 'backlog-line';

/** The sentence every token usage list is read under, and never without. */
export const BOUNDED_CAVEAT =
  'the scan is bounded and text-based, so "no usage seen" means "none seen in what was read"';

/** The bounds the token scan runs under. */
export const SCAN_LIMITS = { maxFiles: 2000, maxDepth: 12 };

/**
 * The top-level spec-block keys the deprecation lines are placed after.
 *
 * `applied:` is in the list because it is a fact about the component rather
 * than one of its slots, and the deprecation lines are the same kind of fact.
 * They read together, above the slots, instead of in the middle of them.
 */
const HEADER_KEYS = ['name', 'archetype', 'custom', 'applied'];

// ---------------------------------------------------------------------------
// The record — how each home is written and read
// ---------------------------------------------------------------------------

/** The two spec-block keys, straight from `phyllum:deprecate-record`. */
export function componentKeys() {
  const row = deprecateRecordFor(COMPONENT);
  if (!row) throw new Error('the phyllum:deprecate-record table records no component row');
  return { flag: row.keys[0], replacement: row.keys[1] };
}

const keyLine = (key) => new RegExp(`^${key.replace(/[-]/g, '\\-')}:\\s*(.*)$`);

/**
 * The reader for the Backlog line, built from the line itself.
 *
 * This is the one copy table in Phyllum read in both directions, and it is
 * built rather than spelled because the alternative is two sentences that have
 * to stay identical forever. The template's fixed words are escaped; its two
 * placeholders become the captures. A line edited in the reference therefore
 * stays a line this reader recognises, and a line it no longer recognises is a
 * reference edit somebody can see rather than a silent loss of state.
 */
export function backlogPattern() {
  const template = deprecateCopyTemplate(BACKLOG_LINE);
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = escaped
    .replace('\\{name\\}', '(\\S+?)')
    .replace('\\{replacement\\}', '(\\S+?)')
    .replace(/\{name\}/g, '(\\S+?)')
    .replace(/\{replacement\}/g, '(\\S+?)');
  return new RegExp(`^${body}$`, 'i');
}

const unquote = (value) => String(value ?? '').replace(/`/g, '').trim();

// ---------------------------------------------------------------------------
// Reading the file
// ---------------------------------------------------------------------------

/**
 * Every component's deprecation record, read out of its spec block.
 *
 * A block that records the flag without a replacement is **not** a deprecation.
 * The replacement is the content of the record, so half a record is read as
 * none rather than as a component deprecated into nothing — which is the same
 * "silent yes" reading `delete`'s in-use block was built to refuse.
 */
export function componentDeprecations(text) {
  const { flag, replacement } = componentKeys();
  const flagLine = keyLine(flag);
  const replacementLine = keyLine(replacement);
  const lines = String(text).split('\n');
  const found = new Map();

  for (const block of specBlockRanges(text)) {
    if (found.has(block.name)) continue;
    let marked = false;
    let named = null;
    for (let i = block.start; i < block.end; i += 1) {
      const flagged = lines[i].match(flagLine);
      if (flagged) {
        marked = flagged[1].trim().toLowerCase() === 'true';
        continue;
      }
      const replaced = lines[i].match(replacementLine);
      if (replaced && unquote(replaced[1]) !== '') named = unquote(replaced[1]);
    }
    if (marked && named !== null) {
      found.set(block.name, { subject: block.name, kind: COMPONENT, replacement: named });
    }
  }
  return found;
}

/** Where the Backlog's items sit in the raw text — the walk `delete`'s renderer also makes. */
export function backlogRange(text) {
  const lines = String(text).split('\n');
  const items = [];
  let section = 'header';
  let start = -1;
  let end = lines.length;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === HEADING_TOKENS || trimmed === HEADING_COMPONENTS || trimmed === HEADING_BACKLOG) {
      if (section === 'backlog') end = Math.min(end, index);
      section = trimmed === HEADING_BACKLOG ? 'backlog' : 'other';
      if (section === 'backlog') start = index;
      return;
    }
    if (section !== 'backlog') return;
    const item = trimmed.match(/^-\s+(.*)$/);
    if (item) items.push({ index, text: item[1] });
  });

  return { start, end: start === -1 ? -1 : end, items };
}

/** Every token's deprecation record, read out of the Backlog's fixed line. */
export function tokenDeprecations(text) {
  const pattern = backlogPattern();
  const found = new Map();
  for (const item of backlogRange(text).items) {
    const match = item.text.trim().match(pattern);
    if (!match) continue;
    const subject = unquote(match[1]);
    const replacement = unquote(match[2]);
    if (subject === '' || replacement === '' || found.has(subject)) continue;
    found.set(subject, { subject, kind: TOKEN, replacement, line: item.index });
  }
  return found;
}

/** One subject's deprecation record, whichever home it lives in, or null. */
export function deprecationOf(text, subject) {
  const name = String(subject ?? '');
  return componentDeprecations(text).get(name) ?? tokenDeprecations(text).get(name) ?? null;
}

/** Every token name the design system records, whatever section it sits in. */
export function recordedTokenNames(model) {
  const names = new Set();
  for (const section of TOKEN_SECTIONS) {
    for (const row of model?.tokens?.[section.key] ?? []) {
      const name = String(row?.[0] ?? '').trim();
      if (name !== '') names.add(name);
    }
  }
  for (const row of model?.tokens?.primitives ?? []) {
    const name = String(row?.[0] ?? '').trim();
    if (name !== '') names.add(name);
  }
  return names;
}

/**
 * Is this name a component, a token, or nothing the design system records?
 *
 * Components are asked first. A name carried by both is a component, because a
 * component is the thing with a spec block and a spec block is the thing the
 * record is written into; the token reading would have nowhere to put it.
 */
export function subjectKind(model, name) {
  const wanted = String(name ?? '');
  if ((model?.components ?? []).some((component) => String(component.name) === wanted)) {
    return COMPONENT;
  }
  return recordedTokenNames(model).has(wanted) ? TOKEN : null;
}

// ---------------------------------------------------------------------------
// The usage list
// ---------------------------------------------------------------------------

/** The markup sites that already *are* this component — `apply`'s own evidence. */
export function componentUsages(root, model, name, { signatures = null, sites = null } = {}) {
  const component = (model?.components ?? []).find((entry) => String(entry.name) === String(name));
  if (!component) return [];
  const scanned = sites ?? scanMarkup(root, signatures ? { signatures } : {});
  return adoptionSites(scanned, readComponent(component));
}

/** The component specs whose recorded slots name this token. */
export function tokenSpecUsages(model, token) {
  const wanted = String(token);
  const out = [];
  for (const component of model?.components ?? []) {
    const recorded = readComponent(component);
    const slots = [...String(recorded.spec ?? '').matchAll(/^\s*([A-Za-z0-9_-]+):\s*(.+?)\s*$/gm)];
    const hits = slots.filter(([, , value]) => unquote(value) === wanted).map(([, key]) => key);
    if (hits.length > 0) out.push({ component: recorded.name, slots: [...new Set(hits)] });
  }
  return out;
}

/**
 * The files that write this token's name, with the line each one writes it on.
 *
 * The spellings are `assess`'s — the bare name, the custom property and the
 * camel-cased form — matched on a whole name rather than a substring, so
 * `space-4` is not reported because somebody wrote `space-40`. The direction of
 * that strictness matters here for the reason it matters in the hygiene pass:
 * every over-match would inflate a usage list that a deprecation is meant to be
 * acted on.
 */
export function tokenFileUsages(root, token, { maxFiles = 2000, maxDepth = 12 } = {}) {
  const spellings = tokenSpellings(token);
  if (spellings.length === 0) return [];
  const patterns = spellings.map(
    (spelling) =>
      new RegExp(`(^|[^a-z0-9-])${spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9-]|$)`, 'i'),
  );
  const { extensions, skipped } = sources();
  const wanted = new Set(extensions);
  const skip = new Set(skipped);
  const resolved = path.resolve(root);
  const found = [];
  let budget = maxFiles;

  const walk = (dir, depth) => {
    if (depth > maxDepth || budget <= 0) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (skip.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!wanted.has(path.extname(entry.name).toLowerCase())) continue;
      if (budget-- <= 0) return;
      const text = readTextFile(full, { maxBytes: MAX_SOURCE_BYTES });
      if (text === null) continue;
      const lines = [];
      text.split('\n').forEach((line, index) => {
        if (patterns.some((pattern) => pattern.test(line))) lines.push(index + 1);
      });
      if (lines.length > 0) {
        found.push({ file: path.relative(resolved, full).split(path.sep).join('/'), lines });
      }
    }
  };

  walk(resolved, 0);
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Everything still using this subject, in the shape the report and the refusal
 * both read.
 *
 * `count` is what `delete`'s block and the acceptance proposal both turn on, so
 * it is derived once here rather than counted twice by two callers who could
 * count differently.
 */
export function usagesFor(root, model, subject, kind, options = {}) {
  if (kind === COMPONENT) {
    const sites = componentUsages(root, model, subject, options);
    return {
      kind: COMPONENT,
      sites,
      specs: [],
      files: [],
      count: sites.length,
      caveat: BOUNDED_CAVEAT,
    };
  }
  const specs = tokenSpecUsages(model, subject);
  const files = tokenFileUsages(root, subject, { ...SCAN_LIMITS, ...options });
  return {
    kind: TOKEN,
    sites: [],
    specs,
    files,
    count: specs.length + files.length,
    caveat: BOUNDED_CAVEAT,
  };
}

// ---------------------------------------------------------------------------
// The edit — derived, never written here
// ---------------------------------------------------------------------------

/**
 * Set a component's two deprecation lines, in place.
 *
 * The same three rules `setAppliedLines` follows, and for the same reasons: an
 * existing line is replaced where it already sits, a block with no line gains
 * one directly after its header keys, and a block nobody named is not touched.
 */
export function setComponentDeprecation(text, name, replacement) {
  const { flag, replacement: replacementKey } = componentKeys();
  const wanted = [`${flag}: true`, `${replacementKey}: ${replacement}`];
  const patterns = [keyLine(flag), keyLine(replacementKey)];
  const lines = String(text).split('\n');

  // Backwards, so an insertion never invalidates an earlier block's indices.
  for (const block of [...specBlockRanges(text)].reverse()) {
    if (block.name !== name) continue;
    let insert = block.start;
    while (insert < block.end) {
      const key = lines[insert].match(/^([A-Za-z0-9_-]+):/);
      if (!key || !HEADER_KEYS.includes(key[1])) break;
      insert += 1;
    }
    // Backwards again over the two lines, so the pair keeps its table order.
    for (let which = wanted.length - 1; which >= 0; which -= 1) {
      let at = -1;
      for (let i = block.start; i < block.end; i += 1) {
        if (patterns[which].test(lines[i])) {
          at = i;
          break;
        }
      }
      if (at !== -1) lines[at] = wanted[which];
      else lines.splice(insert, 0, wanted[which]);
    }
    break;
  }
  return lines.join('\n');
}

/**
 * Add — or update — a token's Backlog line.
 *
 * The "nothing outstanding" note goes when the first item arrives, because an
 * empty-Backlog note above a Backlog item is a file that says two things. That
 * is the same shape rule `delete` honours from the other direction when it
 * removes the last item.
 */
export function setTokenDeprecation(text, token, replacement) {
  // The table's sentence already carries the backticks around both names, so
  // the values go in bare. Quoting them here would write ``radius-sm`` into the
  // file, and a line the reader below could still parse is not a line a person
  // should have to read.
  const line = `- ${deprecateCopy(BACKLOG_LINE, { name: token, replacement })}`;
  const lines = String(text).split('\n');
  const range = backlogRange(text);
  if (range.start === -1) return String(text);

  const existing = tokenDeprecations(text).get(String(token));
  if (existing) {
    lines[existing.line] = line;
    return lines.join('\n');
  }

  const note = lines.findIndex(
    (row, index) => index > range.start && index < range.end && row.trim() === EMPTY_BACKLOG_NOTE,
  );
  if (note !== -1) {
    lines[note] = line;
    return lines.join('\n');
  }

  const last = range.items.length > 0 ? range.items[range.items.length - 1].index : range.start;
  lines.splice(last + 1, 0, line);
  return lines.join('\n');
}

/**
 * Everything one deprecation is and does, worked out before anything is written.
 *
 * Returns the refusal when there is one, the existing record when the subject
 * is already deprecated, the usage list either way, and the file as it *would*
 * stand. It opens no writer and reaches none: `writeDeprecation` below is the
 * only path to disk, and it sits after the gate.
 */
export function planDeprecation(root, model, text, subject, replacement, options = {}) {
  const name = String(subject ?? '').trim();
  const successor = String(replacement ?? '').trim();
  const kind = subjectKind(model, name);

  const refuse = (line, values) => ({
    ok: false,
    subject: name,
    kind,
    replacement: successor === '' ? null : successor,
    refusal: { line, text: deprecateCopy(line, values) },
    already: null,
    usages: null,
    before: String(text),
    after: String(text),
    changed: false,
  });

  if (kind === null) return refuse('unknown-subject', { name });
  if (successor === '') return refuse('no-replacement', { name });
  if (successor.toLowerCase() === name.toLowerCase()) return refuse('self-replacement', { name });
  if (subjectKind(model, successor) === null) {
    return refuse('unknown-replacement', { name, replacement: successor });
  }

  const usages = usagesFor(root, model, name, kind, options);
  const already = deprecationOf(text, name);
  const after =
    kind === COMPONENT
      ? setComponentDeprecation(text, name, successor)
      : setTokenDeprecation(text, name, successor);

  return {
    ok: true,
    subject: name,
    kind,
    replacement: successor,
    refusal: null,
    already,
    usages,
    before: String(text),
    after,
    changed: after !== String(text),
    home: deprecateRecordFor(kind)?.home ?? null,
  };
}

/**
 * The proposal the acceptance gate is asked about: exactly what changes.
 *
 * The usage list is part of the proposal rather than a follow-up, because a
 * deprecation with nobody on it and a deprecation with forty callers are two
 * different decisions and the user is making one of them.
 */
export function renderProposal(plan) {
  if (!plan.ok) return plan.refusal.text;
  const lines = [
    `Deprecating \`${plan.subject}\` records exactly this in ${DESIGN_SYSTEM_FILE}:`,
    plan.kind === COMPONENT
      ? `  its spec block gains \`${componentKeys().flag}: true\` and \`${componentKeys().replacement}: ${plan.replacement}\``
      : `  one Backlog line naming \`${plan.replacement}\` as its replacement`,
    '  nothing else in the file is touched.',
  ];
  if (plan.already) {
    lines.push(
      `  ${deprecateCopy('already', { name: plan.subject, replacement: plan.already.replacement })}`,
    );
  }
  lines.push('', ...renderUsages(plan));
  return lines.join('\n');
}

/** The usage list, as evidence a person can go and look at. */
export function renderUsages(plan) {
  const usages = plan.usages;
  if (!usages) return [];
  if (usages.count === 0) {
    return [`Nothing seen still uses \`${plan.subject}\` — ${usages.caveat}.`];
  }
  const out = [
    `${usages.count} usage${usages.count === 1 ? '' : 's'} still name${usages.count === 1 ? 's' : ''} \`${plan.subject}\`:`,
  ];
  for (const site of usages.sites) {
    const where = site.files.slice(0, 3).join(', ');
    const more = site.files.length > 3 ? `, +${site.files.length - 3} more` : '';
    out.push(`  ${site.signature}  ×${site.count}  (${where}${more})`);
  }
  for (const spec of usages.specs) {
    out.push(`  \`${spec.component}\` — ${spec.slots.map((slot) => `\`${slot}\``).join(', ')}`);
  }
  for (const file of usages.files) {
    out.push(`  ${file.file}: ${file.lines.slice(0, 5).join(', ')}`);
  }
  out.push(`  ${usages.caveat}.`);
  return out;
}

/**
 * The write, through the one funnel — the `.bak` first, then the atomic swap.
 *
 * A plan that was refused has nothing to write and says so rather than writing
 * the unchanged file, and a plan that changes no byte writes nothing at all: no
 * file, no `.bak`. Both are the rerunnability rule `apply` established.
 */
export function writeDeprecation(root, plan, options = {}) {
  if (!plan.ok) return { written: false, reason: plan.refusal.text };
  if (!plan.changed) {
    return { written: false, reason: 'the record is already exactly this, so nothing was written' };
  }
  writeDesignSystem(root, plan.after, options);
  return { written: true, reason: null };
}

/** The fixed lines this mode prints, straight from the table. */
export { deprecateCopy };
