/**
 * `pipeline` (v0.8.0 M3): the shape of the product, and where this project sits
 * in it.
 *
 * Two halves, and they answer two different questions. The listing is the
 * *model* — the four stages in pipeline order, the question each one answers,
 * and the commands the registry files under it. Nothing about a project can
 * change that half; it is the same output in every directory on earth.
 *
 * The second half is the *reading* — a handful of facts about the directory the
 * command was run in, and one statement of where those facts put the project.
 * It is derived from files that are already on disk and from nothing else: no
 * model, no network, no history, no memory of previous runs. Phyllum's two hard
 * rules apply to a position exactly as they apply to a value — never invent one,
 * never correct one. So a fact that cannot be read is reported as unreadable and
 * the position is withheld, rather than guessed at from the facts that did read.
 *
 * The statement says what was observed, in the same words the facts above it
 * use. "That reads as Build" is a reading of the file, not a verdict on the
 * work: nothing here grades a project, tells anybody what to run next, or
 * pretends a stage has been completed. A stage is not a gate (see SKILL.md, "The
 * pipeline"), so "sits in Build" only ever means "the facts on disk look like
 * Build's" — a user is free to be somewhere else entirely.
 *
 * Wholly mechanical, and strictly read-only: it writes nothing, creates nothing,
 * and touches no path outside the working directory it is handed.
 */

import fs from 'node:fs';
import path from 'node:path';

import { COMMANDS, STAGES, SYSTEM_STAGE } from './registry.js';
import { EMPTY_STAGE_NOTE, commandLine } from './menu.js';
import { parse } from './design-system.js';
import { readAppliedFlags } from './applied.js';
import { ASSESS_JSON_FILE, DESIGN_SYSTEM_FILE, PRD_FILE, STATE_DIR } from './write.js';

/** Every token row in a parsed model, the primitive ramps included. */
const TOKEN_KEYS = ['colours', 'numbers', 'typography', 'primitives'];

/**
 * The facts this command is allowed to read, and the whole of them.
 *
 * Each field is an observation rather than a conclusion: whether the file is
 * there, whether it opened, what it records, what the `applied:` lines say, and
 * which of the two `.phyllum/` outputs exist. `unreadable` holds the errno when
 * the file is there but would not open, which is the one case where there is a
 * fact *and* no way to read it — and it is kept apart from `present` for that
 * reason.
 */
export function readPipelineFacts(root) {
  const file = path.join(root, DESIGN_SYSTEM_FILE);
  const present = fs.existsSync(file);
  let text = null;
  let unreadable = null;
  if (present) {
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      unreadable = error?.code ?? 'unreadable';
    }
  }

  const model = text === null ? null : parse(text);
  const tokens = model
    ? TOKEN_KEYS.reduce((total, key) => total + (model.tokens[key]?.length ?? 0), 0)
    : 0;
  const components = model ? model.components.length : 0;

  // A flag is a reading only when it says `true` or `false`. Null covers a spec
  // block with no `applied:` line and one whose line nobody can read, and both
  // of those mean the same thing here: there is nothing to trust, so it is not
  // counted as a reading.
  const flags = text === null ? new Map() : readAppliedFlags(text);
  let readings = 0;
  let applied = 0;
  for (const value of flags.values()) {
    if (value === null) continue;
    readings += 1;
    if (value === true) applied += 1;
  }

  return {
    present,
    unreadable,
    tokens,
    components,
    readings,
    applied,
    state: fs.existsSync(path.join(root, STATE_DIR)),
    assessJson: fs.existsSync(path.join(root, ASSESS_JSON_FILE)),
    prd: fs.existsSync(path.join(root, PRD_FILE)),
  };
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The facts, one per line, as `label  value` pairs. */
function factRows(facts) {
  const rows = [];

  if (!facts.present) rows.push([DESIGN_SYSTEM_FILE, 'not here']);
  else if (facts.unreadable) rows.push([DESIGN_SYSTEM_FILE, `here, but it would not open (${facts.unreadable})`]);
  else rows.push([DESIGN_SYSTEM_FILE, 'here']);

  if (facts.present && !facts.unreadable) {
    rows.push(['recorded', `${plural(facts.tokens, 'token')}, ${plural(facts.components, 'component')}`]);
    if (facts.components > 0) {
      rows.push([
        '`applied:` readings',
        facts.readings === 0
          ? 'none — no component records one'
          : `${facts.readings} of ${plural(facts.components, 'component')}; ${facts.applied} read \`true\``,
      ]);
    }
  }

  const outputs = [facts.assessJson ? ASSESS_JSON_FILE : null, facts.prd ? PRD_FILE : null].filter(Boolean);
  if (!facts.state) rows.push([`${STATE_DIR}/`, 'not here']);
  else rows.push([`${STATE_DIR}/`, outputs.length === 0 ? 'here, and holds neither output' : `here — ${outputs.join(', ')}`]);

  return rows;
}

/**
 * Where the facts put the project, in one or two lines.
 *
 * The order below is the order the questions can be answered in, and each branch
 * returns as soon as the facts settle it. The first branch is the one that
 * refuses: a file that will not open is a fact Phyllum has, and a position it
 * does not — so it says so and stops, rather than reading the rest of the
 * directory and calling that the answer.
 */
export function positionLines(facts) {
  if (facts.present && facts.unreadable) {
    return [
      `${DESIGN_SYSTEM_FILE} is here but could not be read (${facts.unreadable}), so what it records is unknown.`,
      'Phyllum will not place a project on facts it cannot read. Fix the file or its permissions, then run this again.',
    ];
  }

  if (!facts.present) {
    return [
      `There is no ${DESIGN_SYSTEM_FILE} here, so nothing has been recorded yet.`,
      'That reads as before Assess: `phyllum assess` reads the codebase, `phyllum init` scaffolds the file.',
    ];
  }

  if (facts.tokens === 0 && facts.components === 0) {
    return [
      `${DESIGN_SYSTEM_FILE} is here and records no tokens and no components.`,
      'That reads as Assess: the file exists and nothing has been named in it yet.',
    ];
  }

  if (facts.components === 0 || facts.readings === 0) {
    return [
      `The design system records ${plural(facts.tokens, 'token')} and ${plural(facts.components, 'component')}, ` +
        'and no component carries an `applied:` reading.',
      'That reads as Build: the system is written down, and `phyllum apply` has not recorded a reading of the codebase here.',
    ];
  }

  if (facts.applied === 0) {
    return [
      `${plural(facts.readings, 'component')} carries an \`applied:\` reading and none of them reads \`true\`.`,
      'That reads as Build: `apply` has read the codebase, and no recorded component is in use in it yet.',
    ];
  }

  return [
    `${facts.applied} of ${plural(facts.readings, 'component')} with an \`applied:\` reading reads \`true\`, ` +
      'so the codebase is using what the design system records.',
    'That reads as past Build. Refine holds no commands in this release.',
  ];
}

/** The whole command: the model, then the reading. */
export function renderPipeline(root) {
  const stageCommands = COMMANDS.filter((c) => c.stage !== SYSTEM_STAGE);
  const width = Math.max(...stageCommands.map((c) => c.invocation.length));
  const lines = ['Phyllum — the pipeline', ''];

  STAGES.forEach((stage, index) => {
    lines.push(`${index + 1}. ${stage.label} — ${stage.question}`);
    const commands = COMMANDS.filter((c) => c.stage === stage.id);
    if (commands.length === 0) lines.push(`  ${EMPTY_STAGE_NOTE}`);
    else for (const command of commands) lines.push(commandLine(command, width));
    lines.push('');
  });

  lines.push('Each stage can also run alone; nothing checks that an earlier one has been done.');
  lines.push('Running Phyllum itself — the menu, help, the dashboard, versions, installs — is grouped as');
  lines.push('System, and System is not a stage. `phyllum menu` lists every command, stage by stage.');
  lines.push('');

  // One read of the directory, two renderings of it. Reading twice would let the
  // facts and the statement below them disagree about the same file.
  const facts = readPipelineFacts(root);
  lines.push('Where this project sits');
  lines.push('');
  const rows = factRows(facts);
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) lines.push(`  ${label.padEnd(labelWidth)}  ${value}`);
  lines.push('');
  for (const line of positionLines(facts)) lines.push(`  ${line}`);

  return `${lines.join('\n')}\n`;
}
