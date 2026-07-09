import { defineConfig } from '@playwright/test'

// E2E runs against the BUILT extension (run `npm run build` first).
// Extension loading is wired up in tests/e2e/fixtures.ts (Chromium persistent
// context with --load-extension). See planning/13_TEST_PLAN.md §4.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // Loading the full Chromium with an unpacked extension can be slow on a cold
  // start, so allow generous per-test time.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'on-first-retry',
  },
})
