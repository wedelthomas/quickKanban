import type pg from 'pg';
import type { Actor, CardSource } from '../../shared/types.js';
import type { MovementRow, StateRow } from '../../domain/summary.js';

const IN_PROGRESS = 2;
const BLOCKED = 3;

/**
 * The two reads a summary needs.
 *
 * Kept apart rather than unioned in SQL: they answer different questions —
 * what happened during the period, and where things stand now — and joining
 * them would force one shape onto both.
 */
export class SummaryRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Movements in the period, oldest first.
   *
   * Note which filter is applied and which is not: `deleted_at` excludes a
   * deleted card, `archived_at` does NOT exclude an archived one. That is the
   * whole of FR-326 — a week's work that vanished from the report because it
   * was tidied away would make the weekly summary useless for the one
   * conversation it exists for.
   */
  async movements(from: Date, to: Date): Promise<MovementRow[]> {
    const { rows } = await this.pool.query<{
      card_id: string;
      title: string;
      source: CardSource;
      issue_key: string | null;
      url: string | null;
      from_name: string;
      to_name: string;
      actor: Actor;
      occurred_at: Date;
      archived_at: Date | null;
    }>(
      `SELECT e.card_id, c.title, c.source, jl.issue_key, jl.url,
              cf.name AS from_name, ct.name AS to_name,
              e.actor, e.occurred_at, c.archived_at
         FROM card_events e
         JOIN cards c   ON c.id = e.card_id
         JOIN columns cf ON cf.id = e.from_column_id
         JOIN columns ct ON ct.id = e.to_column_id
         LEFT JOIN jira_links jl ON jl.card_id = c.id
        WHERE e.kind = 'moved'
          AND e.occurred_at >= $1 AND e.occurred_at < $2
          AND c.deleted_at IS NULL
        ORDER BY e.occurred_at, e.id`,
      [from, to],
    );

    return rows.map((r) => ({
      cardId: r.card_id,
      title: r.title,
      source: r.source,
      issueKey: r.issue_key,
      issueUrl: r.url,
      fromColumn: r.from_name,
      toColumn: r.to_name,
      actor: r.actor,
      occurredAt: r.occurred_at.toISOString(),
      archived: r.archived_at !== null,
    }));
  }

  /** What is in progress and what is blocked, as of now — a state, not events. */
  async currentState(): Promise<StateRow[]> {
    const { rows } = await this.pool.query<{
      id: string;
      title: string;
      source: CardSource;
      issue_key: string | null;
      url: string | null;
      column_id: number;
    }>(
      `SELECT c.id, c.title, c.source, jl.issue_key, jl.url, c.column_id
         FROM cards c
         LEFT JOIN jira_links jl ON jl.card_id = c.id
        WHERE c.column_id = ANY($1)
          AND c.archived_at IS NULL
          AND c.deleted_at IS NULL
        ORDER BY c.column_id, c.position`,
      [[IN_PROGRESS, BLOCKED]],
    );

    return rows.map((r) => ({
      cardId: r.id,
      title: r.title,
      source: r.source,
      issueKey: r.issue_key,
      issueUrl: r.url,
      columnId: r.column_id,
    }));
  }
}
