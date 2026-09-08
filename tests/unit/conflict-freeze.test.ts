import { describe, expect, it } from 'vitest';
import { CardService } from '../../src/server/services/card-service.js';
import type { CardRepository } from '../../src/server/repositories/card-repository.js';
import type { ConflictRepository } from '../../src/server/repositories/conflict-repository.js';

/**
 * The freeze must not depend on Jira being configured.
 *
 * It did once: the check lived inside the push-to-Jira path, so a board whose
 * Jira credentials were absent moved conflicted cards freely — losing the
 * disagreement it had already recorded, in exactly the situation where the
 * user is least able to check Jira themselves.
 */
describe('a conflicted card, with no Jira configured', () => {
  const cards = {
    move: async () => {
      throw new Error('the card must never reach the repository');
    },
  } as unknown as CardRepository;

  const conflicts = { hasOpen: async () => true } as unknown as ConflictRepository;

  it('is refused, and never reaches the repository', async () => {
    // No Jira bundle at all — the third constructor argument is absent.
    const service = new CardService(cards, conflicts);

    await expect(
      service.move('card-1', { toColumnId: 5, toIndex: 1 }),
    ).rejects.toMatchObject({
      code: 'CARD_CONFLICTED',
    });
  });

  it('moves normally once the conflict is resolved', async () => {
    const moved = { id: 'card-1', columnId: 5 };
    const service = new CardService(
      {
        move: async () => ({ card: moved, moved: true }),
        // Slice 5: the service checks the target column can still receive
        // cards. This test is about the freeze, so the column is simply open.
        columnState: async () => 'open' as const,
      } as unknown as CardRepository,
      { hasOpen: async () => false } as unknown as ConflictRepository,
    );

    const result = await service.move('card-1', { toColumnId: 5, toIndex: 1 });
    expect(result.moved).toBe(true);
  });
});
