import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';

/**
 * TEST-124 (BH-124), and the settings half of TEST-122 (BH-122).
 *
 * The strongest assertion here is a negative one: there is no field for a
 * credential anywhere in this dialog. Anything the interface can display, it
 * can leak.
 */
test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard();
    await page.goto('/');
  });

  test('shows the query and interval, and no credential field', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });

    await expect(dialog.getByLabel('Jira query')).toHaveValue(
      'assignee = currentUser() AND statusCategory != Done',
    );
    await expect(dialog.getByLabel('Sync every')).toHaveValue('300');

    // No input anywhere may be for a secret.
    for (const term of [/token/i, /password/i, /secret/i, /api key/i, /credential/i]) {
      await expect(dialog.getByLabel(term)).toHaveCount(0);
    }
    await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
    await expect(dialog.getByTestId('credentials-note')).toBeVisible();
  });

  test('a changed query and interval persist across a reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });

    await dialog
      .getByLabel('Jira query')
      .fill('assignee = currentUser() AND project = AIHUB');
    await dialog.getByLabel('Sync every').fill('600');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    const reopened = page.getByRole('dialog', { name: 'Settings' });
    await expect(reopened.getByLabel('Jira query')).toHaveValue(
      'assignee = currentUser() AND project = AIHUB',
    );
    await expect(reopened.getByLabel('Sync every')).toHaveValue('600');
  });

  test('an out-of-range interval is refused with a reason', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });

    await dialog.getByLabel('Sync every').fill('5');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(dialog.getByTestId('settings-error')).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});
