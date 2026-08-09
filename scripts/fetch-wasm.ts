import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface WasmLockEntry {
  name: string;
  url: string;
  sha256: string;
}

interface WasmOptions {
  root?: string;
  mode: 'fetch' | 'verify';
  fetcher?: typeof fetch;
}

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function validateEntry(entry: WasmLockEntry): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) {
    throw new Error(`Invalid WASM asset name: ${entry.name}.`);
  }
  if (!/^https:\/\//.test(entry.url) || /(?:latest|master|main)(?:\/|$)/i.test(entry.url)) {
    throw new Error(`WASM asset ${entry.name} must use an HTTPS, version-pinned URL.`);
  }
  if (!/^[a-f0-9]{64}$/.test(entry.sha256)) {
    throw new Error(`WASM asset ${entry.name} has an invalid SHA-256.`);
  }
}

export async function processWasmLock(options: WasmOptions): Promise<void> {
  const root = options.root ?? process.cwd();
  const lockPath = path.join(root, 'wasm-lock.json');
  const outputDirectory = path.join(root, 'apps', 'web', 'static', 'wasm');
  const entries = JSON.parse(await readFile(lockPath, 'utf8')) as WasmLockEntry[];
  const expectedFiles = new Set<string>();
  await mkdir(outputDirectory, { recursive: true });

  for (const entry of entries) {
    validateEntry(entry);
    const fileName = `${entry.name}.${entry.sha256.slice(0, 12)}.wasm`;
    const outputPath = path.join(outputDirectory, fileName);
    expectedFiles.add(fileName);

    if (options.mode === 'fetch') {
      const response = await (options.fetcher ?? fetch)(entry.url);
      if (!response.ok) throw new Error(`Unable to fetch ${entry.name}: HTTP ${response.status}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const actual = digest(bytes);
      if (actual !== entry.sha256) {
        throw new Error(
          `WASM hash mismatch for ${entry.name}: expected ${entry.sha256}, got ${actual}.`,
        );
      }
      await writeFile(outputPath, bytes);
    }

    if (!existsSync(outputPath)) {
      throw new Error(`Missing locked WASM asset: ${fileName}. Run pnpm wasm:fetch.`);
    }
    const actual = digest(await readFile(outputPath));
    if (actual !== entry.sha256) {
      throw new Error(
        `WASM hash mismatch for ${fileName}: expected ${entry.sha256}, got ${actual}.`,
      );
    }
  }

  const existing = (await readdir(outputDirectory)).filter((name) => name.endsWith('.wasm'));
  const unlocked = existing.filter((name) => !expectedFiles.has(name));
  if (unlocked.length > 0) {
    throw new Error(`Unlocked WASM assets found: ${unlocked.join(', ')}.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes('--verify') ? 'verify' : 'fetch';
  await processWasmLock({ mode });
  console.log(`WASM asset lock ${mode === 'fetch' ? 'fetched and verified' : 'verified'}.`);
}
