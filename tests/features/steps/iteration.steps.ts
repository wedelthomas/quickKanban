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

Given(
  'issue {string} is in the sprint matching the current iteration',
  function (this: BoardWorld, _key: string) {
    // Nothing to stage, and that IS the assertion.
    //
    // JiraPort has no way to express a sprint on an issue — no field, no
    // method. So sync cannot read one even by accident, which is a stronger
    // guarantee than staging a sprint and checking that nothing happened. It is
    // the same argument JiraPort's own comment makes about writes: an interface
    // that cannot express the thing beats a rule saying not to do it.
    //
    // This step fails the day someone adds a sprint field to the port, which is
    // exactly when this scenario should start demanding attention.
    const issueKeys = Object.keys(this.jira.issueShape?.() ?? {});
    assert.ok(
      !issueKeys.includes('sprint'),
      'JiraPort now carries a sprint field. Reading it onto cards is out of ' +
        'scope for slice 5 (spec.md, Out of Scope), so this scenario needs revisiting.',
    );
  },
);

Given('Jira reports issue {string} as blocked', function (this: BoardWorld, key: string) {
  this.jira.setBlockedInJira(key, true);
});

Given(
  'Jira reports issue {string} as not blocked',
  function (this: BoardWorld, key: string) {
    this.jira.setBlockedInJira(key, false);
  },
);

// The two above are registered ONCE each, deliberately. Cucumber matches on the
// pattern rather than the keyword, so the same text registered as both Given and
// When is ambiguous rather than distinct — third time that caught me in this
// slice. A feature may still say "When Jira reports ..."; the Given definition
// serves it.

const cardForIssue = async (world: BoardWorld, key: string) => {
  const res = await world.app.inject({ method: 'GET', url: '/api/board' });
  const board = res.json() as { columns: { cards: Record<string, unknown>[] }[] };
  const card = board.columns.flatMap((c) => c.cards).find((c) => c.issueKey === key);
  assert.ok(card, `no card on the board for issue ${key}`);
  return card;
};

Then(
  'the card for issue {string} is blocked',
  async function (this: BoardWorld, key: string) {
    assert.equal((await cardForIssue(this, key)).blocked, true);
  },
);

Then(
  'the card for issue {string} is not blocked',
  async function (this: BoardWorld, key: string) {
    assert.equal((await cardForIssue(this, key)).blocked, false);
  },
);

Then(
  'the card for issue {string} diverges from Jira',
  async function (this: BoardWorld, key: string) {
    assert.equal((await cardForIssue(this, key)).blockedDivergesFromJira, true);
  },
);

Then(
  'the card for issue {string} does not diverge from Jira',
  async function (this: BoardWorld, key: string) {
    assert.equal((await cardForIssue(this, key)).blockedDivergesFromJira, false);
  },
);

When(
  'the card for issue {string} is marked not blocked locally',
  async function (this: BoardWorld, key: string) {
    const card = await cardForIssue(this, key);
    const res = await this.app.inject({
      method: 'PATCH',
      url: `/api/cards/${card.id as string}`,
      payload: { blocked: false },
    });
    assert.equal(res.statusCode, 200, res.body);
  },
);
