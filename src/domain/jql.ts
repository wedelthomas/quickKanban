/**
 * `statusCategory` rather than a status name: names vary per workflow, the
 * category does not. A default naming "To Do" would break on the first project
 * that calls it something else.
 */
export const DEFAULT_JQL = 'assignee = currentUser() AND statusCategory != Done';

const MAX_LENGTH = 2000;

export interface JqlValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Checks the query is worth sending, and no more than that.
 *
 * Deliberately does not parse JQL. Jira validates it, and a parser here would
 * be a second, worse one that rejects queries Jira would have accepted — the
 * user's own query against their own Jira is not untrusted input in the way a
 * public form field is.
 */
export const validateJql = (jql: string): JqlValidation => {
  const trimmed = jql.trim();
  if (trimmed === '') return { ok: false, reason: 'A query is required.' };
  if (trimmed.length > MAX_LENGTH) {
    return { ok: false, reason: `A query must be under ${MAX_LENGTH} characters.` };
  }
  return { ok: true };
};
