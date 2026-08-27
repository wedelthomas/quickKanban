import type { Filter } from '../../domain/card-filter.js';
import type { Board, CardSource, Priority } from '../../shared/types.js';

/**
 * The board's own kanban mark: three columns, the middle one taller, in a
 * rounded chip. Inline SVG rather than an image file so it inherits the theme's
 * colours and costs no request.
 */
const Mark = () => (
  <span className="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <rect
        x="3"
        y="5"
        width="4.5"
        height="10"
        rx="1.2"
        fill="currentColor"
        opacity="0.55"
      />
      <rect x="9.75" y="5" width="4.5" height="14" rx="1.2" fill="currentColor" />
      <rect
        x="16.5"
        y="5"
        width="4.5"
        height="7"
        rx="1.2"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  </span>
);

/**
 * The left rail: identity, views, and the filter.
 *
 * Patterned on the ABS Team Reports dashboard (docs/design/visual-language.md):
 * a brand block at the top, then tiny uppercase section labels over rows that
 * carry a count on the right, with the active row marked by a left accent.
 *
 * Collapsible, which is what answers the objection the visual language recorded
 * against a board-view rail at all — six readable columns already exceed a
 * 1440px display, so the board reclaims the width the moment the rail is shut.
 */
export const Sidebar = ({
  board,
  filter,
  active,
  collapsed,
  cardCount,
  conflictCount,
  onToggleCollapsed,
  onOpenSummary,
  onOpenConflicts,
  onOpenArchive,
  onChange,
  onClear,
  inputRef,
}: {
  board: Board;
  filter: Filter;
  active: boolean;
  collapsed: boolean;
  cardCount: number;
  conflictCount: number;
  onToggleCollapsed: () => void;
  onOpenSummary: () => void;
  onOpenConflicts: () => void;
  onOpenArchive: () => void;
  onChange: <K extends keyof Filter>(key: K, value: Filter[K]) => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) => {
  // Offered from what is actually on the board rather than the whole tag
  // vocabulary: a filter for a tag no visible card carries can only empty the
  // board, which is a control that exists solely to disappoint.
  const tags = Array.from(
    new Set(board.columns.flatMap((c) => c.cards.flatMap((card) => card.tags))),
  ).sort();

  return (
    <aside
      className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}
      data-testid="sidebar"
    >
      <div className="brand">
        <Mark />
        {!collapsed && (
          <span className="brand-text">
            <span className="brand-name">QUICK KANBAN</span>
            <span className="brand-sub">
              {cardCount} card{cardCount === 1 ? '' : 's'} on the board
            </span>
          </span>
        )}
      </div>

      <button
        className="sidebar-collapse"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand  (/)' : 'Collapse'}
        data-testid="sidebar-toggle"
      >
        <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
        {!collapsed && <span>Collapse</span>}
        {/* Survives collapsing: a filter still hiding cards behind a shut rail
            would be exactly the ambiguity SC-309 exists to prevent. */}
        {active && collapsed && (
          <span className="sidebar-dot" data-testid="filter-active-dot" />
        )}
      </button>

      {!collapsed && (
        <>
          <nav className="sidebar-section" aria-label="Views">
            <h2 className="sidebar-label">Views</h2>
            <button className="sidebar-row sidebar-row--active" aria-current="page">
              <span className="sidebar-row-name">Board</span>
              <span className="sidebar-count">{cardCount}</span>
            </button>
            <button
              className="sidebar-row"
              onClick={onOpenSummary}
              data-testid="nav-summary"
            >
              <span className="sidebar-row-name">Summary</span>
            </button>
            <button
              className="sidebar-row"
              onClick={onOpenArchive}
              data-testid="nav-archive"
            >
              <span className="sidebar-row-name">Archive</span>
            </button>
            {conflictCount > 0 && (
              <button
                className="sidebar-row"
                data-testid="conflict-count"
                onClick={onOpenConflicts}
              >
                <span className="sidebar-row-name">Conflicts</span>
                <span className="sidebar-count sidebar-count--warning">
                  {conflictCount}
                </span>
              </button>
            )}
          </nav>

          <div className="sidebar-section">
            <h2 className="sidebar-label">
              Filter
              {active && <span className="sidebar-dot" data-testid="filter-active-dot" />}
            </h2>

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
        </>
      )}
    </aside>
  );
};
