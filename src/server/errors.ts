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
  new DomainError(
    'CARD_NOT_FOUND',
    404,
    'Card not found',
    `No card exists with id ${id}.`,
  );

export const iterationNotFound = (ordinalName: string): DomainError =>
  new DomainError(
    'ITERATION_NOT_FOUND',
    404,
    'Iteration not found',
    `No iteration has ever been observed with ordinal "${ordinalName}".`,
  );

export const columnNotFound = (id: number): DomainError =>
  new DomainError(
    'COLUMN_NOT_FOUND',
    404,
    'Column not found',
    `No column exists with id ${id}. The board has exactly six, and they are fixed.`,
  );

export const columnRetired = (id: number): DomainError =>
  new DomainError(
    'COLUMN_RETIRED',
    422,
    'That column no longer exists',
    `Column ${id} was retired. Its record is kept so the movement history still ` +
      `resolves, but no card may be placed there.`,
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

/**
 * Jira could not be reached, or answered in a way that says try later.
 *
 * Deliberately not folded into `databaseUnavailable`: the board's own data
 * store is fine, and telling the user otherwise sends them to look at the
 * wrong system. FR-213 asks for a connectivity failure, distinctly.
 */
export const jiraUnreachable = (): DomainError =>
  new DomainError(
    'JIRA_UNREACHABLE',
    503,
    'Jira could not be reached',
    'The move was not made, in Jira or on the board. Nothing is half-applied — try again when Jira is back.',
  );

/**
 * Separate from unreachable, because the user's next action differs: waiting
 * fixes one and never fixes the other.
 */
export const jiraCredentialsRejected = (): DomainError =>
  new DomainError(
    'JIRA_CREDENTIALS_REJECTED',
    502,
    'Jira rejected the credentials',
    'The move was not made. Check the API token in the environment; the board cannot fix this by retrying.',
  );

/** A pass is already running. Single-flight, in process and in the database. */
export const archiveInProgress = (): DomainError =>
  new DomainError(
    'ARCHIVE_IN_PROGRESS',
    409,
    'An archival pass is already running',
    'Nothing was started. Wait for the pass in flight to finish.',
  );

export const invalidDateRange = (detail: string): DomainError =>
  new DomainError('INVALID_DATE_RANGE', 400, 'That date range cannot be read', detail);

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

/**
 * Four distinct refusals rather than one, because the user's next action
 * differs for each: choose a different column, fix the mapping, finish it in
 * Jira, or resolve the conflict. A single MOVE_REFUSED would make the
 * interface guess which.
 */
export const noLegalTransition = (from: string, to: string): DomainError =>
  new DomainError(
    'NO_LEGAL_TRANSITION',
    409,
    'Jira will not allow that move',
    `Jira offers no transition from "${from}" to "${to}" for this issue. Its workflow decides which moves are possible.`,
  );

export const staleMapping = (status: string): DomainError =>
  new DomainError(
    'STALE_MAPPING',
    409,
    'That column is mapped to a status this issue does not have',
    `No status named "${status}" exists in this issue's workflow. Update the column mapping in settings.`,
  );

export const transitionNeedsFields = (transition: string): DomainError =>
  new DomainError(
    'TRANSITION_NEEDS_FIELDS',
    409,
    'Jira needs more than a status change',
    `The "${transition}" transition asks for information this board does not hold. Complete it in Jira.`,
  );

export const cardConflicted = (): DomainError =>
  new DomainError(
    'CARD_CONFLICTED',
    409,
    'This card disagrees with Jira',
    'The board and Jira both changed since the last sync. Open Conflicts and choose which one is right before moving this card.',
  );
