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
}

export interface BoardColumn extends Column {
  cards: Card[];
}

export interface Board {
  columns: BoardColumn[];
}

export interface CardEvent {
  id: number;
  fromColumnId: number;
  toColumnId: number;
  actor: Actor;
  occurredAt: string;
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
  | 'JIRA_CREDENTIALS_REJECTED';

export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail: string;
}
