/**
 * Session state — `.phyllum/session.json` (plan §5, §7.2, §7.3).
 *
 * One file, shared by the terminal and (from M4) the GUI, so both sides see the
 * same draft. It is Phyllum's own state: gitignored, inside the permission model,
 * and never part of the user's codebase.
 *
 * The acceptance state machine lives here (plan §3.3). Its whole purpose is the
 * promise that nothing reaches `DESIGN-SYSTEM.md` before the user accepts, so
 * the transitions are explicit and an illegal one throws rather than silently
 * doing something reasonable.
 */

import fs from 'node:fs';
import path from 'node:path';

import { STATE_DIR, writeGuarded } from './write.js';

export const STATE_FILE = `${STATE_DIR}/session.json`;
export const STATE_VERSION = 1;

/** draft status -> the events it accepts, and where each one lands. */
export const TRANSITIONS = {
  drafting: { review: 'review', abandon: 'abandoned' },
  review: { accept: 'accepted', edit: 'drafting', abandon: 'abandoned' },
  accepted: {},
  abandoned: {},
};

export class TransitionError extends Error {
  constructor(from, event) {
    super(`a draft in "${from}" cannot "${event}" — allowed here: ${Object.keys(TRANSITIONS[from] ?? {}).join(', ') || 'nothing'}`);
    this.name = 'TransitionError';
    this.from = from;
    this.event = event;
  }
}

/** Move a draft through the machine. Mutates and returns the draft. */
export function advance(draft, event, { now = new Date().toISOString() } = {}) {
  const from = draft.status ?? 'drafting';
  const to = TRANSITIONS[from]?.[event];
  if (!to) throw new TransitionError(from, event);
  draft.status = to;
  draft.updatedAt = now;
  if (to === 'accepted') draft.acceptedAt = now;
  return draft;
}

export function statePath(root) {
  return path.join(path.resolve(root), STATE_FILE);
}

/** The current state, or an empty one. A corrupt file is not fatal. */
export function readState(root) {
  const file = statePath(root);
  if (!fs.existsSync(file)) return { version: STATE_VERSION };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : { version: STATE_VERSION };
  } catch {
    return { version: STATE_VERSION };
  }
}

/**
 * Merge a patch into the state and write it through the funnel. Merging, not
 * replacing, so a `create` draft never clobbers the GUI's server record.
 */
export function writeState(root, patch) {
  const state = { ...readState(root), ...patch, version: STATE_VERSION };
  writeGuarded(root, STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export function readDraft(root) {
  return readState(root).draft ?? null;
}

export function saveDraft(root, draft) {
  writeState(root, { draft });
  return draft;
}

export function clearDraft(root) {
  return writeState(root, { draft: null });
}
