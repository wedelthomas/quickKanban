import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';
import type { Board, Card } from '../../../src/shared/types.js';
import { COLUMN_IDS } from './columns.js';

/** Steps for restoring a cancelled card (US4). */

const cardsOn = (board: Board): Card[] => board.columns.flatMap((c) => c.cards);

const cardForIssue = async (world: BoardWorld, issueKey: string): Promise<Card> => {
  const res = await world.request('GET', '/api/board');
  const card = cardsOn(res.body as Board).find((c) => c.issueKey === issueKey);
  assert.ok(card, `no card on the board for issue ${issueKey}`);
  return card;
};

interface ArchiveResult {
  days: {
    cards: { title: string; cancelled: boolean; cancellationReason: string | null }[];
  }[];
}

const archiveEntry = async (world: BoardWorld, title: string) => {
  const res = await world.request('GET', '/api/archive?from=2020-01-01&to=2030-01-01');
  const body = res.body as ArchiveResult;
  const entry = body.days.flatMap((d) => d.cards).find((c) => c.title === title);
  assert.ok(entry, `"${title}" is not in the archive`);
  return entry!;
};

Then(
  'the archive shows {string} as not cancelled',
  async function (this: BoardWorld, title: string) {
    const entry = await archiveEntry(this, title);
    assert.equal(entry.cancelled, false);
  },
);

Then(
  'the archive shows {string} as cancelled with reason {string}',
  async function (this: BoardWorld, title: string, reason: string) {
    const entry = await archiveEntry(this, title);
    assert.equal(entry.cancelled, true);
    assert.equal(entry.cancellationReason, reason);
  },
);

Given(
  "the card's cancelled-from column is set to the retired Blocked column",
  async function (this: BoardWorld) {
    await this.pool.query(
      'UPDATE cards SET cancelled_from_column_id = $1 WHERE id = $2',
      [COLUMN_IDS.blocked, this.lastCard!.id],
    );
  },
);

When('the card is restored', async function (this: BoardWorld) {
  await this.request('POST', `/api/cards/${this.lastCard!.id}/restore`);
});

When(
  'the card for issue {string} is restored',
  async function (this: BoardWorld, _issueKey: string) {
    // Not looked up by issue key: the card left the board when it was
    // cancelled, and `this.lastCard` (set by that earlier step) is the
    // only way back to it now.
    await this.request('POST', `/api/cards/${this.lastCard!.id}/restore`);
  },
);

Then(
  'the card for issue {string} diverges from Jira in its cancellation status',
  async function (this: BoardWorld, issueKey: string) {
    const card = await cardForIssue(this, issueKey);
    assert.equal(card.cancellationDivergesFromJira, true);
  },
);
