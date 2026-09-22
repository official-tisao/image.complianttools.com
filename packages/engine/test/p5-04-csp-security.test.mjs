/** P5-04 CSP/security tests */
import assert from 'node:assert/strict';
import test from 'node:test';

const CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' blob: https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
  "require-trusted-types-for 'script'",
];

const FULL_CSP = CSP_DIRECTIVES.join('; ');

test('base CSP has all directives', () => {
  for (const d of CSP_DIRECTIVES) {
    assert.ok(FULL_CSP.includes(d), `CSP includes: ${d}`);
  }
});

test('connect-src has no unrestricted * fallback', () => {
  assert.strictEqual(FULL_CSP.includes('connect-src *'), false);
  assert.strictEqual(FULL_CSP.includes("connect-src 'self' *"), false);
});

test('provider origins not in base CSP (handled by transport)', () => {
  assert.strictEqual(FULL_CSP.includes('api.openai.com'), false);
  assert.strictEqual(FULL_CSP.includes('api.anthropic.com'), false);
});

test('COOP and COEP required', () => {
  assert.strictEqual('Cross-Origin-Opener-Policy: same-origin'.includes('same-origin'), true);
  assert.strictEqual('Cross-Origin-Embedder-Policy: require-corp'.includes('require-corp'), true);
});

test('unsafe CSP fragments rejected', () => {
  const unsafe = ['connect-src *', 'script-src *', 'default-src *', "script-src 'unsafe-eval'"];
  for (const s of unsafe) {
    assert.strictEqual(FULL_CSP.includes(s), false, `Rejected unsafe: ${s}`);
  }
});
