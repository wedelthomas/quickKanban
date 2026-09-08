import { useEffect, useId, useState } from 'react';

interface Suggestion {
  id: number;
  name: string;
}

/**
 * Suggests tags already in the vocabulary as you type (FR-043). This is what
 * keeps "ops" from drifting into "Ops", "op" and "opps" over months — a drifted
 * tag set makes slice 4's tag filter return nothing.
 */
export const TagInput = ({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) => {
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const listId = useId();

  useEffect(() => {
    if (draft.trim() === '') {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/tags?q=${encodeURIComponent(draft.trim())}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((body: { tags: Suggestion[] }) => setSuggestions(body.tags))
      .catch(() => {
        /* an unavailable suggestion list must not block typing a new tag */
      });
    return () => controller.abort();
  }, [draft]);

  const add = (raw: string): void => {
    const tag = raw.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setDraft('');
  };

  return (
    <div className="tag-input">
      <div className="tag-input-chips">
        {tags.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
            <button
              type="button"
              className="tag-remove"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        className="input"
        list={listId}
        value={draft}
        placeholder="Add a tag"
        aria-label="Add a tag"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            // Enter commits the tag rather than submitting the form — losing a
            // half-typed tag to an accidental save is a small betrayal.
            e.preventDefault();
            add(draft);
          }
        }}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option value={s.name} key={s.id} />
        ))}
      </datalist>
    </div>
  );
};
