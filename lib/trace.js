/**
 * `create` — image mode, the deterministic frame around the tracing (plan §3.1
 * Mode B, §7.3, §8.5).
 *
 * The measuring itself is vision work, and vision lives in Claude Code: either
 * the skill is already running inside a session, or the terminal shells out to
 * the `claude` CLI. Nothing in this file looks at a pixel, and nothing in it
 * calls a model. What it owns is the honest frame on both sides of that step:
 *
 *   Before — validate the file, and build the trace request: exactly what to
 *   measure (read from `skill/refs/create/`), how to report confidence, and
 *   the reply shape.
 *
 *   After — ingest the trace result. This is where the anti-fabrication
 *   invariant is enforced for image mode: a measurement becomes a value only if
 *   it names a property an image can actually show and clears that property's
 *   confidence bar. Everything else becomes a question. Nothing is invented,
 *   and nothing plausible is quietly promoted to fact.
 */

import fs from 'node:fs';
import path from 'node:path';

import { contractFor, traceRuleFor, traceRules } from './archetypes.js';
import { addProperty, newDraft } from './create.js';
import { deltaE, normaliseValue, toPx } from './tokenise.js';

/** Extensions that select image mode (plan §2.2 argument grammar). */
export const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.bmp',
  '.svg',
]);

/** Does this argument look like a path to an image, quoting aside? */
export function looksLikeImagePath(value) {
  return IMAGE_EXTENSIONS.has(path.extname(String(value ?? '')).toLowerCase());
}

/**
 * Is this argument an image Phyllum can hand over to be traced?
 *
 * Returns `{ ok }` with the reason named when it is not. A typo'd path is an
 * error with its own message, never a silent fall back to prose — the two mean
 * completely different things and guessing between them helps nobody.
 */
export function validateImage(root, rawPath) {
  const value = String(rawPath ?? '');
  const extension = path.extname(value).toLowerCase();
  const file = path.isAbsolute(value) ? value : path.join(root, value);

  if (!IMAGE_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      reason: 'extension',
      file,
      extension,
      message:
        `\`${value}\` is not an image Phyllum can trace: ${extension || 'no extension'} is not one of ` +
        `${[...IMAGE_EXTENSIONS].join(', ')}.\n`,
    };
  }

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return {
      ok: false,
      reason: 'missing',
      file,
      extension,
      message:
        `There is no image at \`${value}\` (looked in ${path.resolve(root)}).\n` +
        'Check the path, or quote the argument if you meant it as a description: ' +
        `\`phyllum create "${value}"\`.\n`,
    };
  }

  if (!stat.isFile()) {
    return {
      ok: false,
      reason: 'not-a-file',
      file,
      extension,
      message: `\`${value}\` is a directory, not an image file.\n`,
    };
  }

  try {
    fs.accessSync(file, fs.constants.R_OK);
  } catch {
    return {
      ok: false,
      reason: 'unreadable',
      file,
      extension,
      message: `\`${value}\` exists but cannot be read — check its permissions.\n`,
    };
  }

  return { ok: true, file, extension, bytes: stat.size, input: value };
}

/**
 * The trace request: the instruction handed to whoever has the eyes.
 *
 * It is generated from the same table the ingestion reads, so what is asked for
 * and what is accepted can never drift apart. The image travels as a path — the
 * request is text.
 */
export function traceRequest({ file, archetype = null, model = null } = {}) {
  const contract = contractFor(archetype);
  const rows = traceRules();

  const lines = [
    'Trace this image into a component spec (Phyllum `create`, Mode B).',
    `Image: ${file}`,
    '',
    'Measure only what the image actually shows, and report each measurement with',
    'a confidence between 0 and 1. Anything you cannot see, leave out or list under',
    '`unmeasurable` — do not supply a plausible value for it.',
    '',
    'Measurable properties, and the confidence each one needs to be recorded rather',
    'than asked about:',
  ];
  for (const row of rows) {
    lines.push(`  - ${row.property} (${row.kind}) — min confidence ${row.minConfidence}`);
  }

  if (contract) {
    lines.push(
      '',
      `The component is a ${contract.name}. Its contract asks for: ${contract.slots.join(', ')}.`,
      `Its states (${contract.states.join(', ') || 'none'}) cannot be traced from a still image —`,
      'leave them out; Phyllum will ask about them.',
    );
  } else {
    lines.push(
      '',
      'Name the archetype you believe this is (button, input, card, badge, modal).',
      'If it is not clear from the image, leave `archetype` null rather than choosing one.',
    );
  }

  if (model && (model.tokens?.colours ?? []).length > 0) {
    lines.push(
      '',
      'The system already names these colours; if a measurement matches one, say so in',
      '`note` — but report the measured value either way:',
    );
    for (const row of model.tokens.colours) lines.push(`  - ${row[0]} (${row[1]})`);
  }

  lines.push(
    '',
    'Reply with JSON only, in this shape:',
    '{ "name": "Button/Primary", "archetype": "button",',
    '  "measurements": [ { "property": "background", "value": "#2563EB", "confidence": 0.97 } ],',
    '  "unmeasurable": ["shadow"] }',
    '',
  );
  return lines.join('\n');
}

/** A traced reading that did not clear its bar, phrased as context for a question. */
function questionFrom(rule, measurement, kind) {
  return {
    kind,
    slot: rule.slot,
    property: rule.property,
    // A traced question is about one measured property, not about the whole
    // slot: skipping "how wide is the border?" must not silently write off the
    // border colour too. So a skip here is recorded against the property.
    skipAs: rule.property,
    archetype: null,
    reading: measurement?.value ?? null,
    confidence: measurement?.confidence ?? null,
    note: measurement?.note ?? null,
  };
}

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Trace result -> draft (plan §3.1 Mode B, and the anti-fabrication invariant).
 *
 * Returns the draft, the questions the trace could not answer, and what was
 * refused and why — refusals are reported, not swallowed, because a trace that
 * keeps claiming untraceable things is a thing the user should see.
 */
export function ingestTrace(result, { now, archetype = null, file = null } = {}) {
  const source = result && typeof result === 'object' ? result : {};
  const draft = newDraft({ mode: 'image', input: file ?? source.file ?? '', now });
  draft.source.image = file ?? source.file ?? null;

  const contract = contractFor(archetype ?? source.archetype);
  if (contract) {
    draft.archetype = contract.key;
    draft.archetypeName = contract.name;
    draft.name = typeof source.name === 'string' && source.name.trim() !== ''
      ? source.name.trim()
      : `${contract.name}/Default`;
  } else {
    draft.unknownArchetype = true;
  }

  const questions = [];
  const refused = [];
  const seen = new Set();

  for (const raw of Array.isArray(source.measurements) ? source.measurements : []) {
    const property = typeof raw?.property === 'string' ? raw.property.trim() : '';
    const rule = traceRuleFor(property);

    if (!rule) {
      refused.push({
        property: property || '(unnamed)',
        why: 'a still image cannot show it, so it is not a measurement',
      });
      continue;
    }
    if (raw.value === undefined || raw.value === null || String(raw.value).trim() === '') {
      refused.push({ property, why: 'the measurement carried no value' });
      continue;
    }
    if (!isFiniteNumber(raw.confidence)) {
      refused.push({ property, why: 'the measurement carried no confidence' });
      continue;
    }
    if (seen.has(property)) {
      refused.push({ property, why: 'the same property was measured twice' });
      continue;
    }
    seen.add(property);

    if (raw.confidence < rule.minConfidence) {
      // Below the bar the reading is context for a question, never a value.
      questions.push(questionFrom(rule, raw, 'traced-low-confidence'));
      continue;
    }

    addProperty(draft, {
      key: rule.property,
      slot: rule.slot,
      value: String(raw.value).trim(),
      origin: 'image',
    });
  }

  for (const raw of Array.isArray(source.unmeasurable) ? source.unmeasurable : []) {
    const property = typeof raw === 'string' ? raw.trim() : String(raw?.property ?? '').trim();
    const rule = traceRuleFor(property);
    if (!rule) {
      // Something the table does not cover — a state, usually. The contract
      // already asks about those, so it needs no question of its own.
      refused.push({ property: property || '(unnamed)', why: 'not a property an image can show' });
      continue;
    }
    if (seen.has(property)) continue;
    seen.add(property);
    questions.push(questionFrom(rule, null, 'traced-unmeasurable'));
  }

  return { draft, questions, refused };
}

/**
 * The traced questions, then the contract's own gaps — one list, no slot asked
 * about twice. The traced ones lead because they carry the extra context.
 */
export function mergeTraceGaps(questions, gaps) {
  const claimed = new Set(questions.map((question) => question.slot));
  return [...questions, ...gaps.filter((gap) => !claimed.has(gap.slot))];
}

/**
 * Is a traced value close enough to the truth, by the tolerance the contract
 * table states for that property? Colours are compared perceptually (ΔE),
 * lengths in pixels, everything else exactly. This is what the image-mode eval
 * holds a trace to, so it reads the tolerance from the table rather than
 * hard-coding a number that could drift away from the documentation.
 */
export function withinTolerance(rule, measured, truth) {
  if (!rule || measured === undefined || measured === null || truth === undefined || truth === null) {
    return false;
  }
  const tolerance = String(rule.tolerance ?? '').trim();

  const colour = tolerance.match(/ΔE\s*<\s*([\d.]+)/);
  if (colour) return deltaE(String(measured), String(truth)) < Number(colour[1]);

  const length = tolerance.match(/±\s*([\d.]+)px/);
  if (length) {
    const one = toPx(String(measured));
    const two = toPx(String(truth));
    if (one === null || two === null) return false;
    return Math.abs(one - two) <= Number(length[1]);
  }

  return normaliseValue(String(measured)) === normaliseValue(String(truth));
}

/** What the trace found, as text the user reads before answering anything. */
export function renderTraceSummary({ draft, questions, refused }) {
  const lines = [];
  lines.push(`Traced ${draft.source.image ?? 'the image'}:`);
  if (draft.properties.length === 0) {
    lines.push('  nothing could be measured confidently — every slot is a question below.');
  }
  for (const property of draft.properties) {
    lines.push(`  ${property.key}: ${property.value}   (measured)`);
  }
  for (const question of questions) {
    lines.push(
      question.reading
        ? `  ${question.property}: reads about ${question.reading}, confidence ${question.confidence} — asking rather than recording it`
        : `  ${question.property}: could not be measured — asking`,
    );
  }
  for (const item of refused) {
    lines.push(`  dropped ${item.property}: ${item.why}`);
  }
  return lines.join('\n');
}
