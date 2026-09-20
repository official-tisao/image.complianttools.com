import { existsSync } from 'node:fs';
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tessdataRoot = path.resolve(root, 'apps', 'web', 'static', 'tessdata');
const register = JSON.parse(await readFile(path.join(root, 'docs', 'static-assets.json'), 'utf8'));
let removedFiles = 0;
let removedBytes = 0;

for (const record of register) {
  if (record.delivery !== 'lazy-cdn') continue;
  const absolute = path.resolve(root, record.path);
  if (!absolute.startsWith(`${tessdataRoot}${path.sep}`)) {
    throw new Error(`Refusing to prune an OCR cache outside tessdata: ${record.path}.`);
  }
  if (!existsSync(absolute)) continue;
  const metadata = await stat(absolute);
  if (!metadata.isFile())
    throw new Error(`Refusing to prune a non-file OCR cache: ${record.path}.`);
  await rm(absolute);
  removedFiles += 1;
  removedBytes += metadata.size;
}

console.log(
  `Pruned ${removedFiles} ignored OCR cache file(s) (${removedBytes} bytes) before production build.`,
);
