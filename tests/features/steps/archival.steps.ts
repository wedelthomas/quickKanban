import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { BoardWorld } from './world.js';
import type { Board, Card } from '../../../src/shared/types.js';
import { DONE_COLUMN, allCards, cardIdByTitle } from './slice4-helpers.js';

// --- archival ---------------------------------------------------------------

/**
 * Puts a card in Done and dates its arrival there.
 *
 * Written directly rather than by dragging, because the point is a card that
 * arrived N days ago and there is no way to wait N days in a test. The shape of
 * what is written is exactly what a real move writes.
 */
const placeInDoneDaysAgo = async (
  world: BoardWorld,
  cardId: string,
  days: number,
): Promise<void> => {
  await world.pool.query('UPDATE cards SET column_id = $2 WHERE id = $1', [
    cardId,
    DONE_COLUMN,
  ]);
  await world.pool.query(
    `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, kind, occurred_at)
     VALUES ($1, 1, $2, 'user', 'moved', now() - make_interval(days => $3))`,
    [cardId, DONE_COLUMN, days],
  );
};

Given(
  'a card titled {string} arrived in Done {int} days ago',
  async function (this: BoardWorld, title: string, days: number) {
    await this.request('POST', '/api/cards', { title });
    const cardId = (this.response.body as Card).id;
    await placeInDoneDaysAgo(this, cardId, days);
  },
);

Given(
  'a card titled {string} was created in Done {int} days ago',
  async function (this: BoardWorld, title: string, days: number) {
    // No arrival event at all — the case the fallback to created_at exists for.
    await this.request('POST', '/api/cards', { title });
    const cardId = (this.response.body as Card).id;
    await this.pool.query(
      `UPDATE cards SET column_id = $2, created_at = now() - make_interval(days => $3)
        WHERE id = $1`,
      [cardId, DONE_COLUMN, days],
    );
  },
);

Given(
  'the card titled {string} left Done and returned {int} day(s) ago',
  async function (this: BoardWorld, title: string, days: number) {
    const cardId = await cardIdByTitle(this, title);
    await this.pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, kind, occurred_at)
       VALUES ($1, $2, 2, 'user', 'moved', now() - make_interval(days => $3 + 1)),
              ($1, 2, $2, 'user', 'moved', now() - make_interval(days => $3))`,
      [cardId, DONE_COLUMN, days],
    );
  },
);

Given(
  'the card for issue {string} arrived in Done {int} days ago',
  async function (this: BoardWorld, key: string, days: number) {
    const { rows } = await this.pool.query<{ card_id: string }>(
      'SELECT card_id FROM jira_links WHERE issue_key = $1',
      [key],
    );
    assert.ok(rows[0], `no card for ${key}`);
    await placeInDoneDaysAgo(this, rows[0].card_id, days);
  },
);

Given(
  'the card for issue {string} has an unresolved conflict',
  async function (this: BoardWorld, key: string) {
    await this.pool.query(
      `INSERT INTO conflicts (card_id, board_column_id, jira_status_at_detection, jira_status_current)
       SELECT card_id, $2, 'Development', 'Development'
         FROM jira_links WHERE issue_key = $1`,
      [key, DONE_COLUMN],
    );
  },
);

When(
  'the archive window is set to {int} days',
  async function (this: BoardWorld, days: number) {
    await this.request('PUT', '/api/settings', { archiveWindowDays: days });
    assert.equal(this.response.status, 200);
  },
);

/**
 * Held rather than read back off `this.response`, because the assertions about
 * a run are interleaved with board reads that overwrite it. The first draft
 * asserted against whatever the last request happened to return.
 */
let lastRun: { archived: number; skippedConflicted: number; considered: number } | null =
  null;

When('archival runs', async function (this: BoardWorld) {
  await this.request('POST', '/api/archive/run');
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
  lastRun = (this.response.body as { run: typeof lastRun }).run;
});

Then(
  'the card titled {string} is archived',
  async function (this: BoardWorld, title: string) {
    const { rows } = await this.pool.query<{ archived_at: Date | null }>(
      'SELECT archived_at FROM cards WHERE title = $1',
      [title],
    );
    assert.ok(rows[0]?.archived_at, `${title} should have been archived`);

    await this.request('GET', '/api/board');
    const titles = allCards(this.response.body as Board).map((c) => c.title);
    assert.ok(!titles.includes(title), `${title} should have left the board`);
  },
);

Then(
  'the card titled {string} is on the board',
  async function (this: BoardWorld, title: string) {
    await this.request('GET', '/api/board');
    const titles = allCards(this.response.body as Board).map((c) => c.title);
    assert.ok(titles.includes(title), `${title} should still be on the board`);
  },
);

Then(
  'the card for issue {string} is on the board',
  async function (this: BoardWorld, key: string) {
    await this.request('GET', '/api/board');
    const keys = allCards(this.response.body as Board).map((c) => c.issueKey);
    assert.ok(keys.includes(key), `${key} should still be on the board`);
  },
);

Then(
  'the card titled {string} still exists in storage',
  async function (this: BoardWorld, title: string) {
    // FR-316: archived is not deleted. The row is the whole assertion.
    const { rows } = await this.pool.query('SELECT 1 FROM cards WHERE title = $1', [
      title,
    ]);
    assert.equal(rows.length, 1, `${title} must not have been deleted`);
  },
);

Then('the run archived {int} card(s)', function (n: number) {
  assert.ok(lastRun, 'archival must have run first');
  assert.equal(lastRun.archived, n);
});

Then('the run skipped {int} conflicted card(s)', function (n: number) {
  assert.ok(lastRun, 'archival must have run first');
  assert.equal(lastRun.skippedConflicted, n);
});

Then(
  'the last history record for {string} is an archival by the system',
  async function (this: BoardWorld, title: string) {
    const cardId = await cardIdByTitle(this, title);
    const { rows } = await this.pool.query<{ actor: string; kind: string }>(
      'SELECT actor, kind FROM card_events WHERE card_id = $1 ORDER BY id DESC LIMIT 1',
      [cardId],
    );
    assert.equal(rows[0]?.kind, 'archived');
    assert.equal(rows[0]?.actor, 'system');
  },
);
