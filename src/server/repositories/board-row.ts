import type { Card, CardSource, ColumnKey, Priority } from '../../shared/types.js';
import { isOverdue } from '../../domain/overdue.js';

/**
 * How a card comes back from either repository. Shared because both read it
 * with the same projection — not to make either file shorter.
 */
export interface BoardRow {
  issue_key?: string | null;
  has_conflict?: boolean | null;
  issue_url?: string | null;
  column_id: number;
  column_key: ColumnKey;
  column_name: string;
  column_position: number;
  card_id: string | null;
  source: CardSource | null;
  title: string | null;
  description: string | null;
  priority: Priority | null;
  due_date: string | null;
  position: number | null;
  tags: string[] | null;
  created_at: Date | null;
  updated_at: Date | null;
  blocked: boolean | null;
  blocked_in_jira: boolean | null;
  carried_iterations: number | null;
  points: number | null;
  jira_points: number | null;
  /** Last status sync observed for this issue, or null if never synced. */
  status_name?: string | null;
}

/**
 * `cancellationStatus` is the tracker status configured to mean cancelled
 * (`Settings.cancellationStatus`), read once by the caller — not part of
 * the row, since it is one value for every card, not a per-card fact.
 */
export const toCard = (
  row: BoardRow,
  today: Date,
  cancellationStatus: string | null = null,
): Card => ({
  id: row.card_id!,
  source: row.source!,
  title: row.title!,
  description: row.description,
  priority: row.priority!,
  dueDate: row.due_date,
  overdue: isOverdue(row.due_date, today),
  columnId: row.column_id,
  position: row.position!,
  tags: row.tags ?? [],
  issueKey: row.issue_key ?? null,
  issueUrl: row.issue_url ?? null,
  hasConflict: row.has_conflict === true,
  blocked: row.blocked === true,
  // Computed here rather than in the client, alongside `overdue`, so one
  // definition governs (FR-419). A null blocked_in_jira means Jira's state has
  // never been observed, which is not a disagreement.
  blockedDivergesFromJira:
    row.blocked_in_jira !== null &&
    row.blocked_in_jira !== undefined &&
    row.blocked_in_jira !== (row.blocked === true),
  carriedIterations: row.carried_iterations ?? 0,
  points: row.points ?? null,
  // Same reasoning as blockedDivergesFromJira: a null jira_points means Jira's
  // value has never been observed, which is not a disagreement.
  pointsDivergesFromJira:
    row.jira_points !== null &&
    row.jira_points !== undefined &&
    row.jira_points !== row.points,
  // True only for an active, Jira-sourced card whose issue still carries
  // the configured cancellation status (FR-633) — a live comparison, not a
  // stored flag (research.md R-5), the same shape blockedDivergesFromJira
  // and pointsDivergesFromJira already are.
  cancellationDivergesFromJira:
    row.source === 'jira' &&
    cancellationStatus !== null &&
    row.status_name != null &&
    row.status_name.trim().toLowerCase() === cancellationStatus.trim().toLowerCase(),
  createdAt: row.created_at!.toISOString(),
  updatedAt: row.updated_at!.toISOString(),
});
