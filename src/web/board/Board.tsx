import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
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
import type { ShortcutMatch } from '../keyboard/shortcuts.js';
import type { Board as BoardData, Card } from '../../shared/types.js';

/**
 * Resolves what dnd-kit reports it was dropped over into a concrete
 * (column, 1-based index) target. Dropping on a card means "in front of that
 * card"; dropping on the column's empty space means "at the end".
 */
const resolveTarget = (
  board: BoardData,
  activeId: string,
  overId: string,
): { toColumnId: number; toIndex: number } | null => {
  const columnMatch = /^column-(\d+)$/.exec(overId);
  if (columnMatch) {
    const toColumnId = Number(columnMatch[1]);
    const column = board.columns.find((c) => c.id === toColumnId);
    if (!column) return null;
    const withoutActive = column.cards.filter((c) => c.id !== activeId);
    return { toColumnId, toIndex: withoutActive.length + 1 };
  }

  const column = board.columns.find((c) => c.cards.some((card) => card.id === overId));
  if (!column) return null;
  const index = column.cards.filter((c) => c.id !== activeId).findIndex((c) => c.id === overId);
  return { toColumnId: column.id, toIndex: (index === -1 ? column.cards.length : index) + 1 };
};

/**
 * A sortable card is both draggable and droppable, so the default strategies
 * happily report that a card was dropped on itself — which resolves to its own
 * position, plans no change, and silently swallows the drag. Dropping the
 * active id and preferring what the pointer is actually inside makes an empty
 * column a reachable target.
 */
const collisionDetection: CollisionDetection = (args) => {
  const notSelf = (c: { id: string | number }) => c.id !== args.active.id;
  const isColumn = (c: { id: string | number }) => String(c.id).startsWith('column-');

  // A card and the column containing it are both under the pointer. The card
  // is the more specific answer — it means "put me in front of this one" —
  // so cards are preferred and the column is the fallback for empty space.
  const prefer = (candidates: ReturnType<typeof pointerWithin>) => {
    const usable = candidates.filter(notSelf);
    const cards = usable.filter((c) => !isColumn(c));
    return cards.length > 0 ? cards : usable;
  };

  const under = prefer(pointerWithin(args));
  return under.length > 0 ? under : prefer(rectIntersection(args));
};

export const Board = () => {
  const { board, error, moveError, dismissMoveError, refresh, createCard, moveCard, updateCard, deleteCard } =
    useBoard();
  const { status: syncStatus, syncNow } = useSync(refresh);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const { conflicts, resolve } = useConflicts(board);
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
    [board, moveCard, focusCardById],
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

  return (
    <>
      <div className="board-bar">
        {moveError && (
          <p className="move-error" role="alert" data-testid="move-error">
            {moveError}
            <button className="move-error-dismiss" onClick={dismissMoveError} aria-label="Dismiss">
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
      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={onDragEnd}>
        <div className="board" data-testid="board">
          {board.columns.map((column) => (
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
