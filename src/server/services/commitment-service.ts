import type pg from 'pg';
import type { CommitmentRepository } from '../repositories/commitment-repository.js';

/**
 * The columns that count as "committed to this iteration" (FR-525). Matches
 * the set the spec names: Iteration Items, In Progress, Test, PO Review —
 * everything short of Backlog (not yet committed) and Done (already
 * finished, counted separately as completion).
 */
const WORKING_COLUMN_KEYS = ['iteration_items', 'in_progress', 'test', 'po_review'];

/**
 * Snapshots an iteration's commitment the first time it is observed.
 *
 * Mirrors CarryOverService exactly: same trigger (called from
 * IterationService.current() whenever an iteration resolves), same
 * boundary-detection shape (nothing to do for an estimated iteration, which
 * has no name to key the commitment by), same failure-swallowing contract at
 * the call site — a failed commitment write must not cost the user their
 * banner.
 */
export class CommitmentService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly commitments: CommitmentRepository,
  ) {}

  async observe(currentIteration: string | null): Promise<void> {
    // Same reasoning as CarryOverService: an estimated iteration has no name,
    // so there is nothing to snapshot against.
    if (currentIteration === null) return;

    // Cheap to check first — recordIfAbsent is already idempotent via
    // ON CONFLICT DO NOTHING, but skipping the points query entirely on every
    // read after the first is what keeps this call free on the common path.
    const existing = await this.commitments.find(currentIteration);
    if (existing) return;

    const { rows } = await this.pool.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(c.points), 0) AS total
         FROM cards c JOIN columns col ON col.id = c.column_id
        WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
          AND col.key = ANY($1)`,
      [WORKING_COLUMN_KEYS],
    );
    const committedPoints = Number(rows[0]?.total ?? 0);

    await this.commitments.recordIfAbsent(currentIteration, committedPoints);
  }
}
