import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  webServer: {
    command:
      'pnpm --filter @complianttools/image-engine build && pnpm --filter @complianttools/web dev',
    url: 'http://127.0.0.1:4173/debug/capabilities',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'installed-edge',
      use: { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
