import { Given, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';

/** Steps about what the board reports, as opposed to what it imports. */
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

Then(
  'the sync status reports the last run as {string}',
  async function (this: BoardWorld, outcome: string) {
    const status = await syncStatus(this);
    assert.equal(status.lastRun?.outcome, outcome);
  },
);

Then(
  'the sync failure kind is {string}',
  async function (this: BoardWorld, kind: string) {
    const status = await syncStatus(this);
    assert.equal(status.lastRun?.failureKind, kind);
  },
);

Given(
  'the application is running without Jira configured',
  async function (this: BoardWorld) {
    // Rebuilt without a port rather than with a fake that refuses: "not
    // configured" and "configured but failing" are different states and the
    // board reports them differently.
    await this.restartWithoutJira();
  },
);

Then('the sync status reports Jira as not configured', async function (this: BoardWorld) {
  const status = await syncStatus(this);
  assert.equal(status.configured, false);
});
