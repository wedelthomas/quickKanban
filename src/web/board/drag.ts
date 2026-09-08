/**
 * Drag geometry: turning what dnd-kit reports into a concrete drop target.
 *
 * Separate from Board because it is about pointer arithmetic and dnd-kit's own
 * quirks, not about the board's state — and because Board had grown past 300
 * lines holding both.
 */
import { pointerWithin, rectIntersection, type CollisionDetection } from '@dnd-kit/core';
import type { Board as BoardData } from '../../shared/types.js';

/**
 * Resolves what dnd-kit reports it was dropped over into a concrete
 * (column, 1-based index) target. Dropping on a card means "in front of that
 * card"; dropping on the column's empty space means "at the end".
 */
export const resolveTarget = (
  board: BoardData,
  activeId: string,
  overId: string,
): { toColumnId: number; toIndex: number } | null => {
  const columnMatch = /^column-(\d+)$/.exec(overId);
  if (columnMatch) {
    const toColumnId = Number(columnMatch[1]);
    const column = board.columns.find((c) => c.id === toColumnId);
    if (!column) return null;
    const withoutActive = column.cards.filter((c) => c.id !== activeId);
    return { toColumnId, toIndex: withoutActive.length + 1 };
  }

  const column = board.columns.find((c) => c.cards.some((card) => card.id === overId));
  if (!column) return null;
  const index = column.cards
    .filter((c) => c.id !== activeId)
    .findIndex((c) => c.id === overId);
  return {
    toColumnId: column.id,
    toIndex: (index === -1 ? column.cards.length : index) + 1,
  };
};

/**
 * A sortable card is both draggable and droppable, so the default strategies
 * happily report that a card was dropped on itself — which resolves to its own
 * position, plans no change, and silently swallows the drag. Dropping the
 * active id and preferring what the pointer is actually inside makes an empty
 * column a reachable target.
 */
export const collisionDetection: CollisionDetection = (args) => {
  const notSelf = (c: { id: string | number }) => c.id !== args.active.id;
  const isColumn = (c: { id: string | number }) => String(c.id).startsWith('column-');

  // A card and the column containing it are both under the pointer. The card
  // is the more specific answer — it means "put me in front of this one" —
  // so cards are preferred and the column is the fallback for empty space.
  const prefer = (candidates: ReturnType<typeof pointerWithin>) => {
    const usable = candidates.filter(notSelf);
    const cards = usable.filter((c) => !isColumn(c));
    return cards.length > 0 ? cards : usable;
  };

  const under = prefer(pointerWithin(args));
  return under.length > 0 ? under : prefer(rectIntersection(args));
};
