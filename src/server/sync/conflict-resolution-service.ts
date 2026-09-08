import type pg from 'pg';
import type { ConflictRepository } from '../repositories/conflict-repository.js';
import type { JiraLinkRepository } from '../repositories/jira-link-repository.js';
import type { JiraCardRepository } from '../repositories/jira-card-repository.js';
import type { MappingRepository } from '../repositories/mapping-repository.js';
import type { TransitionService } from './transition-service.js';
import { columnForJiraStatus, statusForColumn } from '../../domain/column-mapping.js';
import { cardNotFound, jiraNotConfigured, staleMapping } from '../errors.js';

/**
 * Carries out the user's choice between the two sides of a conflict.
 *
 * Exactly two outcomes, and no third. A merge would have to invent a state
 * neither side asked for, and the whole point of raising the conflict was that
 * nobody should invent anything.
 */
export class ConflictResolutionService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly conflicts: ConflictRepository,
    private readonly links: JiraLinkRepository,
    private readonly cards: JiraCardRepository,
    private readonly mappings: MappingRepository,
    private readonly transitions: TransitionService | null,
  ) {}

  async keepBoard(conflictId: number): Promise<void> {
    // Only this side needs Jira. Accepting Jira's state is a purely local
    // move, and refusing it while Jira is unreachable would leave the user
    // with a frozen card and no way to unfreeze it.
    if (!this.transitions) throw jiraNotConfigured();

    const conflict = await this.conflicts.findOpen(conflictId);
    if (!conflict) throw cardNotFound(String(conflictId));

    const link = await this.links.findByCardId(conflict.cardId);
    if (!link) throw cardNotFound(conflict.cardId);

    const mappings = await this.mappings.forDomain();
    const targetStatus = statusForColumn(mappings, conflict.boardColumnId);
    if (!targetStatus) throw staleMapping('(the board column has no mapping)');

    // Transition first. If Jira refuses, the conflict must remain open — a
    // resolution that recorded a decision Jira never accepted would leave the
    // board confident and wrong, which is the failure the conflict existed to
    // prevent (FR-233).
    await this.transitions!.moveTo(
      link.issueKey,
      targetStatus,
      conflict.jiraStatusCurrent,
    );

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.links.recordStatus(conflict.cardId, targetStatus, client);
      await this.conflicts.resolve(conflictId, 'kept_board', client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async acceptJira(conflictId: number): Promise<void> {
    const conflict = await this.conflicts.findOpen(conflictId);
    if (!conflict) throw cardNotFound(String(conflictId));

    const mappings = await this.mappings.forDomain();
    const toColumn = columnForJiraStatus(mappings, conflict.jiraStatusCurrent);
    if (toColumn === null) throw staleMapping(conflict.jiraStatusCurrent);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Attributed to sync rather than the user: the user chose to accept it,
      // but the change itself originated in Jira.
      await this.cards.moveBySync(client, conflict.cardId, toColumn);
      await this.links.recordStatus(conflict.cardId, conflict.jiraStatusCurrent, client);
      await this.conflicts.resolve(conflictId, 'accepted_jira', client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
