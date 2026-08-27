import { expect, test } from '@playwright/test';
import { resetBoard, seedJiraCard } from './reset.js';
import { createCard } from './helpers.js';

/**
 * TEST-305 through TEST-308 (BH-305…BH-308).
 *
 * Filtering is a browser concern end to end — no request is made and no server
 * state changes — so this is the layer where most of it can actually be
 * observed. The unit tests cover which cards match; these cover what the board
 * does about it.
 */
test.describe('filtering the board', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('narrows in place, keeping every column visible (BH-305)', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Rotate staging certificates');
    await createCard(page, 'Draft the quarterly report');

    await expect(page.getByTestId('card')).toHaveCount(2);
    await expect(page.getByTestId('column')).toHaveCount(6);

    await page.getByTestId('filter-text').fill('rotate');

    await expect(page.getByTestId('card')).toHaveCount(1);
    await expect(page.getByTestId('card').first()).toContainText('Rotate staging');
    // All six columns stay, including the five now empty. The board keeps its
    // shape so the user does not lose their place.
    await expect(page.getByTestId('column')).toHaveCount(6);
  });

  test('moves no card: clearing restores the original arrangement (BH-305)', async ({
    page,
  }) => {
    await page.goto('/');
    await createCard(page, 'Alpha');
    await createCard(page, 'Beta');

    const backlog = page.getByTestId('column').filter({ hasText: 'Backlog' });
    const before = await backlog.getByTestId('card').allTextContents();

    await page.getByTestId('filter-text').fill('alpha');
    await expect(page.getByTestId('card')).toHaveCount(1);
    await page.getByTestId('filter-clear').click();

    await expect(page.getByTestId('card')).toHaveCount(2);
    // Same column, same order — filtering is not a re-sort.
    expect(await backlog.getByTestId('card').allTextContents()).toEqual(before);
  });

  test('an empty filtered board says a filter is hiding cards (BH-306)', async ({
    page,
  }) => {
    await page.goto('/');
    await createCard(page, 'Alpha');

    await page.getByTestId('filter-text').fill('nothing matches this');

    await expect(page.getByTestId('card')).toHaveCount(0);
    // The whole of SC-309: an empty board must never be ambiguous between
    // "filtered" and "you have no work".
    const notice = page.getByTestId('filter-empty-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/filter/i);
    await expect(notice.getByRole('button', { name: /clear/i })).toBeVisible();
  });

  test('is reachable, applicable and clearable by keyboard alone (BH-307)', async ({
    page,
  }) => {
    await page.goto('/');
    await createCard(page, 'Alpha');
    await createCard(page, 'Beta');

    await page.keyboard.press('/');
    await expect(page.getByTestId('filter-text')).toBeFocused();

    await page.keyboard.type('alpha');
    await expect(page.getByTestId('card')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('card')).toHaveCount(2);
  });

  test('filters by tag, priority, source and overdue (BH-302, BH-303)', async ({
    page,
  }) => {
    await seedJiraCard({ key: 'AIHUB-40', summary: 'From Jira' });
    await page.goto('/');
    await createCard(page, 'Mine alone');

    await page.getByTestId('filter-source').selectOption('jira');
    await expect(page.getByTestId('card')).toHaveCount(1);
    await expect(page.getByTestId('card').first()).toContainText('From Jira');

    await page.getByTestId('filter-source').selectOption('local');
    await expect(page.getByTestId('card').first()).toContainText('Mine alone');
  });

  test('a reload opens the board unfiltered (BH-308)', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Alpha');
    await createCard(page, 'Beta');

    await page.getByTestId('filter-text').fill('alpha');
    await expect(page.getByTestId('card')).toHaveCount(1);

    await page.reload();

    // Deliberate: a filtered board must never be mistaken for a lost one.
    await expect(page.getByTestId('card')).toHaveCount(2);
    await expect(page.getByTestId('filter-text')).toHaveValue('');
  });
});
