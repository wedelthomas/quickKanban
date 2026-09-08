import type pg from 'pg';
import type { CardSource } from '../../shared/types.js';

/** A single movement, as `elapsed-time.ts` and `iteration-report.ts` need it. */
export interface MovementRow {
  toColumnId: number;
  columnKey: string;
  occurredAt: string;
}

/** A single blocked/unblocked toggle. */
export interface BlockedRow {
  blocked: boolean;
  occurredAt: string;
}

/** Everything a report needs about one card, joined once rather than per-figure. */
export interface ReportCard {
  cardId: string;
  title: string;
  source: CardSource;
  /** Jira project key, parsed from the issue key ("AIHUB-190" -> "AIHUB"). Null for local cards. */
  project: string | null;
  points: number | null;
  movements: MovementRow[];
  blockedEvents: BlockedRow[];
}

/**
 * Read-only, report-shaped access to the movement history, points and
 * blocked-interval log. Separate from EventRepository (which answers "what
 * happened to this one card, for display") and from CardRepository (which
 * answers "what does this card look like now") — this answers a different
 * question: everything every card's history implies, for every card at once.
 * Split the way BoardRepository was split from CardRepository in slice 1, for
 * the same reason.
 */
export class ReportRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Every card that is not deleted — including archived ones (FR-514) —
   * with its full movement and blocked-interval history and its current
   * points. One query per table rather than a join, because a card's
   * movement count and blocked-toggle count vary independently and a join
   * would duplicate rows across them.
   */
  async allCards(): Promise<ReportCard[]> {
    const { rows: cardRows } = await this.pool.query<{
      id: string;
      title: string;
      source: CardSource;
      issue_key: string | null;
      points: number | null;
    }>(
      `SELECT id, title, source, jl.issue_key, c.points
         FROM cards c
         LEFT JOIN jira_links jl ON jl.card_id = c.id
        WHERE c.deleted_at IS NULL`,
    );

    const { rows: movementRows } = await this.pool.query<{
      card_id: string;
      to_column_id: number;
      column_key: string;
      occurred_at: Date;
    }>(
      `SELECT ce.card_id, ce.to_column_id, col.key AS column_key, ce.occurred_at
         FROM card_events ce
         JOIN columns col ON col.id = ce.to_column_id
        WHERE ce.kind = 'moved'
        ORDER BY ce.card_id, ce.id`,
    );

    const { rows: blockedRows } = await this.pool.query<{
      card_id: string;
      blocked: boolean;
      occurred_at: Date;
    }>(`SELECT card_id, blocked, occurred_at FROM card_blocked_events ORDER BY card_id, id`);

    const movementsByCard = new Map<string, MovementRow[]>();
    for (const row of movementRows) {
      const list = movementsByCard.get(row.card_id) ?? [];
      list.push({
        toColumnId: row.to_column_id,
        columnKey: row.column_key,
        occurredAt: row.occurred_at.toISOString(),
      });
      movementsByCard.set(row.card_id, list);
    }

    const blockedByCard = new Map<string, BlockedRow[]>();
    for (const row of blockedRows) {
      const list = blockedByCard.get(row.card_id) ?? [];
      list.push({ blocked: row.blocked, occurredAt: row.occurred_at.toISOString() });
      blockedByCard.set(row.card_id, list);
    }

    return cardRows.map((row) => ({
      cardId: row.id,
      title: row.title,
      source: row.source,
      project: row.issue_key ? row.issue_key.split('-')[0]! : null,
      points: row.points,
      movements: movementsByCard.get(row.id) ?? [],
      blockedEvents: blockedByCard.get(row.id) ?? [],
    }));
  }

  /**
   * The earliest movement ever recorded, or null if none exists. Lets a
   * report distinguish "this iteration's own history is fully recorded"
   * from "part of it predates the ledger this feature reads" (FR-542,
   * BH-531) — a structural signal rather than a guess.
   */
  async earliestMovementAt(): Promise<string | null> {
    const { rows } = await this.pool.query<{ min: Date | null }>(
      'SELECT MIN(occurred_at) FROM card_events',
    );
    return rows[0]?.min ? rows[0].min.toISOString() : null;
  }
}
