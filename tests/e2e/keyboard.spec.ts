import { expect, test } from '@playwright/test';
import { resetBoard } from './reset.js';
import { cardTitlesIn } from './helpers.js';
import { SHORTCUTS } from '../../src/web/keyboard/shortcuts.js';

/**
 * TEST-014 (BH-014), TEST-015 (BH-015), TEST-027 (BH-027).
 *
 * Every interaction below is keyboard-only. The pointer is used exactly once
 * per test, to focus the document — after that, touching it would defeat the
 * point of the story.
 */
test.describe('keyboard operation', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard();
    await page.goto('/');
    await page.locator('body').click();
  });

  test('a card is created and moved using only the keyboard (BH-014)', async ({ page }) => {
    await page.keyboard.press('n');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The title field must already hold focus, or "press n then type" is a lie.
    await expect(dialog.getByLabel('Title')).toBeFocused();

    await page.keyboard.type('Typed with no mouse');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual(['Typed with no mouse']);

    await page.keyboard.press('j');
    await expect(page.getByTestId('card').first()).toBeFocused();

    // 4 is the Test column.
    await page.keyboard.press('4');
    await expect.poll(() => cardTitlesIn(page, 'test')).toEqual(['Typed with no mouse']);
    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual([]);

    // Focus follows the card rather than being dumped back to the top.
    await expect(page.getByTestId('card').first()).toBeFocused();
  });

  test('focus moves between cards with j and k (BH-014)', async ({ page }) => {
    for (const title of ['Third', 'Second', 'First']) {
      await page.keyboard.press('n');
      await page.keyboard.type(title);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeHidden();
    }
    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual(['First', 'Second', 'Third']);

    await page.keyboard.press('j');
    await expect(page.getByTestId('card').nth(0)).toBeFocused();
    await page.keyboard.press('j');
    await expect(page.getByTestId('card').nth(1)).toBeFocused();
    await page.keyboard.press('k');
    await expect(page.getByTestId('card').nth(0)).toBeFocused();
  });

  test('the help overlay lists every shortcut the board supports (BH-015)', async ({ page }) => {
    await page.keyboard.press('?');
    const help = page.getByTestId('shortcut-help');
    await expect(help).toBeVisible();

    // Every registered shortcut must appear — a help overlay that omits one is
    // worse than none, because it teaches the reader the shortcut is absent.
    // Compared against the registry the app itself reads, so adding a shortcut
    // without listing it fails here rather than shipping quietly.
    const listed = await help.getByTestId('shortcut-key').allTextContents();
    expect(listed.sort()).toEqual(SHORTCUTS.map((s) => s.label).sort());

    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
  });

  test('board shortcuts do not reach past an open dialog', async ({ page }) => {
    // Regression: the global handler claimed Enter as "open the focused card"
    // even while a dialog was open, so Enter on a focused Save button was
    // swallowed and the form never submitted. Found by review, not by the
    // tests above — they all submit from the title field, where the typing
    // guard already stands aside.
    await page.keyboard.press('n');
    const dialog = page.getByRole('dialog');
    await page.keyboard.type('Submitted from the button');

    await dialog.getByRole('button', { name: 'Save' }).focus();
    await page.keyboard.press('Enter');

    await expect(dialog).toBeHidden();
    await expect.poll(() => cardTitlesIn(page, 'backlog')).toEqual([
      'Submitted from the button',
    ]);
  });

  test('closing a dialog restores focus to the card it opened from (BH-027)', async ({ page }) => {
    await page.keyboard.press('n');
    await page.keyboard.type('Focus me');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.keyboard.press('j');
    const card = page.getByTestId('card').first();
    await expect(card).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    await expect(card, 'focus should return to the card, not the top of the board').toBeFocused();
  });
});
