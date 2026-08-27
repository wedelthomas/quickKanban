import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockAgent, fetch as undiciFetch } from 'undici';
import { JiraAdapter } from '../../src/server/jira/jira-adapter.js';
import { JiraError } from '../../src/server/jira/jira-port.js';
import type { JiraCredentials } from '../../src/server/jira/credentials.js';

/**
 * The real adapter against recorded Jira response shapes.
 *
 * These are the shapes tsgjira.atlassian.net actually returns, captured on
 * 2026-08-26 — not invented ones. The distinction matters: the endpoint this
 * adapter was first written against, /rest/api/3/search, has been removed by
 * Atlassian and answers 410 Gone. Fixtures copied from documentation would
 * have kept passing while the adapter talked to an endpoint that no longer
 * exists.
 *
 * Nothing here reaches the network (NFR-23).
 */
const BASE = 'https://example.atlassian.net';
const credentials: JiraCredentials = {
  baseUrl: BASE,
  authorization: 'Basic dGVzdDp0ZXN0',
};

const issue = (key: string, status = 'Open') => ({
  id: '234377',
  key,
  fields: {
    summary: `Summary for ${key}`,
    status: { id: '10000', name: status, statusCategory: { key: 'new' } },
    updated: '2026-08-20T09:30:00.000+0000',
  },
});

describe('JiraAdapter against recorded Jira responses', () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    // Any request that escapes the mock is a bug in the test, not a fallback.
    agent.disableNetConnect();
  });

  afterEach(async () => {
    await agent.close();
  });

  // undici's own fetch, bound to the mock agent. Node's global fetch uses a
  // different bundled undici and would ignore this entirely — a test that
  // assumes otherwise talks to the real internet without saying so.
  const adapter = () =>
    new JiraAdapter(credentials, async () => {}, ((input, init) =>
      undiciFetch(
        input as string,
        { ...init, dispatcher: agent } as never,
      )) as typeof fetch);

  it('parses a single page into issues', async () => {
    agent
      .get(BASE)
      .intercept({ path: (p) => p.startsWith('/rest/api/3/search/jql'), method: 'GET' })
      .reply(200, { issues: [issue('AIHUB-1')], isLast: true });

    const issues = await adapter().searchIssues('assignee = currentUser()');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      key: 'AIHUB-1',
      summary: 'Summary for AIHUB-1',
      statusName: 'Open',
      url: `${BASE}/browse/AIHUB-1`,
    });
    // Jira's own timestamp, normalised but not replaced by the local clock.
    expect(issues[0]!.updatedAt).toBe('2026-08-20T09:30:00.000Z');
  });

  it('follows nextPageToken to exhaustion', async () => {
    const pool = agent.get(BASE);
    pool
      .intercept({
        path: (p) => p.includes('/search/jql') && !p.includes('nextPageToken'),
      })
      .reply(200, {
        issues: [issue('AIHUB-1')],
        nextPageToken: 'token-2',
        isLast: false,
      });
    pool
      .intercept({ path: (p) => p.includes('nextPageToken=token-2') })
      .reply(200, { issues: [issue('AIHUB-2')], isLast: true });

    const issues = await adapter().searchIssues('assignee = currentUser()');
    expect(issues.map((i) => i.key)).toEqual(['AIHUB-1', 'AIHUB-2']);
  });

  it('reports a rejected credential as credentials, and does not retry it', async () => {
    // A rejected credential will be rejected again; retrying only delays the
    // report and burns rate limit.
    agent
      .get(BASE)
      .intercept({ path: (p) => p.includes('/search/jql') })
      .reply(401, {
        errorMessages: ['Client must be authenticated to access this resource.'],
      });

    await expect(adapter().searchIssues('x')).rejects.toMatchObject({
      kind: 'credentials',
    });
  });

  it('reports 403 as credentials too', async () => {
    agent
      .get(BASE)
      .intercept({ path: (p) => p.includes('/search/jql') })
      .reply(403, {});
    await expect(adapter().searchIssues('x')).rejects.toMatchObject({
      kind: 'credentials',
    });
  });

  it('retries a rate limit and succeeds if it clears', async () => {
    const pool = agent.get(BASE);
    pool.intercept({ path: (p) => p.includes('/search/jql') }).reply(
      429,
      {},
      {
        headers: { 'retry-after': '1' },
      },
    );
    pool
      .intercept({ path: (p) => p.includes('/search/jql') })
      .reply(200, { issues: [issue('AIHUB-1')], isLast: true });

    const issues = await adapter().searchIssues('x');
    expect(issues).toHaveLength(1);
  });

  it('gives up on a persistent rate limit rather than retrying forever', async () => {
    const pool = agent.get(BASE);
    for (let i = 0; i < 6; i++) {
      pool.intercept({ path: (p) => p.includes('/search/jql') }).reply(429, {});
    }
    await expect(adapter().searchIssues('x')).rejects.toMatchObject({
      kind: 'rate_limit',
    });
  });

  it('retries a 500 and succeeds if it clears', async () => {
    const pool = agent.get(BASE);
    pool.intercept({ path: (p) => p.includes('/search/jql') }).reply(500, 'boom');
    pool
      .intercept({ path: (p) => p.includes('/search/jql') })
      .reply(200, { issues: [], isLast: true });

    await expect(adapter().searchIssues('x')).resolves.toEqual([]);
  });

  it('reports the removed endpoint as malformed rather than pretending success', async () => {
    // The exact response /rest/api/3/search now returns. Recorded because a
    // future migration could reintroduce this failure silently.
    agent
      .get(BASE)
      .intercept({ path: (p) => p.includes('/search/jql') })
      .reply(410, {
        errorMessages: [
          'The requested API has been removed. Please migrate to the /rest/api/3/search/jql API.',
        ],
      });
    await expect(adapter().searchIssues('x')).rejects.toMatchObject({
      kind: 'malformed',
    });
  });

  it('refuses a body without an issues array', async () => {
    agent
      .get(BASE)
      .intercept({ path: (p) => p.includes('/search/jql') })
      .reply(200, { total: 3 });
    await expect(adapter().searchIssues('x')).rejects.toMatchObject({
      kind: 'malformed',
    });
  });

  it('refuses an issue missing its key or update time', async () => {
    agent
      .get(BASE)
      .intercept({ path: (p) => p.includes('/search/jql') })
      .reply(200, { issues: [{ id: '1', fields: { summary: 'no key' } }], isLast: true });
    await expect(adapter().searchIssues('x')).rejects.toBeInstanceOf(JiraError);
  });

  it('sends the credential as an Authorization header and asks only for the fields it needs', async () => {
    let seenPath = '';
    let seenAuth: string | undefined;
    agent
      .get(BASE)
      .intercept({ path: (p) => p.includes('/search/jql'), method: 'GET' })
      .reply((opts) => {
        seenPath = String(opts.path);
        // Header names are normalised by the client, so look them up
        // case-insensitively rather than assuming the casing we sent.
        const headers = (opts.headers ?? {}) as Record<string, string>;
        seenAuth = Object.entries(headers).find(
          ([name]) => name.toLowerCase() === 'authorization',
        )?.[1];
        return { statusCode: 200, data: { issues: [], isLast: true } };
      });

    await adapter().searchIssues('assignee = currentUser()');
    expect(seenAuth).toBe(credentials.authorization);
    // Literal commas: valid in a query value, and what Jira expects. The
    // adapter asks for exactly three fields, because the endpoint returns bare
    // ids without them.
    expect(seenPath).toContain('fields=summary,status,updated');
    expect(seenPath).toContain('jql=assignee%20%3D%20currentUser()');
  });
});

/**
 * The write side, against the shapes tsgjira.atlassian.net returned on
 * 2026-08-26 for ABSARCH-44. Two facts here were discovered by asking real
 * Jira and would not have been guessed from documentation: a transition's name
 * is not its destination status, and the legal set is narrow and depends on
 * where the issue currently sits.
 *
 * Nothing here reaches the network (NFR-23).
 */
describe('JiraAdapter transitions against recorded Jira responses', () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
  });

  afterEach(async () => {
    await agent.close();
  });

  const adapter = () =>
    new JiraAdapter(credentials, async () => {}, ((input, init) =>
      undiciFetch(
        input as string,
        { ...init, dispatcher: agent } as never,
      )) as typeof fetch);

  it('reads a transition by its destination status, not by its own name', async () => {
    agent
      .get(BASE)
      .intercept({
        path: /\/rest\/api\/3\/issue\/ABSARCH-44\/transitions/,
        method: 'GET',
      })
      .reply(200, {
        expand: 'transitions',
        transitions: [
          {
            id: '11',
            name: 'To Development',
            to: { id: '3', name: 'Development' },
            fields: {},
          },
          { id: '41', name: 'Pass', to: { id: '10001', name: 'PO Approve' }, fields: {} },
        ],
      });

    const transitions = await adapter().getTransitions('ABSARCH-44');

    expect(transitions).toEqual([
      {
        id: '11',
        name: 'To Development',
        toStatusName: 'Development',
        requiresFields: false,
      },
      { id: '41', name: 'Pass', toStatusName: 'PO Approve', requiresFields: false },
    ]);
  });

  it('marks a transition that demands a field, so it can be refused rather than half-attempted', async () => {
    agent
      .get(BASE)
      .intercept({
        path: /\/rest\/api\/3\/issue\/ABSARCH-44\/transitions/,
        method: 'GET',
      })
      .reply(200, {
        transitions: [
          {
            id: '51',
            name: 'Close',
            to: { name: 'Closed' },
            fields: { resolution: { required: true }, comment: { required: false } },
          },
        ],
      });

    const [transition] = await adapter().getTransitions('ABSARCH-44');
    expect(transition?.requiresFields).toBe(true);
  });

  it('sends only the transition id, so no field but status can change', async () => {
    let sentBody: string | undefined;
    agent
      .get(BASE)
      .intercept({ path: '/rest/api/3/issue/ABSARCH-44/transitions', method: 'POST' })
      .reply(204, (options) => {
        sentBody = options.body as string;
        return '';
      });

    await adapter().transitionIssue('ABSARCH-44', '11');

    // The whole of FR-209 in one assertion: an extra key here would be a field
    // this board silently overwrote in someone else's issue.
    expect(JSON.parse(sentBody ?? '{}')).toEqual({ transition: { id: '11' } });
  });

  it('reports a refused transition as malformed rather than reporting success', async () => {
    agent
      .get(BASE)
      .intercept({ path: '/rest/api/3/issue/ABSARCH-44/transitions', method: 'POST' })
      .reply(400, {
        errorMessages: ['Transition id 999 is not valid for this issue.'],
        errors: {},
      });

    await expect(adapter().transitionIssue('ABSARCH-44', '999')).rejects.toBeInstanceOf(
      JiraError,
    );
  });

  it('reads the status list, de-duplicated, for the column mapping to choose from', async () => {
    agent
      .get(BASE)
      .intercept({ path: '/rest/api/3/status', method: 'GET' })
      .reply(200, [
        { id: '1', name: 'Open' },
        { id: '3', name: 'Development' },
        // The same name appears once per workflow scheme in real responses.
        { id: '3', name: 'Development' },
        { id: '10001', name: 'PO Approve' },
      ]);

    expect(await adapter().listStatuses()).toEqual(['Development', 'Open', 'PO Approve']);
  });
});
