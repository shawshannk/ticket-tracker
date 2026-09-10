import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config (spec 09). Runs against the dev servers; CI starts them via `webServer` below.
 *
 * Serial, single worker: every spec drives the same seeded database, so parallel workers
 * would race on the shared ticket/user rows and produce flaky, misleading failures.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI uses Playwright's bundled browser (installed by `playwright install`).
        // Locally, `E2E_CHANNEL=chrome` reuses an installed Google Chrome instead of
        // downloading ~150MB.
        ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
        // `E2E_FORCE_IPV4=1` makes Chromium resolve localhost to 127.0.0.1. Needed when a stray
        // `pnpm run dev` holds [::1]:5173 — `localhost` then reaches *it* rather than the Compose
        // container, and testing the container via `127.0.0.1` instead is not equivalent: the
        // refresh cookie is `SameSite=Lax` on `localhost:3000`, and `127.0.0.1` is a different
        // site, so it is never sent and every page load looks signed out.
        ...(process.env.E2E_FORCE_IPV4
          ? { launchOptions: { args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] } }
          : {}),
      },
    },
  ],
  // Locally, assume `pnpm run dev` is already up; in CI, start it and wait.
  webServer: process.env.CI
    ? {
        command: 'pnpm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});
