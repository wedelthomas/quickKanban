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

export interface JiraPort {
  /** Every issue matching the query, across all pages. */
  searchIssues(jql: string): Promise<JiraIssue[]>;
}

/** Why a Jira call failed, in the terms the user is told about. */
export type JiraFailureKind = 'credentials' | 'connectivity' | 'rate_limit' | 'malformed';

export class JiraError extends Error {
  constructor(
    readonly kind: JiraFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'JiraError';
  }
}
