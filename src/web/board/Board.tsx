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
import { useAuthor } from '../settings/use-author.js';
import { IterationBanner } from './IterationBanner.js';
import { ConflictDialog } from '../conflicts/ConflictDialog.js';
import { SummaryDialog } from '../summary/SummaryDialog.js';
import { ArchiveView } from '../archive/ArchiveView.js';
import { Sidebar } from './Sidebar.js';
import { useFilter } from './use-filter.js';
import { useDialogs } from './use-dialogs.js';
import { collisionDetection, resolveTarget } from './drag.js';
import { matches } from '../../domain/card-filter.js';
import type { ShortcutMatch } from '../keyboard/shortcuts.js';
import type { Board as BoardData, Card } from '../../shared/types.js';

/**
 * The board screen: cards, drag and drop, keyboard, filter and the dialogs.
 *
 * ~345 lines. Three extractions were made and two were rejected, and the
 * distinction is worth stating because "over 300" is not by itself the problem.
 *
 * Left, because each owns something this does not: `drag.ts` (pointer
 * arithmetic that owes nothing to board state), `use-filter.ts` (the filter and
 * the rail's remembered width), `use-dialogs.ts` (which screen owns the board,
 * previously six booleans and an ever-growing `a || b || c` that fell out of
 * date whenever a screen was added).
 *
 * Stayed, because extracting them moves a tangle rather than removing one: the
 * keyboard handler reads and writes almost everything here, and the dialog
 * block would need roughly twenty props threaded back in — the board, four
 * mutations, two refs and the dialog controller — for a component that would
 * then be read only by this file.
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
  const { author, reloadAuthor } = useAuthor();
  const dialogs = useDialogs();
  const [editing, setEditing] = useState<Card | null>(null);
  const { conflicts, resolve } = useConflicts(board);
  const {
    filter,
    update: updateFilter,
    clear: clearFilter,
    active: filtering,
    collapsed: railCollapsed,
    toggleCollapsed: toggleRail,
    expand: expandRail,
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
        dialogs.hide();
        // Escape clears the filter as well as closing the help overlay: with
        // the filter focused it is the obvious way out, and a filter the user
        // cannot dismiss without reaching for the mouse fails FR-309.
        clearFilter();
        return;
      }
      if (match.action === 'focus-filter') {
        // Opens the rail first when it is shut, so `/` always reaches the
        // filter rather than silently doing nothing.
        expandRail();
        // After the rail renders — focusing an input that is not mounted yet
        // does nothing at all, silently.
        requestAnimationFrame(() => filterInputRef.current?.focus());
        return;
      }
      if (match.action === 'help') {
        if (dialogs.isOpen('help')) dialogs.hide();
        else dialogs.show('help');
        return;
      }
      if (match.action === 'new-card') {
        dialogs.show('create');
        return;
      }

      const cards = cardElements();
      if (cards.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const index = cards.findIndex((el) => el === active);

      if (match.action === 'focus-next' || match.action === 'focus-previous') {
        const step = match.action === 'focus-next' ? 1 : -1;
        // No card focused yet: focus-next starts at the first, focus-previous
        // at the last. Since the j/k swap, that means k starts at the first.
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
    [board, moveCard, focusCardById, clearFilter, expandRail, dialogs],
  );

  // Suspended while a dialog owns the screen, so the board's shortcuts cannot
  // reach past it and claim keys the dialog's own controls need.
  // Derived from the same value that decides what is rendered, so a new screen
  // cannot be added without the shortcuts standing down for it.
  useShortcuts(handleShortcut, { suspended: dialogs.anyOpen || editing !== null });

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
      <div className="board-layout">
        <Sidebar
          board={board}
          filter={filter}
          active={filtering}
          collapsed={railCollapsed}
          cardCount={board.columns.reduce((n, c) => n + c.cards.length, 0)}
          conflictCount={conflicts.length}
          onToggleCollapsed={toggleRail}
          onOpenSummary={() => dialogs.show('summary')}
          onOpenConflicts={() => dialogs.show('conflicts')}
          onOpenArchive={() => dialogs.show('archive')}
          onOpenShortcuts={() => dialogs.show('help')}
          onChange={updateFilter}
          onClear={clearFilter}
          inputRef={filterInputRef}
        />
        <div className="board-area">
          <div className="page-head">
            <div>
              <h1 className="page-title">{author || 'QUICK KANBAN'}</h1>
              <p className="page-sub">
                Everything assigned to you, and everything else you are carrying.
              </p>
              <IterationBanner />
            </div>
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
              {/* Views live in the sidebar now — Summary and Conflicts moved there
            rather than being offered in two places, which leaves the bar for
            actions: sync, settings, and creating a card. */}
              <button className="button" onClick={() => dialogs.show('settings')}>
                Settings
              </button>
              <button
                className="button button--primary"
                onClick={() => dialogs.show('create')}
              >
                New card
              </button>
            </div>
          </div>
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
        </div>
      </div>
      {dialogs.isOpen('create') && (
        <CardDialog
          onCancel={() => dialogs.hide()}
          onSubmit={async (input) => {
            await createCard(input);
            dialogs.hide();
          }}
        />
      )}
      {dialogs.isOpen('help') && <HelpOverlay onClose={() => dialogs.hide()} />}
      {dialogs.isOpen('settings') && (
        <SettingsDialog
          columns={board.columns}
          onClose={() => {
            dialogs.hide();
            // The heading is read once at load; closing settings is the only
            // moment it can have changed.
            reloadAuthor();
          }}
        />
      )}
      {dialogs.isOpen('summary') && <SummaryDialog onClose={() => dialogs.hide()} />}
      {dialogs.isOpen('archive') && <ArchiveView onClose={() => dialogs.hide()} />}
      {dialogs.isOpen('conflicts') && (
        <ConflictDialog
          conflicts={conflicts}
          onResolve={async (id, resolution) => {
            await resolve(id, resolution);
            await refresh();
          }}
          onClose={() => dialogs.hide()}
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
