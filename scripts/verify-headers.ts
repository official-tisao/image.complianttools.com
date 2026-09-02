/**
 * Validates the production security headers in `apps/web/static/_headers`.
 *
 * These headers are what make `crossOriginIsolated === true` and the local-first privacy claims
 * true in production (README §16.4, §16.5, §23.4). CI runs this so a header can never be dropped or
 * weakened by accident. Production-origin verification remains a separate deployed check (P7-07).
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
const headers = await readFile(headersPath, 'utf8');

const required: ReadonlyArray<readonly [name: string, value: string]> = [
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Cross-Origin-Embedder-Policy', 'require-corp'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
  ['Referrer-Policy', 'no-referrer'],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Strict-Transport-Security', 'max-age='],
];

const missing = required.filter(([name, value]) => {
  const match = new RegExp(`^\\s*${name.replaceAll('-', '\\-')}:\\s*([^\\r\\n]+)`, 'm').exec(
    headers,
  );
  if (!match) return true;
  return value.startsWith('max-age=') ? !match[1]!.includes(value) : match[1]!.trim() !== value;
});

if (missing.length > 0) {
  throw new Error(
    `Missing or incorrect production security headers in apps/web/static/_headers: ${missing
      .map(([name, value]) => `${name}: ${value}`)
      .join(', ')}`,
  );
}

if (!/^\/\*[ \t]*$/m.test(headers)) {
  throw new Error('The catch-all `/*` header block is missing from apps/web/static/_headers.');
}

process.stdout.write('Production security headers verified.\n');
