#!/usr/bin/env node
/**
 * Cut a release without cutting a corner (plan v0.7.2 §3).
 *
 * The version bump and the baseline re-record used to be two manual steps, and
 * forgetting the second one cost a diagnose-and-repair loop per release: the
 * suite stays green, but `evals/baseline.json` quietly names the old version.
 * This script makes the pair one act, in a fixed order:
 *
 *   1. bump `package.json` (patch or minor, no git side effects — the version
 *      module, not `npm version`, so the sequence has no shell dependency)
 *   2. `npm run evals:record`, so the baseline carries the new version
 *   3. `npm run check`, so the coupled pair is proven green before this exits
 *
 * It writes files and stops. No step here ever runs `git` — bumping,
 * recording and checking are local acts; committing and tagging the result is
 * the orchestrator's decision, made after this script has already succeeded
 * or already failed.
 *
 * Usage:
 *   node evals/release.js patch
 *   node evals/release.js minor
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = path.join(PACKAGE_ROOT, 'package.json');

/** Bump a semver `x.y.z` string by the given kind. No git, no npm — arithmetic. */
export function bumpVersion(version, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`not a plain semver version: ${version}`);
  const [majorN, minorN, patchN] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (kind === 'patch') return `${majorN}.${minorN}.${patchN + 1}`;
  if (kind === 'minor') return `${majorN}.${minorN + 1}.0`;
  throw new Error(`unknown bump kind: ${kind} (expected "patch" or "minor")`);
}

/** Rewrite `package.json`'s `version` field in place, preserving formatting. */
export function bumpManifest(kind, manifestPath = MANIFEST_PATH) {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  const from = manifest.version;
  const to = bumpVersion(from, kind);
  manifest.version = to;
  const trailingNewline = raw.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}${trailingNewline}`);
  return { from, to };
}

/**
 * The three steps, in order, against a real npm run in `cwd`. `run` is
 * injected so the sequence can be proven without actually shelling out —
 * every call `run` receives is `npm`, an argument array, and nothing else.
 */
export function cutRelease(kind, { cwd = PACKAGE_ROOT, run = defaultRun } = {}) {
  const { from, to } = bumpManifest(kind, path.join(cwd, 'package.json'));
  run('npm', ['run', 'evals:record'], cwd);
  run('npm', ['run', 'check'], cwd);
  return { from, to };
}

function defaultRun(bin, args, cwd) {
  execFileSync(bin, args, { cwd, stdio: 'inherit' });
}

/** The three steps this script runs, named in order — read by its own tests. */
export const STEPS = ['bump package.json version', 'npm run evals:record', 'npm run check'];

async function main() {
  const kind = process.argv[2];
  if (kind !== 'patch' && kind !== 'minor') {
    process.stderr.write('usage: node evals/release.js <patch|minor>\n');
    return 1;
  }
  const { from, to } = cutRelease(kind);
  process.stdout.write(`released ${from} -> ${to}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
