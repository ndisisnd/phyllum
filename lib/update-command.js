/**
 * `phyllum update` (plan v0.2.0 §4).
 *
 * One command instead of an incantation: work out how Phyllum was installed, run
 * that package manager's own update, then re-sync the skill copy so the CLI and
 * the skill can never be two different versions.
 *
 * Four decisions are worth knowing before reading the code.
 *
 *   **It refuses rather than guesses.** `install-method.js` describes the
 *   install; if that description is not one of the four Phyllum drives — npm or
 *   pnpm, global or project — `update` prints the exact command to run by hand
 *   and changes nothing. A one-off `npx` run has nothing to update at all, and
 *   saying so is the honest answer.
 *
 *   **It never checks the registry.** `latest` is resolved by the package
 *   manager, which has to talk to the registry anyway. Phyllum's own registry
 *   check stays where the plan put it: on `phyllum version`, on demand, nowhere
 *   else.
 *
 *   **The package manager is spawned by name with an argument array** — never
 *   through a shell, never with a command string. This and the GUI server are
 *   the only two processes Phyllum starts, and the assertion suite pins both.
 *
 *   **The skill re-sync reads from disk after the install.** The package manager
 *   replaces the package in place, so `skill/` on disk is the *new* skill by the
 *   time the install returns, even though this process is still running the old
 *   JavaScript. Re-syncing therefore lands the version the user just installed —
 *   and it only happens when `init` had installed a copy, because Phyllum does
 *   not create files nobody asked for.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { installSkill } from './init.js';
import {
  commandLine,
  detectInstall,
  findOnPath,
  installCommandFor,
  updateCommandFor,
} from './install-method.js';
import { PACKAGE_NAME } from './npm-registry.js';
import { packageVersion } from './template.js';
import { SKILL_INSTALL_DIR } from './write.js';

/** How long a package-manager install may take before Phyllum stops waiting. */
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** How much of a failing install's output to show. */
const TAIL_LINES = 12;

/**
 * Run a package manager: by resolved path, with an argument array, no shell.
 * Injectable — the assertion suite passes its own runner, so no test ever
 * installs anything.
 */
export function spawnRunner({ bin, args, cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}${error.message}\n` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

const label = (install) => {
  if (install.kind === 'global') return `${install.manager} global install`;
  if (install.kind === 'project') {
    return `${install.manager} project ${install.saveAs === 'dev' ? 'dev dependency' : 'dependency'}`;
  }
  if (install.kind === 'ephemeral') return `one-off \`${install.how}\` run`;
  if (install.kind === 'source') return 'source checkout';
  return 'install of an unrecognised shape';
};

function renderHeader(install) {
  return [`phyllum update — ${label(install)}`, ''];
}

/** Why Phyllum will not act, and what to run instead. Never a dead end. */
export function renderRefusal(install, { installedVersion }) {
  const out = renderHeader(install);

  if (install.kind === 'ephemeral') {
    out.push(
      `This copy came from a one-off \`${install.how}\` run, so it lives in a cache that is thrown`,
      'away — there is nothing here to update, and the next run already fetches the latest version.',
      '',
      'To keep Phyllum around permanently, install it once:',
      `  ${installCommandFor('npm')}`,
      `  ${installCommandFor('pnpm')}`,
    );
  } else if (install.kind === 'source') {
    out.push(
      `This copy runs from a source checkout, not from an installed package:`,
      `  ${install.packageRoot}`,
      'A package manager cannot update a checkout, and Phyllum will not try. Use git for this one.',
    );
  } else {
    const known = updateCommandFor(install);
    out.push(
      `Phyllum updates npm and pnpm installs in v0.2.0, and this one is ${install.manager ?? 'not one Phyllum recognises'}.`,
      'Nothing was changed. Run the update yourself:',
      known ? `  ${commandLine(known)}` : `  your package manager's own "install ${PACKAGE_NAME}@latest"`,
    );
  }

  out.push('', `Still on ${installedVersion}. Nothing was written, installed or removed.`);
  return `${out.join('\n')}\n`;
}

function renderMissingManager(install, { installedVersion, command }) {
  return (
    `${renderHeader(install).join('\n')}` +
    `\`${install.manager}\` is how this copy was installed, but it is not on your PATH any more,\n` +
    'so Phyllum cannot run it for you. Nothing was changed. Run this once it is back:\n' +
    `  ${commandLine(command)}\n\n` +
    `Still on ${installedVersion}.\n`
  );
}

function tail(text) {
  const lines = String(text ?? '').trimEnd().split('\n').filter((line) => line.trim() !== '');
  return lines.slice(-TAIL_LINES).map((line) => `  ${line}`);
}

/**
 * Run `phyllum update`.
 *
 * ctx:
 *   cwd          the project, for a project-dependency update
 *   env          environment, for manager detection and PATH lookup
 *   install      an install description, injected by the assertion suite
 *   run          the package-manager runner; defaults to spawnRunner
 *   timeoutMs    how long to wait for the install
 */
export async function runUpdate(ctx = {}) {
  const root = ctx.cwd ?? process.cwd();
  const env = ctx.env ?? process.env;
  const before = packageVersion();

  const install = ctx.install ?? detectInstall({ env, cwd: root });
  const command = install.supported ? updateCommandFor(install) : null;

  if (!command) {
    return { out: renderRefusal(install, { installedVersion: before }), code: 1, install, ran: null };
  }

  // A manager Phyllum drives, but not one it can find, is still a refusal with
  // a command rather than a crash.
  const bin = ctx.binPath ?? findOnPath(command.bin, env);
  if (!bin) {
    return {
      out: renderMissingManager(install, { installedVersion: before, command }),
      code: 1,
      install,
      ran: null,
    };
  }

  const runner = ctx.run ?? spawnRunner;
  // A project dependency is updated from the project; a global install is not
  // tied to any directory, so it runs from the one the user is standing in.
  const result = await runner({
    bin,
    args: command.args,
    cwd: install.kind === 'project' ? install.projectRoot : root,
    env,
    timeoutMs: ctx.timeoutMs,
  });

  const out = renderHeader(install);
  out.push(`  ran  ${commandLine(command)}`);

  if ((result.code ?? 1) !== 0) {
    out.push('');
    out.push(`That failed (exit ${result.code}), so nothing changed:`);
    out.push(...tail(result.stderr || result.stdout));
    out.push('');
    out.push(`Still on ${before}. Fix the error above, or run the command yourself.`);
    return { out: `${out.join('\n')}\n`, code: 1, install, ran: command, result };
  }

  // Read the version off disk again rather than trusting the cached one: the
  // package the manager just wrote is the truth about what is installed.
  const after = packageVersion({ fresh: true });
  out.push(
    after === before
      ? `  installed  ${after} — already the latest published version`
      : `  installed  ${after}  (was ${before})`,
  );

  // Step two: keep the skill copy in step with the CLI, but only where `init`
  // put one. No skill copy means nothing to re-sync, not a new file to create.
  const skillDir = path.join(root, SKILL_INSTALL_DIR);
  if (fs.existsSync(skillDir)) {
    const files = installSkill(root);
    out.push(
      `  re-synced  ${files.length} skill file${files.length === 1 ? '' : 's'} into ${SKILL_INSTALL_DIR}/`,
    );
  } else {
    out.push(`  skill      none installed here — \`phyllum init\` installs one into ${SKILL_INSTALL_DIR}/`);
  }

  out.push('');
  out.push(
    after === before
      ? 'Nothing moved, and nothing needed to. `phyllum version` checks the registry any time.'
      : 'The CLI and the skill are on the same version again. `phyllum version` confirms it.',
  );
  return { out: `${out.join('\n')}\n`, code: 0, install, ran: command, result, before, after };
}
