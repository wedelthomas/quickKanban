import { JiraError, type JiraPort } from '../jira/jira-port.js';
import {
  noLegalTransition,
  staleMapping,
  transitionNeedsFields,
  databaseUnavailable,
  type DomainError,
} from '../errors.js';

export interface TransitionOutcome {
  transitioned: boolean;
  toStatus: string;
}

/**
 * Turns a board move into a Jira transition.
 *
 * Every refusal is a distinct, named cause. Against real workflows most moves
 * have *no* legal transition — one issue examined offered exactly two — so
 * refusal is ordinary operation here, and telling the user which of the four
 * things happened is the difference between a usable board and a mystifying
 * one.
 */
export class TransitionService {
  constructor(private readonly jira: JiraPort) {}

  async moveTo(
    issueKey: string,
    targetStatus: string,
    currentStatus: string,
  ): Promise<TransitionOutcome> {
    if (this.sameStatus(targetStatus, currentStatus)) {
      // Already there. Asking Jira to move an issue to where it already is
      // would at best be a no-op and at worst an illegal transition.
      return { transitioned: false, toStatus: targetStatus };
    }

    let transitions;
    try {
      transitions = await this.jira.getTransitions(issueKey);
    } catch (error) {
      throw this.asDomainError(error, targetStatus);
    }

    // Matched on the DESTINATION status. A transition's own name is a
    // different thing and routinely differs: "To Development" leads to
    // "Development", "Pass" leads to "PO Approve".
    const wanted = transitions.find((t) => this.sameStatus(t.toStatusName, targetStatus));

    if (!wanted) {
      // Two different failures wear the same shape here, and the user's next
      // action differs: pick another column, or fix the mapping.
      const statusExistsSomewhere = transitions.some((t) => t.toStatusName.trim() !== '');
      throw statusExistsSomewhere
        ? noLegalTransition(currentStatus, targetStatus)
        : staleMapping(targetStatus);
    }

    if (wanted.requiresFields) throw transitionNeedsFields(wanted.name);

    try {
      await this.jira.transitionIssue(issueKey, wanted.id);
    } catch (error) {
      throw this.asDomainError(error, targetStatus, wanted.name);
    }
    return { transitioned: true, toStatus: wanted.toStatusName };
  }

  /** Whether the mapped status exists in this issue's workflow at all. */
  async statusReachable(issueKey: string, statusName: string): Promise<boolean> {
    const transitions = await this.jira.getTransitions(issueKey);
    return transitions.some((t) => this.sameStatus(t.toStatusName, statusName));
  }

  private sameStatus(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  private asDomainError(
    error: unknown,
    targetStatus: string,
    transitionName?: string,
  ): DomainError {
    if (error instanceof JiraError) {
      if (error.kind === 'needs_fields')
        return transitionNeedsFields(transitionName ?? targetStatus);
      if (error.kind === 'no_legal_transition')
        return noLegalTransition('its current status', targetStatus);
      // Connectivity, credentials and rate limits all mean the same thing to
      // the user mid-drag: it could not be attempted, try again.
      return databaseUnavailable();
    }
    return databaseUnavailable();
  }
}
