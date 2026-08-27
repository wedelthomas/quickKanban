import {
  JiraError,
  type JiraIssue,
  type JiraPort,
  type JiraTransition,
} from './jira-port.js';
import type { JiraCredentials } from './credentials.js';
import { backoffDelays } from '../../domain/backoff.js';

const PAGE_SIZE = 100;

/**
 * Whether Jira's blocked field is set on an issue.
 *
 * The field is a MULTI-CHECKBOX, not a boolean — verified against
 * tsgjira.atlassian.net, where customfield_10003 "Blocked Issue" holds an array
 * whose single option is "Blocked". So "blocked" means the configured option
 * appears in the array. An absent field, an empty array, and an array without
 * the option all mean not blocked, and none of them is an error: most issues
 * simply are not blocked.
 */
const readBlocked = (
  fields: Record<string, unknown> | undefined,
  blocked: { field: string; option: string },
): boolean => {
  const raw = fields?.[blocked.field];
  if (!Array.isArray(raw)) return false;
  const wanted = blocked.option.trim().toLowerCase();
  return raw.some((entry) => {
    const value = (entry as { value?: unknown })?.value;
    return typeof value === 'string' && value.trim().toLowerCase() === wanted;
  });
};
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
    // The blocked field's name is configuration, so it cannot be declared here.
    [customField: string]: unknown;
  };
}

/**
 * Jira Cloud REST.
 *
 * Reads anything the query returns; writes exactly one thing — an issue's
 * status, by posting a transition id and nothing else. There is no request in
 * this file that touches any other field, and no method on the port that could
 * express one. A unit test asserts it, because "we agreed not to" is not a
 * guarantee.
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

  async searchIssues(
    jql: string,
    blocked?: { field: string; option: string },
  ): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    let pageToken: string | null = null;

    // Paginate to exhaustion: FR-109 requires every matching issue, not the
    // first page. The endpoint pages by opaque token rather than offset, so
    // there is no total to compare against — `isLast` is the only signal.
    for (;;) {
      const page: Page = await this.fetchPage(jql, pageToken, blocked);
      issues.push(...page.issues);
      if (page.isLast || !page.nextPageToken) break;
      pageToken = page.nextPageToken;
    }
    return issues;
  }

  /**
   * Read fresh every time. Which transitions are legal depends on the issue's
   * current status, which is precisely the thing a sync is uncertain about —
   * a cached list would be answering yesterday's question.
   */
  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const url =
      `${this.credentials.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}` +
      `/transitions?expand=transitions.fields`;
    const body = await this.get(url);
    const raw = (body as { transitions?: unknown }).transitions;
    if (!Array.isArray(raw)) {
      throw new JiraError('malformed', 'Jira returned an unreadable transition list.');
    }

    return raw.map((t) => {
      const transition = t as {
        id?: unknown;
        name?: unknown;
        to?: { name?: unknown };
        fields?: Record<string, { required?: boolean }>;
      };
      return {
        id: String(transition.id ?? ''),
        name: String(transition.name ?? ''),
        // The destination status, not the transition's own name. These differ
        // routinely: "To Development" leads to "Development", "Pass" to
        // "PO Approve".
        toStatusName: String(transition.to?.name ?? ''),
        requiresFields: Object.values(transition.fields ?? {}).some(
          (f) => f?.required === true,
        ),
      };
    });
  }

  /**
   * The only write this application makes.
   *
   * Deliberately not retried. A failed write may or may not have applied — a
   * timeout says nothing either way — and Jira offers no idempotency key for a
   * transition, so a retry risks a second move the user never asked for. The
   * next sync observes the truth instead.
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    const url = `${this.credentials.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: this.credentials.authorization,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        // Only the transition id. No field is sent, so no field but status can
        // change (FR-209).
        body: JSON.stringify({ transition: { id: transitionId } }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new JiraError('connectivity', 'Jira could not be reached.');
    }

    if (response.status === 204 || response.ok) return;
    if (response.status === 401 || response.status === 403) {
      throw new JiraError('credentials', 'Jira rejected the configured credentials.');
    }
    if (response.status === 400) {
      // Jira answers 400 both for an illegal transition and for one whose
      // screen wants fields. The caller has already checked legality, so a 400
      // here means the screen.
      throw new JiraError('needs_fields', 'Jira asked for more than a status change.');
    }
    throw new JiraError(
      'malformed',
      `Jira returned an unexpected status ${response.status}.`,
    );
  }

  async listStatuses(): Promise<string[]> {
    const body = await this.get(`${this.credentials.baseUrl}/rest/api/3/status`);
    if (!Array.isArray(body)) {
      throw new JiraError('malformed', 'Jira returned an unreadable status list.');
    }
    const names = body
      .map((s) => String((s as { name?: unknown }).name ?? ''))
      .filter(Boolean);
    return [...new Set(names)].sort();
  }

  /** A GET that shares the read path's failure mapping, without its pagination. */
  private async get(url: string): Promise<unknown> {
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
      throw new JiraError('connectivity', 'Jira could not be reached.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new JiraError('credentials', 'Jira rejected the configured credentials.');
    }
    if (!response.ok) {
      throw new JiraError(
        'malformed',
        `Jira returned an unexpected status ${response.status}.`,
      );
    }
    return response.json().catch(() => null);
  }

  private async fetchPage(
    jql: string,
    pageToken: string | null,
    blocked?: { field: string; option: string },
  ): Promise<Page> {
    // /rest/api/3/search was removed by Atlassian and now answers 410 Gone.
    // This is its replacement; `fields` is required, because the endpoint
    // returns bare ids without it.
    const url =
      `${this.credentials.baseUrl}/rest/api/3/search/jql` +
      `?jql=${encodeURIComponent(jql)}` +
      `&maxResults=${PAGE_SIZE}` +
      // The blocked field is requested only when configured. Asking for a
      // field this Jira does not have is not an error — Jira omits it — but not
      // asking keeps the payload honest about what was actually wanted.
      `&fields=summary,status,updated${blocked ? `,${blocked.field}` : ''}` +
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

      return this.parse(await response.json().catch(() => null), blocked);
    }

    throw lastError ?? new JiraError('connectivity', 'Jira could not be reached.');
  }

  private parse(body: unknown, blocked?: { field: string; option: string }): Page {
    const payload = body as {
      issues?: unknown;
      nextPageToken?: unknown;
      isLast?: unknown;
    } | null;
    if (!payload || !Array.isArray(payload.issues)) {
      throw new JiraError(
        'malformed',
        'Jira returned a response this board could not read.',
      );
    }

    const issues = (payload.issues as RawIssue[]).map((raw) => {
      const key = typeof raw.key === 'string' ? raw.key : null;
      const updated = typeof raw.fields?.updated === 'string' ? raw.fields.updated : null;
      if (!key || !updated) {
        throw new JiraError(
          'malformed',
          'A Jira issue arrived without a key or update time.',
        );
      }
      return {
        id: String(raw.id ?? key),
        key,
        summary: typeof raw.fields?.summary === 'string' ? raw.fields.summary : key,
        statusId: String(raw.fields?.status?.id ?? ''),
        statusName: String(raw.fields?.status?.name ?? 'Unknown'),
        updatedAt: new Date(updated).toISOString(),
        url: `${this.credentials.baseUrl}/browse/${key}`,
        blockedInJira: blocked ? readBlocked(raw.fields, blocked) : null,
      };
    });

    return {
      issues,
      nextPageToken:
        typeof payload.nextPageToken === 'string' ? payload.nextPageToken : null,
      // Absent `isLast` with no token means this was the only page.
      isLast: payload.isLast === true || typeof payload.nextPageToken !== 'string',
    };
  }
}
