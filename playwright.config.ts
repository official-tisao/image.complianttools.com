import { defineConfig, devices } from '@playwright/test';

const portableProjects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
];
const webPort = Number(process.env.PLAYWRIGHT_PORT ?? '4173');
if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65_535) {
  throw new Error('PLAYWRIGHT_PORT must be a valid TCP port number.');
}
// The normal E2E suite keeps its English and OSD fixtures prepared. Focused tests
// for assets that are already bundled can opt out so they exercise a minimal cache.
const tessdataPrefetch =
  process.env.PLAYWRIGHT_SKIP_OCR_TESSDATA_PREFETCH === '1'
    ? ''
    : 'node scripts/ensure-ocr-tessdata.mjs eng osd && ';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  webServer: {
    command: `${tessdataPrefetch}node node_modules/typescript/bin/tsc -p packages/engine/tsconfig.json && cd apps/web && node node_modules/@sveltejs/kit/svelte-kit.js sync && node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${webPort}`,
    url: `http://127.0.0.1:${webPort}/debug/capabilities`,
    reuseExistingServer: !process.env.CI,
    // A cold engine tsc + Vite build of the full prerendered site measures ~195 s locally, so the
    // previous 180 s budget was under the actual build time -- CI always builds cold, so it could
    // only pass by luck. Kept well clear of the 45-minute job limit rather than trimmed to fit.
    timeout: 600_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: process.env.CI
    ? portableProjects
    : [
        {
          name: 'installed-edge',
          use: { ...devices['Desktop Chrome'], channel: 'msedge' },
        },
        ...portableProjects,
      ],
});
