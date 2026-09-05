import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'npm run preview -- --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'cargo run --manifest-path server/Cargo.toml',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: true,
      timeout: 180_000,
      env: { PORT: '8787', SIGNAL_SALVO_DB: '/tmp/signal-salvo-playwright.sqlite' },
    },
  ],
});
