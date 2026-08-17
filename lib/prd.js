/**
 * `apply`'s PRD — the plan, the whole plan, and nothing but the plan (v0.2.0 §6.5).
 *
 * `apply` is the first Phyllum command that will ever change somebody's source
 * code, and the line it crosses is guarded by one artefact: this file's output.
 * Step one writes a plan and executes nothing. Step two (`apply run`, M7) reads
 * the plan back and executes it. So the PRD is not a report — it is a **contract
 * between two milestones**, and every marker in it exists because M7 has to find
 * it again.
 *
 * Three ideas shape the format:
 *
 *   1. **One change, one criterion.** Every raw-value→token replacement and
 *      every component adoption is its own numbered, tickable line naming the
 *      file, the literal, the replacement, and how to check it. A plan whose
 *      criteria are prose is a plan nobody can verify.
 *   2. **One phase, one commit.** Changes are grouped into phases; M7 lands each
 *      phase as its own commit once that phase's criteria pass *and* the host
 *      project's own test suite passes (plan §6.5.3). The grouping is by kind —
 *      colours, then numbers, then typography, then one phase per component —
 *      because a commit should be one kind of mechanical edit, and because a
 *      component's recorded spec references tokens, so the tokens go first.
 *   3. **What is not being done, and why.** A literal no token names, a value
 *      whose role could not be read, a component whose spec still has a `TODO`:
 *      all of it is listed with its reason. `TODO` means *do not generate* — so a
 *      TODO component appears in the PRD as an exclusion with a reason, never as
 *      a silently missing change.
 *
 * The derivation reads two inputs and invents nothing: `DESIGN-SYSTEM.md` says
 * what to apply, and the `assess` result says where the raw literals are. A
 * literal the design system does not name is out of scope by construction —
 * there is nothing to replace it with, and `apply` will not choose a name.
 *
 * Nothing in this module writes. The one write lives in `apply-command.js`, goes
 * through the funnel, and lands on `.phyllum/PRD.md`.
 */

import { isCustomArchetype } from './archetypes.js';
import { archetypeForSignature, scanMarkup, wordsIn } from './candidates.js';
import { classNameFor, componentNameFor } from './codegen.js';
import { normaliseValue, toPx } from './tokenise.js';
import { existingTokenFor } from './tokenise-prose.js';
import { appliesToFor, componentPassRuns } from './tokenise-spec.js';
import { DESIGN_SYSTEM_FILE, PRD_FILE } from './write.js';

// ---------------------------------------------------------------------------
// The marker contract — every string M7 parses, in one place
// ---------------------------------------------------------------------------

export const PRD_TITLE = '# Phyllum apply — PRD';
export const PRD_WARNING =
  '> Phyllum wrote this plan and executed none of it. Read it, edit it, then run `phyllum apply run`.';

export const HEADING_GOAL = '## Goal';
export const HEADING_HARNESS = '## Harness';
export const HEADING_GUARANTEES = '## Execution guarantees';
export const HEADING_PHASES = '## Phases';
export const HEADING_OUT_OF_SCOPE = '## Out of scope';
export const HEADING_NOTES = '## Notes';

/** The section the user owns. Phyllum seeds it once and never rewrites it. */
export const NOTES_PLACEHOLDER =
  '_Yours. Anything you write here survives every `phyllum apply` re-run._';

/** `### Phase 3 — Number tokens` */
export const PHASE_HEADING = /^###\s+Phase\s+(\d+)\s+—\s+(.+?)\s*$/;
/** `- [x] Phase 3 complete` — the resume marker M7 ticks. */
export const PHASE_STATUS = /^-\s+\[([ xX])\]\s+Phase\s+(\d+)\s+complete\s*$/;
/** `- [ ] **AC-3.1** · file: `…` · literal: `…` · becomes: … · check: …` */
export const CRITERION = /^-\s+\[([ xX])\]\s+\*\*(AC-\d+\.\d+)\*\*\s*·\s*(.+?)\s*$/;
/** `- Commit: 9f2c1ab` — written by M7 when a phase lands. */
export const PHASE_COMMIT = /^-\s+Commit:\s*(\S+)\s*$/;
/** `- Stopped: <why>` — written by M7 when a phase fails. */
export const PHASE_STOPPED = /^-\s+Stopped:\s*(.+?)\s*$/;
/** `#### Verification — Phase 3` */
export const VERIFICATION_HEADING = /^####\s+Verification\s+—\s+Phase\s+(\d+)\s*$/;
/** `- Harness: Claude Code` in the header block. */
export const HEADER_FIELD = /^-\s+([A-Z][A-Za-z0-9 ’']*):\s*(.*)$/;

/** Criterion fields are ` · `-separated `key: value` pairs. */
export const FIELD_SEPARATOR = ' · ';

export const STATUS_NOT_STARTED = 'not started';
export const STATUS_IN_PROGRESS = 'in progress';
export const STATUS_COMPLETE = 'complete';

export { PRD_FILE };

// ---------------------------------------------------------------------------
// Deriving the changes
// ---------------------------------------------------------------------------

const backtick = (value) => `\`${value}\``;
/** No field value may contain the separator, or the grammar would be ambiguous. */
const safeField = (value) => String(value).split(FIELD_SEPARATOR).join(' / ');
const listProperties = (properties) =>
  properties.length === 0 ? 'affected' : properties.map(backtick).join(', ');

/** The recorded value of a named token, so a near-identical match can say so. */
function tokenValueFor(model, name) {
  for (const key of ['colours', 'numbers', 'typography']) {
    const row = (model?.tokens?.[key] ?? []).find((item) => item[0] === name);
    if (row) return { value: row[1], section: key };
  }
  return null;
}

/** Does any token name this value at all, whatever role it was recorded for? */
function namedForAnotherRole(literal, model) {
  const px = toPx(literal);
  const row = (model?.tokens?.numbers ?? []).find(
    (item) =>
      normaliseValue(item[1]) === normaliseValue(literal) ||
      (px !== null && toPx(item[1]) !== null && toPx(item[1]) === px),
  );
  return row ? { name: row[0], appliesTo: row[2] } : null;
}

/** One inventory row's member, as a candidate `existingTokenFor` understands. */
const candidateFor = (row, member) => ({
  pass: row.pass,
  role: row.role ?? undefined,
  value: member.value,
  size: member.value,
});

/**
 * Every raw-value→token replacement the design system authorises — and every
 * literal it does not.
 *
 * The important design decision is the **granularity**: resolution happens per
 * literal, not per cluster. `assess` clusters near-identical values into one
 * decision, which is the right shape for a review and the wrong shape for a
 * plan — a cluster of `11px` and `12px` has one representative, and a criterion
 * that told an executor to replace "the cluster" would name a literal that is
 * not in the file. So each member of each row is resolved on its own, through
 * `existingTokenFor` — the same predicate `assess` and `tokenise` use, so there
 * is no second answer to "which token names this?".
 *
 * Resolution has exactly two steps, and the second is why clustering still earns
 * its place:
 *
 *   1. The literal's **own** token, matched on value and role. `12px` on
 *      `border-radius` is `rounded-md`; `12px` on `padding` is not, because a
 *      token records what it applies to and `apply` never repurposes one across
 *      roles.
 *   2. Failing that, a token that names a **near-identical sibling** in the same
 *      cluster. `#2564EC` beside a named `#2563EB` is drift, and closing it is
 *      the whole point — but the criterion says so in a `note`, because the
 *      rendered value changes and the reviewer is entitled to refuse.
 *
 * Anything neither step resolves is returned as `unnamed`, with the reason
 * spelled out. It is never named here.
 */
export function tokenChanges(assessment, model) {
  const changes = [];
  const unnamed = [];
  const seen = new Set();

  for (const row of assessment?.values?.inventory ?? []) {
    const members = row.members ?? [];

    // Step 1 — every member that resolves on its own.
    const resolved = new Map();
    for (const member of members) {
      const token = existingTokenFor(candidateFor(row, member), model);
      if (token) resolved.set(member, token.name);
    }
    // Step 2 — the cluster's own answer, for members that did not resolve.
    const sibling = [...resolved.values()][0] ?? null;

    for (const member of members) {
      const literal = String(member.value ?? '');
      if (literal === '') continue;
      const own = resolved.get(member) ?? null;
      const token = own ?? sibling;
      const properties = member.properties ?? row.properties ?? [];
      const files = member.files ?? row.files ?? [];

      if (!token) {
        const elsewhere = row.pass === 'numbers' ? namedForAnotherRole(literal, model) : null;
        unnamed.push({
          value: literal,
          pass: row.pass,
          role: row.role ?? null,
          properties,
          files,
          reason: elsewhere
            ? `${backtick(elsewhere.name)} names ${backtick(literal)}, but it was recorded for ${backtick(elsewhere.appliesTo)} and this literal is a ${backtick(appliesToFor(row.role ?? 'spacing'))} value — \`apply\` never repurposes a token across roles, so \`phyllum assess\` names this one first`
            : 'no token in DESIGN-SYSTEM.md names this value, so there is nothing to replace it with — `phyllum assess` names it, then re-run `phyllum apply`',
        });
        continue;
      }

      const recorded = tokenValueFor(model, token);
      for (const file of files) {
        const key = `token|${file}|${normaliseValue(literal)}|${token}`;
        if (seen.has(key)) continue;
        seen.add(key);
        changes.push({
          kind: 'token',
          key,
          pass: row.pass,
          role: row.role ?? null,
          file,
          literal,
          token,
          tokenValue: recorded?.value ?? null,
          section: recorded?.section ?? row.pass,
          properties,
          exact: own !== null,
          occurrences: member.count ?? row.count ?? 1,
        });
      }
    }
  }

  return {
    changes: changes.sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.token.localeCompare(b.token) ||
        a.literal.localeCompare(b.literal),
    ),
    unnamed: unnamed.sort((a, b) => String(a.value).localeCompare(String(b.value))),
  };
}

// ---------------------------------------------------------------------------
// Component adoption
// ---------------------------------------------------------------------------

/** The YAML spec block of a recorded component, or null. */
export function specOf(component) {
  const block = (component?.blocks ?? []).find((item) => item.lang === 'yaml');
  return block ? block.content : null;
}

/**
 * A recorded component, read as `apply` needs it: its name, its archetype, its
 * variant word, and whether its spec still has unfilled slots.
 *
 * A `TODO` in a spec is the user having said "I don't know yet", and Phyllum's
 * standing rule is that a TODO is never a guess. So a component with one is
 * excluded from the PRD with that as the stated reason — it is not adopted into
 * code half-specified, and it is not quietly dropped either.
 */
export function readComponent(component) {
  const spec = specOf(component) ?? '';
  const archetype = spec.match(/^archetype:\s*(\S+)\s*$/m)?.[1]?.toLowerCase() ?? null;
  const name = String(component.name ?? '');
  const variant = name.includes('/') ? name.split('/').slice(-1)[0] : 'Default';
  const todoSlots = [...spec.matchAll(/^\s*([A-Za-z0-9_-]+):\s*TODO\s*$/gm)].map((match) => match[1]);
  return {
    name,
    archetype,
    // A custom follows no archetype contract (v0.3.0 §6.7), so nothing here may
    // grade it against one — including the markup match below.
    custom: isCustomArchetype(archetype) || /^custom:\s*true\s*$/m.test(spec),
    variant,
    spec,
    hasTodo: /\bTODO\b/.test(spec),
    todoSlots,
    className: classNameFor(name),
    elementName: componentNameFor(name),
  };
}

/**
 * Is this markup site already the recorded component rather than a copy of it?
 *
 * The adoption pass skips such a site: there is nothing to change where the
 * component is already the component. Since v0.5.0 that same skip is the whole
 * evidence behind the `applied` flag (§3.1), so it is exported rather than
 * private — `lib/applied.js` imports it, and there is no second detector to
 * disagree with this one about what "already this component" means.
 */
export function alreadyAdopted(signature, recorded) {
  if (String(signature.element) === recorded.elementName) return true;
  return signature.classes.some((className) => className.toLowerCase() === recorded.className);
}

/**
 * Does this markup site look like the component the design system records?
 *
 * The rule reuses `create`'s own signals table rather than inventing a second
 * one: the signature is mapped to an archetype exactly as the candidate scan
 * maps it, and it matches a recorded component when the archetypes agree and —
 * when the component names a variant — the site's words carry that variant word
 * too. `Button/Primary` therefore claims `btn btn--primary`, and leaves
 * `btn btn--ghost` to `Button/Ghost`.
 */
export function adoptionMatch(signature, recorded) {
  if (!recorded.archetype) return false;
  // A custom claims no archetype, and the match is an archetype comparison. So
  // there is nothing here to compare, and Phyllum says nothing rather than
  // guessing which markup a bespoke component was supposed to be.
  if (recorded.custom) return false;
  const hit = archetypeForSignature(signature);
  if (!hit?.archetype || hit.archetype.key !== recorded.archetype) return false;
  if (recorded.variant.toLowerCase() === 'default') return true;
  const words = new Set([...signature.classes.flatMap(wordsIn), ...wordsIn(signature.element)]);
  return words.has(recorded.variant.toLowerCase());
}

/**
 * Every component adoption the design system authorises, plus the components it
 * cannot authorise and why.
 *
 * React only, like the rest of component detection in v0.2.0 (plan §9) — and on
 * any other stack the PRD says the adoption pass did not run rather than
 * implying there was nothing to adopt.
 */
export function componentChanges(root, model, assessment) {
  const detection = assessment?.detection ?? {};
  const recordedAll = (model?.components ?? []).map(readComponent);
  const excluded = recordedAll
    .filter((recorded) => recorded.hasTodo)
    .map((recorded) => ({
      component: recorded.name,
      reason:
        recorded.todoSlots.length > 0
          ? `its recorded spec still has ${recorded.todoSlots.map(backtick).join(', ')} set to TODO — a TODO means do not generate, so nothing is written for it`
          : 'its recorded spec still carries a TODO — a TODO means do not generate, so nothing is written for it',
    }));

  if (!componentPassRuns(detection.frameworkId)) {
    return {
      ran: false,
      reason:
        detection.empty === true
          ? 'there is nothing here to read yet, so no adoption pass ran'
          : `component adoption is React-only in v0.2.0, and this looks like ${detection.framework ?? 'another stack'} — the token replacements above are unaffected`,
      changes: [],
      excluded,
      unrecorded: (assessment?.components?.candidates ?? []).map((candidate) => ({
        pattern: candidate.signature,
        looksLike: candidate.name,
        files: candidate.files,
      })),
    };
  }

  const recorded = recordedAll.filter((item) => !item.hasTodo && item.archetype);
  const changes = [];
  const seen = new Set();

  for (const signature of scanMarkup(root)) {
    for (const component of recorded) {
      if (!adoptionMatch(signature, component)) continue;
      if (alreadyAdopted(signature, component)) continue;
      for (const file of signature.files ?? []) {
        const key = `component|${file}|${signature.signature}|${component.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        changes.push({
          kind: 'component',
          key,
          file,
          pattern: signature.signature,
          component: component.name,
          className: component.className,
          elementName: component.elementName,
          occurrences: signature.count ?? 1,
        });
      }
    }
  }

  return {
    ran: true,
    reason: null,
    changes: changes.sort(
      (a, b) => a.component.localeCompare(b.component) || a.file.localeCompare(b.file) || a.pattern.localeCompare(b.pattern),
    ),
    excluded,
    unrecorded: (assessment?.components?.candidates ?? []).map((candidate) => ({
      pattern: candidate.signature,
      looksLike: candidate.name,
      files: candidate.files,
    })),
  };
}

// ---------------------------------------------------------------------------
// Phases — one phase, one commit
// ---------------------------------------------------------------------------

// One row per phase, and a phase can cover more than one pass: shadows and
// borders are read by passes of their own (v0.2.1 §3.1) but they are lengths
// with a job, so they belong in the same commit as the other lengths rather
// than in two phases of their own that a reviewer would read as one anyway.
const PASS_PHASES = [
  { passes: ['colours'], title: 'Colour tokens' },
  { passes: ['numbers', 'shadows', 'borders'], title: 'Number tokens' },
  { passes: ['typography'], title: 'Typography tokens' },
];

const PASS_RATIONALE = {
  colours: 'Every colour literal the design system already names, replaced in one pass. Colours are the safest edit in the set — a named colour is the same colour — so they lead, and a reviewer can read the whole commit as one substitution.',
  numbers:
    'Lengths next: spacing, radii and borders. They come after colours because a length carries a role — a 12px radius and a 12px padding are different facts — so this commit is worth reading on its own rather than mixed in with colours.',
  typography:
    'Type last of the token phases, because a typography token carries three facts at once (size, weight, line-height) and a mistake here is the most visible one on the page.',
};

/**
 * Group the changes into phases.
 *
 * By kind, then by component. The alternative — grouping by file — was rejected
 * on purpose: a file-shaped commit mixes colour, length and markup edits, so a
 * failing phase tells you which *file* broke rather than which *kind of change*
 * broke, and that is the less useful half of the answer. Tokens precede
 * components because a recorded component's properties reference tokens, so
 * adopting a component after its tokens exist in the code is the only order in
 * which the second half can be verified.
 */
export function buildPhases({ tokens = [], components = [] } = {}) {
  const phases = [];

  for (const group of PASS_PHASES) {
    const changes = tokens.filter((change) => group.passes.includes(change.pass));
    if (changes.length === 0) continue;
    phases.push({
      title: group.title,
      rationale: PASS_RATIONALE[group.passes[0]],
      changes,
      done: false,
    });
  }

  const byComponent = new Map();
  for (const change of components) {
    if (!byComponent.has(change.component)) byComponent.set(change.component, []);
    byComponent.get(change.component).push(change);
  }
  for (const [component, changes] of byComponent) {
    phases.push({
      title: `Adopt ${component}`,
      rationale: `One component, one commit. Adopting ${backtick(component)} changes markup as well as styling, which is the riskiest edit in the plan, so it is isolated: if it has to be reverted, nothing else goes with it.`,
      changes,
      done: false,
    });
  }

  return phases.map((phase, index) => ({
    ...phase,
    number: index + 1,
    changes: phase.changes.map((change, position) => ({
      ...change,
      id: `AC-${index + 1}.${position + 1}`,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Criteria — the ` · `-separated grammar
// ---------------------------------------------------------------------------

/** One change, as the fields M7 parses back out. */
export function criterionFields(change) {
  if (change.kind === 'component') {
    return [
      ['file', backtick(change.file)],
      ['pattern', backtick(change.pattern)],
      ['becomes', `component ${backtick(change.component)}`],
      [
        'check',
        `in ${backtick(change.file)}, every ${backtick(change.pattern)} site renders the recorded ${backtick(change.component)} (its element ${backtick(`<${change.elementName}>`)} or its class ${backtick(change.className)}), and its styling comes from the component's recorded properties rather than raw values at the site.`,
      ],
    ];
  }

  const properties = listProperties(change.properties ?? []);
  const fields = [
    ['file', backtick(change.file)],
    ['literal', backtick(change.literal)],
    ['becomes', `token ${backtick(change.token)}`],
    [
      'check',
      `in ${backtick(change.file)}, every ${properties} value of ${backtick(change.literal)} reads the ${backtick(change.token)} token instead, and no raw ${backtick(change.literal)} is left on those properties.`,
    ],
  ];
  if (change.exact === false && change.tokenValue) {
    fields.push([
      'note',
      `${backtick(change.literal)} is near-identical to the token's ${backtick(change.tokenValue)}, not equal — this replacement changes the rendered value, which is the point of a token and is called out here so the review can refuse it.`,
    ]);
  }
  return fields;
}

export function renderCriterion(change, { done = false } = {}) {
  const fields = criterionFields(change)
    .map(([key, value]) => `${key}: ${safeField(value)}`)
    .join(FIELD_SEPARATOR);
  return `- [${done ? 'x' : ' '}] **${change.id}**${FIELD_SEPARATOR}${fields}`;
}

/** Parse a rendered criterion's fields back into an object. */
export function parseCriterionFields(text) {
  const fields = {};
  for (const segment of String(text).split(FIELD_SEPARATOR)) {
    const match = segment.match(/^([a-z]+):\s*([\s\S]*)$/);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

// ---------------------------------------------------------------------------
// The PRD object
// ---------------------------------------------------------------------------

/**
 * Build the plan.
 *
 * `harness` and `tests` come from `lib/harness-detect.js`; `assessment` from
 * `assess`. Nothing here scans a second time except the markup pass adoption
 * needs, which `assess` does not produce because its candidate scan answers the
 * opposite question (what the system does *not* record).
 */
export function buildPrd({
  root,
  model,
  assessment,
  harness,
  tests,
  version = '0.0.0',
  today = new Date().toISOString().slice(0, 10),
}) {
  const tokens = tokenChanges(assessment, model);
  const components = componentChanges(root, model, assessment);
  const phases = buildPhases({ tokens: tokens.changes, components: components.changes });

  return {
    header: {
      designSystem: DESIGN_SYSTEM_FILE,
      harness: harness.found ? harness.name : 'none detected',
      harnessConfig: harness.config,
      harnessSource: harness.source,
      harnessLayer: harness.layer,
      tests,
      generated: today,
      version,
      changes: tokens.changes.length + components.changes.length,
      phases: phases.length,
      status: STATUS_NOT_STARTED,
    },
    phases,
    tokens,
    components,
    outOfScope: outOfScope(assessment, tokens, components),
    notes: null,
  };
}

/**
 * What `apply` will not do, and why for each thing.
 *
 * This section is the honest half of the plan. A literal with no token, a value
 * whose role could not be read, a pattern the design system has never been told
 * about, a component whose spec still says TODO: each is a real thing in the
 * codebase that this plan deliberately leaves alone, and each names the command
 * that would change that.
 */
export function outOfScope(assessment, tokens, components) {
  const values = assessment?.values ?? {};
  return {
    // The unnamed list comes from the derivation, not from `assess`'s uncovered
    // bucket: the derivation resolves per literal, so it knows about a `12px`
    // that is named for one role and unnamed for another — a distinction a
    // cluster-level bucket cannot draw.
    unnamed: tokens.unnamed,
    unreadable: (values.unreadable ?? []).map((row) => ({
      value: row.value,
      properties: row.properties ?? [],
      files: row.files ?? [],
      reason:
        'it is plainly a colour or a length, but it is written on a property no table gives a meaning to — Phyllum will not guess the role, so it will not guess the token either',
    })),
    todoComponents: components.excluded,
    unrecordedPatterns: components.unrecorded,
    adoptionRan: components.ran,
    adoptionReason: components.reason,
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const HEADER_LABELS = [
  ['Design system', (header) => header.designSystem],
  ['Harness', (header) => header.harness],
  ['Harness config', (header) => header.harnessConfig ?? '—'],
  ['Harness evidence', (header) => header.harnessSource ?? 'none — this is the simple PRD shape'],
  [
    'Host test suite',
    (header) => (header.tests?.found ? `${header.tests.command} (${header.tests.evidence})` : 'none detected'),
  ],
  ['Generated', (header) => header.generated],
  ['Phyllum version', (header) => header.version],
  ['Changes', (header) => String(header.changes)],
  ['Phases', (header) => String(header.phases)],
  ['Status', (header) => header.status],
];

function goalLines(prd) {
  const { header } = prd;
  return [
    `Apply the design system recorded in ${backtick(DESIGN_SYSTEM_FILE)} to this codebase: every raw value the`,
    'design system already names becomes a reference to that token, and every ad-hoc pattern that',
    'matches a recorded component becomes that component.',
    '',
    `There are **${header.changes} changes** in **${header.phases} phases**, and each change below has its own`,
    'acceptance criterion naming the file, the literal, what it becomes, and how to check it. Nothing',
    'in this plan has been executed.',
    '',
    'What is *not* here matters as much as what is: a value no token names is listed under',
    `${backtick('Out of scope')} with its reason, never quietly skipped, and never named by ${backtick('apply')} on your`,
    'behalf.',
  ];
}

function harnessLines(prd) {
  const { header } = prd;
  if (!header.harnessConfig && header.harnessLayer === 'none') {
    return [
      'No agent harness was detected in this project, so this is the **simple PRD**: plain Markdown,',
      'explicit per-phase instructions, and no assumptions about who executes it. Any harness — or a',
      'person — can read it top to bottom.',
      '',
      'Detection looked, in order, for the project\'s own agent config (`CLAUDE.md`, `AGENT.md`,',
      '`AGENTS.md` and the other recognisable config files), then a harness preference recorded in',
      '`.phyllum/`, then agent memory. None was found — which is a supported answer, not a problem.',
    ];
  }
  return [
    `Detected harness: **${header.harness}**, from ${header.harnessSource}.`,
    '',
    'The phases below are written as explicit instructions so this harness can execute them natively:',
    'one phase at a time, in order, each finishing with its own commit. The precedence that picked it',
    "is the project's own agent config first, then a `.phyllum/` preference, then agent memory — the",
    'codebase speaking for itself outranks anything Phyllum recorded.',
  ];
}

function guaranteeLines(prd) {
  const tests = prd.header.tests;
  return [
    '1. **A separate branch, always.** Nothing is committed to the branch you are standing on.',
    '2. **One phase, one commit.** Each phase below lands as its own commit, tied to the criteria it',
    '   satisfies, so it can be reviewed and reverted on its own.',
    tests?.found
      ? `3. **Per-phase verification.** A phase's commit lands only when every criterion in it passes **and** ${backtick(tests.command)} — this project's own suite — is green.`
      : '3. **Per-phase verification.** A phase\'s commit lands only when every criterion in it passes. No test suite was detected in this project, so the criteria are the whole bar; add a `test` script and re-run `phyllum apply` to have the suite verified too.',
    '4. **Status reports every 5 minutes** while a run is in progress.',
    '5. **Stop and report on failure.** A failing phase halts the run. Completed phases stay as',
    '   commits on the work branch, this file records where execution stopped, and `phyllum apply run`',
    '   resumes from that phase. Nothing is rolled back.',
  ];
}

export function renderPhase(phase) {
  const lines = [`### Phase ${phase.number} — ${phase.title}`, ''];
  lines.push(`- [${phase.done ? 'x' : ' '}] Phase ${phase.number} complete`);
  for (const line of phase.extra ?? []) lines.push(line);
  lines.push('');
  lines.push(phase.rationale, '');
  for (const change of phase.changes) {
    lines.push(renderCriterion(change, { done: change.done === true }));
  }
  lines.push('');
  lines.push(`#### Verification — Phase ${phase.number}`, '');
  for (const line of phase.verification ?? []) lines.push(line);
  lines.push('');
  return lines;
}

function outOfScopeLines(prd) {
  const scope = prd.outOfScope;
  const lines = [];

  lines.push('### Values no token names yet', '');
  if (scope.unnamed.length === 0) {
    lines.push('_None — every raw value the scan found is already named._');
  } else {
    for (const row of scope.unnamed) {
      const where = row.files.slice(0, 3).map(backtick).join(', ') || 'no file recorded';
      const kind = row.role ? `${row.pass}/${row.role}` : row.pass;
      lines.push(`- ${backtick(row.value)} (${kind}, in ${where}) — ${row.reason}`);
    }
  }
  lines.push('');

  lines.push('### Values seen but not read', '');
  if (scope.unreadable.length === 0) {
    lines.push('_None — every value the scan found sits on a property it could read._');
  } else {
    for (const row of scope.unreadable) {
      lines.push(
        `- ${backtick(row.value)} (on ${row.properties.slice(0, 3).map(backtick).join(', ') || 'an unnamed property'}) — ${row.reason}`,
      );
    }
  }
  lines.push('');

  lines.push('### Components with an unfilled spec', '');
  if (scope.todoComponents.length === 0) {
    lines.push('_None — every recorded component has a complete spec._');
  } else {
    for (const row of scope.todoComponents) {
      lines.push(`- ${backtick(row.component)} — ${row.reason}`);
    }
  }
  lines.push('');

  lines.push('### Patterns the design system has never been told about', '');
  if (!scope.adoptionRan) {
    lines.push(`_The adoption pass did not run — ${scope.adoptionReason}._`);
  } else if (scope.unrecordedPatterns.length === 0) {
    lines.push('_None — nothing repeated often enough to look like an unrecorded component._');
  } else {
    for (const row of scope.unrecordedPatterns) {
      lines.push(
        `- ${backtick(row.pattern)} (looks like ${backtick(row.looksLike)}, in ${row.files.slice(0, 3).map(backtick).join(', ')}) — the design system does not record it, so ${backtick('apply')} has no spec to apply; ${backtick('phyllum create')} records it first`,
      );
    }
  }
  lines.push('');

  lines.push('### Always out of scope', '');
  lines.push(
    '- Config files, build output, lockfiles, generated code and documentation. This plan changes',
    '  source styling and markup only.',
    '- Naming anything. `apply` replaces literals with tokens that already exist; it never invents a',
    '  token, a name or a component spec.',
  );

  return lines;
}

/** The PRD as the file on disk. */
export function renderPrd(prd) {
  const out = [PRD_TITLE, '', PRD_WARNING, ''];

  for (const [label, read] of HEADER_LABELS) out.push(`- ${label}: ${read(prd.header)}`);
  out.push('');

  out.push(HEADING_GOAL, '', ...goalLines(prd), '');
  out.push(HEADING_HARNESS, '', ...harnessLines(prd), '');
  out.push(HEADING_GUARANTEES, '', ...guaranteeLines(prd), '');

  out.push(HEADING_PHASES, '');
  if (prd.phases.length === 0) {
    out.push('_Nothing to apply — see `Out of scope` for why._', '');
  } else {
    for (const phase of prd.phases) out.push(...renderPhase(phase));
  }

  out.push(HEADING_OUT_OF_SCOPE, '', ...outOfScopeLines(prd), '');
  out.push(HEADING_NOTES, '', prd.notes ?? NOTES_PLACEHOLDER, '');

  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

/**
 * The per-phase verification block. Separated from `renderPhase` because the
 * host test suite is a project fact, not a phase fact, and every phase states
 * the same bar: its own criteria, then the project's own suite.
 */
export function verificationLines(phase, tests) {
  const lines = [
    `- Every criterion AC-${phase.number}.1 … AC-${phase.number}.${phase.changes.length} in this phase is ticked and was checked as written.`,
    '- `git diff` for this phase touches only the files named in the criteria above.',
  ];
  if (tests?.found) {
    lines.push(`- ${backtick(tests.command)} is green — this project's own suite, run in full, not a subset.`);
  } else {
    lines.push(
      '- No test suite was detected in this project, so the criteria above are the whole bar for this phase.',
    );
  }
  lines.push(
    '- On failure: stop, leave the completed phases committed, record the reason on this phase as `- Stopped: <why>`, and report.',
  );
  return lines;
}

/** Fill in every phase's verification block from the detected test suite. */
export function withVerification(prd) {
  return {
    ...prd,
    phases: prd.phases.map((phase) => ({
      ...phase,
      verification: verificationLines(phase, prd.header.tests),
    })),
  };
}

// ---------------------------------------------------------------------------
// Parse — how M7, and the resume path, read the file back
// ---------------------------------------------------------------------------

/**
 * Read a PRD file into the shape the resume path needs.
 *
 * Deliberately tolerant: this parser's job is to recover *the user's marks* from
 * a file a human has been editing, so an unrecognised line is skipped rather
 * than treated as corruption. What it must never do is lose a tick.
 */
export function parsePrd(text) {
  const lines = String(text).split('\n');
  const header = {};
  const phases = [];
  let section = 'header';
  let phase = null;
  const notes = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === HEADING_PHASES) {
      section = 'phases';
      continue;
    }
    if (trimmed === HEADING_NOTES) {
      section = 'notes';
      phase = null;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (section === 'phases') phase = null;
      section = trimmed === HEADING_GOAL ? 'goal' : 'other';
      continue;
    }

    if (section === 'header') {
      const field = trimmed.match(HEADER_FIELD);
      if (field) header[field[1]] = field[2];
      continue;
    }

    if (section === 'notes') {
      notes.push(line);
      continue;
    }

    if (section !== 'phases') continue;

    const heading = trimmed.match(PHASE_HEADING);
    if (heading) {
      phase = {
        number: Number(heading[1]),
        title: heading[2],
        done: false,
        commit: null,
        stopped: null,
        criteria: [],
      };
      phases.push(phase);
      continue;
    }
    if (!phase) continue;

    const status = trimmed.match(PHASE_STATUS);
    if (status) {
      phase.done = status[1].toLowerCase() === 'x';
      continue;
    }
    const commit = trimmed.match(PHASE_COMMIT);
    if (commit) {
      phase.commit = commit[1];
      continue;
    }
    const stopped = trimmed.match(PHASE_STOPPED);
    if (stopped) {
      phase.stopped = stopped[1];
      continue;
    }
    const criterion = trimmed.match(CRITERION);
    if (criterion) {
      const fields = parseCriterionFields(criterion[3]);
      phase.criteria.push({
        id: criterion[2],
        done: criterion[1].toLowerCase() === 'x',
        fields,
        key: resumeKey(fields),
      });
    }
  }

  return {
    header,
    phases,
    notes: notes.join('\n').trim() === '' ? null : trimStanza(notes),
  };
}

function trimStanza(lines) {
  const text = lines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
  return text === '' ? null : text;
}

/**
 * The identity of a change, independent of its number.
 *
 * Criterion **ids renumber** whenever the inventory changes, so a tick can only
 * be carried across a re-run by what the criterion is *about*: the file, the
 * literal or pattern, and what it becomes. That triple is the resume key, and it
 * is why editing a PRD and re-running `apply` does not lose your progress.
 */
export function resumeKey(fields = {}) {
  const subject = fields.literal ?? fields.pattern ?? '';
  return [fields.file ?? '', subject, fields.becomes ?? ''].join('|');
}

/** The resume key of a freshly derived change, in the same spelling. */
export function changeResumeKey(change) {
  const fields = Object.fromEntries(criterionFields(change));
  return resumeKey(fields);
}

// ---------------------------------------------------------------------------
// Resume — refresh the inventory, keep the marks
// ---------------------------------------------------------------------------

/**
 * Merge an existing PRD's marks into a freshly derived one.
 *
 * The rule, stated once: **the inventory is regenerated, the marks are kept.**
 * A re-run re-reads `DESIGN-SYSTEM.md` and re-scans the code, so the changes and
 * the phase grouping are always current — but a criterion you (or M7) ticked
 * stays ticked as long as that same change is still in the plan, a phase marked
 * complete stays complete, a recorded commit or stop reason is carried over, and
 * the `Notes` section comes across verbatim.
 *
 * A tick whose change has disappeared from the codebase is dropped, and the
 * caller is told how many — silently keeping it would be a plan claiming credit
 * for work that is no longer in it.
 */
export function mergePrd(fresh, existing) {
  if (!existing) return { prd: fresh, kept: null };

  const tickedKeys = new Map();
  for (const phase of existing.phases) {
    for (const criterion of phase.criteria) {
      if (criterion.done) tickedKeys.set(criterion.key, criterion.id);
    }
  }

  // Completed phases are remembered by title, because numbers move when the
  // inventory does but "Adopt Button/Primary" is the same phase either way.
  const byTitle = new Map(existing.phases.map((phase) => [phase.title, phase]));

  let carried = 0;
  let reopened = 0;
  const phases = fresh.phases.map((phase) => {
    const previous = byTitle.get(phase.title) ?? null;
    const changes = phase.changes.map((change) => {
      const done = tickedKeys.has(changeResumeKey(change));
      if (done) carried += 1;
      return { ...change, done };
    });

    // A "complete" marker is a user (or M7) edit, so it is kept as written —
    // Phyllum does not second-guess a phase somebody verified by hand without
    // ticking every line. The one thing that can reopen it is work that was not
    // in the plan when it was marked complete: a change nobody could have done.
    const knownKeys = new Set((previous?.criteria ?? []).map((criterion) => criterion.key));
    const gained = changes.filter((change) => !knownKeys.has(changeResumeKey(change)));
    const wasDone = previous?.done ?? false;
    const done = wasDone && gained.length === 0;
    if (wasDone && !done) reopened += 1;

    const extra = [];
    if (previous?.commit) extra.push(`- Commit: ${previous.commit}`);
    if (previous?.stopped) extra.push(`- Stopped: ${previous.stopped}`);
    if (wasDone && !done) {
      extra.push(
        `- Reopened: ${gained.length} change${gained.length === 1 ? '' : 's'} appeared here after this phase was marked complete, so the marker was cleared.`,
      );
    }
    return { ...phase, changes, done, extra };
  });

  const droppedTicks = tickedKeys.size - carried;
  const done = phases.filter((phase) => phase.done).length;
  const status =
    phases.length === 0 || done === 0
      ? phases.some((phase) => phase.changes.some((change) => change.done))
        ? STATUS_IN_PROGRESS
        : STATUS_NOT_STARTED
      : done === phases.length
        ? STATUS_COMPLETE
        : STATUS_IN_PROGRESS;

  return {
    prd: {
      ...fresh,
      header: { ...fresh.header, status },
      phases,
      notes: existing.notes ?? fresh.notes,
    },
    kept: {
      ticks: carried,
      droppedTicks: droppedTicks > 0 ? droppedTicks : 0,
      completedPhases: done,
      reopenedPhases: reopened,
      notes: existing.notes !== null,
      generated: existing.header?.Generated ?? null,
    },
  };
}
