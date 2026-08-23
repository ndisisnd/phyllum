/**
 * `phyllum assess` — the command surface (v0.2.0 plan §5.1).
 *
 * The pipeline is five steps, and the command is the pipeline read out loud:
 * what Phyllum can see, what it read, what the codebase actually uses, the map of
 * it, and what it suggests you do about it. The order is the explanation.
 *
 * Steps 1–4 are **mechanical**. A scan and a rendering: no model, no
 * conversation, nothing to accept — which is why the whole assessment, up to and
 * including the mapping table with its proposed names in it, works in a plain
 * terminal with nothing installed. That is the split this command is built
 * around, and it is why the report is useful before anybody says yes to anything.
 *
 * Step 5 is the half that talks: the token review and the component pick are
 * conversations, so they run when a `ask`/`confirm` pair is attached (the
 * interactive session, or the skill inside Claude Code) and are previewed rather
 * than pretended at when one is not. The tracks themselves live in
 * `lib/assess-suggest.js`, because they write and this file must not: every module
 * on the scan path is checked for write calls, and that check is the trust a
 * command that reads your code has to earn.
 *
 * ## What v0.9.0 added
 *
 * Assess is a **stage** now, and a stage leaves something behind. A full run
 * ends by writing `.phyllum/assess-[n].md` through `lib/assess-reports.js` —
 * numbered in order, carrying its own date, and ending in a machine-readable
 * recommendations block the Build stage reads. That is the one write this file
 * performs, it goes through the write funnel like every other, and `.phyllum/`
 * is already inside the permission model, so nothing about the read-only
 * promise over the user's codebase changed.
 *
 * Two modes were added with it, `score` and `drift`, and neither writes a
 * report. They are the two halves of the reading asked for on their own.
 *
 * Same shape as every other command here: arguments in, text out. Nothing prints
 * and nothing reads `process`.
 */

import fs from 'node:fs';
import path from 'node:path';

import { WARN, assess } from './assess.js';
import { renderCandidate, renderMap } from './assess-map.js';
import {
  DEFAULT_JSON_PATH,
  renderJsonNotice,
  renderJsonUpdateRefusal,
  renderJsonWriteFailure,
  writeAssessment,
} from './assess-json.js';
import { renderExtras, renderFindings, renderScore, renderSpecNotices } from './assess-report.js';
import { specNotices } from './tokenise-spec.js';
import { runComponentTrack, runTokenTrack } from './assess-suggest.js';
import {
  intelligenceRoute,
  renderSessionNotice,
  renderShellOutNotice,
} from './claude-cli.js';
import { parse } from './design-system.js';
import { renderDetection } from './detect.js';
import { writeAssessReport } from './assess-reports.js';
import { DESIGN_SYSTEM_FILE } from './write.js';

/**
 * The reserved scope words after `assess` (plan §2.2 argument grammar).
 *
 * `score` and `drift` joined the list in v0.9.0. They are modes of `assess`
 * rather than siblings of it, because the stage holds to one command per stage:
 * a second top-level verb would make "what state is my design system in?" a
 * question with two entry points and two answers.
 */
export const ASSESS_SCOPES = ['tokens', 'components', 'update', 'score', 'drift'];

/** How many rows a report shows before it says "and more". */
const PREVIEW = 8;

/**
 * How many components one `assess components` run will walk before it stops.
 *
 * The focused mode loops, so it needs an end even if every pick is accepted: a
 * bound on the loop is how a fast-forward stays a session rather than a shift.
 */
const MAX_COMPONENT_ROUNDS = 20;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const isAssessScope = (word) => ASSESS_SCOPES.includes(String(word ?? '').toLowerCase());

export { renderCandidate };

/** A word that is not a scope at all — the valid ones, rather than an error. */
export function renderInvalidScope(word) {
  return (
    `\`${word}\` is not something \`assess\` takes.\n` +
    `The scope words are ${ASSESS_SCOPES.map((scope) => `\`${scope}\``).join(', ')} — or nothing at all for the full assessment.\n`
  );
}

/**
 * How the findings break down — how much is drift, how much looks deliberate.
 *
 * Two sentences at most, and neither is printed when there is nothing to say.
 * The point of the split is to make the report actionable rather than long: a
 * user who fixes the errors has fixed the systematic problem, and the warnings
 * are there to be read rather than to be worked through.
 */
export function renderSeverities(summary) {
  const { errors = 0, warnings = 0, byRule = {} } = summary;
  if (errors === 0 && warnings === 0) return [];

  const out = [];
  if (errors > 0) {
    // Named by family, because "four colours and a radius" is a different
    // afternoon's work from "nine shadows".
    const families = Object.entries(byRule)
      .filter(([rule]) => rule !== 'unread')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rule, count]) => `${rule} ×${count}`);
    out.push(
      `  ${plural(errors, 'finding')} used three times or more — systematic drift, and the tokens worth naming first${families.length > 0 ? ` (${families.join(', ')})` : ''}.`,
    );
  }
  if (warnings > 0) {
    out.push(
      `  ${plural(warnings, 'finding')} used only once or twice — reported as a likely exception, never accepted on your behalf.`,
    );
  }
  return out;
}

/**
 * Hygiene, as the report reads it (v0.2.1 §6).
 *
 * Two facts about the project rather than about any value in it: what collides,
 * and what the design system holds that nothing seems to use. Both are warnings,
 * so the section is written to be read and not worked through — the evidence is
 * on the line beneath each finding, and the caveat is printed once, next to the
 * only findings it applies to.
 *
 * Silence is a result here, not an omission: a project with nothing colliding
 * and nothing stale is told so in one line, because "no findings" printed is the
 * difference between a check that passed and a check that never ran.
 */
export function renderHygiene(result) {
  const { hygiene } = result;
  if (!hygiene) return [];

  const out = ['  Hygiene — what collides, and what nothing uses'];
  const { collisions, unused } = hygiene;

  if (collisions.length === 0) {
    out.push('  Nothing collides — one framework, one styling system, one theme source.');
  }
  for (const collision of collisions) {
    out.push(`  ${collision.value} — ${collision.detail}.`);
    if (collision.evidence.length > 0) out.push(`    seen in: ${collision.evidence.join(', ')}`);
  }

  const stale = [...unused.tokens, ...unused.components];
  if (stale.length === 0 && unused.componentsChecked) {
    out.push('  Everything your design system holds was seen in the code.');
  } else if (stale.length === 0) {
    out.push('  Every token your design system holds was seen in the code.');
  } else {
    for (const row of stale.slice(0, PREVIEW)) {
      const kind = row.rule === 'unused-token' ? 'token' : 'component';
      out.push(`  ${row.value} — a ${kind} nothing the scan read mentions.`);
    }
    if (stale.length > PREVIEW) out.push(`    …and ${stale.length - PREVIEW} more.`);
    // The caveat is a line of the report, not a footnote in a document nobody
    // opens: this is the finding somebody could act on by deleting something.
    out.push(
      `  Not seen is not the same as unused — ${hygiene.caveat}. Nothing is ever removed for you.`,
    );
  }

  if (!unused.componentsChecked) {
    out.push(`  Components were not checked — ${unused.componentsReason}.`);
  }
  return out;
}

/**
 * Similarity, as the report reads it (v0.2.1 §4).
 *
 * Every row here is a pair, so every row is printed as one: two names, the
 * score between them, and the band that score falls in. The score is printed
 * rather than hidden behind the word "clone" because it is the only part of
 * this section a reader can argue with — a report that says "these are alike"
 * and will not say how alike is asking to be believed.
 *
 * The caps are printed too, and printed whether or not they bound anything. A
 * quadratic comparison has to stop somewhere, and a reader who does not know
 * where it stopped cannot tell an empty section from an exhausted one.
 */
export function renderSimilarity(result) {
  const { similarity } = result;
  if (!similarity) return [];

  const out = ['  Similarity — what is nearly the same as what'];
  const { clones, duplicates, overlaps, caps, compared } = similarity;

  const row = (finding) => `  ${finding.value} — ${finding.score} ${finding.band}: ${finding.detail}.`;

  if (!similarity.markupChecked) {
    out.push(`  Components were not compared — ${similarity.markupReason}.`);
  } else if (clones.length === 0 && overlaps.length === 0) {
    out.push('  No two patterns in your markup are close enough to be one pattern.');
  }
  for (const finding of clones.slice(0, PREVIEW)) out.push(row(finding));
  if (clones.length > PREVIEW) out.push(`    …and ${clones.length - PREVIEW} more.`);

  if (duplicates.length === 0) {
    out.push('  No two named style blocks declare the same thing.');
  }
  for (const finding of duplicates.slice(0, PREVIEW)) out.push(row(finding));
  if (duplicates.length > PREVIEW) out.push(`    …and ${duplicates.length - PREVIEW} more.`);

  for (const finding of overlaps.slice(0, PREVIEW)) {
    out.push(`  \`${finding.value}\` — ${finding.detail}.`);
  }
  if (overlaps.length > PREVIEW) out.push(`    …and ${overlaps.length - PREVIEW} more.`);

  // What was compared, always — the same honesty the unused caveat is written
  // with. A pair nobody compared is not a pair that matched.
  out.push(
    `  Compared ${plural(compared.signatures, 'pattern')} of ${compared.signaturesFound} and ${plural(compared.blocks, 'style block')}, capped at ${caps.signatures} patterns, ${caps.blocks} blocks and ${caps.pairs} comparisons a pass.`,
  );
  out.push(
    '  A merge is a suggestion here and nowhere else — nothing renames a class or rewrites a component.',
  );
  return out;
}

/**
 * Consistency, as the report reads it (v0.2.1 §5).
 *
 * One section for both halves, because a reader asking "is this codebase
 * consistent?" is asking one question — but the two halves are printed
 * differently on purpose. A naming stray is printed as `current → suggested`,
 * because the whole value of the finding is the second half; a prop mismatch is
 * printed as the contradiction it is, because there is nothing to suggest until
 * somebody decides which of the two call sites was right.
 *
 * The dominant convention is stated **first**, before any stray, and stated as
 * something counted rather than chosen. A tool that says "this name is wrong"
 * without saying what it is measuring against is asking to be argued with.
 */
export function renderConsistency(result) {
  const { naming, props } = result;
  if (!naming && !props) return [];

  const out = ['  Consistency — one concept, one name; one component, one contract'];

  if (naming) {
    for (const kind of ['class', 'component']) {
      const dominant = naming.conventions?.[kind];
      if (!dominant) continue;
      out.push(
        dominant.decided
          ? `  Your ${kind} names are mostly ${dominant.convention} — ${dominant.tally.find((row) => row.convention === dominant.convention)?.votes ?? 0} of ${dominant.voters}.`
          : `  No dominant ${kind} naming convention — ${dominant.reason}.`,
      );
    }

    if (!naming.markupChecked) {
      out.push(`  Names in your markup were not read — ${naming.markupReason}.`);
    }
    if (naming.compared.names === 0) {
      out.push('  No class or component names were read here, so nothing was compared.');
    } else if (naming.findings.length === 0) {
      out.push('  Every name Phyllum could read is spelled one way, in one convention.');
    }
    for (const row of naming.drift.slice(0, PREVIEW)) {
      out.push(`  ${row.value} → \`${row.suggested}\` — ${row.detail}.`);
    }
    if (naming.drift.length > PREVIEW) {
      out.push(`    …and ${naming.drift.length - PREVIEW} more.`);
    }
    for (const row of naming.strays.slice(0, PREVIEW)) {
      out.push(`  ${row.value} → \`${row.suggested}\` — ${row.detail}.`);
    }
    if (naming.strays.length > PREVIEW) {
      out.push(`    …and ${naming.strays.length - PREVIEW} more.`);
    }
    if (naming.findings.length > 0) out.push(`  ${naming.caveat}.`);
  }

  if (props) {
    if (!props.checked) {
      out.push(`  Props were not compared — ${props.reason}.`);
    } else if (props.compared.components === 0) {
      out.push('  No component is called by name in this markup, so no contract was compared.');
    } else {
      if (props.findings.length === 0) {
        out.push('  Every component is called the same way everywhere it is called.');
      }
      for (const row of props.findings.slice(0, PREVIEW)) {
        out.push(`  ${row.value} — ${row.severity}: ${row.detail}.`);
      }
      if (props.findings.length > PREVIEW) {
        out.push(`    …and ${props.findings.length - PREVIEW} more.`);
      }
      // What was read, always, and what was read and not understood. An
      // expression counted here is the honest denominator for every claim above
      // it: a conflict Phyllum did not find in a value it could not read is not
      // a conflict that is not there.
      out.push(
        `  Read ${plural(props.compared.usages, 'usage')} of ${plural(props.compared.components, 'component')}${props.compared.componentsCapped ? ` of ${props.compared.componentsFound}` : ''}, capped at ${props.caps.components} components and ${props.caps.usages} usages each; ${plural(props.compared.unread, 'value')} could not be read and ${plural(props.compared.spreads, 'usage')} spread their props.`,
      );
      if (props.findings.length > 0) out.push(`  ${props.caveat}.`);
    }
  }

  out.push(
    '  A rename is a suggestion here — nothing edits a call site or renames a class.',
  );
  return out;
}

/**
 * The assessment, as a report: steps 1 to 4, and not one word about a model.
 *
 * Everything here is derived from the scan result and formatted, so this function
 * is the definition of the mechanical half — a terminal with nothing installed
 * gets the whole of it, table and proposed names included.
 */
export function renderAssessment(result) {
  const { detection, values, components, summary } = result;
  const out = ['phyllum assess — read-only', ''];

  out.push(...renderDetection(detection), '');

  out.push('Step 2 — the scan');
  if (values.files === 0) {
    out.push('  Nothing to read here yet — no stylesheets, no markup, no theme files.');
  } else {
    out.push(`  Read ${plural(values.files, 'file')}, read-only. Nothing was written.`);
    if (values.dataFiles > 0) {
      out.push(
        `  ${values.dataFiles} of those ${values.dataFiles === 1 ? 'is' : 'are'} neither a stylesheet nor markup — read for \`property: value\` pairs, because raw styling is not only ever written in CSS.`,
      );
    }
  }
  out.push('');

  out.push('Step 3 — what your codebase uses');
  if (summary.distinctValues === 0) {
    out.push('  No colours, numbers or typography written out as raw values.');
  } else {
    out.push(
      `  ${plural(values.raw, 'raw value')} written out, ${plural(summary.distinctValues, 'distinct value')} once near-identical ones are clustered together.`,
    );
    if (summary.covered > 0) {
      const named = [...new Set(values.covered.map((row) => row.token).filter(Boolean))].slice(
        0,
        PREVIEW,
      );
      out.push(
        `  ${summary.covered} of those ${summary.covered === 1 ? 'is' : 'are'} already named by your design system${named.length > 0 ? `: ${named.join(', ')}` : ''}.`,
      );
    }
    if (summary.proposed === 0) {
      out.push('  Nothing is unnamed — every raw value in here maps to a token you already have.');
    } else {
      out.push(`  ${plural(summary.proposed, 'value')} not named yet, most-used first in the map below.`);
    }
    if (summary.unreadable > 0) {
      out.push(
        `  ${plural(summary.unreadable, 'value')} plainly a colour or a length but written on a property no table names — seen, not read, and asked about rather than guessed at.`,
      );
    }
    out.push(...renderSeverities(summary));
  }
  out.push('');

  out.push('Step 4 — the map: what is used, where, what it means, what covers it');
  out.push(...renderMap(result));
  out.push('');

  out.push('  Patterns that look like components');
  if (!components.ran) {
    out.push(`  Not run — ${components.reason}.`);
  } else if (components.candidates.length === 0) {
    out.push('  Nothing repeated often enough to look like a component your system is missing.');
  } else {
    out.push(
      `  ${plural(components.candidates.length, 'pattern')} your code repeats and your design system has never been told about:`,
    );
    for (const candidate of components.candidates.slice(0, PREVIEW)) {
      out.push(`  ${renderCandidate(candidate)}`);
    }
    if (components.candidates.length > PREVIEW) {
      out.push(`    …and ${components.candidates.length - PREVIEW} more.`);
    }
  }

  const similarity = renderSimilarity(result);
  if (similarity.length > 0) out.push('', ...similarity);

  // Consistency reads after similarity because it answers the question
  // similarity raises: two things being alike is only worth knowing if you then
  // ask whether they are named and used alike.
  const consistency = renderConsistency(result);
  if (consistency.length > 0) out.push('', ...consistency);

  const hygiene = renderHygiene(result);
  if (hygiene.length > 0) out.push('', ...hygiene);

  const extras = renderExtras(result);
  if (extras.length > 0) out.push('', ...extras);

  // Everything above, said once more in one shape — and then the two numbers
  // the whole assessment comes down to. The roll-up reads after the sections
  // rather than before them because it is a triage list: it is only useful to
  // somebody who has already seen what the findings mean.
  const findings = renderFindings(result);
  if (findings.length > 0) out.push('', ...findings);

  const score = renderScore(result);
  if (score.length > 0) out.push('', ...score);

  const notices = renderSpecNotices(specNotices());
  if (notices.length > 0) out.push('', ...notices);
  return out;
}

export { renderExtras, renderFindings, renderScore, renderSpecNotices };

/**
 * The closing promise, told straight.
 *
 * `assess` writes its own numbered report under `.phyllum/`, and it writes
 * `DESIGN-SYSTEM.md` when something was accepted. Nothing else, ever — so the
 * line names whichever of those actually happened rather than reaching for one
 * sentence that covers all three cases loosely.
 *
 * The one clause that never changes is the last one, because it is the promise
 * a reader is actually checking: the codebase is untouched, and writing code
 * belongs to `apply` alone.
 */
export function renderPromise({ written = 0, report = null } = {}) {
  const head = report
    ? `\`${report}\` was written${written === 0 ? ' and nothing else' : ''}, and nothing`
    : written === 0
      ? 'Nothing was written, and nothing'
      : 'Nothing';
  return `${head} in your codebase was changed — \`assess\` reads your code, only \`apply\` ever writes it.`;
}

/**
 * What the stage left behind, named where the run ends (v0.9.0 phase 4).
 *
 * The terminal report is read once and lost when the scrollback rolls. The file
 * is the stage's actual output, so the run says its path, its date and its
 * number out loud — a reader who wants to quote a scan next week needs a name
 * for it, and a number that appeared without being announced is a number
 * nobody knows exists.
 */
export function renderReportNotice(report) {
  if (!report) return [];
  return [
    `The report — \`${report.path}\`, dated ${report.date}.`,
    '  The whole reading as a file: the summary, the drift by family, the health score, and the recommendations.',
    '  Its `phyllum-recommendations` block is the machine-readable half, and the number is one past the highest already there — nothing is ever renumbered or reused.',
  ];
}

/**
 * The report could not be written, said plainly, and the run fails.
 *
 * Exit 1 rather than 0, and the reasoning is worth stating because the other
 * choice is defensible: the assessment on screen is complete and correct, so a
 * reader lost nothing. What a *caller* loses is the stage's output. Assess is
 * the first stage of a pipeline, and the next one reads the latest report — so
 * a run that printed a fine assessment and left no file behind, while
 * reporting success, is how a later stage silently reads a stale scan.
 */
export function renderReportFailure(error) {
  return [
    `The assessment above ran in full, but the report could not be written — ${error.message}.`,
    '  Nothing else was touched. Fix the directory or its permissions and run `assess` again; the reading is the same reading.',
  ];
}

// ---------------------------------------------------------------------------
// `assess drift` and `assess score` — two halves of the reading, on their own
// ---------------------------------------------------------------------------

/**
 * Coverage, as the drift mode reads it.
 *
 * Covered and uncovered values sit on one table on purpose (protocol §3): "how
 * far has this drifted?" is only answerable when what is already named sits
 * beside what is not. A percentage would be the wrong shape here — the reader
 * is about to be handed the findings themselves, and a ratio would only invite
 * them to stop reading.
 */
export function renderCoverage(result) {
  const { values, summary } = result;
  if (summary.distinctValues === 0) {
    return ['  No colours, numbers or typography are written out as raw values here, so nothing has drifted.'];
  }
  const out = [
    `  ${plural(values.raw, 'raw value')} written out, ${plural(summary.distinctValues, 'distinct value')} once near-identical ones are clustered together.`,
    `  ${summary.covered} of those your design system already names — coverage, matched silently and never proposed again.`,
    `  ${plural(summary.proposed, 'value')} nothing in \`${DESIGN_SYSTEM_FILE}\` names — a finding each, carrying a severity and a rule.`,
  ];
  if (summary.unreadable > 0) {
    out.push(
      `  ${plural(summary.unreadable, 'value')} seen but not read — a question about what it applies to, never a guess.`,
    );
  }
  return out;
}

/**
 * `assess drift` — the drift section on its own (v0.9.0 acceptance criterion).
 *
 * The codebase put beside `DESIGN-SYSTEM.md`, and nothing else: no score, no
 * review, no numbered report. That is the whole point of the mode. A reader who
 * has just fixed something wants to see what is still uncovered without being
 * handed a number to argue with, and a mode that quietly emitted a report would
 * make "run it as often as you like" false.
 *
 * The findings are the same rows the full assessment prints, from the same
 * summariser, so a drift section here and a drift section in a report can never
 * be two different readings of one scan.
 */
export function renderDriftOnly(result) {
  return [
    'phyllum assess drift — read-only',
    '',
    `  Your codebase against \`${DESIGN_SYSTEM_FILE}\`.`,
    ...renderCoverage(result),
    '',
    ...renderFindings(result),
    '',
    'No score here and no review — `assess score` is the number, `assess` is the whole stage and the report it leaves behind.',
    renderPromise({}),
  ];
}

/**
 * `assess score` — the health score on its own (v0.9.0 acceptance criterion).
 *
 * It writes nothing and asks nothing, exactly as
 * `refs/assess/protocol-assess-rubric.md` states. And it is the *same*
 * computation the full run does, through the same module — one code path, so
 * the score in a report and the score at a prompt can never disagree.
 */
export function renderScoreOnly(result) {
  return [
    'phyllum assess score — read-only',
    '',
    ...renderScore(result),
    '',
    'Computed against `refs/assess/protocol-assess-rubric.md`: every finding weighted by family and severity into a drift mass, the mass read off the scale, the verdict read off the severities.',
    renderPromise({}),
  ];
}

/**
 * How the review would be reached from here, when it was not reached this run.
 *
 * Deliberately silent when there is no route to a model: the assessment above
 * needed none, and a command that just did its whole mechanical job should not
 * close with an install pitch. What it does say is where the conversation lives.
 */
function routeNotice(ctx) {
  const route = intelligenceRoute(ctx.env ?? process.env);
  if (route === 'session') return renderSessionNotice('assess').trimEnd();
  if (route === 'shell-out') return renderShellOutNotice('assess').trimEnd();
  return 'The review is a conversation: run `assess` inside a `phyllum` session to walk it one value at a time.';
}

/**
 * Load the design system and assess the project — one scan, whoever asked for it.
 *
 * This is the seam the chained modes are built on: `assess tokens`,
 * `assess components` and `assess update` are the same scan read three ways, so
 * they call this once and then pick the tracks they want.
 */
export function loadAssessment(ctx = {}) {
  const root = ctx.cwd;
  const model = parse(fs.readFileSync(path.join(root, DESIGN_SYSTEM_FILE), 'utf8'));
  return { root, model, result: assess(root, model, ctx.scanOptions ?? {}) };
}

// ---------------------------------------------------------------------------
// `assess update` — the fast-forward, and the two things it will not answer
// ---------------------------------------------------------------------------

/** The answer grammar's word for "yes, that name is right" (`refs/tokenise/`). */
const AUTO_ACCEPT = 'y';

/** And its word for "leave it". */
const AUTO_SKIP = 'skip';

/**
 * What `assess update` answers, and what it refuses to.
 *
 * The rule is one sentence: a question whose answer is already on the page gets
 * answered, and a question whose answer is only in your head gets skipped. A
 * proposed token name is on the page — the name was derived mechanically from the
 * value and the naming scales, so accepting it adds nothing a review would have
 * added. A role Phyllum could not read is not on the page, and neither is a
 * component contract, so both are left alone.
 *
 * Questions are told apart by the suggestions they offer rather than by their
 * wording, and anything unrecognised is skipped. That default is the important
 * half: a question this function has never seen can only ever be declined, so a
 * later flow cannot be auto-accepted into by accident.
 *
 * `severity` is the one fact a suggestion list cannot carry, because it is not
 * about the question — it is about the whole codebase, and only the engine that
 * counted it knows it. The track hands it over explicitly for that reason.
 */
export function autoAnswer(suggestions = [], { severity = null } = {}) {
  const offered = new Set((suggestions ?? []).map((item) => item?.action ?? item?.source ?? ''));
  // A role question, or a component pick: both are answers only you have.
  if (offered.has('role') || offered.has('candidate')) return AUTO_SKIP;
  // A `warn` finding is a suspected exception (v0.2.1 §3.2). The name is still
  // on the page, but whether the value deserves a token at all is not — the
  // codebase says it was written once or twice, which is what a deliberate
  // one-off looks like. So this is the third thing the fast-forward declines,
  // and it declines it for the same reason as the other two.
  if (severity === WARN) return AUTO_SKIP;
  // The token review: confirm-or-skip over a name that was already derived.
  if (offered.has('confirm') && offered.has('skip')) return AUTO_ACCEPT;
  return AUTO_SKIP;
}

/**
 * The ctx `assess update` runs on: the same flow, with the answers supplied.
 *
 * This is deliberately a wrapper and not a mode flag threaded through the tracks.
 * `assess update` is not a second review that happens to be quiet — it is the
 * review with a caller who answers, which is why the write path, the acceptance
 * gate and the refusals underneath it are the ones the interactive run uses.
 */
export function autoContext(ctx = {}) {
  return {
    ...ctx,
    ask: async (_question, suggestions = [], meta = {}) => autoAnswer(suggestions, meta),
    confirm: async () => true,
  };
}

/** What `assess update` says about the answers it gave on your behalf. */
export function renderUpdateNotice() {
  return [
    '`assess update` answered step 5 for you:',
    '  Accepted — every proposed token used three times or more, under the name in the map above, and the one write to DESIGN-SYSTEM.md.',
    '  Skipped — any value used only once or twice, because that is what a deliberate exception looks like and only you can say whether it is one.',
    '  Skipped — any value seen but not read, because its role is unknown and Phyllum does not guess one.',
    '  Skipped — recording a component, because that is `create`’s conversation and its questions have answers only you have.',
    '  Run `phyllum assess` (or `assess components`) to walk the skipped ones one at a time.',
  ];
}

// ---------------------------------------------------------------------------
// The tracks, walked
// ---------------------------------------------------------------------------

/**
 * Walk the component track — once for bare `assess`, repeatedly for the focused
 * `assess components`.
 *
 * The orchestrator's decision, stated where the code makes it: a full assessment
 * records **one** component, because an assessment that turned into five queued
 * `create` conversations would stop being an assessment. `assess components` is
 * the mode you chose on purpose, so it loops — one candidate at a time, each with
 * its own pick and its own acceptance gate, and it stops the moment a round
 * records nothing (a skip, an exit, or a pick that matched nothing on the list).
 *
 * Each round re-reads the same scan result with the recorded candidates removed.
 * Nothing rescans, and nothing is offered twice.
 */
async function walkComponents(root, { result, model, ctx, loop }) {
  const first = await runComponentTrack(root, { result, model, ctx, looping: loop });
  const walked = [first];
  const lines = [...first.lines];
  if (!loop) return { walked, lines };

  let remaining = result.components.candidates.filter((candidate) => candidate !== first.created);
  let recorded = first.created;
  let rounds = 1;

  while (recorded && remaining.length > 0 && rounds < MAX_COMPONENT_ROUNDS) {
    const view = { ...result, components: { ...result.components, candidates: remaining } };
    const next = await runComponentTrack(root, {
      result: view,
      model,
      ctx,
      looping: remaining.length > 1,
    });
    walked.push(next);
    // The "Components" header belongs to the section, not to each round.
    lines.push('', ...next.lines.slice(1));
    recorded = next.created;
    remaining = remaining.filter((candidate) => candidate !== next.created);
    rounds += 1;
  }

  if (recorded && remaining.length > 0) {
    lines.push(
      `  ${plural(remaining.length, 'pattern')} left for the next run — ${MAX_COMPONENT_ROUNDS} components in one sitting is enough.`,
    );
  }
  return { walked, lines };
}

/**
 * Run the assessment and walk the tracks asked for.
 *
 * `tracks` is what makes the chained modes a wiring job rather than a second
 * implementation: `['tokens']` is `assess tokens`, `['components']` is
 * `assess components`, and a ctx whose `ask`/`confirm` answer for the user is
 * `assess update`. Nothing about the flow changes; only who answers.
 *
 * `loop` is the focused component mode; `mode` only labels the report.
 */
export async function runAssessment(
  ctx = {},
  { tracks = ['tokens', 'components'], loop = false, mode = null } = {},
) {
  const { root, model, result } = loadAssessment(ctx);
  const out = renderAssessment(result);
  const walked = [];
  let written = 0;

  out.push('', 'Step 5 — suggestions');
  if (mode === 'update') out.push('', ...renderUpdateNotice());
  if (tracks.includes('tokens')) {
    const track = await runTokenTrack(root, { result, model, ctx });
    out.push('', ...track.lines);
    written += track.written?.length ?? 0;
    walked.push(track);
  }
  if (tracks.includes('components')) {
    const components = await walkComponents(root, { result, model, ctx, loop });
    out.push('', ...components.lines);
    for (const track of components.walked) written += track.written ?? 0;
    walked.push(...components.walked);
  }

  // The stage's output, written last: every track has had its say, so the
  // report is a reading of the run that finished rather than of the one that
  // was about to start. `ctx.today` is the injection seam — a caller that does
  // not care passes nothing and gets today, and the assertion suite passes a
  // day and gets fixed bytes.
  let report = null;
  let failure = null;
  try {
    report = writeAssessReport(root, result, { date: ctx.today ?? null });
  } catch (error) {
    failure = error;
  }

  out.push('', renderPromise({ written, report: report?.path ?? null }));
  if (report) out.push('', ...renderReportNotice(report));
  if (failure) out.push('', ...renderReportFailure(failure));
  if (walked.some((track) => track.needsConversation)) out.push(routeNotice(ctx));

  return {
    out: `${out.join('\n')}\n`,
    code: failure ? 1 : 0,
    assessment: result,
    tracks: walked,
    report,
  };
}

/**
 * `assess score` — scan, weight, print two numbers, stop.
 *
 * Deliberately not a branch inside `runAssessment`, for the reason `--json` is
 * not one either: everything that function does after the scan is either the
 * conversation or the report file, and this mode has neither. Sharing the scan
 * and nothing else is what keeps "it writes nothing and asks nothing" a
 * property of the code rather than a sentence in a document.
 */
export function runScore(ctx = {}) {
  const { result } = loadAssessment(ctx);
  return { out: `${renderScoreOnly(result).join('\n')}\n`, code: 0, assessment: result };
}

/** `assess drift` — the comparison on its own. Same shape, same reasoning. */
export function runDrift(ctx = {}) {
  const { result } = loadAssessment(ctx);
  return { out: `${renderDriftOnly(result).join('\n')}\n`, code: 0, assessment: result };
}

/**
 * Pull `--json` out of the arguments, with the path it may carry.
 *
 * Two spellings, because both are the ones people type: `--json out/a.json` and
 * `--json=out/a.json`. A bare `--json` takes the default path. A quoted `"--json"`
 * is the literal word and not the flag, the same rule the reserved `help` word
 * follows — a grammar that cannot be escaped is a grammar with a hole in it.
 *
 * The flag is removed from the arguments, so everything downstream still sees
 * `assess`, `assess tokens` or a word that is not a scope, exactly as before.
 */
export function extractJsonFlag(args = []) {
  const rest = [];
  let json = false;
  let target = null;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    const value = String(token?.value ?? token ?? '');
    if (token?.quoted || !value.startsWith('--json')) {
      rest.push(token);
      continue;
    }
    if (value === '--json') {
      json = true;
      // The next word is the path, unless it is a scope word — `assess --json
      // tokens` names a mode, not a file, and reading it as a filename would
      // write `tokens` into the project.
      const next = args[i + 1];
      const nextValue = String(next?.value ?? next ?? '');
      if (next && !nextValue.startsWith('-') && !isAssessScope(nextValue)) {
        target = nextValue;
        i += 1;
      }
      continue;
    }
    if (value.startsWith('--json=')) {
      json = true;
      target = value.slice('--json='.length) || null;
      continue;
    }
    rest.push(token);
  }

  return { args: rest, json, path: target };
}

/**
 * Run `assess`.
 *
 * ctx: { cwd, env, ask, confirm, today }
 *   ask(question, suggestions)  the review loop: one value at a time, and the
 *                               question about a value that could not be read
 *   confirm(question)           the acceptance gate; without it nothing is
 *                               written, because nothing was accepted
 *
 * Without either, the assessment still runs in full and the suggestions are
 * previewed — the scan and the map never needed a model.
 *
 * The six modes are one scan read six ways (plan §5.2, v0.9.0 phase 4):
 *
 *   assess             scan, map, both tracks; one component per run
 *   assess tokens      scan, map, the token review only
 *   assess components  scan, map, the component picks — looped, one at a time
 *   assess update      scan, map, and the answers supplied: tokens accepted as
 *                      proposed, anything that would be a guess skipped
 *   assess score       the health score and the verdict, and nothing else
 *   assess drift       the codebase against DESIGN-SYSTEM.md, and nothing else
 *
 * The first four run the protocol end to end, so each leaves a numbered report
 * under `.phyllum/`. The last two do not, and that asymmetry is the point of
 * them: a mode somebody runs to check one thing must be free to be run as often
 * as they like without filling the directory with reports of the same scan.
 *
 * And one flag: `--json [path]` writes the whole assessment object to a file
 * instead of walking any track (§6.5.1). It is refused with `update`, which
 * asks for the opposite, and it writes the JSON file and nothing else — a
 * `--json` run leaves no numbered report either.
 */
export async function runAssess(args, ctx = {}) {
  const flagged = extractJsonFlag(args);
  const word = flagged.args.length > 0 ? String(flagged.args[0]?.value ?? flagged.args[0] ?? '') : '';
  const scope = word.toLowerCase();
  if (word !== '' && !isAssessScope(scope)) return { out: renderInvalidScope(word), code: 0 };

  if (flagged.json) {
    // The one combination that is refused rather than resolved: see
    // `renderJsonUpdateRefusal`. Exit 1, because a run that did not do what the
    // command line asked for must not report success to whatever asked.
    if (scope === 'update') return { out: renderJsonUpdateRefusal(), code: 1 };
    return runJsonAssessment(ctx, {
      mode: scope === '' ? 'assess' : scope,
      path: flagged.path ?? DEFAULT_JSON_PATH,
    });
  }

  // The two reading-only modes come before the tracks, because neither walks
  // one: they are the two halves of the report a person asks for on its own.
  if (scope === 'score') return runScore(ctx);
  if (scope === 'drift') return runDrift(ctx);

  if (scope === 'tokens') return runAssessment(ctx, { tracks: ['tokens'] });
  if (scope === 'components') return runAssessment(ctx, { tracks: ['components'], loop: true });
  if (scope === 'update') return runAssessment(autoContext(ctx), { mode: 'update' });
  return runAssessment(ctx);
}

/**
 * The `--json` run: scan, write one file, print four lines.
 *
 * Deliberately not a branch inside `runAssessment`. Everything that function
 * does after the scan is the conversation — the tracks, the acceptance gates,
 * the route notice — and none of it applies to a run whose output is a file.
 * Sharing the scan and nothing else is what keeps "`--json` never enters the
 * review loop" a property of the code rather than a promise in a document.
 */
export async function runJsonAssessment(ctx = {}, { mode = 'assess', path: target } = {}) {
  const { root, result } = loadAssessment(ctx);
  let written;
  try {
    written = writeAssessment(root, result, { path: target, mode });
  } catch (error) {
    return { out: renderJsonWriteFailure(target, error), code: 1, assessment: result };
  }
  return {
    out: `${renderJsonNotice(written, result).join('\n')}\n`,
    code: 0,
    assessment: result,
    json: written,
  };
}
