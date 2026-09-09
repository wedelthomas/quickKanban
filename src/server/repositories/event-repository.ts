import type pg from 'pg';
import type { Actor, CardEvent, CardEventKind } from '../../shared/types.js';

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

  /**
   * Records that a card was archived (FR-317).
   *
   * Both column ids are the column the card is sitting in, because archival
   * does not move it — `kind` is what carries the meaning. Written here rather
   * than inline by the archival service for the same reason every other event
   * is: this is the only writer of `card_events`, and a unit test since slice 1
   * enforces that.
   */
  async appendArchival(
    client: pg.PoolClient,
    event: { cardId: string; columnId: number },
  ): Promise<void> {
    await client.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, kind)
       VALUES ($1, $2, $2, 'system', 'archived')`,
      [event.cardId, event.columnId],
    );
  }

  /**
   * Records that a card was cancelled (FR-607).
   *
   * Same shape as `appendArchival`: both column ids are the column the card
   * was sitting in — cancelling does not move it, `kind` carries the
   * meaning. `actor` is always `'user'`: a cancellation is always something
   * the person at the keyboard did, never sync or the archival pass.
   */
  async appendCancellation(
    client: pg.PoolClient,
    event: { cardId: string; columnId: number },
  ): Promise<void> {
    await client.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, kind)
       VALUES ($1, $2, $2, 'user', 'cancelled')`,
      [event.cardId, event.columnId],
    );
  }

  /** Records that a cancelled card was restored (FR-629). Mirrors `appendCancellation`. */
  async appendRestoration(
    client: pg.PoolClient,
    event: { cardId: string; columnId: number },
  ): Promise<void> {
    await client.query(
      `INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, kind)
       VALUES ($1, $2, $2, 'user', 'restored')`,
      [event.cardId, event.columnId],
    );
  }

  /** Oldest first, which is the order a history is read in. */
  async listForCard(cardId: string): Promise<CardEvent[]> {
    const { rows } = await this.pool.query<{
      id: string;
      from_column_id: number;
      to_column_id: number;
      actor: Actor;
      kind: CardEventKind;
      occurred_at: Date;
    }>(
      `SELECT id, from_column_id, to_column_id, actor, kind, occurred_at
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
      kind: row.kind,
      occurredAt: row.occurred_at.toISOString(),
    }));
  }
}
