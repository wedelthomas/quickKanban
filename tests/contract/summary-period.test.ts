import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../../src/server/app.js';
import { runMigrations } from '../../src/server/db/migrate.js';

/**
 * TEST-540 (BH-529, BH-530). `GET /api/summary?period=iteration`.
 */

const CONNECTION =
  process.env.TEST_DATABASE_URL ??
  'postgres://kanban:test-only-not-a-secret@127.0.0.1:5433/kanban_test';

let app: FastifyInstance;
let pool: pg.Pool;

describe('GET /api/summary?period=iteration', () => {
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
    await pool.query('DELETE FROM iterations');
  });

  it('404s ITERATION_NOT_FOUND when no iteration can currently be established', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/summary?period=iteration' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('ITERATION_NOT_FOUND');
  });

  it('bounds the summary by the iteration’s own dates', async () => {
    await pool.query(
      `INSERT INTO iterations (ordinal_name, starts_on, ends_on, source)
       VALUES ('2026 S18', '2026-08-24', '2026-09-07', 'read')`,
    );

    const res = await app.inject({ method: 'GET', url: '/api/summary?period=iteration' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { period: string; from: string; to: string };
    expect(body.period).toBe('iteration');
    expect(body.from).toBe('2026-08-24');
    expect(body.to).toBe('2026-09-07');
  });
});
