import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  retries: 1,
  workers: 1, // serial — only one shell can bind port at a time per worker
  reporter: 'list',
  use: {
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
