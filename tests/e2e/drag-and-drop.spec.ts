import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';
import { cardTitlesIn, createCard, dragCardTo } from './helpers.js';

/** TEST-007 (BH-007), TEST-008 (BH-008), TEST-011 (BH-011). */
test.describe('drag and drop', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('a card dragged to another column stays there after reload (BH-007)', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Move me');

    await dragCardTo(page, 'Move me', 'in_progress');
    await expect
      .poll(() => cardTitlesIn(page, 'in_progress'))
      .toEqual(['Move me']);

    await page.reload();
    await expect.poll(() => cardTitlesIn(page, 'in_progress')).toEqual(['Move me']);
    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual([]);
  });

  test('a card released outside every column stays put (BH-011)', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Stay home');

    const card = page.getByTestId('card').filter({ hasText: 'Stay home' });
    const box = await card.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    // Drag well below the board, over no column at all.
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box!.x + box!.width / 2, box!.y + 400 + i * 20, { steps: 2 });
    }
    await page.mouse.up();

    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual(['Stay home']);
    await page.reload();
    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual(['Stay home']);
  });

  test('reordering within a column persists across reload (BH-008)', async ({ page }) => {
    await page.goto('/');
    // Each new card lands on top, so creating C, B, A yields A, B, C downward.
    await createCard(page, 'C');
    await createCard(page, 'B');
    await createCard(page, 'A');
    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual(['A', 'B', 'C']);

    const cards = page.locator('[data-column-key="backlog"] [data-testid="card"]');
    const last = await cards.nth(2).boundingBox();
    const first = await cards.nth(0).boundingBox();

    // Drop *onto* the first card, not into the gap above it. The gap is column
    // padding, which means "the column" and therefore "the end" — correct
    // behaviour, but not the gesture being tested here.
    const onto = first!.y + first!.height / 3;
    await page.mouse.move(last!.x + last!.width / 2, last!.y + last!.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(last!.x + last!.width / 2, last!.y + ((onto - last!.y) * i) / 8, {
        steps: 2,
      });
    }
    await page.mouse.up();

    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual(['C', 'A', 'B']);
    await page.reload();
    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual(['C', 'A', 'B']);
  });
});
