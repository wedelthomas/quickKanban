import { describe, expect, it, vi } from 'vitest';
import { CardService } from '../../src/server/services/card-service.js';
import type { CardRepository } from '../../src/server/repositories/card-repository.js';
import type { ConflictRepository } from '../../src/server/repositories/conflict-repository.js';
import type { SettingsRepository } from '../../src/server/repositories/settings-repository.js';

/**
 * The jiraEnabled toggle is a runtime gate independent of whether
 * credentials exist: a jira bundle can be present (credentials configured)
 * while the setting is off, and no push may happen in that state. See
 * docs/superpowers/specs/2026-09-08-jira-toggle-design.md.
 */
describe('a card move with Jira integration toggled off', () => {
  const cards = {
    columnState: async () => 'open' as const,
    move: async (id: string) => ({
      card: { id, columnId: 5 },
      moved: true,
    }),
  } as unknown as CardRepository;

  const conflicts = { hasOpen: async () => false } as unknown as ConflictRepository;

  it('never reads the Jira link, and pushes nothing', async () => {
    const findByCardId = vi.fn();
    const settings = {
      read: async () => ({ jiraEnabled: false }),
    } as unknown as SettingsRepository;

    const service = new CardService(cards, conflicts, () => new Date(), {
      transitions: {} as never,
      mappings: {} as never,
      links: { findByCardId } as never,
      settings,
    });

    const result = await service.move('card-1', { toColumnId: 5, toIndex: 1 });

    expect(findByCardId).not.toHaveBeenCalled();
    expect(result.jira).toBeUndefined();
  });

  it('pushes normally once the toggle is on', async () => {
    const findByCardId = vi.fn().mockResolvedValue(null); // ad-hoc card
    const settings = {
      read: async () => ({ jiraEnabled: true }),
    } as unknown as SettingsRepository;

    const service = new CardService(cards, conflicts, () => new Date(), {
      transitions: {} as never,
      mappings: {} as never,
      links: { findByCardId } as never,
      settings,
    });

    await service.move('card-1', { toColumnId: 5, toIndex: 1 });

    expect(findByCardId).toHaveBeenCalledWith('card-1');
  });
});
