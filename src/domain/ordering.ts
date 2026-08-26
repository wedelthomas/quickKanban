export interface ColumnOrder {
  columnId: number;
  /** Live card ids in position order. */
  cardIds: string[];
}

export interface PositionAssignment {
  cardId: string;
  columnId: number;
  /** 1-based, contiguous within its column. */
  position: number;
}

export interface MovePlan {
  changed: boolean;
  columnChanged: boolean;
  fromColumnId: number;
  toColumnId: number;
  /** Empty when nothing changed. */
  assignments: PositionAssignment[];
}

/**
 * Works out where every affected card ends up.
 *
 * Renumbers whole columns rather than using fractional positions between
 * neighbours. Fractional ordering is the usual choice and is better at
 * thousands of rows, but a column here holds tens of cards, so renumbering is
 * one cheap UPDATE — and it avoids the precision drift that repeated
 * midpoint insertion accumulates, along with the rebalancing routine that
 * drift eventually demands.
 *
 * Pure: no clock, no database, no ordering assumptions beyond its arguments.
 * That is what lets every case above be a table-driven unit test.
 */
export const planMove = ({
  cardId,
  from,
  to,
  toIndex,
}: {
  cardId: string;
  from: ColumnOrder;
  to: ColumnOrder;
  toIndex: number;
}): MovePlan => {
  const columnChanged = from.columnId !== to.columnId;

  const remaining = from.cardIds.filter((id) => id !== cardId);
  const destination = columnChanged ? [...to.cardIds] : remaining;

  // Clamp rather than reject: a drop past the end of a column means "last",
  // which is what the user did, not an error.
  const index = Math.min(Math.max(toIndex, 1), destination.length + 1) - 1;
  destination.splice(index, 0, cardId);

  const unchanged =
    !columnChanged &&
    destination.length === from.cardIds.length &&
    destination.every((id, i) => id === from.cardIds[i]);

  if (unchanged) {
    return {
      changed: false,
      columnChanged: false,
      fromColumnId: from.columnId,
      toColumnId: to.columnId,
      assignments: [],
    };
  }

  const assignments: PositionAssignment[] = destination.map((id, i) => ({
    cardId: id,
    columnId: to.columnId,
    position: i + 1,
  }));

  if (columnChanged) {
    assignments.push(
      ...remaining.map((id, i) => ({ cardId: id, columnId: from.columnId, position: i + 1 })),
    );
  }

  return {
    changed: true,
    columnChanged,
    fromColumnId: from.columnId,
    toColumnId: to.columnId,
    assignments,
  };
};
