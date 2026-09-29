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
const healthUrl = `http://127.0.0.1:${webPort}/debug/capabilities`;

// This config is a module, so its body runs in the Playwright runner process before any test — the
// one place where a bad port can be reported as a bad port rather than as a 10-minute timeout.
//
// `reuseExistingServer` (below) adopts whatever already answers on `webPort` without checking what
// it is. When another project on the machine serves that port, the health URL never resolves and
// the run dies on the webServer timeout with a message that blames the build. Refuse up front
// instead: only reuse a server that actually answers our health check, and say plainly what to do.
if (!process.env.CI && process.env.PLAYWRIGHT_NO_PREFLIGHT !== '1') {
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2_000) }).catch(() => null);
  if (response !== null && response.status >= 400) {
    throw new Error(
      `Something is serving ${healthUrl} but it returns HTTP ${response.status} — it is not this ` +
        `app's preview server. Playwright would adopt it and then time out waiting for a route it ` +
        `does not have. Either stop that server, or pick another port: ` +
        `PLAYWRIGHT_PORT=4174 pnpm test:e2e`,
    );
  }
}
// The normal E2E suite keeps its English and OSD fixtures prepared. Focused tests
// for assets that are already bundled can opt out so they exercise a minimal cache.
const tessdataPrefetch =
  process.env.PLAYWRIGHT_SKIP_OCR_TESSDATA_PREFETCH === '1'
    ? ''
    : 'node scripts/ensure-ocr-tessdata.mjs eng osd && ';

export default defineConfig({
  fullyParallel: false,
  testDir: './e2e',
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  // Keep the multi-browser suite within the resource envelope of hosted CI runners.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  webServer: {
    command: `${tessdataPrefetch}node node_modules/typescript/bin/tsc -p packages/engine/tsconfig.json && cd apps/web && node node_modules/@sveltejs/kit/svelte-kit.js sync && node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${webPort}`,
    url: healthUrl,
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
