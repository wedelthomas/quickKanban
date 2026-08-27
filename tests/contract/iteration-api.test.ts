import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../../src/server/app.js';
import { runMigrations } from '../../src/server/db/migrate.js';
import { FakeIterationAdapter } from '../../src/server/jira/fake-iteration-adapter.js';

/**
 * TEST-416 (BH-416), TEST-419 (BH-419), TEST-420 (BH-420), TEST-421 (BH-421).
 *
 * The guarantee under test is not really "the banner works" — it is that the
 * banner CANNOT break the board. Every arrangement of a failing source must end
 * in a 200 carrying either an honestly-labelled value or nothing at all.
 */

const CONNECTION =
  process.env.TEST_DATABASE_URL ??
  'postgres://kanban:test-only-not-a-secret@127.0.0.1:5433/kanban_test';

let app: FastifyInstance;
let pool: pg.Pool;
let source: FakeIterationAdapter;

interface Body {
  ordinalName: string | null;
  startsOn: string;
  endsOn: string;
  workingDaysRemaining: number;
  provenance: 'read' | 'cached' | 'estimated';
}

const get = async (): Promise<{ status: number; body: Body | null }> => {
  const res = await app.inject({ method: 'GET', url: '/api/iteration' });
  return { status: res.statusCode, body: res.json() as Body | null };
};

describe('GET /api/iteration', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: CONNECTION, statement_timeout: 5_000 });
    await runMigrations(pool);
    source = new FakeIterationAdapter();
    app = buildApp({ pool, logger: false, iterations: source });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM iterations');
    source = Object.assign(source, new FakeIterationAdapter());
    source.fail(null);
  });

  it('reports the configured team’s sprint, ignoring the other team on the board', async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    // The fake defaults to board 1391's real shape: two active sprints with
    // identical dates, one per team sharing it.
    expect(body?.ordinalName).toBe('CRM TradeBlazers 2026 S18');
    expect(body?.provenance).toBe('read');
    expect(body?.startsOn).toBe('2026-08-24');
    expect(body?.endsOn).toBe('2026-09-07');
  });

  it('serves the cached iteration when the source fails, and marks it', async () => {
    await get(); // warms the cache
    source.fail('connectivity');

    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body?.ordinalName).toBe('CRM TradeBlazers 2026 S18');
    expect(body?.provenance).toBe('cached');
  });

  it('estimates when there is no source and no cache, and carries no ordinal', async () => {
    source.fail('connectivity');

    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body?.provenance).toBe('estimated');
    // No number rather than a wrong one: the ordinal resets at the fiscal year.
    expect(body?.ordinalName).toBeNull();
  });

  it('never answers an error, whatever the source does', async () => {
    // FR-430. Each of these is a real failure mode of the live instance.
    for (const kind of [
      'connectivity',
      'credentials',
      'rate_limit',
      'malformed',
    ] as const) {
      source.fail(kind);
      const { status } = await get();
      expect(status, `failure kind: ${kind}`).toBe(200);
    }
  });

  it('treats an undated active sprint as no result', async () => {
    // Real: board 1391's future sprints are named but carry no dates.
    source.setUndatedSprint();
    const { body } = await get();
    expect(body?.provenance).toBe('estimated');
  });

  it('treats a board with no active sprint as no result', async () => {
    // Also real: board 5600 has zero sprints of any state.
    source.setNoActiveSprints();
    const { body } = await get();
    expect(body?.provenance).toBe('estimated');
  });

  it('leaves the board answering normally while the source is failing', async () => {
    source.fail('connectivity');
    const board = await app.inject({ method: 'GET', url: '/api/board' });
    expect(board.statusCode).toBe(200);
  });

  it('still estimates when the anchor row is missing, because the default stands in', async () => {
    // Worth stating plainly: a null body is UNREACHABLE as things stand. The
    // settings repository defaults every slice 5 key, so the fallback always
    // has an anchor and cadence to work from, and decideIteration returns null
    // only when handed no configuration at all.
    //
    // The route and the Iteration type both still allow null. That is
    // deliberate defence rather than dead weight — a future settings path that
    // can genuinely produce no anchor must degrade to an absent banner rather
    // than to an error — but no test can claim to exercise it today, and one
    // pretending to would be worse than none.
    await pool.query("DELETE FROM settings WHERE key = 'iteration.anchor_date'");
    source.fail('connectivity');

    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body?.provenance).toBe('estimated');

    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('iteration.anchor_date', '"2026-08-24"'::jsonb)
       ON CONFLICT (key) DO NOTHING`,
    );
  });
});
