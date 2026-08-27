import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { BoardWorld } from './world.js';
import type { Iteration } from '../../../src/shared/types.js';
import type { JiraFailureKind } from '../../../src/server/jira/jira-port.js';

/**
 * Steps for the iteration banner (US2).
 *
 * The source is the fake adapter the world builds the app with, so nothing here
 * touches live Jira (FR-442). Its defaults are board 1391's real shape.
 */

let iteration: Iteration | null = null;

Given(
  "the iteration source reports both teams' sprints for {string}",
  function (this: BoardWorld, ordinal: string) {
    this.iterations.setSprints([
      {
        id: 24501,
        name: `CRM TradeBlazers ${ordinal}`,
        startsOn: '2026-08-24',
        endsOn: '2026-09-07',
      },
      { id: 24502, name: `MDS ${ordinal}`, startsOn: '2026-08-24', endsOn: '2026-09-07' },
    ]);
  },
);

Given('the iteration source reports a sprint with no dates', function (this: BoardWorld) {
  this.iterations.setUndatedSprint();
});

Given('the iteration source reports no active sprints', function (this: BoardWorld) {
  this.iterations.setNoActiveSprints();
});

Given('the iteration source is unreachable', function (this: BoardWorld) {
  this.iterations.fail('connectivity');
});

When('the iteration source becomes unreachable', function (this: BoardWorld) {
  this.iterations.fail('connectivity');
});

Given(
  'the iteration source fails with {string}',
  function (this: BoardWorld, kind: string) {
    this.iterations.fail(kind as JiraFailureKind);
  },
);

const readIteration = async (world: BoardWorld): Promise<void> => {
  const res = await world.app.inject({ method: 'GET', url: '/api/iteration' });
  world.response = { status: res.statusCode, body: res.json() };
  iteration = res.json() as Iteration | null;
};

// Once, not once per keyword: cucumber matches on the pattern, so the same
// text registered as both Given and When is ambiguous rather than distinct.
// (Second time this has bitten in this slice.)
Given('the iteration is read', async function (this: BoardWorld) {
  await readIteration(this);
});

Then('the iteration is named {string}', function (name: string) {
  assert.equal(iteration?.ordinalName, name);
});

Then('the iteration carries no name', function () {
  assert.equal(iteration?.ordinalName, null);
});

Then('the iteration was freshly read', function () {
  assert.equal(iteration?.provenance, 'read');
});

Then('the iteration is marked as not freshly read', function () {
  assert.equal(iteration?.provenance, 'cached');
});

Then('the iteration is marked as estimated', function () {
  assert.equal(iteration?.provenance, 'estimated');
});

Then('the board is still fully usable', async function (this: BoardWorld) {
  const res = await this.app.inject({ method: 'GET', url: '/api/board' });
  assert.equal(res.statusCode, 200);
});
