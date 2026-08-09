import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function runFixture(name: string) {
  const command = process.platform === 'win32' ? 'pnpm.CMD' : 'pnpm';
  return spawnSync(command, ['exec', 'tsx', 'scripts/verify-licenses.ts'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      CT_LICENSE_REPORT: path.join(process.cwd(), 'scripts', 'fixtures', 'licenses', name),
    },
  });
}

const denied = runFixture('denied.json');
assert.notEqual(denied.status, 0, 'A GPL dependency must fail the licence gate.');
assert.match(`${denied.stdout}${denied.stderr}`, /gifsicle@5\.3\.0: GPL-2\.0/);

const dual = runFixture('dual-allowed.json');
assert.equal(dual.status, 0, `An OR expression with MIT must pass: ${dual.stderr}`);

const ijg = runFixture('ijg-allowed.json');
assert.equal(ijg.status, 0, `IJG and IJG-short must pass the amended allowlist: ${ijg.stderr}`);

console.log('Verified denied, dual-licensed, IJG, and IJG-short dependency behaviour.');
