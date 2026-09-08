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
