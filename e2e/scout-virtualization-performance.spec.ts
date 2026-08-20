import { test, expect } from './fixtures';
import { mockSorobanRpc } from './fixtures/mock-contract';

/**
 * Issue #781 — frame-budget and DOM-bounding verification for the
 * virtualized scout results grid.
 *
 * This is the CI-friendly frame-timing harness the issue calls for: a
 * scripted scroll through a large (500-player) result set, measured with
 * the browser's native Long Tasks API
 * (https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming)
 * rather than an approximation — a task the browser itself reports as
 * blocking the main thread for >50ms is the same signal Chrome DevTools'
 * Performance panel surfaces, just captured programmatically so it can run
 * unattended in CI. Sidesteps mocking Soroban RPC's XDR encoding for 500
 * synthetic players by driving the *name search* path
 * (`/api/players/search`, a plain JSON Next.js route) instead of the
 * contract `filter_players` path — this test is about scroll/render
 * performance and DOM bounding, not contract read correctness.
 */

function makeSyntheticPlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `perf-player-${i}`,
    wallet: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    vitals: {
      name: `Perf Player ${i}`,
      age: 20 + (i % 15),
      position: ['ST', 'CM', 'CB', 'GK'][i % 4],
      region: 'Nigeria',
      nationality: 'Nigeria',
    },
    ipfsHash: '',
    progressLevel: (i % 4) as 0 | 1 | 2 | 3,
    milestones: [],
    createdAt: 1700000000,
  }));
}

test.describe('scout results grid — virtualization performance', () => {
  test('scrolling through 500 players stays under the 50ms long-task budget and keeps the DOM bounded', async ({
    page,
    wallet,
  }) => {
    test.setTimeout(60_000);

    mockSorobanRpc(page, {
      isValidator: false,
      subscription: {
        tier: 'pro',
        expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30,
      },
    });

    const players = makeSyntheticPlayers(500);
    await page.route('**/api/players/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(players),
      });
    });

    await page.goto('/en');
    await page.getByRole('button', { name: 'Connect Wallet' }).click();
    await page.getByRole('button', { name: /freighter/i }).click();
    await expect(
      page.getByText(
        wallet.publicKey.slice(0, 4) + '…' + wallet.publicKey.slice(-4),
      ),
    ).toBeVisible();

    await page.goto('/en/scout');

    await page
      .getByLabel(/search by player name/i)
      .fill('Perf Player');

    await expect(page.getByText('500 players found')).toBeVisible({
      timeout: 10_000,
    });

    const grid = page.getByTestId('player-grid');
    await expect(grid).toBeVisible();

    // Start collecting Long Tasks before scrolling begins.
    await page.evaluate(() => {
      (window as any).__longTasks = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as any).__longTasks.push(entry.duration);
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
      (window as any).__perfObserver = observer;
    });

    const domCountAtTop = await page
      .getByTestId('player-grid')
      .locator('[role="article"]')
      .count();

    // Script a smooth scroll all the way down and back up, yielding to the
    // browser's rAF/task queue between steps so long tasks (if any) are
    // actually captured by the observer rather than coalesced into one
    // synchronous burst.
    await page.evaluate(async () => {
      const el = document.querySelector(
        '[data-testid="player-grid"]',
      ) as HTMLElement;
      const steps = 40;
      const max = el.scrollHeight - el.clientHeight;
      const wait = () => new Promise((r) => requestAnimationFrame(r));

      for (let i = 0; i <= steps; i++) {
        el.scrollTop = (max * i) / steps;
        el.dispatchEvent(new Event('scroll'));
        await wait();
      }
      for (let i = steps; i >= 0; i--) {
        el.scrollTop = (max * i) / steps;
        el.dispatchEvent(new Event('scroll'));
        await wait();
      }
    });

    const domCountAfterScroll = await page
      .getByTestId('player-grid')
      .locator('[role="article"]')
      .count();

    const longTasks: number[] = await page.evaluate(() => {
      (window as any).__perfObserver?.disconnect();
      return (window as any).__longTasks ?? [];
    });

    // The core assertion: no single main-thread task exceeded the 50ms
    // frame budget while scrolling through all 500 players.
    const worst = longTasks.length ? Math.max(...longTasks) : 0;
    expect(
      worst,
      `longest task during scroll was ${worst.toFixed(1)}ms (tasks: ${longTasks.length})`,
    ).toBeLessThanOrEqual(50);

    // Bounded DOM: mounted cards after scrolling all the way through and
    // back must be nowhere near the full 500-item list — true
    // virtualization windows the DOM instead of accumulating it.
    expect(domCountAtTop).toBeLessThan(50);
    expect(domCountAfterScroll).toBeLessThan(50);
  });

  test('RPC calls for milestone data do not scale with the number of players scrolled', async ({
    page,
    wallet,
  }) => {
    test.setTimeout(60_000);

    mockSorobanRpc(page, {
      isValidator: false,
      subscription: {
        tier: 'pro',
        expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30,
      },
    });

    const players = makeSyntheticPlayers(200);
    await page.route('**/api/players/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(players),
      });
    });

    await page.goto('/en');
    await page.getByRole('button', { name: 'Connect Wallet' }).click();
    await page.getByRole('button', { name: /freighter/i }).click();
    await expect(
      page.getByText(
        wallet.publicKey.slice(0, 4) + '…' + wallet.publicKey.slice(-4),
      ),
    ).toBeVisible();

    await page.goto('/en/scout');

    let simulateCalls = 0;
    page.on('request', (request) => {
      if (request.method() !== 'POST') return;
      if (!request.url().includes('soroban')) return;
      try {
        const body = request.postDataJSON();
        if (body?.method === 'simulateTransaction') simulateCalls++;
      } catch {
        // non-JSON body, ignore
      }
    });

    await page.getByLabel(/search by player name/i).fill('Perf Player');
    await expect(page.getByText('200 players found')).toBeVisible({
      timeout: 10_000,
    });

    const grid = page.getByTestId('player-grid');
    await page.evaluate(async () => {
      const el = document.querySelector(
        '[data-testid="player-grid"]',
      ) as HTMLElement;
      const wait = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i <= 10; i++) {
        el.scrollTop = (el.scrollHeight * i) / 10;
        el.dispatchEvent(new Event('scroll'));
        await wait();
      }
    });
    await expect(grid).toBeVisible();

    // A handful of simulate calls (subscription check, validator check,
    // one batched milestone fetch) — not one per player, and not one per
    // scroll step. 200 players scrolled through must not produce anywhere
    // near 200 simulate calls.
    expect(simulateCalls).toBeLessThan(10);
  });
});
