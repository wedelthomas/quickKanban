import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { BoardWorld } from './world.js';
import type { Summary } from '../../../src/shared/types.js';
import { COLUMN_IDS, cardIdByTitle } from './slice4-helpers.js';

// --- summaries --------------------------------------------------------------

let lastSummary: Summary | null = null;
let historyBefore: string | null = null;

Given(
  'the card titled {string} is moved to the {string} column',
  async function (this: BoardWorld, title: string, key: string) {
    const cardId = await cardIdByTitle(this, title);
    await this.request('POST', `/api/cards/${cardId}/move`, {
      toColumnId: COLUMN_IDS[key],
      toIndex: 1,
    });
    assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
  },
);

Given(
  'the card titled {string} moved to {string} {int} days ago',
  async function (this: BoardWorld, title: string, key: string, days: number) {
    // Backdated directly: the point is a movement N days old, and there is no
    // way to wait N days in a test. The row written is the shape a real move
    // writes.
    const cardId = await cardIdByTitle(this, title);
    await this.pool.query('UPDATE cards SET column_id = $2 WHERE id = $1', [
      cardId,
      COLUMN_IDS[key],
    ]);
    await this.pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, kind, occurred_at)
       VALUES ($1, 1, $2, 'user', 'moved', now() - make_interval(days => $3))`,
      [cardId, COLUMN_IDS[key], days],
    );
  },
);

Given(
  'the card titled {string} is deleted',
  async function (this: BoardWorld, title: string) {
    const cardId = await cardIdByTitle(this, title);
    await this.request('DELETE', `/api/cards/${cardId}`);
  },
);

Given('the history is remembered', async function (this: BoardWorld) {
  const { rows } = await this.pool.query(
    'SELECT id, card_id, from_column_id, to_column_id, actor, kind FROM card_events ORDER BY id',
  );
  historyBefore = JSON.stringify(rows);
  assert.ok(rows.length > 0, 'nothing to compare against');
});

When(
  'a {string} summary is generated',
  async function (this: BoardWorld, period: string) {
    await this.request('GET', `/api/summary?period=${period}`);
    assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
    lastSummary = this.response.body as Summary;
  },
);

When('{int} summaries are generated', async function (this: BoardWorld, n: number) {
  for (let i = 0; i < n; i += 1) {
    await this.request('GET', '/api/summary?period=weekly');
    assert.equal(this.response.status, 200);
  }
});

Then('the summary lists {string} as moved', function (title: string) {
  assert.ok(lastSummary, 'a summary must have been generated');
  const titles = lastSummary.moved.map((m) => m.title);
  assert.ok(
    titles.includes(title),
    `expected ${title} among moved: ${titles.join(', ')}`,
  );
});

Then('the summary does not list {string} as moved', function (title: string) {
  assert.ok(lastSummary, 'a summary must have been generated');
  assert.ok(!lastSummary.moved.map((m) => m.title).includes(title));
});

Then('the summary lists {string} as in progress', function (title: string) {
  assert.ok(lastSummary, 'a summary must have been generated');
  assert.ok(lastSummary.inProgress.map((c) => c.title).includes(title));
});

Then('the summary lists {string} as blocked', function (title: string) {
  assert.ok(lastSummary, 'a summary must have been generated');
  assert.ok(lastSummary.blocked.map((c) => c.title).includes(title));
});

Then(
  'the summary marks the movement of {string} as coming from Jira',
  function (issueKey: string) {
    assert.ok(lastSummary, 'a summary must have been generated');
    const entry = lastSummary.moved.find((m) => m.issueKey === issueKey);
    assert.ok(entry, `no movement for ${issueKey}`);
    assert.equal(entry.actor, 'sync');
    // And in the text, which is what gets pasted — a marker that existed only
    // in the structure would be lost at the moment it mattered.
    assert.match(lastSummary.text, /\(in Jira\)/);
  },
);

Then('the history is unchanged', async function (this: BoardWorld) {
  assert.ok(historyBefore, 'the history must have been remembered first');
  const { rows } = await this.pool.query(
    'SELECT id, card_id, from_column_id, to_column_id, actor, kind FROM card_events ORDER BY id',
  );
  assert.equal(
    JSON.stringify(rows),
    historyBefore,
    'generating a summary must write nothing',
  );
});
