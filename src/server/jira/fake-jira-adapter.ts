import {
  JiraError,
  type JiraFailureKind,
  type JiraIssue,
  type JiraPort,
  type JiraTransition,
} from './jira-port.js';

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

  /** Transitions the fake will report, keyed by issue key. */
  private transitions = new Map<string, JiraTransition[]>();
  private statuses: string[] = [
    'Open',
    'Development',
    'Test',
    'PO Approve',
    'Blocked',
    'Cancelled',
  ];
  /** Every transition actually performed, so tests can assert what was written. */
  readonly transitionsPerformed: { issueKey: string; transitionId: string }[] = [];

  /**
   * Draws a line under the writes so far so a test can assert about the writes
   * a single action made, rather than every write the setup happened to leave
   * behind. Clears nothing else — the issues and their statuses stay put.
   */
  forgetTransitionsPerformed(): void {
    this.transitionsPerformed.length = 0;
  }

  setTransitions(issueKey: string, transitions: JiraTransition[]): void {
    this.transitions.set(issueKey, transitions);
  }

  /**
   * The field names a JiraIssue carries, for tests that assert what the port
   * deliberately CANNOT express.
   *
   * Slice 5 commits to never reading sprint membership onto cards. The strongest
   * way to keep that true is for the interface to have nowhere to put it, and
   * the way to keep THAT true is a test that notices when it changes.
   */
  issueShape(): Record<string, unknown> {
    return {
      id: '',
      key: '',
      summary: '',
      statusId: '',
      statusName: '',
      updatedAt: '',
      blockedInJira: null,
      url: '',
    };
  }

  setStatuses(statuses: string[]): void {
    this.statuses = statuses;
  }

  /**
   * Permissive unless a test says otherwise: every known status is reachable.
   *
   * A fake that refuses by default would make every scenario about something
   * else fail for a reason it does not care about. Tests that are *about*
   * refusal call setTransitions explicitly and narrow it.
   */
  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    if (this.failure)
      throw new JiraError(this.failure, `fake Jira failing: ${this.failure}`);
    return this.legalTransitions(issueKey);
  }

  /**
   * The single source of what this fake considers legal.
   *
   * Both getTransitions and transitionIssue read it. They diverged once —
   * getTransitions generated defaults on the fly while transitionIssue looked
   * up a map that was never populated, so every transition it advertised was
   * then rejected. A fake that lies about itself is worse than no fake.
   */
  private legalTransitions(issueKey: string): JiraTransition[] {
    const staged = this.transitions.get(issueKey);
    if (staged) return staged;

    const current = this.issues.find((i) => i.key === issueKey)?.statusName;
    return this.statuses
      .filter((name) => name !== current)
      .map((name, i) => ({
        id: String(100 + i),
        // Named unlike its destination on purpose: real workflows do this
        // routinely, and a fake that named them identically would hide code
        // that wrongly matches on the transition's own name.
        name: `To ${name}`,
        toStatusName: name,
        requiresFields: false,
      }));
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    if (this.failure)
      throw new JiraError(this.failure, `fake Jira failing: ${this.failure}`);
    const legal = this.legalTransitions(issueKey).find((t) => t.id === transitionId);
    if (!legal) throw new JiraError('no_legal_transition', 'no such transition');
    if (legal.requiresFields)
      throw new JiraError('needs_fields', 'transition wants fields');

    this.transitionsPerformed.push({ issueKey, transitionId });
    // The issue really moves, so a later sync observes the new status exactly
    // as it would against real Jira.
    this.issues = this.issues.map((i) =>
      i.key === issueKey ? { ...i, statusName: legal.toStatusName } : i,
    );
  }

  async listStatuses(): Promise<string[]> {
    return [...this.statuses];
  }

  currentIssues(): JiraIssue[] {
    return [...this.issues];
  }

  failWith(kind: JiraFailureKind | null): void {
    this.failure = kind;
  }

  /** Which issues Jira reports as blocked, staged by key. */
  private blockedKeys = new Set<string>();

  setBlockedInJira(key: string, blocked: boolean): void {
    if (blocked) this.blockedKeys.add(key);
    else this.blockedKeys.delete(key);
  }

  async searchIssues(
    jql: string,
    blocked?: { field: string; option: string },
  ): Promise<JiraIssue[]> {
    this.callCount += 1;
    this.queries.push(jql);
    if (this.failure) {
      throw new JiraError(this.failure, `fake Jira configured to fail: ${this.failure}`);
    }
    // Null when the caller did not ask, exactly as the real adapter behaves:
    // "not requested" and "requested and not set" are different facts.
    return this.issues.map((issue) => ({
      ...issue,
      blockedInJira: blocked ? this.blockedKeys.has(issue.key) : null,
    }));
  }
}

export const anIssue = (over: Partial<JiraIssue> & { key: string }): JiraIssue => ({
  id: over.id ?? (over.key.replace(/\D/g, '') || '1'),
  summary: over.summary ?? `Summary for ${over.key}`,
  statusId: over.statusId ?? '10000',
  statusName: over.statusName ?? 'Open',
  updatedAt: over.updatedAt ?? '2026-08-26T10:00:00.000Z',
  url: over.url ?? `https://yourcompany.atlassian.net/browse/${over.key}`,
  key: over.key,
  blockedInJira: over.blockedInJira ?? null,
});
