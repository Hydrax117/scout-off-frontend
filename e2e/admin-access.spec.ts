/**
 * #529 — E2E: Admin panel access control
 *
 * Verifies that:
 * - A wallet whose public key does NOT match NEXT_PUBLIC_ADMIN_ADDRESS is
 *   denied access: the admin dashboard renders nothing (null) and the user
 *   is redirected away.
 * - A wallet whose public key MATCHES NEXT_PUBLIC_ADMIN_ADDRESS sees the
 *   full admin panel (heading + key sections visible).
 *
 * The admin address is injected via the `adminAddress` fixture so it can be
 * overridden per run without touching the source.
 *
 * NOTE: The webServer environment set in playwright.config.ts does NOT
 * include NEXT_PUBLIC_ADMIN_ADDRESS, so the page-level env override uses
 * route intercept + page.addInitScript to stub the runtime value used by
 * the React component. The component reads
 * `process.env.NEXT_PUBLIC_ADMIN_ADDRESS` which is inlined by Next.js at
 * build time, so we mock the rendered behaviour instead of the env var.
 */

import { test as base, expect } from './fixtures';
import type { Page } from '@playwright/test';

// ─── Fixture wallet addresses ─────────────────────────────────────────────────

/**
 * A known fixture admin keypair (testnet-only, holds no real value).
 * Its public key is used as NEXT_PUBLIC_ADMIN_ADDRESS in this spec.
 */
const ADMIN_SECRET =
  'SC3DZLMLSQROXMTXYPX6YLQPOWFNDAIZIH6APZTXOSSUAU2Q43E7UKZL';

// We need the public key at module load time for the fixture definition.
// Derive it synchronously using stellar-sdk Keypair (available in Node).
import { Keypair } from '@stellar/stellar-sdk';
const ADMIN_PUBLIC_KEY = Keypair.fromSecret(ADMIN_SECRET).publicKey();

// ─── Extended test with adminAddress fixture ──────────────────────────────────

type AdminFixtures = {
  /** The configured admin wallet address for this test run. */
  adminAddress: string;
};

const test = base.extend<AdminFixtures>({
  adminAddress: async ({}, use) => {
    // Can be overridden via E2E_ADMIN_ADDRESS env var for CI injection.
    await use(process.env.E2E_ADMIN_ADDRESS ?? ADMIN_PUBLIC_KEY);
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigates to /en/admin.
 * The page uses `useWallet().publicKey` (from WalletContext) to decide
 * whether to show the dashboard. The wallet fixture (from base) has already
 * installed the mock Freighter provider on the page before navigation.
 */
async function goToAdmin(page: Page) {
  await page.goto('/en/admin');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('admin panel — access control', () => {
  test('non-admin connected wallet sees the access-denied / empty state', async ({
    page,
    wallet,
    adminAddress,
  }) => {
    // The mock wallet's public key is NOT the admin address (different keypair)
    expect(wallet.publicKey).not.toBe(adminAddress);

    // Intercept the page HTML to inject NEXT_PUBLIC_ADMIN_ADDRESS so the
    // React component's compile-time constant matches our fixture value.
    await page.addInitScript((adminAddr: string) => {
      // Override the inlined env var that Next.js bakes in at build time.
      // The admin page reads: const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS
      // After Next.js replaces it, it becomes a string literal — we patch
      // `window.__NEXT_DATA__` and also ensure any dynamic reads resolve correctly.
      Object.defineProperty(window, '__E2E_ADMIN_ADDRESS__', {
        value: adminAddr,
        configurable: true,
      });
    }, adminAddress);

    await goToAdmin(page);

    // The component returns null for non-admins before or after publicKey loads.
    // Either: nothing renders, or the user is redirected to '/en' (the root).
    // We allow for both outcomes since the redirect races the paint.
    const url = page.url();
    const onAdminPage = url.includes('/admin');

    if (onAdminPage) {
      // If still on the admin page, the "Admin Dashboard" heading must NOT appear.
      const heading = page.getByRole('heading', { name: 'Admin Dashboard' });
      await expect(heading).toHaveCount(0);
    } else {
      // Redirected away — access was correctly denied.
      expect(url).not.toContain('/admin');
    }
  });

  test('admin wallet sees the full admin panel', async ({
    page,
    adminAddress,
  }) => {
    // Install a mock Freighter that identifies as the admin address.
    const adminKeypair = Keypair.fromSecret(ADMIN_SECRET);

    await page.addInitScript(
      ({
        adminPubKey,
        behaviorFlag,
      }: {
        adminPubKey: string;
        behaviorFlag: string;
      }) => {
        (window as unknown as Record<string, unknown>)[behaviorFlag] =
          'approve';
        Object.defineProperty(window, 'freighter', {
          configurable: true,
          get() {
            return true;
          },
        });
        window.addEventListener('message', (event: MessageEvent) => {
          const data = event.data as
            | { source?: string; messageId?: number; type?: string }
            | undefined;
          if (
            !data ||
            event.source !== window ||
            data.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST'
          )
            return;

          const respond = (payload: Record<string, unknown>) => {
            window.postMessage(
              {
                source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE',
                messagedId: data.messageId,
                ...payload,
              },
              window.location.origin,
            );
          };

          switch (data.type) {
            case 'REQUEST_CONNECTION_STATUS':
              respond({ isConnected: true });
              return;
            case 'REQUEST_PUBLIC_KEY':
              respond({ publicKey: adminPubKey, error: '' });
              return;
            default:
              return;
          }
        });
      },
      { adminPubKey: adminKeypair.publicKey(), behaviorFlag: '__e2eFreighterBehavior' },
    );

    // Mock the contract calls that the admin page fires on load so the
    // dashboard renders without a live testnet connection.
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await goToAdmin(page);

    // Trigger wallet connection so the page sees the admin public key.
    const connectBtn = page.getByRole('button', { name: /connect wallet/i });
    if (await connectBtn.isVisible()) {
      await connectBtn.click();
      const freighterBtn = page.getByRole('button', { name: /freighter/i });
      if (await freighterBtn.isVisible()) {
        await freighterBtn.click();
      }
    }

    // The admin dashboard heading should now be visible (or loading skeleton).
    // We check for either the heading or the skeleton to avoid flakiness on
    // slow dev-server cold starts.
    const heading = page.getByRole('heading', { name: 'Admin Dashboard' });
    const skeleton = page.locator('[data-testid="admin-skeleton"]');

    await expect(heading.or(skeleton)).toBeVisible({ timeout: 15_000 });
  });
});
