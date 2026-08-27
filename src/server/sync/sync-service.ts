import type pg from 'pg';
import type { SyncRun } from '../../shared/types.js';
import { JiraError, type JiraIssue, type JiraPort } from '../jira/jira-port.js';
import type { JiraLinkRepository } from '../repositories/jira-link-repository.js';
import type { SyncRunRepository } from '../repositories/sync-run-repository.js';
import type { SettingsRepository } from '../repositories/settings-repository.js';
import type { JiraCardRepository } from '../repositories/jira-card-repository.js';
import type { MappingRepository } from '../repositories/mapping-repository.js';
import type { ConflictRepository } from '../repositories/conflict-repository.js';
import type { TransitionService } from './transition-service.js';
import { reconcile } from '../../domain/reconcile.js';

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
    private readonly mappings: MappingRepository,
    private readonly conflicts: ConflictRepository,
    private readonly transitions: TransitionService,
  ) {}

  async run(): Promise<SyncRun> {
    const runId = await this.runs.start();

    let issues: JiraIssue[];
    try {
      const { jiraJql } = await this.settings.read();
      issues = await this.jira.searchIssues(jiraJql);
    } catch (error) {
      // The port's failure vocabulary is wider than a sync run's: transition
      // failures cannot occur on a read, so they collapse to connectivity here.
      const raw = error instanceof JiraError ? error.kind : 'connectivity';
      const kind =
        raw === 'credentials' || raw === 'rate_limit' || raw === 'malformed'
          ? raw
          : 'connectivity';
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

  /**
   * Decides what one already-known card needs, and does it.
   *
   * The deciding is delegated to a pure function; everything here is effects.
   * That split is what makes the decision table testable without a database,
   * and it keeps this method readable as a list of consequences rather than a
   * nest of conditions.
   */
  private async reconcileCard(
    client: pg.PoolClient,
    cardId: string,
    issue: JiraIssue,
    mappings: Awaited<ReturnType<MappingRepository['forDomain']>>,
    openConflicts: Set<string>,
  ): Promise<'conflict' | 'none'> {
    if (openConflicts.has(cardId)) {
      // Frozen against movement (FR-227) but not against the truth: the
      // resolution screen must show what Jira says *now*, not what it said
      // when the disagreement was first noticed (FR-234). A screen offering a
      // stale choice is worse than no screen.
      await this.conflicts.refreshJiraStatus(cardId, issue.statusName, client);
      // Not counted: this run did not raise it, it inherited it. Counting it
      // every sync would make one disagreement look like an epidemic.
      return 'none';
    }

    const state = await this.cards.currentState(client, cardId);
    if (!state) return 'none';

    const decision = reconcile({
      mappings,
      localColumn: state.columnId,
      remoteStatus: issue.statusName,
      lastKnownStatus: state.lastKnownStatus,
    });

    switch (decision.kind) {
      case 'no-op':
      case 'unmapped-remote-status':
        // Nothing to do, but the recorded state still catches up so the next
        // sync does not keep rediscovering the same difference.
        await this.links.recordStatus(cardId, issue.statusName, client);
        return 'none';

      case 'apply-remote':
        await this.cards.moveBySync(client, cardId, decision.toColumnId);
        await this.links.recordStatus(cardId, decision.status, client);
        return 'none';

      case 'push-local':
        // Deliberately outside the transaction's control: a Jira write cannot
        // be rolled back, so it is attempted and its result recorded. A
        // failure here leaves the card where the user put it and the next sync
        // reconciles again — never a silent divergence.
        try {
          const outcome = await this.transitions.moveTo(
            issue.key,
            decision.toStatus,
            issue.statusName,
          );
          if (outcome.transitioned) {
            await this.links.recordStatus(cardId, outcome.toStatus, client);
          }
        } catch {
          // Swallowed on purpose: one issue's refused push must not fail a sync
          // that reconciled everything else correctly. It is not silent — the
          // attempt and its reason are on the write log, and the card stays
          // where the user put it for the next sync to reconcile again.
        }
        return 'none';

      case 'conflict':
        await this.conflicts.raiseOrUpdate(client, {
          cardId,
          boardColumnId: decision.boardColumnId,
          jiraStatus: decision.jiraStatus,
        });
        return 'conflict';
    }
  }

  private async apply(
    client: pg.PoolClient,
    issues: JiraIssue[],
  ): Promise<SyncRun['counts']> {
    const counts = {
      issuesSeen: issues.length,
      created: 0,
      updated: 0,
      archived: 0,
      restored: 0,
      conflictsRaised: 0,
    };
    const existing = await this.links.allKeys(client);
    const mappings = await this.mappings.forDomain(client);
    // A conflicted card is skipped entirely: it holds its position until the
    // user chooses a side (FR-227).
    const openConflicts = await this.conflicts.openCardIds(client);

    for (const issue of issues) {
      const known = existing.get(issue.key);
      // The insert returns its own id rather than the link being looked up
      // afterwards. The previous lookup relied on there being exactly one
      // unlinked Jira card at that moment — an invariant held by the order of
      // this loop, not by the query, and `now()` is identical for every row in
      // a transaction so created_at could not break the tie.
      const { cardId, outcome } = await this.cards.upsertFromJira(
        client,
        issue,
        known?.cardId ?? null,
      );
      if (outcome === 'created') counts.created += 1;
      else counts.updated += 1;

      // An issue that came back gets its own card returned to the board rather
      // than a second one created (FR-125).
      if (known?.archived) {
        await this.cards.restoreFromArchive(client, known.cardId);
        counts.restored += 1;
      }

      if (outcome === 'created') {
        await this.links.upsert(client, cardId, issue);
      } else {
        // Reconcile BEFORE refreshing the link. The link holds the *last
        // known* Jira status, which is the whole basis for deciding what
        // changed — overwriting it first makes every remote change invisible,
        // because the recorded status would already equal the new one.
        const reconciled = await this.reconcileCard(
          client,
          cardId,
          issue,
          mappings,
          openConflicts,
        );
        if (reconciled === 'conflict') counts.conflictsRaised += 1;
        await this.links.upsertMetadata(client, cardId, issue);
      }
    }

    // Anything on the board whose issue is no longer in the result has left
    // the query. Archived with a reason, never deleted (FR-122, FR-123).
    const present = new Set(issues.map((i) => i.key));
    for (const [key, { cardId, archived }] of existing) {
      if (present.has(key) || archived) continue;
      // Nothing left to disagree about once the issue is gone (FR-235).
      await this.conflicts.closeAsMoot(client, cardId);
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
