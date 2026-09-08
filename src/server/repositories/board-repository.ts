import type pg from 'pg';
import type { BoardColumn } from '../../shared/types.js';
import { type BoardRow, toCard } from './board-row.js';

/**
 * The read model for the whole board.
 *
 * Separate from CardRepository because it answers a different question — what
 * does the board look like, rather than change this card — and because it is
 * the query slice 4 extends with filtering. Growing that inside the mutation
 * repository is how a persistence class quietly becomes the whole application.
 */
export class BoardRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * The whole board in one query. Empty columns are preserved by the LEFT JOIN
   * — always returning six columns is a guarantee the board view and slice 4's
   * filtered view both depend on. Retired columns are excluded, so "six" still
   * holds after slice 5 retired one and added another.
   */
  async readBoard(today: Date): Promise<BoardColumn[]> {
    const { rows } = await this.pool.query<BoardRow>(`
      SELECT
        col.id       AS column_id,
        col.key      AS column_key,
        col.name     AS column_name,
        col.position AS column_position,
        c.id         AS card_id,
        c.source, c.title, c.description, c.priority,
        to_char(c.due_date, 'YYYY-MM-DD') AS due_date,
        c.position, c.created_at, c.updated_at,
        COALESCE(
          (SELECT array_agg(t.name::text ORDER BY t.name)
             FROM card_tags ct JOIN tags t ON t.id = ct.tag_id
            WHERE ct.card_id = c.id),
          ARRAY[]::text[]
        ) AS tags,
        jl.issue_key, jl.url AS issue_url,
        jl.blocked_in_jira,
        c.blocked, c.carried_iterations, c.points, c.jira_points,
        (cf.card_id IS NOT NULL) AS has_conflict
      FROM columns col
      LEFT JOIN cards c
        ON c.column_id = col.id
       AND c.deleted_at IS NULL
       AND c.archived_at IS NULL
      LEFT JOIN jira_links jl ON jl.card_id = c.id
      LEFT JOIN conflicts cf ON cf.card_id = c.id AND cf.resolved_at IS NULL
      -- A retired column is history, not board furniture. Its row survives so
      -- that card_events still resolves (FR-446), but it must never appear
      -- here: FR-402.
      WHERE col.retired_at IS NULL
      ORDER BY col.position, c.position
    `);

    const columns = new Map<number, BoardColumn>();
    for (const row of rows) {
      if (!columns.has(row.column_id)) {
        columns.set(row.column_id, {
          id: row.column_id,
          key: row.column_key,
          name: row.column_name,
          position: row.column_position,
          cards: [],
        });
      }
      if (row.card_id) columns.get(row.column_id)!.cards.push(toCard(row, today));
    }
    return [...columns.values()].sort((a, b) => a.position - b.position);
  }
}
