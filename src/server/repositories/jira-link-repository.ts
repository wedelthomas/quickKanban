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
      [cardId, issue.key, issue.id, issue.url, issue.statusName, issue.statusId, issue.updatedAt],
    );
  }

  /** Every issue key currently linked to a card, archived or not. */
  async allKeys(client: pg.PoolClient): Promise<Map<string, { cardId: string; archived: boolean }>> {
    const { rows } = await client.query<{ issue_key: string; card_id: string; archived: boolean }>(
      `SELECT jl.issue_key, jl.card_id, (c.archived_at IS NOT NULL) AS archived
         FROM jira_links jl JOIN cards c ON c.id = jl.card_id
        WHERE c.deleted_at IS NULL`,
    );
    return new Map(rows.map((r) => [r.issue_key, { cardId: r.card_id, archived: r.archived }]));
  }
}
