/**
 * The vocabulary of the specification, in code. Names come straight from
 * spec.md's Key Entities so the two read alike.
 */

export const COLUMN_KEYS = [
  'backlog',
  'in_progress',
  'blocked',
  'test',
  'po_review',
  'done',
] as const;

export type ColumnKey = (typeof COLUMN_KEYS)[number];

export type Priority = 'high' | 'medium' | 'low';

/**
 * Every card is `local` in slice 1. The distinction exists now because three
 * requirements depend on it (FR-010, FR-011, FR-015) and because slice 2
 * introduces `jira` cards without a data migration.
 */
export type CardSource = 'local' | 'jira';

/**
 * Who caused a movement. Only `user` is written in slice 1; `sync` arrives in
 * slice 2 and `system` in slice 4 when archival starts moving cards on its own.
 */
export type Actor = 'user' | 'sync' | 'system';

export interface Column {
  id: number;
  key: ColumnKey;
  name: string;
  position: number;
}

export interface Card {
  id: string;
  source: CardSource;
  title: string;
  description: string | null;
  priority: Priority;
  /** ISO calendar date, no time component. See FR-007. */
  dueDate: string | null;
  /** Computed server-side so one definition of "today" governs. FR-042. */
  overdue: boolean;
  columnId: number;
  position: number;
  tags: string[];
  /** Present only when source is 'jira'. */
  issueKey: string | null;
  issueUrl: string | null;
  /** True while an unresolved conflict exists. The card is frozen. */
  hasConflict: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SyncFailureKind = 'credentials' | 'connectivity' | 'rate_limit' | 'malformed';

export interface SyncRun {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  outcome: 'succeeded' | 'failed' | null;
  failureKind: SyncFailureKind | null;
  counts: {
    issuesSeen: number;
    created: number;
    updated: number;
    archived: number;
    restored: number;
    conflictsRaised: number;
  };
}

export interface SyncStatus {
  /** False is a normal state, not an error: the board works without Jira. */
  configured: boolean;
  running: boolean;
  lastSuccessAt: string | null;
  lastRun: SyncRun | null;
}

export interface ColumnMapping {
  columnId: number;
  columnKey: ColumnKey;
  columnName: string;
  /** Null means the column is local-only: moves into it never reach Jira. */
  statusName: string | null;
}

export type ConflictResolution = 'kept_board' | 'accepted_jira' | 'moot';

export interface Conflict {
  id: number;
  card: Card;
  board: { columnId: number; columnName: string };
  jira: { statusAtDetection: string; statusCurrent: string };
  raisedAt: string;
  resolvedAt: string | null;
  resolution: ConflictResolution | null;
}

export interface Settings {
  jiraJql: string;
  syncIntervalSeconds: number;
  /** How long finished work stays on the board before archival takes it. */
  archiveWindowDays: number;
  archiveIntervalSeconds: number;
}

export interface BoardColumn extends Column {
  cards: Card[];
}

export interface Board {
  columns: BoardColumn[];
}

/**
 * What a history row records. `moved` is every row slice 1 through 3 wrote;
 * `archived` arrives with slice 4, where the card does not change column but
 * something still happened to it (FR-317).
 */
export type CardEventKind = 'moved' | 'archived';

export interface CardEvent {
  id: number;
  fromColumnId: number;
  toColumnId: number;
  actor: Actor;
  kind: CardEventKind;
  occurredAt: string;
}

/** One day's worth of the archive. Days with no cards are omitted, not empty. */
export interface ArchiveDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  cards: ArchivedCard[];
}

export interface ArchivedCard {
  id: string;
  source: CardSource;
  title: string;
  priority: Priority;
  tags: string[];
  issueKey: string | null;
  issueUrl: string | null;
  archivedAt: string;
  /** Slice 2's reason where one was recorded; null for the window rule. */
  archivedReason: string | null;
}

export type SummaryPeriod = 'daily' | 'weekly';

export interface SummaryMovement {
  cardId: string;
  title: string;
  source: CardSource;
  issueKey: string | null;
  issueUrl: string | null;
  fromColumn: string;
  toColumn: string;
  /** Anything other than `user` is marked, so the user does not report a
   *  transition a teammate made as their own progress (FR-328). */
  actor: Actor;
  occurredAt: string;
  /** Moved within the period but has since left the board (FR-326). */
  archived: boolean;
}

export interface SummaryCard {
  cardId: string;
  title: string;
  source: CardSource;
  issueKey: string | null;
  issueUrl: string | null;
}

export interface Summary {
  period: SummaryPeriod;
  from: string;
  to: string;
  moved: SummaryMovement[];
  inProgress: SummaryCard[];
  blocked: SummaryCard[];
  /** True when all three groups are empty. A field rather than something the
   *  client infers, so the emptiness rule lives in one place (FR-330). */
  empty: boolean;
  /** The exact bytes the user pastes into a chat (FR-329). */
  text: string;
}

/**
 * The stable machine-readable failure codes from contracts/api.md. Clients
 * switch on these, never on human-readable text.
 */
export type ProblemCode =
  | 'TITLE_REQUIRED'
  | 'VALIDATION_FAILED'
  | 'CARD_NOT_FOUND'
  | 'COLUMN_NOT_FOUND'
  | 'DELETE_FORBIDDEN_NON_LOCAL'
  | 'DATABASE_UNAVAILABLE'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'
  | 'JIRA_NOT_CONFIGURED'
  | 'EDIT_FORBIDDEN_JIRA_OWNED'
  | 'NO_LEGAL_TRANSITION'
  | 'STALE_MAPPING'
  | 'TRANSITION_NEEDS_FIELDS'
  | 'CARD_CONFLICTED'
  | 'JIRA_UNREACHABLE'
  | 'JIRA_CREDENTIALS_REJECTED'
  | 'INVALID_DATE_RANGE'
  | 'ARCHIVE_IN_PROGRESS';

export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail: string;
}
