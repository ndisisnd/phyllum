/**
 * `refine coverage` — a built component may not carry raw values (v0.11.0 §2).
 *
 * The gate's second section, and the first one that reads a codebase. Assess
 * runs the same scan and asks a system-wide question: how much of what this
 * repository writes by hand does the design system already name? This module
 * runs it *pointed at one component* and asks the narrow question the gate
 * needs: does the thing that got built reach its styling through tokens, or
 * does it still write the values out?
 *
 * Three decisions shape everything below, and each one is a reuse rather than
 * an invention:
 *
 *   1. **Where a component lives is `applied:`'s answer, not a new one.** The
 *      files a component is graded in come from the same `alreadyAdopted` walk
 *      `lib/applied.js` derives the flag from. A second definition of "this
 *      component is here" would eventually disagree with the flag, and then a
 *      component could be applied and ungraded at the same time.
 *   2. **What counts as a raw value is Assess's answer, not a new one.** The
 *      sightings come from `scanCodebase`, so a comment is not evidence, a
 *      `var(--token)` is a reference rather than a value, and a length with no
 *      property has no reading. A value class Assess cannot read is one this
 *      module does not invent a reading for.
 *   3. **A component nobody built is not graded.** It is reported unbuilt. It
 *      is not passed either — a criterion passed by absence is a criterion
 *      nobody checked, which is the rule the ship verdict runs on.
 *
 * Read-only, like the rest of the stage: this module opens files for reading
 * and contains no write call.
 */

import fs from 'node:fs';
import path from 'node:path';

import { adoptionSites } from './applied.js';
import { namesForComponent, scanMarkup, wordsIn } from './candidates.js';
import { readComponent } from './prd.js';
import { MAX_SOURCE_BYTES, readTextFile } from './scan-text.js';
import { sources } from './tokenise-spec.js';
import { comparisonValue, knownValues, normaliseValue, scanCodebase } from './tokenise.js';
import { ERROR, coverageRules, refineSeverityFor } from './refine-spec.js';

/** The bounds this section scans under — Assess's, so both read the same project. */
export const COVERAGE_LIMITS = { maxFiles: 2000, maxDepth: 12 };

/** The sentence every coverage result is read under, and never without. */
export const BOUNDED_CAVEAT =
  'the scan is bounded and text-based, so "no raw values seen" means "none seen in what was read"';

/** A finding, in the vocabulary every other finding in Phyllum already uses. */
function finding(rule, value, detail, evidence = []) {
  return { rule, severity: refineSeverityFor(rule), value, detail, evidence };
}

/**
 * The stylesheets that carry a rule for this component.
 *
 * A component's markup is where it is *used*; in a plain-CSS project most of
 * what it is made of lives in a stylesheet next door, and a coverage check that
 * read only the markup would pass a component whose every colour is a literal
 * one file away.
 *
 * The test is a selector mentioning one of the component's spellings, which is
 * deliberately coarser than a CSS parse and is stated as such: a stylesheet
 * that styles this component *and others* is attributed to it whole. Every
 * finding names the file and the property it came from, so a value that belongs
 * to a neighbouring rule is visible as one rather than hidden inside a count.
 */
export function styleFilesFor(root, recorded, { maxFiles = 400, maxDepth = 8 } = {}) {
  const { stylesheets, skipped } = sources();
  const extensions = new Set(stylesheets);
  const skip = new Set(skipped);
  const spellings = [...namesForComponent(recorded.name)];
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
      if (!extensions.has(path.extname(entry.name).toLowerCase())) continue;
      if (budget-- <= 0) return;
      const text = readTextFile(full, { maxBytes: MAX_SOURCE_BYTES });
      if (text === null) continue;
      for (const selector of text.matchAll(/([^{}]*)\{/g)) {
        const words = new Set(wordsIn(selector[1]));
        if (!spellings.some((spelling) => wordsIn(spelling).every((word) => words.has(word)))) continue;
        found.push(path.relative(resolved, full).split(path.sep).join('/'));
        break;
      }
    }
  };

  walk(resolved, 0);
  return found.sort();
}

/**
 * Which files each recorded component is built in.
 *
 * A component with no site and no rule of its own is `built: false` and carries
 * no files: the scan looked and found nothing spelled as this component. That
 * is a reading about the codebase, not a grade, which is why it is returned
 * rather than turned into a finding here.
 */
export function componentFiles(root, model, { signatures = null, ...options } = {}) {
  const sites = scanMarkup(root, { ...COVERAGE_LIMITS, ...options, signatures });
  return (model?.components ?? []).map((component) => {
    const recorded = readComponent(component);
    const markup = adoptionSites(sites, recorded).flatMap((site) => site.files ?? []);
    const files = [...new Set([...markup, ...styleFilesFor(root, recorded, options)])].sort();
    return {
      component: recorded.name,
      recorded,
      built: files.length > 0,
      files,
      markup: [...new Set(markup)].sort(),
    };
  });
}

/**
 * Is this value one the design system already names?
 *
 * The comparison is `knownValues`', so a `#2563EB` recorded once is recognised
 * however it is spelled — the literal form for readers that compare strings,
 * the channel form that makes `rgba(37, 99, 235)` the same colour.
 */
export function alreadyNamed(sighting, known) {
  if (sighting.pass === 'typography') {
    const triple = [
      normaliseValue(sighting.size),
      normaliseValue(sighting.weight),
      normaliseValue(sighting.lineHeight),
    ].join('|');
    return known.typography.has(triple) || known.typography.has(normaliseValue(sighting.size));
  }
  if (sighting.pass === 'colours') return known.colours.has(comparisonValue(sighting.value));
  return known.numbers.has(normaliseValue(sighting.value));
}

/**
 * The seen-but-not-read bucket, in the shape the filter below reads.
 *
 * `scanCodebase` collects those one raw sighting at a time — `{ kind, property,
 * value, file }`, one file each, undeduplicated — because they are questions
 * rather than proposals and nothing clusters them. One value written in one file
 * three times is one finding here, so they are folded on the way in.
 */
export function unreadableSightings(unknown = []) {
  const rows = new Map();
  for (const row of unknown) {
    const key = `${row.property ?? ''}|${normaliseValue(row.value)}`;
    const entry = rows.get(key) ?? { ...row, files: [] };
    if (!entry.files.includes(row.file)) entry.files.push(row.file);
    rows.set(key, entry);
  }
  return [...rows.values()];
}

/** The sightings that landed in one of these files, with the files they landed in. */
function sightingsIn(sightings, files) {
  const wanted = new Set(files);
  const rows = [];
  for (const sighting of sightings ?? []) {
    const hit = (sighting.files ?? []).filter((file) => wanted.has(file));
    if (hit.length === 0) continue;
    rows.push({ ...sighting, files: hit.sort() });
  }
  return rows.sort(
    (a, b) =>
      a.files[0].localeCompare(b.files[0]) ||
      String(a.value).localeCompare(String(b.value)) ||
      String(a.property ?? '').localeCompare(String(b.property ?? '')),
  );
}

/** How a finding says where it saw what it saw. */
const evidenceFor = (sighting) =>
  sighting.files.map((file) => `${file}: ${sighting.property ?? 'unknown property'}: ${sighting.value}`);

/**
 * One component's coverage: every raw value its own files carry.
 *
 * `bypassed-token` and `unnamed-value` are one failure with two repairs, which
 * is why the split is here rather than in the report. The first has an answer
 * already sitting in `DESIGN-SYSTEM.md` and the finding names it; the second
 * has no answer yet, so the repair runs through `tokenise` first.
 */
export function componentCoverage(entry, sightings, unknown, model) {
  if (!entry.built) {
    return { ...entry, checked: false, reason: 'nothing in the markup scan is this component', pass: null, findings: [] };
  }
  const known = knownValues(model);
  const findings = [];

  for (const sighting of sightingsIn(sightings, entry.files)) {
    const named = alreadyNamed(sighting, known);
    findings.push(
      finding(
        named ? 'bypassed-token' : 'unnamed-value',
        sighting.value ?? sighting.size,
        named
          ? `\`${entry.component}\` writes a value the design system already names — use the token rather than the literal`
          : `\`${entry.component}\` writes a value no token covers — name it with \`tokenise\` first, then use the token`,
        evidenceFor(sighting),
      ),
    );
  }

  for (const sighting of sightingsIn(unreadableSightings(unknown), entry.files)) {
    findings.push(
      finding(
        'unreadable-value',
        sighting.value,
        `\`${entry.component}\` carries a value on a property no table gives a meaning to, so Phyllum will not say what it is for`,
        evidenceFor(sighting),
      ),
    );
  }

  return {
    ...entry,
    checked: true,
    reason: null,
    pass: findings.every((row) => row.severity !== ERROR),
    findings,
  };
}

/**
 * The coverage section, over every recorded component.
 *
 * `ran: false` is a first-class answer. A stack whose component pass does not
 * run cannot be told its components carry raw values — that would be a
 * statement about the reader rather than about the project — so the section
 * reports that it could not run, and says why.
 */
export function refineCoverage(root, model, options = {}) {
  const { componentPass = { ran: true, reason: null }, signatures = null, ...rest } = options;
  if (componentPass.ran === false) {
    return {
      ran: false,
      reason: componentPass.reason ?? 'the component pass did not run for this stack',
      caveat: BOUNDED_CAVEAT,
      components: [],
      findings: [],
      pass: null,
    };
  }

  const unknown = [];
  const sightings =
    options.sightings ??
    scanCodebase(root, { ...COVERAGE_LIMITS, ...rest, text: true, gitignore: true, unknown });

  const components = componentFiles(root, model, { ...rest, signatures }).map((entry) =>
    componentCoverage(entry, sightings, options.unknown ?? unknown, model),
  );
  const graded = components.filter((entry) => entry.checked);

  return {
    ran: true,
    reason: null,
    caveat: BOUNDED_CAVEAT,
    components,
    findings: components.flatMap((entry) => entry.findings),
    // A conjunction, not a proportion — and a system with nothing built passes
    // nothing, so the section has no verdict to give rather than a clean one.
    pass: graded.length === 0 ? null : graded.every((entry) => entry.pass),
  };
}

/** The rules this section may report, straight from the table. */
export const rules = () => coverageRules().map((row) => row.rule);
