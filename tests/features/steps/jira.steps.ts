import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';
import { columnIdFor } from './columns.js';
import type { Board, Card } from '../../../src/shared/types.js';
import { anIssue } from '../../../src/server/jira/fake-jira-adapter.js';
import { DEFAULT_JQL } from '../../../src/domain/jql.js';

const list = (csv: string): string[] =>
  csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const board = async (world: BoardWorld): Promise<Board> =>
  (await world.request('GET', '/api/board')).body as Board;

const cardFor = async (world: BoardWorld, key: string): Promise<Card> => {
  const b = await board(world);
  const card = b.columns.flatMap((c) => c.cards).find((c) => c.issueKey === key);
  assert.ok(card, `no card for issue ${key}`);
  return card;
};

Given('Jira has the issues {string}', function (this: BoardWorld, keys: string) {
  this.jira.setIssues(list(keys).map((key) => anIssue({ key })));
});

Given(
  'Jira has an issue {string} with status {string}',
  function (this: BoardWorld, key: string, status: string) {
    this.jira.setIssues([anIssue({ key, statusName: status })]);
  },
);

Given(
  'Jira also has an issue {string} with status {string}',
  function (this: BoardWorld, key: string, status: string) {
    this.jira.setIssues([
      ...this.jira.currentIssues(),
      anIssue({ key, statusName: status }),
    ]);
  },
);

Given('Jira has no issues', function (this: BoardWorld) {
  this.jira.setIssues([]);
});

Given(
  'Jira has an issue {string} with status {string} updated at {string}',
  function (this: BoardWorld, key: string, status: string, updatedAt: string) {
    this.jira.setIssues([anIssue({ key, statusName: status, updatedAt })]);
  },
);

Given('Jira rejects the credentials', function (this: BoardWorld) {
  this.jira.failWith('credentials');
});

Given('Jira is unreachable', function (this: BoardWorld) {
  this.jira.failWith('connectivity');
});

Given('Jira is reachable again', function (this: BoardWorld) {
  this.jira.failWith(null);
});

When(
  'issue {string} is retitled {string}',
  function (this: BoardWorld, key: string, title: string) {
    this.jira.setIssues([anIssue({ key, summary: title })]);
  },
);

When(
  'issue {string} changes status to {string}',
  function (this: BoardWorld, key: string, status: string) {
    this.jira.setIssues([anIssue({ key, statusName: status })]);
  },
);

When('issue {string} leaves the query', function (this: BoardWorld, key: string) {
  this.jira.setIssues(this.jira.currentIssues().filter((i) => i.key !== key));
});

When('issue {string} matches the query again', function (this: BoardWorld, key: string) {
  this.jira.setIssues([...this.jira.currentIssues(), anIssue({ key })]);
});

// Registered once: cucumber matches on text, not keyword, so the same phrase
// under both Given and When is ambiguous rather than helpful.
When('a sync runs', async function (this: BoardWorld) {
  await this.request('POST', '/api/sync/run');
});

When('{int} further syncs run', async function (this: BoardWorld, count: number) {
  for (let i = 0; i < count; i++) await this.request('POST', '/api/sync/run');
});

Then(
  'the {string} column holds {int} cards',
  async function (this: BoardWorld, key: string, count: number) {
    const b = await board(this);
    assert.equal(b.columns.find((c) => c.key === key)?.cards.length, count);
  },
);

Then(
  'the board has a card for issue {string}',
  async function (this: BoardWorld, key: string) {
    await cardFor(this, key);
  },
);

Then(
  'the card for issue {string} has title {string}',
  async function (this: BoardWorld, key: string, title: string) {
    assert.equal((await cardFor(this, key)).title, title);
  },
);

Then(
  'the card for issue {string} is in the {string} column',
  async function (this: BoardWorld, key: string, columnKey: string) {
    const b = await board(this);
    const column = b.columns.find((c) => c.cards.some((card) => card.issueKey === key));
    assert.equal(column?.key, columnKey);
  },
);

When(
  'the card for issue {string} is moved to the {string} column',
  async function (this: BoardWorld, key: string, columnKey: string) {
    const card = await cardFor(this, key);
    await this.request('POST', `/api/cards/${card.id}/move`, {
      toColumnId: columnIdFor(columnKey),
      toIndex: 1,
    });
  },
);

Then('the sync succeeded', function (this: BoardWorld) {
  const body = this.response.body as { run?: { outcome: string } };
  assert.equal(this.response.status, 200);
  assert.equal(body.run?.outcome, 'succeeded');
});

Then('Jira was asked the default query', function (this: BoardWorld) {
  assert.ok(
    this.jira.queries.includes(DEFAULT_JQL),
    `queries: ${this.jira.queries.join(' | ')}`,
  );
});

Then('no write request was issued to Jira', function (this: BoardWorld) {
  // Slice 3 gave the port a write, so this can no longer assert the capability
  // is absent. It asserts the behaviour instead: a *sync* transitions nothing.
  // Only an explicit user action may write, and a sync is not one.
  assert.deepEqual(
    this.jira.transitionsPerformed,
    [],
    'a sync must not transition anything; only a drag or a resolution may',
  );
});

Then(
  'the recorded Jira status for {string} is {string}',
  async function (this: BoardWorld, key: string, status: string) {
    const { rows } = await this.pool.query<{ status_name: string }>(
      'SELECT status_name FROM jira_links WHERE issue_key = $1',
      [key],
    );
    assert.equal(rows[0]?.status_name, status);
  },
);

Then(
  'the recorded Jira update time for {string} is {string}',
  async function (this: BoardWorld, key: string, at: string) {
    const { rows } = await this.pool.query<{ jira_updated_at: Date }>(
      'SELECT jira_updated_at FROM jira_links WHERE issue_key = $1',
      [key],
    );
    assert.equal(rows[0]?.jira_updated_at.toISOString(), at);
  },
);

Then(
  'the last sync time for {string} is recorded',
  async function (this: BoardWorld, key: string) {
    const { rows } = await this.pool.query<{ last_synced_at: Date }>(
      'SELECT last_synced_at FROM jira_links WHERE issue_key = $1',
      [key],
    );
    assert.ok(rows[0]?.last_synced_at instanceof Date);
  },
);

Then(
  'the ad-hoc card {string} is in the {string} column',
  async function (this: BoardWorld, title: string, columnKey: string) {
    const b = await board(this);
    const column = b.columns.find((c) => c.cards.some((card) => card.title === title));
    assert.equal(column?.key, columnKey, `"${title}" should be in ${columnKey}`);
  },
);

Then('every Jira card is linked to exactly one issue', async function (this: BoardWorld) {
  // Would have caught cards being linked to the wrong issue key: within a
  // transaction `now()` is identical for every row, so an ordering-based
  // lookup had no way to tell same-sync cards apart.
  const { rows } = await this.pool.query<{
    cards: string;
    links: string;
    distinct: string;
  }>(
    `SELECT (SELECT count(*) FROM cards WHERE source = 'jira' AND deleted_at IS NULL) AS cards,
            (SELECT count(*) FROM jira_links) AS links,
            (SELECT count(DISTINCT card_id) FROM jira_links) AS distinct`,
  );
  const { cards, links, distinct } = rows[0]!;
  assert.equal(links, cards, 'every Jira card must have a link');
  assert.equal(distinct, links, 'no card may carry two links');

  const { rows: mismatched } = await this.pool.query<{
    title: string;
    issue_key: string;
  }>(
    `SELECT c.title, jl.issue_key FROM cards c JOIN jira_links jl ON jl.card_id = c.id
      WHERE c.title <> 'Summary for ' || jl.issue_key`,
  );
  assert.deepEqual(mismatched, [], 'each card must carry its own issue summary');
});
