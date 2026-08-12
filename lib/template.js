/**
 * The canonical DESIGN-SYSTEM.md template (plan §7.1.1).
 *
 * The template ships as a file so a human can read the contract, and the
 * assertion suite proves it is byte-identical to what the renderer produces
 * for an empty system — template and code can never drift.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = path.resolve(here, '..');
export const TEMPLATE_PATH = path.join(PACKAGE_ROOT, 'templates', 'DESIGN-SYSTEM.md');
export const SKILL_DIR = path.join(PACKAGE_ROOT, 'skill');

let cachedVersion = null;

/** The installed Phyllum version, read from package.json. */
export function packageVersion() {
  if (cachedVersion === null) {
    const raw = fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8');
    cachedVersion = JSON.parse(raw).version;
  }
  return cachedVersion;
}

/** The template with its placeholders still in place. */
export function readTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

/** The template with {{PROJECT}} / {{VERSION}} / {{CREATED}} filled in. */
export function instantiateTemplate(meta) {
  return readTemplate()
    .replaceAll('{{PROJECT}}', meta.project)
    .replaceAll('{{VERSION}}', meta.version)
    .replaceAll('{{CREATED}}', meta.created);
}

/** Best guess at the project's name: package.json name, else the folder name. */
export function detectProjectName(root) {
  const manifest = path.join(root, 'package.json');
  if (fs.existsSync(manifest)) {
    try {
      const name = JSON.parse(fs.readFileSync(manifest, 'utf8')).name;
      if (typeof name === 'string' && name.length > 0) return name;
    } catch {
      // A malformed package.json is the project's business, not ours.
    }
  }
  return path.basename(path.resolve(root));
}

/** Every file that makes up the skill, as paths relative to skill/. */
export function skillFiles() {
  const files = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else files.push(rel);
    }
  };
  walk(SKILL_DIR, '');
  return files;
}
