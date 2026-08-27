import type { Sprint } from '../../domain/sprint-selection.js';
import type { JiraCredentials } from './credentials.js';
import type { IterationPort } from './iteration-port.js';
import { JiraError } from './jira-port.js';
import { backoffDelays } from '../../domain/backoff.js';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The iteration, from Jira's Agile endpoints.
 *
 * A different API surface from JiraAdapter's — `/rest/agile/1.0` rather than
 * `/rest/api/3` — reusing that adapter's retry, timeout and credential
 * handling rather than inventing a second policy. No new backoff, no new
 * timeout: one wrong answer about how long to wait is enough for any codebase.
 *
 * Verified against tsgjira.atlassian.net: board 1391's active sprints are
 * "CRM TradeBlazers 2026 S18" and "MDS 2026 S18", identical dates, two teams
 * sharing one board.
 */
export class IterationAdapter implements IterationPort {
  constructor(
    private readonly credentials: JiraCredentials,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
    /** Injected for the same reason JiraAdapter injects it: see that file. */
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async listActiveSprints(boardId: number): Promise<Sprint[]> {
    const url =
      `${this.credentials.baseUrl}/rest/agile/1.0/board/${encodeURIComponent(String(boardId))}` +
      `/sprint?state=active&maxResults=50`;

    let lastError: JiraError | null = null;

    for (const delay of [0, ...backoffDelays()]) {
      if (delay > 0) await this.sleep(delay);

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            Authorization: this.credentials.authorization,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        // Discards the caught error deliberately: it carries the request, and
        // the request carries the Authorization header (NFR-04).
        lastError = new JiraError(
          'connectivity',
          'The iteration source could not be reached.',
        );
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new JiraError('credentials', 'Jira rejected the configured credentials.');
      }
      if (response.status === 404) {
        // A board id that does not exist, or that this account cannot see. Not
        // retried, and not fatal: the caller falls back like any other failure.
        throw new JiraError(
          'malformed',
          `No board ${boardId} is visible to this account.`,
        );
      }
      if (response.status === 429) {
        lastError = new JiraError('rate_limit', 'Jira is rate-limiting requests.');
        const retryAfter = Number(response.headers.get('retry-after'));
        if (Number.isFinite(retryAfter) && retryAfter > 0)
          await this.sleep(retryAfter * 1000);
        continue;
      }
      if (response.status >= 500) {
        lastError = new JiraError('connectivity', `Jira returned ${response.status}.`);
        continue;
      }
      if (!response.ok) {
        throw new JiraError(
          'malformed',
          `Jira returned an unexpected status ${response.status}.`,
        );
      }

      return this.parse(await response.json().catch(() => null));
    }

    throw (
      lastError ??
      new JiraError('connectivity', 'The iteration source could not be reached.')
    );
  }

  /**
   * Sprint dates arrive as full timestamps and are reduced to calendar dates.
   *
   * The iteration is a calendar fact — which days it covers — and keeping the
   * time component would drag every comparison into the timezone question the
   * board settled in slice 4 by fixing TZ in compose.
   */
  private parse(body: unknown): Sprint[] {
    const values = (body as { values?: unknown[] } | null)?.values;
    if (!Array.isArray(values)) {
      throw new JiraError('malformed', 'The iteration source returned no sprint list.');
    }

    return values.flatMap((raw) => {
      const sprint = raw as {
        id?: unknown;
        name?: unknown;
        startDate?: unknown;
        endDate?: unknown;
      };
      if (typeof sprint.id !== 'number' || typeof sprint.name !== 'string') return [];
      return [
        {
          id: sprint.id,
          name: sprint.name,
          startsOn:
            typeof sprint.startDate === 'string' ? sprint.startDate.slice(0, 10) : null,
          endsOn: typeof sprint.endDate === 'string' ? sprint.endDate.slice(0, 10) : null,
        },
      ];
    });
  }
}
