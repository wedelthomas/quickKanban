import { useEffect, useRef, useState } from 'react';
import type { Priority } from '../../shared/types.js';
import { TagInput } from './TagInput.js';

export interface CardDraft {
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null;
  tags: string[];
}

export const CardDialog = ({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<CardDraft>;
  onSubmit: (draft: CardDraft) => Promise<void>;
  onCancel: () => void;
}) => {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (title.trim() === '') {
      setError('A card must have a title that is not only whitespace.');
      return;
    }
    await onSubmit({
      title,
      description: description.trim() === '' ? null : description,
      priority,
      dueDate: dueDate === '' ? null : dueDate,
      tags,
    });
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
          />
        </label>
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

        <div className="dialog-actions">
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
