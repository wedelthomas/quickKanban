import type pg from 'pg';
import type { BoardColumn, Card, ColumnKey, Priority, CardSource } from '../../shared/types.js';
import { isOverdue } from '../../domain/overdue.js';
import type { CreateCardInput } from '../../domain/validation.js';
import { TagRepository } from './tag-repository.js';

/** Backlog. New cards land here (FR-009). */
const BACKLOG_COLUMN_ID = 1;

interface BoardRow {
  column_id: number;
  column_key: ColumnKey;
  column_name: string;
  column_position: number;
  card_id: string | null;
  source: CardSource | null;
  title: string | null;
  description: string | null;
  priority: Priority | null;
  due_date: string | null;
  position: number | null;
  tags: string[] | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export class CardRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly tags = new TagRepository(pool),
  ) {}

  /**
   * Creates a card at the top of Backlog. The whole thing is one transaction:
   * shifting the existing cards down, inserting, and attaching tags either all
   * happen or none do, so the column's positions are never left with a gap or
   * a duplicate.
   */
  async create(input: CreateCardInput, today: Date): Promise<Card> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the column's live rows before renumbering so two concurrent
      // creates cannot both claim position 1.
      await client.query(
        `SELECT id FROM cards
          WHERE column_id = $1 AND deleted_at IS NULL AND archived_at IS NULL
          FOR UPDATE`,
        [BACKLOG_COLUMN_ID],
      );
      await client.query(
        `UPDATE cards SET position = position + 1
          WHERE column_id = $1 AND deleted_at IS NULL AND archived_at IS NULL`,
        [BACKLOG_COLUMN_ID],
      );

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO cards (source, title, description, priority, due_date, column_id, position)
         VALUES ('local', $1, $2, $3, $4, $5, 1)
         RETURNING id`,
        [input.title, input.description, input.priority, input.dueDate, BACKLOG_COLUMN_ID],
      );
      const id = rows[0]!.id;

      const tags = await this.tags.getOrCreate(client, input.tags);
      if (tags.length > 0) {
        await client.query(
          `INSERT INTO card_tags (card_id, tag_id) SELECT $1, unnest($2::int[])`,
          [id, tags.map((t) => t.id)],
        );
      }

      await client.query('COMMIT');
      return (await this.findById(id, today))!;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string, today: Date): Promise<Card | null> {
    const { rows } = await this.pool.query<BoardRow>(
      `SELECT
         col.id AS column_id, col.key AS column_key, col.name AS column_name,
         col.position AS column_position,
         c.id AS card_id, c.source, c.title, c.description, c.priority,
         to_char(c.due_date, 'YYYY-MM-DD') AS due_date,
         c.position, c.created_at, c.updated_at,
         COALESCE(
           (SELECT array_agg(t.name::text ORDER BY t.name)
              FROM card_tags ct JOIN tags t ON t.id = ct.tag_id
             WHERE ct.card_id = c.id),
           ARRAY[]::text[]
         ) AS tags
       FROM cards c JOIN columns col ON col.id = c.column_id
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [id],
    );
    const row = rows[0];
    return row ? toCard(row, today) : null;
  }

  /**
   * The whole board in one query. Empty columns are preserved by the LEFT JOIN
   * — always returning six columns is a guarantee the board view and slice 4's
   * filtered view both depend on.
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
        ) AS tags
      FROM columns col
      LEFT JOIN cards c
        ON c.column_id = col.id
       AND c.deleted_at IS NULL
       AND c.archived_at IS NULL
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

const toCard = (row: BoardRow, today: Date): Card => ({
  id: row.card_id!,
  source: row.source!,
  title: row.title!,
  description: row.description,
  priority: row.priority!,
  dueDate: row.due_date,
  overdue: isOverdue(row.due_date, today),
  columnId: row.column_id,
  position: row.position!,
  tags: row.tags ?? [],
  createdAt: row.created_at!.toISOString(),
  updatedAt: row.updated_at!.toISOString(),
});
