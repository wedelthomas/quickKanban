import type pg from 'pg';

export interface ArchiveRun {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  outcome: 'succeeded' | 'failed' | null;
  considered: number;
  archived: number;
  skippedConflicted: number;
}

interface Row {
  id: string;
  started_at: Date;
  finished_at: Date | null;
  outcome: 'succeeded' | 'failed' | null;
  considered: number;
  archived: number;
  skipped_conflicted: number;
}

const toRun = (r: Row): ArchiveRun => ({
  id: Number(r.id),
  startedAt: r.started_at.toISOString(),
  finishedAt: r.finished_at?.toISOString() ?? null,
  outcome: r.outcome,
  considered: r.considered,
  archived: r.archived,
  skippedConflicted: r.skipped_conflicted,
});

/**
 * What each archival pass did.
 *
 * This is the first process here that changes the board with nobody watching.
 * Slice 3's live check found an unrequested Jira write only because a log
 * existed to find it in; an unattended process with no durable record is where
 * the next such defect hides.
 */
export class ArchiveRunRepository {
  constructor(private readonly pool: pg.Pool) {}

  async start(): Promise<number> {
    const { rows } = await this.pool.query<{ id: string }>(
      'INSERT INTO archive_runs DEFAULT VALUES RETURNING id',
    );
    return Number(rows[0]!.id);
  }

  async succeed(
    id: number,
    counts: { considered: number; archived: number; skippedConflicted: number },
  ): Promise<ArchiveRun> {
    const { rows } = await this.pool.query<Row>(
      `UPDATE archive_runs
          SET finished_at = now(), outcome = 'succeeded',
              considered = $2, archived = $3, skipped_conflicted = $4
        WHERE id = $1 RETURNING *`,
      [id, counts.considered, counts.archived, counts.skippedConflicted],
    );
    return toRun(rows[0]!);
  }

  async fail(id: number): Promise<ArchiveRun> {
    const { rows } = await this.pool.query<Row>(
      `UPDATE archive_runs SET finished_at = now(), outcome = 'failed'
        WHERE id = $1 RETURNING *`,
      [id],
    );
    return toRun(rows[0]!);
  }

  /**
   * Closes any pass left unfinished by a crash or a shutdown.
   *
   * The single-flight index is the right guarantee while a pass is running and
   * a trap once one dies: `finished_at` stays null, and every later `start()`
   * then violates the index. Archival would stop for good, and the only symptom
   * would be a 500 on an endpoint nobody is watching.
   *
   * Marked failed rather than deleted — a pass that died is something an
   * operator may want to see, and recording what happened is what this table
   * is for. Called once at startup, beside the sync's equivalent.
   */
  async abandonUnfinished(): Promise<void> {
    await this.pool.query(
      `UPDATE archive_runs SET finished_at = now(), outcome = 'failed'
        WHERE finished_at IS NULL`,
    );
  }

  async latest(): Promise<ArchiveRun | null> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM archive_runs ORDER BY started_at DESC LIMIT 1',
    );
    return rows[0] ? toRun(rows[0]) : null;
  }
}
