import { useEffect, useRef, useState } from 'react';
import type { Priority } from '../../shared/types.js';
import { TagInput } from './TagInput.js';

export interface CardDraft {
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null;
  tags: string[];
  /**
   * Settable on any card, including Jira-sourced ones: the board keeps its own
   * opinion of whether work is stuck and never writes it back (FR-412, FR-417).
   */
  blocked: boolean;
  /** Read-only: shown so the disagreement is legible, never edited here. */
  blockedDivergesFromJira?: boolean;
  /**
   * The authoritative estimate. Null means unpointed; 0 is a deliberate
   * estimate and distinct from null (FR-519). Settable on any card and never
   * written back to Jira (FR-517).
   */
  points: number | null;
  /** Read-only: shown so the disagreement is legible, never edited here. */
  pointsDivergesFromJira?: boolean;
}

export const CardDialog = ({
  initial,
  onSubmit,
  onCancel,
  onDelete,
  jiraOwned = false,
}: {
  initial?: Partial<CardDraft>;
  /** True when Jira owns this card's title, so the field is shown read-only. */
  jiraOwned?: boolean;
  onSubmit: (draft: CardDraft) => Promise<void>;
  onCancel: () => void;
  /** Absent when creating — there is nothing to delete yet. */
  onDelete?: () => Promise<void>;
}) => {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  const [blocked, setBlocked] = useState<boolean>(initial?.blocked ?? false);
  const [points, setPoints] = useState<number | null>(initial?.points ?? null);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Remember where focus came from so closing can put it back, rather than
    // stranding the user at the top of the document (FR-039).
    const opener = document.activeElement as HTMLElement | null;
    titleRef.current?.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (title.trim() === '') {
      setError('A card must have a title that is not only whitespace.');
      return;
    }
    try {
      setError(null);
      await onSubmit({
        title,
        description: description.trim() === '' ? null : description,
        priority,
        dueDate: dueDate === '' ? null : dueDate,
        tags,
        blocked,
        points,
      });
    } catch (failure) {
      // Without this the dialog sits open with no explanation and the
      // rejection goes unhandled — the user has no way to tell a save that
      // failed from one that is still in flight.
      setError(
        failure instanceof Error ? failure.message : 'The card could not be saved.',
      );
    }
  };

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <form className="dialog" onSubmit={submit} role="dialog" aria-label="Card details">
        <label className="field">
          <span className="field-label">Title</span>
          <input
            ref={titleRef}
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={error !== null}
            readOnly={jiraOwned}
          />
        </label>
        {jiraOwned && (
          <p className="field-note" data-testid="jira-owned-note">
            The title comes from Jira and changes there. Priority, due date and tags are
            yours.
          </p>
        )}
        {error && (
          <p className="field-error" role="alert" data-testid="title-error">
            {error}
          </p>
        )}

        <label className="field">
          <span className="field-label">Description</span>
          <textarea
            className="input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Priority</span>
            <select
              className="input"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Due date</span>
            <input
              className="input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        </div>

        <div className="field">
          <span className="field-label">Tags</span>
          <TagInput tags={tags} onChange={setTags} />
        </div>

        <label className="field">
          <span className="field-label">Points</span>
          <input
            className="input"
            type="number"
            min={0}
            step={1}
            data-testid="card-points-input"
            value={points === null ? '' : points}
            onChange={(e) =>
              setPoints(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))
            }
          />
        </label>
        {initial?.pointsDivergesFromJira && (
          // Visible without opening a second view (FR-518) — the same
          // treatment blocked's own divergence marker already has.
          <p className="field-note" data-testid="card-points-diverges">
            Diverges from Jira&rsquo;s imported estimate.
          </p>
        )}

        <label className="filter-toggle">
          <input
            type="checkbox"
            data-testid="card-blocked-toggle"
            checked={blocked}
            onChange={(e) => setBlocked(e.target.checked)}
          />
          Blocked
        </label>
        <p className="field-note">
          Marks the card as stuck without moving it. A blocked card still moves between
          columns.
        </p>

        <div className="dialog-actions">
          {onDelete && !jiraOwned && !confirmingDelete && (
            <button
              type="button"
              className="button button--danger"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          )}
          {onDelete && !jiraOwned && confirmingDelete && (
            <div className="confirm" role="group" aria-label="Confirm deletion">
              <span className="confirm-text">Delete this card?</span>
              <button
                type="button"
                className="button"
                data-testid="cancel-delete"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="button button--danger"
                data-testid="confirm-delete"
                onClick={() => {
                  onDelete().catch((failure: unknown) =>
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : 'The card could not be deleted.',
                    ),
                  );
                }}
              >
                Delete
              </button>
            </div>
          )}
          <span className="dialog-actions-spacer" />
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button button--primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
};
