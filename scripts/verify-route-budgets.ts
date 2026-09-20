import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const buildDirectory = path.join(process.cwd(), 'apps', 'web', 'build');
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
    // The RAW converter carries its additional decoder and demosaicing path. Give that route a
    // separate 117 KB ceiling while keeping the shared tool-route guard at 115 KB.
    budget: route === 'raw-converter' ? 117_000 : 115_000,
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
