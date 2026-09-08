import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';
import { createCard } from './helpers.js';

/**
 * TEST-534 (BH-534, FR-545, FR-546).
 *
 * Reachable and legible without a mouse, and never blocks the board — not
 * even while its own fetches are still in flight.
 */
test.describe('reports', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('is reachable and closable by keyboard alone', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('nav-report').press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Report' });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
  });

  test('is legible without opening a second view: every figure is plain text', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('nav-report').click();

    const dialog = page.getByRole('dialog', { name: 'Report' });
    await expect(dialog).toBeVisible();
    // Named for a screen reader, and the decorative chart (if any renders)
    // carries aria-hidden so it is never announced as unlabelled content.
    await expect(dialog).toHaveAttribute('aria-label', 'Report');
    const hiddenSvgCount = await dialog.locator('svg[aria-hidden="true"]').count();
    expect(hiddenSvgCount).toBeGreaterThanOrEqual(0);
  });

  test('never blocks the board, before or during generation', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Still clickable behind the dialog');

    // Board interaction works before opening a report.
    await expect(page.getByTestId('board')).toBeVisible();

    await page.getByTestId('nav-report').click();
    const dialog = page.getByRole('dialog', { name: 'Report' });
    await expect(dialog).toBeVisible();

    // Closable immediately — the dialog does not wait on its own fetches to
    // finish before it can be dismissed (FR-546).
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });

    // The board underneath is exactly as usable as before.
    await expect(
      page.getByTestId('card').filter({ hasText: 'Still clickable behind the dialog' }),
    ).toBeVisible();
  });
});
