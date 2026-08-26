import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';
import { cardTitlesIn, createCard, dragCardTo } from './helpers.js';

/** TEST-025 (BH-025), plus the editing and deletion halves of BH-012 and BH-013. */
test.describe('a full working cycle', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('create, move, edit and delete without a full page reload (BH-025)', async ({ page }) => {
    await page.goto('/');

    // A marker on window survives re-renders but not a document reload, so it
    // is a stronger check than counting navigations the SPA never makes.
    await page.evaluate(() => {
      (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
    });

    await createCard(page, 'Round trip');
    await dragCardTo(page, 'Round trip', 'in_progress');
    await expect.poll(() => cardTitlesIn(page, 'in_progress')).toEqual(['Round trip']);

    await page.getByTestId('card').filter({ hasText: 'Round trip' }).dblclick();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('Round trip, renamed');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => cardTitlesIn(page, 'in_progress')).toEqual(['Round trip, renamed']);

    await page.getByTestId('card').filter({ hasText: 'Round trip, renamed' }).dblclick();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.getByTestId('confirm-delete').click();
    await expect.poll(() => cardTitlesIn(page, 'in_progress')).toEqual([]);

    const survived = await page.evaluate(
      () => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true,
    );
    expect(survived, 'the page reloaded at some point in the cycle').toBe(true);
  });

  test('a save that the server refuses is explained, not silent', async ({ page }) => {
    // Found by review: only move failures were surfaced. A failed create left
    // the dialog open with no explanation, and the rejection unhandled — the
    // user could not tell a failed save from one still in flight.
    await page.goto('/');
    await page.route('**/api/cards', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 503,
            contentType: 'application/problem+json',
            body: JSON.stringify({
              type: 'about:blank',
              title: 'The board could not reach its data store',
              status: 503,
              code: 'DATABASE_UNAVAILABLE',
              detail: 'The change was not saved.',
            }),
          })
        : route.continue(),
    );

    await page.getByRole('button', { name: 'New card' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('Will not save');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByTestId('title-error')).toBeVisible();
    await expect(page.getByTestId('title-error')).toContainText(/not saved/i);
    await expect(dialog).toBeVisible();
  });

  test('an edit persists across a reload (BH-012)', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Before');

    await page.getByTestId('card').filter({ hasText: 'Before' }).dblclick();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('After');
    await dialog.getByLabel('Priority').selectOption('high');
    await dialog.getByLabel('Due date').fill('2026-12-01');
    const tagField = dialog.getByLabel('Add a tag');
    await tagField.fill('ops');
    await tagField.press('Enter');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual(['After']);
    await page.reload();

    const card = page.getByTestId('card').filter({ hasText: 'After' });
    await expect(card.getByTestId('card-priority')).toHaveAttribute('aria-label', 'High priority');
    await expect(card.getByTestId('card-tag')).toHaveCount(1);
  });

  test('cancelling the delete confirmation leaves the card alone (BH-013)', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Spared');

    await page.getByTestId('card').filter({ hasText: 'Spared' }).dblclick();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.getByTestId('cancel-delete').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual(['Spared']);
  });
});
