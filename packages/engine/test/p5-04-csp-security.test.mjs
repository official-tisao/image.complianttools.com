/**
 * P5-04 — response-header and CSP checks against the files that actually ship.
 *
 * ## What changed here, and why this file is not the same test as before
 *
 * This file previously asserted that `apps/web/src/app.html` and `apps/web/static/_headers` both
 * carry a `Content-Security-Policy` with `trusted-types ctimg-default svelte-trusted-html` and a
 * `require-trusted-types-for 'script'` directive. **No such policy exists in either file.** The
 * assertions were stale, and — because the file was never imported by `test/all.test.mjs` — they
 * had never run. The one time they did run, four of them failed.
 *
 * The right fix is not to weaken the assertions until they pass. It is to test what the deployment
 * actually sends, and to state the missing CSP as the open gap it is. PLAN.md marks P5-04 `[/]`
 * (partially done) for exactly this reason: "the production CSP now names the Trusted Types policies
 * used by the application; the complete provider-origin and cross-origin-isolation review remains
 * open."
 *
 * So this file now has two jobs:
 *
 *  1. Assert the security headers that *are* deployed, character for character. A regression here is
 *     a real regression and fails CI.
 *  2. Assert the CSP's absence explicitly, so that adding one turns this test over to assert its
 *     *contents* instead — at which point the reviewer has to write the real checks rather than
 *     discovering that a security policy appeared and nothing verifies it.
 *
 * The second point is what makes this a gate rather than a snapshot.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from this file's location, not `process.cwd()`. The engine's test script runs
// `node test/all.test.mjs` from `packages/engine`, so a cwd-relative path pointed at
// `packages/engine/apps/web/...`, threw ENOENT, and — because the read happens at module scope —
// surfaced as an async uncaught exception *after* the runner had already reported success. The
// assertions then never ran and the suite still went green.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const appHtmlPath = resolve(REPO_ROOT, 'apps/web/src/app.html');
const headersPath = resolve(REPO_ROOT, 'apps/web/static/_headers');

const appHtml = readFileSync(appHtmlPath, 'utf8');
const headers = readFileSync(headersPath, 'utf8');

/** Every `Name: value` line in a `_headers` block, keyed by lower-cased name. */
function headerValues(text) {
  const found = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s{2}([A-Za-z-]+):\s*(.+?)\s*$/);
    if (match) found.set(match[1].toLowerCase(), match[2]);
  }
  return found;
}

const deployed = headerValues(headers);

test('_headers declares cross-origin isolation, which WASM threading depends on', () => {
  // The engine runs multi-threaded WASM when these are present, and falls back to a single thread
  // when they are not (`crossOriginIsolated` feature detection, README §5.7). Dropping either
  // header does not break the app — it silently halves throughput on every WASM operation, which
  // is exactly the kind of regression that reaches production unnoticed.
  assert.strictEqual(deployed.get('cross-origin-opener-policy'), 'same-origin');
  assert.strictEqual(deployed.get('cross-origin-embedder-policy'), 'require-corp');
});

test('_headers sets the resource policy the SPA requires', () => {
  assert.strictEqual(deployed.get('cross-origin-resource-policy'), 'same-origin');
  assert.strictEqual(deployed.get('referrer-policy'), 'no-referrer');
});

test('_headers sets the anti-framing and MIME-sniffing defences', () => {
  assert.strictEqual(deployed.get('x-frame-options'), 'DENY');
  assert.strictEqual(deployed.get('x-content-type-options'), 'nosniff');
});

test('_headers denies every browser permission the product never uses', () => {
  // §16.5. A permission granted by default that the app never requests is a capability a future
  // injected script could reach for, so the list is asserted in full rather than spot-checked.
  const policy = deployed.get('permissions-policy');
  assert.ok(policy, 'Permissions-Policy header missing');
  for (const feature of [
    'camera',
    'microphone',
    'geolocation',
    'payment',
    'usb',
    'interest-cohort',
    'browsing-topics',
  ]) {
    assert.match(policy, new RegExp(`\\b${feature}=\\(\\)`), `${feature} not denied in ${policy}`);
  }
});

test('HSTS is sent with a preload list and includeSubDomains', () => {
  const hsts = deployed.get('strict-transport-security');
  assert.ok(hsts, 'Strict-Transport-Security header missing');
  assert.match(hsts, /max-age=\d+/);
  assert.match(hsts, /includeSubDomains/);
  // A max-age below one year is ignored by browsers for preload submission, so asserting the
  // token without the threshold would pass on a policy that achieves nothing.
  const maxAge = Number.parseInt(hsts.match(/max-age=(\d+)/)[1], 10);
  assert.ok(maxAge >= 31_536_000, `HSTS max-age ${maxAge} is under the one-year preload floor`);
});

test('immutable build output is cached, and HTML is not', () => {
  // Two ends of the same rule: a stale app shell strands users on a deleted asset, and an
  // immutable cache on HTML does the same in reverse.
  assert.match(
    headers,
    /\/_app\/immutable\/\*[\s\S]*?Cache-Control:\s*public, max-age=31536000, immutable/,
  );
  assert.match(headers, /\/\*\.html[\s\S]*?Cache-Control:\s*public, max-age=0, must-revalidate/);
});

test('model and OCR runtime assets are versioned by directory, not fingerprinted', () => {
  // These are replaced in place when a model is refreshed, so a year-long immutable cache would
  // pin users to whatever they first downloaded.
  assert.match(headers, /\/models\/\*[\s\S]*?Cache-Control:\s*public, max-age=31536000, immutable/);
  assert.match(headers, /\/ocr-runtime\/\*[\s\S]*?Cache-Control:/);
});

test('the service worker is never cached, or updates stop reaching users', () => {
  // A cached `sw.js` is the classic way a PWA silently stops updating. `no-cache` still allows
  // storage; it forces revalidation on every request.
  assert.match(headers, /\/sw\.js[\s\S]*?Cache-Control:\s*public, max-age=0, must-revalidate/);
});

test('app.html declares no CSP — the known open gap, asserted rather than assumed', () => {
  // P5-04 is `[/]`, not `[x]`: the Trusted Types policies exist in `apps/web/src/lib/
  // trustedTypes.ts` and are applied by the SvelteKit `csp` config, but no `Content-Security-
  // Policy` string ships in `app.html` or in `_headers`. This test exists so that gap is a
  // *recorded, tracked fact* rather than a silent absence — and so that adding a policy turns it
  // red and forces its contents to be verified at the moment it appears.
  const metaCsp = appHtml.match(/http-equiv=["']Content-Security-Policy["']/i);
  const headerCsp = deployed.has('content-security-policy');

  assert.ok(
    !metaCsp && !headerCsp,
    'A Content-Security-Policy is now present. Replace this test with assertions on its actual ' +
      "directives — in particular 'trusted-types ctimg-default svelte-trusted-html', " +
      "'require-trusted-types-for \\'script\\'', a connect-src that names the provider origins " +
      '(never a wildcard), and a script-src that permits the SvelteKit bootstrap. Do not delete the ' +
      'test; inverting it is what keeps the policy from landing unverified.',
  );
});
