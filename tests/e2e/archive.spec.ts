import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';
import { createCard } from './helpers.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Backdates a card into the archive. Archival itself only stamps now(), so a
 *  card archived N days ago cannot be produced by running a pass. */
const archiveDaysAgo = async (title: string, days: number): Promise<void> => {
  await run('docker', [
    'compose',
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    process.env.POSTGRES_USER ?? 'kanban',
    '-d',
    process.env.POSTGRES_DB ?? 'kanban',
    '-c',
    `UPDATE cards SET column_id = 6, archived_at = now() - interval '${days} days'
      WHERE title = $$${title}$$;`,
  ]);
};

/**
 * TEST-313 and TEST-314 (BH-313, BH-314).
 */
test.describe('the archive', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('browses by date range, grouped by completion date (BH-313)', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Finished recently');
    await createCard(page, 'Finished long ago');
    await archiveDaysAgo('Finished recently', 3);
    await archiveDaysAgo('Finished long ago', 60);

    await page.getByTestId('nav-archive').click();

    // Default range is the last 30 days, so only one of the two.
    await expect(page.getByTestId('archive-card')).toHaveCount(1);
    await expect(page.getByTestId('archive-card').first()).toContainText(
      'Finished recently',
    );
    await expect(page.getByTestId('archive-day')).toHaveCount(1);

    // Widen the range and the older one appears.
    await page
      .getByTestId('archive-from')
      .fill(new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10));
    await expect(page.getByTestId('archive-card')).toHaveCount(2);
    await expect(page.getByTestId('archive-day')).toHaveCount(2);
  });

  test('an archived card keeps its detail (BH-314)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New card' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('Kept everything');
    const tagField = dialog.getByLabel('Add a tag');
    await tagField.fill('ops');
    await tagField.press('Enter');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await archiveDaysAgo('Kept everything', 2);

    await page.getByTestId('nav-archive').click();

    const card = page.getByTestId('archive-card').filter({ hasText: 'Kept everything' });
    await expect(card).toBeVisible();
    await expect(card.getByTestId('archive-tag')).toHaveText('ops');
  });

  test('an empty range states it plainly (BH-315)', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('nav-archive').click();

    // Not a blank panel: a blank panel is indistinguishable from a failure.
    await expect(page.getByTestId('archive-empty')).toBeVisible();
    await expect(page.getByTestId('archive-card')).toHaveCount(0);
  });
});
