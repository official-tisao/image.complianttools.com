import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

// `pnpm build` measures the real static output. `CT_BUILD_DIR` points the same check at a
// synthetic tree so `scripts/test-route-budget-gate.ts` can prove it actually fails an
// over-budget route — without that override the gate is CI-only and silently dead between runs.
const buildDirectory = process.env['CT_BUILD_DIR']
  ? path.resolve(process.env['CT_BUILD_DIR'])
  : path.join(process.cwd(), 'apps', 'web', 'build');
const phaseTwoToolRoutes = [
  'heic-converter',
  'raw-converter',
  'avif-converter',
  'webp-converter',
  'jxl-converter',
  'svg-to-png',
  'image-to-svg',
  'pdf-to-image',
  'image-to-pdf',
  'favicon-generator',
  'gif-converter',
  'embedded-converter',
  'base64-image',
  'cbz-converter',
  'exif-viewer',
  'remove-exif',
  'image-info',
  'lossless-optimize',
] as const;
const cases = [
  // The generated Svelte tool workspace baseline is ~102 KB compressed. The shipped Phase 2 routes add
  // roughly 2 KB of generated route-manifest metadata; retain a small explicit headroom for that and
  // framework patch releases while preserving a hard regression guard.
  { archetype: 'tool', route: 'convert.html', budget: 115_000, requiresInput: true },
  {
    archetype: 'format-pair',
    route: 'convert/png-to-webp.html',
    budget: 115_000,
    requiresInput: true,
  },
  { archetype: 'reference', route: 'docs/formats/jpeg.html', budget: 0, requiresInput: false },
  { archetype: 'connect-ai', route: 'connect-ai.html', budget: 45_000, requiresInput: false },
  { archetype: 'app-shell', route: 'editor.html', budget: 220_000, requiresInput: false },
  ...phaseTwoToolRoutes.map((route) => ({
    archetype: `phase-two:${route}`,
    route: `${route}.html`,
    // Deferred work is excluded because only statically referenced route assets are counted:
    // RAW keeps decoder/demosaicing paths in user-triggered dynamic chunks, and the metadata
    // viewer/remover carry the verified EXIF container parser in their initial route.
    //
    // Every route shares one 115 KB ceiling again. The locale catalogue used to be a literal in
    // `apps/web/src/lib/i18n.ts`: 920 Arabic keys, ~18.5 KB gzipped, preloaded by all 148
    // English pages, none of which read a single Arabic string. It now lives in
    // `apps/web/src/lib/locales/ar.ts` and is registered only by `routes/[locale]/+layout.svelte`,
    // so no English route references that chunk. That freed the former 118/121 KB EXIF+RAW tier,
    // which is now gone rather than retuned.
    //
    // Measured 2026-10-01 after the split: exif-viewer 100,908, remove-exif 100,206,
    // raw-converter 92,697. If this ceiling is breached again the cause is a *new* eager import,
    // not the locale table — find that import instead of raising this number.
    budget: 115_000,
    requiresInput: true,
  })),
] as const;

for (const check of cases) {
  const htmlPath = path.join(buildDirectory, check.route);
  const html = await readFile(htmlPath, 'utf8');
  if (check.requiresInput && !/<input[^>]+type="file"/u.test(html)) {
    throw new Error(`${check.archetype} archetype lacks a static file input.`);
  }
  const assets = new Set(
    [...html.matchAll(/(?:src|href)="([^"?]+\.mjs)"/gu)].map((match) => match[1]!),
  );
  let compressedBytes = 0;
  for (const asset of assets) {
    const absolute = path.resolve(path.dirname(htmlPath), asset);
    compressedBytes += gzipSync(await readFile(absolute)).byteLength;
  }
  if (compressedBytes > check.budget) {
    throw new Error(
      `${check.archetype} archetype loads ${compressedBytes} compressed JS bytes; budget is ${check.budget}.`,
    );
  }
  if (check.budget === 0 && assets.size > 0) {
    throw new Error(`${check.archetype} archetype must ship zero JavaScript.`);
  }
  console.log(`${check.archetype}: ${compressedBytes}/${check.budget} compressed JS bytes`);
}
