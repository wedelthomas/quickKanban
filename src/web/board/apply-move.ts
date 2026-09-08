import type { Board, Card } from '../../shared/types.js';
import { planMove } from '../../domain/ordering.js';

/**
 * Applies a move to a board in memory, using the same planner the server uses.
 * Sharing it is the point: an optimistic update computed by different rules
 * from the authoritative one would drift, and the drift would show up as cards
 * jumping after the server responds.
 */
export const applyMove = (
  board: Board,
  cardId: string,
  toColumnId: number,
  toIndex: number,
): Board | null => {
  const fromColumn = board.columns.find((c) =>
    c.cards.some((card) => card.id === cardId),
  );
  const toColumn = board.columns.find((c) => c.id === toColumnId);
  if (!fromColumn || !toColumn) return null;

  const plan = planMove({
    cardId,
    from: { columnId: fromColumn.id, cardIds: fromColumn.cards.map((c) => c.id) },
    to: { columnId: toColumn.id, cardIds: toColumn.cards.map((c) => c.id) },
    toIndex,
  });
  if (!plan.changed) return null;

  const byId = new Map<string, Card>(
    board.columns.flatMap((c) => c.cards).map((c) => [c.id, c]),
  );

  return {
    columns: board.columns.map((column) => {
      const assigned = plan.assignments.filter((a) => a.columnId === column.id);
      if (assigned.length === 0 && column.id !== plan.fromColumnId) return column;
      return {
        ...column,
        cards: assigned
          .sort((a, b) => a.position - b.position)
          .map((a) => ({
            ...byId.get(a.cardId)!,
            columnId: column.id,
            position: a.position,
          })),
      };
    }),
  };
};
