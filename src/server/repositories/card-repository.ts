import type pg from 'pg';
import type { Card } from '../../shared/types.js';
import { type BoardRow, toCard } from './board-row.js';
import type { CreateCardInput, MoveCardInput, UpdateCardInput } from '../../domain/validation.js';
import { planMove, type ColumnOrder } from '../../domain/ordering.js';
import type { JiraIssue } from '../jira/jira-port.js';
import { columnForStatus } from '../../domain/status-mapping.js';
import { TagRepository } from './tag-repository.js';
import { EventRepository } from './event-repository.js';

/** Backlog. New cards land here (FR-009). */
const BACKLOG_COLUMN_ID = 1;

/** Done. Where issues that leave the query are parked. */
const DONE_COLUMN_ID = 6;

export class CardRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly tags = new TagRepository(pool),
    private readonly events = new EventRepository(pool),
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

  /**
   * Moves a card to an absolute target (column + index), which is what makes
   * the operation idempotent under replay: a repeated request lands the card
   * in the same place rather than shifting it again.
   *
   * One transaction, with the affected columns' rows locked before anything is
   * read, so two rapid moves serialise instead of interleaving into a column
   * with duplicate positions.
   */
  async move(
    id: string,
    input: MoveCardInput,
    today: Date,
  ): Promise<{ card: Card; moved: boolean; fromColumnId: number; toColumnId: number } | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: cardRows } = await client.query<{ column_id: number }>(
        `SELECT column_id FROM cards WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id],
      );
      const current = cardRows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }

      const from = await this.lockedOrder(client, current.column_id);
      const to =
        current.column_id === input.toColumnId
          ? from
          : await this.lockedOrder(client, input.toColumnId);

      const plan = planMove({ cardId: id, from, to, toIndex: input.toIndex });

      if (!plan.changed) {
        // No write and no history: a move to the position already held did not
        // happen, and recording it would put noise in slice 4's summary.
        await client.query('ROLLBACK');
        const card = await this.findById(id, today);
        return { card: card!, moved: false, fromColumnId: from.columnId, toColumnId: to.columnId };
      }

      await client.query(
        `UPDATE cards AS c
            SET column_id = v.column_id, position = v.position, updated_at = now()
           FROM (SELECT unnest($1::uuid[]) AS id,
                        unnest($2::int[])  AS column_id,
                        unnest($3::int[])  AS position) AS v
          WHERE c.id = v.id`,
        [
          plan.assignments.map((a) => a.cardId),
          plan.assignments.map((a) => a.columnId),
          plan.assignments.map((a) => a.position),
        ],
      );

      // Inside the same transaction as the move it describes (FR-026), and only
      // for a genuine column change — a reorder writes nothing (FR-028), so an
      // event always represents real progress rather than tidying.
      if (plan.columnChanged) {
        await this.events.append(client, {
          cardId: id,
          fromColumnId: plan.fromColumnId,
          toColumnId: plan.toColumnId,
          actor: 'user',
        });
      }

      await client.query('COMMIT');
      const card = await this.findById(id, today);
      return {
        card: card!,
        moved: true,
        fromColumnId: plan.fromColumnId,
        toColumnId: plan.toColumnId,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Updates only the fields present in the patch. Tags are replaced wholesale
   * rather than merged, because `tags: []` has to be able to mean "no tags" —
   * a merge would make clearing them impossible.
   */
  async update(
    id: string,
    input: UpdateCardInput,
    today: Date,
  ): Promise<Card | 'not-found' | 'jira-owned'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{ id: string; source: string }>(
        'SELECT id, source FROM cards WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id],
      );
      const card = rows[0];
      if (!card) {
        await client.query('ROLLBACK');
        return 'not-found';
      }

      // Checked inside the transaction that holds the row lock, so the source
      // cannot change between the check and the write (FR-121).
      if (card.source !== 'local' && input.title !== undefined) {
        await client.query('ROLLBACK');
        return 'jira-owned';
      }

      const sets: string[] = [];
      const values: unknown[] = [];
      const set = (column: string, value: unknown): void => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (input.title !== undefined) set('title', input.title);
      if (input.description !== undefined) set('description', input.description);
      if (input.priority !== undefined) set('priority', input.priority);
      if (input.dueDate !== undefined) set('due_date', input.dueDate);

      if (sets.length > 0) {
        values.push(id);
        await client.query(
          `UPDATE cards SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
          values,
        );
      }

      if (input.tags !== undefined) {
        await client.query('DELETE FROM card_tags WHERE card_id = $1', [id]);
        const tags = await this.tags.getOrCreate(client, input.tags);
        if (tags.length > 0) {
          await client.query(
            'INSERT INTO card_tags (card_id, tag_id) SELECT $1, unnest($2::int[])',
            [id, tags.map((t) => t.id)],
          );
        }
        await client.query('UPDATE cards SET updated_at = now() WHERE id = $1', [id]);
      }

      await client.query('COMMIT');
      return (await this.findById(id, today)) ?? 'not-found';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Soft delete: the card leaves the board and its row stays. Two reasons —
   * an ad-hoc card exists nowhere else, so a mis-click should be recoverable;
   * and the movement history references the card with ON DELETE RESTRICT, so
   * the row must survive for the history to outlive it (FR-029, FR-041).
   *
   * Returns 'not-found' or 'not-local' rather than throwing, so the HTTP shape
   * stays a decision of the route layer.
   */
  async softDelete(id: string): Promise<'deleted' | 'not-found' | 'not-local'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{ source: string; column_id: number }>(
        'SELECT source, column_id FROM cards WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [id],
      );
      const card = rows[0];
      if (!card) {
        await client.query('ROLLBACK');
        return 'not-found';
      }
      if (card.source !== 'local') {
        await client.query('ROLLBACK');
        return 'not-local';
      }

      await client.query(
        'UPDATE cards SET deleted_at = now(), updated_at = now() WHERE id = $1',
        [id],
      );
      // Close the gap the card leaves, so positions stay contiguous.
      await client.query(
        `UPDATE cards AS c SET position = ranked.rank
           FROM (SELECT id, row_number() OVER (ORDER BY position) AS rank
                   FROM cards
                  WHERE column_id = $1 AND deleted_at IS NULL AND archived_at IS NULL) AS ranked
          WHERE c.id = ranked.id`,
        [card.column_id],
      );

      await client.query('COMMIT');
      return 'deleted';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Creates a card for a Jira issue, or updates the one that already exists.
   *
   * Never changes an existing card's column (FR-113): the board is the user's
   * own arrangement in this slice, and sync records what Jira said without
   * acting on it.
   */
  async upsertFromJira(
    client: pg.PoolClient,
    issue: JiraIssue,
    knownCardId: string | null,
  ): Promise<'created' | 'updated'> {
    if (knownCardId) {
      await client.query(
        `UPDATE cards SET title = $2, updated_at = now() WHERE id = $1 AND title <> $2`,
        [knownCardId, issue.summary],
      );
      return 'updated';
    }

    // Placed by status (FR-112, FR-138), falling back to Backlog for anything
    // the mapping does not recognise.
    const columnId = columnForStatus(issue.statusName);

    await client.query(
      `SELECT id FROM cards
        WHERE column_id = $1 AND deleted_at IS NULL AND archived_at IS NULL
        FOR UPDATE`,
      [columnId],
    );
    await client.query(
      `UPDATE cards SET position = position + 1
        WHERE column_id = $1 AND deleted_at IS NULL AND archived_at IS NULL`,
      [columnId],
    );
    await client.query(
      `INSERT INTO cards (source, title, priority, column_id, position)
       VALUES ('jira', $1, 'medium', $2, 1)`,
      [issue.summary, columnId],
    );
    return 'created';
  }

  async cardIdForIssue(client: pg.PoolClient, issueKey: string): Promise<string | null> {
    const { rows } = await client.query<{ id: string }>(
      `SELECT c.id FROM cards c
         LEFT JOIN jira_links jl ON jl.card_id = c.id
        WHERE (jl.issue_key = $1 OR (jl.issue_key IS NULL AND c.source = 'jira'))
          AND c.deleted_at IS NULL
        ORDER BY (jl.issue_key = $1) DESC NULLS LAST, c.created_at DESC
        LIMIT 1`,
      [issueKey],
    );
    return rows[0]?.id ?? null;
  }

  /** Moves a card to Done and archives it, attributing the movement to sync. */
  async archiveBySync(client: pg.PoolClient, cardId: string, reason: string): Promise<void> {
    const { rows } = await client.query<{ column_id: number }>(
      'SELECT column_id FROM cards WHERE id = $1 FOR UPDATE',
      [cardId],
    );
    const from = rows[0]?.column_id;
    if (from === undefined) return;

    if (from !== DONE_COLUMN_ID) {
      // Through the event repository, not an inline INSERT: it is the only
      // writer of the movement log, and a unit test enforces that. Slice 1's
      // guard caught this the first time it was written inline.
      await this.events.append(client, {
        cardId,
        fromColumnId: from,
        toColumnId: DONE_COLUMN_ID,
        actor: 'sync',
      });
    }
    await client.query(
      `UPDATE cards
          SET column_id = $2, archived_at = now(), archived_reason = $3, updated_at = now()
        WHERE id = $1`,
      [cardId, DONE_COLUMN_ID, reason],
    );
  }

  async restoreFromArchive(client: pg.PoolClient, cardId: string): Promise<void> {
    await client.query(
      `UPDATE cards SET archived_at = NULL, archived_reason = NULL, updated_at = now()
        WHERE id = $1`,
      [cardId],
    );
  }

  /** Live card ids of a column, in order, locked for the rest of the transaction. */
  private async lockedOrder(client: pg.PoolClient, columnId: number): Promise<ColumnOrder> {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM cards
        WHERE column_id = $1 AND deleted_at IS NULL AND archived_at IS NULL
        ORDER BY position
        FOR UPDATE`,
      [columnId],
    );
    return { columnId, cardIds: rows.map((r) => r.id) };
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
         ) AS tags,
         jl.issue_key, jl.url AS issue_url
       FROM cards c
       JOIN columns col ON col.id = c.column_id
       LEFT JOIN jira_links jl ON jl.card_id = c.id
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [id],
    );
    const row = rows[0];
    return row ? toCard(row, today) : null;
  }

}
