import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';

/**
 * TEST-006 (BH-006) and TEST-028 (BH-028).
 *
 * The assertion that matters is legibility *without opening the card* — the
 * board's whole value is being scannable, and a card face that hid its
 * metadata behind a click would defeat it.
 */
test.describe('card face', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('shows title, priority, due date, tags and source without opening the card', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New card' }).click();

    // Scoped to the dialog: the board's priority dots carry aria-labels like
    // "Medium priority", so an unscoped getByLabel('Priority') matches them too.
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('Rotate staging certificates');
    await dialog.getByLabel('Priority').selectOption('high');
    await dialog.getByLabel('Due date').fill('2026-12-01');

    const tagField = dialog.getByLabel('Add a tag');
    await tagField.fill('ops');
    await tagField.press('Enter');
    await tagField.fill('security');
    await tagField.press('Enter');

    await dialog.getByRole('button', { name: 'Save' }).click();

    const card = page.getByTestId('card').filter({ hasText: 'Rotate staging certificates' });
    await expect(card).toBeVisible();

    // Everything below must be readable on the face itself, with no click.
    await expect(card.getByTestId('card-priority')).toHaveAttribute('aria-label', 'High priority');
    await expect(card.getByTestId('card-due')).toBeVisible();
    await expect(card.getByTestId('card-tag')).toHaveCount(2);
    // Local cards carry no source badge; the badge's absence is the signal.
    await expect(card.getByTestId('card-source')).toHaveCount(0);
  });

  test('a card lands in Backlog, not elsewhere', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New card' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('Lands in backlog');
    await dialog.getByRole('button', { name: 'Save' }).click();

    const backlog = page.getByTestId('column').filter({ has: page.getByText('Backlog') });
    await expect(backlog.getByTestId('card')).toHaveText([/Lands in backlog/]);
  });

  test('a blank title is refused with a stated reason', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New card' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('   ');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('title-error')).toBeVisible();
    await expect(page.getByTestId('card')).toHaveCount(0);
  });

  test('a card in Done stays visible and offers no archive action (BH-028)', async ({ page }) => {
    await page.goto('/');
    await page.locator('body').click();

    // Put a card genuinely in Done rather than asserting against an empty
    // column: the behaviour is about what happens to finished work.
    await page.keyboard.press('n');
    await page.keyboard.type('Finished work');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.keyboard.press('j');
    await page.keyboard.press('6');

    await expect
      .poll(() => page.locator('[data-column-key="done"] .card-title').allTextContents())
      .toEqual(['Finished work']);

    // Still on the board, not hidden away. Archival arrives in slice 4 and
    // nothing here may offer it.
    await expect(page.getByTestId('card').filter({ hasText: 'Finished work' })).toBeVisible();
    await expect(page.getByRole('button', { name: /archive/i })).toHaveCount(0);
  });
});
