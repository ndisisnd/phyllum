#!/usr/bin/env node
/**
 * Post-install banner.
 *
 * npm runs this after `npm install -g phyllum`. It prints a short welcome that
 * points the user at the two entry commands and the repo. Kept quiet in CI: npm
 * sets `npm_config_loglevel` to `silent`/`error` there, so we skip the noise.
 */

import process from 'node:process';

const level = process.env.npm_config_loglevel;
if (level === 'silent' || level === 'error') {
  process.exit(0);
}

process.stdout.write(
  [
    'Build, lint, and maintain design systems with Phyllum!',
    'Run `phyllum init` to start creating your design system in your codebase,',
    'or `phyllum assess` to read your existing codebase and create components.',
    'Check out GitHub on https://github.com/ndisisnd/phyllum',
    '',
  ].join('\n') + '\n',
);
