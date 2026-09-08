import { expect, test } from '@playwright/test';
import { resetBoard, seedJiraCard } from './reset.js';
import { createCard } from './helpers.js';

/**
 * T521 (BH-513, FR-518, FR-519).
 *
 * Only a browser proves the points field is reachable without a mouse and
 * that a local override's divergence from Jira is visible on the card face
 * without opening the dialog — the same two facts blocked-card.spec.ts
 * already proves for its own field.
 */
test.describe('a card’s points', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('can be set by keyboard alone in the card dialog', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Keyboard pointed');

    await page.getByTestId('card').filter({ hasText: 'Keyboard pointed' }).dblclick();
    const dialog = page.getByRole('dialog');

    const input = dialog.getByTestId('card-points-input');
    await input.focus();
    await page.keyboard.type('5');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await dialog.waitFor({ state: 'detached' });

    const card = page.getByTestId('card').filter({ hasText: 'Keyboard pointed' });
    await expect(card.getByTestId('card-points')).toHaveText('5');
  });

  test('shows the imported value until a local override diverges from it', async ({
    page,
  }) => {
    await seedJiraCard({ key: 'AIHUB-5', summary: 'Estimated in Jira', points: 3 });
    await page.goto('/');

    const card = page.getByTestId('card').filter({ hasText: 'Estimated in Jira' });
    await expect(card.getByTestId('card-points')).toHaveText('3');
    expect(await card.getByTestId('card-points-diverges').count()).toBe(0);

    await card.dblclick();
    const dialog = page.getByRole('dialog');
    const input = dialog.getByTestId('card-points-input');
    await input.fill('8');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await dialog.waitFor({ state: 'detached' });

    // Visible on the card face itself — no second view needed (FR-518).
    await expect(card.getByTestId('card-points')).toHaveText('8');
    await expect(card.getByTestId('card-points-diverges')).toBeVisible();
  });
});
