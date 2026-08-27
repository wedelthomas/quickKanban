import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useBoard } from './use-board.js';
import { ColumnView, columnDroppableId } from './ColumnView.js';
import { CardDialog } from '../cards/CardDialog.js';
import { useShortcuts } from '../keyboard/use-shortcuts.js';
import { HelpOverlay } from '../keyboard/HelpOverlay.js';
import { SettingsDialog } from '../settings/SettingsDialog.js';
import { useSync } from '../sync/use-sync.js';
import { SyncStatusPill } from '../sync/SyncStatus.js';
import { useConflicts } from '../conflicts/use-conflicts.js';
import { ConflictDialog } from '../conflicts/ConflictDialog.js';
import { FilterBar } from './FilterBar.js';
import { useFilter } from './use-filter.js';
import { collisionDetection, resolveTarget } from './drag.js';
import { matches } from '../../domain/card-filter.js';
import type { ShortcutMatch } from '../keyboard/shortcuts.js';
import type { Board as BoardData, Card } from '../../shared/types.js';

/**
 * The board screen: cards, drag and drop, keyboard, filter and the dialogs.
 *
 * A little over 300 lines, and the two obvious extractions were both tried and
 * rejected. The drag geometry did leave, to `drag.ts`, because it is arithmetic
 * about pointers and owes nothing to board state. The keyboard handler and the
 * dialog block cannot: each would need eight to ten props threaded back in —
 * the board, the mutations, two refs and five setters — which moves the tangle
 * somewhere else and adds an indirection to look through while doing it.
 */
export const Board = () => {
  const {
    board,
    error,
    moveError,
    dismissMoveError,
    refresh,
    createCard,
    moveCard,
    updateCard,
    deleteCard,
  } = useBoard();
  const { status: syncStatus, syncNow } = useSync(refresh);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const { conflicts, resolve } = useConflicts(board);
  const {
    filter,
    update: updateFilter,
    clear: clearFilter,
    active: filtering,
  } = useFilter();
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  // Held by id rather than by element, because the board re-renders after every
  // move and the element the user focused is gone by the time it lands.
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const focusRestoreRef = useRef<string | null>(null);

  const sensors = useSensors(
    // A small distance so a click on a card is not read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // The keyboard sensor drives the same drag lifecycle as the pointer one,
    // so keyboard and mouse moves share a single code path rather than
    // diverging into two implementations of the same behaviour.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const cardElements = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-testid="card"]'));

  const focusCardById = useCallback((cardId: string | null): void => {
    if (!cardId) return;
    document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`)?.focus();
  }, []);

  // Re-focus after the board re-renders, so a keyboard move keeps its card
  // rather than dumping focus back to the document.
  useEffect(() => {
    focusCardById(focusedCardId);
  }, [board, focusedCardId, focusCardById]);

  const handleShortcut = useCallback(
    (match: ShortcutMatch): void => {
      if (match.action === 'close') {
        setHelpOpen(false);
        // Escape clears the filter as well as closing the help overlay: with
        // the filter focused it is the obvious way out, and a filter the user
        // cannot dismiss without reaching for the mouse fails FR-309.
        clearFilter();
        return;
      }
      if (match.action === 'focus-filter') {
        filterInputRef.current?.focus();
        return;
      }
      if (match.action === 'help') {
        setHelpOpen((open) => !open);
        return;
      }
      if (match.action === 'new-card') {
        setCreating(true);
        return;
      }

      const cards = cardElements();
      if (cards.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const index = cards.findIndex((el) => el === active);

      if (match.action === 'focus-next' || match.action === 'focus-previous') {
        const step = match.action === 'focus-next' ? 1 : -1;
        // No card focused yet: j starts at the first, k at the last.
        const next =
          index === -1
            ? step === 1
              ? 0
              : cards.length - 1
            : Math.min(Math.max(index + step, 0), cards.length - 1);
        const id = cards[next]?.dataset.cardId ?? null;
        setFocusedCardId(id);
        focusCardById(id);
        return;
      }

      const cardId = active?.dataset.cardId;
      if (!cardId || !board) return;

      if (match.action === 'open-card') {
        const card = board.columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
        if (card) {
          focusRestoreRef.current = cardId;
          setEditing(card);
        }
        return;
      }

      if (match.action === 'move-to-column' && match.columnPosition) {
        const column = board.columns.find((c) => c.position === match.columnPosition);
        if (!column) return;
        setFocusedCardId(cardId);
        void moveCard(cardId, column.id, column.cards.length + 1);
      }
    },
    [board, moveCard, focusCardById, clearFilter],
  );

  // Suspended while a dialog owns the screen, so the board's shortcuts cannot
  // reach past it and claim keys the dialog's own controls need.
  useShortcuts(handleShortcut, {
    suspended: creating || editing !== null || settingsOpen || conflictsOpen,
  });

  if (error) return <p className="board-message board-message--error">{error}</p>;
  if (!board) return <p className="board-message">Loading the board…</p>;

  const onDragEnd = (event: DragEndEvent): void => {
    // Released over nothing: the card stays exactly where it was and no
    // request is made (BH-011).
    if (!event.over) return;

    const target = resolveTarget(board, String(event.active.id), String(event.over.id));
    if (!target) return;
    void moveCard(String(event.active.id), target.toColumnId, target.toIndex);
  };

  // Narrowed for display only. No request is made and nothing is written —
  // which is how FR-311 (filtering alters no card) is true by construction
  // rather than by convention.
  const visible: BoardData = filtering
    ? {
        ...board,
        columns: board.columns.map((column) => ({
          ...column,
          cards: column.cards.filter((card) => matches(card, filter)),
        })),
      }
    : board;

  const hiddenCount =
    board.columns.reduce((n, c) => n + c.cards.length, 0) -
    visible.columns.reduce((n, c) => n + c.cards.length, 0);

  return (
    <>
      <div className="board-bar">
        {moveError && (
          <p className="move-error" role="alert" data-testid="move-error">
            {moveError}
            <button
              className="move-error-dismiss"
              onClick={dismissMoveError}
              aria-label="Dismiss"
            >
              ×
            </button>
          </p>
        )}
        <SyncStatusPill status={syncStatus} onRefresh={() => void syncNow()} />
        {conflicts.length > 0 && (
          // Only shown when there is something to decide: a permanent control
          // for a rare event trains the eye to stop seeing it.
          <button
            className="button button--warning"
            data-testid="conflict-count"
            onClick={() => setConflictsOpen(true)}
          >
            {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
          </button>
        )}
        <button className="button" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
        <button className="button button--primary" onClick={() => setCreating(true)}>
          New card
        </button>
      </div>
      <FilterBar
        board={board}
        filter={filter}
        active={filtering}
        onChange={updateFilter}
        onClear={clearFilter}
        inputRef={filterInputRef}
      />
      {filtering &&
        hiddenCount > 0 &&
        visible.columns.every((c) => c.cards.length === 0) && (
          // The whole of SC-309: an empty board must never be ambiguous between
          // "a filter is hiding things" and "you have no work".
          <p
            className="filter-empty-notice"
            role="status"
            data-testid="filter-empty-notice"
          >
            A filter is hiding {hiddenCount} card{hiddenCount === 1 ? '' : 's'}.
            <button className="button" onClick={clearFilter}>
              Clear filter
            </button>
          </p>
        )}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragEnd={onDragEnd}
      >
        <div className="board" data-testid="board">
          {visible.columns.map((column) => (
            <ColumnView column={column} key={column.id} onOpenCard={setEditing} />
          ))}
        </div>
      </DndContext>
      {creating && (
        <CardDialog
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            await createCard(input);
            setCreating(false);
          }}
        />
      )}
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
      {settingsOpen && (
        <SettingsDialog columns={board.columns} onClose={() => setSettingsOpen(false)} />
      )}
      {conflictsOpen && (
        <ConflictDialog
          conflicts={conflicts}
          onResolve={async (id, resolution) => {
            await resolve(id, resolution);
            await refresh();
          }}
          onClose={() => setConflictsOpen(false)}
        />
      )}
      {editing && (
        <CardDialog
          initial={editing}
          jiraOwned={editing.source === 'jira'}
          onCancel={() => {
            setEditing(null);
            focusCardById(focusRestoreRef.current);
          }}
          onSubmit={async (input) => {
            // Omit the title when Jira owns it: the dialog shows it read-only,
            // and sending an unchanged value would still be refused, so a user
            // editing only the priority would see their save rejected.
            const { title, ...rest } = input;
            await updateCard(editing.id, editing.source === 'jira' ? rest : input);
            setEditing(null);
            focusCardById(focusRestoreRef.current);
          }}
          onDelete={async () => {
            await deleteCard(editing.id);
            setEditing(null);
          }}
        />
      )}
    </>
  );
};

export { columnDroppableId };
