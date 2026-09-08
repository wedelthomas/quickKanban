/**
 * Column identifiers, in one place.
 *
 * There were four copies of this map before slice 5 — in movement.steps,
 * jira.steps, slice4-helpers, and derived from array position in mapping.steps.
 * They agreed for as long as the columns happened to occupy ids 1..6 in board
 * order. Retiring Blocked and adding Iteration Items as id 7 broke that
 * coincidence, and three of the four copies silently produced `undefined` or
 * the wrong column instead of failing.
 *
 * Ids are NOT board positions and never were: Iteration Items sits second and
 * is id 7. Anything deriving one from the other is wrong.
 */
export const COLUMN_IDS = {
  backlog: 1,
  iteration_items: 7,
  in_progress: 2,
  test: 4,
  po_review: 5,
  done: 6,
  /**
   * RETIRED by slice 5. On no board, accepts no card. Kept because the movement
   * history resolves against it (FR-446), and because proving a move there is
   * refused needs its id.
   */
  blocked: 3,
} as const;

export type ColumnName = keyof typeof COLUMN_IDS;

/** Ids by the display name features use, e.g. "PO Review". */
export const COLUMN_ID_BY_NAME: Record<string, number> = {
  Backlog: COLUMN_IDS.backlog,
  'Iteration Items': COLUMN_IDS.iteration_items,
  'In Progress': COLUMN_IDS.in_progress,
  Test: COLUMN_IDS.test,
  'PO Review': COLUMN_IDS.po_review,
  Done: COLUMN_IDS.done,
};

export const columnIdFor = (key: string): number => {
  const id = (COLUMN_IDS as Record<string, number>)[key];
  if (id === undefined) throw new Error(`unknown column key: ${key}`);
  return id;
};
