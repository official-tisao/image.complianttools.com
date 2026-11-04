import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const run = (args) =>
  execFileSync(pnpm, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

run(['--filter', '@complianttools/relay', 'build']);
run([
  '--filter',
  '@complianttools/relay',
  'exec',
  'wrangler',
  'deploy',
  '--dry-run',
  '--outdir',
  '../../apps/web/static/relay-installer',
]);
