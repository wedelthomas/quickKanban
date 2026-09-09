import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';
import { createCard } from './helpers.js';

/**
 * TEST-737 (SC-10): restoring is reachable and completable by keyboard alone,
 * starting from the archive view a cancelled card is found in.
 */
test.describe('restoring a cancelled card', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('is reachable and completable by keyboard alone', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Cancel then restore me');

    await page
      .getByTestId('card')
      .filter({ hasText: 'Cancel then restore me' })
      .dblclick();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('cancel-card-button').focus();
    await page.keyboard.press('Enter');
    await dialog.getByTestId('cancel-reason-input').focus();
    await page.keyboard.type('No longer needed');
    await dialog.getByTestId('confirm-cancel-card').focus();
    await page.keyboard.press('Enter');
    await dialog.waitFor({ state: 'detached' });

    await page.getByTestId('nav-archive').focus();
    await page.keyboard.press('Enter');
    const archive = page.getByRole('dialog', { name: 'Archive' });

    const entry = archive
      .getByTestId('archive-card')
      .filter({ hasText: 'Cancel then restore me' });
    await expect(entry).toBeVisible();
    await expect(entry.getByTestId('archive-cancelled')).toBeVisible();

    await entry.getByTestId('restore-card').focus();
    await page.keyboard.press('Enter');
    await expect(entry).toHaveCount(0);

    await archive.getByRole('button', { name: 'Close' }).focus();
    await page.keyboard.press('Enter');
    await archive.waitFor({ state: 'detached' });

    await expect(
      page.getByTestId('card').filter({ hasText: 'Cancel then restore me' }),
    ).toBeVisible();
  });
});
