import type pg from 'pg';
import type { SyncFailureKind, SyncRun } from '../../shared/types.js';

interface Row {
  id: string;
  started_at: Date;
  finished_at: Date | null;
  outcome: 'succeeded' | 'failed' | null;
  failure_kind: SyncFailureKind | null;
  issues_seen: number;
  created: number;
  updated: number;
  archived: number;
  restored: number;
  conflicts_raised: number;
}

const toRun = (r: Row): SyncRun => ({
  id: Number(r.id),
  startedAt: r.started_at.toISOString(),
  finishedAt: r.finished_at?.toISOString() ?? null,
  outcome: r.outcome,
  failureKind: r.failure_kind,
  counts: {
    issuesSeen: r.issues_seen,
    created: r.created,
    updated: r.updated,
    archived: r.archived,
    restored: r.restored,
    conflictsRaised: r.conflicts_raised,
  },
});

export class SyncRunRepository {
  constructor(private readonly pool: pg.Pool) {}

  async start(): Promise<number> {
    const { rows } = await this.pool.query<{ id: string }>(
      'INSERT INTO sync_runs DEFAULT VALUES RETURNING id',
    );
    return Number(rows[0]!.id);
  }

  async succeed(id: number, counts: SyncRun['counts']): Promise<SyncRun> {
    const { rows } = await this.pool.query<Row>(
      `UPDATE sync_runs
          SET finished_at = now(), outcome = 'succeeded',
              issues_seen = $2, created = $3, updated = $4, archived = $5, restored = $6,
              conflicts_raised = $7
        WHERE id = $1 RETURNING *`,
      [
        id,
        counts.issuesSeen,
        counts.created,
        counts.updated,
        counts.archived,
        counts.restored,
        counts.conflictsRaised,
      ],
    );
    return toRun(rows[0]!);
  }

  async fail(id: number, kind: SyncFailureKind): Promise<SyncRun> {
    const { rows } = await this.pool.query<Row>(
      `UPDATE sync_runs SET finished_at = now(), outcome = 'failed', failure_kind = $2
        WHERE id = $1 RETURNING *`,
      [id, kind],
    );
    return toRun(rows[0]!);
  }

  async latest(): Promise<SyncRun | null> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1',
    );
    return rows[0] ? toRun(rows[0]) : null;
  }

  /** Retained through a later failure: FR-135 needs both facts at once. */
  async lastSuccessAt(): Promise<string | null> {
    const { rows } = await this.pool.query<{ finished_at: Date }>(
      "SELECT finished_at FROM sync_runs WHERE outcome = 'succeeded' ORDER BY id DESC LIMIT 1",
    );
    return rows[0]?.finished_at.toISOString() ?? null;
  }

  /** Clears any run left unfinished by a crash, so the in-flight index is honest. */
  async abandonUnfinished(): Promise<void> {
    await this.pool.query(
      `UPDATE sync_runs SET finished_at = now(), outcome = 'failed', failure_kind = 'connectivity'
        WHERE finished_at IS NULL`,
    );
  }
}
