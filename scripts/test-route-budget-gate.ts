/**
 * Proves `verify-route-budgets.ts` still fails when it should.
 *
 * The budget gate is otherwise only exercised by `pnpm build` in CI: every case passes in the
 * tree, so a bug that made the gate compare against the wrong number, skip a route, or ignore an
 * asset would stay invisible until a real regression shipped. These cases build a synthetic
 * output tree via `CT_BUILD_DIR` and assert the gate's verdict on it.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const command = process.platform === 'win32' ? 'pnpm.CMD' : 'pnpm';

const fsTempDirs: string[] = [];

function runGate(buildDir: string) {
  const result = spawnSync(command, ['exec', 'tsx', 'scripts/verify-route-budgets.ts'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, CT_BUILD_DIR: buildDir },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/**
 * Build a minimal tree containing every route the verifier inspects. Each route page is a plain
 * HTML file with one `<script src>`; `payloadBytes` of incompressible-ish padding controls the
 * measured size, and `includeInput` supplies the file input the tool archetypes require.
 */
function makeBuild(payloadBytes: number, options: { includeInput?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'route-budget-'));
  const routes = [
    'convert.html',
    'convert/png-to-webp.html',
    'docs/formats/jpeg.html',
    'connect-ai.html',
    // The per-provider walkthrough, which hydrates so §17.3's Test connection button can run. Nested
    // under `connect-ai/` like its real counterpart, so the verifier's nested-route handling is
    // exercised by the synthetic tree too.
    'connect-ai/openai.html',
    'editor.html',
    'heic-converter.html',
    'raw-converter.html',
    'avif-converter.html',
    'webp-converter.html',
    'jxl-converter.html',
    'svg-to-png.html',
    'image-to-svg.html',
    'pdf-to-image.html',
    'image-to-pdf.html',
    'favicon-generator.html',
    'gif-converter.html',
    'embedded-converter.html',
    'base64-image.html',
    'cbz-converter.html',
    'exif-viewer.html',
    'remove-exif.html',
    'image-info.html',
    'lossless-optimize.html',
  ];

  for (const route of routes) {
    const file = path.join(dir, route);
    mkdirSync(path.dirname(file), { recursive: true });

    // `docs/formats/jpeg.html` has a zero budget and must ship no JS at all.
    if (route === 'docs/formats/jpeg.html') {
      writeFileSync(file, '<!doctype html><html><body>reference</body></html>');
      continue;
    }

    // Random padding, not a repeated byte: a run of identical bytes gzips to a few hundred bytes
    // and would make the "over budget" case silently pass. This keeps the measured size close
    // to `payloadBytes`, which is what makes the breach assertion meaningful.
    const assetName = `${route.replace(/[/.]/gu, '_')}.mjs`;
    writeFileSync(path.join(path.dirname(file), assetName), randomBytes(payloadBytes));
    const input = options.includeInput === false ? '' : '<input type="file" accept="image/*">';
    writeFileSync(
      file,
      `<!doctype html><html><head><script type="module" src="./${assetName}"></script></head><body>${input}</body></html>`,
    );
  }
  fsTempDirs.push(dir);
  return dir;
}

try {
  // A small payload must clear every ceiling.
  const small = runGate(makeBuild(1_000, { includeInput: true }));
  assert.equal(small.status, 0, `An under-budget build must pass the gate: ${small.output}`);

  // A payload over the ceiling must fail, and name the offending archetype. The verifier throws on
  // the first breach, so `tool` — which is checked first — is the archetype reported here.
  const large = runGate(makeBuild(200_000, { includeInput: true }));
  assert.notEqual(large.status, 0, 'An over-budget build must fail the gate.');
  assert.match(large.output, /archetype loads 200\d+ compressed JS bytes; budget is 115000/);

  // A tool archetype missing its file input must be rejected: a page that cannot accept a file
  // is not the tool the budget was measured against.
  const noInput = runGate(makeBuild(1_000, { includeInput: false }));
  assert.notEqual(noInput.status, 0, 'A tool page without a file input must fail the gate.');
  assert.match(noInput.output, /lacks a static file input/);

  console.log('Verified route-budget pass, breach, and missing-input behaviour.');
} finally {
  for (const dir of fsTempDirs) rmSync(dir, { recursive: true, force: true });
}
