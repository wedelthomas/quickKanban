import type pg from 'pg';
import type { CachedIteration } from '../../domain/iteration-provenance.js';

/**
 * The last iteration established, and the ones before it.
 *
 * Its own table rather than a settings row: the iteration is observed state
 * with provenance, not user-adjustable configuration, and slice 6's reports
 * need the sequence of them rather than only the current one.
 */
export class IterationRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * The most recently started iteration on record.
   *
   * By start date rather than by observation time: re-reading an older sprint
   * must not make it current again.
   */
  async current(): Promise<CachedIteration | null> {
    const { rows } = await this.pool.query<{
      ordinal_name: string;
      starts_on: string;
      ends_on: string;
      observed_at: Date;
    }>(
      `SELECT ordinal_name,
              to_char(starts_on, 'YYYY-MM-DD') AS starts_on,
              to_char(ends_on,   'YYYY-MM-DD') AS ends_on,
              observed_at
         FROM iterations
        WHERE source = 'read'
        ORDER BY starts_on DESC
        LIMIT 1`,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      ordinalName: row.ordinal_name,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      observedAt: row.observed_at.toISOString(),
    };
  }

  /**
   * Records what was read. Only genuinely read iterations are stored — an
   * estimate is derivable from configuration at any time, so persisting one
   * would create a second, staler source of the same guess.
   */
  async record(iteration: {
    ordinalName: string;
    startsOn: string;
    endsOn: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO iterations (ordinal_name, starts_on, ends_on, source, observed_at)
       VALUES ($1, $2, $3, 'read', now())
       ON CONFLICT (ordinal_name) DO UPDATE
         SET starts_on = EXCLUDED.starts_on,
             ends_on = EXCLUDED.ends_on,
             observed_at = now()`,
      [iteration.ordinalName, iteration.startsOn, iteration.endsOn],
    );
  }

  /** Every iteration on record, oldest first. Slice 6's reports read this. */
  async list(): Promise<CachedIteration[]> {
    const { rows } = await this.pool.query<{
      ordinal_name: string;
      starts_on: string;
      ends_on: string;
      observed_at: Date;
    }>(
      `SELECT ordinal_name,
              to_char(starts_on, 'YYYY-MM-DD') AS starts_on,
              to_char(ends_on,   'YYYY-MM-DD') AS ends_on,
              observed_at
         FROM iterations
        ORDER BY starts_on`,
    );
    return rows.map((r) => ({
      ordinalName: r.ordinal_name,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      observedAt: r.observed_at.toISOString(),
    }));
  }
}
