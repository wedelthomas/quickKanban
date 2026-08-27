import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';
import { createCard } from './helpers.js';

/**
 * TEST-119 (BH-119) and TEST-120 (BH-120).
 *
 * The pill must never become a blocker. A board that greys itself out while
 * talking to Jira is a board that stops being useful precisely when Jira is
 * slow — which is when the user most wants to get on with something else.
 */
test.describe('sync status', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard();
    await page.goto('/');
  });

  test('shows when the last sync succeeded', async ({ page }) => {
    await page.route('**/api/sync/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configured: true,
          running: false,
          lastSuccessAt: new Date().toISOString(),
          lastRun: { outcome: 'succeeded', failureKind: null },
        }),
      }),
    );
    await page.reload();

    const pill = page.getByTestId('sync-status');
    await expect(pill).toBeVisible();
    await expect(pill).toContainText(/synced/i);
  });

  test('shows a failure alongside the retained last success', async ({ page }) => {
    await page.route('**/api/sync/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configured: true,
          running: false,
          lastSuccessAt: new Date(Date.now() - 3_600_000).toISOString(),
          lastRun: { outcome: 'failed', failureKind: 'credentials' },
        }),
      }),
    );
    await page.reload();

    const pill = page.getByTestId('sync-status');
    await expect(pill).toHaveAttribute('data-state', 'failed');
    // Credentials must read differently from connectivity — the user's next
    // action is entirely different.
    await expect(pill).toContainText(/credential/i);
    await expect(pill).toContainText(/synced/i);
  });

  test('says so plainly when Jira is not configured', async ({ page }) => {
    await page.route('**/api/sync/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configured: false,
          running: false,
          lastSuccessAt: null,
          lastRun: null,
        }),
      }),
    );
    await page.reload();

    await expect(page.getByTestId('sync-status')).toContainText(/not configured/i);
  });

  test('the board stays fully usable while a sync is running', async ({ page }) => {
    await page.route('**/api/sync/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configured: true,
          running: true,
          lastSuccessAt: new Date().toISOString(),
          lastRun: { outcome: null, failureKind: null },
        }),
      }),
    );
    await page.reload();

    await expect(page.getByTestId('sync-status')).toHaveAttribute(
      'data-state',
      'running',
    );
    // No overlay, no disabled board: the card below must be creatable.
    await createCard(page, 'Made during a sync');
    await expect(
      page.getByTestId('card').filter({ hasText: 'Made during a sync' }),
    ).toBeVisible();
  });
});
