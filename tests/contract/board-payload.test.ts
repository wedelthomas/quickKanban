import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../../src/server/app.js';
import { runMigrations } from '../../src/server/db/migrate.js';

/**
 * The card payload, from every path that produces one.
 *
 * Two queries feed the same `toCard`: the board's, and `findById`'s, which
 * serves create/update/move. They are separate SELECTs, so a field added to one
 * is silently absent from the other — verified the hard way, when PATCH
 * {blocked:true} wrote `true` to the database and answered `blocked: false`.
 * Asserting the shape from both paths is what makes that drift visible.
 *
 * TEST-406 (BH-406).
 */

const CONNECTION =
  process.env.TEST_DATABASE_URL ??
  'postgres://kanban:test-only-not-a-secret@127.0.0.1:5433/kanban_test';

let app: FastifyInstance;
let pool: pg.Pool;

const NEW_FIELDS = [
  'blocked',
  'blockedDivergesFromJira',
  'carriedIterations',
  'cancellationDivergesFromJira',
] as const;

describe('the card payload carries slice 5 fields from every path', () => {
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
  });

  const create = async (title: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { title },
    });
    return res.json() as Record<string, unknown> & { id: string };
  };

  it('includes them on a freshly created card', async () => {
    const card = await create('new card');
    for (const field of NEW_FIELDS) expect(card).toHaveProperty(field);
    expect(card.blocked).toBe(false);
    expect(card.carriedIterations).toBe(0);
  });

  it('reflects a blocked update in the response, not only in the database', async () => {
    const card = await create('about to be blocked');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/cards/${card.id}`,
      payload: { blocked: true },
    });

    expect((res.json() as { blocked: boolean }).blocked).toBe(true);

    const { rows } = await pool.query<{ blocked: boolean }>(
      'SELECT blocked FROM cards WHERE id = $1',
      [card.id],
    );
    expect(rows[0]!.blocked).toBe(true);
  });

  it('keeps a card blocked across a move, and lets it move at all', async () => {
    const card = await create('blocked but mobile');
    await app.inject({
      method: 'PATCH',
      url: `/api/cards/${card.id}`,
      payload: { blocked: true },
    });

    const { rows } = await pool.query<{ id: number }>(
      "SELECT id FROM columns WHERE key = 'in_progress'",
    );
    const res = await app.inject({
      method: 'POST',
      url: `/api/cards/${card.id}/move`,
      payload: { toColumnId: rows[0]!.id, toIndex: 1 },
    });

    // FR-414: blocked annotates, it does not freeze.
    expect(res.statusCode).toBe(200);
    const body = res.json() as { card: { blocked: boolean; columnId: number } };
    expect(body.card.blocked).toBe(true);
    expect(body.card.columnId).toBe(rows[0]!.id);
  });

  it('reports blocked on a Jira-sourced card too', async () => {
    // FR-412: settable on any card. The jira-owned guard names only fields
    // Jira is authoritative for, and blocked is not one of them.
    const card = await create('stands in for a Jira card');
    await pool.query("UPDATE cards SET source = 'jira' WHERE id = $1", [card.id]);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/cards/${card.id}`,
      payload: { blocked: true },
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as { blocked: boolean }).blocked).toBe(true);
  });
});
