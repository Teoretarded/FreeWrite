// Playwright config for FreeWrite Electron end-to-end tests.
//
// These tests launch the real built Electron app (out/main/index.js) via the
// Playwright `_electron` driver. There is no webServer — the app boots itself.
// Timeouts are generous because the first Electron launch (and the large
// renderer bundle) can be slow on a cold machine.

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // The e2e specs are named *.e2e.mjs (NOT *.spec/*.test) on purpose: vitest's
  // default glob grabs **/*.{test,spec}.* and would otherwise try to run these
  // Electron tests as unit tests. Tell Playwright to match the e2e suffix.
  testMatch: '**/*.e2e.mjs',
  // Electron launch + bundle load can be slow; give each test room.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Electron app instances don't share state cleanly across parallel workers
  // (single app, single user-data dir), so run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']]
})
