import { defineConfig, devices } from '@playwright/test';

const portableProjects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
];

export default defineConfig({
  fullyParallel: false,
  testDir: './e2e',
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  webServer: {
    command:
      'pnpm --filter @complianttools/image-engine build && pnpm --filter @complianttools/web build && pnpm --filter @complianttools/web preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/convert',
    reuseExistingServer: !process.env.CI,
    // A cold engine tsc + Vite build of the full prerendered site measures ~195 s locally, so the
    // previous 180 s budget was under the actual build time -- CI always builds cold, so it could
    // only pass by luck. Kept well clear of the 45-minute job limit rather than trimmed to fit.
    timeout: 600_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
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
