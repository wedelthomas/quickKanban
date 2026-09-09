/**
 * Every SQL statement the card table needs, in one place.
 *
 * Over 300 lines, deliberately. Splitting it would mean splitting by verb
 * (reads here, writes there) while the queries share the same column list,
 * the same row shape and the same ordering rules — a split that separates
 * things which have to change together, in exchange for a smaller file. The
 * alternative that would genuinely reduce this is an ORM, rejected in slice 1's
 * research for hiding exactly the query behaviour this file exists to control.
 */
import type pg from 'pg';
import type { Card } from '../../shared/types.js';
import { type BoardRow, toCard } from './board-row.js';
import type {
  CreateCardInput,
  MoveCardInput,
  UpdateCardInput,
} from '../../domain/validation.js';
import { planMove, type ColumnOrder } from '../../domain/ordering.js';
import { TagRepository } from './tag-repository.js';
import { EventRepository } from './event-repository.js';
import { SettingsRepository } from './settings-repository.js';

/** Backlog. New cards land here (FR-009). */
const BACKLOG_COLUMN_ID = 1;

export class CardRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly settings: SettingsRepository = new SettingsRepository(pool),
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
        [
          input.title,
          input.description,
          input.priority,
          input.dueDate,
          BACKLOG_COLUMN_ID,
        ],
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
  /**
   * Whether a column exists and may still receive cards.
   *
   * Retirement is not deletion (FR-446): a retired column's row survives so the
   * movement history resolves, which is precisely why it stays reachable by id
   * and must be refused explicitly rather than by absence.
   */
  async columnState(id: number): Promise<'open' | 'retired' | 'absent'> {
    const { rows } = await this.pool.query<{ retired: boolean }>(
      'SELECT retired_at IS NOT NULL AS retired FROM columns WHERE id = $1',
      [id],
    );
    const column = rows[0];
    if (!column) return 'absent';
    return column.retired ? 'retired' : 'open';
  }

  async move(
    id: string,
    input: MoveCardInput,
    today: Date,
  ): Promise<{
    card: Card;
    moved: boolean;
    fromColumnId: number;
    toColumnId: number;
  } | null> {
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
        return {
          card: card!,
          moved: false,
          fromColumnId: from.columnId,
          toColumnId: to.columnId,
        };
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
   * Cancels a card: leaves the board via the same `archived_at` retention
   * path a completed card already uses (research.md R-1), remembering why
   * and which column to restore it to.
   *
   * Cancelling an already-cancelled card is a no-op that still succeeds
   * (FR-610) — the conflict check and every other guard already ran in the
   * service before this is called, so by the time a row is locked here the
   * only remaining question is whether there is anything left to do.
   */
  async cancel(
    id: string,
    input: { reason: string; now: Date },
  ): Promise<{ card: Card; alreadyCancelled: boolean } | 'not-found' | 'already-archived'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{
        column_id: number;
        cancelled_at: Date | null;
        archived_at: Date | null;
      }>(
        `SELECT column_id, cancelled_at, archived_at FROM cards
          WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id],
      );
      const current = rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return 'not-found';
      }

      if (current.cancelled_at !== null) {
        await client.query('ROLLBACK');
        const card = await this.findById(id, input.now);
        return { card: card!, alreadyCancelled: true };
      }

      // Archived for a reason other than cancellation (completed, or sync
      // found the issue gone) — not cancellable (spec.md Edge Cases: "A
      // card in Done is cancelled" is not a use case this feature serves).
      if (current.archived_at !== null) {
        await client.query('ROLLBACK');
        return 'already-archived';
      }

      await client.query(
        `UPDATE cards
            SET cancelled_at = $2, cancellation_reason = $3,
                cancelled_from_column_id = $4, archived_at = $2, updated_at = $2
          WHERE id = $1`,
        [id, input.now, input.reason, current.column_id],
      );
      await this.events.appendCancellation(client, { cardId: id, columnId: current.column_id });

      await client.query('COMMIT');
      const card = await this.findById(id, input.now);
      return { card: card!, alreadyCancelled: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Restores a cancelled card to the column it left, or to Backlog if that
   * column has since been retired (FR-630, BH-626). Clears every
   * cancellation column — the permanent record survives regardless, in
   * `card_events` (Principle II), not here.
   */
  async restore(
    id: string,
    input: { now: Date },
  ): Promise<{ card: Card } | 'not-found' | 'not-cancelled'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{
        cancelled_at: Date | null;
        cancelled_from_column_id: number | null;
      }>(
        `SELECT cancelled_at, cancelled_from_column_id FROM cards
          WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id],
      );
      const current = rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return 'not-found';
      }
      if (current.cancelled_at === null) {
        await client.query('ROLLBACK');
        return 'not-cancelled';
      }

      const wanted = current.cancelled_from_column_id ?? BACKLOG_COLUMN_ID;
      const state = await this.columnState(wanted);
      const target = state === 'open' ? wanted : BACKLOG_COLUMN_ID;

      await client.query(
        `UPDATE cards
            SET cancelled_at = NULL, cancellation_reason = NULL,
                cancelled_from_column_id = NULL, archived_at = NULL,
                column_id = $2, updated_at = $3
          WHERE id = $1`,
        [id, target, input.now],
      );
      await this.events.appendRestoration(client, { cardId: id, columnId: target });

      await client.query('COMMIT');
      const card = await this.findById(id, input.now);
      return { card: card! };
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

      const { rows } = await client.query<{ id: string; source: string; blocked: boolean }>(
        'SELECT id, source, blocked FROM cards WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
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
      // Permitted on a Jira-sourced card, unlike title: the jira-owned guard
      // above deliberately names only the fields Jira is authoritative for, and
      // blocked is not one of them (FR-412, FR-418).
      if (input.blocked !== undefined) set('blocked', input.blocked);
      // Same permission as blocked: points is never one of the jira-owned
      // fields the guard above names (FR-516 — settable on any card).
      if (input.points !== undefined) set('points', input.points);

      if (sets.length > 0) {
        values.push(id);
        await client.query(
          `UPDATE cards SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
          values,
        );
      }

      // Written only on a genuine change (old value ≠ new), inside the same
      // transaction as the update it describes — the blocked-interval log
      // elapsed-time.ts reads (FR-505, R-3 in research.md).
      if (input.blocked !== undefined && input.blocked !== card.blocked) {
        await client.query(
          'INSERT INTO card_blocked_events (card_id, blocked) VALUES ($1, $2)',
          [id, input.blocked],
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

  /** Live card ids of a column, in order, locked for the rest of the transaction. */
  private async lockedOrder(
    client: pg.PoolClient,
    columnId: number,
  ): Promise<ColumnOrder> {
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
         jl.issue_key, jl.url AS issue_url, jl.blocked_in_jira, jl.status_name,
         c.blocked, c.carried_iterations, c.points, c.jira_points,
         (cf.card_id IS NOT NULL) AS has_conflict
       FROM cards c
       JOIN columns col ON col.id = c.column_id
       LEFT JOIN jira_links jl ON jl.card_id = c.id
       LEFT JOIN conflicts cf ON cf.card_id = c.id AND cf.resolved_at IS NULL
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    const { cancellationStatus } = await this.settings.read();
    return toCard(row, today, cancellationStatus);
  }
}
