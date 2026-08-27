import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';
import { createCard } from './helpers.js';

/**
 * TEST-316 and TEST-320 (BH-316, BH-320).
 *
 * SC-306 allows exactly two interactions for a standup update: open it, copy
 * it. That budget is what these assert.
 */
test.describe('the summary', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('opens in one interaction and shows the three groups (BH-316)', async ({
    page,
  }) => {
    await page.goto('/');
    await createCard(page, 'Rotate staging certificates');

    // Move it to In Progress so there is both a movement and current state.
    await page.keyboard.press('j');
    await page.keyboard.press('2');
    await expect(
      page.getByTestId('column').filter({ hasText: 'In Progress' }).getByTestId('card'),
    ).toHaveCount(1);

    // One interaction.
    await page.getByRole('button', { name: 'Summary' }).click();

    const dialog = page.getByRole('dialog', { name: 'Summary' });
    await expect(dialog.getByTestId('summary-moved')).toContainText(
      'Rotate staging certificates',
    );
    await expect(dialog.getByTestId('summary-in-progress')).toContainText(
      'Rotate staging certificates',
    );
    // Distinguished from one another, which is the point of three groups.
    await expect(dialog.getByTestId('summary-moved')).toBeVisible();
    await expect(dialog.getByTestId('summary-in-progress')).toBeVisible();
  });

  test('copies as plain text in one more (BH-320)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await createCard(page, 'Rotate staging certificates');
    await page.keyboard.press('j');
    await page.keyboard.press('2');

    await page.getByRole('button', { name: 'Summary' }).click();
    await page.getByTestId('summary-copy').click();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('Rotate staging certificates');
    expect(clipboard).toContain('Backlog → In Progress');
    // Plain: nothing that renders differently in one chat client than another.
    expect(clipboard).not.toMatch(/[<>]/);
  });

  test('a quiet period says so rather than showing empty headings (BH-321)', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Summary' }).click();

    const dialog = page.getByRole('dialog', { name: 'Summary' });
    await expect(dialog.getByTestId('summary-empty')).toContainText(/no activity/i);
    await expect(dialog.getByTestId('summary-moved')).toHaveCount(0);
  });
});
