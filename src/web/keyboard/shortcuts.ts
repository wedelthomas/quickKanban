/**
 * The one registry of keyboard shortcuts. Both the key handler and the help
 * overlay read it, so the help cannot drift out of step with the behaviour —
 * an overlay that omits a shortcut is worse than no overlay, because it
 * teaches the reader that the shortcut does not exist.
 */

export type ShortcutAction =
  | 'new-card'
  | 'focus-next'
  | 'focus-previous'
  | 'open-card'
  | 'move-to-column'
  | 'focus-filter'
  | 'help'
  | 'close';

export interface Shortcut {
  /** As shown in the help overlay. */
  label: string;
  description: string;
  action: ShortcutAction;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { label: 'n', description: 'Create a new card', action: 'new-card' },
  { label: 'k', description: 'Focus the next card', action: 'focus-next' },
  { label: 'j', description: 'Focus the previous card', action: 'focus-previous' },
  { label: 'Enter', description: 'Open the focused card', action: 'open-card' },
  {
    label: '1–6',
    // Position, not column id, and worth saying since slice 5 moved every
    // column along: Iteration Items took position 2 and its id is 7.
    description: 'Send the focused card to that column, left to right',
    action: 'move-to-column',
  },
  { label: '/', description: 'Filter the board', action: 'focus-filter' },
  { label: '?', description: 'Show this list', action: 'help' },
  { label: 'Esc', description: 'Close a dialog', action: 'close' },
];

export interface ShortcutMatch {
  action: ShortcutAction;
  /** 1-based board column, present only for 'move-to-column'. */
  columnPosition?: number;
}

/** Which registered action, if any, a key event means. */
export const matchShortcut = (event: KeyboardEvent): ShortcutMatch | null => {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;

  if (event.key === 'Escape') return { action: 'close' };
  if (event.key === '?') return { action: 'help' };
  if (event.key === 'n') return { action: 'new-card' };
  // j and k are swapped relative to vim, by explicit request. The arrows keep
  // their obvious meaning: ArrowDown still moves down regardless.
  if (event.key === 'k' || event.key === 'ArrowDown') return { action: 'focus-next' };
  if (event.key === 'j' || event.key === 'ArrowUp') return { action: 'focus-previous' };
  if (event.key === 'Enter') return { action: 'open-card' };
  if (event.key === '/') return { action: 'focus-filter' };

  if (/^[1-6]$/.test(event.key)) {
    return { action: 'move-to-column', columnPosition: Number(event.key) };
  }
  return null;
};

/**
 * Typing "n" into a title field must type an n, not open a second dialog.
 * Escape is the exception — it means "get me out of here" everywhere.
 */
export const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    element.isContentEditable === true
  );
};
