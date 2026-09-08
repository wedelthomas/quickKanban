import { Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';
import type { Board, CardEvent } from '../../../src/shared/types.js';

const COLUMN_KEYS: Record<number, string> = {
  1: 'backlog',
  2: 'in_progress',
  3: 'blocked',
  4: 'test',
  5: 'po_review',
  6: 'done',
};

const eventsFor = async (world: BoardWorld, cardId: string): Promise<CardEvent[]> => {
  const res = await world.request('GET', `/api/cards/${cardId}/events`);
  assert.equal(res.status, 200, 'the events endpoint should answer');
  return (res.body as { events: CardEvent[] }).events;
};

const cardIdByTitle = async (world: BoardWorld, title: string): Promise<string> => {
  const res = await world.request('GET', '/api/board');
  const card = (res.body as Board).columns
    .flatMap((c) => c.cards)
    .find((c) => c.title === title);
  assert.ok(card, `no card titled "${title}"`);
  return card.id;
};

Then(
  'the card has {int} history record',
  async function (this: BoardWorld, count: number) {
    this.events = await eventsFor(this, this.lastCard!.id);
    assert.equal(this.events.length, count);
  },
);

Then(
  'the card has {int} history records',
  async function (this: BoardWorld, count: number) {
    this.events = await eventsFor(this, this.lastCard!.id);
    assert.equal(this.events.length, count);
  },
);

Then('the card has no history records', async function (this: BoardWorld) {
  assert.deepEqual(await eventsFor(this, this.lastCard!.id), []);
});

Then(
  'card {string} has no history records',
  async function (this: BoardWorld, title: string) {
    const id = await cardIdByTitle(this, title);
    assert.deepEqual(await eventsFor(this, id), []);
  },
);

Then(
  'the last record moved it from {string} to {string}',
  function (this: BoardWorld, from: string, to: string) {
    const last = this.events!.at(-1)!;
    assert.equal(COLUMN_KEYS[last.fromColumnId], from);
    assert.equal(COLUMN_KEYS[last.toColumnId], to);
  },
);

Then('the last record was caused by the user', function (this: BoardWorld) {
  assert.equal(this.events!.at(-1)!.actor, 'user');
});

Then('the last record has a time', function (this: BoardWorld) {
  const at = this.events!.at(-1)!.occurredAt;
  assert.ok(
    at && !Number.isNaN(Date.parse(at)),
    `occurredAt should be a real time, got ${at}`,
  );
});

Then('the records read {string}', function (this: BoardWorld, expected: string) {
  const actual = this.events!.map(
    (e) => `${COLUMN_KEYS[e.fromColumnId]}>${COLUMN_KEYS[e.toColumnId]}`,
  );
  assert.deepEqual(
    actual,
    expected.split(',').map((s) => s.trim()),
  );
});

When('the first record is remembered', async function (this: BoardWorld) {
  const events = await eventsFor(this, this.lastCard!.id);
  this.rememberedEvent = events[0];
});

Then('the first record is unchanged', function (this: BoardWorld) {
  assert.deepEqual(
    this.events![0],
    this.rememberedEvent,
    'an appended log must never rewrite',
  );
});
