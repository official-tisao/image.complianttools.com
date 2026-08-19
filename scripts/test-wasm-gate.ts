import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { processWasmLock } from './fetch-wasm.js';

const root = await mkdtemp(path.join(tmpdir(), 'ct-wasm-gate-'));
const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const sha256 = '93a44bbb96c751218e4c00d479e4c14358122a389acca16205b1e4d0dc5f9476';

try {
  await mkdir(path.join(root, 'apps', 'web', 'static'), { recursive: true });
  await writeFile(
    path.join(root, 'wasm-lock.json'),
    JSON.stringify([
      {
        name: 'gate-fixture',
        url: 'https://example.test/releases/v1.0.0/gate-fixture.wasm',
        sha256,
      },
    ]),
  );
  await processWasmLock({
    root,
    mode: 'fetch',
    fetcher: async () => new Response(bytes),
  });
  const output = path.join(
    root,
    'apps',
    'web',
    'static',
    'wasm',
    `gate-fixture.${sha256.slice(0, 12)}.wasm`,
  );
  const tampered = new Uint8Array(await readFile(output));
  tampered[0] = tampered[0]! ^ 1;
  await writeFile(output, tampered);
  await assert.rejects(
    processWasmLock({ root, mode: 'verify' }),
    /WASM hash mismatch for gate-fixture\.93a44bbb96c7\.wasm/,
  );
  console.log('Verified that changing one WASM byte fails the build gate.');
} finally {
  await rm(root, { recursive: true, force: true });
}
