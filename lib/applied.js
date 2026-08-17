/**
 * `applied` — the component knows whether it is used (v0.5.0 plan §3).
 *
 * Once `phyllum apply` has run, every recorded component's spec block carries
 * `applied: true` or `applied: false`. The flag answers one question — **is this
 * component adopted in the codebase right now?** — and it answers it from
 * evidence `apply` was already reading:
 *
 *   `applied: true`   a markup site in the project already *is* this component:
 *                     its generated element, or its generated class. That is the
 *                     site `apply` skips when it derives adoption changes,
 *                     because there is nothing left to change there.
 *   `applied: false`  `apply` looked for such a site and found none.
 *   no flag at all    `apply` has never run here. Absence is not `false`.
 *
 * The evidence check is not written twice. `alreadyAdopted` lives in `lib/prd.js`
 * beside the adoption derivation that first needed it, and this module imports
 * it — one predicate, one meaning, and a change to what counts as "already this
 * component" cannot drift between the plan and the flag.
 *
 * **Derived, never declared.** No command sets the flag by hand, no question
 * offers it, and a hand-edited flag is overwritten by the next derivation — it is
 * a *reading* of the codebase, not an opinion about it. Two writers exist and
 * they agree: `phyllum apply` re-derives every flag on every run, and a completed
 * `Adopt <Component>` phase of `phyllum apply run` flips that one component to
 * `true` immediately.
 *
 * The write is deliberately **surgical**, not a re-render. Only the `applied:`
 * line of each spec block changes; every other byte of `DESIGN-SYSTEM.md` — the
 * user's prose, their whitespace, their column shapes, their code blocks — is the
 * file they had. It still goes through the one funnel, so the `.bak` is taken
 * first and the swap is atomic, exactly as every other write in Phyllum.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  HEADING_BACKLOG,
  HEADING_COMPONENTS,
  HEADING_TOKENS,
} from './design-system.js';
import { alreadyAdopted, readComponent } from './prd.js';
import { scanMarkup } from './candidates.js';
import { DESIGN_SYSTEM_FILE, writeDesignSystem } from './write.js';

/** The one spec-block key this module owns. */
export const APPLIED_KEY = 'applied';

/** The top-level scalar keys the flag sits with, in spec-block order. */
const HEADER_KEYS = ['name', 'archetype', 'custom', APPLIED_KEY];

/** `applied: true` / `applied: false`, at the top level of a spec block. */
const APPLIED_LINE = /^applied:\s*(.*)$/;

/** How `display` says each reading. Absence prints nothing at all. */
export const APPLIED_WORDS = { true: 'applied', false: 'not applied' };

// ---------------------------------------------------------------------------
// The derivation
// ---------------------------------------------------------------------------

/**
 * Every recorded component's flag, read from the codebase as it stands.
 *
 * The scan is the same markup walk the adoption pass uses, and the test applied
 * to each site is the same `alreadyAdopted` the adoption pass skips on. Nothing
 * here grades a site against an archetype, and that is on purpose: identity is
 * not a judgement. A site is this component when it is spelled as this
 * component's generated element or class, which is true whatever framework it is
 * written in and true of a `custom` component too — a custom claims no contract
 * to be graded against, but it still has a name, and the name is what the
 * evidence is about.
 *
 * A component with no spec block gets a reading all the same; it simply has
 * nowhere to record one, so the write below leaves it alone.
 */
export function deriveAppliedFlags(root, model, { signatures = null } = {}) {
  const sites = scanMarkup(root, signatures ? { signatures } : {});
  const flags = new Map();
  for (const component of model?.components ?? []) {
    const recorded = readComponent(component);
    flags.set(recorded.name, adoptionSites(sites, recorded).length > 0);
  }
  return flags;
}

/** The scanned sites that already *are* this component — the evidence itself. */
export function adoptionSites(sites, recorded) {
  return (sites ?? []).filter((site) => alreadyAdopted(site, recorded));
}

/**
 * The live reading for **one** component, sites and all (v0.5.0 §4.2).
 *
 * `delete`'s in-use block needs two things the flag cannot give it: a reading
 * for a file that has no flag because `apply` has never run, and the *evidence*
 * behind the reading, because a refusal that cannot say what it saw is a
 * refusal nobody can act on. Both come from the same scan and the same
 * `alreadyAdopted` predicate the flag is derived from — one detector, one
 * meaning, so a block and a flag can never disagree.
 */
export function appliedEvidence(root, component, { signatures = null } = {}) {
  const sites = scanMarkup(root, signatures ? { signatures } : {});
  return adoptionSites(sites, readComponent(component));
}

// ---------------------------------------------------------------------------
// Reading the file
// ---------------------------------------------------------------------------

/**
 * Where each component's spec block sits in the raw text.
 *
 * The walk mirrors `lib/design-system.js`'s parser line for line — same fencing
 * rule, same "a fence only opens inside a component" rule — because a second
 * reader that disagreed with the first about where a block ends would edit
 * somebody's prose. Returns `{ name, start, end }` per component, where the
 * content lines are `[start, end)`.
 */
export function specBlockRanges(text) {
  const lines = String(text).split('\n');
  const found = [];
  let section = 'header';
  let component = null;
  let sawSpec = false;
  let fence = null;

  lines.forEach((line, index) => {
    if (fence) {
      const close = line.match(/^(`{3,})\s*$/);
      if (close && close[1].length >= fence.marker.length) {
        if (fence.lang === 'yaml' && !sawSpec) {
          found.push({ name: component, start: fence.start, end: index });
          sawSpec = true;
        }
        fence = null;
      }
      return;
    }

    const open = line.match(/^(`{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
    if (open && section === 'components' && component !== null) {
      fence = { marker: open[1], lang: open[2] ?? '', start: index + 1 };
      return;
    }

    const trimmed = line.trim();
    if (trimmed === HEADING_TOKENS) {
      section = 'tokens';
      component = null;
      return;
    }
    if (trimmed === HEADING_COMPONENTS) {
      section = 'components';
      component = null;
      return;
    }
    if (trimmed === HEADING_BACKLOG) {
      section = 'backlog';
      component = null;
      return;
    }
    if (section !== 'components') return;
    const heading = trimmed.match(/^###\s+(.+)$/);
    if (heading) {
      component = heading[1].trim();
      sawSpec = false;
    }
  });

  return found;
}

/**
 * The `applied:` line one spec block records, read strictly.
 *
 * `{ found: false }`     no `applied:` line at all — `apply` has never run.
 * `{ found: true, value }` the line reads `true` or `false`, the two spellings
 *                        the derivation writes.
 * `{ found: true, value: null, said }` the line is there and says something
 *                        else, so nobody can vouch for it.
 *
 * The third case is the one this is split out for. `false` is a **finding** —
 * `apply` looked at the codebase and saw nothing — and a line no reader can
 * resolve is not a finding. Reading `applied: maybe` as `false` would hand
 * `delete`'s in-use block the silent yes the whole release is built to refuse,
 * so an unreadable line reads as unreadable and the block goes and looks.
 */
function readAppliedLine(lines, block) {
  for (let i = block.start; i < block.end; i += 1) {
    const match = lines[i].match(APPLIED_LINE);
    if (!match) continue;
    const said = match[1].trim();
    const word = said.toLowerCase();
    if (word === 'true') return { found: true, value: true, said };
    if (word === 'false') return { found: true, value: false, said };
    return { found: true, value: null, said };
  }
  return { found: false, value: null, said: null };
}

/**
 * The flag each component's spec block records: `true`, `false`, or null.
 *
 * Null covers three things that are one thing: no line, a line nobody can read,
 * and a name carried by two blocks. All three mean "there is nothing here to
 * trust", and every caller answers them the same way — by looking rather than
 * by guessing.
 */
export function readAppliedFlags(text) {
  const lines = String(text).split('\n');
  const flags = new Map();
  const seen = new Set();
  for (const block of specBlockRanges(text)) {
    // Two blocks under one name are not one reading. Whichever way they lean,
    // the name no longer identifies the block the reading came from.
    if (seen.has(block.name)) {
      flags.set(block.name, null);
      continue;
    }
    seen.add(block.name);
    flags.set(block.name, readAppliedLine(lines, block).value);
  }
  return flags;
}

/**
 * The flags that could not be read, in a sentence each.
 *
 * Empty for every file `apply` wrote and for every file written before v0.5.0,
 * which is what makes the sentence worth printing when there is one: it is a
 * hand-edit or a duplicated heading, and both are things only the person
 * holding the file can put right.
 */
export function appliedNotices(text) {
  const lines = String(text).split('\n');
  const notices = [];
  const counts = new Map();
  const blocks = specBlockRanges(text);
  for (const block of blocks) counts.set(block.name, (counts.get(block.name) ?? 0) + 1);

  const reported = new Set();
  for (const block of blocks) {
    if (counts.get(block.name) > 1) {
      if (reported.has(block.name)) continue;
      reported.add(block.name);
      notices.push(
        `${DESIGN_SYSTEM_FILE}: \`${block.name}\` is recorded twice, so its \`applied:\` reading ` +
          `belongs to no one entry — the codebase is read instead. Give the two entries different names.`,
      );
      continue;
    }
    const read = readAppliedLine(lines, block);
    if (read.found && read.value === null) {
      notices.push(
        `${DESIGN_SYSTEM_FILE}: \`${block.name}\` records \`applied: ${read.said}\`, which is neither ` +
          `\`true\` nor \`false\` — the reading is ignored and the codebase is read instead. ` +
          `Run \`phyllum apply\` to re-derive it.`,
      );
    }
  }
  return notices;
}

// ---------------------------------------------------------------------------
// Writing the file — the `applied:` lines, and not one byte more
// ---------------------------------------------------------------------------

/**
 * Set the `applied:` line of every component named in `flags`.
 *
 * Three rules, and the third is the one that makes "derived, never declared"
 * true rather than merely stated:
 *
 *   1. A block that already has an `applied:` line has **that line replaced**,
 *      in place. So a hand-edited flag is overwritten by the next derivation,
 *      and the line does not move around the file between runs.
 *   2. A block with no flag gains one directly after its header keys — `name`,
 *      `archetype`, and `custom` when it is there — so the flag reads with the
 *      other facts about the component rather than in the middle of its slots.
 *   3. A component the caller says nothing about is not touched, and neither is
 *      a component with no spec block to write into.
 */
export function setAppliedLines(text, flags) {
  const lines = String(text).split('\n');
  // Backwards, so an insertion never invalidates an earlier block's indices.
  for (const block of [...specBlockRanges(text)].reverse()) {
    if (!flags.has(block.name)) continue;
    const value = flags.get(block.name);
    if (value !== true && value !== false) continue;
    const line = `${APPLIED_KEY}: ${value === true ? 'true' : 'false'}`;

    let at = -1;
    for (let i = block.start; i < block.end; i += 1) {
      if (APPLIED_LINE.test(lines[i])) {
        at = i;
        break;
      }
    }
    if (at !== -1) {
      lines[at] = line;
      continue;
    }

    let insert = block.start;
    while (insert < block.end) {
      const key = lines[insert].match(/^([A-Za-z0-9_-]+):/);
      if (!key || !HEADER_KEYS.includes(key[1])) break;
      insert += 1;
    }
    lines.splice(insert, 0, line);
  }
  return lines.join('\n');
}

/**
 * Write the flags into `DESIGN-SYSTEM.md`, through the one funnel.
 *
 * A run that changes no line writes nothing at all — no file, no `.bak`. That is
 * what keeps `apply`'s rerunnability claim true: a second run on an unchanged
 * project leaves the whole directory byte for byte as it was.
 */
export function writeAppliedFlags(root, flags, options = {}) {
  const file = path.join(path.resolve(root), DESIGN_SYSTEM_FILE);
  if (!fs.existsSync(file)) return { written: false, flags: new Map() };

  const before = fs.readFileSync(file, 'utf8');
  const after = setAppliedLines(before, flags);
  const recorded = readAppliedFlags(after);
  if (after === before) return { written: false, flags: recorded };

  writeDesignSystem(root, after, options);
  return { written: true, flags: recorded };
}

/** One component, flipped to `true` — `apply run`'s half of the contract. */
export function flipApplied(root, component, options = {}) {
  return writeAppliedFlags(root, new Map([[String(component), true]]), options);
}

/** How many components read each way — for the report line, nothing else. */
export function countApplied(flags) {
  let applied = 0;
  let not = 0;
  for (const value of flags.values()) {
    if (value === true) applied += 1;
    else if (value === false) not += 1;
  }
  return { applied, not };
}
