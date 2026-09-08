import type pg from 'pg';
import type { IterationCommitment } from '../../shared/types.js';

/**
 * The commitment snapshot: one immutable row per iteration, written once
 * at first observation (FR-525, FR-526) and never updated afterward — the
 * same write-once shape `iterations` itself already uses.
 */
export class CommitmentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async find(ordinalName: string): Promise<IterationCommitment | null> {
    const { rows } = await this.pool.query<{
      ordinal_name: string;
      committed_points: number;
      committed_at: Date;
    }>('SELECT * FROM iteration_commitments WHERE ordinal_name = $1', [ordinalName]);
    const row = rows[0];
    if (!row) return null;
    return {
      ordinalName: row.ordinal_name,
      committedPoints: row.committed_points,
      committedAt: row.committed_at.toISOString(),
    };
  }

  /**
   * `ON CONFLICT DO NOTHING` is the immutability guarantee: a second call for
   * an ordinal already recorded changes nothing, which is what lets the
   * caller observe unconditionally on every iteration read rather than first
   * checking whether it already ran.
   */
  async recordIfAbsent(ordinalName: string, committedPoints: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO iteration_commitments (ordinal_name, committed_points)
       VALUES ($1, $2)
       ON CONFLICT (ordinal_name) DO NOTHING`,
      [ordinalName, committedPoints],
    );
  }
}
