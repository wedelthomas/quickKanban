import type { ProblemCode } from '../shared/types.js';

/**
 * Domain failures carry a stable code and the HTTP status it maps to. The
 * message is for a human; the code is the contract. Keeping them separate is
 * what stops error text from becoming load-bearing in the client.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ProblemCode,
    readonly status: number,
    readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'DomainError';
  }
}

export const titleRequired = (): DomainError =>
  new DomainError(
    'TITLE_REQUIRED',
    422,
    'Card title is required',
    'A card must have a title that is not only whitespace.',
  );

export const validationFailed = (detail: string): DomainError =>
  new DomainError('VALIDATION_FAILED', 422, 'Request is not valid', detail);

export const cardNotFound = (id: string): DomainError =>
  new DomainError('CARD_NOT_FOUND', 404, 'Card not found', `No card exists with id ${id}.`);

export const columnNotFound = (id: number): DomainError =>
  new DomainError(
    'COLUMN_NOT_FOUND',
    404,
    'Column not found',
    `No column exists with id ${id}. The board has exactly six, and they are fixed.`,
  );

export const deleteForbiddenNonLocal = (): DomainError =>
  new DomainError(
    'DELETE_FORBIDDEN_NON_LOCAL',
    409,
    'Only local cards can be deleted',
    'This card comes from Jira. Its lifecycle is owned there, not on the board.',
  );

export const databaseUnavailable = (): DomainError =>
  new DomainError(
    'DATABASE_UNAVAILABLE',
    503,
    'The board could not reach its data store',
    'The change was not saved. The board has reverted it rather than show you a state it could not store.',
  );

export const jiraNotConfigured = (): DomainError =>
  new DomainError(
    'JIRA_NOT_CONFIGURED',
    409,
    'Jira is not configured',
    'Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in .env, then restart. The board works without them.',
  );

export const editForbiddenJiraOwned = (field: string): DomainError =>
  new DomainError(
    'EDIT_FORBIDDEN_JIRA_OWNED',
    409,
    `${field} comes from Jira`,
    `This card's ${field} is owned by Jira and changes there, not here.`,
  );
