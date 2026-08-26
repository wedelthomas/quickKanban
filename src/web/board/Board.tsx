import { useState } from 'react';
import { useBoard } from './use-board.js';
import { ColumnView } from './ColumnView.js';
import { CardDialog } from '../cards/CardDialog.js';

export const Board = () => {
  const { board, error, createCard } = useBoard();
  const [creating, setCreating] = useState(false);

  if (error) return <p className="board-message board-message--error">{error}</p>;
  if (!board) return <p className="board-message">Loading the board…</p>;

  return (
    <>
      <div className="board-bar">
        <button className="button button--primary" onClick={() => setCreating(true)}>
          New card
        </button>
      </div>
      <div className="board" data-testid="board">
        {board.columns.map((column) => (
          <ColumnView column={column} key={column.id} />
        ))}
      </div>
      {creating && (
        <CardDialog
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            await createCard(input);
            setCreating(false);
          }}
        />
      )}
    </>
  );
};
