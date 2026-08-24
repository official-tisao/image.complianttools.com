import { defineConfig, devices } from '@playwright/test';

const portableProjects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
];

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  webServer: {
    command:
      'node node_modules/typescript/bin/tsc -p packages/engine/tsconfig.json && cd apps/web && node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/debug/capabilities',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
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
