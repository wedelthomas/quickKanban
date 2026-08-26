/**
 * Everything this application is allowed to ask of Jira.
 *
 * Read-only on purpose: slice 2 must not write, and an interface that cannot
 * express a write is a stronger guarantee than a rule saying not to. Slice 3
 * extends this with `getTransitions` and `transitionIssue`; nothing here
 * changes when it does.
 */

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  statusId: string;
  statusName: string;
  /** Jira's own `updated`, as an ISO string. Never the local clock. */
  updatedAt: string;
  /** Browse URL for the card face. */
  url: string;
}

/**
 * One transition Jira will accept from an issue's *current* status.
 *
 * `name` and `toStatusName` are different things and routinely differ —
 * verified against real workflows: "To Development" leads to "Development",
 * "Pass" leads to "PO Approve". Mapping a column to a status therefore matches
 * `toStatusName`; matching `name` would fail on both.
 */
export interface JiraTransition {
  id: string;
  name: string;
  toStatusName: string;
  /** True when Jira will ask for fields this board does not hold. */
  requiresFields: boolean;
}

export interface JiraPort {
  /** Every issue matching the query, across all pages. */
  searchIssues(jql: string): Promise<JiraIssue[]>;

  /** Legal from the issue's status right now. Never cached — that status is
   *  exactly what is in question. */
  getTransitions(issueKey: string): Promise<JiraTransition[]>;

  /** The only write this application ever makes. */
  transitionIssue(issueKey: string, transitionId: string): Promise<void>;

  /** Every status name in the user's Jira, so a mapping is chosen not typed. */
  listStatuses(): Promise<string[]>;
}

/** Why a Jira call failed, in the terms the user is told about. */
export type JiraFailureKind =
  | 'credentials'
  | 'connectivity'
  | 'rate_limit'
  | 'malformed'
  | 'no_legal_transition'
  | 'needs_fields';

export class JiraError extends Error {
  constructor(
    readonly kind: JiraFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'JiraError';
  }
}
