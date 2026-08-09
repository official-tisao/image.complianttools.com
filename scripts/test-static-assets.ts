import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { verifyStaticAssets } from './verify-static-assets.js';

const fixture = path.join(process.cwd(), 'apps', 'web', 'static', '__unregistered-test.onnx');

await mkdir(path.dirname(fixture), { recursive: true });
await writeFile(fixture, new Uint8Array([0x4f, 0x4e, 0x4e, 0x58]));

try {
  await assert.rejects(
    verifyStaticAssets(),
    /Unregistered static asset: .*__unregistered-test\.onnx/,
  );
  console.log('Verified that an unregistered .onnx asset fails the gate.');
} finally {
  await rm(fixture, { force: true });
}
