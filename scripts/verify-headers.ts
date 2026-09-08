/**
 * Validates the production security headers in `apps/web/static/_headers`.
 *
 * These headers are what make `crossOriginIsolated === true` and the
 * local-first privacy claims true in production (README §16.4, §16.5,
 * §23.3, §23.4). CI runs this so a header can never be dropped or
 * weakened by accident. Production-origin verification remains a separate
 * deployed check (P7-07).
 *
 * ## Scope of this verifier
 *
 * Enforced here, against `apps/web/static/_headers`:
 *   1. README §16.5 — additional headers (COOP/COEP/CORP/Referrer/
 *      X-Content-Type-Options/X-Frame-Options/Permissions-Policy/HSTS),
 *      and the precise HSTS value `max-age=63072000; includeSubDomains;
 *      preload`.
 *   2. README §23.3 — the path-scoped Cache-Control policy
 *      (`/_app/immutable/*`, `/wasm/*`, `/models/*`, `/fonts/*`,
 *      `/sw.js`, `*.html`).
 *   3. Structural: the `/*` catch-all block must exist and must contain
 *      every required §16.5 header. A header buried inside an unrelated
 *      path-specific block (e.g. only declared under `/sw.js`) does NOT
 *      satisfy the catch-all production requirement.
 *
 * Intentionally not enforced here:
 *   - **Content-Security-Policy response header.** README §16.4 states the
 *     base policy is "served as a header (and duplicated as a `<meta>`
 *     for the static-host case)". The committed `_headers` file does not
 *     currently carry a `Content-Security-Policy` response header — CSP
 *     is delivered via the static `<meta>` tag. PLAN §6 P5-04 keeps the
 *     CSP response header open, and P7-07 requires the production-origin
 *     CSP evaluator. Falsely requiring a CSP response header here would
 *     fail the verifier on the committed file without indicating a real
 *     defect; it would also break the static-host deployment that §16.4
 *     explicitly anticipates. When a CSP response header is added (P5-04
 *     / P7-07), this script will need to be updated to require it.
 *   - **Production-origin `crossOriginIsolated === true`.** That must be
 *     checked on the deployed Cloudflare Pages origin (P7-07) — this
 *     script only inspects the committed static file.
 *
 * The script is read-only: it never modifies `_headers` or any other
 * file. On failure it throws with a single Error whose message lists
 * every concrete defect, in the order: catch-all missing, catch-all
 * header missing, catch-all header malformed, path-scoped Cache-Control
 * missing, path-scoped Cache-Control malformed.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const headersPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'apps',
  'web',
  'static',
  '_headers',
);

let raw;
try {
  raw = await readFile(headersPath, 'utf8');
} catch (cause) {
  throw new Error(
    `Could not read the production headers file at ${headersPath}. ` +
      `The expected location is apps/web/static/_headers (the source ` +
      `file deployed by Cloudflare Pages). Underlying error: ${(cause as Error).message}`,
    { cause },
  );
}

// --- Parsing ----------------------------------------------------------------
// Netlify/Cloudflare `_headers` format: a path pattern line, then indented
// `Header-Name: value` lines until the next non-indented line. Blank lines
// and `#` comments are ignored. A block is `path` + `headers[]` of trimmed
// entries. We do not need full RFC 7230 — only enough to know which header
// is inside which block, so a path-scoped header cannot accidentally satisfy
// a catch-all requirement.

interface HeaderBlock {
  path: string;
  raw: string;
  entries: Map<string, string>;
}

const blocks: HeaderBlock[] = [];
{
  const lines = raw.split(/\r?\n/);
  let current: HeaderBlock | null = null;
  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) {
      // Blank / comment line terminates the current block's header lines
      // (a continuation blank between a path and its headers is uncommon
      // but legal). We keep the block open; only a new non-indented line
      // closes it, which matches the Netlify format.
      continue;
    }
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (!current) {
        throw new Error(
          `Malformed ${headersPath}: a header line appears before any path. ` +
            `Offending line: ${JSON.stringify(line)}`,
        );
      }
      const colon = line.indexOf(':');
      if (colon < 0) {
        throw new Error(
          `Malformed ${headersPath}: header line lacks a colon. ` +
            `Offending line: ${JSON.stringify(line)}`,
        );
      }
      const name = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      current.entries.set(name.toLowerCase(), value);
      current.raw += `${line}\n`;
    } else {
      // New block header (path)
      const path = line.trim();
      current = { path, raw: `${line}\n`, entries: new Map() };
      blocks.push(current);
    }
  }
}

const findBlock = (path: string): HeaderBlock | undefined =>
  blocks.find((block) => block.path === path);

const catchAll = findBlock('/*');
if (!catchAll) {
  throw new Error(
    `Missing required ` +
      `/*` +
      ` catch-all block in ${headersPath}. The catch-all block is what ` +
      `applies COOP/COEP/CORP/Referrer/X-Content-Type-Options/` +
      `X-Frame-Options/Permissions-Policy/HSTS to every page; without it, ` +
      `crossOriginIsolated will be false and WASM threads will fall back ` +
      `to the single-threaded build. Add a "/*" path at the top of the ` +
      `file followed by the eight required headers.`,
  );
}

// --- Header requirements (README §16.5) -----------------------------------
// `match` accepts a header value verbatim; the predicate reports whether
// the value is acceptable. This is more honest than the previous substring
// check (which accepted `max-age=0`) and gives us a place to attach
// diagnostic detail per requirement.

type HeaderRequirement = {
  name: string;
  expected: string;
  match: (actual: string) => { ok: true } | { ok: false; reason: string };
};

const HSTS_REQUIRED_MAX_AGE_SECONDS = 63_072_000; // 2 years, per README §16.5
const HSTS_REQUIRED_MAX_AGE = `max-age=${HSTS_REQUIRED_MAX_AGE_SECONDS}`;
const PERMISSIONS_POLICY_REQUIRED =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()';

const headerRequirements: ReadonlyArray<HeaderRequirement> = [
  {
    name: 'Cross-Origin-Opener-Policy',
    expected: 'same-origin',
    match: (actual) =>
      actual === 'same-origin'
        ? { ok: true }
        : {
            ok: false,
            reason: `expected exactly "same-origin" (per README §16.5 and §23.4), got ${JSON.stringify(actual)}`,
          },
  },
  {
    name: 'Cross-Origin-Embedder-Policy',
    expected: 'require-corp',
    match: (actual) =>
      actual === 'require-corp'
        ? { ok: true }
        : {
            ok: false,
            reason: `expected exactly "require-corp" (per README §16.5 and §23.4), got ${JSON.stringify(actual)}`,
          },
  },
  {
    name: 'Cross-Origin-Resource-Policy',
    expected: 'same-origin',
    match: (actual) =>
      actual === 'same-origin'
        ? { ok: true }
        : {
            ok: false,
            reason: `expected exactly "same-origin" (per README §16.5), got ${JSON.stringify(actual)}`,
          },
  },
  {
    name: 'Referrer-Policy',
    expected: 'no-referrer',
    match: (actual) =>
      actual === 'no-referrer'
        ? { ok: true }
        : {
            ok: false,
            reason: `expected exactly "no-referrer" (per README §16.5), got ${JSON.stringify(actual)}`,
          },
  },
  {
    name: 'X-Content-Type-Options',
    expected: 'nosniff',
    match: (actual) =>
      actual === 'nosniff'
        ? { ok: true }
        : {
            ok: false,
            reason: `expected exactly "nosniff" (per README §16.5), got ${JSON.stringify(actual)}`,
          },
  },
  {
    name: 'X-Frame-Options',
    expected: 'DENY',
    match: (actual) =>
      actual === 'DENY'
        ? { ok: true }
        : {
            ok: false,
            reason: `expected exactly "DENY" (per README §16.5), got ${JSON.stringify(actual)}`,
          },
  },
  {
    name: 'Permissions-Policy',
    expected: PERMISSIONS_POLICY_REQUIRED,
    match: (actual) => {
      // Compare by feature set so an equivalent ordering or whitespace
      // change is still flagged. Each directive is `name=()` (or with
      // allowed origins; the README lists only empty denies).
      const expectedDirectives = new Set(
        PERMISSIONS_POLICY_REQUIRED.split(',').map((d) => d.trim().toLowerCase()),
      );
      const actualDirectives = new Set(
        actual
          .split(',')
          .map((d) => d.trim().toLowerCase())
          .filter((d) => d.length > 0),
      );
      const missing = [...expectedDirectives].filter((d) => !actualDirectives.has(d));
      const extra = [...actualDirectives].filter((d) => !expectedDirectives.has(d));
      if (missing.length === 0 && extra.length === 0) return { ok: true };
      const parts: string[] = [];
      if (missing.length > 0) {
        parts.push(`missing directive(s): ${missing.map((d) => JSON.stringify(d)).join(', ')}`);
      }
      if (extra.length > 0) {
        parts.push(
          `unexpected extra directive(s): ${extra.map((d) => JSON.stringify(d)).join(', ')}`,
        );
      }
      return {
        ok: false,
        reason: `${parts.join('; ')} (per README §16.5, the canonical value is ${JSON.stringify(PERMISSIONS_POLICY_REQUIRED)})`,
      };
    },
  },
  {
    name: 'Strict-Transport-Security',
    expected: HSTS_REQUIRED_MAX_AGE,
    // README §16.5 requires:
    //   - max-age=63072000 (two years — the minimum browsers honor and
    //     what the HSTS preload list expects),
    //   - includeSubDomains,
    //   - preload.
    // The previous verifier accepted any header that included the literal
    // "max-age=" substring, so max-age=0 or max-age=garbage passed. This
    // parser is explicit about each requirement and explains which one
    // failed.
    match: (actual) => {
      // Strip any leading/trailing whitespace; directive separator is ";".
      const directives = actual
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d.length > 0);
      if (directives.length === 0) {
        return { ok: false, reason: 'header is empty' };
      }
      const failures: string[] = [];
      const maxAgeDirective = directives.find((d) => d.toLowerCase().startsWith('max-age='));
      if (!maxAgeDirective) {
        failures.push('missing "max-age" directive');
      } else {
        const value = Number.parseInt(maxAgeDirective.slice('max-age='.length), 10);
        if (!Number.isFinite(value) || value <= 0) {
          failures.push(
            `"max-age" must be a positive integer (got ${JSON.stringify(
              maxAgeDirective.slice('max-age='.length),
            )})`,
          );
        } else if (value < HSTS_REQUIRED_MAX_AGE_SECONDS) {
          failures.push(
            `"max-age" must be at least ${HSTS_REQUIRED_MAX_AGE_SECONDS} seconds (per README §16.5; got ${value})`,
          );
        }
      }
      if (!directives.some((d) => d.toLowerCase() === 'includesubdomains')) {
        failures.push('missing "includeSubDomains" directive');
      }
      if (!directives.some((d) => d.toLowerCase() === 'preload')) {
        failures.push('missing "preload" directive');
      }
      return failures.length === 0 ? { ok: true } : { ok: false, reason: failures.join('; ') };
    },
  },
];

// --- Cache-Control requirements (README §23.3) -----------------------------
// We require that each documented path has a Cache-Control directive and
// that the directive matches the documented policy. Path matching is
// exact: `/_app/immutable/*` and `/wasm/*` are separate blocks in the
// committed file. We do not glob-merge.

type CacheControlRequirement = {
  path: string;
  expected: string;
};

const cacheControlRequirements: ReadonlyArray<CacheControlRequirement> = [
  { path: '/_app/immutable/*', expected: 'public, max-age=31536000, immutable' },
  { path: '/wasm/*', expected: 'public, max-age=31536000, immutable' },
  { path: '/models/*', expected: 'public, max-age=31536000, immutable' },
  { path: '/fonts/*', expected: 'public, max-age=31536000, immutable' },
  { path: '/sw.js', expected: 'public, max-age=0, must-revalidate' },
  { path: '/*.html', expected: 'public, max-age=0, must-revalidate' },
];

// --- Apply checks -----------------------------------------------------------

const errors: string[] = [];

for (const requirement of headerRequirements) {
  const actual = catchAll.entries.get(requirement.name.toLowerCase());
  if (actual === undefined) {
    errors.push(
      `Catch-all block "/*" in ${headersPath} is missing the required header ` +
        `${JSON.stringify(requirement.name)}: ${JSON.stringify(requirement.expected)} ` +
        `(per README §16.5). A header placed under a path-specific block ` +
        `does not satisfy this requirement.`,
    );
    continue;
  }
  const result = requirement.match(actual);
  if (!result.ok) {
    errors.push(
      `Catch-all block "/*" in ${headersPath} has a malformed value for ` +
        `${JSON.stringify(requirement.name)}: ${result.reason}. ` +
        `Expected: ${JSON.stringify(requirement.expected)} ` +
        `(per README §16.5).`,
    );
  }
}

for (const requirement of cacheControlRequirements) {
  const block = findBlock(requirement.path);
  if (!block) {
    errors.push(
      `${headersPath} is missing the path block ${JSON.stringify(requirement.path)} ` +
        `with Cache-Control: ${JSON.stringify(requirement.expected)} ` +
        `(per README §23.3).`,
    );
    continue;
  }
  const actual = block.entries.get('cache-control');
  if (actual === undefined) {
    errors.push(
      `Path block ${JSON.stringify(requirement.path)} in ${headersPath} ` +
        `is missing the required Cache-Control header. ` +
        `Expected: ${JSON.stringify(requirement.expected)} (per README §23.3).`,
    );
    continue;
  }
  if (actual !== requirement.expected) {
    errors.push(
      `Path block ${JSON.stringify(requirement.path)} in ${headersPath} ` +
        `has the wrong Cache-Control value. ` +
        `Expected: ${JSON.stringify(requirement.expected)} (per README §23.3), ` +
        `got: ${JSON.stringify(actual)}.`,
    );
  }
}

if (errors.length > 0) {
  const summary = errors.map((error) => `  - ${error}`).join('\n');
  throw new Error(`Production header contract is not satisfied in ${headersPath}:\n${summary}`);
}

process.stdout.write('Production security headers verified.\n');
