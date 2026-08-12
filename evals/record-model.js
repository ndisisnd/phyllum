#!/usr/bin/env node
/**
 * Record the model-dependent evals (plan §8.5, "eval reproducibility").
 *
 * The evals that are really about judgement — `create`'s extraction,
 * anti-fabrication and values-are-free, and `tokenise`'s naming — can be graded
 * two ways: against Phyllum's own deterministic answer, which needs no model, and
 * against a real model run following the same reference file the skill follows.
 * This script produces the second kind, **offline**: it shells out to the
 * `claude` CLI once per case and commits the answer under
 * `evals/fixtures/recordings/`.
 *
 * Recording is a deliberate act, never part of a test run. The suite grades the
 * committed recordings, so scores stay reproducible on a machine with no model
 * at all, and nothing anywhere invents what a model "would have" said.
 *
 * Usage:
 *   node evals/record-model.js                 # every model-dependent eval
 *   node evals/record-model.js create-values-free
 *   node evals/record-model.js --model haiku
 *
 * Re-record when the prompt set changes, when refs/create.md changes the rules,
 * or when moving to a newer model. Commit the result with the change.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { EVALS, PACKAGE_ROOT, RECORDINGS_DIR } from './graders.js';
import { findClaudeCli } from '../lib/claude-cli.js';

const execFileAsync = promisify(execFile);

const argv = process.argv.slice(2);
const modelIndex = argv.indexOf('--model');
const model = modelIndex === -1 ? null : argv[modelIndex + 1];
const wanted = argv.filter((arg) => !arg.startsWith('--') && arg !== model);

const readText = (rel) => fs.readFileSync(path.join(PACKAGE_ROOT, rel), 'utf8');

/** Which subskill an eval belongs to, and therefore which contract it obeys. */
const familyOf = (evalId) => {
  if (evalId.startsWith('tokenise')) return 'tokenise';
  if (evalId === 'create-image-trace') return 'image';
  return 'create';
};

const CONTRACTS = {
  create: () => readText('skill/refs/create.md'),
  image: () => readText('skill/refs/create.md'),
  // The naming scales live in refs/tokenise.md and the scanning contract moved to
  // refs/assess.md in v0.2.0 M3, so a `tokenise-*` eval needs both to be judged
  // against the whole contract. (`tokenise-clustering` is really `assess`'s eval
  // now; renaming the id means re-recording the baseline, which is M8's job.)
  tokenise: () => `${readText('skill/refs/tokenise.md')}\n\n${readText('skill/refs/assess.md')}`,
};

const OPENING = {
  create: 'You are running the Phyllum `create` subskill in prose mode (Mode A).',
  image: 'You are running the Phyllum `create` subskill in image mode (Mode B).',
  tokenise: 'You are running the Phyllum `tokenise` subskill.',
};

function promptFor(spec, testCase) {
  const family = familyOf(spec.eval);
  const parts = [
    OPENING[family],
    'These are its rules — follow them exactly:',
    '',
    CONTRACTS[family](),
    '',
    spec.recordingPrompt,
    '',
  ];

  if (family === 'tokenise') {
    parts.push(
      'The cluster to name:',
      '',
      JSON.stringify(testCase.cluster, null, 2),
      '',
      'Reply with JSON only.',
    );
    return parts.join('\n');
  }

  if (family === 'image') {
    // The image travels as a path: `claude` reads it, this script never does.
    parts.push(
      `The image to trace: ${path.join(PACKAGE_ROOT, testCase.image)}`,
      '',
      'Read that image and reply with JSON only, in the trace result shape above.',
    );
    return parts.join('\n');
  }

  if (testCase.fixture) {
    parts.push("The project's DESIGN-SYSTEM.md:", '', readText(testCase.fixture), '');
  }
  parts.push(`Description: ${JSON.stringify(testCase.prompt)}`, '', 'Reply with JSON only.');
  return parts.join('\n');
}

/**
 * An image reply: the measurements as they came back, untouched. Ingestion is
 * Phyllum's job and is what the eval grades, so nothing is normalised here beyond
 * the shape — a malformed measurement stays malformed and is graded as such.
 */
function normaliseTrace(reply) {
  return {
    name: reply.name ?? null,
    archetype: reply.archetype ?? null,
    measurements: Array.isArray(reply.measurements) ? reply.measurements : [],
    unmeasurable: Array.isArray(reply.unmeasurable) ? reply.unmeasurable : [],
  };
}

/** A tokenise reply: the names it proposed, keyed by the value they name. */
function normaliseProposals(reply) {
  const raw = Array.isArray(reply.proposals) ? reply.proposals : [reply];
  return raw
    .filter((proposal) => proposal && proposal.name)
    .map((proposal) => ({ value: String(proposal.value ?? ''), name: String(proposal.name) }));
}

/** Pull the first JSON object out of a reply, tolerating a code fence. */
function parseReply(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`no JSON in reply: ${text.slice(0, 200)}`);
  return JSON.parse(body.slice(start, end + 1));
}

/** Normalise whatever shape came back into the draft shape the graders read. */
function normalise(reply) {
  const draft = reply.draft ?? reply;
  const properties = Array.isArray(draft.properties)
    ? draft.properties.map((property) => ({
        key: property.key ?? property.property ?? property.name,
        slot: property.slot ?? null,
        value: String(property.value),
        origin: property.origin ?? 'prose',
      }))
    : Object.entries(draft.properties ?? {}).map(([key, value]) => ({
        key,
        slot: null,
        value: String(value),
        origin: 'prose',
      }));

  const rawStates = draft.states ?? [];
  const states = Array.isArray(rawStates)
    ? rawStates.map((state) => ({
        name: state.name,
        properties: Array.isArray(state.properties)
          ? state.properties.map((property) => ({
              key: property.key ?? property.property,
              value: String(property.value),
              origin: property.origin ?? 'prose',
            }))
          : Object.entries(state.properties ?? {}).map(([key, value]) => ({
              key,
              value: String(value),
              origin: 'prose',
            })),
      }))
    : Object.entries(rawStates).map(([name, value]) => ({
        name,
        properties:
          typeof value === 'string'
            ? []
            : Object.entries(value).map(([key, inner]) => ({
                key,
                value: String(inner),
                origin: 'prose',
              })),
        ...(typeof value === 'string' ? { note: value } : {}),
      }));

  return { name: draft.name ?? null, archetype: draft.archetype ?? null, properties, states };
}

/** What a recording holds, by family: proposed names, a trace, or a draft. */
function recordedAnswer(evalId, reply) {
  const family = familyOf(evalId);
  if (family === 'tokenise') return { proposals: normaliseProposals(reply) };
  if (family === 'image') return { trace: normaliseTrace(reply) };
  return { draft: normalise(reply) };
}

async function main() {
  const cli = findClaudeCli();
  if (!cli) {
    process.stderr.write(
      'No `claude` on PATH, so there is nothing to record from. Install Claude Code and try again;\n' +
        'nothing here will invent a model answer.\n',
    );
    return 1;
  }

  const targets = EVALS.filter(
    (item) => item.modelDependent && (wanted.length === 0 || wanted.includes(item.id)),
  );

  for (const item of targets) {
    const spec = JSON.parse(readText(`evals/prompts/${item.id}.json`));
    const dir = path.join(RECORDINGS_DIR, item.id);
    fs.mkdirSync(dir, { recursive: true });

    for (const testCase of spec.cases) {
      const args = ['-p', promptFor(spec, testCase)];
      if (model) args.push('--model', model);
      process.stdout.write(`recording ${item.id}/${testCase.id} … `);
      try {
        const { stdout } = await execFileAsync(cli, args, {
          maxBuffer: 8 * 1024 * 1024,
          timeout: 180000,
        });
        const reply = parseReply(stdout);
        const record = {
          eval: item.id,
          case: testCase.id,
          prompt: testCase.prompt ?? null,
          fixture: testCase.fixture ?? null,
          ...(testCase.image ? { image: testCase.image } : {}),
          recordedAt: new Date().toISOString().slice(0, 10),
          model: model ?? 'claude-code default',
          how: 'node evals/record-model.js — a real `claude` run, committed verbatim',
          ...recordedAnswer(item.id, reply),
        };
        fs.writeFileSync(
          path.join(dir, `${testCase.id}.json`),
          `${JSON.stringify(record, null, 2)}\n`,
        );
        process.stdout.write('ok\n');
      } catch (error) {
        process.stdout.write(`failed: ${error.message.split('\n')[0]}\n`);
      }
    }
  }
  return 0;
}

process.exitCode = await main();
