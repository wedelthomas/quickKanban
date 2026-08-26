import { JiraError, type JiraIssue, type JiraPort } from './jira-port.js';
import type { JiraCredentials } from './credentials.js';
import { backoffDelays } from '../../domain/backoff.js';

const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 10_000;

interface Page {
  issues: JiraIssue[];
  nextPageToken: string | null;
  isLast: boolean;
}

interface RawIssue {
  id?: unknown;
  key?: unknown;
  fields?: {
    summary?: unknown;
    updated?: unknown;
    status?: { id?: unknown; name?: unknown };
  };
}

/**
 * Jira Cloud REST, read only.
 *
 * There is no request in this file that is not a GET, and there is no method
 * on the port that could express a write. A unit test asserts both, because
 * "we agreed not to" is not a guarantee.
 *
 * Errors never carry the request, the headers or the credential. The usual way
 * a token leaks is not a log statement someone wrote on purpose; it is an
 * error object that happened to carry the request that produced it.
 */
export class JiraAdapter implements JiraPort {
  constructor(
    private readonly credentials: JiraCredentials,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
    /**
     * Injected so contract tests can substitute an intercepted client.
     *
     * Not a nicety: Node's built-in `fetch` uses its own bundled undici, which
     * `setGlobalDispatcher` from the standalone package does not affect. A
     * contract test that relies on that silently talks to the real internet
     * instead — which NFR-23 forbids and which is exactly what happened before
     * this seam existed.
     */
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async searchIssues(jql: string): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    let pageToken: string | null = null;

    // Paginate to exhaustion: FR-109 requires every matching issue, not the
    // first page. The endpoint pages by opaque token rather than offset, so
    // there is no total to compare against — `isLast` is the only signal.
    for (;;) {
      const page: Page = await this.fetchPage(jql, pageToken);
      issues.push(...page.issues);
      if (page.isLast || !page.nextPageToken) break;
      pageToken = page.nextPageToken;
    }
    return issues;
  }

  private async fetchPage(jql: string, pageToken: string | null): Promise<Page> {
    // /rest/api/3/search was removed by Atlassian and now answers 410 Gone.
    // This is its replacement; `fields` is required, because the endpoint
    // returns bare ids without it.
    const url =
      `${this.credentials.baseUrl}/rest/api/3/search/jql` +
      `?jql=${encodeURIComponent(jql)}` +
      `&maxResults=${PAGE_SIZE}` +
      `&fields=summary,status,updated` +
      (pageToken ? `&nextPageToken=${encodeURIComponent(pageToken)}` : '');

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
        // Deliberately discards the caught error: it carries the request, and
        // the request carries the Authorization header.
        lastError = new JiraError('connectivity', 'Jira could not be reached.');
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        // Not retried: a rejected credential will be rejected again.
        throw new JiraError('credentials', 'Jira rejected the configured credentials.');
      }
      if (response.status === 429) {
        lastError = new JiraError('rate_limit', 'Jira is rate-limiting requests.');
        const retryAfter = Number(response.headers.get('retry-after'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) await this.sleep(retryAfter * 1000);
        continue;
      }
      if (response.status >= 500) {
        lastError = new JiraError('connectivity', `Jira returned ${response.status}.`);
        continue;
      }
      if (!response.ok) {
        throw new JiraError('malformed', `Jira returned an unexpected status ${response.status}.`);
      }

      return this.parse(await response.json().catch(() => null));
    }

    throw lastError ?? new JiraError('connectivity', 'Jira could not be reached.');
  }

  private parse(body: unknown): Page {
    const payload = body as
      | { issues?: unknown; nextPageToken?: unknown; isLast?: unknown }
      | null;
    if (!payload || !Array.isArray(payload.issues)) {
      throw new JiraError('malformed', 'Jira returned a response this board could not read.');
    }

    const issues = (payload.issues as RawIssue[]).map((raw) => {
      const key = typeof raw.key === 'string' ? raw.key : null;
      const updated = typeof raw.fields?.updated === 'string' ? raw.fields.updated : null;
      if (!key || !updated) {
        throw new JiraError('malformed', 'A Jira issue arrived without a key or update time.');
      }
      return {
        id: String(raw.id ?? key),
        key,
        summary: typeof raw.fields?.summary === 'string' ? raw.fields.summary : key,
        statusId: String(raw.fields?.status?.id ?? ''),
        statusName: String(raw.fields?.status?.name ?? 'Unknown'),
        updatedAt: new Date(updated).toISOString(),
        url: `${this.credentials.baseUrl}/browse/${key}`,
      };
    });

    return {
      issues,
      nextPageToken: typeof payload.nextPageToken === 'string' ? payload.nextPageToken : null,
      // Absent `isLast` with no token means this was the only page.
      isLast: payload.isLast === true || typeof payload.nextPageToken !== 'string',
    };
  }
}
