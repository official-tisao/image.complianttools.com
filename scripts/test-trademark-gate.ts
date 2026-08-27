import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fixture = path.join(process.cwd(), 'packages', 'ui', 'src', '__trademark-test.ts');
await writeFile(fixture, `export const preset = 'Clarendon';\n`);

try {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/verify-trademarks.ts'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0, 'A denied preset name must fail the trademark gate.');
  assert.match(`${result.stdout}${result.stderr}`, /__trademark-test\.ts: denied name "Clarendon"/);
  console.log('Verified that a denied preset name fails the trademark gate.');
} finally {
  await rm(fixture, { force: true });
}
