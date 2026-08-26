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
  createdAt: string;
  updatedAt: string;
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
  | 'DATABASE_UNAVAILABLE';

export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail: string;
}
