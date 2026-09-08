import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { BoardWorld } from './world.js';

/**
 * Steps for story points import and local override (US3).
 *
 * Mirrors iteration.steps.ts's blocked-import steps exactly: points is the
 * second locally-overridable, Jira-sourced field, and it earns the same
 * "Jira arrives, local wins, the divergence is visible" treatment as blocked.
 */

const cardForIssue = async (world: BoardWorld, key: string) => {
  const res = await world.app.inject({ method: 'GET', url: '/api/board' });
  const board = res.json() as { columns: { cards: Record<string, unknown>[] }[] };
  const card = board.columns.flatMap((c) => c.cards).find((c) => c.issueKey === key);
  assert.ok(card, `no card on the board for issue ${key}`);
  return card;
};

Given(
  'Jira reports issue {string} with story points {int}',
  function (this: BoardWorld, key: string, points: number) {
    this.jira.setPointsInJira(key, points);
  },
);

Given(
  'Jira reports issue {string} with no story points',
  function (this: BoardWorld, key: string) {
    this.jira.setPointsInJira(key, null);
  },
);

Then(
  'the card for issue {string} has points {int}',
  async function (this: BoardWorld, key: string, points: number) {
    assert.equal((await cardForIssue(this, key)).points, points);
  },
);

Then(
  'the card for issue {string} is unpointed',
  async function (this: BoardWorld, key: string) {
    assert.equal((await cardForIssue(this, key)).points, null);
  },
);

Then(
  'the card for issue {string} diverges in points from Jira',
  async function (this: BoardWorld, key: string) {
    assert.equal((await cardForIssue(this, key)).pointsDivergesFromJira, true);
  },
);

When(
  'the card for issue {string} is given local points {int}',
  async function (this: BoardWorld, key: string, points: number) {
    const card = await cardForIssue(this, key);
    const res = await this.app.inject({
      method: 'PATCH',
      url: `/api/cards/${card.id as string}`,
      payload: { points },
    });
    assert.equal(res.statusCode, 200, res.body);
  },
);
