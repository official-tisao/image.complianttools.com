import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const buildDirectory = path.join(process.cwd(), 'apps', 'web', 'build');
const cases = [
  // The generated Svelte tool workspace baseline is ~102 KB compressed. Keep a small, explicit headroom
  // for framework patch releases while preserving a hard regression guard.
  { archetype: 'tool', route: 'convert.html', budget: 110_000, requiresInput: true },
  {
    archetype: 'format-pair',
    route: 'convert/png-to-webp.html',
    budget: 110_000,
    requiresInput: true,
  },
  { archetype: 'reference', route: 'docs/formats/jpeg.html', budget: 0, requiresInput: false },
  { archetype: 'connect-ai', route: 'connect-ai.html', budget: 45_000, requiresInput: false },
  { archetype: 'app-shell', route: 'editor.html', budget: 220_000, requiresInput: false },
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
    try {
      compressedBytes += (await stat(`${absolute}.gz`)).size;
    } catch {
      compressedBytes += (await stat(absolute)).size;
    }
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
