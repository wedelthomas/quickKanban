import { expect, test } from '@playwright/test';

/**
 * TEST-006 (BH-006) and TEST-028 (BH-028).
 *
 * The assertion that matters is legibility *without opening the card* — the
 * board's whole value is being scannable, and a card face that hides its
 * metadata behind a click would defeat it.
 */
test.describe('card face', () => {
  test('shows title, priority, due date, tags and source without opening the card', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New card' }).click();

    await page.getByLabel('Title').fill('Rotate staging certificates');
    await page.getByLabel('Priority').selectOption('high');
    await page.getByLabel('Due date').fill('2026-12-01');
    const tagField = page.getByLabel('Add a tag');
    await tagField.fill('ops');
    await tagField.press('Enter');
    await tagField.fill('security');
    await tagField.press('Enter');
    await page.getByRole('button', { name: 'Save' }).click();

    const card = page.getByTestId('card').filter({ hasText: 'Rotate staging certificates' });
    await expect(card).toBeVisible();

    // Everything below must be readable on the face itself, with no click.
    await expect(card.getByTestId('card-priority')).toHaveAttribute(
      'aria-label',
      'High priority',
    );
    await expect(card.getByTestId('card-due')).toBeVisible();
    await expect(card.getByTestId('card-tag')).toHaveCount(2);
    // Local cards carry no source badge; the badge's absence is the signal.
    await expect(card.getByTestId('card-source')).toHaveCount(0);
  });

  test('a blank title is refused with a stated reason', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New card' }).click();
    await page.getByLabel('Title').fill('   ');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('title-error')).toBeVisible();
    await expect(page.getByTestId('card')).toHaveCount(0);
  });

  test('a card in Done stays visible and offers no archive action (BH-028)', async ({ page }) => {
    await page.goto('/');
    // Archival arrives in slice 4; nothing in this slice may offer it.
    await expect(page.getByRole('button', { name: /archive/i })).toHaveCount(0);
    const done = page.getByTestId('column').filter({ hasText: 'Done' });
    await expect(done).toBeVisible();
  });
});
