/**
 * Reading the machine-readable tables out of the skill's reference files.
 *
 * Both `refs/create.md` and `refs/tokenise.md` carry their contract as Markdown
 * tables marked with an HTML comment, and both the CLI and the assertion suite
 * read those tables rather than restating them. This module is the one reader,
 * so a table means the same thing everywhere it is used.
 */

const isSeparatorRow = (line) => /^\|[\s:|-]+\|$/.test(line.trim());

/** The em dash spelling of "nothing here". */
export const isNone = (cell) => cell === '' || cell === '—' || cell === '-' || cell === 'none';

export const stripTicks = (cell) => cell.replace(/`/g, '').trim();

export const splitRow = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

/** Split a cell of comma-separated items, dropping the "none" spelling. */
export function listCell(cell) {
  if (isNone(cell)) return [];
  return cell
    .split(',')
    .map((item) => stripTicks(item))
    .filter((item) => item.length > 0);
}

/** The first Markdown table after `marker`, as rows of cells (no header). */
export function tableAfter(text, marker, file = 'the reference file') {
  const index = text.indexOf(marker);
  if (index === -1) throw new Error(`${file} is missing the ${marker} table marker`);
  const lines = text.slice(index + marker.length).split('\n');
  const rows = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (started) break;
      continue;
    }
    if (!started) {
      started = true; // the header row
      continue;
    }
    if (isSeparatorRow(trimmed)) continue;
    rows.push(splitRow(trimmed));
  }
  if (rows.length === 0) throw new Error(`the ${marker} table in ${file} is empty`);
  return rows;
}

/**
 * A cell like `>= 85` or `<= 15`, as a predicate. The em dash means "no
 * condition", which is how a table row spells "this one always matches".
 */
export function comparatorCell(cell) {
  const trimmed = stripTicks(cell);
  if (isNone(trimmed)) return null;
  const match = trimmed.match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) throw new Error(`"${cell}" is not a comparison a table cell can hold`);
  const operator = match[1] ?? '=';
  const bound = Number(match[2]);
  return { operator, bound, test: (value) => compare(value, operator, bound) };
}

function compare(value, operator, bound) {
  if (operator === '>=') return value >= bound;
  if (operator === '<=') return value <= bound;
  if (operator === '>') return value > bound;
  if (operator === '<') return value < bound;
  return value === bound;
}

/** A plain number cell, or null when the row spells it as nothing. */
export function numberCell(cell) {
  const trimmed = stripTicks(cell);
  if (isNone(trimmed)) return null;
  const value = Number(trimmed.replace(/\+$/, ''));
  return Number.isFinite(value) ? value : null;
}
