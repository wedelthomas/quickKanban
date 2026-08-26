import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';
import type { Board, Card } from '../../../src/shared/types.js';

const COLUMN_IDS: Record<string, number> = {
  backlog: 1,
  in_progress: 2,
  blocked: 3,
  test: 4,
  po_review: 5,
  done: 6,
};

const list = (csv: string): string[] => csv.split(',').map((s) => s.trim()).filter(Boolean);

const fetchBoard = async (world: BoardWorld): Promise<Board> => {
  const res = await world.request('GET', '/api/board');
  return res.body as Board;
};

const findByTitle = async (world: BoardWorld, title: string): Promise<Card> => {
  const board = await fetchBoard(world);
  const card = board.columns.flatMap((c) => c.cards).find((c) => c.title === title);
  assert.ok(card, `no card titled "${title}" on the board`);
  return card;
};

Given('cards titled {string} are created in the {string} column', async function (
  this: BoardWorld,
  titles: string,
  columnKey: string,
) {
  // Created oldest-first, but each lands on top, so create in reverse to end
  // up with the stated order reading down the column.
  for (const title of [...list(titles)].reverse()) {
    await this.request('POST', '/api/cards', { title });
  }
  assert.equal(columnKey, 'backlog', 'cards can only be created into Backlog');
});

When('the card is moved to the {string} column at position {int}', async function (
  this: BoardWorld,
  columnKey: string,
  position: number,
) {
  const card = this.lastCard ?? (await findByTitle(this, this.lastCard!.title));
  await this.request('POST', `/api/cards/${card.id}/move`, {
    toColumnId: COLUMN_IDS[columnKey],
    toIndex: position,
  });
  const body = this.response.body as { card?: Card };
  if (body?.card) this.lastCard = body.card;
});

When('card {string} is moved to the {string} column at position {int}', async function (
  this: BoardWorld,
  title: string,
  columnKey: string,
  position: number,
) {
  const card = await findByTitle(this, title);
  await this.request('POST', `/api/cards/${card.id}/move`, {
    toColumnId: COLUMN_IDS[columnKey],
    toIndex: position,
  });
});

When('the card is moved to column {int} at position {int}', async function (
  this: BoardWorld,
  columnId: number,
  position: number,
) {
  await this.request('POST', `/api/cards/${this.lastCard!.id}/move`, {
    toColumnId: columnId,
    toIndex: position,
  });
});

When('an unknown card is moved to the {string} column at position {int}', async function (
  this: BoardWorld,
  columnKey: string,
  position: number,
) {
  await this.request('POST', '/api/cards/00000000-0000-4000-8000-000000000000/move', {
    toColumnId: COLUMN_IDS[columnKey],
    toIndex: position,
  });
});

Then('the move is reported as applied', function (this: BoardWorld) {
  const body = this.response.body as { moved: boolean };
  assert.equal(this.response.status, 200);
  assert.equal(body.moved, true);
});

Then('the move is reported as not applied', function (this: BoardWorld) {
  const body = this.response.body as { moved: boolean };
  assert.equal(this.response.status, 200);
  assert.equal(body.moved, false, 'a move to the position already held must not be applied');
});

Then('the card is in the {string} column', async function (this: BoardWorld, columnKey: string) {
  const board = await fetchBoard(this);
  const column = board.columns.find((c) => c.key === columnKey);
  assert.ok(column, `no column ${columnKey}`);
  assert.ok(
    column.cards.some((c) => c.id === this.lastCard!.id),
    `card not found in ${columnKey}`,
  );
});

Then('the {string} column holds the cards {string}', async function (
  this: BoardWorld,
  columnKey: string,
  titles: string,
) {
  const board = await fetchBoard(this);
  const column = board.columns.find((c) => c.key === columnKey);
  assert.deepEqual(column?.cards.map((c) => c.title), list(titles));
});

Then('the {string} column positions are contiguous from one', async function (
  this: BoardWorld,
  columnKey: string,
) {
  const board = await fetchBoard(this);
  const column = board.columns.find((c) => c.key === columnKey);
  assert.deepEqual(
    column?.cards.map((c) => c.position),
    column?.cards.map((_, i) => i + 1),
    'positions must stay contiguous — a gap means a renumber was missed',
  );
});
