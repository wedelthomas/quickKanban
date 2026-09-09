import { Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';
import type { Board, Card } from '../../../src/shared/types.js';

/**
 * Steps for cancelling and restoring (US1, US4).
 *
 * Reads `cancelled_at`/`cancellation_reason` directly via `this.pool`,
 * mirroring editing.steps.ts's "the card's record is still in storage" —
 * proving retention is a fact about the row, not about whichever view
 * happens to expose it. The Archive view's own surfacing of these fields
 * (distinguishability, FR-627) is restoring.feature's job (US4).
 */

const cardsOn = (board: Board): Card[] => board.columns.flatMap((c) => c.cards);

const findByTitle = async (world: BoardWorld, title: string): Promise<Card> => {
  const res = await world.request('GET', '/api/board');
  const card = cardsOn(res.body as Board).find((c) => c.title === title);
  assert.ok(card, `no card titled "${title}" is on the board`);
  return card;
};

const cardForIssue = async (world: BoardWorld, issueKey: string): Promise<Card> => {
  const res = await world.request('GET', '/api/board');
  const card = cardsOn(res.body as Board).find((c) => c.issueKey === issueKey);
  assert.ok(card, `no card on the board for issue ${issueKey}`);
  return card;
};

const cancel = async (
  world: BoardWorld,
  cardId: string,
  reason: string,
): Promise<void> => {
  await world.request('POST', `/api/cards/${cardId}/cancel`, { reason });
};

const cancellationRow = async (
  world: BoardWorld,
  cardId: string,
): Promise<{ cancelled_at: Date | null; cancellation_reason: string | null; deleted_at: Date | null }> => {
  const { rows } = await world.pool.query<{
    cancelled_at: Date | null;
    cancellation_reason: string | null;
    deleted_at: Date | null;
  }>('SELECT cancelled_at, cancellation_reason, deleted_at FROM cards WHERE id = $1', [cardId]);
  assert.equal(rows.length, 1, `no stored row for card ${cardId}`);
  return rows[0]!;
};

When(
  'the card is cancelled with reason {string}',
  async function (this: BoardWorld, reason: string) {
    await cancel(this, this.lastCard!.id, reason);
  },
);

When(
  'the card is cancelled again with reason {string}',
  async function (this: BoardWorld, reason: string) {
    await cancel(this, this.lastCard!.id, reason);
  },
);

When(
  'cancelling the card is attempted with an empty reason',
  async function (this: BoardWorld) {
    await cancel(this, this.lastCard!.id, '');
  },
);

When(
  'the card titled {string} is cancelled with reason {string}',
  async function (this: BoardWorld, title: string, reason: string) {
    const card = await findByTitle(this, title);
    await cancel(this, card.id, reason);
  },
);

When(
  'the card for issue {string} is cancelled with reason {string}',
  async function (this: BoardWorld, issueKey: string, reason: string) {
    // Found and stored BEFORE cancelling — the card leaves the board the
    // moment this succeeds, so it cannot be found by this same query again.
    this.lastCard = await cardForIssue(this, issueKey);
    await cancel(this, this.lastCard.id, reason);
  },
);

Then('the cancelled card is retrievable', async function (this: BoardWorld) {
  const row = await cancellationRow(this, this.lastCard!.id);
  assert.ok(!row.deleted_at, 'a cancelled card must not be soft-deleted');
  assert.ok(row.cancelled_at, 'the row should be marked cancelled');
});

Then(
  'the cancelled card titled {string} is retrievable',
  async function (this: BoardWorld, title: string) {
    const { rows } = await this.pool.query<{ id: string; cancelled_at: Date | null }>(
      'SELECT id, cancelled_at FROM cards WHERE title = $1',
      [title],
    );
    assert.equal(rows.length, 1, `no stored row titled "${title}"`);
    assert.ok(rows[0]!.cancelled_at, `"${title}" is not marked cancelled`);
  },
);

Then(
  'the card titled {string} is not retrievable',
  async function (this: BoardWorld, title: string) {
    const { rows } = await this.pool.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM cards WHERE title = $1',
      [title],
    );
    assert.equal(rows.length, 1, `no stored row titled "${title}"`);
    assert.ok(rows[0]!.deleted_at, `"${title}" should be soft-deleted, not cancelled`);
  },
);

Then(
  "the cancelled card's reason is {string}",
  async function (this: BoardWorld, reason: string) {
    const row = await cancellationRow(this, this.lastCard!.id);
    assert.equal(row.cancellation_reason, reason);
  },
);

Then('the last record was attributed to the user', function (this: BoardWorld) {
  assert.equal(this.events!.at(-1)!.actor, 'user');
});
