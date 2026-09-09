import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../../src/server/app.js';
import { runMigrations } from '../../src/server/db/migrate.js';
import type { IterationReport } from '../../src/shared/types.js';

/**
 * TEST-511, TEST-527, TEST-531. `GET /api/iterations/:ordinalName/report`.
 */

const CONNECTION =
  process.env.TEST_DATABASE_URL ??
  'postgres://kanban:test-only-not-a-secret@127.0.0.1:5433/kanban_test';

let app: FastifyInstance;
let pool: pg.Pool;

const ORDINAL = '2026 S18';

const seedIteration = async (startsOn: string, endsOn: string): Promise<void> => {
  await pool.query(
    `INSERT INTO iterations (ordinal_name, starts_on, ends_on, source)
     VALUES ($1, $2, $3, 'read')`,
    [ORDINAL, startsOn, endsOn],
  );
};

const createCard = async (title: string): Promise<string> => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/cards',
    payload: { title },
  });
  return (res.json() as { id: string }).id;
};

const move = async (cardId: string, toColumnId: number): Promise<void> => {
  await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/move`,
    payload: { toColumnId, toIndex: 1 },
  });
};

const seedCommitment = async (points: number, committedAt: string): Promise<void> => {
  await pool.query(
    `INSERT INTO iteration_commitments (ordinal_name, committed_points, committed_at)
     VALUES ($1, $2, $3)`,
    [ORDINAL, points, committedAt],
  );
};

const cancel = async (cardId: string, reason: string): Promise<void> => {
  await app.inject({
    method: 'POST',
    url: `/api/cards/${cardId}/cancel`,
    payload: { reason },
  });
};

describe('GET /api/iterations/:ordinalName/report', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: CONNECTION, statement_timeout: 5_000 });
    await runMigrations(pool);
    app = buildApp({ pool, logger: false });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM card_events');
    await pool.query('DELETE FROM card_blocked_events');
    await pool.query('DELETE FROM cards');
    await pool.query('DELETE FROM iteration_commitments');
    await pool.query('DELETE FROM iterations');
  });

  it('404s ITERATION_NOT_FOUND for an unobserved ordinal', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/iterations/never-seen/report',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('ITERATION_NOT_FOUND');
  });

  it('reports time broken down both by card and by project, local grouped as its own project (BH-527)', async () => {
    // The iteration spans a real ten-day window ending today, so it always
    // covers "now" regardless of when this test runs. The movement is seeded
    // three days back rather than made through a live move — deterministic
    // elapsed time (several working days precede "now" whatever the current
    // wall-clock happens to be) beats depending on this instant landing
    // inside working hours.
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 10);
    const iso = (d: Date): string => d.toISOString().slice(0, 10);
    await seedIteration(iso(start), iso(today));
    const cardId = await createCard('Migrate the gateway');

    const enteredAt = new Date(today);
    enteredAt.setDate(enteredAt.getDate() - 3);
    await pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, occurred_at)
       VALUES ($1, 1, 2, 'user', $2)`,
      [cardId, enteredAt],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/iterations/${encodeURIComponent(ORDINAL)}/report`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as IterationReport;
    expect(body.time.byCard.some((c) => c.cardId === cardId)).toBe(true);
    expect(body.time.byProject.some((p) => p.project === 'local')).toBe(true);
  });

  it('withholds points when no card in the iteration carries any (FR-523)', async () => {
    await seedIteration('2026-08-24', '2026-09-07');
    const res = await app.inject({
      method: 'GET',
      url: `/api/iterations/${encodeURIComponent(ORDINAL)}/report`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as IterationReport;
    expect(body.points).toMatchObject({ withheld: true });
  });

  it('states local and Jira shares of points and excludes unpointed cards from the figure (BH-528, BH-516)', async () => {
    await seedIteration('2026-08-24', '2026-09-07');

    const localCardId = await createCard('Local, pointed and done');
    await app.inject({
      method: 'PATCH',
      url: `/api/cards/${localCardId}`,
      payload: { points: 5 },
    });
    await pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, occurred_at)
       VALUES ($1, 1, 6, 'user', '2026-08-26T10:00:00')`,
      [localCardId],
    );

    const { rows: jiraRows } = await pool.query<{ id: string }>(
      `INSERT INTO cards (source, title, priority, column_id, position, points, jira_points)
       VALUES ('jira', 'Jira, pointed and done', 'medium', 1, 1, 3, 3)
       RETURNING id`,
    );
    const jiraCardId = jiraRows[0]!.id;
    await pool.query(
      `INSERT INTO jira_links (card_id, issue_key, issue_id, url, status_name, status_id, jira_updated_at)
       VALUES ($1, 'AIHUB-9', '1', 'https://example.atlassian.net/browse/AIHUB-9', 'Done', '10001', now())`,
      [jiraCardId],
    );
    await pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, occurred_at)
       VALUES ($1, 1, 6, 'user', '2026-08-27T10:00:00')`,
      [jiraCardId],
    );

    const unpointedId = await createCard('Done but never pointed');
    await pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, occurred_at)
       VALUES ($1, 1, 6, 'user', '2026-08-28T10:00:00')`,
      [unpointedId],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/iterations/${encodeURIComponent(ORDINAL)}/report`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as IterationReport;
    expect(body.points).toMatchObject({
      completed: 8,
      localShare: 0.625,
      jiraShare: 0.375,
      excludedUnpointed: 1,
    });
  });

  it('reports commitment, completion and scope added as three distinct figures for a mid-iteration addition (BH-520, BH-522)', async () => {
    await seedIteration('2026-08-24', '2026-09-07');
    await seedCommitment(10, '2026-08-24T00:00:00');

    const doneCardId = await createCard('Finished this iteration');
    await app.inject({
      method: 'PATCH',
      url: `/api/cards/${doneCardId}`,
      payload: { points: 5 },
    });
    await pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, occurred_at)
       VALUES ($1, 1, 6, 'user', '2026-08-25T10:00:00')`,
      [doneCardId],
    );

    const addedCardId = await createCard('Added mid-iteration');
    await app.inject({
      method: 'PATCH',
      url: `/api/cards/${addedCardId}`,
      payload: { points: 3 },
    });
    await pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, occurred_at)
       VALUES ($1, 1, 2, 'user', '2026-08-26T10:00:00')`,
      [addedCardId],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/iterations/${encodeURIComponent(ORDINAL)}/report`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as IterationReport;
    expect(body.points).toMatchObject({ committed: 10, completed: 5, scopeAdded: 3 });
  });

  it('still counts an archived card’s time toward its iteration (BH-511, FR-514)', async () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 10);
    const iso = (d: Date): string => d.toISOString().slice(0, 10);
    await seedIteration(iso(start), iso(today));

    const cardId = await createCard('Shipped and later archived');
    const enteredAt = new Date(today);
    enteredAt.setDate(enteredAt.getDate() - 3);
    await pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, occurred_at)
       VALUES ($1, 1, 2, 'user', $2)`,
      [cardId, enteredAt],
    );
    await pool.query(
      `UPDATE cards SET archived_at = now(), archived_reason = 'test' WHERE id = $1`,
      [cardId],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/iterations/${encodeURIComponent(ORDINAL)}/report`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as IterationReport;
    expect(body.time.byCard.some((c) => c.cardId === cardId && c.seconds > 0)).toBe(true);
  });

  it('reports a cancelled card’s points as withdrawn scope (BH-616, BH-617, slice 7)', async () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 10);
    // LOCAL calendar date, not UTC — burndown.ts buckets by local day
    // (atLocalMidnight), and a host west of Greenwich sees a different
    // date in each if this used toISOString() the way the other fixtures
    // in this file do (harmless there, since they never check exact day
    // attribution the way this test does).
    const iso = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await seedIteration(iso(start), iso(today));

    const committedAt = new Date(today);
    committedAt.setDate(committedAt.getDate() - 9);
    await seedCommitment(10, committedAt.toISOString());

    const cardId = await createCard('Withdrawn work');
    await app.inject({
      method: 'PATCH',
      url: `/api/cards/${cardId}`,
      payload: { points: 5 },
    });
    // Entered the working column before the commitment was taken.
    const enteredAt = new Date(today);
    enteredAt.setDate(enteredAt.getDate() - 9);
    enteredAt.setHours(enteredAt.getHours() - 1);
    await pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, occurred_at)
       VALUES ($1, 1, 2, 'user', $2)`,
      [cardId, enteredAt],
    );

    await cancel(cardId, 'No longer needed');

    const res = await app.inject({
      method: 'GET',
      url: `/api/iterations/${encodeURIComponent(ORDINAL)}/report`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as IterationReport;
    expect(body.points).toMatchObject({ committed: 10, completed: 0, withdrawn: 5 });

    const burndownRes = await app.inject({
      method: 'GET',
      url: `/api/iterations/${encodeURIComponent(ORDINAL)}/burndown`,
    });
    expect(burndownRes.statusCode).toBe(200);
    const burndown = burndownRes.json() as { points: { withdrawnThatDay: number }[] };
    const totalWithdrawn = burndown.points.reduce((sum, p) => sum + p.withdrawnThatDay, 0);
    expect(totalWithdrawn).toBe(5);
  });

  it('marks a period predating recorded history as incomplete (BH-531, FR-542)', async () => {
    await seedIteration('2020-01-01', '2020-01-14');
    const cardId = await createCard('Old work');
    await move(cardId, 2);

    const res = await app.inject({
      method: 'GET',
      url: `/api/iterations/${encodeURIComponent(ORDINAL)}/report`,
    });
    const body = res.json() as IterationReport;
    expect(body.incomplete).toBe(true);
    void cardId;
  });
});
