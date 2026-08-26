import { defineConfig, devices } from '@playwright/test';

// Browser-level coverage for the two things that genuinely need a browser:
// drag-and-drop and the keyboard map.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // One worker, not merely one test at a time per file. Every spec runs against
  // the same board and the same database, so files running concurrently would
  // truncate each other's data mid-test — which shows up as failures that move
  // between runs rather than a reproducible bug.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BOARD_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  // Uses the Google Chrome already installed on the machine rather than
  // Playwright's bundled Chromium. The bundled download completes but stalls
  // during extraction on this Mac -- almost certainly endpoint security
  // scanning the 123MB archive. Chrome is a browser these tests are perfectly
  // happy in, and it removes a 123MB download from every fresh checkout.
  //
  // If you would rather have the hermetic bundled build:
  //   npx playwright install chromium
  // and drop the `channel` line below.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
