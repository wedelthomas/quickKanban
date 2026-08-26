import { JiraError, type JiraFailureKind, type JiraIssue, type JiraPort } from './jira-port.js';

/**
 * Drives the acceptance suite. Every scenario stages issues and failures here
 * rather than against a live Jira, which NFR-23 forbids outright — a suite
 * that talks to real Jira is non-deterministic, needs the network, and can
 * mutate a real backlog.
 */
export class FakeJiraAdapter implements JiraPort {
  private issues: JiraIssue[] = [];
  private failure: JiraFailureKind | null = null;
  /** Every query this adapter was asked, so tests can assert the JQL used. */
  readonly queries: string[] = [];
  callCount = 0;

  setIssues(issues: JiraIssue[]): void {
    this.issues = issues;
  }

  currentIssues(): JiraIssue[] {
    return [...this.issues];
  }

  failWith(kind: JiraFailureKind | null): void {
    this.failure = kind;
  }

  async searchIssues(jql: string): Promise<JiraIssue[]> {
    this.callCount += 1;
    this.queries.push(jql);
    if (this.failure) {
      throw new JiraError(this.failure, `fake Jira configured to fail: ${this.failure}`);
    }
    return [...this.issues];
  }
}

export const anIssue = (over: Partial<JiraIssue> & { key: string }): JiraIssue => ({
  id: over.id ?? (over.key.replace(/\D/g, '') || '1'),
  summary: over.summary ?? `Summary for ${over.key}`,
  statusId: over.statusId ?? '10000',
  statusName: over.statusName ?? 'To Do',
  updatedAt: over.updatedAt ?? '2026-08-26T10:00:00.000Z',
  url: over.url ?? `https://tsgjira.atlassian.net/browse/${over.key}`,
  key: over.key,
});
