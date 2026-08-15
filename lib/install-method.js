/**
 * How was this copy of Phyllum installed? (plan v0.2.0 §4)
 *
 * `upgrade` cannot be one command. Upgrading a global install, upgrading a
 * project dev dependency and upgrading a one-off `npx` run are three different
 * acts, and one of them is not an act at all. So the upgrade command asks this
 * file first, and this file only ever *looks* — every function here reads paths
 * and manifests and returns a description. Nothing here runs a package manager;
 * that is `upgrade-command.js`, and it runs only what this file says is right.
 *
 * The shape of the answer is deliberately honest about its own limits:
 *
 *   kind      'global' · 'project' · 'ephemeral' · 'source' · 'unknown'
 *   manager   'npm' · 'pnpm' · 'yarn' · 'bun' · null when nothing says
 *   evidence  the signals that led here, so a refusal can explain itself
 *
 * v0.2.0 supports npm and pnpm, global and project (plan §4 decision). Anything
 * else — a `dlx` run with nothing to update, a source checkout, a package
 * manager Phyllum does not drive — is refused with the exact command to run by
 * hand. A refusal is never a guess: Phyllum would rather say "I do not know how
 * you installed me" than install a second copy somewhere you did not ask for.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { PACKAGE_NAME } from './npm-registry.js';
import { PACKAGE_ROOT } from './template.js';

/** The package managers `upgrade` will drive itself. */
export const SUPPORTED_MANAGERS = ['npm', 'pnpm'];

/** Managers Phyllum recognises well enough to name the right command for. */
export const KNOWN_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];

const LOCKFILES = [
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'package-lock.json', manager: 'npm' },
  { file: 'npm-shrinkwrap.json', manager: 'npm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'bun.lockb', manager: 'bun' },
  { file: 'bun.lock', manager: 'bun' },
];

/** A binary on PATH, or null. A lookup, not an invocation (cf. claude-cli.js). */
export function findOnPath(name, env = process.env) {
  const raw = env.PATH ?? '';
  const suffixes = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const dir of raw.split(path.delimiter)) {
    if (dir === '') continue;
    for (const suffix of suffixes) {
      const candidate = path.join(dir, `${name}${suffix}`);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

/** The manager that invoked us, from the user agent npm and pnpm both set. */
export function managerFromUserAgent(env = process.env) {
  const agent = env.npm_config_user_agent ?? '';
  const first = agent.split(/\s+/)[0] ?? '';
  const name = first.split('/')[0].toLowerCase();
  return KNOWN_MANAGERS.includes(name) ? name : null;
}

/** The manager a path betrays: pnpm's virtual store, or a pnpm/yarn home. */
export function managerFromPath(target) {
  const segments = String(target).split(path.sep);
  if (segments.includes('.pnpm') || segments.includes('pnpm')) return 'pnpm';
  if (segments.includes('.yarn') || segments.includes('yarn')) return 'yarn';
  if (segments.includes('.bun') || segments.includes('bun')) return 'bun';
  return null;
}

/** The manager a project's lockfile implies, or null when it has none. */
export function managerFromLockfile(root) {
  for (const { file, manager } of LOCKFILES) {
    if (fs.existsSync(path.join(root, file))) return manager;
  }
  return null;
}

/** Is this package listed in that project's manifest, and how? */
export function dependencyKind(projectRoot, name = PACKAGE_NAME) {
  const manifestPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(manifestPath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
  if (manifest?.devDependencies?.[name]) return 'dev';
  if (manifest?.dependencies?.[name]) return 'prod';
  if (manifest?.name === name) return 'self';
  return null;
}

/**
 * A one-off run leaves the package in a manager's exec cache: npm uses an
 * `_npx` directory, pnpm and yarn a `dlx` one. There is nothing to update in
 * either — the next run fetches afresh — so this is checked before anything
 * else and refused rather than acted on.
 */
function ephemeralSignal(packageRoot) {
  const segments = packageRoot.split(path.sep);
  if (segments.includes('_npx')) return { manager: 'npm', how: 'npx', segment: '_npx' };
  const dlx = segments.find((segment) => segment === 'dlx' || segment.startsWith('dlx-'));
  if (dlx) return { manager: managerFromPath(packageRoot) ?? 'pnpm', how: 'dlx', segment: dlx };
  return null;
}

/**
 * Describe this install.
 *
 * options: { packageRoot, env, cwd } — all injectable, so the assertion suite
 * drives real directory layouts in a sandbox rather than mocking the module.
 */
export function detectInstall(options = {}) {
  const {
    packageRoot = PACKAGE_ROOT,
    env = process.env,
    cwd = process.cwd(),
    name = PACKAGE_NAME,
  } = options;

  const root = path.resolve(packageRoot);
  const evidence = [];

  const ephemeral = ephemeralSignal(root);
  if (ephemeral) {
    evidence.push(`the package lives under "${ephemeral.segment}", a one-off exec cache`);
    return {
      kind: 'ephemeral',
      manager: ephemeral.manager,
      how: ephemeral.how,
      packageRoot: root,
      projectRoot: null,
      saveAs: null,
      supported: false,
      evidence,
    };
  }

  const segments = root.split(path.sep);
  const nodeModules = segments.indexOf('node_modules');
  if (nodeModules === -1) {
    evidence.push('the package is not inside any node_modules directory');
    return {
      kind: 'source',
      manager: managerFromUserAgent(env),
      packageRoot: root,
      projectRoot: null,
      saveAs: null,
      supported: false,
      evidence,
    };
  }

  // The directory that owns the node_modules we are in. For pnpm that is still
  // the project root, because its virtual store nests a second node_modules
  // *inside* the first one and the first one is the one that counts.
  const installRoot = segments.slice(0, nodeModules).join(path.sep) || path.sep;
  const saveAs = dependencyKind(installRoot, name);

  const manager =
    managerFromUserAgent(env) ??
    managerFromPath(root) ??
    (saveAs ? managerFromLockfile(installRoot) : null) ??
    (fs.existsSync(path.join(installRoot, 'node_modules', '.pnpm')) ? 'pnpm' : null);

  if (managerFromUserAgent(env)) evidence.push(`npm_config_user_agent names ${managerFromUserAgent(env)}`);

  if (saveAs === 'dev' || saveAs === 'prod') {
    evidence.push(
      `${installRoot}/package.json lists ${name} as a ${saveAs === 'dev' ? 'dev dependency' : 'dependency'}`,
    );
    if (!managerFromUserAgent(env) && managerFromLockfile(installRoot)) {
      evidence.push(`the project's lockfile is ${managerFromLockfile(installRoot)}'s`);
    }
    return {
      kind: 'project',
      manager,
      packageRoot: root,
      projectRoot: installRoot,
      saveAs,
      supported: SUPPORTED_MANAGERS.includes(manager),
      evidence,
    };
  }

  evidence.push(`the package sits in ${installRoot}/node_modules, which no project manifest depends on`);
  const globalManager = manager ?? 'npm';
  if (!manager) evidence.push('nothing names a package manager, so npm — the default — is assumed');
  return {
    kind: 'global',
    manager: globalManager,
    packageRoot: root,
    projectRoot: null,
    saveAs: null,
    supported: SUPPORTED_MANAGERS.includes(globalManager),
    evidence,
  };
}

/** The command that installs the latest version, per manager and per install. */
export function updateCommandFor(install, { name = PACKAGE_NAME } = {}) {
  const spec = `${name}@latest`;
  const { manager, kind, saveAs } = install;

  if (kind === 'global') {
    if (manager === 'npm') return { bin: 'npm', args: ['install', '--global', spec] };
    if (manager === 'pnpm') return { bin: 'pnpm', args: ['add', '--global', spec] };
    if (manager === 'yarn') return { bin: 'yarn', args: ['global', 'add', spec] };
    if (manager === 'bun') return { bin: 'bun', args: ['add', '--global', spec] };
    return null;
  }

  if (kind === 'project') {
    const dev = saveAs === 'dev';
    if (manager === 'npm') return { bin: 'npm', args: ['install', dev ? '--save-dev' : '--save', spec] };
    if (manager === 'pnpm') return { bin: 'pnpm', args: ['add', ...(dev ? ['--save-dev'] : []), spec] };
    if (manager === 'yarn') return { bin: 'yarn', args: ['add', ...(dev ? ['--dev'] : []), spec] };
    if (manager === 'bun') return { bin: 'bun', args: ['add', ...(dev ? ['--dev'] : []), spec] };
    return null;
  }

  // Nothing to update: an exec cache is thrown away, a checkout is git's.
  return null;
}

/** The command as a person would type it. */
export function commandLine(command) {
  return command ? [command.bin, ...command.args].join(' ') : null;
}

/** The install command for a first-time permanent install, per manager. */
export function installCommandFor(manager, { name = PACKAGE_NAME } = {}) {
  if (manager === 'pnpm') return `pnpm add --global ${name}`;
  if (manager === 'yarn') return `yarn global add ${name}`;
  if (manager === 'bun') return `bun add --global ${name}`;
  return `npm install --global ${name}`;
}
