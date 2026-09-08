import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { runMigrations } from '../../src/server/db/migrate.js';
import { CommitmentRepository } from '../../src/server/repositories/commitment-repository.js';
import { CommitmentService } from '../../src/server/services/commitment-service.js';

/**
 * TEST-519 (BH-519): commitment is snapshotted once at iteration start and
 * does not move as cards are added to or removed from the working columns
 * afterward.
 */

const CONNECTION =
  process.env.TEST_DATABASE_URL ??
  'postgres://kanban:test-only-not-a-secret@127.0.0.1:5433/kanban_test';

const ORDINAL = '2026 S18';

describe('commitment snapshot', () => {
  let pool: pg.Pool;
  let service: CommitmentService;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: CONNECTION, statement_timeout: 5_000 });
    await runMigrations(pool);
    service = new CommitmentService(pool, new CommitmentRepository(pool));
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM cards');
    await pool.query('DELETE FROM iteration_commitments');
    await pool.query('DELETE FROM iterations');
    await pool.query(
      `INSERT INTO iterations (ordinal_name, starts_on, ends_on, source)
       VALUES ($1, '2026-08-24', '2026-09-07', 'read')`,
      [ORDINAL],
    );
  });

  const createWorkingCard = async (points: number, columnId = 2): Promise<void> => {
    await pool.query(
      `INSERT INTO cards (source, title, priority, column_id, position, points)
       VALUES ('local', 'work', 'medium', $1, 1, $2)`,
      [columnId, points],
    );
  };

  it('snapshots once and holds even as cards are added or removed (BH-519)', async () => {
    await createWorkingCard(5);
    await service.observe(ORDINAL);

    const first = await new CommitmentRepository(pool).find(ORDINAL);
    expect(first?.committedPoints).toBe(5);

    // Scope changes after the snapshot must not move it.
    await createWorkingCard(8);
    await pool.query(`DELETE FROM cards WHERE points = 5`);
    await service.observe(ORDINAL);

    const second = await new CommitmentRepository(pool).find(ORDINAL);
    expect(second?.committedPoints).toBe(5);
  });

  it('does nothing for an estimated iteration with no ordinal to key by', async () => {
    await createWorkingCard(5);
    await service.observe(null);
    const commitment = await new CommitmentRepository(pool).find(ORDINAL);
    expect(commitment).toBeNull();
  });
});
