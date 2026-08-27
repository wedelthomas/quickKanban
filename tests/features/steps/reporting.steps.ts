import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { BoardWorld } from './world.js';
import type { Board, Card } from '../../../src/shared/types.js';

/**
 * Steps for slice 4 — filtering, archival, the archive and summaries.
 *
 * Grows across US1 through US5 rather than being rewritten per story.
 */

const allCards = (board: Board): Card[] => board.columns.flatMap((c) => c.cards);

/** Positions as at the first time this ran, for comparing after. */
let arrangementBefore: Map<string, string> | null = null;

const arrangement = (board: Board): Map<string, string> =>
  new Map(allCards(board).map((c) => [c.id, `${c.columnId}:${c.position}`]));

/**
 * Snapshots the board BEFORE anything is attempted, so the later comparison is
 * between two separate fetches rather than a response against itself. The first
 * draft of this compared one response to a map built from that same response,
 * which passes no matter what the code does.
 */
Given("the board's arrangement is remembered", async function (this: BoardWorld) {
  await this.request('GET', '/api/board');
  arrangementBefore = arrangement(this.response.body as Board);
  assert.ok(arrangementBefore.size > 0, 'nothing to compare against');
});

When('the board is fetched with a filter parameter', async function (this: BoardWorld) {
  // Deliberately meaningless to the server. If a filter parameter is ever
  // added, this scenario fails and the requirement gets re-examined rather
  // than quietly lost.
  await this.request('GET', '/api/board?q=rotate&tag=ops&priority=high');
});

Then("the board's arrangement is unchanged", async function (this: BoardWorld) {
  assert.ok(arrangementBefore, 'the arrangement must have been remembered first');
  // A fresh read, not the response to the attempt — the question is what the
  // board looks like now, not what one request happened to return.
  await this.request('GET', '/api/board');
  const now = arrangement(this.response.body as Board);
  assert.deepEqual([...now.entries()].sort(), [...arrangementBefore.entries()].sort());
});

Then('the movement history is empty', async function (this: BoardWorld) {
  const { rows } = await this.pool.query<{ count: string }>(
    'SELECT count(*) FROM card_events',
  );
  assert.equal(rows[0]?.count, '0', 'filtering must write no history');
});

Then('the response contains every card, unfiltered', function (this: BoardWorld) {
  const cards = allCards(this.response.body as Board);
  assert.equal(cards.length, 2, 'the server must ignore filter parameters entirely');
});
