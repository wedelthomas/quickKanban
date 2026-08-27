import { expect, test } from '@playwright/test';
import { resetBoard, seedJiraCard } from './reset.js';
import { createCard } from './helpers.js';

/**
 * TEST-104 (BH-104) and TEST-110 (BH-110).
 *
 * Cards are seeded rather than synced: a browser test must not depend on what
 * happens to be assigned today, and must not be able to disturb a real backlog.
 */
test.describe('a Jira card on the board', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('shows its issue key and links to Jira, where an ad-hoc card shows neither', async ({
    page,
  }) => {
    await seedJiraCard({ key: 'AIHUB-1', summary: 'Imported from Jira' });
    await page.goto('/');
    await createCard(page, 'Mine alone');

    const jiraCard = page.getByTestId('card').filter({ hasText: 'Imported from Jira' });
    await expect(jiraCard.getByTestId('card-source')).toHaveText('AIHUB-1');
    await expect(jiraCard.getByTestId('issue-link')).toHaveAttribute(
      'href',
      'https://tsgjira.atlassian.net/browse/AIHUB-1',
    );

    // The absence of the badge is what marks a card as the user's own.
    const localCard = page.getByTestId('card').filter({ hasText: 'Mine alone' });
    await expect(localCard.getByTestId('card-source')).toHaveCount(0);
  });

  test('refuses a local title edit and says why', async ({ page }) => {
    await seedJiraCard({ key: 'AIHUB-2', summary: 'Owned by Jira' });
    await page.goto('/');

    await page.getByTestId('card').filter({ hasText: 'Owned by Jira' }).dblclick();
    const dialog = page.getByRole('dialog');

    // Shown read-only rather than editable-then-refused: an interface that
    // invites an edit it will reject is a worse interface.
    await expect(dialog.getByLabel('Title')).toHaveAttribute('readonly', '');
    await expect(dialog.getByTestId('jira-owned-note')).toBeVisible();
  });

  test('offers no delete for a Jira card', async ({ page }) => {
    await seedJiraCard({ key: 'AIHUB-3', summary: 'Cannot be deleted' });
    await page.goto('/');

    await page.getByTestId('card').filter({ hasText: 'Cannot be deleted' }).dblclick();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  });

  test("still lets the user set the card's own fields", async ({ page }) => {
    await seedJiraCard({ key: 'AIHUB-4', summary: 'Priority is mine' });
    await page.goto('/');

    await page.getByTestId('card').filter({ hasText: 'Priority is mine' }).dblclick();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Priority').selectOption('high');
    await dialog.getByRole('button', { name: 'Save' }).click();

    const card = page.getByTestId('card').filter({ hasText: 'Priority is mine' });
    await expect(card.getByTestId('card-priority')).toHaveAttribute(
      'aria-label',
      'High priority',
    );
  });
});
