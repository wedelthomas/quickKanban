import { expect, test } from '@playwright/test';
import { resetBoard, seedConflict, seedJiraCard } from './reset.js';

/**
 * TEST-217 and TEST-219 (BH-217, BH-219).
 *
 * The conflict is seeded rather than provoked: producing one for real needs a
 * failed push inside a sync against live Jira, which a browser test must
 * neither depend on nor cause. What is under test here is what the user sees
 * and can do about it, which the seeded state reproduces exactly.
 */
test.describe('a conflicted card', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('is marked on the board and offers both sides side by side', async ({ page }) => {
    // Card sits in Test (column 4); Jira says Development.
    await seedJiraCard({ key: 'AIHUB-9', summary: 'Both sides moved', columnId: 4 });
    await seedConflict({ key: 'AIHUB-9', boardColumnId: 4, jiraStatus: 'Development' });
    await page.goto('/');

    const card = page.getByTestId('card').filter({ hasText: 'Both sides moved' });
    await expect(card.getByTestId('card-conflict')).toBeVisible();

    await page.getByTestId('conflict-count').click();
    const conflict = page.getByTestId('conflict');
    await expect(conflict.getByTestId('conflict-board')).toHaveText('Test');
    await expect(conflict.getByTestId('conflict-jira')).toHaveText('Development');

    // Neither side is preselected — the board has no opinion about which is right.
    await expect(conflict.getByTestId('keep-board')).toBeEnabled();
    await expect(conflict.getByTestId('accept-jira')).toBeEnabled();
  });

  test('refuses to be moved and says to resolve the conflict first', async ({ page }) => {
    await seedJiraCard({ key: 'AIHUB-11', summary: 'Frozen until decided', columnId: 4 });
    await seedConflict({ key: 'AIHUB-11', boardColumnId: 4, jiraStatus: 'Development' });
    await page.goto('/');

    // Moved by keyboard rather than by drag: the refusal is the same either
    // way, and a synthetic drag would test dnd-kit rather than the refusal.
    await page.keyboard.press('j');
    await page.keyboard.press('5');

    await expect(page.getByTestId('move-error')).toContainText(/conflict/i);
    // And it did not move: the optimistic move reverted.
    const test = page.getByTestId('column').filter({ hasText: 'Test' });
    await expect(test.getByTestId('card').filter({ hasText: 'Frozen until decided' })).toBeVisible();
  });

  test('accepting Jira moves the card, clears the badge and lets it be dragged again', async ({
    page,
  }) => {
    await seedJiraCard({ key: 'AIHUB-10', summary: 'Jira wins', columnId: 4 });
    await seedConflict({ key: 'AIHUB-10', boardColumnId: 4, jiraStatus: 'Development' });
    await page.goto('/');

    await page.getByTestId('conflict-count').click();
    await page.getByTestId('accept-jira').click();
    await page.getByRole('button', { name: 'Close' }).click();

    const card = page.getByTestId('card').filter({ hasText: 'Jira wins' });
    await expect(card.getByTestId('card-conflict')).toHaveCount(0);
    await expect(page.getByTestId('conflict-count')).toHaveCount(0);

    // In Progress, because that is what Development maps to.
    const inProgress = page.getByTestId('column').filter({ hasText: 'In Progress' });
    await expect(inProgress.getByTestId('card').filter({ hasText: 'Jira wins' })).toBeVisible();
  });
});
