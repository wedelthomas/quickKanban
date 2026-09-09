import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../../src/server/app.js';
import { runMigrations } from '../../src/server/db/migrate.js';
import type { Burndown } from '../../src/shared/types.js';

/**
 * TEST-523, TEST-535. `GET /api/iterations/:ordinalName/burndown`.
 */

const CONNECTION =
  process.env.TEST_DATABASE_URL ??
  'postgres://kanban:test-only-not-a-secret@127.0.0.1:5433/kanban_test';

let app: FastifyInstance;
let pool: pg.Pool;

const ORDINAL = '2026 S18';

describe('GET /api/iterations/:ordinalName/burndown', () => {
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
      url: '/api/iterations/never-seen/burndown',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('ITERATION_NOT_FOUND');
  });

  it('answers 200 with one point per elapsed working day', async () => {
    await pool.query(
      `INSERT INTO iterations (ordinal_name, starts_on, ends_on, source)
       VALUES ($1, '2026-08-24', '2026-08-28', 'read')`,
      [ORDINAL],
    );
    await pool.query(
      `INSERT INTO iteration_commitments (ordinal_name, committed_points, committed_at)
       VALUES ($1, 10, '2026-08-24T00:00:00')`,
      [ORDINAL],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/iterations/${encodeURIComponent(ORDINAL)}/burndown`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Burndown;
    expect(body.ordinalName).toBe(ORDINAL);
    // Mon 24 - Fri 28, five working days — the span already ended, so a
    // completed iteration's burndown covers it in full (BH-526).
    expect(body.points).toHaveLength(5);
    expect(body.points[0]).toMatchObject({ date: '2026-08-24', outstanding: 10 });
  });

  it('reports a cancelled card’s points as withdrawnThatDay (slice 7)', async () => {
    await pool.query(
      `INSERT INTO iterations (ordinal_name, starts_on, ends_on, source)
       VALUES ($1, '2026-08-24', '2026-08-28', 'read')`,
      [ORDINAL],
    );
    await pool.query(
      `INSERT INTO iteration_commitments (ordinal_name, committed_points, committed_at)
       VALUES ($1, 10, '2026-08-24T00:00:00')`,
      [ORDINAL],
    );

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO cards (source, title, priority, column_id, position, points)
       VALUES ('local', 'Withdrawn', 'medium', 1, 1, 4)
       RETURNING id`,
    );
    const cardId = rows[0]!.id;
    await pool.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, occurred_at)
       VALUES ($1, 1, 2, 'user', '2026-08-23T09:00:00')`,
      [cardId],
    );
    await pool.query(
      `UPDATE cards SET cancelled_at = '2026-08-26T14:00:00', cancellation_reason = 'test',
              archived_at = '2026-08-26T14:00:00'
        WHERE id = $1`,
      [cardId],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/iterations/${encodeURIComponent(ORDINAL)}/burndown`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Burndown;
    const wed = body.points.find((p) => p.date === '2026-08-26');
    expect(wed).toMatchObject({ withdrawnThatDay: 4, outstanding: 6 });
  });
});
