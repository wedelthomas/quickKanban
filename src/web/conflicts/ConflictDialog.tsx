import { useState } from 'react';
import type { Card } from '../../shared/types.js';

export interface OpenConflict {
  id: number;
  card: Card | null;
  board: { columnId: number; columnName: string };
  jira: { statusAtDetection: string; statusCurrent: string };
  raisedAt: string;
}

/**
 * Both sides shown at once, with no default selection.
 *
 * The board deliberately refuses to guess here: the two sides are equally
 * valid records of what someone believed, and the only party who knows which
 * one is true is the person reading this (D-6, FR-232).
 */
export const ConflictDialog = ({
  conflicts,
  onResolve,
  onClose,
}: {
  conflicts: OpenConflict[];
  onResolve: (id: number, resolution: 'kept_board' | 'accepted_jira') => Promise<void>;
  onClose: () => void;
}) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const choose = async (
    id: number,
    resolution: 'kept_board' | 'accepted_jira',
  ): Promise<void> => {
    setBusy(id);
    setError(null);
    try {
      await onResolve(id, resolution);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be resolved.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog dialog--wide" role="dialog" aria-label="Conflicts">
        <h2 className="help-title">Conflicts</h2>
        <p className="field-note">
          The board and Jira were both changed. Nothing has been decided for you — pick
          the side that is right.
        </p>

        {error && (
          <p className="field-error" role="alert" data-testid="conflict-error">
            {error}
          </p>
        )}

        {conflicts.length === 0 && <p className="field-note">Nothing to decide.</p>}

        {conflicts.map((conflict) => (
          <section className="conflict" data-testid="conflict" key={conflict.id}>
            <h3 className="conflict-title">
              {conflict.card?.issueKey ? `${conflict.card.issueKey} — ` : ''}
              {conflict.card?.title ?? 'Card'}
            </h3>
            <div className="conflict-sides">
              <div className="conflict-side">
                <span className="field-label">On this board</span>
                <span className="conflict-value" data-testid="conflict-board">
                  {conflict.board.columnName}
                </span>
                <button
                  className="button"
                  disabled={busy === conflict.id}
                  data-testid="keep-board"
                  onClick={() => void choose(conflict.id, 'kept_board')}
                >
                  Keep this, update Jira
                </button>
              </div>
              <div className="conflict-side">
                <span className="field-label">In Jira</span>
                <span className="conflict-value" data-testid="conflict-jira">
                  {conflict.jira.statusCurrent}
                </span>
                <button
                  className="button"
                  disabled={busy === conflict.id}
                  data-testid="accept-jira"
                  onClick={() => void choose(conflict.id, 'accepted_jira')}
                >
                  Accept this, move the card
                </button>
              </div>
            </div>
          </section>
        ))}

        <div className="dialog-actions">
          <span className="dialog-actions-spacer" />
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
