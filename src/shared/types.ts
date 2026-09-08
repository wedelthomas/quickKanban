/**
 * The vocabulary of the specification, in code. Names come straight from
 * spec.md's Key Entities so the two read alike.
 *
 * Over 300 lines, deliberately kept whole. This is a glossary, not a module
 * with behaviour: every entry is a name the spec also uses, and the value of
 * having one place to look them up is exactly the value that splitting it
 * would destroy. Length here is a measure of how much vocabulary the product
 * has, not of how much this file does — it has no branches, no dependencies
 * beyond itself, and one reason to change per type.
 */

export const COLUMN_KEYS = [
  'backlog',
  'iteration_items',
  'in_progress',
  'test',
  'po_review',
  'done',
] as const;

/**
 * `blocked` is not here. Slice 5 retired it as a column and made it something a
 * card carries instead, but its `columns` row survives because the movement
 * history references it — so code that resolves a historical event's column may
 * still legitimately see this key.
 */
export type RetiredColumnKey = 'blocked';

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
  /**
   * Independent of `columnId`: a card is blocked wherever it actually is. FR-403.
   * Unlike `hasConflict`, this does NOT freeze the card — blocked is an
   * annotation, and a blocked card still moves (FR-414).
   */
  blocked: boolean;
  /**
   * The local value disagrees with what Jira last reported. Local wins (FR-418);
   * this exists so the disagreement is visible rather than silent (FR-419).
   * Always false for local cards, which have no Jira opinion to differ from.
   */
  blockedDivergesFromJira: boolean;
  /** Iterations this card has carried through unfinished. 0 when never carried. */
  carriedIterations: number;
  /** NULL means unpointed (FR-519); 0 is a deliberate estimate, distinct from unpointed. */
  points: number | null;
  /**
   * The local value disagrees with what Jira last reported for story points
   * (FR-518). Always false for local cards, which have no Jira opinion to
   * differ from. Mirrors blockedDivergesFromJira's shape exactly.
   */
  pointsDivergesFromJira: boolean;
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

export type WorkingDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Settings {
  /** Master toggle, independent of whether credentials are configured. */
  jiraEnabled: boolean;

  jiraJql: string;
  syncIntervalSeconds: number;
  /** How long finished work stays on the board before archival takes it. */
  archiveWindowDays: number;
  archiveIntervalSeconds: number;

  /** The Jira board whose active sprint supplies the iteration. FR-422. */
  iterationBoardId: number;
  /**
   * Which team's sprint to take from that board. Not optional in practice: the
   * default board is shared by two teams and carries two active sprints per
   * iteration with identical dates, so without this the banner could show
   * another team's name. FR-424, FR-445.
   */
  iterationTeamName: string;
  /** Start of a known iteration, for the estimated fallback only. FR-428. */
  iterationAnchorDate: string;
  iterationCadenceDays: number;

  /** Consumed here by the banner's remaining-days count. FR-431. */
  workingDays: WorkingDay[];
  /** Written by slice 5, consumed by slice 6's elapsed time. */
  workingStartHour: number;
  workingEndHour: number;

  /**
   * Whose board this is, shown as the page heading. Empty falls back to the
   * product name, so an unconfigured board is unchanged.
   */
  author: string;

  /** Configurable so a Jira administration change is not a code change. FR-438. */
  jiraFieldBlocked: string;
  jiraFieldBlockedOption: string;
  jiraFieldSprint: string;
  jiraFieldStoryPoints: string;
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

export type SummaryPeriod = 'daily' | 'weekly' | 'iteration';

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
  | 'COLUMN_RETIRED'
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
  | 'ARCHIVE_IN_PROGRESS'
  | 'ITERATION_NOT_FOUND';

export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail: string;
}

/**
 * The current iteration, as last established.
 *
 * `provenance` is the honesty of the value, not its source system: `read` means
 * established from the reference board this run, `cached` a previously read
 * value shown while the source is unreachable, `estimated` computed from the
 * configured anchor and cadence. FR-427 requires anything but `read` to be
 * marked wherever it is displayed.
 */
export interface Iteration {
  /** Null when estimated: the ordinal resets at the fiscal year and cannot be counted (FR-423). */
  ordinalName: string | null;
  startsOn: string;
  endsOn: string;
  workingDaysRemaining: number;
  provenance: 'read' | 'cached' | 'estimated';
  observedAt: string;
}

/**
 * The commitment snapshot taken once, the first time an iteration's ordinal
 * is observed (FR-525, FR-526). Never updated afterward.
 */
export interface IterationCommitment {
  ordinalName: string;
  committedPoints: number;
  committedAt: string;
}

export interface TimeByCard {
  cardId: string;
  title: string;
  seconds: number;
}

export interface TimeByProject {
  /** 'local' is one project, alongside each Jira project key seen. */
  project: string;
  seconds: number;
}

export interface IterationReportTime {
  byCard: TimeByCard[];
  byProject: TimeByProject[];
  localShare: number;
  jiraShare: number;
}

export interface IterationReportPoints {
  committed: number;
  completed: number;
  scopeAdded: number;
  scopeRemoved: number;
  localShare: number;
  jiraShare: number;
  excludedUnpointed: number;
}

/**
 * FR-523: withheld rather than reported as zero when no card in the period
 * carries points. The two shapes are distinguished by the presence of
 * `withheld`, never by a null total, so "no data" cannot be mistaken for
 * "zero" (FR-539).
 */
export type IterationReportPointsSection =
  | IterationReportPoints
  | { withheld: true; reason: string };

export interface IterationReport {
  ordinalName: string;
  startsOn: string;
  endsOn: string;
  time: IterationReportTime;
  points: IterationReportPointsSection;
  /** FR-542: true when the period partly predates recorded history. */
  incomplete: boolean;
}

export interface BurndownPoint {
  date: string;
  outstanding: number;
  completedThatDay: number;
  scopeAddedThatDay: number;
  scopeRemovedThatDay: number;
}

export interface Burndown {
  ordinalName: string;
  points: BurndownPoint[];
}
