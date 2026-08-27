export interface Mapping {
  columnId: number;
  /** Board order, which decides ties. */
  columnPosition: number;
  statusName: string;
}

/**
 * Which Jira status a column means, or null when the column is local-only.
 *
 * Null is not an error state. A column with no mapping is the mechanism that
 * lets Blocked exist on a board whose Jira workflow has no Blocked status:
 * cards move there and Jira is simply not told (FR-207).
 */
export const statusForColumn = (
  mappings: readonly Mapping[],
  columnId: number,
): string | null => mappings.find((m) => m.columnId === columnId)?.statusName ?? null;

/**
 * Which column a Jira status belongs in, or null when nothing maps to it.
 *
 * Two columns may legitimately share a status; the first in **board order**
 * wins (FR-205). Board order rather than insertion order, so the answer does
 * not depend on the sequence someone happened to configure them in.
 */
export const columnForJiraStatus = (
  mappings: readonly Mapping[],
  statusName: string,
): number | null => {
  const wanted = statusName.trim().toLowerCase();
  const matches = mappings
    .filter((m) => m.statusName.trim().toLowerCase() === wanted)
    .sort((a, b) => a.columnPosition - b.columnPosition);
  return matches[0]?.columnId ?? null;
};
