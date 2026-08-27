import { expect, test } from '@playwright/test';
import { resetBoard, seedCards } from './reset.js';

/**
 * TEST-428 (BH-428), covering FR-441.
 *
 * The board's whole value is being scannable — roughly fifty cards legible at
 * once. Every slice adds something to the card face or the page head, and each
 * addition is individually defensible; the density budget is what stops the
 * accumulation from quietly destroying the property they were all added to
 * serve.
 *
 * Slice 5 spends on three things at once: a blocked edge and badge, a
 * carry-over marker, and the iteration banner. This is where that is checked.
 *
 * On what "fifty cards without scrolling" means. NFR-14 says "a typical
 * workload (about 50 cards) without scrolling within a column", and the
 * literal single-column reading is not achievable by anything: fifty cards at
 * roughly fifty pixels each is 2500px, taller than any laptop display. A
 * typical workload of fifty cards is spread across six columns — the
 * developer's real board holds twelve — so the budget asserted here is a full
 * board of fifty distributed as a real one would be. Recorded rather than
 * quietly reinterpreted, because no test asserted this before slice 5 and the
 * first person to check should say what they found.
 */
test.describe('board density with the iteration banner present', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  test('shows a full board of fifty cards without any column scrolling', async ({
    page,
  }) => {
    await seedCards(50);
    await page.goto('/');

    await expect(page.getByTestId('card')).toHaveCount(50);

    const overflows = await page.locator('.column-cards').evaluateAll((els) =>
      els.map((el) => ({
        key: el.closest('[data-column-key]')?.getAttribute('data-column-key') ?? '?',
        overflow: el.scrollHeight - el.clientHeight,
      })),
    );

    // A few pixels of slack: sub-pixel layout rounding is not a density failure.
    const scrolling = overflows.filter((c) => c.overflow > 4);
    expect(scrolling, `columns that scroll: ${JSON.stringify(scrolling)}`).toEqual([]);
  });

  test('the page itself never scrolls sideways', async ({ page }) => {
    await seedCards(50);
    await page.goto('/');

    const body = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth + 1);
  });
});
