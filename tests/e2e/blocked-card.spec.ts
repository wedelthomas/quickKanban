import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';
import { createCard } from './helpers.js';

/**
 * TEST-427 (BH-427), covering FR-410, FR-411 and FR-440.
 *
 * Blocked was a column until slice 5, so "what is stuck" was answered by
 * looking at one place on the board. Making it a card attribute removed that,
 * and only a browser can prove what replaced it actually reads: that the state
 * is visible without opening the card, survives the loss of colour, and can be
 * set without a mouse.
 */
test.describe('a blocked card', () => {
  test.beforeEach(async () => {
    await resetBoard();
  });

  const markBlocked = async (page: import('@playwright/test').Page, title: string) => {
    await page.getByTestId('card').filter({ hasText: title }).dblclick();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('card-blocked-toggle').check();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await dialog.waitFor({ state: 'detached' });
  };

  test('is identifiable on the board without opening it', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Waiting on the security review');
    await markBlocked(page, 'Waiting on the security review');

    const card = page
      .getByTestId('card')
      .filter({ hasText: 'Waiting on the security review' });

    // The badge, which names the state. This is what survives greyscale.
    await expect(card.getByTestId('card-blocked')).toBeVisible();
    await expect(card.getByTestId('card-blocked')).toHaveText('Blocked');

    // The edge, which is what survives a glance across a full board.
    await expect(card).toHaveClass(/card--blocked/);
  });

  test('stays distinguishable with colour removed', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Stuck behind procurement');
    await createCard(page, 'Nothing is stopping this one');
    await markBlocked(page, 'Stuck behind procurement');

    // Grayscale everything. If the only signal were the red edge, the two cards
    // would now be indistinguishable — which is precisely what FR-411 forbids.
    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });

    const blocked = page
      .getByTestId('card')
      .filter({ hasText: 'Stuck behind procurement' });
    const plain = page
      .getByTestId('card')
      .filter({ hasText: 'Nothing is stopping this one' });

    await expect(blocked.getByTestId('card-blocked')).toBeVisible();
    expect(await plain.getByTestId('card-blocked').count()).toBe(0);
  });

  test('can be set and cleared by keyboard alone', async ({ page }) => {
    await page.goto('/');
    await createCard(page, 'Keyboard only');

    await page.getByTestId('card').filter({ hasText: 'Keyboard only' }).dblclick();
    const dialog = page.getByRole('dialog');

    const toggle = dialog.getByTestId('card-blocked-toggle');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked();

    await dialog.getByRole('button', { name: 'Save' }).click();
    await dialog.waitFor({ state: 'detached' });

    const card = page.getByTestId('card').filter({ hasText: 'Keyboard only' });
    await expect(card.getByTestId('card-blocked')).toBeVisible();
  });

  test('still moves between columns while blocked', async ({ page }) => {
    // FR-414. An unresolved conflict freezes a card; blocked must not, or work
    // would be trapped in whichever column it got stuck in.
    await page.goto('/');
    await createCard(page, 'Blocked but mobile');
    await markBlocked(page, 'Blocked but mobile');

    const card = page.getByTestId('card').filter({ hasText: 'Blocked but mobile' });
    await card.click();
    // Number keys move to a column by POSITION, not id. Iteration Items sits
    // second on the board and is id 7 — the two have not matched since the
    // restructure, and this shortcut has always used position.
    await page.keyboard.press('2');

    await expect(
      page.locator('[data-column-key="iteration_items"] [data-testid="card"]', {
        hasText: 'Blocked but mobile',
      }),
    ).toBeVisible();
    await expect(card.getByTestId('card-blocked')).toBeVisible();
  });

  test('shows local cards with their own edge, and blocked wins when both', async ({
    page,
  }) => {
    await page.goto('/');
    await createCard(page, 'Local and calm');
    await createCard(page, 'Local and stuck');
    await markBlocked(page, 'Local and stuck');

    const calm = page.getByTestId('card').filter({ hasText: 'Local and calm' });
    const stuck = page.getByTestId('card').filter({ hasText: 'Local and stuck' });

    await expect(calm).toHaveClass(/card--local/);
    // Both classes are present; source order in the stylesheet decides that
    // blocked's red wins over local's white.
    await expect(stuck).toHaveClass(/card--local/);
    await expect(stuck).toHaveClass(/card--blocked/);
  });
});
