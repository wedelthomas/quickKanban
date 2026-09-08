import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../../src/server/app.js';
import { runMigrations } from '../../src/server/db/migrate.js';

/**
 * The write-path half of FR-402.
 *
 * The migration empties the Blocked column; this stops anything refilling it.
 * Both matter: verified against the running board before this test existed, a
 * move into the retired column answered 200 and the card vanished, because the
 * board query filters retired columns while the move path did not know they
 * existed.
 *
 * The same probe found the mirror defect — Iteration Items could not be reached
 * at all, because the move schema pinned toColumnId to 1..6 and Iteration Items
 * is id 7. That is the failure the developer hit dragging a card.
 *
 * TEST-401 (BH-401), and the precondition for TEST-409 (BH-409).
 */

const CONNECTION =
  process.env.TEST_DATABASE_URL ??
  'postgres://kanban:test-only-not-a-secret@127.0.0.1:5433/kanban_test';

let app: FastifyInstance;
let pool: pg.Pool;

const columnIdFor = async (key: string): Promise<number> => {
  const { rows } = await pool.query<{ id: number }>(
    'SELECT id FROM columns WHERE key = $1',
    [key],
  );
  return rows[0]!.id;
};

const createCard = async (title: string): Promise<string> => {
  const res = await app.inject({ method: 'POST', url: '/api/cards', payload: { title } });
  return (res.json() as { id: string }).id;
};

const move = async (id: string, toColumnId: number) =>
  app.inject({
    method: 'POST',
    url: `/api/cards/${id}/move`,
    payload: { toColumnId, toIndex: 1 },
  });

describe('moving a card against the restructured column set', () => {
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

  it('accepts a move into Iteration Items', async () => {
    const iterationItems = await columnIdFor('iteration_items');
    const card = await createCard('committed to this iteration');

    const res = await move(card, iterationItems);

    expect(res.statusCode).toBe(200);
    expect((res.json() as { card: { columnId: number } }).card.columnId).toBe(
      iterationItems,
    );
  });

  it('refuses a move into the retired Blocked column', async () => {
    const blocked = await columnIdFor('blocked');
    const card = await createCard('must not be able to reach Blocked');

    const res = await move(card, blocked);

    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe('COLUMN_RETIRED');

    // The point of the refusal: a card that reached a retired column would be
    // absent from the board, because the board query excludes them.
    const { rows } = await pool.query<{ column_id: number }>(
      'SELECT column_id FROM cards WHERE id = $1',
      [card],
    );
    expect(rows[0]!.column_id).not.toBe(blocked);
  });

  it('refuses a move into a column that does not exist', async () => {
    const card = await createCard('nowhere to go');
    const res = await move(card, 99);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('leaves no retired column in the board payload', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/board' });
    const body = res.json() as { columns: { key: string }[] };
    expect(body.columns.map((c) => c.key)).toEqual([
      'backlog',
      'iteration_items',
      'in_progress',
      'test',
      'po_review',
      'done',
    ]);
  });
});
