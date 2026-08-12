/**
 * Who is going to do the work? (v0.2.0 plan §6.5.1)
 *
 * `apply` writes a plan, and a plan is only useful to whoever executes it. So
 * before Phyllum writes a line of the PRD it answers one question: does this
 * project already have an agent harness, and if so, which one? A PRD shaped for
 * the harness the codebase already uses can be handed over natively; a PRD
 * written for nobody in particular has to be shaped so anybody can read it.
 *
 * The precedence is decided (plan §6.5.1) and it is not the obvious one:
 *
 *   1. **Harness config files win.** `CLAUDE.md`, `AGENT.md`, `AGENTS.md` and
 *      the other recognisable config files below. The codebase's own agent
 *      config outranks anything Phyllum recorded, because the file is the
 *      project speaking for itself.
 *   2. **`.phyllum/` preferences.** What `init` was told, if anything.
 *   3. **Agent memory.** A harness memory file outside the project's own config
 *      — `.claude/CLAUDE.md`, or the user-level equivalent in `$HOME`.
 *
 * Detection is deliberately not Claude-Code-only. Any harness with a config
 * file Phyllum recognises counts, and an unrecognised one is reported as no
 * harness rather than guessed at — the difference matters, because "no harness"
 * changes the *shape* of the PRD rather than blocking it.
 *
 * This module reads. It never writes, and it is never fatal: an unreadable or
 * malformed file is not evidence, it is silence.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CONFIG_FILE, readPreferences } from './apply-config.js';
import { STATE_DIR } from './write.js';

/**
 * The config files that identify a harness, in precedence order.
 *
 * The first three are named in the plan and lead for that reason: they are the
 * de-facto agent-instruction files, and a project that has one has said which
 * agent it expects. The rest are the same fact spelled in other products'
 * conventions.
 */
export const HARNESS_CONFIGS = [
  { file: 'CLAUDE.md', id: 'claude-code', name: 'Claude Code' },
  { file: 'AGENT.md', id: 'agent-md', name: 'an AGENT.md harness' },
  { file: 'AGENTS.md', id: 'agents-md', name: 'an AGENTS.md harness' },
  { file: 'GEMINI.md', id: 'gemini-cli', name: 'Gemini CLI' },
  { file: '.cursorrules', id: 'cursor', name: 'Cursor' },
  { file: '.cursor/rules', id: 'cursor', name: 'Cursor' },
  { file: '.windsurfrules', id: 'windsurf', name: 'Windsurf' },
  { file: '.github/copilot-instructions.md', id: 'copilot', name: 'GitHub Copilot' },
  { file: '.aider.conf.yml', id: 'aider', name: 'Aider' },
];

/** Harness memory files — the third and weakest layer of evidence. */
export const MEMORY_FILES = [
  { rel: '.claude/CLAUDE.md', id: 'claude-code', name: 'Claude Code', scope: 'project' },
  { rel: '.claude/AGENTS.md', id: 'claude-code', name: 'Claude Code', scope: 'project' },
  { rel: '.claude/CLAUDE.md', id: 'claude-code', name: 'Claude Code', scope: 'user' },
  { rel: '.codex/AGENTS.md', id: 'agents-md', name: 'an AGENTS.md harness', scope: 'user' },
];

const exists = (file) => {
  try {
    return fs.existsSync(file);
  } catch {
    return false; // an unreadable path is silence, not evidence
  }
};

/**
 * The `.phyllum/` preference, if anybody ever recorded one.
 *
 * Two files can hold it, and they are read in that order by
 * `readPreferences`: `.phyllum/config.json` — the hand-written settings file
 * v0.2.0 adds, which also carries `apply`'s model overrides — then
 * `.phyllum/session.json`, where `init` recorded a preference before the config
 * file existed. One meaning, two spellings, and neither is fatal when malformed.
 */
export function harnessPreference(root) {
  const preferred = readPreferences(root)?.harness;
  if (typeof preferred !== 'string' || preferred.trim() === '') return null;
  const known = HARNESS_CONFIGS.find((row) => row.id === preferred.trim().toLowerCase());
  return {
    id: known?.id ?? preferred.trim(),
    name: known?.name ?? preferred.trim(),
  };
}

/**
 * Which harness will execute this PRD?
 *
 * Returns `{ found, id, name, source, config, layer, candidates }`. `found` is
 * false for a project with no harness at all, and that is a supported answer
 * rather than an error — it selects the simple PRD (plan §6.5.1).
 *
 * `home` is injectable so the user-level memory layer is testable without
 * reading the machine's real home directory.
 */
export function detectHarness(root, { home = null } = {}) {
  const resolved = path.resolve(root);
  const homeDir = home ?? safeHome();

  // Layer 1 — the codebase's own agent config. Every match is reported, because
  // a repo with both CLAUDE.md and AGENTS.md is a fact worth stating in the PRD.
  const candidates = HARNESS_CONFIGS.filter((row) => exists(path.join(resolved, row.file)));
  if (candidates.length > 0) {
    const [first] = candidates;
    return {
      found: true,
      id: first.id,
      name: first.name,
      config: first.file,
      layer: 'config',
      source: `\`${first.file}\` in the project root`,
      candidates: candidates.map((row) => row.file),
    };
  }

  // Layer 2 — what `init` was told.
  const preferred = harnessPreference(resolved);
  if (preferred) {
    return {
      found: true,
      id: preferred.id,
      name: preferred.name,
      config: null,
      layer: 'preference',
      source: `the harness preference recorded in \`${CONFIG_FILE}\` or \`${STATE_DIR}/session.json\``,
      candidates: [],
    };
  }

  // Layer 3 — agent memory, project-level first, then user-level.
  for (const entry of MEMORY_FILES) {
    const base = entry.scope === 'user' ? homeDir : resolved;
    if (!base) continue;
    const file = path.join(base, entry.rel);
    if (!exists(file)) continue;
    return {
      found: true,
      id: entry.id,
      name: entry.name,
      config: entry.scope === 'project' ? entry.rel : null,
      layer: 'memory',
      source:
        entry.scope === 'user'
          ? `\`~/${entry.rel}\` — agent memory, not this project's own config`
          : `\`${entry.rel}\` — agent memory, not this project's own config`,
      candidates: [],
    };
  }

  return {
    found: false,
    id: null,
    name: null,
    config: null,
    layer: 'none',
    source: null,
    candidates: [],
  };
}

function safeHome() {
  try {
    return os.homedir();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The host project's own tests
// ---------------------------------------------------------------------------

/**
 * What does this project run to prove itself?
 *
 * Per-phase verification is the acceptance criteria **and** the host project's
 * own test suite when one is detected (plan §6.5.3). Detected, not assumed: a
 * project with no suite gets a PRD that says so, rather than a phase that fails
 * on a command nobody ever wrote.
 *
 * It belongs beside harness detection because it answers the same kind of
 * question — what does this project already use to do work? — from the same
 * kind of evidence, and one glance at the manifest serves both.
 */
export const TEST_SUITE_HINTS = [
  { file: 'pytest.ini', command: 'pytest', name: 'pytest' },
  { file: 'Cargo.toml', command: 'cargo test', name: 'Cargo' },
  { file: 'go.mod', command: 'go test ./...', name: 'Go' },
  { file: 'Gemfile', command: 'bundle exec rspec', name: 'RSpec' },
];

export function detectTestSuite(root) {
  const resolved = path.resolve(root);

  // A `test` script in package.json is the strongest evidence there is: it is
  // the command the project's own author wrote down.
  const manifest = path.join(resolved, 'package.json');
  if (exists(manifest)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      const script = parsed?.scripts?.test;
      if (typeof script === 'string' && script.trim() !== '' && !/no test specified/i.test(script)) {
        return {
          found: true,
          command: 'npm test',
          name: 'the project’s own `npm test`',
          evidence: 'the `test` script in package.json',
        };
      }
    } catch {
      // an unparseable manifest is not evidence
    }
  }

  for (const hint of TEST_SUITE_HINTS) {
    if (!exists(path.join(resolved, hint.file))) continue;
    return {
      found: true,
      command: hint.command,
      name: hint.name,
      evidence: `\`${hint.file}\``,
    };
  }

  return { found: false, command: null, name: null, evidence: null };
}
