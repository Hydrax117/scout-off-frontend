import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT ?? '3100';
const BASE_URL = `http://127.0.0.1:${PORT}`;

// A dedicated port + explicit NEXT_PUBLIC_BASE_URL/NEXT_PUBLIC_DOMAIN keep the
// dev server's SEP-10 origin check (app/api/auth/sep10/route.ts) happy —
// it rejects requests whose Origin header doesn't match exactly.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  // Real network calls (SEP-10 challenge/verify, wallet signing round-trip)
  // plus Next dev-mode's on-demand route compilation need more than the
  // 5s default on a cold run.
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_BASE_URL: BASE_URL,
      NEXT_PUBLIC_DOMAIN: `127.0.0.1:${PORT}`,
      NEXT_PUBLIC_NETWORK: 'testnet',
      NEXT_PUBLIC_HORIZON_URL: 'https://horizon-testnet.stellar.org',
      NEXT_PUBLIC_SOROBAN_RPC: 'https://soroban-testnet.stellar.org',
      // SEP-10 challenges are built/verified locally (no network call), so
      // any keypair works here — see e2e/README.md.
      SEP10_SERVER_KEY:
        process.env.SEP10_SERVER_KEY ??
        'SC3DZLMLSQROXMTXYPX6YLQPOWFNDAIZIH6APZTXOSSUAU2Q43E7UKZL',
      SEP10_HOME_DOMAIN: process.env.SEP10_HOME_DOMAIN ?? `127.0.0.1:${PORT}`,
    },
  },
});
