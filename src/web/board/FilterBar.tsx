import type { Filter } from '../../domain/card-filter.js';
import type { Board, CardSource, Priority } from '../../shared/types.js';

/**
 * The filter rail.
 *
 * A left rail rather than a horizontal bar, and collapsible because of it:
 * docs/design/visual-language.md rejected a board-view sidebar on the grounds
 * that six columns at a readable width already exceed a 1440px display, so a
 * permanent rail would make the board scroll horizontally before a single card
 * existed. Collapsing is what answers that — the rail is 210px when in use and
 * 40px when it is not, and the board reclaims the difference.
 *
 * Every control is a native input or select, so keyboard reach (FR-309) is the
 * platform's rather than something re-implemented here.
 */
export const FilterBar = ({
  board,
  filter,
  active,
  collapsed,
  onToggleCollapsed,
  onChange,
  onClear,
  inputRef,
}: {
  board: Board;
  filter: Filter;
  active: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onChange: <K extends keyof Filter>(key: K, value: Filter[K]) => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) => {
  // Offered from what is actually on the board rather than from the whole tag
  // vocabulary: a filter for a tag no visible card carries can only empty the
  // board, which is a control that exists solely to disappoint.
  const tags = Array.from(
    new Set(board.columns.flatMap((c) => c.cards.flatMap((card) => card.tags))),
  ).sort();

  return (
    <aside
      className={`filter-rail${collapsed ? ' filter-rail--collapsed' : ''}`}
      role="search"
      aria-label="Filter the board"
      data-testid="filter-rail"
    >
      <button
        className="filter-rail-toggle"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        title={collapsed ? 'Show filters  (/)' : 'Hide filters'}
        data-testid="filter-toggle"
      >
        <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
        <span className="filter-rail-toggle-label">
          {collapsed ? '' : 'Filters'}
          {/* Survives collapsing: a filter still hiding cards while the rail is
              shut would otherwise be invisible, which is the ambiguity SC-309
              exists to prevent. */}
          {active && <span className="filter-rail-dot" data-testid="filter-active-dot" />}
        </span>
      </button>

      {!collapsed && (
        <div className="filter-rail-body">
          <label className="field">
            <span className="field-label">Text</span>
            <input
              ref={inputRef}
              className="input"
              type="search"
              placeholder="Title or description"
              aria-label="Filter by text"
              data-testid="filter-text"
              value={filter.text}
              onChange={(e) => onChange('text', e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Tag</span>
            <select
              className="input"
              aria-label="Filter by tag"
              data-testid="filter-tag"
              value={filter.tag ?? ''}
              onChange={(e) =>
                onChange('tag', e.target.value === '' ? null : e.target.value)
              }
            >
              <option value="">Any</option>
              {tags.map((tag) => (
                <option value={tag} key={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Priority</span>
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
              <option value="">Any</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Source</span>
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
              <option value="">Any</option>
              <option value="jira">From Jira</option>
              <option value="local">Mine</option>
            </select>
          </label>

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
      )}
    </aside>
  );
};
