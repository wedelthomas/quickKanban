import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { BoardWorld } from './world.js';
import type { ArchivedCard, Card } from '../../../src/shared/types.js';
import { isoDaysAgo } from './slice4-helpers.js';

// --- the archive view -------------------------------------------------------

interface ArchiveResult {
  from: string;
  to: string;
  days: { date: string; cards: ArchivedCard[] }[];
  total: number;
}

let lastArchive: ArchiveResult | null = null;

const archivedCards = (): ArchivedCard[] => {
  assert.ok(lastArchive, 'the archive must have been read first');
  return lastArchive.days.flatMap((d) => d.cards);
};

/** Backdated directly: the point is a card archived N days ago, and archival
 *  itself only ever stamps `now()`. */
const archiveDaysAgo = async (
  world: BoardWorld,
  cardId: string,
  days: number,
): Promise<void> => {
  await world.pool.query(
    `UPDATE cards
        SET column_id = 6,
            archived_at = now() - make_interval(days => $2)
      WHERE id = $1`,
    [cardId, days],
  );
};

Given(
  'a card titled {string} was archived {int} days ago',
  async function (this: BoardWorld, title: string, days: number) {
    await this.request('POST', '/api/cards', { title });
    await archiveDaysAgo(this, (this.response.body as Card).id, days);
  },
);

Given(
  'a card titled {string} with tags {string} was archived {int} days ago',
  async function (this: BoardWorld, title: string, tags: string, days: number) {
    await this.request('POST', '/api/cards', {
      title,
      tags: tags.split(',').map((t) => t.trim()),
    });
    await archiveDaysAgo(this, (this.response.body as Card).id, days);
  },
);

When(
  'the archive is read from {int} days ago to today',
  async function (this: BoardWorld, days: number) {
    await this.request(
      'GET',
      `/api/archive?from=${isoDaysAgo(days)}&to=${isoDaysAgo(0)}`,
    );
    assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
    lastArchive = this.response.body as ArchiveResult;
  },
);

When(
  'the archive is read with a range that ends before it starts',
  async function (this: BoardWorld) {
    await this.request('GET', `/api/archive?from=${isoDaysAgo(0)}&to=${isoDaysAgo(7)}`);
  },
);

Then('the archive lists {string}', function (title: string) {
  const titles = archivedCards().map((c) => c.title);
  assert.ok(titles.includes(title), `expected ${title} among: ${titles.join(', ')}`);
});

Then('the archive does not list {string}', function (title: string) {
  assert.ok(
    !archivedCards()
      .map((c) => c.title)
      .includes(title),
  );
});

Then('the archive groups them under {int} dates', function (n: number) {
  assert.ok(lastArchive);
  assert.equal(lastArchive.days.length, n);
  // Days with nothing in them are absent rather than empty.
  assert.ok(lastArchive.days.every((d) => d.cards.length > 0));
});

Then(
  'the archived card {string} carries the tags {string}',
  function (title: string, tags: string) {
    const card = archivedCards().find((c) => c.title === title);
    assert.ok(card, `no archived card titled ${title}`);
    assert.deepEqual(
      [...card.tags].sort(),
      tags
        .split(',')
        .map((t) => t.trim())
        .sort(),
    );
  },
);

Then('the archived card {string} carries its completion date', function (title: string) {
  const card = archivedCards().find((c) => c.title === title);
  assert.ok(card?.archivedAt, `${title} should carry when it was archived`);
});

Then('the archived card for {string} carries its issue link', function (key: string) {
  const card = archivedCards().find((c) => c.issueKey === key);
  assert.ok(card, `no archived card for ${key}`);
  assert.match(card.issueUrl ?? '', /browse/);
});

Then('the archived card for {string} states why it left', function (key: string) {
  const card = archivedCards().find((c) => c.issueKey === key);
  assert.ok(card?.archivedReason, `${key} should say why it left the board`);
});

Then('the archive is empty and says so', function () {
  assert.ok(lastArchive);
  assert.equal(lastArchive.total, 0);
  assert.deepEqual(lastArchive.days, []);
  // A 200 rather than a 404: asking a reasonable question and getting no
  // answer is a successful request.
  assert.equal(this.response.status, 200);
});
