import type { Card } from '../../shared/types.js';
import type {
  CreateCardInput,
  MoveCardInput,
  UpdateCardInput,
} from '../../domain/validation.js';
import type { CardRepository } from '../repositories/card-repository.js';
import {
  cardConflicted,
  cardNotFound,
  columnNotFound,
  columnRetired,
  deleteForbiddenNonLocal,
  editForbiddenJiraOwned,
  validationFailed,
} from '../errors.js';
import type { TransitionService } from '../sync/transition-service.js';
import type { MappingRepository } from '../repositories/mapping-repository.js';
import type { JiraLinkRepository } from '../repositories/jira-link-repository.js';
import type { ConflictRepository } from '../repositories/conflict-repository.js';
import type { SettingsRepository } from '../repositories/settings-repository.js';
import { statusForColumn } from '../../domain/column-mapping.js';

/** What cancelling told (or did not tell) Jira, and how it went (contracts/api.md). */
export interface CancelJiraOutcome {
  attempted: boolean;
  transitioned: boolean;
  toStatus?: string;
  message: string;
}

export class CardService {
  constructor(
    private readonly cards: CardRepository,
    /**
     * Not part of the Jira bundle below, deliberately. A conflict outlives the
     * connection that produced it: freezing the card only while Jira happens
     * to be configured would let an unreachable Jira quietly unfreeze every
     * disagreement the board had already recorded.
     */
    private readonly conflicts: ConflictRepository,
    private readonly now: () => Date = () => new Date(),
    /** Absent when Jira is not configured; the board then behaves as slice 2. */
    private readonly jira?: {
      transitions: TransitionService;
      mappings: MappingRepository;
      links: JiraLinkRepository;
      settings: SettingsRepository;
    },
  ) {}

  async create(input: CreateCardInput): Promise<Card> {
    return this.cards.create(input, this.now());
  }

  async update(id: string, input: UpdateCardInput): Promise<Card> {
    const result = await this.cards.update(id, input, this.now());
    if (result === 'not-found') throw cardNotFound(id);
    // The title comes from Jira and changes there, not here (FR-121). The
    // card's own fields — priority, due date, tags — remain the user's.
    if (result === 'jira-owned') throw editForbiddenJiraOwned('The title');
    return result;
  }

  async delete(id: string): Promise<void> {
    const outcome = await this.cards.softDelete(id);
    if (outcome === 'not-found') throw cardNotFound(id);
    if (outcome === 'not-local') throw deleteForbiddenNonLocal();
  }

  /**
   * Cancels a card. A conflicted card is frozen against this the same as it
   * is against a move (FR-609) — checked first, and regardless of Jira, for
   * the exact reason `move()`'s own check is checked first.
   *
   * The local cancellation always applies before Jira is ever contacted,
   * and its result never depends on what Jira says (R-4) — the opposite
   * order from `move()`'s "Jira first", and deliberately so: a refused
   * *move* leaves the card exactly where it was; a refused *cancellation*
   * must not leave the user's decision undone by a network problem that has
   * nothing to do with whether the work is still wanted (FR-613..FR-615,
   * FR-640).
   */
  async cancel(id: string, reason: string): Promise<{ card: Card; jira?: CancelJiraOutcome }> {
    if (reason.trim() === '') {
      throw validationFailed('A cancellation reason is required.');
    }
    if (await this.conflicts.hasOpen(id)) throw cardConflicted();

    const outcome = await this.cards.cancel(id, { reason: reason.trim(), now: this.now() });
    if (outcome === 'not-found') throw cardNotFound(id);
    if (outcome === 'already-archived') {
      throw validationFailed(
        'This card has already left the board and cannot be cancelled.',
      );
    }

    // Already cancelled: no additional effect (FR-610) — a second
    // cancellation must not re-attempt the Jira transition either.
    if (outcome.alreadyCancelled) return { card: outcome.card };

    const jira = await this.attemptJiraCancellation(id);
    return { card: outcome.card, ...(jira ? { jira } : {}) };
  }

  /**
   * Restores a cancelled card. Never contacts Jira (FR-632) — any
   * disagreement that leaves is exactly what `cancellationDivergesFromJira`
   * surfaces on the restored card (R-5).
   */
  async restore(id: string): Promise<{ card: Card }> {
    const outcome = await this.cards.restore(id, { now: this.now() });
    if (outcome === 'not-found') throw cardNotFound(id);
    if (outcome === 'not-cancelled') {
      throw validationFailed('This card is not cancelled, so there is nothing to restore.');
    }
    return outcome;
  }

  /**
   * Best-effort only — every branch here returns rather than throws, since
   * by the time this runs the local cancellation has already succeeded and
   * nothing about Jira may undo that.
   */
  private async attemptJiraCancellation(
    cardId: string,
  ): Promise<CancelJiraOutcome | undefined> {
    if (!this.jira) return undefined;

    const link = await this.jira.links.findByCardId(cardId);
    if (!link) return undefined; // a local card: Jira is never told (FR-616)

    const settings = await this.jira.settings.read();
    if (!settings.jiraEnabled) {
      return {
        attempted: false,
        transitioned: false,
        message: 'Nothing was sent — Jira integration is off.',
      };
    }
    if (!settings.cancellationStatus) {
      return {
        attempted: false,
        transitioned: false,
        message: 'Nothing was sent — no cancellation status is configured.',
      };
    }

    try {
      const outcome = await this.jira.transitions.moveTo(
        link.issueKey,
        settings.cancellationStatus,
        link.statusName,
      );
      if (outcome.transitioned) {
        // Record what Jira now says, so the next sync sees no difference
        // and does not mistake our own change for someone else's.
        await this.jira.links.recordStatus(cardId, outcome.toStatus);
      }
      return {
        attempted: true,
        transitioned: outcome.transitioned,
        toStatus: outcome.toStatus,
        message: outcome.transitioned
          ? `${link.issueKey} moved to ${outcome.toStatus}.`
          : `${link.issueKey} was already in ${outcome.toStatus}.`,
      };
    } catch (error) {
      // Every DomainError TransitionService throws already carries a
      // human-readable cause (needs-fields, no-legal-transition,
      // credentials, unreachable) — that message IS the "refusal reported
      // with its cause" FR-614 and FR-615 ask for.
      return {
        attempted: true,
        transitioned: false,
        message: error instanceof Error ? error.message : 'Jira could not be reached.',
      };
    }
  }

  async move(
    id: string,
    input: MoveCardInput,
  ): Promise<{
    card: Card;
    moved: boolean;
    jira?: { transitioned: boolean; toStatus: string };
  }> {
    // Checked before anything else, and regardless of Jira: a conflicted card
    // is frozen against the user too, not only against sync. Dragging it would
    // otherwise let someone paper over a disagreement without ever learning
    // Jira had one (FR-228).
    //
    // This stays FIRST. Slice 5 briefly put the column check ahead of it, which
    // made a conflicted card report the column error instead of the freeze —
    // redefining slice 3's contract as a side effect of an unrelated change.
    if (await this.conflicts.hasOpen(id)) throw cardConflicted();

    // Then the target column. Verified against the running board before this
    // guard existed: a move into the retired Blocked column answered 200 and
    // the card disappeared, because the board query excludes retired columns
    // while the move path did not know they existed (FR-402).
    await this.assertColumnAcceptsCards(input.toColumnId);

    const jiraOutcome = await this.pushToJiraFirst(id, input.toColumnId);

    const result = await this.cards.move(id, input, this.now());
    if (!result) throw cardNotFound(id);
    return {
      card: result.card,
      moved: result.moved,
      ...(jiraOutcome ? { jira: jiraOutcome } : {}),
    };
  }

  /**
   * A column may receive cards only if it exists and is not retired.
   *
   * Retirement is not deletion: the row survives so that the movement history
   * still resolves (FR-446), which is exactly why it is still reachable by id
   * and has to be refused explicitly.
   */
  private async assertColumnAcceptsCards(columnId: number): Promise<void> {
    const state = await this.cards.columnState(columnId);
    if (state === 'absent') throw columnNotFound(columnId);
    if (state === 'retired') throw columnRetired(columnId);
  }

  /**
   * Transitions Jira *before* the card moves on the board.
   *
   * Deliberately this order. If the transition is refused the local move never
   * happens, so there is no half-applied state to unwind — and unwinding is
   * exactly the code that only runs after something has already gone wrong,
   * which makes it the least-exercised code in any system.
   */
  private async pushToJiraFirst(
    cardId: string,
    toColumnId: number,
  ): Promise<{ transitioned: boolean; toStatus: string } | null> {
    if (!this.jira) return null;
    if (!(await this.jira.settings.read()).jiraEnabled) return null;

    const link = await this.jira.links.findByCardId(cardId);
    if (!link) return null; // an ad-hoc card: Jira is never told (FR-208)

    const mappings = await this.jira.mappings.forDomain();
    const targetStatus = statusForColumn(mappings, toColumnId);
    // An unmapped column is local-only: the board changes, Jira is untouched.
    if (!targetStatus) return null;

    const outcome = await this.jira.transitions.moveTo(
      link.issueKey,
      targetStatus,
      link.statusName,
    );
    if (outcome.transitioned) {
      // Record what Jira now says, so the next sync sees no difference and
      // does not mistake our own change for someone else's.
      await this.jira.links.recordStatus(cardId, outcome.toStatus);
    }
    return outcome;
  }
}
