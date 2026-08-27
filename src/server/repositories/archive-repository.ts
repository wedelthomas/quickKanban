import type pg from 'pg';
import type { EventRepository } from './event-repository.js';

export const DONE_COLUMN_ID = 6;

export interface ArchivalCandidate {
  cardId: string;
  arrivedInDoneAt: Date | null;
  createdAt: Date;
  conflicted: boolean;
}

/**
 * Reads and writes for the archive.
 *
 * The candidate query answers two questions in one row — how long has this card
 * been in Done, and is a conflict open on it — so the decision to skip is
 * visible beside the decision to archive rather than made somewhere else.
 */
export class ArchiveRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly events: EventRepository,
  ) {}

  async candidates(): Promise<ArchivalCandidate[]> {
    const { rows } = await this.pool.query<{
      id: string;
      created_at: Date;
      arrived_in_done_at: Date | null;
      conflicted: boolean;
    }>(
      `SELECT c.id,
              c.created_at,
              (SELECT max(e.occurred_at)
                 FROM card_events e
                WHERE e.card_id = c.id
                  AND e.to_column_id = $1
                  AND e.kind = 'moved')          AS arrived_in_done_at,
              EXISTS (SELECT 1 FROM conflicts f
                       WHERE f.card_id = c.id AND f.resolved_at IS NULL) AS conflicted
         FROM cards c
        WHERE c.column_id = $1
          AND c.archived_at IS NULL
          AND c.deleted_at IS NULL`,
      [DONE_COLUMN_ID],
    );
    return rows.map((r) => ({
      cardId: r.id,
      arrivedInDoneAt: r.arrived_in_done_at,
      createdAt: r.created_at,
      conflicted: r.conflicted,
    }));
  }

  /**
   * Archives one card, in its own transaction.
   *
   * Per card rather than per pass on purpose: batching means one card that
   * cannot be archived blocks every other card's archival, and a pass that dies
   * halfway should leave the cards it already handled handled.
   *
   * Re-checks eligibility under `FOR UPDATE` because the user may have dragged
   * the card out of Done since it was selected. Either the move lands first and
   * this finds nothing, or this lands first and the move waits.
   *
   * Returns whether it actually archived — a `false` is a race that resolved
   * the other way, not an error.
   */
  async archive(cardId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ column_id: number }>(
        `SELECT column_id FROM cards
          WHERE id = $1 AND archived_at IS NULL AND deleted_at IS NULL
          FOR UPDATE`,
        [cardId],
      );
      const columnId = rows[0]?.column_id;
      if (columnId !== DONE_COLUMN_ID) {
        await client.query('ROLLBACK');
        return false;
      }

      await this.events.appendArchival(client, { cardId, columnId });
      await client.query(
        `UPDATE cards SET archived_at = now(), updated_at = now() WHERE id = $1`,
        [cardId],
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
