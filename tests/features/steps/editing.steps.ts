import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { BoardWorld } from './world.js';
import type { Board, Card } from '../../../src/shared/types.js';

const list = (csv: string): string[] => csv.split(',').map((s) => s.trim()).filter(Boolean);

const findByTitle = async (world: BoardWorld, title: string): Promise<Card> => {
  const res = await world.request('GET', '/api/board');
  const card = (res.body as Board).columns.flatMap((c) => c.cards).find((c) => c.title === title);
  assert.ok(card, `no card titled "${title}"`);
  return card;
};

When(
  'the card is edited to title {string}, description {string}, priority {string}, due date {string} and tags {string}',
  async function (
    this: BoardWorld,
    title: string,
    description: string,
    priority: string,
    dueDate: string,
    tags: string,
  ) {
    const res = await this.request('PATCH', `/api/cards/${this.lastCard!.id}`, {
      title,
      description,
      priority,
      dueDate,
      tags: list(tags),
    });
    if (res.status === 200) this.lastCard = res.body as Card;
  },
);

When('the card is edited to title {string}', async function (this: BoardWorld, title: string) {
  await this.request('PATCH', `/api/cards/${this.lastCard!.id}`, { title });
});

When("the card's tags are cleared", async function (this: BoardWorld) {
  const res = await this.request('PATCH', `/api/cards/${this.lastCard!.id}`, { tags: [] });
  if (res.status === 200) this.lastCard = res.body as Card;
});

When('the card is edited with no fields', async function (this: BoardWorld) {
  await this.request('PATCH', `/api/cards/${this.lastCard!.id}`, {});
});

When('the card is deleted', async function (this: BoardWorld) {
  await this.request('DELETE', `/api/cards/${this.lastCard!.id}`);
});

When('card {string} is deleted', async function (this: BoardWorld, title: string) {
  const card = await findByTitle(this, title);
  await this.request('DELETE', `/api/cards/${card.id}`);
});

When('an unknown card is deleted', async function (this: BoardWorld) {
  await this.request('DELETE', '/api/cards/00000000-0000-4000-8000-000000000000');
});

Given('a Jira-sourced card titled {string} exists in storage', async function (
  this: BoardWorld,
  title: string,
) {
  // Seeded directly: slice 1 has no code path that creates a Jira-sourced
  // card, but the rule protecting them is built here and must be provable now.
  const { rows } = await this.pool.query<{ id: string }>(
    `INSERT INTO cards (source, title, priority, column_id, position)
     VALUES ('jira', $1, 'medium', 1,
             COALESCE((SELECT max(position) FROM cards WHERE column_id = 1), 0) + 1)
     RETURNING id`,
    [title],
  );
  this.seededJiraCardId = rows[0]!.id;
});

When('that Jira-sourced card is deleted', async function (this: BoardWorld) {
  await this.request('DELETE', `/api/cards/${this.seededJiraCardId}`);
});

Then('the card has title {string}', function (this: BoardWorld, title: string) {
  assert.equal(this.lastCard!.title, title);
});

Then('the card has description {string}', function (this: BoardWorld, description: string) {
  assert.equal(this.lastCard!.description, description);
});

Then('the card carries no tags', function (this: BoardWorld) {
  assert.deepEqual(this.lastCard!.tags, []);
});

Then('the stored card still has title {string}', async function (this: BoardWorld, title: string) {
  const id = this.seededJiraCardId ?? this.lastCard!.id;
  const { rows } = await this.pool.query<{ title: string }>(
    'SELECT title FROM cards WHERE id = $1',
    [id],
  );
  assert.equal(rows[0]?.title, title);
});

Then("the card's record is still in storage", async function (this: BoardWorld) {
  const { rows } = await this.pool.query<{ deleted_at: Date | null }>(
    'SELECT deleted_at FROM cards WHERE id = $1',
    [this.lastCard!.id],
  );
  assert.equal(rows.length, 1, 'a soft delete must not remove the row');
  assert.ok(rows[0]!.deleted_at, 'the row should be marked deleted');
});
