import assert from 'node:assert/strict';
import type { BoardWorld } from './world.js';
import type { Board, Card } from '../../../src/shared/types.js';

/**
 * Helpers shared by the slice-4 step files.
 *
 * A module rather than one of the step files, so importing a helper does not
 * mean importing somebody else's step definitions. Cucumber loads every `.ts`
 * under `steps/`; this one simply defines none.
 */

export const DONE_COLUMN = 6;

export { COLUMN_IDS, COLUMN_ID_BY_NAME, columnIdFor } from './columns.js';

export const allCards = (board: Board): Card[] => board.columns.flatMap((c) => c.cards);

/**
 * A card's id by title, read from the database rather than from the board —
 * an archived card is no longer on the board, which is usually the point.
 */
export const cardIdByTitle = async (
  world: BoardWorld,
  title: string,
): Promise<string> => {
  const { rows } = await world.pool.query<{ id: string }>(
    'SELECT id FROM cards WHERE title = $1 AND deleted_at IS NULL',
    [title],
  );
  assert.ok(rows[0], `no card titled ${title}`);
  return rows[0].id;
};

/** Local calendar date N days back, matching what the endpoints parse. */
export const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};
