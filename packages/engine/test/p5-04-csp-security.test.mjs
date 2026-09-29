/** P5-04 CSP/security tests — reads real files */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appHtmlPath = resolve('apps/web/src/app.html');
const headersPath = resolve('apps/web/static/_headers');

function extractCsp(text) {
  const meta = text.match(/content="([^"]+)"/);
  if (meta) return meta[1];
  const header = text.match(/Content-Security-Policy:\s*([^\r\n]+)/);
  if (header) return header[1].trim();
  return '';
}

const appHtml = readFileSync(appHtmlPath, 'utf8');
const headers = readFileSync(headersPath, 'utf8');

const cspApp = extractCsp(appHtml);
const cspHeaders = extractCsp(headers);

test('app.html CSP contains trusted-types directive', () => {
  assert.ok(
    cspApp.includes('trusted-types ctimg-default svelte-trusted-html'),
    'app.html CSP missing trusted-types',
  );
  assert.ok(
    cspApp.includes("require-trusted-types-for 'script'"),
    'app.html CSP missing require-trusted-types-for',
  );
});

test('_headers CSP matches trusted-types directive', () => {
  assert.ok(
    cspHeaders.includes('trusted-types ctimg-default svelte-trusted-html'),
    '_headers CSP missing trusted-types',
  );
  assert.ok(
    cspHeaders.includes("require-trusted-types-for 'script'"),
    '_headers CSP missing require-trusted-types-for',
  );
});

test('both CSP sources agree on trusted-types policies', () => {
  assert.strictEqual(cspApp.includes('ctimg-default'), cspHeaders.includes('ctimg-default'));
  assert.strictEqual(
    cspApp.includes('svelte-trusted-html'),
    cspHeaders.includes('svelte-trusted-html'),
  );
});

test('script-src permits the SvelteKit inline bootstrap', () => {
  // SvelteKit emits an inline bootstrap script per page. Without an
  // 'unsafe-inline'/'unsafe-hashes' allowance or a matching hash/nonce, CSP
  // blocks it and hydration never runs.
  const scriptSrc = (cspApp.match(/script-src ([^;]*)/) || [])[1] || '';
  assert.ok(
    scriptSrc.includes("'unsafe-inline'") || /sha256-|'nonce-/.test(scriptSrc),
    `script-src blocks the inline bootstrap: ${scriptSrc}`,
  );
});
