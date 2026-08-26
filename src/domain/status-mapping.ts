/**
 * Where an imported issue first lands, from its Jira status name.
 *
 * By name rather than by `statusCategory`: the category is too coarse to be
 * useful. Verified against this user's own Jira — "In Progress", "Development"
 * and "Test" all report `indeterminate`, so a category-based mapping would
 * collapse three distinct stages into one column.
 *
 * Consulted only when a card is created (FR-112, FR-138). An existing card is
 * never re-placed by a sync; that is slice 3's job, along with making this
 * mapping user-editable.
 */

export const BACKLOG = 1;
export const IN_PROGRESS = 2;
export const BLOCKED = 3;
export const TEST = 4;
export const PO_REVIEW = 5;
export const DONE = 6;

/**
 * Keyed by lower-cased status name. Names come from Jira workflows this board
 * actually sees, plus the common synonyms — not from an imagined workflow. A
 * mapping built against tutorial statuses looks right and places real issues
 * wrongly.
 */
const BY_STATUS_NAME: Record<string, number> = {
  // Not started
  open: BACKLOG,
  'to do': BACKLOG,
  todo: BACKLOG,
  backlog: BACKLOG,
  new: BACKLOG,
  created: BACKLOG,
  reopened: BACKLOG,

  // Under way
  'in progress': IN_PROGRESS,
  development: IN_PROGRESS,
  'in development': IN_PROGRESS,
  'in dev': IN_PROGRESS,
  doing: IN_PROGRESS,
  started: IN_PROGRESS,

  // Waiting on someone
  blocked: BLOCKED,
  'on hold': BLOCKED,
  waiting: BLOCKED,
  impeded: BLOCKED,

  // Being verified
  test: TEST,
  testing: TEST,
  'in test': TEST,
  'in testing': TEST,
  qa: TEST,
  'ready for test': TEST,

  // Awaiting a decision
  'in review': PO_REVIEW,
  review: PO_REVIEW,
  'po review': PO_REVIEW,
  'code review': PO_REVIEW,
  'ready for review': PO_REVIEW,
  'pending approval': PO_REVIEW,

  // Finished
  done: DONE,
  closed: DONE,
  resolved: DONE,
  complete: DONE,
  completed: DONE,
};

/**
 * Falls back to Backlog rather than dropping the card or failing the sync.
 * An unfamiliar workflow should cost one drag, not a lost issue or a broken
 * import.
 */
export const columnForStatus = (statusName: string): number =>
  BY_STATUS_NAME[statusName.trim().toLowerCase()] ?? BACKLOG;
