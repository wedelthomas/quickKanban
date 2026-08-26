import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';
import type { Board, Card, Priority } from '../../../src/shared/types.js';

const list = (csv: string): string[] =>
  csv.split(',').map((s) => s.trim()).filter(Boolean);

const board = (world: BoardWorld): Board => world.response.body as Board;

const allCards = (b: Board): Card[] => b.columns.flatMap((c) => c.cards);

/** The card the last creating step produced. */
const lastCard = (world: BoardWorld): Card => {
  assert.ok(world.lastCard, 'no card has been created in this scenario');
  return world.lastCard;
};

const offsetDate = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// --- creating -------------------------------------------------------------

const create = async (
  world: BoardWorld,
  payload: Record<string, unknown>,
): Promise<void> => {
  const res = await world.request('POST', '/api/cards', payload);
  if (res.status === 201) world.lastCard = res.body as Card;
};

When('a card titled {string} is created', async function (this: BoardWorld, title: string) {
  await create(this, { title });
});

// Registered once: cucumber matches on the text, not the keyword, so
// registering the same pattern under both Given and When is ambiguous rather
// than helpful. A feature file may still read it as either.
Given('a card titled {string} is created with tags {string}', async function (
  this: BoardWorld,
  title: string,
  tags: string,
) {
  await create(this, { title, tags: list(tags) });
});

When('a card titled {string} is created with priority {string}', async function (
  this: BoardWorld,
  title: string,
  priority: string,
) {
  await create(this, { title, priority });
});

When(
  'a card titled {string} is created with priority {string}, due date {string} and tags {string}',
  async function (this: BoardWorld, title: string, priority: string, dueDate: string, tags: string) {
    await create(this, { title, priority, dueDate, tags: list(tags) });
  },
);

When('a card titled {string} is created with a due date of today', async function (
  this: BoardWorld,
  title: string,
) {
  await create(this, { title, dueDate: offsetDate(0) });
});

When('a card titled {string} is created with a due date of yesterday', async function (
  this: BoardWorld,
  title: string,
) {
  await create(this, { title, dueDate: offsetDate(-1) });
});

When('a card is created with the title {string}', async function (this: BoardWorld, title: string) {
  await create(this, { title });
});

// --- reading --------------------------------------------------------------

When('the board is requested', async function (this: BoardWorld) {
  await this.request('GET', '/api/board');
});

When('tags matching {string} are requested', async function (this: BoardWorld, q: string) {
  await this.request('GET', `/api/tags?q=${encodeURIComponent(q)}`);
});

// --- board assertions -----------------------------------------------------

Then('the board has exactly {int} columns', function (this: BoardWorld, count: number) {
  assert.equal(board(this).columns.length, count);
});

Then('the columns are in the order {string}', function (this: BoardWorld, order: string) {
  assert.deepEqual(board(this).columns.map((c) => c.key), list(order));
});

Then('every column is present even when it holds no cards', function (this: BoardWorld) {
  const empty = board(this).columns.filter((c) => c.cards.length === 0);
  assert.equal(empty.length, 6, 'an empty board should still return all six columns');
});

Then('the board has no cards', async function (this: BoardWorld) {
  await this.request('GET', '/api/board');
  assert.deepEqual(allCards(board(this)), []);
});

Then('the board has {int} cards', async function (this: BoardWorld, count: number) {
  await this.request('GET', '/api/board');
  assert.equal(allCards(board(this)).length, count);
});

// --- card assertions ------------------------------------------------------

Then('the card appears in the {string} column', async function (this: BoardWorld, key: string) {
  const card = lastCard(this);
  await this.request('GET', '/api/board');
  const column = board(this).columns.find((c) => c.key === key);
  assert.ok(column, `no column with key ${key}`);
  assert.ok(column.cards.some((c) => c.id === card.id), `card not found in ${key}`);
});

Then('the card is at the top of that column', async function (this: BoardWorld) {
  const card = lastCard(this);
  await this.request('GET', '/api/board');
  const column = board(this).columns.find((c) => c.cards.some((x) => x.id === card.id));
  assert.equal(column?.cards[0]?.id, card.id, 'card should be first in its column');
});

Then('the card has priority {string}', function (this: BoardWorld, priority: Priority) {
  assert.equal(lastCard(this).priority, priority);
});

Then('the card has due date {string}', function (this: BoardWorld, dueDate: string) {
  assert.equal(lastCard(this).dueDate, dueDate);
});

Then('the card has source {string}', function (this: BoardWorld, source: string) {
  assert.equal(lastCard(this).source, source);
});

Then('the card carries exactly the tags {string}', function (this: BoardWorld, tags: string) {
  assert.deepEqual([...lastCard(this).tags].sort(), list(tags).sort());
});

Then('the card is marked overdue', function (this: BoardWorld) {
  assert.equal(lastCard(this).overdue, true);
});

Then('the card is not marked overdue', function (this: BoardWorld) {
  assert.equal(lastCard(this).overdue, false);
});

// --- failures -------------------------------------------------------------

Then('the request is refused with code {string}', function (this: BoardWorld, code: string) {
  const body = this.response.body as { code?: string };
  assert.equal(body.code, code, `expected code ${code}, got ${body.code}`);
  assert.ok(this.response.status >= 400, 'a refusal must not carry a 2xx status');
});

// --- tags -----------------------------------------------------------------

Then('the suggestions include {string}', function (this: BoardWorld, tag: string) {
  const body = this.response.body as { tags: { name: string }[] };
  assert.ok(body.tags.some((t) => t.name === tag), `expected "${tag}" among suggestions`);
});

Then('there are no suggestions', function (this: BoardWorld) {
  const body = this.response.body as { tags: unknown[] };
  assert.deepEqual(body.tags, []);
});

Then('the tag vocabulary contains exactly {int} tag', async function (
  this: BoardWorld,
  count: number,
) {
  const { rows } = await this.pool.query<{ count: string }>('SELECT count(*) FROM tags');
  assert.equal(Number(rows[0]!.count), count);
});
