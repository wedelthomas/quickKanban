import type { Page } from '@playwright/test';

export const createCard = async (page: Page, title: string): Promise<void> => {
  await page.getByRole('button', { name: 'New card' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.getByTestId('card').filter({ hasText: title }).waitFor();
};

export const column = (page: Page, key: string) =>
  page
    .getByTestId('column')
    .filter({ has: page.locator(`[data-column-key="${key}"]`) })
    .or(page.locator(`[data-column-key="${key}"]`))
    .first();

export const cardTitlesIn = async (page: Page, key: string): Promise<string[]> =>
  page
    .locator(`[data-column-key="${key}"] [data-testid="card"] .card-title`)
    .allTextContents();

/**
 * dnd-kit listens for pointer movement rather than a single drop event, so a
 * drag has to be performed as real mouse steps. One big jump is ignored — the
 * intermediate moves are what the sensor activates on.
 */
export const dragCardTo = async (page: Page, title: string, targetColumnKey: string) => {
  const card = page.getByTestId('card').filter({ hasText: title }).first();
  const target = page.locator(`[data-column-key="${targetColumnKey}"] .column-cards`);

  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('card or target column not visible');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // A few steps, so the pointer sensor registers a drag rather than a click.
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(
      from.x + ((to.x + to.width / 2 - from.x) * i) / 8,
      from.y + ((to.y + 30 - from.y) * i) / 8,
      { steps: 2 },
    );
  }
  await page.mouse.up();
};
