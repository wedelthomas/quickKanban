import { JiraError, type JiraPort } from '../jira/jira-port.js';
import {
  noLegalTransition,
  staleMapping,
  transitionNeedsFields,
  jiraCredentialsRejected,
  jiraUnreachable,
  type DomainError,
} from '../errors.js';

/**
 * Called once per attempt to change something in Jira, whatever the outcome.
 *
 * A refused push otherwise leaves no server-side trace at all, which is the
 * one place to look when a user reports a move that did not take. Never given
 * the credential — only the issue, the target and what happened.
 */
export type WriteLog = (entry: {
  issueKey: string;
  targetStatus: string;
  outcome: 'transitioned' | 'already-there' | 'refused';
  reason?: string;
}) => void;

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
  constructor(
    private readonly jira: JiraPort,
    private readonly log: WriteLog = () => {},
  ) {}

  async moveTo(
    issueKey: string,
    targetStatus: string,
    currentStatus: string,
  ): Promise<TransitionOutcome> {
    if (this.sameStatus(targetStatus, currentStatus)) {
      // Already there. Asking Jira to move an issue to where it already is
      // would at best be a no-op and at worst an illegal transition.
      this.log({ issueKey, targetStatus, outcome: 'already-there' });
      return { transitioned: false, toStatus: targetStatus };
    }

    let transitions;
    try {
      transitions = await this.jira.getTransitions(issueKey);
    } catch (error) {
      const refusal = this.asDomainError(error, targetStatus);
      this.log({ issueKey, targetStatus, outcome: 'refused', reason: refusal.code });
      throw refusal;
    }

    // Matched on the DESTINATION status. A transition's own name is a
    // different thing and routinely differs: "To Development" leads to
    // "Development", "Pass" leads to "PO Approve".
    const wanted = transitions.find((t) => this.sameStatus(t.toStatusName, targetStatus));

    if (!wanted) {
      // Two different failures wear the same shape here, and the user's next
      // action differs: pick another column, or fix the mapping.
      const statusExistsSomewhere = transitions.some((t) => t.toStatusName.trim() !== '');
      const refusal = statusExistsSomewhere
        ? noLegalTransition(currentStatus, targetStatus)
        : staleMapping(targetStatus);
      this.log({ issueKey, targetStatus, outcome: 'refused', reason: refusal.code });
      throw refusal;
    }

    if (wanted.requiresFields) {
      const refusal = transitionNeedsFields(wanted.name);
      this.log({ issueKey, targetStatus, outcome: 'refused', reason: refusal.code });
      throw refusal;
    }

    try {
      await this.jira.transitionIssue(issueKey, wanted.id);
    } catch (error) {
      const refusal = this.asDomainError(error, targetStatus, wanted.name);
      this.log({ issueKey, targetStatus, outcome: 'refused', reason: refusal.code });
      throw refusal;
    }
    this.log({ issueKey, targetStatus, outcome: 'transitioned' });
    return { transitioned: true, toStatus: wanted.toStatusName };
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
      // A rejected credential is not a transient failure and waiting will not
      // fix it, so it is worth its own name even mid-drag.
      if (error.kind === 'credentials') return jiraCredentialsRejected();
      // Connectivity, rate limits and unreadable responses all mean the same
      // thing here: Jira could not be asked. None of them means the board's
      // own data store is unwell, which is what this used to report.
      return jiraUnreachable();
    }
    return jiraUnreachable();
  }
}
