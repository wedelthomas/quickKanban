import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { BoardWorld } from './world.js';
import type { ArchivedCard, Board, Card, Summary } from '../../../src/shared/types.js';

/**
 * Steps for slice 4 — filtering, archival, the archive and summaries.
 *
 * Grows across US1 through US5 rather than being rewritten per story.
 */

const allCards = (board: Board): Card[] => board.columns.flatMap((c) => c.cards);

/** Positions as at the first time this ran, for comparing after. */
let arrangementBefore: Map<string, string> | null = null;

const arrangement = (board: Board): Map<string, string> =>
  new Map(allCards(board).map((c) => [c.id, `${c.columnId}:${c.position}`]));

/**
 * Snapshots the board BEFORE anything is attempted, so the later comparison is
 * between two separate fetches rather than a response against itself. The first
 * draft of this compared one response to a map built from that same response,
 * which passes no matter what the code does.
 */
Given("the board's arrangement is remembered", async function (this: BoardWorld) {
  await this.request('GET', '/api/board');
  arrangementBefore = arrangement(this.response.body as Board);
  assert.ok(arrangementBefore.size > 0, 'nothing to compare against');
});

When('the board is fetched with a filter parameter', async function (this: BoardWorld) {
  // Deliberately meaningless to the server. If a filter parameter is ever
  // added, this scenario fails and the requirement gets re-examined rather
  // than quietly lost.
  await this.request('GET', '/api/board?q=rotate&tag=ops&priority=high');
});

Then("the board's arrangement is unchanged", async function (this: BoardWorld) {
  assert.ok(arrangementBefore, 'the arrangement must have been remembered first');
  // A fresh read, not the response to the attempt — the question is what the
  // board looks like now, not what one request happened to return.
  await this.request('GET', '/api/board');
  const now = arrangement(this.response.body as Board);
  assert.deepEqual([...now.entries()].sort(), [...arrangementBefore.entries()].sort());
});

Then('the movement history is empty', async function (this: BoardWorld) {
  const { rows } = await this.pool.query<{ count: string }>(
    'SELECT count(*) FROM card_events',
  );
  assert.equal(rows[0]?.count, '0', 'filtering must write no history');
});

Then('the response contains every card, unfiltered', function (this: BoardWorld) {
  const cards = allCards(this.response.body as Board);
  assert.equal(cards.length, 2, 'the server must ignore filter parameters entirely');
});

// --- archival ---------------------------------------------------------------

const DONE = 6;

/** The id of a card by title, from the database rather than from the board:
 *  an archived card is no longer on the board, which is the point. */
const cardIdByTitle = async (world: BoardWorld, title: string): Promise<string> => {
  const { rows } = await world.pool.query<{ id: string }>(
    'SELECT id FROM cards WHERE title = $1 AND deleted_at IS NULL',
    [title],
  );
  assert.ok(rows[0], `no card titled ${title}`);
  return rows[0].id;
};

/**
 * Puts a card in Done and dates its arrival there.
 *
 * Written directly rather than by dragging, because the point is a card that
 * arrived N days ago and there is no way to wait N days in a test. The shape of
 * what is written is exactly what a real move writes.
 */
const placeInDoneDaysAgo = async (
  world: BoardWorld,
  cardId: string,
  days: number,
): Promise<void> => {
  await world.pool.query('UPDATE cards SET column_id = $2 WHERE id = $1', [cardId, DONE]);
  await world.pool.query(
    `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, kind, occurred_at)
     VALUES ($1, 1, $2, 'user', 'moved', now() - make_interval(days => $3))`,
    [cardId, DONE, days],
  );
};

Given(
  'a card titled {string} arrived in Done {int} days ago',
  async function (this: BoardWorld, title: string, days: number) {
    await this.request('POST', '/api/cards', { title });
    const cardId = (this.response.body as Card).id;
    await placeInDoneDaysAgo(this, cardId, days);
  },
);

Given(
  'a card titled {string} was created in Done {int} days ago',
  async function (this: BoardWorld, title: string, days: number) {
    // No arrival event at all — the case the fallback to created_at exists for.
    await this.request('POST', '/api/cards', { title });
    const cardId = (this.response.body as Card).id;
    await this.pool.query(
      `UPDATE cards SET column_id = $2, created_at = now() - make_interval(days => $3)
        WHERE id = $1`,
      [cardId, DONE, days],
    );
  },
);

Given(
  'the card titled {string} left Done and returned {int} day(s) ago',
  async function (this: BoardWorld, title: string, days: number) {
    const cardId = await cardIdByTitle(this, title);
    await this.pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, kind, occurred_at)
       VALUES ($1, $2, 2, 'user', 'moved', now() - make_interval(days => $3 + 1)),
              ($1, 2, $2, 'user', 'moved', now() - make_interval(days => $3))`,
      [cardId, DONE, days],
    );
  },
);

Given(
  'the card for issue {string} arrived in Done {int} days ago',
  async function (this: BoardWorld, key: string, days: number) {
    const { rows } = await this.pool.query<{ card_id: string }>(
      'SELECT card_id FROM jira_links WHERE issue_key = $1',
      [key],
    );
    assert.ok(rows[0], `no card for ${key}`);
    await placeInDoneDaysAgo(this, rows[0].card_id, days);
  },
);

Given(
  'the card for issue {string} has an unresolved conflict',
  async function (this: BoardWorld, key: string) {
    await this.pool.query(
      `INSERT INTO conflicts (card_id, board_column_id, jira_status_at_detection, jira_status_current)
       SELECT card_id, $2, 'Development', 'Development'
         FROM jira_links WHERE issue_key = $1`,
      [key, DONE],
    );
  },
);

When(
  'the archive window is set to {int} days',
  async function (this: BoardWorld, days: number) {
    await this.request('PUT', '/api/settings', { archiveWindowDays: days });
    assert.equal(this.response.status, 200);
  },
);

/**
 * Held rather than read back off `this.response`, because the assertions about
 * a run are interleaved with board reads that overwrite it. The first draft
 * asserted against whatever the last request happened to return.
 */
let lastRun: { archived: number; skippedConflicted: number; considered: number } | null =
  null;

When('archival runs', async function (this: BoardWorld) {
  await this.request('POST', '/api/archive/run');
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
  lastRun = (this.response.body as { run: typeof lastRun }).run;
});

Then(
  'the card titled {string} is archived',
  async function (this: BoardWorld, title: string) {
    const { rows } = await this.pool.query<{ archived_at: Date | null }>(
      'SELECT archived_at FROM cards WHERE title = $1',
      [title],
    );
    assert.ok(rows[0]?.archived_at, `${title} should have been archived`);

    await this.request('GET', '/api/board');
    const titles = allCards(this.response.body as Board).map((c) => c.title);
    assert.ok(!titles.includes(title), `${title} should have left the board`);
  },
);

Then(
  'the card titled {string} is on the board',
  async function (this: BoardWorld, title: string) {
    await this.request('GET', '/api/board');
    const titles = allCards(this.response.body as Board).map((c) => c.title);
    assert.ok(titles.includes(title), `${title} should still be on the board`);
  },
);

Then(
  'the card for issue {string} is on the board',
  async function (this: BoardWorld, key: string) {
    await this.request('GET', '/api/board');
    const keys = allCards(this.response.body as Board).map((c) => c.issueKey);
    assert.ok(keys.includes(key), `${key} should still be on the board`);
  },
);

Then(
  'the card titled {string} still exists in storage',
  async function (this: BoardWorld, title: string) {
    // FR-316: archived is not deleted. The row is the whole assertion.
    const { rows } = await this.pool.query('SELECT 1 FROM cards WHERE title = $1', [
      title,
    ]);
    assert.equal(rows.length, 1, `${title} must not have been deleted`);
  },
);

Then('the run archived {int} card(s)', function (n: number) {
  assert.ok(lastRun, 'archival must have run first');
  assert.equal(lastRun.archived, n);
});

Then('the run skipped {int} conflicted card(s)', function (n: number) {
  assert.ok(lastRun, 'archival must have run first');
  assert.equal(lastRun.skippedConflicted, n);
});

Then(
  'the last history record for {string} is an archival by the system',
  async function (this: BoardWorld, title: string) {
    const cardId = await cardIdByTitle(this, title);
    const { rows } = await this.pool.query<{ actor: string; kind: string }>(
      'SELECT actor, kind FROM card_events WHERE card_id = $1 ORDER BY id DESC LIMIT 1',
      [cardId],
    );
    assert.equal(rows[0]?.kind, 'archived');
    assert.equal(rows[0]?.actor, 'system');
  },
);

// --- summaries --------------------------------------------------------------

const COLUMN_IDS: Record<string, number> = {
  backlog: 1,
  in_progress: 2,
  blocked: 3,
  test: 4,
  po_review: 5,
  done: 6,
};

let lastSummary: Summary | null = null;
let historyBefore: string | null = null;

Given(
  'the card titled {string} is moved to the {string} column',
  async function (this: BoardWorld, title: string, key: string) {
    const cardId = await cardIdByTitle(this, title);
    await this.request('POST', `/api/cards/${cardId}/move`, {
      toColumnId: COLUMN_IDS[key],
      toIndex: 1,
    });
    assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
  },
);

Given(
  'the card titled {string} moved to {string} {int} days ago',
  async function (this: BoardWorld, title: string, key: string, days: number) {
    // Backdated directly: the point is a movement N days old, and there is no
    // way to wait N days in a test. The row written is the shape a real move
    // writes.
    const cardId = await cardIdByTitle(this, title);
    await this.pool.query('UPDATE cards SET column_id = $2 WHERE id = $1', [
      cardId,
      COLUMN_IDS[key],
    ]);
    await this.pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, kind, occurred_at)
       VALUES ($1, 1, $2, 'user', 'moved', now() - make_interval(days => $3))`,
      [cardId, COLUMN_IDS[key], days],
    );
  },
);

Given(
  'the card titled {string} is deleted',
  async function (this: BoardWorld, title: string) {
    const cardId = await cardIdByTitle(this, title);
    await this.request('DELETE', `/api/cards/${cardId}`);
  },
);

Given('the history is remembered', async function (this: BoardWorld) {
  const { rows } = await this.pool.query(
    'SELECT id, card_id, from_column_id, to_column_id, actor, kind FROM card_events ORDER BY id',
  );
  historyBefore = JSON.stringify(rows);
  assert.ok(rows.length > 0, 'nothing to compare against');
});

When(
  'a {string} summary is generated',
  async function (this: BoardWorld, period: string) {
    await this.request('GET', `/api/summary?period=${period}`);
    assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
    lastSummary = this.response.body as Summary;
  },
);

When('{int} summaries are generated', async function (this: BoardWorld, n: number) {
  for (let i = 0; i < n; i += 1) {
    await this.request('GET', '/api/summary?period=weekly');
    assert.equal(this.response.status, 200);
  }
});

Then('the summary lists {string} as moved', function (title: string) {
  assert.ok(lastSummary, 'a summary must have been generated');
  const titles = lastSummary.moved.map((m) => m.title);
  assert.ok(
    titles.includes(title),
    `expected ${title} among moved: ${titles.join(', ')}`,
  );
});

Then('the summary does not list {string} as moved', function (title: string) {
  assert.ok(lastSummary, 'a summary must have been generated');
  assert.ok(!lastSummary.moved.map((m) => m.title).includes(title));
});

Then('the summary lists {string} as in progress', function (title: string) {
  assert.ok(lastSummary, 'a summary must have been generated');
  assert.ok(lastSummary.inProgress.map((c) => c.title).includes(title));
});

Then('the summary lists {string} as blocked', function (title: string) {
  assert.ok(lastSummary, 'a summary must have been generated');
  assert.ok(lastSummary.blocked.map((c) => c.title).includes(title));
});

Then(
  'the summary marks the movement of {string} as coming from Jira',
  function (issueKey: string) {
    assert.ok(lastSummary, 'a summary must have been generated');
    const entry = lastSummary.moved.find((m) => m.issueKey === issueKey);
    assert.ok(entry, `no movement for ${issueKey}`);
    assert.equal(entry.actor, 'sync');
    // And in the text, which is what gets pasted — a marker that existed only
    // in the structure would be lost at the moment it mattered.
    assert.match(lastSummary.text, /\(in Jira\)/);
  },
);

Then('the history is unchanged', async function (this: BoardWorld) {
  assert.ok(historyBefore, 'the history must have been remembered first');
  const { rows } = await this.pool.query(
    'SELECT id, card_id, from_column_id, to_column_id, actor, kind FROM card_events ORDER BY id',
  );
  assert.equal(
    JSON.stringify(rows),
    historyBefore,
    'generating a summary must write nothing',
  );
});

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

const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  // Local calendar date, matching what the endpoint parses.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

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
