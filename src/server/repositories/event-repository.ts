import type pg from 'pg';
import type { Actor, CardEvent } from '../../shared/types.js';

/**
 * The movement history. Append and read only.
 *
 * There is deliberately no UPDATE or DELETE statement anywhere in this file,
 * and there must never be one: FR-027 makes the log immutable, and the
 * cheapest way to guarantee that is for no code path to exist. A test asserts
 * earlier records are unchanged, but the absence of the capability is the real
 * enforcement.
 */
export class EventRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Takes a client rather than using the pool, so the caller can append inside
   * the same transaction as the move it describes. A card must never move
   * without its record, nor record a move that did not happen.
   */
  async append(
    client: pg.PoolClient,
    event: { cardId: string; fromColumnId: number; toColumnId: number; actor: Actor },
  ): Promise<void> {
    await client.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor)
       VALUES ($1, $2, $3, $4)`,
      [event.cardId, event.fromColumnId, event.toColumnId, event.actor],
    );
  }

  /** Oldest first, which is the order a history is read in. */
  async listForCard(cardId: string): Promise<CardEvent[]> {
    const { rows } = await this.pool.query<{
      id: string;
      from_column_id: number;
      to_column_id: number;
      actor: Actor;
      occurred_at: Date;
    }>(
      `SELECT id, from_column_id, to_column_id, actor, occurred_at
         FROM card_events
        WHERE card_id = $1
        ORDER BY id`,
      [cardId],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      fromColumnId: row.from_column_id,
      toColumnId: row.to_column_id,
      actor: row.actor,
      occurredAt: row.occurred_at.toISOString(),
    }));
  }
}
