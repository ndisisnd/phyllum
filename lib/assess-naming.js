/**
 * Naming-convention drift — one concept, more than one name (v0.2.1 plan §5.1).
 *
 * M3 taught `assess` to say that two components are the *same* component. This
 * is the question underneath that one: when they are, are they **called** the
 * same thing? A codebase with `btn--primary` in one file and `PrimaryBtn` in the
 * next has not got two patterns, it has one pattern and two spellings — and the
 * cost of that is not aesthetic. It is that nobody can search for it, nobody can
 * be sure a change hits all of it, and every new file has to pick a side.
 *
 * Two readings, and both are about the codebase's own house style rather than
 * about a style Phyllum prefers:
 *
 *   1. **Drift** — the same words spelled two ways. `wordsIn()` already
 *      normalises a name into a set of words, so `btn--primary` and `PrimaryBtn`
 *      arrive here as `{btn, primary}` twice, in two orders. A group with more
 *      than one surface form in it is one concept spelled more than once.
 *   2. **Convention** — a name whose case style is not the one this codebase
 *      mostly uses. The dominant convention is *counted*, never assumed: Phyllum
 *      reads what is there and reports the strays, and when nothing is dominant
 *      it says so rather than picking a winner.
 *
 * Three honesty rules do most of the work, and each of them exists because the
 * obvious version of this check is unusable.
 *
 *   - **Only exact word sets are compared.** `btn` and `Button` are two
 *     concepts here. Tying them together needs a dictionary of abbreviations,
 *     and a dictionary is a machine for guessing.
 *   - **Names are grouped within their kind.** A component called `Card`
 *     rendering a class called `card` is one concept spelled two ways *on
 *     purpose*, and a check that flags it is a check nobody keeps switched on.
 *     A class that is a known spelling of a registered component is folded into
 *     that component for the same reason.
 *   - **A one-word lower-case name votes for nothing.** It carries no separator
 *     and no capital, so it is evidence of no convention at all — and letting it
 *     vote would elect a house style out of names that never had one.
 *
 * The suggestion is always the **predictable form**: `Base + Qualifier`, spelled
 * in the dominant convention. The base is the word the codebase reuses most and
 * never a variant word, because a qualifier is the part that changes. And it
 * stays a suggestion: this module records a rename against the design system and
 * has no write call in it, because renaming code is `apply`'s PRD-gated work.
 */

import { componentNameFor } from './codegen.js';
import { namesForComponent, scanMarkup, wordsIn } from './candidates.js';
import { VARIANTS } from './create.js';
import {
  consistencyLimit,
  conventionVotes,
  namingConventions,
  namingSeverityFor,
} from './tokenise-spec.js';

/** The sentence every naming finding is read under, and never without. */
export const NAMING_CAVEAT =
  'names are compared on their exact word sets, so `btn` and `Button` are two concepts here — resolving abbreviations means a dictionary, and a dictionary means guessing';

const VARIANT_WORDS = new Set(VARIANTS);

/**
 * How a name is written, tested in the order the table declares.
 *
 * The rows overlap by construction — BEM is kebab with two more separators, and
 * `Button` is Pascal case and one capitalised word at the same time — so the
 * order is the contract and the first match wins. A name that matches nothing
 * (`Button/Primary`, `text-[12px]`) is classified as null, which is how the pass
 * says a name is not in a convention it knows rather than that it is in the
 * wrong one.
 */
const SHAPES = {
  bem: (name) =>
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(
      name,
    ) && /__|--/.test(name),
  upper: (name) => /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(name) && name.length > 1,
  pascal: (name) => /^[A-Z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/.test(name),
  camel: (name) => /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/.test(name),
  snake: (name) => /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(name),
  kebab: (name) => /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(name),
  lower: (name) => /^[a-z][a-z0-9]*$/.test(name),
};

/** Which convention a name is written in, or null when it is in none of them. */
export function conventionOf(name) {
  const raw = String(name ?? '').trim();
  if (raw === '') return null;
  for (const convention of namingConventions()) {
    const shape = SHAPES[convention];
    if (shape && shape(raw)) return convention;
  }
  return null;
}

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/** The same words, written the way this convention writes them. */
export function spellIn(words, convention) {
  const parts = words.filter(Boolean);
  if (parts.length === 0) return '';
  if (convention === 'pascal') return parts.map(capitalise).join('');
  if (convention === 'camel') return parts[0] + parts.slice(1).map(capitalise).join('');
  if (convention === 'snake') return parts.join('_');
  if (convention === 'upper') return parts.join('_').toUpperCase();
  if (convention === 'kebab') return parts.join('-');
  if (convention === 'bem') {
    return parts.length > 1 ? `${parts[0]}--${parts.slice(1).join('-')}` : parts[0];
  }
  // `lower` is the one-word convention, so joining is the only spelling of it
  // that can come up, and a name that reached here with two words has nowhere
  // else to put the separator.
  return parts.join('');
}

/**
 * The words of a name, base first.
 *
 * A base is the part that does not change and a qualifier is the part that
 * does, so the base is the word the codebase reuses across the most names, and
 * a variant word — `primary`, `small`, `ghost`, the list `create` already keeps
 * for exactly this distinction — is never a base. Ties keep the order the name
 * was written in, which is what makes `Base + Qualifier` come out the same way
 * on every run.
 */
export function baseFirst(words, frequency = new Map()) {
  const parts = [...words];
  if (parts.length < 2) return parts;
  const pool = parts.filter((word) => !VARIANT_WORDS.has(word));
  const candidates = pool.length > 0 ? pool : parts;
  let base = candidates[0];
  for (const word of candidates) {
    if ((frequency.get(word) ?? 0) > (frequency.get(base) ?? 0)) base = word;
  }
  const rest = parts.filter((word) => word !== base);
  return [base, ...rest];
}

/** One finding, in the vocabulary every other family already uses. */
function finding(rule, value, detail, evidence = []) {
  return { rule, severity: namingSeverityFor(rule), value, detail, evidence };
}

// ---------------------------------------------------------------------------
// The names
// ---------------------------------------------------------------------------

const isComponentTag = (element) => /^[A-Z]/.test(element);

/**
 * Every name the scan can see, with how often it is written and where.
 *
 * Three sources, two kinds. Class names and component tags come out of the
 * markup scan; the components `DESIGN-SYSTEM.md` registers come out of the
 * model, because a name the system holds is a name the project has committed
 * to whether or not any file happens to use it yet.
 *
 * The fold is the part that matters. `classNameFor('Button/Primary')` is
 * `button-primary`, so a codebase doing exactly what Phyllum asked for would
 * otherwise be reported as spelling one concept two ways. Every spelling of a
 * registered component is attributed to that component instead.
 */
export function collectNames(signatures = [], model = null) {
  const registered = [];
  for (const component of model?.components ?? []) {
    registered.push({
      name: componentNameFor(component.name),
      source: component.name,
      spellings: namesForComponent(component.name),
    });
  }

  const names = new Map();
  const add = (surface, kind, count, file, source = null) => {
    const key = `${kind}|${surface}`;
    const entry =
      names.get(key) ?? { surface, kind, count: 0, files: [], words: wordsIn(surface), source };
    entry.count += count;
    if (file && !entry.files.includes(file)) entry.files.push(file);
    names.set(key, entry);
  };

  for (const row of registered) {
    add(row.name, 'component', 0, null, row.source);
  }

  const registeredFor = (spelling) =>
    registered.find((row) => row.spellings.has(String(spelling).toLowerCase())) ?? null;

  for (const signature of signatures) {
    const file = signature.files?.[0] ?? null;
    if (isComponentTag(signature.element)) {
      const known = registeredFor(signature.element);
      add(known ? known.name : signature.element, 'component', signature.count, file, known?.source);
    }
    for (const className of signature.classes ?? []) {
      const known = registeredFor(className);
      if (known) {
        add(known.name, 'component', signature.count, file, known.source);
        continue;
      }
      add(className, 'class', signature.count, file);
    }
  }

  // Sorted before capped, as everywhere else: the cap drops the tail of a long
  // codebase rather than an arbitrary three hundred names out of the middle.
  return [...names.values()].sort(
    (a, b) => b.count - a.count || a.surface.localeCompare(b.surface),
  );
}

/** How many distinct names each word turns up in — what decides a base. */
export function wordFrequency(names) {
  const counts = new Map();
  for (const name of names) {
    for (const word of new Set(name.words)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// The dominant convention
// ---------------------------------------------------------------------------

/**
 * Which convention this population of names mostly uses, if any.
 *
 * Two guards, and both are the difference between a convention and a
 * coincidence. A population too small to be evidence elects nothing, and a
 * leader that does not hold the majority share elects nothing either — a
 * codebase split evenly between two styles has not chosen one, and the honest
 * report of that is "no dominant convention", not a winner by one vote.
 *
 * A tie is broken by the order the table declares, so the answer is the same on
 * every run over the same codebase.
 */
export function dominantConvention(names) {
  const order = namingConventions();
  const counts = new Map();
  let voters = 0;
  for (const name of names) {
    // A name is classified by its own shape and counted towards the convention
    // that shape is evidence for, which are two different questions whenever a
    // convention is a spelling of another one.
    const votesFor = conventionVotes(conventionOf(name.surface));
    if (!votesFor) continue;
    counts.set(votesFor, (counts.get(votesFor) ?? 0) + 1);
    voters += 1;
  }

  const minimum = consistencyLimit('convention evidence');
  const majority = consistencyLimit('convention majority');
  const tally = order
    .filter((convention) => counts.has(convention))
    .map((convention) => ({ convention, votes: counts.get(convention) }));

  let leader = null;
  for (const row of tally) {
    if (!leader || row.votes > leader.votes) leader = row;
  }

  const share = leader && voters > 0 ? leader.votes / voters : 0;
  const decided = Boolean(leader) && voters >= minimum && share >= majority;
  return {
    convention: decided ? leader.convention : null,
    decided,
    voters,
    share: Math.round(share * 100) / 100,
    tally,
    reason: decided
      ? null
      : voters === 0
        ? 'no name here carries a convention at all, so there is nothing to be dominant'
        : voters < minimum
          ? `only ${voters} name${voters === 1 ? '' : 's'} here carr${voters === 1 ? 'ies' : 'y'} a convention, and ${minimum} are needed before one is called dominant`
          : 'no one convention holds the majority, so this codebase has not chosen a house style yet',
  };
}

// ---------------------------------------------------------------------------
// The two readings
// ---------------------------------------------------------------------------

const label = (kind) => (kind === 'component' ? 'component' : 'class');

const where = (name) =>
  `${name.surface} used ${name.count}× (${name.files[0] ?? 'DESIGN-SYSTEM.md'}${name.files.length > 1 ? ` +${name.files.length - 1} more` : ''})`;

/**
 * One concept, spelled more than once.
 *
 * Grouped by kind and by word set, so the group is exactly "the names made of
 * these words". A group of one is the ordinary case and reported as nothing at
 * all; a group of two or more is the finding, and the suggestion is the
 * predictable spelling of the group's own words in the group's own convention.
 */
export function namingDrift(names, conventions, frequency) {
  const groups = new Map();
  for (const name of names) {
    if (name.words.length === 0) continue;
    const key = `${name.kind}|${[...name.words].sort().join('.')}`;
    const group = groups.get(key) ?? { kind: name.kind, members: [] };
    group.members.push(name);
    groups.set(key, group);
  }

  const rows = [];
  for (const group of groups.values()) {
    const members = group.members.sort(
      (a, b) => b.count - a.count || a.surface.localeCompare(b.surface),
    );
    if (new Set(members.map((member) => member.surface)).size < 2) continue;

    const orders = new Set(members.map((member) => member.words.join('.')));
    const shape = orders.size > 1 ? 'order' : 'case';
    const convention = conventions[group.kind]?.convention ?? conventionOf(members[0].surface);
    const suggested = spellIn(baseFirst(members[0].words, frequency), convention ?? 'kebab');
    const total = members.reduce((sum, member) => sum + member.count, 0);

    rows.push({
      ...finding(
        'naming-drift',
        members.map((member) => member.surface).join(' / '),
        shape === 'order'
          ? `one ${label(group.kind)} concept in two word orders — the predictable form is \`${suggested}\``
          : `one ${label(group.kind)} concept in two cases — the predictable form is \`${suggested}\``,
        members.map(where),
      ),
      kind: group.kind,
      drift: shape,
      forms: members.map((member) => member.surface),
      suggested,
      convention: convention ?? null,
      count: total,
    });
  }

  return rows.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * The names that are not written the way this codebase writes names.
 *
 * A name already reported as drift is skipped: it is the same problem said
 * twice, and two findings about one name is one finding too many — the same
 * rule that keeps a drifted token from being reported as stale as well.
 */
export function conventionStrays(names, conventions, frequency, drifted = new Set()) {
  const rows = [];
  for (const name of names) {
    const dominant = conventions[name.kind];
    if (!dominant?.decided) continue;
    if (drifted.has(`${name.kind}|${name.surface}`)) continue;
    const convention = conventionOf(name.surface);
    const votesFor = conventionVotes(convention);
    // A name that abstains from the vote is never a stray either: a shape that
    // is evidence of no convention cannot be evidence against one.
    if (!votesFor || votesFor === dominant.convention) continue;

    const suggested = spellIn(baseFirst(name.words, frequency), dominant.convention);
    rows.push({
      ...finding(
        'naming-convention',
        name.surface,
        `this codebase writes ${label(name.kind)} names in ${dominant.convention}, and this one is ${convention} — the predictable form is \`${suggested}\``,
        [where(name)],
      ),
      kind: name.kind,
      convention,
      dominant: dominant.convention,
      suggested,
      count: name.count,
    });
  }
  return rows.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

/**
 * The naming half of the consistency check: drift, then strays.
 *
 * The markup half is React-only in v0.2.1, for the reason the component pass is,
 * and it says the question was not asked rather than answering it as "nothing
 * found". The registered names are read on every stack, because
 * `DESIGN-SYSTEM.md` is Phyllum's own file and reads the same everywhere.
 */
export function assessNaming(root, model, components = {}, options = {}) {
  const markupChecked = Boolean(components.ran);
  const signatures = markupChecked ? scanMarkup(root, options) : [];
  const all = collectNames(signatures, model);
  const cap = consistencyLimit('names');
  const names = all.slice(0, cap);
  const frequency = wordFrequency(names);

  const conventions = {
    class: dominantConvention(names.filter((name) => name.kind === 'class')),
    component: dominantConvention(names.filter((name) => name.kind === 'component')),
  };

  const drift = namingDrift(names, conventions, frequency);
  const drifted = new Set(
    drift.flatMap((row) => row.forms.map((form) => `${row.kind}|${form}`)),
  );
  const strays = conventionStrays(names, conventions, frequency, drifted);

  return {
    caveat: NAMING_CAVEAT,
    markupChecked,
    markupReason: markupChecked ? null : (components.reason ?? null),
    caps: { names: cap },
    compared: { names: names.length, namesFound: all.length, namesCapped: all.length > cap },
    conventions,
    drift,
    strays,
    findings: [...drift, ...strays],
  };
}
