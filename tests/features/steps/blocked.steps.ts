import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { BoardWorld } from './world.js';
import type { Board, Card } from '../../../src/shared/types.js';
import { COLUMN_ID_BY_NAME, COLUMN_IDS, allCards } from './slice4-helpers.js';

/**
 * Steps for blocked as a card attribute (US1).
 *
 * Reads the card back from the board each time rather than trusting the
 * response of the action that changed it — the two came from different queries
 * until this slice, and one of them silently omitted the new fields.
 */

const board = async (world: BoardWorld): Promise<Board> => {
  const res = await world.app.inject({ method: 'GET', url: '/api/board' });
  return res.json() as Board;
};

const cardByTitle = async (world: BoardWorld, title: string): Promise<Card> => {
  const found = allCards(await board(world)).find((c) => c.title === title);
  assert.ok(found, `no card titled ${title} is on the board`);
  return found;
};

const setBlocked = async (world: BoardWorld, title: string, blocked: boolean) => {
  const card = await cardByTitle(world, title);
  const res = await world.app.inject({
    method: 'PATCH',
    url: `/api/cards/${card.id}`,
    payload: { blocked },
  });
  assert.equal(res.statusCode, 200, `marking blocked failed: ${res.body}`);
};

// Defined once, not once per keyword: cucumber matches on the pattern, so a
// Given and a When carrying the same text are ambiguous rather than distinct.
Given(
  'the card {string} is marked blocked',
  async function (this: BoardWorld, title: string) {
    await setBlocked(this, title, true);
  },
);

When(
  'the card {string} is marked not blocked',
  async function (this: BoardWorld, title: string) {
    await setBlocked(this, title, false);
  },
);

const moveTo = async (world: BoardWorld, title: string, columnName: string) => {
  const card = await cardByTitle(world, title);
  const toColumnId = COLUMN_ID_BY_NAME[columnName];
  assert.ok(toColumnId, `unknown column ${columnName}`);
  const res = await world.app.inject({
    method: 'POST',
    url: `/api/cards/${card.id}/move`,
    payload: { toColumnId, toIndex: 1 },
  });
  world.response = { status: res.statusCode, body: res.json() };
};

Given(
  'the card {string} is moved to {string}',
  async function (this: BoardWorld, title: string, columnName: string) {
    await moveTo(this, title, columnName);
    assert.equal(
      this.response.status,
      200,
      `move failed: ${JSON.stringify(this.response.body)}`,
    );
  },
);

When(
  'the card {string} is moved to the retired Blocked column',
  async function (this: BoardWorld, title: string) {
    const card = await cardByTitle(this, title);
    const res = await this.app.inject({
      method: 'POST',
      url: `/api/cards/${card.id}/move`,
      payload: { toColumnId: COLUMN_IDS.blocked, toIndex: 1 },
    });
    this.response = { status: res.statusCode, body: res.json() };
  },
);

Then('the move is refused because the column was retired', function (this: BoardWorld) {
  assert.equal(this.response.status, 422);
  assert.equal((this.response.body as { code: string }).code, 'COLUMN_RETIRED');
});

Then(
  'the card {string} is still on the board',
  async function (this: BoardWorld, title: string) {
    await cardByTitle(this, title);
  },
);

Then('the card {string} is blocked', async function (this: BoardWorld, title: string) {
  assert.equal((await cardByTitle(this, title)).blocked, true);
});

Then(
  'the card {string} is not blocked',
  async function (this: BoardWorld, title: string) {
    assert.equal((await cardByTitle(this, title)).blocked, false);
  },
);

Then(
  'the card {string} is in {string}',
  async function (this: BoardWorld, title: string, columnName: string) {
    const card = await cardByTitle(this, title);
    assert.equal(card.columnId, COLUMN_ID_BY_NAME[columnName]);
  },
);

Then(
  "the summary's blocked group contains {string}",
  function (this: BoardWorld, title: string) {
    const body = this.response.body as { blocked: { title: string }[] };
    assert.ok(
      body.blocked.some((c) => c.title === title),
      `blocked group holds ${JSON.stringify(body.blocked.map((c) => c.title))}`,
    );
  },
);

Then(
  "the summary's in-progress group does not contain {string}",
  function (this: BoardWorld, title: string) {
    const body = this.response.body as { inProgress: { title: string }[] };
    assert.ok(!body.inProgress.some((c) => c.title === title));
  },
);

// summaries.feature says "the card titled X"; blocked-flag.feature says "the
// card X". Both read naturally in their own file, so both are supported rather
// than rewriting one feature to suit the other.
Given(
  'the card titled {string} is marked blocked',
  async function (this: BoardWorld, title: string) {
    await setBlocked(this, title, true);
  },
);
