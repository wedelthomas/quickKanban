import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';
import { cardTitlesIn, createCard, dragCardTo } from './helpers.js';

/**
 * TEST-009 (BH-009) and TEST-010 (BH-010).
 *
 * The revert is the important half. An optimistic move that fails silently
 * leaves the board confidently wrong, which is the exact condition this
 * product exists to prevent.
 */
test.describe('optimistic movement', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('the move renders before the server responds (BH-009)', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Optimistic');

    // Hold the move request open; the card must already have moved on screen.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/cards/*/move', async (route) => {
      await held;
      await route.continue();
    });

    await dragCardTo(page, 'Optimistic', 'in_progress');

    await expect.poll(() => cardTitlesIn(page, 'in_progress')).toEqual(['Optimistic']);
    release();
  });

  test('a rejected move reverts the card and says why (BH-010)', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Doomed');

    await page.route('**/api/cards/*/move', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'The board could not reach its data store',
          status: 503,
          code: 'DATABASE_UNAVAILABLE',
          detail: 'The change was not saved.',
        }),
      }),
    );

    await dragCardTo(page, 'Doomed', 'test');

    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual(['Doomed']);
    await expect.poll(() => cardTitlesIn(page, 'test')).toEqual([]);
    await expect(page.getByTestId('move-error')).toBeVisible();
    await expect(page.getByTestId('move-error')).toContainText(/not saved|could not/i);
  });
});
