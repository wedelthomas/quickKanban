import type pg from 'pg';
import type { JiraIssue } from '../jira/jira-port.js';
import { columnForStatus } from '../../domain/status-mapping.js';
import { EventRepository } from './event-repository.js';

/** Done. Where issues that leave the query are parked. */
const DONE_COLUMN_ID = 6;

/**
 * How **sync** changes cards, as distinct from how the **user** does.
 *
 * Split from CardRepository because the two answer different questions and
 * obey different rules: the user may retitle and delete a card, sync may not;
 * sync may archive a card and attribute the movement to itself, the user may
 * not. Keeping them together produced a class that grew every time either
 * side gained a rule.
 *
 * Every method takes a client rather than the pool, because all of this runs
 * inside the single transaction the sync applies (FR-131).
 */
export class JiraCardRepository {
  constructor(private readonly events: EventRepository) {}

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
  ): Promise<{ cardId: string; outcome: 'created' | 'updated' }> {
    if (knownCardId) {
      await client.query(
        `UPDATE cards SET title = $2, updated_at = now() WHERE id = $1 AND title <> $2`,
        [knownCardId, issue.summary],
      );
      return { cardId: knownCardId, outcome: 'updated' };
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
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO cards (source, title, priority, column_id, position)
       VALUES ('jira', $1, 'medium', $2, 1)
       RETURNING id`,
      [issue.summary, columnId],
    );
    return { cardId: rows[0]!.id, outcome: 'created' };
  }

  /** The card's column and the last Jira status recorded for it. */
  async currentState(
    client: pg.PoolClient,
    cardId: string,
  ): Promise<{
    columnId: number;
    lastKnownColumn: number | null;
    lastKnownStatus: string;
  } | null> {
    const { rows } = await client.query<{
      column_id: number;
      synced_column_id: number | null;
      status_name: string;
    }>(
      `SELECT c.column_id, jl.synced_column_id, jl.status_name
         FROM cards c JOIN jira_links jl ON jl.card_id = c.id
        WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [cardId],
    );
    const r = rows[0];
    return r
      ? {
          columnId: r.column_id,
          lastKnownColumn: r.synced_column_id,
          lastKnownStatus: r.status_name,
        }
      : null;
  }

  /** Moves a card because Jira moved, attributing the movement to sync. */
  async moveBySync(
    client: pg.PoolClient,
    cardId: string,
    toColumnId: number,
  ): Promise<void> {
    const { rows } = await client.query<{ column_id: number }>(
      'SELECT column_id FROM cards WHERE id = $1 FOR UPDATE',
      [cardId],
    );
    const from = rows[0]?.column_id;
    if (from === undefined || from === toColumnId) return;

    await this.events.append(client, {
      cardId,
      fromColumnId: from,
      toColumnId,
      actor: 'sync',
    });
    await client.query(
      `UPDATE cards SET column_id = $2,
              position = COALESCE((SELECT max(position) FROM cards WHERE column_id = $2), 0) + 1,
              updated_at = now()
        WHERE id = $1`,
      [cardId, toColumnId],
    );
  }

  /** Moves a card to Done and archives it, attributing the movement to sync. */
  async archiveBySync(
    client: pg.PoolClient,
    cardId: string,
    reason: string,
  ): Promise<void> {
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
}
