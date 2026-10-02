/**
 * The Arabic catalogue is registered at runtime by `routes/[locale]/+layout.svelte`, so these
 * tests pin the two properties that split can silently break:
 *
 * - `translate('ar', ...)` returns real Arabic *after* registration — the table must not be
 *   merely present on disk but actually reachable through the registry.
 * - A key with no Arabic entry falls back to English instead of rendering `undefined`.
 *
 * The second matters more than it looks. Before this split the dictionary was a literal in
 * `i18n.ts`, so an unregistered or unloaded table was impossible by construction. Now it can be
 * absent, and the `?? fallback` in `translate()` is the only thing standing between a missing
 * entry and `undefined` appearing in the UI.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { registerArabic } from '../src/lib/locales/ar.ts';
import { translate } from '../src/lib/i18n.ts';

test('Arabic resolves through the registry after registration', () => {
  registerArabic();
  assert.equal(translate('ar', 'nav.convert', 'Convert'), 'تحويل');
  assert.equal(translate('ar', 'privacy.badge', 'Local only'), 'محلي فقط');
});

test('an unregistered Arabic key falls back to English rather than undefined', () => {
  registerArabic();
  const missing = translate('ar', 'definitely.not.a.real.key', 'Fallback text');
  assert.equal(missing, 'Fallback text');
  assert.notEqual(missing, undefined);
});

test('English and en-XA never consult the table', () => {
  registerArabic();
  // `en` must return the call-site fallback verbatim, even for a key that HAS Arabic copy.
  assert.equal(translate('en', 'nav.convert', 'Convert'), 'Convert');
  // `en-XA` derives from the fallback via pseudo() (o -> ô) rather than reading the table.
  assert.equal(translate('en-XA', 'nav.convert', 'Convert'), '［Cônvërt ~~］');
});

test('{value} placeholder substitution still applies to Arabic copy', () => {
  registerArabic();
  // t32.status.done carries a real {value} placeholder in its Arabic copy.
  const out = translate('ar', 't32.status.done', 'Output size: {value}px.', 2048);
  assert.ok(out.includes('2048'), `expected the placeholder to be filled, got: ${out}`);
  assert.ok(out.includes('بكسل'), `expected Arabic copy, got: ${out}`);
});

test('registration is idempotent', () => {
  registerArabic();
  registerArabic();
  assert.equal(translate('ar', 'nav.convert', 'Convert'), 'تحويل');
});
