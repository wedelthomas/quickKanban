import type pg from 'pg';
import type { JiraIssue } from '../jira/jira-port.js';

export class JiraLinkRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Records the issue's status and Jira's own last-updated value (FR-116).
   * Written by this slice, read by slice 3's three-way comparison — which is
   * why it must be Jira's timestamp and never the local clock.
   */
  async upsert(client: pg.PoolClient, cardId: string, issue: JiraIssue): Promise<void> {
    await client.query(
      `INSERT INTO jira_links
         (card_id, issue_key, issue_id, url, status_name, status_id, jira_updated_at, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (card_id) DO UPDATE SET
         issue_key = EXCLUDED.issue_key,
         issue_id = EXCLUDED.issue_id,
         url = EXCLUDED.url,
         status_name = EXCLUDED.status_name,
         status_id = EXCLUDED.status_id,
         jira_updated_at = EXCLUDED.jira_updated_at,
         last_synced_at = now()`,
      [
        cardId,
        issue.key,
        issue.id,
        issue.url,
        issue.statusName,
        issue.statusId,
        issue.updatedAt,
      ],
    );
  }

  /**
   * Refreshes everything about the link *except* the recorded status.
   *
   * The status is written by whoever reconciled the card, because it records
   * what that decision concluded rather than what Jira happened to say when
   * the row was touched.
   */
  async upsertMetadata(
    client: pg.PoolClient,
    cardId: string,
    issue: JiraIssue,
  ): Promise<void> {
    await client.query(
      `UPDATE jira_links
          SET issue_key = $2, issue_id = $3, url = $4, status_id = $5,
              jira_updated_at = $6, last_synced_at = now()
        WHERE card_id = $1`,
      [cardId, issue.key, issue.id, issue.url, issue.statusId, issue.updatedAt],
    );
  }

  async findByCardId(
    cardId: string,
  ): Promise<{ issueKey: string; statusName: string } | null> {
    const { rows } = await this.pool.query<{ issue_key: string; status_name: string }>(
      'SELECT issue_key, status_name FROM jira_links WHERE card_id = $1',
      [cardId],
    );
    const r = rows[0];
    return r ? { issueKey: r.issue_key, statusName: r.status_name } : null;
  }

  /** After our own transition, so the next sync sees no difference. */
  async recordStatus(
    cardId: string,
    statusName: string,
    client?: pg.PoolClient,
  ): Promise<void> {
    const runner = client ?? this.pool;
    await runner.query(
      'UPDATE jira_links SET status_name = $2, last_synced_at = now() WHERE card_id = $1',
      [cardId, statusName],
    );
  }

  /** Every issue key currently linked to a card, archived or not. */
  async allKeys(
    client: pg.PoolClient,
  ): Promise<Map<string, { cardId: string; archived: boolean }>> {
    const { rows } = await client.query<{
      issue_key: string;
      card_id: string;
      archived: boolean;
    }>(
      `SELECT jl.issue_key, jl.card_id, (c.archived_at IS NOT NULL) AS archived
         FROM jira_links jl JOIN cards c ON c.id = jl.card_id
        WHERE c.deleted_at IS NULL`,
    );
    return new Map(
      rows.map((r) => [r.issue_key, { cardId: r.card_id, archived: r.archived }]),
    );
  }
}
