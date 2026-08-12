/**
 * The npm registry lookup behind `phyllum version` (plan v0.2.0 §3).
 *
 * This is the only file in Phyllum that reaches the network, and it is reached
 * by exactly one command. That is a decision, not an accident: a version check
 * is a question the user asked, so it runs when they ask it and never as a
 * background courtesy. No other command calls in here, nothing is cached
 * between runs, and no passive "an update is available" hint is emitted
 * anywhere else in the product.
 *
 * Two more promises shape the code:
 *
 *   It never throws. A missing network, a timeout, a 500 from the registry and
 *   a payload in an unexpected shape all come back as `{ ok: false, reason }`.
 *   `version` prints what it does know — the installed version — and says the
 *   check could not be made. Being offline is not an error condition.
 *
 *   It is injectable. `fetchImpl` is a parameter, so the assertion suite covers
 *   every branch — current, outdated, ahead, offline, timeout, junk payload —
 *   without a single real request. Nothing in the suite ever hits the network.
 */

export const PACKAGE_NAME = 'phyllum';
export const REGISTRY_BASE = 'https://registry.npmjs.org';

/** Short enough that an offline `version` still answers promptly. */
export const DEFAULT_TIMEOUT_MS = 3000;

/** The `latest` dist-tag document for one package. */
export function registryUrlFor(name = PACKAGE_NAME, base = REGISTRY_BASE) {
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(name)}/latest`;
}

/**
 * Plain JSON, deliberately. npm's abbreviated media type
 * (`application/vnd.npm.install-v1+json`) is only served on the full packument
 * endpoint; asking for it on `/<pkg>/latest` earns a 406. The `/latest` document
 * is one version's metadata, so it is small either way.
 */
const ACCEPT = 'application/json';

/**
 * Parse a semver-ish version into something comparable. Only the parts Phyllum
 * publishes are modelled: three numbers and an optional prerelease tail.
 */
export function parseVersion(input) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(input ?? '').trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrerelease(a, b) {
  // A release outranks any prerelease of the same numbers (semver §11).
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      if (Number(left) !== Number(right)) return Number(left) < Number(right) ? -1 : 1;
      continue;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

/**
 * -1 when `a` is older than `b`, 0 when they are the same, 1 when `a` is newer.
 * Returns null when either side is not a version at all, so a caller can say
 * "I could not tell" instead of guessing an ordering.
 */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (const part of ['major', 'minor', 'patch']) {
    if (left[part] !== right[part]) return left[part] < right[part] ? -1 : 1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

/** Why a check could not be completed, in the user's terms. */
export const REASONS = {
  timeout: 'the request timed out',
  offline: 'the registry could not be reached',
  'bad-status': 'the registry answered with an error',
  'bad-payload': 'the registry answered with something unexpected',
  'no-fetch': 'this Node build has no fetch, so the check could not be made',
};

export function describeReason(result) {
  const base = REASONS[result?.reason] ?? 'the check could not be made';
  return result?.detail ? `${base} (${result.detail})` : base;
}

/**
 * Ask the registry which version is published as `latest`.
 *
 * options:
 *   fetchImpl   the fetch to use; defaults to the global one
 *   timeoutMs   how long to wait before giving up
 *   name, base  the package and registry to ask about
 *
 * Returns { ok: true, version } or { ok: false, reason, detail } — never throws.
 */
export async function latestPublishedVersion(options = {}) {
  const {
    fetchImpl = typeof globalThis.fetch === 'function' ? globalThis.fetch : null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    name = PACKAGE_NAME,
    base = REGISTRY_BASE,
  } = options;

  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no-fetch' };

  const url = registryUrlFor(name, base);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: ACCEPT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return {
      ok: false,
      reason: timedOut ? 'timeout' : 'offline',
      detail: timedOut ? `no answer within ${Math.round(timeoutMs / 100) / 10}s` : (error?.code ?? error?.message),
    };
  }

  if (!response || response.ok !== true) {
    return { ok: false, reason: 'bad-status', detail: `HTTP ${response?.status ?? 'no status'}` };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: 'bad-payload', detail: 'the body was not JSON' };
  }

  const version = payload?.version;
  if (typeof version !== 'string' || !parseVersion(version)) {
    return { ok: false, reason: 'bad-payload', detail: 'no version field' };
  }
  return { ok: true, version };
}
