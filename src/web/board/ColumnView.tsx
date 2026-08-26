import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { BoardColumn } from '../../shared/types.js';
import { CardView } from './CardView.js';

/** Prefix so a column's droppable id can never collide with a card's uuid. */
export const columnDroppableId = (columnId: number): string => `column-${columnId}`;

export const ColumnView = ({ column }: { column: BoardColumn }) => {
  const { setNodeRef, isOver } = useDroppable({ id: columnDroppableId(column.id) });

  return (
    <section
      className={`column${isOver ? ' column--over' : ''}`}
      data-testid="column"
      data-column-key={column.key}
    >
      <header className="column-header">
        <span className="column-name">{column.name}</span>
        <span className="column-count" data-testid="column-count">
          {column.cards.length}
        </span>
      </header>
      <div className="column-cards" ref={setNodeRef}>
        <SortableContext
          items={column.cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.cards.map((card) => (
            <CardView card={card} key={card.id} />
          ))}
        </SortableContext>
      </div>
    </section>
  );
};
