import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compose, createCard, getBoard, moveCard, waitForHealthy } from './helpers.js';

/**
 * TEST-019 (BH-019). The point of this test is the volume: it destroys and
 * recreates both containers, which is the exact operation that would lose the
 * user's ad-hoc cards if the data lived inside the container filesystem.
 * Ad-hoc cards exist nowhere else — see risk R-7.
 */
describe('data survives container recreation', () => {
  const placed: { title: string; columnId: number }[] = [];

  beforeAll(async () => {
    await compose('down', '-v');
    await compose('up', '-d', '--build');
    await waitForHealthy();

    for (const columnId of [1, 2, 4, 6]) {
      const title = `Card destined for column ${columnId}`;
      const card = await createCard(title);
      if (columnId !== 1) await moveCard(card.id, columnId);
      placed.push({ title, columnId });
    }

    // Destroy the containers but NOT the volume — the recreation the user
    // performs on every image rebuild.
    await compose('down');
    await compose('up', '-d');
    await waitForHealthy();
  }, 300_000);

  afterAll(async () => {
    await compose('down', '-v');
  }, 120_000);

  it('returns every card to the column it held before (BH-019)', async () => {
    const board = await getBoard();
    const found = board.columns.flatMap((c) =>
      c.cards.map((card) => ({ ...card, columnId: c.id })),
    );

    expect(found).toHaveLength(placed.length);
    for (const expected of placed) {
      const card = found.find((c) => c.title === expected.title);
      expect(card, `card "${expected.title}" should still exist`).toBeDefined();
      expect(card!.columnId).toBe(expected.columnId);
    }
  });
});
