/**
 * `.phyllum/config.json` — the settings file (v0.2.0 plan §6.5.2, decided).
 *
 * The plan settles two things about model selection and they pull in the same
 * direction: Fable orchestrating Opus 4.8 agents is the **default, not a
 * hard-coding**, and an override lives in a `.phyllum/` config file — **config
 * only, no CLI flags in v0.2.0**. A flag would make the choice per-invocation,
 * and "which models drive my codebase" is a project decision somebody should be
 * able to read in a file and review in a diff.
 *
 * The file is Phyllum's only user-editable settings file, and it is separate from
 * `.phyllum/session.json` on purpose: session state is machine-written and
 * rewritten constantly, while this is hand-written and must survive untouched.
 * Both live inside the `.phyllum/**` exception the permission model already had.
 *
 *     {
 *       "preferences": { "harness": "claude-code" },
 *       "apply": {
 *         "orchestratorModel": "claude-fable-5",
 *         "agentModel": "claude-opus-4-8",
 *         "statusIntervalMinutes": 5
 *       }
 *     }
 *
 * Every key is optional, and a malformed one is **ignored with a reason** rather
 * than being fatal or being half-applied: a typo in a settings file must not stop
 * somebody from running the plan they already approved. The reasons are returned
 * so `apply run` can print them, because a silently ignored setting is worse than
 * a rejected one.
 */

import fs from 'node:fs';
import path from 'node:path';

import { STATE_DIR } from './write.js';

export const CONFIG_FILE = `${STATE_DIR}/config.json`;

/** The plan's defaults (§6.5.2). Overridable, never inferred from the machine. */
export const DEFAULT_ORCHESTRATOR_MODEL = 'claude-fable-5';
export const DEFAULT_AGENT_MODEL = 'claude-opus-4-8';

/** Guarantee 3: a status report every 5 minutes while a run is in progress. */
export const DEFAULT_STATUS_INTERVAL_MS = 5 * 60 * 1000;

export function configPath(root) {
  return path.join(path.resolve(root), CONFIG_FILE);
}

/** The raw config object, or null. A missing or corrupt file is silence. */
export function readConfigFile(root) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const isModelId = (value) => typeof value === 'string' && /^[a-z][a-z0-9.\-]{2,63}$/.test(value.trim());

/**
 * Which models drive a run, and where each answer came from.
 *
 * Returns `{ orchestratorModel, agentModel, statusIntervalMs, sources, ignored }`.
 * `sources` says `default` or `config` per setting so the report can state it,
 * and `ignored` lists the settings that were present but unusable, with why.
 */
export function readApplyConfig(root) {
  const config = readConfigFile(root);
  const apply = config?.apply;
  const sources = { orchestratorModel: 'default', agentModel: 'default', statusIntervalMs: 'default' };
  const ignored = [];

  let orchestratorModel = DEFAULT_ORCHESTRATOR_MODEL;
  let agentModel = DEFAULT_AGENT_MODEL;
  let statusIntervalMs = DEFAULT_STATUS_INTERVAL_MS;

  if (apply !== undefined && (typeof apply !== 'object' || apply === null || Array.isArray(apply))) {
    ignored.push('`apply` in the config file is not an object, so every setting under it was ignored');
    return { orchestratorModel, agentModel, statusIntervalMs, sources, ignored, file: CONFIG_FILE };
  }

  for (const [key, fallback] of [
    ['orchestratorModel', DEFAULT_ORCHESTRATOR_MODEL],
    ['agentModel', DEFAULT_AGENT_MODEL],
  ]) {
    const value = apply?.[key];
    if (value === undefined) continue;
    if (!isModelId(value)) {
      ignored.push(
        `\`apply.${key}\` is not a model id, so the default (\`${fallback}\`) was used — a model id looks like \`claude-opus-4-8\``,
      );
      continue;
    }
    if (key === 'orchestratorModel') orchestratorModel = value.trim();
    else agentModel = value.trim();
    sources[key] = 'config';
  }

  const minutes = apply?.statusIntervalMinutes;
  if (minutes !== undefined) {
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
      ignored.push('`apply.statusIntervalMinutes` is not a positive number, so the 5-minute cadence was used');
    } else {
      statusIntervalMs = Math.round(minutes * 60 * 1000);
      sources.statusIntervalMs = 'config';
    }
  }

  return { orchestratorModel, agentModel, statusIntervalMs, sources, ignored, file: CONFIG_FILE };
}

/**
 * The recorded preferences, from the config file first and the session file
 * second. Harness detection reads this (plan §6.5.1, layer 2): the config file is
 * where somebody writes a preference down, and `session.json` is where `init`
 * recorded one before this file existed.
 */
export function readPreferences(root) {
  const fromConfig = readConfigFile(root)?.preferences;
  if (typeof fromConfig === 'object' && fromConfig !== null && !Array.isArray(fromConfig)) return fromConfig;
  const session = path.join(path.resolve(root), STATE_DIR, 'session.json');
  if (!fs.existsSync(session)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(session, 'utf8'));
    const prefs = parsed?.preferences;
    return typeof prefs === 'object' && prefs !== null && !Array.isArray(prefs) ? prefs : null;
  } catch {
    return null;
  }
}
