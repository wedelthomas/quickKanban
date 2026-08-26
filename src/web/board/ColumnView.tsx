import type { BoardColumn } from '../../shared/types.js';
import { CardView } from './CardView.js';

export const ColumnView = ({ column }: { column: BoardColumn }) => (
  <section className="column" data-testid="column" data-column-key={column.key}>
    <header className="column-header">
      <span className="column-name">{column.name}</span>
      <span className="column-count" data-testid="column-count">
        {column.cards.length}
      </span>
    </header>
    <div className="column-cards">
      {column.cards.map((card) => (
        <CardView card={card} key={card.id} />
      ))}
    </div>
  </section>
);
