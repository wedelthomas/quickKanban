import type pg from 'pg';
import type { ConflictResolution } from '../../shared/types.js';

/**
 * Open disagreements between the board and Jira.
 *
 * At most one open conflict per card, enforced by a partial unique index
 * rather than by every caller remembering to check.
 */
export class ConflictRepository {
  constructor(private readonly pool: pg.Pool) {}

  async hasOpen(cardId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'SELECT 1 FROM conflicts WHERE card_id = $1 AND resolved_at IS NULL',
      [cardId],
    );
    return rows.length > 0;
  }

  /**
   * Raises a conflict, or updates the open one if Jira has moved again
   * (FR-234). Never a second row: the index would refuse it anyway, and
   * updating is what the resolution screen needs to stay truthful.
   */
  async raiseOrUpdate(
    client: pg.PoolClient,
    input: { cardId: string; boardColumnId: number; jiraStatus: string },
  ): Promise<void> {
    await client.query(
      `INSERT INTO conflicts (card_id, board_column_id, jira_status_at_detection, jira_status_current)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (card_id) WHERE resolved_at IS NULL
       DO UPDATE SET jira_status_current = EXCLUDED.jira_status_current`,
      [input.cardId, input.boardColumnId, input.jiraStatus],
    );
  }

  async openCardIds(client?: pg.PoolClient): Promise<Set<string>> {
    const runner = client ?? this.pool;
    const { rows } = await runner.query<{ card_id: string }>(
      'SELECT card_id FROM conflicts WHERE resolved_at IS NULL',
    );
    return new Set(rows.map((r) => r.card_id));
  }

  async findOpen(id: number): Promise<{
    id: number;
    cardId: string;
    boardColumnId: number;
    jiraStatusCurrent: string;
  } | null> {
    const { rows } = await this.pool.query<{
      id: string;
      card_id: string;
      board_column_id: number;
      jira_status_current: string;
    }>('SELECT * FROM conflicts WHERE id = $1 AND resolved_at IS NULL', [id]);
    const r = rows[0];
    return r
      ? {
          id: Number(r.id),
          cardId: r.card_id,
          boardColumnId: r.board_column_id,
          jiraStatusCurrent: r.jira_status_current,
        }
      : null;
  }

  async resolve(id: number, resolution: ConflictResolution, client?: pg.PoolClient): Promise<void> {
    const runner = client ?? this.pool;
    await runner.query(
      'UPDATE conflicts SET resolved_at = now(), resolution = $2 WHERE id = $1 AND resolved_at IS NULL',
      [id, resolution],
    );
  }

  /** Closes a conflict whose issue has left the query — nothing left to decide. */
  async closeAsMoot(client: pg.PoolClient, cardId: string): Promise<void> {
    await client.query(
      `UPDATE conflicts SET resolved_at = now(), resolution = 'moot'
        WHERE card_id = $1 AND resolved_at IS NULL`,
      [cardId],
    );
  }

  async listOpen(): Promise<
    { id: number; cardId: string; boardColumnId: number; statusAtDetection: string; statusCurrent: string; raisedAt: string }[]
  > {
    const { rows } = await this.pool.query<{
      id: string;
      card_id: string;
      board_column_id: number;
      jira_status_at_detection: string;
      jira_status_current: string;
      raised_at: Date;
    }>('SELECT * FROM conflicts WHERE resolved_at IS NULL ORDER BY raised_at'); 
    return rows.map((r) => ({
      id: Number(r.id),
      cardId: r.card_id,
      boardColumnId: r.board_column_id,
      statusAtDetection: r.jira_status_at_detection,
      statusCurrent: r.jira_status_current,
      raisedAt: r.raised_at.toISOString(),
    }));
  }
}
