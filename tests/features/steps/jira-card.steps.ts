import { Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';
import type { Board, Card } from '../../../src/shared/types.js';

const list = (csv: string): string[] => csv.split(',').map((s) => s.trim()).filter(Boolean);

const board = async (world: BoardWorld): Promise<Board> =>
  (await world.request('GET', '/api/board')).body as Board;

const cardFor = async (world: BoardWorld, key: string): Promise<Card> => {
  const b = await board(world);
  const card = b.columns.flatMap((c) => c.cards).find((c) => c.issueKey === key);
  assert.ok(card, `no card for issue ${key}`);
  return card;
};

/**
 * What a Jira card *is* on the board, and what may be done to it: identity,
 * protection, and what happens when its issue leaves the query. Separate from
 * jira.steps.ts, which stages Jira and drives syncs.
 */
Then('the card for issue {string} has source {string}', async function (
  this: BoardWorld,
  key: string,
  source: string,
) {
  assert.equal((await cardFor(this, key)).source, source);
});

Then('the card for issue {string} links to Jira', async function (this: BoardWorld, key: string) {
  const card = await cardFor(this, key);
  assert.ok(card.issueUrl?.includes(`/browse/${key}`), `expected a browse link, got ${card.issueUrl}`);
});

Then('the card has no issue key', function (this: BoardWorld) {
  assert.equal(this.lastCard!.issueKey, null);
});

When('the card for issue {string} is deleted', async function (this: BoardWorld, key: string) {
  const card = await cardFor(this, key);
  await this.request('DELETE', `/api/cards/${card.id}`);
});

When('the card for issue {string} is retitled locally to {string}', async function (
  this: BoardWorld,
  key: string,
  title: string,
) {
  const card = await cardFor(this, key);
  await this.request('PATCH', `/api/cards/${card.id}`, { title });
});

When('the card for issue {string} is given priority {string} and tags {string}', async function (
  this: BoardWorld,
  key: string,
  priority: string,
  tags: string,
) {
  const card = await cardFor(this, key);
  await this.request('PATCH', `/api/cards/${card.id}`, { priority, tags: list(tags) });
});

Then('the request succeeded', function (this: BoardWorld) {
  assert.ok(
    this.response.status >= 200 && this.response.status < 300,
    `expected success, got ${this.response.status}: ${JSON.stringify(this.response.body)}`,
  );
});

Then('the card for issue {string} has priority {string}', async function (
  this: BoardWorld,
  key: string,
  priority: string,
) {
  assert.equal((await cardFor(this, key)).priority, priority);
});

Then('the card for issue {string} is not on the board', async function (
  this: BoardWorld,
  key: string,
) {
  const b = await board(this);
  const found = b.columns.flatMap((c) => c.cards).find((c) => c.issueKey === key);
  assert.equal(found, undefined, `${key} should have left the active board`);
});

Then('the card for issue {string} is archived', async function (this: BoardWorld, key: string) {
  const { rows } = await this.pool.query<{ archived_at: Date | null; column_id: number }>(
    `SELECT c.archived_at, c.column_id FROM cards c
       JOIN jira_links jl ON jl.card_id = c.id WHERE jl.issue_key = $1`,
    [key],
  );
  assert.ok(rows[0], `${key} should still exist in storage — archived, not deleted`);
  assert.ok(rows[0].archived_at, 'archived_at should be set');
  assert.equal(rows[0].column_id, 6, 'an archived card belongs in Done');
});

Then('the card for issue {string} records why it left', async function (
  this: BoardWorld,
  key: string,
) {
  const { rows } = await this.pool.query<{ archived_reason: string | null }>(
    `SELECT c.archived_reason FROM cards c
       JOIN jira_links jl ON jl.card_id = c.id WHERE jl.issue_key = $1`,
    [key],
  );
  assert.ok(rows[0]?.archived_reason, 'a reason must be recorded, not left null');
});

Then('the last movement for issue {string} was caused by sync', async function (
  this: BoardWorld,
  key: string,
) {
  const { rows } = await this.pool.query<{ actor: string }>(
    `SELECT e.actor FROM card_events e
       JOIN jira_links jl ON jl.card_id = e.card_id
      WHERE jl.issue_key = $1 ORDER BY e.id DESC LIMIT 1`,
    [key],
  );
  assert.equal(rows[0]?.actor, 'sync');
});

Then('exactly {int} card exists for issue {string}', async function (
  this: BoardWorld,
  count: number,
  key: string,
) {
  const { rows } = await this.pool.query<{ count: string }>(
    'SELECT count(*) FROM jira_links WHERE issue_key = $1',
    [key],
  );
  assert.equal(Number(rows[0]!.count), count);
});

When('{int} refreshes are requested at once', async function (this: BoardWorld, count: number) {
  await Promise.all(
    Array.from({ length: count }, () => this.request('POST', '/api/sync/run')),
  );
});

Then('Jira was queried fewer than {int} times', function (this: BoardWorld, ceiling: number) {
  assert.ok(
    this.jira.callCount < ceiling,
    `expected fewer than ${ceiling} calls, saw ${this.jira.callCount}`,
  );
});

When('the settings are read', async function (this: BoardWorld) {
  await this.request('GET', '/api/settings');
});

When('the sync interval is set to {int} seconds', async function (this: BoardWorld, seconds: number) {
  await this.request('PUT', '/api/settings', { syncIntervalSeconds: seconds });
});

Then('the sync interval is {int} seconds', async function (this: BoardWorld, seconds: number) {
  const res = await this.request('GET', '/api/settings');
  assert.equal((res.body as { syncIntervalSeconds: number }).syncIntervalSeconds, seconds);
});

When('the query is set to {string}', async function (this: BoardWorld, jql: string) {
  await this.request('PUT', '/api/settings', { jiraJql: jql });
});

Then('Jira was asked {string}', function (this: BoardWorld, jql: string) {
  assert.ok(this.jira.queries.includes(jql), `queries: ${this.jira.queries.join(' | ')}`);
});

Then('the card for issue {string} has no history records', async function (
  this: BoardWorld,
  key: string,
) {
  const card = await cardFor(this, key);
  const res = await this.request('GET', `/api/cards/${card.id}/events`);
  assert.deepEqual((res.body as { events: unknown[] }).events, []);
});
