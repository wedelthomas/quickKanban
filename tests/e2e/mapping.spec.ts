import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';

/**
 * TEST-223 (BH-223).
 *
 * The E2E stack runs with Jira unconfigured, so this also covers the case the
 * editor has to survive: no live status list to choose from, and the existing
 * mapping still legible and editable.
 */
test.describe('the column mapping editor', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('shows the seeded mapping and keeps a change across a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();

    const editor = page.getByTestId('mapping-editor');
    await expect(editor.getByTestId('mapping-test')).toHaveValue('Test');
    // Blocked ships unmapped on purpose: not every board column is a Jira status.
    await expect(editor.getByTestId('mapping-blocked')).toHaveValue('');

    await editor.getByTestId('mapping-blocked').selectOption('Development');
    // One Save for the whole dialog — the mapping is part of the settings, not
    // a separate screen with its own commit.
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByTestId('mapping-editor').getByTestId('mapping-blocked')).toHaveValue(
      'Development',
    );
  });
});
