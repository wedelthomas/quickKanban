import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';
import type { Board, Card } from '../../../src/shared/types.js';
import { anIssue } from '../../../src/server/jira/fake-jira-adapter.js';
import { DEFAULT_JQL } from '../../../src/domain/jql.js';

const list = (csv: string): string[] => csv.split(',').map((s) => s.trim()).filter(Boolean);

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

Given('Jira has an issue {string} with status {string}', function (
  this: BoardWorld,
  key: string,
  status: string,
) {
  this.jira.setIssues([anIssue({ key, statusName: status })]);
});

Given('Jira also has an issue {string} with status {string}', function (
  this: BoardWorld,
  key: string,
  status: string,
) {
  this.jira.setIssues([...this.jira.currentIssues(), anIssue({ key, statusName: status })]);
});

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

When('issue {string} is retitled {string}', function (this: BoardWorld, key: string, title: string) {
  this.jira.setIssues([anIssue({ key, summary: title })]);
});

When('issue {string} changes status to {string}', function (
  this: BoardWorld,
  key: string,
  status: string,
) {
  this.jira.setIssues([anIssue({ key, statusName: status })]);
});

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

Then('the {string} column holds {int} cards', async function (
  this: BoardWorld,
  key: string,
  count: number,
) {
  const b = await board(this);
  assert.equal(b.columns.find((c) => c.key === key)?.cards.length, count);
});

Then('the board has a card for issue {string}', async function (this: BoardWorld, key: string) {
  await cardFor(this, key);
});

Then('the card for issue {string} has title {string}', async function (
  this: BoardWorld,
  key: string,
  title: string,
) {
  assert.equal((await cardFor(this, key)).title, title);
});

Then('the card for issue {string} is in the {string} column', async function (
  this: BoardWorld,
  key: string,
  columnKey: string,
) {
  const b = await board(this);
  const column = b.columns.find((c) => c.cards.some((card) => card.issueKey === key));
  assert.equal(column?.key, columnKey);
});

When('the card for issue {string} is moved to the {string} column', async function (
  this: BoardWorld,
  key: string,
  columnKey: string,
) {
  const ids: Record<string, number> = {
    backlog: 1, in_progress: 2, blocked: 3, test: 4, po_review: 5, done: 6,
  };
  const card = await cardFor(this, key);
  await this.request('POST', `/api/cards/${card.id}/move`, {
    toColumnId: ids[columnKey],
    toIndex: 1,
  });
});

Then('the sync succeeded', function (this: BoardWorld) {
  const body = this.response.body as { run?: { outcome: string } };
  assert.equal(this.response.status, 200);
  assert.equal(body.run?.outcome, 'succeeded');
});

Then('Jira was asked the default query', function (this: BoardWorld) {
  assert.ok(this.jira.queries.includes(DEFAULT_JQL), `queries: ${this.jira.queries.join(' | ')}`);
});

Then('no write request was issued to Jira', function (this: BoardWorld) {
  // The port cannot express a write, so this asserts the guarantee the
  // interface already makes rather than counting requests.
  assert.equal(typeof (this.jira as unknown as Record<string, unknown>).transitionIssue,
    'undefined', 'the Jira port must expose no write operation');
});

Then('the recorded Jira status for {string} is {string}', async function (
  this: BoardWorld,
  key: string,
  status: string,
) {
  const { rows } = await this.pool.query<{ status_name: string }>(
    'SELECT status_name FROM jira_links WHERE issue_key = $1',
    [key],
  );
  assert.equal(rows[0]?.status_name, status);
});

Then('the recorded Jira update time for {string} is {string}', async function (
  this: BoardWorld,
  key: string,
  at: string,
) {
  const { rows } = await this.pool.query<{ jira_updated_at: Date }>(
    'SELECT jira_updated_at FROM jira_links WHERE issue_key = $1',
    [key],
  );
  assert.equal(rows[0]?.jira_updated_at.toISOString(), at);
});

Then('the last sync time for {string} is recorded', async function (this: BoardWorld, key: string) {
  const { rows } = await this.pool.query<{ last_synced_at: Date }>(
    'SELECT last_synced_at FROM jira_links WHERE issue_key = $1',
    [key],
  );
  assert.ok(rows[0]?.last_synced_at instanceof Date);
});

Then('the ad-hoc card {string} is in the {string} column', async function (
  this: BoardWorld,
  title: string,
  columnKey: string,
) {
  const b = await board(this);
  const column = b.columns.find((c) => c.cards.some((card) => card.title === title));
  assert.equal(column?.key, columnKey, `"${title}" should be in ${columnKey}`);
});

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

const syncStatus = async (world: BoardWorld) =>
  (await world.request('GET', '/api/sync/status')).body as {
    configured: boolean;
    running: boolean;
    lastSuccessAt: string | null;
    lastRun: { outcome: string | null; failureKind: string | null } | null;
  };

Then('the sync status reports a last success', async function (this: BoardWorld) {
  const status = await syncStatus(this);
  assert.ok(status.lastSuccessAt, 'expected a last success time');
});

Then('the sync status still reports a last success', async function (this: BoardWorld) {
  const status = await syncStatus(this);
  // Retained through a failure: "failing now" and "last worked an hour ago"
  // are different facts and the user needs both to judge the board.
  assert.ok(status.lastSuccessAt, 'a failure must not erase the last success');
});

Then('the sync status reports the last run as {string}', async function (
  this: BoardWorld,
  outcome: string,
) {
  const status = await syncStatus(this);
  assert.equal(status.lastRun?.outcome, outcome);
});

Then('the sync failure kind is {string}', async function (this: BoardWorld, kind: string) {
  const status = await syncStatus(this);
  assert.equal(status.lastRun?.failureKind, kind);
});

Given('the application is running without Jira configured', async function (this: BoardWorld) {
  // Rebuilt without a port rather than with a fake that refuses: "not
  // configured" and "configured but failing" are different states and the
  // board reports them differently.
  await this.restartWithoutJira();
});

Then('the sync status reports Jira as not configured', async function (this: BoardWorld) {
  const status = await syncStatus(this);
  assert.equal(status.configured, false);
});
