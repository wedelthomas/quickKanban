import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';
import type { Board, Card } from '../../../src/shared/types.js';

const board = async (world: BoardWorld): Promise<Board> =>
  (await world.request('GET', '/api/board')).body as Board;

const cardFor = async (world: BoardWorld, key: string): Promise<Card> => {
  const b = await board(world);
  const card = b.columns.flatMap((c) => c.cards).find((c) => c.issueKey === key);
  assert.ok(card, `no card for issue ${key}`);
  return card;
};

// --- staging Jira's workflow -------------------------------------------

Given(
  'issue {string} offers the transition {string} leading to {string}',
  function (this: BoardWorld, key: string, name: string, toStatus: string) {
    // Named unlike its destination on purpose: this is what real workflows do,
    // and code that matches on the transition's name fails exactly here.
    this.jira.setTransitions(key, [
      { id: '900', name, toStatusName: toStatus, requiresFields: false },
    ]);
  },
);

Given(
  'issue {string} offers the transition {string} leading to {string} requiring fields',
  function (this: BoardWorld, key: string, name: string, toStatus: string) {
    this.jira.setTransitions(key, [
      { id: '901', name, toStatusName: toStatus, requiresFields: true },
    ]);
  },
);

Given(
  'issue {string} offers only the transition {string} leading to {string}',
  function (this: BoardWorld, key: string, name: string, toStatus: string) {
    this.jira.setTransitions(key, [
      { id: '902', name, toStatusName: toStatus, requiresFields: false },
    ]);
  },
);

Given(
  'issue {string} offers no transitions at all',
  function (this: BoardWorld, key: string) {
    // A workflow that cannot reach the mapped status at all reads as a stale
    // mapping, not as a refused transition — the user's fix is different.
    this.jira.setTransitions(key, []);
  },
);

// --- assertions about Jira's side ---------------------------------------

Then(
  'issue {string} has status {string} in Jira',
  function (this: BoardWorld, key: string, status: string) {
    const issue = this.jira.currentIssues().find((i) => i.key === key);
    assert.ok(issue, `no such issue in Jira: ${key}`);
    assert.equal(issue.statusName, status);
  },
);

Then('no transition was performed in Jira', function (this: BoardWorld) {
  assert.deepEqual(
    this.jira.transitionsPerformed,
    [],
    'nothing should have been written to Jira here',
  );
});

// --- conflicts -----------------------------------------------------------

Then(
  'the card for issue {string} is in conflict',
  async function (this: BoardWorld, key: string) {
    assert.equal((await cardFor(this, key)).hasConflict, true);
  },
);

Then(
  'the card for issue {string} is not in conflict',
  async function (this: BoardWorld, key: string) {
    assert.equal((await cardFor(this, key)).hasConflict, false);
  },
);

Then(
  'exactly {int} open conflict exists',
  async function (this: BoardWorld, count: number) {
    const { rows } = await this.pool.query<{ count: string }>(
      'SELECT count(*) FROM conflicts WHERE resolved_at IS NULL',
    );
    assert.equal(Number(rows[0]!.count), count);
  },
);

Then(
  'exactly {int} open conflicts exist',
  async function (this: BoardWorld, count: number) {
    const { rows } = await this.pool.query<{ count: string }>(
      'SELECT count(*) FROM conflicts WHERE resolved_at IS NULL',
    );
    assert.equal(Number(rows[0]!.count), count);
  },
);

Then(
  'the conflict shows Jira as {string}',
  async function (this: BoardWorld, status: string) {
    const { rows } = await this.pool.query<{ jira_status_current: string }>(
      'SELECT jira_status_current FROM conflicts WHERE resolved_at IS NULL',
    );
    assert.equal(rows[0]?.jira_status_current, status);
  },
);

Given(
  "issue {string}'s last recorded status is {string}",
  async function (this: BoardWorld, key: string, status: string) {
    // Reproduces the state a *failed push* leaves behind: the board has moved on
    // but the last successful sync still records the older Jira status. Set
    // directly because the only honest way to reach it through the interface is
    // to have a Jira write fail mid-sync, which is precisely what this scenario
    // is about rather than what it wants to spend its setup on.
    await this.pool.query('UPDATE jira_links SET status_name = $2 WHERE issue_key = $1', [
      key,
      status,
    ]);
  },
);

const openConflictId = async (world: BoardWorld): Promise<number> => {
  const { rows } = await world.pool.query<{ id: string }>(
    'SELECT id FROM conflicts WHERE resolved_at IS NULL ORDER BY id LIMIT 1',
  );
  assert.ok(rows[0], 'expected an open conflict');
  return Number(rows[0].id);
};

When('the open conflicts are listed', async function (this: BoardWorld) {
  await this.request('GET', '/api/conflicts');
});

Then(
  'the conflict names the board column {string}',
  function (this: BoardWorld, name: string) {
    const body = this.response.body as { conflicts: { board: { columnName: string } }[] };
    assert.equal(body.conflicts[0]?.board.columnName, name);
  },
);

const resolve = async (world: BoardWorld, resolution: string): Promise<void> => {
  const id = await openConflictId(world);
  await world.request('POST', `/api/conflicts/${id}/resolve`, { resolution });
};

// Registered once each: cucumber matches on text, not keyword, so the same
// phrase under both Given and When is ambiguous rather than convenient.
When(
  'the conflict is resolved by keeping the board state',
  async function (this: BoardWorld) {
    await resolve(this, 'kept_board');
  },
);

When(
  'the conflict is resolved by accepting the Jira state',
  async function (this: BoardWorld) {
    await resolve(this, 'accepted_jira');
  },
);

Then(
  'the conflict was resolved as {string}',
  async function (this: BoardWorld, resolution: string) {
    const { rows } = await this.pool.query<{ resolution: string }>(
      'SELECT resolution FROM conflicts ORDER BY id DESC LIMIT 1',
    );
    assert.equal(rows[0]?.resolution, resolution);
  },
);

Given('the record of Jira writes so far is set aside', function (this: BoardWorld) {
  this.jira.forgetTransitionsPerformed();
});
