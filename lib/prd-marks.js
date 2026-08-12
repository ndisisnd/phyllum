/**
 * Marking up the PRD as a run progresses (v0.2.0 plan §6.5.3).
 *
 * `apply` writes the plan; `apply run` writes **marks on** the plan — a ticked
 * criterion, a completed phase, the commit a phase landed as, the reason a phase
 * stopped. The plan is also a file the user edits, so a run must not rewrite it:
 * every function here is a **line-level edit of the text it was given**, leaving
 * prose, ordering, whitespace and the whole `## Notes` section exactly as they
 * were. Re-rendering the PRD from a parsed object would be simpler and would
 * quietly throw away anything the parser does not model.
 *
 * Every marker comes from `lib/prd.js`, imported rather than re-derived. The
 * marker strings are the contract between the two halves of `apply`, and there is
 * exactly one definition of them.
 */

import {
  CRITERION,
  HEADER_FIELD,
  PHASE_COMMIT,
  PHASE_HEADING,
  PHASE_STATUS,
  PHASE_STOPPED,
  STATUS_COMPLETE,
  STATUS_IN_PROGRESS,
  STATUS_NOT_STARTED,
} from './prd.js';

const LEADING = /^(\s*)/;
const indentOf = (line) => line.match(LEADING)[1];

/** Tick a criterion box in place, keeping the rest of the line byte for byte. */
function tickLine(line) {
  return line.replace(/^(\s*-\s+)\[[ xX]\]/, '$1[x]');
}

function untickLine(line) {
  return line.replace(/^(\s*-\s+)\[[ xX]\]/, '$1[ ]');
}

/**
 * Walk the file, telling the caller which phase each line belongs to.
 *
 * `visit(line, phase)` returns either a replacement line, an array of lines, or
 * `null` to drop it. Everything the visitor does not touch comes back unchanged.
 */
function editLines(text, visit) {
  const lines = String(text).split('\n');
  const out = [];
  let phase = null;
  for (const line of lines) {
    const heading = line.trim().match(PHASE_HEADING);
    if (heading) phase = Number(heading[1]);
    const result = visit(line, phase);
    if (result === null) continue;
    if (Array.isArray(result)) out.push(...result);
    else out.push(result);
  }
  return out.join('\n');
}

/** Tick the named criteria (`AC-2.1`, …). Ids not present are left alone. */
export function tickCriteria(text, ids) {
  const wanted = new Set(ids);
  if (wanted.size === 0) return text;
  return editLines(text, (line) => {
    const criterion = line.trim().match(CRITERION);
    if (criterion && wanted.has(criterion[2])) return tickLine(line);
    return line;
  });
}

/** Mark a phase complete — the resume marker `apply run` ticks. */
export function markPhaseComplete(text, phase, { done = true } = {}) {
  return editLines(text, (line, current) => {
    if (current !== phase) return line;
    const status = line.trim().match(PHASE_STATUS);
    if (status && Number(status[2]) === phase) return done ? tickLine(line) : untickLine(line);
    return line;
  });
}

/**
 * Put a `- Commit:` / `- Stopped:` record on a phase.
 *
 * It goes immediately after the phase-status line, which is where `apply`'s
 * resume path expects to read it back (`mergePrd` carries both across a re-run).
 * An existing record of the same kind is replaced, never duplicated.
 */
function recordOnPhase(text, phase, marker, line) {
  let placed = false;
  const withoutOld = editLines(text, (current, currentPhase) => {
    if (currentPhase !== phase) return current;
    if (marker.test(current.trim())) return null;
    return current;
  });
  return editLines(withoutOld, (current, currentPhase) => {
    if (currentPhase !== phase || placed) return current;
    const status = current.trim().match(PHASE_STATUS);
    if (status && Number(status[2]) === phase) {
      placed = true;
      return [current, `${indentOf(current)}${line}`];
    }
    return current;
  });
}

export function recordCommit(text, phase, sha) {
  return recordOnPhase(text, phase, PHASE_COMMIT, `- Commit: ${sha}`);
}

export function recordStopped(text, phase, reason) {
  const oneLine = String(reason).replace(/\s+/g, ' ').trim();
  return recordOnPhase(text, phase, PHASE_STOPPED, `- Stopped: ${oneLine}`);
}

/** Clear a stop record — a phase that has been resumed and passed. */
export function clearStopped(text, phase) {
  return editLines(text, (line, currentPhase) => {
    if (currentPhase !== phase) return line;
    return PHASE_STOPPED.test(line.trim()) ? null : line;
  });
}

/** Rewrite the header's `Status` field. */
export function setStatus(text, status) {
  let done = false;
  return editLines(text, (line) => {
    if (done) return line;
    const field = line.trim().match(HEADER_FIELD);
    if (field && field[1] === 'Status') {
      done = true;
      return `${indentOf(line)}- Status: ${status}`;
    }
    return line;
  });
}

/**
 * One phase's own section of the file, verbatim.
 *
 * This is what the orchestrator prompt carries (see `lib/agent-cli.js`): the text
 * the user read and approved, not a paraphrase of it. It runs from the phase
 * heading to the next heading of the same level or above.
 */
export function phaseSection(text, phase) {
  const lines = String(text).split('\n');
  const out = [];
  let inside = false;
  for (const line of lines) {
    const heading = line.trim().match(PHASE_HEADING);
    if (heading) {
      if (inside) break;
      inside = Number(heading[1]) === phase;
    } else if (inside && /^##\s/.test(line.trim())) {
      break;
    }
    if (inside) out.push(line);
  }
  return out.join('\n').trim();
}

/** A `## `-level section's body, verbatim — used for the guarantees block. */
export function sectionBody(text, heading) {
  const lines = String(text).split('\n');
  const out = [];
  let inside = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === heading) {
      inside = true;
      continue;
    }
    if (inside && /^##\s/.test(trimmed)) break;
    if (inside) out.push(line);
  }
  return out.join('\n').trim();
}

/** The header status a set of phases implies — the same three words `apply` uses. */
export function statusFor(phases) {
  if (phases.length === 0) return STATUS_NOT_STARTED;
  const complete = phases.filter((phase) => phase.done).length;
  if (complete === phases.length) return STATUS_COMPLETE;
  const anyTick = phases.some((phase) => phase.criteria?.some((criterion) => criterion.done));
  return complete === 0 && !anyTick ? STATUS_NOT_STARTED : STATUS_IN_PROGRESS;
}
