import type { Filter } from '../../domain/card-filter.js';
import type { Board, CardSource, Priority } from '../../shared/types.js';

/**
 * Narrows the board without leaving it.
 *
 * Every control is a native input or select, so keyboard reach (FR-309) is the
 * platform's rather than something re-implemented here — the cheapest way to
 * be right about it.
 */
export const FilterBar = ({
  board,
  filter,
  active,
  onChange,
  onClear,
  inputRef,
}: {
  board: Board;
  filter: Filter;
  active: boolean;
  onChange: <K extends keyof Filter>(key: K, value: Filter[K]) => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) => {
  // Offered from what is actually on the board rather than from the whole tag
  // vocabulary: a filter for a tag no visible card carries can only ever empty
  // the board, which is a control that exists solely to disappoint.
  const tags = Array.from(
    new Set(board.columns.flatMap((c) => c.cards.flatMap((card) => card.tags))),
  ).sort();

  return (
    <div className="filter-bar" role="search" aria-label="Filter the board">
      <input
        ref={inputRef}
        className="input filter-text"
        type="search"
        placeholder="Filter…  (press /)"
        aria-label="Filter by text"
        data-testid="filter-text"
        value={filter.text}
        onChange={(e) => onChange('text', e.target.value)}
      />

      <select
        className="input"
        aria-label="Filter by tag"
        data-testid="filter-tag"
        value={filter.tag ?? ''}
        onChange={(e) => onChange('tag', e.target.value === '' ? null : e.target.value)}
      >
        <option value="">Any tag</option>
        {tags.map((tag) => (
          <option value={tag} key={tag}>
            {tag}
          </option>
        ))}
      </select>

      <select
        className="input"
        aria-label="Filter by priority"
        data-testid="filter-priority"
        value={filter.priority ?? ''}
        onChange={(e) =>
          onChange(
            'priority',
            e.target.value === '' ? null : (e.target.value as Priority),
          )
        }
      >
        <option value="">Any priority</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      <select
        className="input"
        aria-label="Filter by source"
        data-testid="filter-source"
        value={filter.source ?? ''}
        onChange={(e) =>
          onChange(
            'source',
            e.target.value === '' ? null : (e.target.value as CardSource),
          )
        }
      >
        <option value="">Any source</option>
        <option value="jira">From Jira</option>
        <option value="local">Mine</option>
      </select>

      <label className="filter-toggle">
        <input
          type="checkbox"
          data-testid="filter-overdue"
          checked={filter.overdueOnly}
          onChange={(e) => onChange('overdueOnly', e.target.checked)}
        />
        Overdue only
      </label>

      {active && (
        <button className="button" data-testid="filter-clear" onClick={onClear}>
          Clear filter
        </button>
      )}
    </div>
  );
};
