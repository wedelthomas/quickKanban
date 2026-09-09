import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';
import { createCard } from './helpers.js';

/**
 * TEST-605 (BH-605), plus polish coverage for BH-633/FR-638 (T736).
 *
 * Cancelling asks for a reason and a confirmation, so it needs its own
 * keyboard path proven the same way blocked-card.spec.ts already proves
 * one for the toggle it introduced.
 */
test.describe('cancelling a card', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('is reachable and completable by keyboard alone', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Keyboard-only cancellation');

    await page.getByTestId('card').filter({ hasText: 'Keyboard-only cancellation' }).dblclick();
    const dialog = page.getByRole('dialog');

    const cancelButton = dialog.getByTestId('cancel-card-button');
    await cancelButton.focus();
    await page.keyboard.press('Enter');

    const reasonInput = dialog.getByTestId('cancel-reason-input');
    await expect(reasonInput).toBeVisible();
    await reasonInput.focus();
    await page.keyboard.type('No longer needed');

    await dialog.getByTestId('confirm-cancel-card').focus();
    await page.keyboard.press('Enter');
    await dialog.waitFor({ state: 'detached' });

    // The outcome is conveyed by the card's absence, not by any colour cue.
    await expect(
      page.getByTestId('card').filter({ hasText: 'Keyboard-only cancellation' }),
    ).toHaveCount(0);
  });

  test('never blocks board interaction while completing', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Cancel this one');
    await createCard(page, 'Board stays usable');

    await page.getByTestId('card').filter({ hasText: 'Cancel this one' }).dblclick();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('cancel-card-button').click();
    await dialog.getByTestId('cancel-reason-input').fill('test');
    await dialog.getByTestId('confirm-cancel-card').click();
    await dialog.waitFor({ state: 'detached' });

    // The board underneath is immediately interactive — no spinner, no
    // disabled state waiting on a Jira round trip this card has none of.
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(
      page.getByTestId('card').filter({ hasText: 'Board stays usable' }),
    ).toBeVisible();
  });
});
