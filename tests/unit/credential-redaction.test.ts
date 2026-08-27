import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readJiraCredentials } from '../../src/server/jira/credentials.js';
import { JiraAdapter } from '../../src/server/jira/jira-adapter.js';
import { JiraError } from '../../src/server/jira/jira-port.js';

const TOKEN = 'ATATT-this-is-the-secret-value-nobody-may-ever-see';
const ENV = {
  JIRA_BASE_URL: 'https://example.atlassian.net',
  JIRA_EMAIL: 'someone@example.com',
  JIRA_API_TOKEN: TOKEN,
} as NodeJS.ProcessEnv;

/**
 * Covers BH-122.
 *
 * The usual way a credential leaks is not a log line someone wrote on purpose.
 * It is an error object that happened to carry the request that produced it —
 * so these tests exercise every failure the adapter can produce and check the
 * thrown value, not just the message.
 */
describe('the credential never escapes', () => {
  const contains = (value: unknown): boolean =>
    JSON.stringify(value, replacer)?.includes(TOKEN) ?? false;

  function replacer(this: unknown, _key: string, value: unknown): unknown {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
        cause: value.cause,
      };
    }
    return value;
  }

  it('is never returned by the credential reader', () => {
    const credentials = readJiraCredentials(ENV)!;
    expect(credentials).not.toHaveProperty('token');
    expect(credentials.baseUrl).toBe('https://example.atlassian.net');
    // The header is derived, so nothing downstream ever holds the raw token.
    expect(credentials.authorization.startsWith('Basic ')).toBe(true);
    expect(credentials.authorization).not.toContain(TOKEN);
  });

  it.each([
    [
      'connectivity',
      () => Promise.reject(new Error(`connect ECONNREFUSED with ${TOKEN}`)),
    ],
    ['401', () => Promise.resolve(new Response('nope', { status: 401 }))],
    ['429', () => Promise.resolve(new Response('slow down', { status: 429 }))],
    ['500', () => Promise.resolve(new Response('boom', { status: 500 }))],
    ['418', () => Promise.resolve(new Response('teapot', { status: 418 }))],
    [
      'malformed body',
      () => Promise.resolve(new Response('{"nope":1}', { status: 200 })),
    ],
  ])('throws no error carrying the token: %s', async (_label, respond) => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => respond()) as typeof fetch;
    try {
      const adapter = new JiraAdapter(readJiraCredentials(ENV)!, async () => {});
      await expect(adapter.searchIssues('assignee = currentUser()')).rejects.toThrow();
      await adapter.searchIssues('assignee = currentUser()').catch((error: unknown) => {
        expect(contains(error)).toBe(false);
        expect(String(error)).not.toContain(TOKEN);
        if (error instanceof JiraError) expect(error.kind).toBeTruthy();
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('treats the placeholder as not configured', () => {
    // Otherwise a fresh checkout would send the literal string to Jira and
    // report "credentials rejected", which sends the reader hunting for a
    // problem with their real token.
    expect(
      readJiraCredentials({ ...ENV, JIRA_API_TOKEN: 'REPLACE_WITH_YOUR_TOKEN' }),
    ).toBeNull();
  });

  it.each(['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'])(
    'reports not configured when %s is absent',
    (missing) => {
      const env = { ...ENV, [missing]: undefined };
      expect(readJiraCredentials(env)).toBeNull();
    },
  );
});

describe('no source file carries a credential', () => {
  it.each([
    'src/server/jira/credentials.ts',
    'src/server/jira/jira-adapter.ts',
    'src/server/routes/settings.ts',
    'src/web/settings/SettingsDialog.tsx',
  ])('%s contains no hard-coded secret', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/ATATT[A-Za-z0-9]/);
    expect(source).not.toMatch(/Basic\s+[A-Za-z0-9+/]{20,}/);
  });

  it('the settings surface never names a credential field', () => {
    const dialog = readFileSync('src/web/settings/SettingsDialog.tsx', 'utf8');
    const route = readFileSync('src/server/routes/settings.ts', 'utf8');
    for (const source of [dialog, route]) {
      expect(source).not.toMatch(/type="password"/);
      expect(source).not.toMatch(/\bapiToken\b|\bjiraToken\b|\bcredential:/);
    }
  });
});
