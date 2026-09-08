export interface JiraCredentials {
  baseUrl: string;
  /** The Authorization header value. Built here so nothing else handles the token. */
  authorization: string;
}

/**
 * Reads Jira connection details from the environment (FR-101).
 *
 * Returns the header value rather than the token, so no caller ever holds the
 * secret itself — the header is still sensitive, but it is only ever passed
 * straight to `fetch`, never rendered, stored or logged.
 *
 * Returns null when Jira is not configured. That is a supported state, not an
 * error: the board works without it (FR-105).
 */
export const readJiraCredentials = (
  env: NodeJS.ProcessEnv = process.env,
): JiraCredentials | null => {
  const baseUrl = env.JIRA_BASE_URL?.trim();
  const email = env.JIRA_EMAIL?.trim();
  const token = env.JIRA_API_TOKEN?.trim();

  if (!baseUrl || !email || !token) return null;
  if (token === 'REPLACE_WITH_YOUR_TOKEN') return null;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
  };
};
