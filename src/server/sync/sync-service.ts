import type pg from 'pg';
import type { SyncRun } from '../../shared/types.js';
import { JiraError, type JiraIssue, type JiraPort } from '../jira/jira-port.js';
import type { JiraLinkRepository } from '../repositories/jira-link-repository.js';
import type { SyncRunRepository } from '../repositories/sync-run-repository.js';
import type { SettingsRepository } from '../repositories/settings-repository.js';
import type { JiraCardRepository } from '../repositories/jira-card-repository.js';

/**
 * One sync: fetch everything, then apply it atomically.
 *
 * The two phases are separate on purpose. Fetching inside the transaction
 * would hold it open across network calls of unbounded duration; applying
 * outside one would mean a failure halfway leaves the board half-updated,
 * which FR-131 forbids. Splitting them makes "a failed sync changes nothing"
 * true by construction rather than by compensation — and compensation code
 * only runs after something has already gone wrong, so it is the
 * least-exercised code in any system.
 */
export class SyncService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly jira: JiraPort,
    private readonly cards: JiraCardRepository,
    private readonly links: JiraLinkRepository,
    private readonly runs: SyncRunRepository,
    private readonly settings: SettingsRepository,
  ) {}

  async run(): Promise<SyncRun> {
    const runId = await this.runs.start();

    let issues: JiraIssue[];
    try {
      const { jiraJql } = await this.settings.read();
      issues = await this.jira.searchIssues(jiraJql);
    } catch (error) {
      const kind = error instanceof JiraError ? error.kind : 'connectivity';
      // Nothing has been applied: the board is exactly as it was.
      return this.runs.fail(runId, kind);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const counts = await this.apply(client, issues);
      await client.query('COMMIT');
      return this.runs.succeed(runId, counts);
    } catch (error) {
      await client.query('ROLLBACK');
      await this.runs.fail(runId, 'malformed');
      throw error;
    } finally {
      client.release();
    }
  }

  private async apply(
    client: pg.PoolClient,
    issues: JiraIssue[],
  ): Promise<SyncRun['counts']> {
    const counts = { issuesSeen: issues.length, created: 0, updated: 0, archived: 0, restored: 0 };
    const existing = await this.links.allKeys(client);

    for (const issue of issues) {
      const known = existing.get(issue.key);
      const outcome = await this.cards.upsertFromJira(client, issue, known?.cardId ?? null);
      if (outcome === 'created') counts.created += 1;
      else counts.updated += 1;

      const cardId = await this.cards.cardIdForIssue(client, issue.key);
      if (cardId) await this.links.upsert(client, cardId, issue);

      // An issue that came back gets its own card returned to the board rather
      // than a second one created (FR-125).
      if (known?.archived) {
        await this.cards.restoreFromArchive(client, known.cardId);
        counts.restored += 1;
      }
    }

    // Anything on the board whose issue is no longer in the result has left
    // the query. Archived with a reason, never deleted (FR-122, FR-123).
    const present = new Set(issues.map((i) => i.key));
    for (const [key, { cardId, archived }] of existing) {
      if (present.has(key) || archived) continue;
      await this.cards.archiveBySync(
        client,
        cardId,
        'The issue no longer matches your Jira query — it was closed, or reassigned.',
      );
      counts.archived += 1;
    }

    return counts;
  }
}
