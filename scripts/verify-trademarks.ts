import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const roots = ['apps', 'packages'];
const sourceExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.svelte',
  '.ts',
]);
const ignoredSegments = new Set([
  '.svelte-kit',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'fixtures',
  'node_modules',
]);
const deniedNames = [
  'Clarendon',
  'Gingham',
  'Juno',
  'Lo-Fi',
  '1977',
  'X-Pro II',
  'Valencia',
  'Nashville',
  'Toaster',
  'Walden',
  'Amaro',
  'Mayfair',
  'Rise',
  'Hudson',
  'Willow',
  'Inkwell',
  'Ludwig',
  'Aden',
  'Perpetua',
  'Crema',
  'Slumber',
  'Reyes',
  'Lark',
  'Moon',
  'Polaroid',
  'Magic Eraser',
  'Magic Edit',
  'Magic Expand',
  'Magic Wand',
  'Content-Aware',
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const deniedPatterns = deniedNames.map((name) => ({
  name,
  pattern: new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(name)}([^A-Za-z0-9]|$)`, 'i'),
}));
const impactFontPattern =
  /font-family\s*:\s*[^;\n]*\bImpact\b|fontFamily\s*[:=]\s*['"`]Impact['"`]/i;

async function walk(directory: string): Promise<string[]> {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (ignoredSegments.has(entry.name)) return [];
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(absolute);
      return sourceExtensions.has(path.extname(entry.name)) ? [absolute] : [];
    }),
  );
  return nested.flat();
}

const failures: string[] = [];
for (const root of roots) {
  for (const file of await walk(path.join(process.cwd(), root))) {
    const content = await readFile(file, 'utf8');
    for (const denied of deniedPatterns) {
      if (denied.pattern.test(content)) {
        failures.push(`${path.relative(process.cwd(), file)}: denied name "${denied.name}"`);
      }
    }
    if (impactFontPattern.test(content)) {
      failures.push(`${path.relative(process.cwd(), file)}: denied font family "Impact"`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(
    `Trademark substitution gate failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
  );
}

console.log('Trademark substitution gate verified.');
